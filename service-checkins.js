'use strict';

const db = require('./database/database');

const CUSTOM_ID_PREFIX = 'sentinel_service_checkin';
const CHECKIN_ACTIONS = new Set(['keep', 'end']);

function buildCustomId(guildId, userId, startTime, action) {
    if (!CHECKIN_ACTIONS.has(action)) throw new Error('Action de contrôle de service invalide.');
    return `${CUSTOM_ID_PREFIX}:${guildId}:${userId}:${Number(startTime)}:${action}`;
}

function parseCustomId(customId) {
    const match = new RegExp(`^${CUSTOM_ID_PREFIX}:(\\d{17,20}):(\\d{17,20}):(\\d{10,16}):(keep|end)$`).exec(customId || '');
    if (!match) return null;
    return {
        guildId: match[1],
        userId: match[2],
        startTime: Number(match[3]),
        action: match[4]
    };
}

function claimPrompt(guildId, userId, startTime, retryAfterMs = 60 * 60 * 1000) {
    const now = new Date();
    const nowIso = now.toISOString();
    const retryBefore = new Date(now.getTime() - Math.max(Number(retryAfterMs) || 0, 60000)).toISOString();
    return db.transaction(() => {
        const existing = db.prepare(`
            SELECT status, updated_at FROM service_checkins
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).get(guildId, userId, startTime);
        if (!existing) {
            db.prepare(`
                INSERT INTO service_checkins (
                    guild_id, user_id, start_time, status, prompt_count, created_at, updated_at
                ) VALUES (?, ?, ?, 'sending', 1, ?, ?)
            `).run(guildId, userId, startTime, nowIso, nowIso);
            return true;
        }
        if (existing.status !== 'delivery_failed' || existing.updated_at > retryBefore) return false;
        return db.prepare(`
            UPDATE service_checkins
            SET status = 'sending', prompt_count = prompt_count + 1, last_error = NULL, updated_at = ?
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
              AND status = 'delivery_failed' AND updated_at <= ?
        `).run(nowIso, guildId, userId, startTime, retryBefore).changes > 0;
    })();
}

function markPromptDelivered(guildId, userId, startTime, messageId) {
    const now = new Date().toISOString();
    return db.prepare(`
        UPDATE service_checkins
        SET status = 'pending', dm_message_id = ?, prompted_at = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'sending'
    `).run(messageId || null, now, now, guildId, userId, startTime).changes > 0;
}

function markPromptFailed(guildId, userId, startTime, error) {
    return db.prepare(`
        UPDATE service_checkins
        SET status = 'delivery_failed', last_error = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'sending'
    `).run(String(error?.message || error || 'Envoi impossible').slice(0, 500), new Date().toISOString(), guildId, userId, startTime).changes > 0;
}

function getActivePrompt(guildId, userId, startTime) {
    const checkin = db.prepare(`
        SELECT * FROM service_checkins
        WHERE guild_id = ? AND user_id = ? AND start_time = ?
    `).get(guildId, userId, startTime);
    const service = db.prepare(`
        SELECT total_time, start_time FROM service_times
        WHERE guild_id = ? AND user_id = ? AND start_time = ?
    `).get(guildId, userId, startTime);
    return {
        checkin: checkin || null,
        service: service || null,
        active: Boolean(checkin?.status === 'pending' && service)
    };
}

function confirmContinuation(guildId, userId, startTime) {
    const active = getActivePrompt(guildId, userId, startTime);
    if (!active.active) return null;
    const now = new Date().toISOString();
    const changed = db.prepare(`
        UPDATE service_checkins
        SET status = 'kept', response = 'keep', responded_at = ?, updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'pending'
    `).run(now, now, guildId, userId, startTime).changes;
    return changed ? { startTime, totalTime: Number(active.service.total_time) || 0 } : null;
}

function claimEnd(guildId, userId, startTime) {
    const active = getActivePrompt(guildId, userId, startTime);
    if (!active.active) return false;
    return db.prepare(`
        UPDATE service_checkins SET status = 'ending', updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'pending'
    `).run(new Date().toISOString(), guildId, userId, startTime).changes > 0;
}

function releaseEnd(guildId, userId, startTime) {
    return db.prepare(`
        UPDATE service_checkins SET status = 'pending', updated_at = ?
        WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'ending'
    `).run(new Date().toISOString(), guildId, userId, startTime).changes > 0;
}

function endService(guildId, userId, startTime, endedAt = Date.now()) {
    return db.transaction(() => {
        const checkin = db.prepare(`
            SELECT status FROM service_checkins
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).get(guildId, userId, startTime);
        const service = db.prepare(`
            SELECT total_time, start_time FROM service_times
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).get(guildId, userId, startTime);
        if (checkin?.status !== 'ending' || !service) return null;
        const duration = Math.max(0, Number(endedAt) - Number(startTime));
        const totalTime = (Number(service.total_time) || 0) + duration;
        const date = new Date(Number(endedAt)).toISOString();
        db.prepare(`
            INSERT INTO service_sessions (guild_id, user_id, date, duration)
            VALUES (?, ?, ?, ?)
        `).run(guildId, userId, date, duration);
        const updated = db.prepare(`
            UPDATE service_times SET total_time = ?, start_time = NULL
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).run(totalTime, guildId, userId, startTime).changes;
        if (!updated) throw new Error('Le service a changé pendant la confirmation.');
        db.prepare(`
            UPDATE service_checkins
            SET status = 'ended', response = 'end', responded_at = ?, updated_at = ?
            WHERE guild_id = ? AND user_id = ? AND start_time = ? AND status = 'ending'
        `).run(date, date, guildId, userId, startTime);
        return { duration, totalTime, endedAt: Number(endedAt) };
    })();
}

function automaticallyEndService(guildId, userId, startTime, endedAt) {
    return db.transaction(() => {
        const service = db.prepare(`
            SELECT total_time, start_time FROM service_times
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).get(guildId, userId, startTime);
        if (!service) return null;
        const safeEndedAt = Math.max(Number(endedAt) || Date.now(), Number(startTime));
        const duration = safeEndedAt - Number(startTime);
        const totalTime = (Number(service.total_time) || 0) + duration;
        const date = new Date(safeEndedAt).toISOString();
        db.prepare(`
            INSERT INTO service_sessions (guild_id, user_id, date, duration)
            VALUES (?, ?, ?, ?)
        `).run(guildId, userId, date, duration);
        const updated = db.prepare(`
            UPDATE service_times SET total_time = ?, start_time = NULL
            WHERE guild_id = ? AND user_id = ? AND start_time = ?
        `).run(totalTime, guildId, userId, startTime).changes;
        if (!updated) throw new Error('Le service a changé pendant la clôture automatique.');
        db.prepare('DELETE FROM service_checkins WHERE guild_id = ? AND user_id = ? AND start_time = ?')
            .run(guildId, userId, startTime);
        return { duration, totalTime, endedAt: safeEndedAt };
    })();
}

function clearForUser(guildId, userId) {
    return db.prepare('DELETE FROM service_checkins WHERE guild_id = ? AND user_id = ?')
        .run(guildId, userId).changes;
}

function clearForGuild(guildId) {
    return db.prepare('DELETE FROM service_checkins WHERE guild_id = ?').run(guildId).changes;
}

module.exports = {
    automaticallyEndService,
    buildCustomId,
    claimEnd,
    claimPrompt,
    clearForGuild,
    clearForUser,
    confirmContinuation,
    endService,
    getActivePrompt,
    markPromptDelivered,
    markPromptFailed,
    parseCustomId,
    releaseEnd
};
