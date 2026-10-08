const db = require('./database/database');

function mapAppeal(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        guildId: row.guild_id,
        caseId: Number(row.case_id),
        userId: row.user_id,
        statement: row.statement,
        status: row.status,
        decision: row.decision || null,
        decidedByUserId: row.decided_by_user_id || null,
        createdAt: row.created_at,
        decidedAt: row.decided_at || null
    };
}

function createAppeal(guildId, caseId, userId, statement) {
    const normalizedStatement = String(statement || '').trim().slice(0, 2000);
    if (normalizedStatement.length < 20) {
        throw new Error('Explique ta demande en au moins 20 caractères.');
    }

    const moderationCase = db.prepare(`
        SELECT id, action FROM moderation_cases
        WHERE id = ? AND guild_id = ? AND target_user_id = ?
    `).get(Number(caseId), guildId, userId);
    if (!moderationCase) throw new Error('Cette sanction ne peut pas être contestée depuis ce compte.');

    const existing = db.prepare(`
        SELECT * FROM moderation_appeals
        WHERE guild_id = ? AND case_id = ? AND user_id = ?
    `).get(guildId, Number(caseId), userId);
    if (existing) {
        if (existing.status === 'pending') throw new Error('Une contestation est déjà en attente pour cette sanction.');
        throw new Error('Cette sanction a déjà fait l’objet d’une décision.');
    }

    const now = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO moderation_appeals (
            guild_id, case_id, user_id, statement, status, created_at
        ) VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(guildId, Number(caseId), userId, normalizedStatement, now);
    return getAppeal(guildId, Number(result.lastInsertRowid));
}

function getAppeal(guildId, appealId) {
    return mapAppeal(db.prepare(`
        SELECT * FROM moderation_appeals WHERE guild_id = ? AND id = ?
    `).get(guildId, Number(appealId)));
}

function getMemberAppeals(userId, guildId = null, limit = 50) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows = guildId
        ? db.prepare(`
            SELECT * FROM moderation_appeals
            WHERE user_id = ? AND guild_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(userId, guildId, boundedLimit)
        : db.prepare(`
            SELECT * FROM moderation_appeals
            WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
        `).all(userId, boundedLimit);
    return rows.map(mapAppeal);
}

function getGuildAppeals(guildId, { status = 'all', limit = 100 } = {}) {
    const normalizedStatus = ['pending', 'accepted', 'rejected', 'all'].includes(status) ? status : 'all';
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const rows = normalizedStatus === 'all'
        ? db.prepare(`
            SELECT * FROM moderation_appeals
            WHERE guild_id = ? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT ?
        `).all(guildId, boundedLimit)
        : db.prepare(`
            SELECT * FROM moderation_appeals
            WHERE guild_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?
        `).all(guildId, normalizedStatus, boundedLimit);
    return rows.map(mapAppeal);
}

function decideAppeal(guildId, appealId, reviewerUserId, status, decision) {
    const normalizedStatus = ['accepted', 'rejected'].includes(status) ? status : null;
    const normalizedDecision = String(decision || '').trim().slice(0, 2000);
    if (!normalizedStatus || normalizedDecision.length < 10) {
        throw new Error('Choisis une décision et indique une réponse d’au moins 10 caractères.');
    }
    const now = new Date().toISOString();
    const result = db.prepare(`
        UPDATE moderation_appeals
        SET status = ?, decision = ?, decided_by_user_id = ?, decided_at = ?
        WHERE guild_id = ? AND id = ? AND status = 'pending'
    `).run(normalizedStatus, normalizedDecision, reviewerUserId, now, guildId, Number(appealId));
    if (!result.changes) throw new Error('Contestation introuvable ou déjà traitée.');
    return getAppeal(guildId, appealId);
}

module.exports = {
    createAppeal,
    decideAppeal,
    getAppeal,
    getGuildAppeals,
    getMemberAppeals
};
