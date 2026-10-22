'use strict';

const db = require('./database/database');

const APPLICATION_STATUSES = new Set(['submitted', 'reviewing', 'interview', 'accepted', 'rejected', 'withdrawn']);
const SHIFT_RESPONSE_STATUSES = new Set(['available', 'unavailable', 'maybe']);
const SUGGESTION_STATUSES = new Set(['submitted', 'reviewing', 'accepted', 'rejected', 'published']);
const PANEL_TYPES = new Set(['service', 'tickets']);

db.exec(`
CREATE TABLE IF NOT EXISTS recruitment_forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    questions_json TEXT NOT NULL DEFAULT '[]',
    target_role_id TEXT,
    review_channel_id TEXT,
    is_open INTEGER NOT NULL DEFAULT 1,
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recruitment_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    form_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    answers_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'submitted',
    staff_note TEXT,
    interview_at TEXT,
    reviewed_by_user_id TEXT,
    submitted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(form_id, user_id),
    FOREIGN KEY (form_id) REFERENCES recruitment_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    role_id TEXT,
    channel_id TEXT,
    reminder_minutes INTEGER NOT NULL DEFAULT 60,
    reminder_sent_at TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_by_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_shift_responses (
    shift_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (shift_id, user_id),
    FOREIGN KEY (shift_id) REFERENCES team_shifts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_absences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'declared',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    staff_response TEXT,
    reviewed_by_user_id TEXT,
    published_channel_id TEXT,
    published_message_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_suggestion_votes (
    suggestion_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    value INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (suggestion_id, user_id),
    FOREIGN KEY (suggestion_id) REFERENCES community_suggestions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guild_panel_themes (
    guild_id TEXT NOT NULL,
    panel_type TEXT NOT NULL,
    title TEXT,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#24d7d0',
    image_url TEXT,
    footer TEXT,
    button_labels_json TEXT NOT NULL DEFAULT '{}',
    updated_by_user_id TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, panel_type)
);

CREATE INDEX IF NOT EXISTS idx_recruitment_forms_guild ON recruitment_forms(guild_id, is_open, updated_at);
CREATE INDEX IF NOT EXISTS idx_recruitment_applications_guild ON recruitment_applications(guild_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_team_shifts_guild ON team_shifts(guild_id, starts_at, status);
CREATE INDEX IF NOT EXISTS idx_team_absences_guild ON team_absences(guild_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_community_suggestions_guild ON community_suggestions(guild_id, status, updated_at);
`);

if (!db.prepare("PRAGMA table_info(guild_panel_themes)").all().some(column => column.name === 'button_labels_json')) {
    db.prepare("ALTER TABLE guild_panel_themes ADD COLUMN button_labels_json TEXT NOT NULL DEFAULT '{}'").run();
}

function nowIso() {
    return new Date().toISOString();
}

function clampText(value, maxLength, { required = false, minLength = 0 } = {}) {
    const normalized = String(value || '').trim().slice(0, maxLength);
    if (required && normalized.length < Math.max(minLength, 1)) {
        throw new Error(`Ce champ doit contenir au moins ${Math.max(minLength, 1)} caractère(s).`);
    }
    return normalized || null;
}

function parseJson(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        return fallback;
    }
}

function normalizeIso(value, fieldName) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw new Error(`${fieldName} est invalide.`);
    return date.toISOString();
}

function normalizeQuestions(input) {
    const values = Array.isArray(input)
        ? input
        : String(input || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const questions = values.slice(0, 8).map((item, index) => {
        const source = typeof item === 'string' ? { label: item } : item;
        return {
            id: `q${index + 1}`,
            label: clampText(source.label, 120, { required: true, minLength: 3 }),
            required: source.required !== false
        };
    });
    if (!questions.length) throw new Error('Ajoute au moins une question au formulaire.');
    return questions;
}

function mapRecruitmentForm(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        title: row.title,
        description: row.description || '',
        questions: parseJson(row.questions_json, []),
        targetRoleId: row.target_role_id || null,
        reviewChannelId: row.review_channel_id || null,
        open: Boolean(row.is_open),
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapApplication(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        formId: Number(row.form_id),
        userId: row.user_id,
        answers: parseJson(row.answers_json, []),
        status: row.status,
        staffNote: row.staff_note || '',
        interviewAt: row.interview_at || null,
        reviewedByUserId: row.reviewed_by_user_id || null,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
        formTitle: row.form_title || null
    };
}

function createRecruitmentForm(guildId, actorUserId, input = {}) {
    const title = clampText(input.title, 100, { required: true, minLength: 3 });
    const description = clampText(input.description, 1000);
    const questions = normalizeQuestions(input.questions);
    const now = nowIso();
    const result = db.prepare(`
        INSERT INTO recruitment_forms (
            guild_id, title, description, questions_json, target_role_id,
            review_channel_id, is_open, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
        guildId,
        title,
        description,
        JSON.stringify(questions),
        clampText(input.targetRoleId, 20),
        clampText(input.reviewChannelId, 20),
        actorUserId,
        now,
        now
    );
    return getRecruitmentForm(guildId, Number(result.lastInsertRowid));
}

function getRecruitmentForm(guildId, formId) {
    return mapRecruitmentForm(db.prepare('SELECT * FROM recruitment_forms WHERE guild_id = ? AND id = ?').get(guildId, Number(formId)));
}

function listRecruitmentForms(guildId, { includeClosed = true } = {}) {
    const rows = includeClosed
        ? db.prepare('SELECT * FROM recruitment_forms WHERE guild_id = ? ORDER BY is_open DESC, id DESC').all(guildId)
        : db.prepare('SELECT * FROM recruitment_forms WHERE guild_id = ? AND is_open = 1 ORDER BY id DESC').all(guildId);
    return rows.map(mapRecruitmentForm);
}

function setRecruitmentFormOpen(guildId, formId, open) {
    const result = db.prepare('UPDATE recruitment_forms SET is_open = ?, updated_at = ? WHERE guild_id = ? AND id = ?')
        .run(open ? 1 : 0, nowIso(), guildId, Number(formId));
    if (!result.changes) throw new Error('Formulaire de recrutement introuvable.');
    return getRecruitmentForm(guildId, formId);
}

function submitRecruitmentApplication(guildId, formId, userId, answersInput) {
    const form = getRecruitmentForm(guildId, formId);
    if (!form || !form.open) throw new Error('Ce recrutement est fermé ou introuvable.');
    const rawAnswers = Array.isArray(answersInput) ? answersInput : [];
    const answers = form.questions.map((question, index) => {
        const answer = clampText(rawAnswers[index]?.answer ?? rawAnswers[index] ?? '', 1200);
        if (question.required && !answer) throw new Error(`Réponds à la question « ${question.label} ».`);
        return { id: question.id, question: question.label, answer: answer || '' };
    });
    const now = nowIso();
    try {
        const result = db.prepare(`
            INSERT INTO recruitment_applications (
                guild_id, form_id, user_id, answers_json, status, submitted_at, updated_at
            ) VALUES (?, ?, ?, ?, 'submitted', ?, ?)
        `).run(guildId, Number(formId), userId, JSON.stringify(answers), now, now);
        return getRecruitmentApplication(guildId, Number(result.lastInsertRowid));
    } catch (error) {
        if (String(error.code || '').includes('CONSTRAINT')) throw new Error('Tu as déjà envoyé une candidature pour ce recrutement.');
        throw error;
    }
}

function getRecruitmentApplication(guildId, applicationId) {
    return mapApplication(db.prepare(`
        SELECT a.*, f.title AS form_title
        FROM recruitment_applications a
        JOIN recruitment_forms f ON f.id = a.form_id
        WHERE a.guild_id = ? AND a.id = ?
    `).get(guildId, Number(applicationId)));
}

function listRecruitmentApplications(guildId, { userId = null, limit = 100 } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const rows = userId
        ? db.prepare(`SELECT a.*, f.title AS form_title FROM recruitment_applications a JOIN recruitment_forms f ON f.id = a.form_id WHERE a.guild_id = ? AND a.user_id = ? ORDER BY a.id DESC LIMIT ?`).all(guildId, userId, boundedLimit)
        : db.prepare(`SELECT a.*, f.title AS form_title FROM recruitment_applications a JOIN recruitment_forms f ON f.id = a.form_id WHERE a.guild_id = ? ORDER BY CASE a.status WHEN 'submitted' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'interview' THEN 2 ELSE 3 END, a.id DESC LIMIT ?`).all(guildId, boundedLimit);
    return rows.map(mapApplication);
}

function reviewRecruitmentApplication(guildId, applicationId, reviewerUserId, input = {}) {
    const status = String(input.status || '').trim();
    if (!APPLICATION_STATUSES.has(status) || ['submitted', 'withdrawn'].includes(status)) throw new Error('Étape de candidature invalide.');
    const staffNote = clampText(input.staffNote, 2000);
    const interviewAt = input.interviewAt ? normalizeIso(input.interviewAt, 'La date d’entretien') : null;
    if (status === 'interview' && !interviewAt) throw new Error('Choisis une date pour l’entretien.');
    const result = db.prepare(`
        UPDATE recruitment_applications
        SET status = ?, staff_note = ?, interview_at = ?, reviewed_by_user_id = ?, updated_at = ?
        WHERE guild_id = ? AND id = ? AND status NOT IN ('accepted', 'rejected', 'withdrawn')
    `).run(status, staffNote, interviewAt, reviewerUserId, nowIso(), guildId, Number(applicationId));
    if (!result.changes) throw new Error('Candidature introuvable ou retirée.');
    return getRecruitmentApplication(guildId, applicationId);
}

function withdrawRecruitmentApplication(guildId, applicationId, userId) {
    const result = db.prepare(`UPDATE recruitment_applications SET status = 'withdrawn', updated_at = ? WHERE guild_id = ? AND id = ? AND user_id = ? AND status NOT IN ('accepted', 'rejected', 'withdrawn')`)
        .run(nowIso(), guildId, Number(applicationId), userId);
    if (!result.changes) throw new Error('Cette candidature ne peut plus être retirée.');
    return getRecruitmentApplication(guildId, applicationId);
}

function mapShift(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        title: row.title,
        description: row.description || '',
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        capacity: Number(row.capacity || 0),
        roleId: row.role_id || null,
        channelId: row.channel_id || null,
        reminderMinutes: Number(row.reminder_minutes || 0),
        reminderSentAt: row.reminder_sent_at || null,
        status: row.status,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function createTeamShift(guildId, actorUserId, input = {}) {
    const startsAt = normalizeIso(input.startsAt, 'Le début du créneau');
    const endsAt = normalizeIso(input.endsAt, 'La fin du créneau');
    if (new Date(endsAt) <= new Date(startsAt)) throw new Error('La fin du créneau doit être après son début.');
    const capacity = Math.min(Math.max(Number.parseInt(input.capacity || '0', 10) || 0, 0), 500);
    const reminderMinutes = Math.min(Math.max(Number.parseInt(input.reminderMinutes || '60', 10) || 60, 5), 10080);
    const now = nowIso();
    const result = db.prepare(`
        INSERT INTO team_shifts (
            guild_id, title, description, starts_at, ends_at, capacity, role_id,
            channel_id, reminder_minutes, status, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
    `).run(
        guildId,
        clampText(input.title, 100, { required: true, minLength: 3 }),
        clampText(input.description, 1000),
        startsAt,
        endsAt,
        capacity,
        clampText(input.roleId, 20),
        clampText(input.channelId, 20),
        reminderMinutes,
        actorUserId,
        now,
        now
    );
    return getTeamShift(guildId, Number(result.lastInsertRowid));
}

function getTeamShift(guildId, shiftId) {
    const shift = mapShift(db.prepare('SELECT * FROM team_shifts WHERE guild_id = ? AND id = ?').get(guildId, Number(shiftId)));
    if (!shift) return null;
    shift.responses = db.prepare('SELECT user_id, status, note, updated_at FROM team_shift_responses WHERE guild_id = ? AND shift_id = ? ORDER BY updated_at DESC')
        .all(guildId, Number(shiftId)).map(row => ({ userId: row.user_id, status: row.status, note: row.note || '', updatedAt: row.updated_at }));
    shift.counts = shift.responses.reduce((counts, response) => ({ ...counts, [response.status]: (counts[response.status] || 0) + 1 }), { available: 0, unavailable: 0, maybe: 0 });
    return shift;
}

function listTeamShifts(guildId, { includePast = false, limit = 100 } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const rows = includePast
        ? db.prepare('SELECT * FROM team_shifts WHERE guild_id = ? ORDER BY datetime(starts_at) DESC LIMIT ?').all(guildId, boundedLimit)
        : db.prepare("SELECT * FROM team_shifts WHERE guild_id = ? AND status = 'scheduled' AND datetime(ends_at) >= datetime('now') ORDER BY datetime(starts_at) ASC LIMIT ?").all(guildId, boundedLimit);
    return rows.map(row => getTeamShift(guildId, row.id));
}

function setShiftResponse(guildId, shiftId, userId, status, note = '') {
    if (!SHIFT_RESPONSE_STATUSES.has(status)) throw new Error('Réponse au planning invalide.');
    const shift = getTeamShift(guildId, shiftId);
    if (!shift || shift.status !== 'scheduled' || new Date(shift.endsAt) < new Date()) throw new Error('Ce créneau est terminé ou introuvable.');
    const existingAvailable = shift.responses.filter(item => item.status === 'available' && item.userId !== userId).length;
    if (status === 'available' && shift.capacity > 0 && existingAvailable >= shift.capacity) throw new Error('Ce créneau est déjà complet.');
    const now = nowIso();
    db.prepare(`
        INSERT INTO team_shift_responses (shift_id, guild_id, user_id, status, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(shift_id, user_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at
    `).run(Number(shiftId), guildId, userId, status, clampText(note, 300), now);
    return getTeamShift(guildId, shiftId);
}

function cancelTeamShift(guildId, shiftId) {
    const result = db.prepare("UPDATE team_shifts SET status = 'cancelled', updated_at = ? WHERE guild_id = ? AND id = ? AND status = 'scheduled'")
        .run(nowIso(), guildId, Number(shiftId));
    if (!result.changes) throw new Error('Créneau introuvable ou déjà terminé.');
    return getTeamShift(guildId, shiftId);
}

function declareAbsence(guildId, userId, input = {}) {
    const startsAt = normalizeIso(input.startsAt, 'Le début de l’absence');
    const endsAt = normalizeIso(input.endsAt, 'La fin de l’absence');
    if (new Date(endsAt) <= new Date(startsAt)) throw new Error('La fin de l’absence doit être après son début.');
    const now = nowIso();
    const result = db.prepare(`INSERT INTO team_absences (guild_id, user_id, starts_at, ends_at, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'declared', ?, ?)`)
        .run(guildId, userId, startsAt, endsAt, clampText(input.reason, 500), now, now);
    return getAbsence(guildId, Number(result.lastInsertRowid));
}

function getAbsence(guildId, absenceId) {
    const row = db.prepare('SELECT * FROM team_absences WHERE guild_id = ? AND id = ?').get(guildId, Number(absenceId));
    return row ? { id: Number(row.id), guildId: row.guild_id, userId: row.user_id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason || '', status: row.status, createdAt: row.created_at } : null;
}

function listAbsences(guildId, { userId = null, limit = 100 } = {}) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
    const rows = userId
        ? db.prepare('SELECT * FROM team_absences WHERE guild_id = ? AND user_id = ? ORDER BY datetime(starts_at) DESC LIMIT ?').all(guildId, userId, boundedLimit)
        : db.prepare("SELECT * FROM team_absences WHERE guild_id = ? AND status = 'declared' AND datetime(ends_at) >= datetime('now') ORDER BY datetime(starts_at) ASC LIMIT ?").all(guildId, boundedLimit);
    return rows.map(row => getAbsence(guildId, row.id));
}

function cancelAbsence(guildId, absenceId, userId) {
    const result = db.prepare("UPDATE team_absences SET status = 'cancelled', updated_at = ? WHERE guild_id = ? AND id = ? AND user_id = ? AND status = 'declared'")
        .run(nowIso(), guildId, Number(absenceId), userId);
    if (!result.changes) throw new Error('Cette absence ne peut plus être annulée.');
    return getAbsence(guildId, absenceId);
}

function getDueShiftReminders(limit = 50) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return db.prepare(`
        SELECT * FROM team_shifts
        WHERE status = 'scheduled'
          AND reminder_sent_at IS NULL
          AND datetime(starts_at) > datetime('now')
          AND datetime(starts_at, '-' || reminder_minutes || ' minutes') <= datetime('now')
        ORDER BY datetime(starts_at) ASC LIMIT ?
    `).all(boundedLimit).map(mapShift);
}

function markShiftReminderSent(guildId, shiftId) {
    db.prepare('UPDATE team_shifts SET reminder_sent_at = ?, updated_at = ? WHERE guild_id = ? AND id = ?')
        .run(nowIso(), nowIso(), guildId, Number(shiftId));
}

function mapSuggestion(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        userId: row.user_id,
        title: row.title,
        body: row.body,
        status: row.status,
        staffResponse: row.staff_response || '',
        reviewedByUserId: row.reviewed_by_user_id || null,
        publishedChannelId: row.published_channel_id || null,
        publishedMessageId: row.published_message_id || null,
        score: Number(row.score || 0),
        voteCount: Number(row.vote_count || 0),
        viewerVote: Number(row.viewer_vote || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function createSuggestion(guildId, userId, input = {}) {
    const now = nowIso();
    const result = db.prepare(`INSERT INTO community_suggestions (guild_id, user_id, title, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'submitted', ?, ?)`)
        .run(
            guildId,
            userId,
            clampText(input.title, 120, { required: true, minLength: 5 }),
            clampText(input.body, 3000, { required: true, minLength: 20 }),
            now,
            now
        );
    return getSuggestion(guildId, Number(result.lastInsertRowid), userId);
}

function getSuggestion(guildId, suggestionId, viewerUserId = null) {
    return mapSuggestion(db.prepare(`
        SELECT s.*,
               COALESCE(SUM(v.value), 0) AS score,
               COUNT(v.user_id) AS vote_count,
               COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.value ELSE 0 END), 0) AS viewer_vote
        FROM community_suggestions s
        LEFT JOIN community_suggestion_votes v ON v.suggestion_id = s.id
        WHERE s.guild_id = ? AND s.id = ?
        GROUP BY s.id
    `).get(viewerUserId || '', guildId, Number(suggestionId)));
}

function listSuggestions(guildId, { viewerUserId = null, userId = null, includeRejected = true, limit = 100 } = {}) {
    const conditions = ['s.guild_id = ?'];
    const params = [viewerUserId || '', guildId];
    if (userId) { conditions.push('s.user_id = ?'); params.push(userId); }
    if (!includeRejected) conditions.push("s.status != 'rejected'");
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 250));
    return db.prepare(`
        SELECT s.*, COALESCE(SUM(v.value), 0) AS score, COUNT(v.user_id) AS vote_count,
               COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.value ELSE 0 END), 0) AS viewer_vote
        FROM community_suggestions s
        LEFT JOIN community_suggestion_votes v ON v.suggestion_id = s.id
        WHERE ${conditions.join(' AND ')}
        GROUP BY s.id
        ORDER BY CASE s.status WHEN 'submitted' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'accepted' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
                 score DESC, datetime(s.created_at) DESC
        LIMIT ?
    `).all(...params).map(mapSuggestion);
}

function voteSuggestion(guildId, suggestionId, userId, value) {
    const normalizedValue = Number(value) === -1 ? -1 : 1;
    const suggestion = getSuggestion(guildId, suggestionId, userId);
    if (!suggestion || suggestion.status === 'rejected') throw new Error('Suggestion introuvable ou fermée.');
    if (suggestion.userId === userId) throw new Error('Tu ne peux pas voter pour ta propre suggestion.');
    const now = nowIso();
    if (suggestion.viewerVote === normalizedValue) {
        db.prepare('DELETE FROM community_suggestion_votes WHERE suggestion_id = ? AND user_id = ?').run(Number(suggestionId), userId);
    } else {
        db.prepare(`
            INSERT INTO community_suggestion_votes (suggestion_id, guild_id, user_id, value, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(suggestion_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(Number(suggestionId), guildId, userId, normalizedValue, now, now);
    }
    return getSuggestion(guildId, suggestionId, userId);
}

function reviewSuggestion(guildId, suggestionId, reviewerUserId, input = {}) {
    const status = String(input.status || '').trim();
    if (!SUGGESTION_STATUSES.has(status) || status === 'submitted') throw new Error('Décision de suggestion invalide.');
    const result = db.prepare(`UPDATE community_suggestions SET status = ?, staff_response = ?, reviewed_by_user_id = ?, updated_at = ? WHERE guild_id = ? AND id = ? AND status != 'published'`)
        .run(status, clampText(input.staffResponse, 2000), reviewerUserId, nowIso(), guildId, Number(suggestionId));
    if (!result.changes) throw new Error('Suggestion introuvable ou déjà publiée.');
    return getSuggestion(guildId, suggestionId, reviewerUserId);
}

function markSuggestionPublished(guildId, suggestionId, reviewerUserId, channelId, messageId) {
    const result = db.prepare(`
        UPDATE community_suggestions
        SET status = 'published', reviewed_by_user_id = ?, published_channel_id = ?, published_message_id = ?, updated_at = ?
        WHERE guild_id = ? AND id = ?
    `).run(reviewerUserId, channelId, messageId, nowIso(), guildId, Number(suggestionId));
    if (!result.changes) throw new Error('Suggestion introuvable.');
    return getSuggestion(guildId, suggestionId, reviewerUserId);
}

function getPanelTheme(guildId, panelType) {
    const normalizedType = PANEL_TYPES.has(panelType) ? panelType : null;
    if (!normalizedType) return null;
    const row = db.prepare('SELECT * FROM guild_panel_themes WHERE guild_id = ? AND panel_type = ?').get(guildId, normalizedType);
    return row ? {
        guildId: row.guild_id,
        panelType: row.panel_type,
        title: row.title || '',
        description: row.description || '',
        color: row.color || '#24d7d0',
        imageUrl: row.image_url || '',
        footer: row.footer || '',
        buttonLabels: parseJson(row.button_labels_json, {}),
        updatedAt: row.updated_at
    } : { guildId, panelType: normalizedType, title: '', description: '', color: '#24d7d0', imageUrl: '', footer: '', buttonLabels: {}, updatedAt: null };
}

function savePanelTheme(guildId, panelType, actorUserId, input = {}) {
    if (!PANEL_TYPES.has(panelType)) throw new Error('Type de panneau invalide.');
    const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color).toUpperCase() : '#24D7D0';
    const imageUrl = clampText(input.imageUrl, 1000);
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) throw new Error('L’image doit utiliser une adresse HTTPS.');
    const buttonKeys = panelType === 'service'
        ? ['start', 'end', 'hours', 'active']
        : ['support', 'report', 'recruitment', 'partnership', 'other'];
    const buttonLabels = {};
    for (const key of buttonKeys) {
        const label = clampText(input[`button${key[0].toUpperCase()}${key.slice(1)}Label`], 80);
        if (label) buttonLabels[key] = label;
    }
    const now = nowIso();
    db.prepare(`
        INSERT INTO guild_panel_themes (guild_id, panel_type, title, description, color, image_url, footer, button_labels_json, updated_by_user_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, panel_type) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            color = excluded.color,
            image_url = excluded.image_url,
            footer = excluded.footer,
            button_labels_json = excluded.button_labels_json,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
    `).run(
        guildId,
        panelType,
        clampText(input.title, 120),
        clampText(input.description, 2000),
        color,
        imageUrl,
        clampText(input.footer, 200),
        JSON.stringify(buttonLabels),
        actorUserId,
        now
    );
    return getPanelTheme(guildId, panelType);
}

function getCommunityAnalytics(guildId) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const scalar = (sql, ...params) => Number(db.prepare(sql).pluck().get(...params) || 0);
    const hourly = db.prepare(`
        SELECT strftime('%H', datetime(date)) AS hour, COUNT(*) AS count
        FROM service_sessions WHERE guild_id = ? AND date >= ?
        GROUP BY hour ORDER BY count DESC, hour ASC LIMIT 6
    `).all(guildId, thirtyDaysAgo).map(row => ({ hour: Number(row.hour), count: Number(row.count) }));
    const staffLoad = db.prepare(`
        SELECT COALESCE(referent_user_id, 'unassigned') AS user_id, COUNT(*) AS count
        FROM sentinel_dossiers WHERE guild_id = ? AND status != 'closed'
        GROUP BY referent_user_id ORDER BY count DESC LIMIT 10
    `).all(guildId).map(row => ({ userId: row.user_id, count: Number(row.count) }));
    const response = db.prepare(`
        SELECT AVG((julianday(first_staff_response_at) - julianday(created_at)) * 1440.0) AS minutes
        FROM sentinel_dossiers WHERE guild_id = ? AND first_staff_response_at IS NOT NULL AND created_at >= ?
    `).get(guildId, thirtyDaysAgo);
    return {
        generatedAt: nowIso(),
        services30d: scalar('SELECT COUNT(*) FROM service_sessions WHERE guild_id = ? AND datetime(date) >= datetime(?)', guildId, thirtyDaysAgo),
        serviceUsers30d: scalar('SELECT COUNT(DISTINCT user_id) FROM service_sessions WHERE guild_id = ? AND datetime(date) >= datetime(?)', guildId, thirtyDaysAgo),
        ticketsOpen: scalar("SELECT COUNT(*) FROM sentinel_dossiers WHERE guild_id = ? AND status != 'closed'", guildId),
        tickets30d: scalar('SELECT COUNT(*) FROM sentinel_dossiers WHERE guild_id = ? AND created_at >= ?', guildId, thirtyDaysAgo),
        moderation30d: scalar('SELECT COUNT(*) FROM moderation_cases WHERE guild_id = ? AND created_at >= ?', guildId, thirtyDaysAgo),
        automod24h: scalar('SELECT COUNT(*) FROM guild_automod_events WHERE guild_id = ? AND created_at >= ?', guildId, oneDayAgo),
        applicationsPending: scalar("SELECT COUNT(*) FROM recruitment_applications WHERE guild_id = ? AND status IN ('submitted','reviewing','interview')", guildId),
        upcomingShifts: scalar("SELECT COUNT(*) FROM team_shifts WHERE guild_id = ? AND status = 'scheduled' AND datetime(ends_at) >= datetime('now')", guildId),
        suggestionsOpen: scalar("SELECT COUNT(*) FROM community_suggestions WHERE guild_id = ? AND status IN ('submitted','reviewing','accepted')", guildId),
        averageFirstResponseMinutes: response?.minutes == null ? null : Math.max(0, Math.round(Number(response.minutes))),
        busiestHours: hourly,
        staffLoad
    };
}

module.exports = {
    cancelAbsence,
    cancelTeamShift,
    createRecruitmentForm,
    createSuggestion,
    createTeamShift,
    declareAbsence,
    getCommunityAnalytics,
    getDueShiftReminders,
    getPanelTheme,
    getRecruitmentApplication,
    getRecruitmentForm,
    getSuggestion,
    getTeamShift,
    listAbsences,
    listRecruitmentApplications,
    listRecruitmentForms,
    listSuggestions,
    listTeamShifts,
    markShiftReminderSent,
    markSuggestionPublished,
    reviewRecruitmentApplication,
    reviewSuggestion,
    savePanelTheme,
    setRecruitmentFormOpen,
    setShiftResponse,
    submitRecruitmentApplication,
    voteSuggestion,
    withdrawRecruitmentApplication
};
