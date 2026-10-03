'use strict';

const db = require('./database/database');

const REPORT_FORMATS = new Set(['csv', 'xls', 'pdf']);
const REPORT_KINDS = new Set(['service', 'payroll', 'dossiers', 'moderation']);
const RECURRENCES = new Set(['none', 'weekly', 'monthly']);

function clampInteger(value, fallback, min, max) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function booleanValue(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null || value === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseJsonArray(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
        return [];
    }
}

function normalizeDiscordIds(value, limit = 50) {
    const values = Array.isArray(value) ? value : String(value || '').match(/\d{17,20}/g) || [];
    return [...new Set(values.map(String).filter(item => /^\d{17,20}$/.test(item)))].slice(0, limit);
}

function mapWarningEscalationSettings(row) {
    return {
        guildId: row.guild_id,
        enabled: Boolean(row.enabled),
        windowDays: row.window_days,
        timeoutThreshold: row.timeout_threshold,
        timeoutSeconds: row.timeout_seconds,
        kickThreshold: row.kick_threshold,
        banThreshold: row.ban_threshold,
        ignoredRoleIds: parseJsonArray(row.ignored_role_ids_json),
        updatedByUserId: row.updated_by_user_id || null,
        updatedAt: row.updated_at
    };
}

function getWarningEscalationSettings(guildId) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT OR IGNORE INTO guild_warning_escalation_settings (guild_id, updated_at)
        VALUES (?, ?)
    `).run(guildId, now);
    return mapWarningEscalationSettings(db.prepare(`
        SELECT * FROM guild_warning_escalation_settings WHERE guild_id = ?
    `).get(guildId));
}

function updateWarningEscalationSettings(guildId, patch, actorUserId = null) {
    const current = getWarningEscalationSettings(guildId);
    const timeoutThreshold = clampInteger(patch.timeoutThreshold, current.timeoutThreshold, 1, 50);
    const kickThreshold = clampInteger(patch.kickThreshold, current.kickThreshold, 0, 50);
    const banThreshold = clampInteger(patch.banThreshold, current.banThreshold, 0, 50);

    if ((kickThreshold && kickThreshold <= timeoutThreshold)
        || (banThreshold && banThreshold <= Math.max(timeoutThreshold, kickThreshold))) {
        throw new Error('Les paliers doivent être strictement croissants. Utilise 0 pour désactiver un palier.');
    }

    db.prepare(`
        UPDATE guild_warning_escalation_settings
        SET enabled = ?, window_days = ?, timeout_threshold = ?, timeout_seconds = ?,
            kick_threshold = ?, ban_threshold = ?, ignored_role_ids_json = ?,
            updated_by_user_id = ?, updated_at = ?
        WHERE guild_id = ?
    `).run(
        Number(booleanValue(patch.enabled, current.enabled)),
        clampInteger(patch.windowDays, current.windowDays, 1, 3650),
        timeoutThreshold,
        clampInteger(patch.timeoutSeconds, current.timeoutSeconds, 60, 28 * 24 * 60 * 60),
        kickThreshold,
        banThreshold,
        JSON.stringify(normalizeDiscordIds(patch.ignoredRoleIds ?? current.ignoredRoleIds)),
        actorUserId,
        new Date().toISOString(),
        guildId
    );
    return getWarningEscalationSettings(guildId);
}

function getActiveWarningCount(guildId, userId, windowDays) {
    return db.prepare(`
        SELECT COUNT(*) AS count
        FROM moderation_cases
        WHERE guild_id = ? AND target_user_id = ? AND action = 'warn'
          AND created_at >= datetime('now', ?)
    `).get(guildId, userId, `-${clampInteger(windowDays, 30, 1, 3650)} days`).count;
}

function getWarningEscalationAction(settings, warningCount) {
    if (!settings?.enabled) return null;
    if (settings.banThreshold > 0 && warningCount === settings.banThreshold) return 'ban';
    if (settings.kickThreshold > 0 && warningCount === settings.kickThreshold) return 'kick';
    if (settings.timeoutThreshold > 0 && warningCount === settings.timeoutThreshold) return 'timeout';
    return null;
}

function addWarningEscalationEvent(data) {
    const result = db.prepare(`
        INSERT INTO warning_escalation_events (
            guild_id, user_id, warning_case_id, warning_count, action, status,
            reason, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.guildId,
        data.userId,
        data.warningCaseId || null,
        data.warningCount,
        data.action,
        data.status,
        data.reason || null,
        data.errorMessage || null,
        new Date().toISOString()
    );
    return Number(result.lastInsertRowid);
}

function getWarningEscalationEvents(guildId, limit = 25) {
    return db.prepare(`
        SELECT * FROM warning_escalation_events
        WHERE guild_id = ? ORDER BY id DESC LIMIT ?
    `).all(guildId, clampInteger(limit, 25, 1, 100)).map(row => ({
        id: row.id,
        userId: row.user_id,
        warningCaseId: row.warning_case_id,
        warningCount: row.warning_count,
        action: row.action,
        status: row.status,
        reason: row.reason,
        errorMessage: row.error_message,
        createdAt: row.created_at
    }));
}

function mapAnnouncement(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        createdByUserId: row.created_by_user_id,
        title: row.title,
        description: row.description,
        color: row.color || '#2dd4bf',
        recurrence: row.recurrence,
        status: row.status,
        nextRunAt: row.next_run_at,
        lastRunAt: row.last_run_at,
        lastMessageId: row.last_message_id,
        lastError: row.last_error,
        approvedByUserId: row.approved_by_user_id || null,
        approvedAt: row.approved_at || null,
        runCount: row.run_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function normalizeAnnouncementInput(input) {
    const title = String(input.title || '').trim().slice(0, 256);
    const description = String(input.description || '').trim().slice(0, 4000);
    const channelId = String(input.channelId || '').trim();
    const recurrence = RECURRENCES.has(input.recurrence) ? input.recurrence : 'none';
    const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color) : '#2dd4bf';
    const nextRunAt = input.nextRunAt ? new Date(input.nextRunAt) : null;

    if (!title || !description || !/^\d{17,20}$/.test(channelId)) {
        throw new Error('Le titre, le message et le salon sont obligatoires.');
    }

    if (['scheduled', 'pending_approval'].includes(input.status) && (!nextRunAt || !Number.isFinite(nextRunAt.getTime()) || nextRunAt.getTime() <= Date.now())) {
        throw new Error('Choisis une date future valide pour programmer cette annonce.');
    }

    return { title, description, channelId, recurrence, color, nextRunAt: nextRunAt?.toISOString() || null };
}

function saveScheduledAnnouncement(guildId, actorUserId, input) {
    const normalized = normalizeAnnouncementInput(input);
    const status = ['scheduled', 'pending_approval'].includes(input.status) ? input.status : 'draft';
    const now = new Date().toISOString();
    const id = Number(input.id || 0);

    if (id) {
        const existing = db.prepare('SELECT id FROM scheduled_announcements WHERE id = ? AND guild_id = ?').get(id, guildId);
        if (!existing) throw new Error('Annonce programmée introuvable.');
        db.prepare(`
            UPDATE scheduled_announcements
            SET channel_id = ?, title = ?, description = ?, color = ?, recurrence = ?,
                status = ?, next_run_at = ?, last_error = NULL,
                approved_by_user_id = NULL, approved_at = NULL, updated_at = ?
            WHERE id = ? AND guild_id = ?
        `).run(
            normalized.channelId, normalized.title, normalized.description, normalized.color,
            normalized.recurrence, status, normalized.nextRunAt, now, id, guildId
        );
    } else {
        const result = db.prepare(`
            INSERT INTO scheduled_announcements (
                guild_id, channel_id, created_by_user_id, title, description, color,
                recurrence, status, next_run_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId, normalized.channelId, actorUserId, normalized.title, normalized.description,
            normalized.color, normalized.recurrence, status, normalized.nextRunAt, now, now
        );
        return getScheduledAnnouncement(guildId, Number(result.lastInsertRowid));
    }

    return getScheduledAnnouncement(guildId, id);
}

function getScheduledAnnouncement(guildId, id) {
    const row = db.prepare('SELECT * FROM scheduled_announcements WHERE guild_id = ? AND id = ?').get(guildId, id);
    return row ? mapAnnouncement(row) : null;
}

function getScheduledAnnouncements(guildId, limit = 50) {
    return db.prepare(`
        SELECT * FROM scheduled_announcements WHERE guild_id = ?
        ORDER BY CASE status WHEN 'pending_approval' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
                 COALESCE(next_run_at, updated_at) ASC LIMIT ?
    `).all(guildId, clampInteger(limit, 50, 1, 100)).map(mapAnnouncement);
}

function cancelScheduledAnnouncement(guildId, id) {
    return db.prepare(`
        UPDATE scheduled_announcements SET status = 'cancelled', next_run_at = NULL,
            updated_at = ? WHERE guild_id = ? AND id = ?
    `).run(new Date().toISOString(), guildId, id).changes > 0;
}

function approveScheduledAnnouncement(guildId, id, actorUserId) {
    const item = getScheduledAnnouncement(guildId, id);
    if (!item || item.status !== 'pending_approval') throw new Error('Annonce en attente de validation introuvable.');
    if (item.createdByUserId === actorUserId) throw new Error('La validation doit être effectuée par un autre responsable.');
    if (!item.nextRunAt || new Date(item.nextRunAt).getTime() <= Date.now()) throw new Error('La date prévue est dépassée; crée une nouvelle programmation.');
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE scheduled_announcements
        SET status = 'scheduled', approved_by_user_id = ?, approved_at = ?,
            last_error = NULL, updated_at = ?
        WHERE guild_id = ? AND id = ? AND status = 'pending_approval'
    `).run(actorUserId, now, now, guildId, id);
    return getScheduledAnnouncement(guildId, id);
}

function getDueScheduledAnnouncements(limit = 25) {
    return db.prepare(`
        SELECT * FROM scheduled_announcements
        WHERE status = 'scheduled' AND next_run_at <= ?
        ORDER BY next_run_at ASC LIMIT ?
    `).all(new Date().toISOString(), clampInteger(limit, 25, 1, 100)).map(mapAnnouncement);
}

function nextRecurringDate(dateValue, recurrence) {
    if (!RECURRENCES.has(recurrence) || recurrence === 'none') return null;
    const next = new Date(dateValue || Date.now());
    if (!Number.isFinite(next.getTime())) return null;
    if (recurrence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
    if (recurrence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    while (next.getTime() <= Date.now()) {
        if (recurrence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
        if (recurrence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next.toISOString();
}

function completeScheduledAnnouncement(item, result = {}) {
    const nextRunAt = result.error ? item.nextRunAt : nextRecurringDate(item.nextRunAt, item.recurrence);
    const status = result.error ? 'failed' : (nextRunAt ? 'scheduled' : 'sent');
    db.prepare(`
        UPDATE scheduled_announcements
        SET status = ?, next_run_at = ?, last_run_at = ?, last_message_id = ?,
            last_error = ?, run_count = run_count + ?, updated_at = ?
        WHERE id = ?
    `).run(
        status,
        nextRunAt,
        result.error ? null : new Date().toISOString(),
        result.messageId || null,
        result.error ? String(result.error).slice(0, 500) : null,
        result.error ? 0 : 1,
        new Date().toISOString(),
        item.id
    );
}

function mapReportSchedule(row) {
    return {
        id: row.id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        reportKind: row.report_kind,
        frequency: row.frequency,
        format: row.format,
        enabled: Boolean(row.enabled),
        nextRunAt: row.next_run_at,
        lastRunAt: row.last_run_at,
        lastMessageId: row.last_message_id,
        lastError: row.last_error,
        updatedAt: row.updated_at
    };
}

function scheduleStart(frequency) {
    const date = new Date();
    date.setUTCSeconds(0, 0);
    date.setUTCHours(8, 0, 0, 0);
    if (frequency === 'weekly') {
        const days = (8 - date.getUTCDay()) % 7 || 7;
        date.setUTCDate(date.getUTCDate() + days);
    } else {
        date.setUTCMonth(date.getUTCMonth() + 1, 1);
    }
    return date.toISOString();
}

function saveReportSchedule(guildId, actorUserId, input) {
    const reportKind = REPORT_KINDS.has(input.reportKind) ? input.reportKind : null;
    const frequency = ['weekly', 'monthly'].includes(input.frequency) ? input.frequency : null;
    const format = REPORT_FORMATS.has(input.format) ? input.format : 'csv';
    const channelId = String(input.channelId || '');
    if (!reportKind || !frequency || !/^\d{17,20}$/.test(channelId)) throw new Error('Rapport, fréquence ou salon invalide.');
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO guild_report_schedules (
            guild_id, channel_id, report_kind, frequency, format, enabled,
            created_by_user_id, next_run_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        ON CONFLICT(guild_id, report_kind, frequency) DO UPDATE SET
            channel_id = excluded.channel_id, format = excluded.format, enabled = 1,
            created_by_user_id = excluded.created_by_user_id,
            next_run_at = excluded.next_run_at, last_error = NULL, updated_at = excluded.updated_at
    `).run(guildId, channelId, reportKind, frequency, format, actorUserId, scheduleStart(frequency), now, now);
    return getReportSchedules(guildId);
}

function getReportSchedules(guildId) {
    return db.prepare(`SELECT * FROM guild_report_schedules WHERE guild_id = ? ORDER BY report_kind, frequency`)
        .all(guildId).map(mapReportSchedule);
}

function removeReportSchedule(guildId, id) {
    return db.prepare('DELETE FROM guild_report_schedules WHERE guild_id = ? AND id = ?').run(guildId, id).changes > 0;
}

function getDueReportSchedules(limit = 20) {
    return db.prepare(`
        SELECT * FROM guild_report_schedules
        WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?
    `).all(new Date().toISOString(), clampInteger(limit, 20, 1, 100)).map(mapReportSchedule);
}

function completeReportSchedule(item, result = {}) {
    const disableAfterRetry = Boolean(result.error && item.lastError);
    const nextRunAt = result.error
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : nextRecurringDate(item.nextRunAt, item.frequency);
    db.prepare(`
        UPDATE guild_report_schedules
        SET enabled = ?, next_run_at = ?, last_run_at = ?, last_message_id = ?, last_error = ?, updated_at = ?
        WHERE id = ?
    `).run(
        disableAfterRetry ? 0 : 1,
        nextRunAt,
        result.error ? item.lastRunAt : new Date().toISOString(),
        result.messageId || null,
        result.error ? String(result.error).slice(0, 500) : null,
        new Date().toISOString(),
        item.id
    );
}

function getNotificationStates(guildId, userId) {
    return new Map(db.prepare(`
        SELECT * FROM dashboard_notification_states WHERE guild_id = ? AND user_id = ?
    `).all(guildId, userId).map(row => [row.notification_key, row]));
}

function setNotificationState(guildId, userId, key, action) {
    const notificationKey = String(key || '').trim().slice(0, 160);
    if (!notificationKey || !['read', 'unread', 'dismiss'].includes(action)) throw new Error('Notification invalide.');
    const now = new Date().toISOString();
    const readAt = action === 'unread' ? null : now;
    const dismissedAt = action === 'dismiss' ? now : null;
    db.prepare(`
        INSERT INTO dashboard_notification_states (
            guild_id, user_id, notification_key, read_at, dismissed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id, notification_key) DO UPDATE SET
            read_at = excluded.read_at, dismissed_at = excluded.dismissed_at, updated_at = excluded.updated_at
    `).run(guildId, userId, notificationKey, readAt, dismissedAt, now);
}

function getUserNotificationPreferences(guildId, userId) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT OR IGNORE INTO user_notification_preferences (guild_id, user_id, updated_at)
        VALUES (?, ?, ?)
    `).run(guildId, userId, now);
    const row = db.prepare(`
        SELECT * FROM user_notification_preferences WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
    return {
        guildId,
        userId,
        serviceEnabled: Boolean(row.service_enabled),
        payrollEnabled: Boolean(row.payroll_enabled),
        dossierEnabled: Boolean(row.dossier_enabled),
        moderationEnabled: Boolean(row.moderation_enabled),
        updatedAt: row.updated_at
    };
}

function updateUserNotificationPreferences(guildId, userId, patch) {
    const current = getUserNotificationPreferences(guildId, userId);
    db.prepare(`
        UPDATE user_notification_preferences
        SET service_enabled = ?, payroll_enabled = ?, dossier_enabled = ?,
            moderation_enabled = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ?
    `).run(
        Number(booleanValue(patch.serviceEnabled, current.serviceEnabled)),
        Number(booleanValue(patch.payrollEnabled, current.payrollEnabled)),
        Number(booleanValue(patch.dossierEnabled, current.dossierEnabled)),
        Number(booleanValue(patch.moderationEnabled, current.moderationEnabled)),
        new Date().toISOString(),
        guildId,
        userId
    );
    return getUserNotificationPreferences(guildId, userId);
}

function addSimulationRun(guildId, actorUserId, kind, input, result) {
    const record = db.prepare(`
        INSERT INTO simulation_runs (guild_id, actor_user_id, kind, input_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(guildId, actorUserId, kind, JSON.stringify(input || {}), JSON.stringify(result || {}), new Date().toISOString());
    return Number(record.lastInsertRowid);
}

function getSimulationRuns(guildId, limit = 10) {
    return db.prepare(`SELECT * FROM simulation_runs WHERE guild_id = ? ORDER BY id DESC LIMIT ?`)
        .all(guildId, clampInteger(limit, 10, 1, 50)).map(row => ({
            id: row.id,
            actorUserId: row.actor_user_id,
            kind: row.kind,
            input: JSON.parse(row.input_json || '{}'),
            result: JSON.parse(row.result_json || '{}'),
            createdAt: row.created_at
        }));
}

function addValidationRun(guildId, trigger, checks) {
    const status = checks.every(check => check.ok) ? 'passed' : 'failed';
    const result = db.prepare(`
        INSERT INTO sentinel_validation_runs (guild_id, trigger, status, checks_json, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(guildId || null, trigger, status, JSON.stringify(checks), new Date().toISOString());
    return { id: Number(result.lastInsertRowid), status, checks };
}

function getValidationRuns(guildId, limit = 10) {
    return db.prepare(`
        SELECT * FROM sentinel_validation_runs
        WHERE guild_id = ? OR guild_id IS NULL ORDER BY id DESC LIMIT ?
    `).all(guildId, clampInteger(limit, 10, 1, 50)).map(row => ({
        id: row.id,
        trigger: row.trigger,
        status: row.status,
        checks: JSON.parse(row.checks_json || '[]'),
        createdAt: row.created_at
    }));
}

function reportCell(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function csvEscape(value) {
    const text = reportCell(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value) {
    return reportCell(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pdfEscape(value) {
    return reportCell(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(value, width = 92) {
    const words = reportCell(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        if (`${line} ${word}`.trim().length > width && line) {
            lines.push(line);
            line = word;
        } else {
            line = `${line} ${word}`.trim();
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function createPdf(title, columns, rows) {
    const reportLines = [];
    for (const row of rows) {
        reportLines.push(...wrapText(columns.map(column => reportCell(row[column])).join(' | ')));
    }
    const pageSize = 58;
    const pageCount = Math.max(1, Math.ceil(reportLines.length / pageSize));
    const fontObjectId = 3 + (pageCount * 2);
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
    const pageIds = [];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageObjectId = 3 + (pageIndex * 2);
        const contentObjectId = pageObjectId + 1;
        const pageLines = [
            `${title} - page ${pageIndex + 1}/${pageCount}`,
            `Généré le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
            '',
            columns.join(' | '),
            '-'.repeat(92),
            ...reportLines.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
        ];
        const stream = [
            'BT', '/F1 9 Tf', '44 800 Td',
            ...pageLines.flatMap((line, index) => [index ? '0 -12 Td' : '', `(${pdfEscape(line)}) Tj`]).filter(Boolean),
            'ET'
        ].join('\n');
        pageIds.push(pageObjectId);
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
        objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    }

    objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    let output = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(output, 'latin1'));
        output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(output, 'latin1');
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(output, 'latin1');
}

function createReportDocument({ title, columns, rows, format }) {
    if (!REPORT_FORMATS.has(format)) throw new Error('Format de rapport invalide.');
    const safeRows = Array.isArray(rows) ? rows.slice(0, 10000) : [];
    if (format === 'csv') {
        const text = [columns.map(csvEscape).join(';'), ...safeRows.map(row => columns.map(column => csvEscape(row[column])).join(';'))].join('\r\n');
        return { buffer: Buffer.from(`\uFEFF${text}`, 'utf8'), extension: 'csv', contentType: 'text/csv; charset=utf-8' };
    }
    if (format === 'xls') {
        const xmlRows = [columns.reduce((row, column) => ({ ...row, [column]: column }), {}), ...safeRows]
            .map(row => `<Row>${columns.map(column => `<Cell><Data ss:Type="String">${xmlEscape(row[column])}</Data></Cell>`).join('')}</Row>`)
            .join('');
        const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Sentinel"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
        return { buffer: Buffer.from(xml, 'utf8'), extension: 'xls', contentType: 'application/vnd.ms-excel' };
    }
    return { buffer: createPdf(title, columns, safeRows), extension: 'pdf', contentType: 'application/pdf' };
}

module.exports = {
    REPORT_FORMATS,
    REPORT_KINDS,
    addSimulationRun,
    addValidationRun,
    addWarningEscalationEvent,
    approveScheduledAnnouncement,
    cancelScheduledAnnouncement,
    completeReportSchedule,
    completeScheduledAnnouncement,
    createReportDocument,
    getActiveWarningCount,
    getDueReportSchedules,
    getDueScheduledAnnouncements,
    getNotificationStates,
    getReportSchedules,
    getScheduledAnnouncement,
    getScheduledAnnouncements,
    getSimulationRuns,
    getUserNotificationPreferences,
    getValidationRuns,
    getWarningEscalationAction,
    getWarningEscalationEvents,
    getWarningEscalationSettings,
    removeReportSchedule,
    saveReportSchedule,
    saveScheduledAnnouncement,
    setNotificationState,
    updateUserNotificationPreferences,
    updateWarningEscalationSettings
};
