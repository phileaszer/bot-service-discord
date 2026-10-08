const crypto = require('crypto');
const db = require('./database/database');

const GUILD_EXPORT_TABLES = [
    'guild_configs',
    'service_times',
    'service_sessions',
    'guild_pay_settings',
    'weekly_payments',
    'guild_pay_role_settings',
    'weekly_pay_adjustments',
    'weekly_payroll_archives',
    'weekly_payment_events',
    'guild_command_roles',
    'sentinel_dossier_roles',
    'moderation_cases',
    'message_purge_archives',
    'moderation_tempbans',
    'guild_automod_settings',
    'guild_automod_words',
    'guild_automod_events',
    'custom_embeds',
    'sentinel_dossiers',
    'sentinel_dossier_panels',
    'sentinel_dossier_type_settings',
    'sentinel_dossier_templates',
    'sentinel_dossier_type_roles',
    'dashboard_audit_logs',
    'official_update_deliveries',
    'guild_warning_escalation_settings',
    'warning_escalation_events',
    'scheduled_announcements',
    'guild_report_schedules',
    'moderation_appeals'
];

function cleanExportRow(table, row) {
    const copy = { ...row };
    if (table === 'message_purge_archives') {
        delete copy.archive_path;
        delete copy.archive_sha256;
    }
    if (table === 'sentinel_dossiers') {
        delete copy.archive_path;
        delete copy.archive_sha256;
    }
    return copy;
}

function createGuildDataExport(guild) {
    const tables = {};
    for (const table of GUILD_EXPORT_TABLES) {
        tables[table] = db.prepare(`SELECT * FROM ${table} WHERE guild_id = ?`)
            .all(guild.id)
            .map(row => cleanExportRow(table, row));
    }
    const document = {
        format: 'sentinel-guild-export-v1',
        exportedAt: new Date().toISOString(),
        guild: { id: guild.id, name: guild.name },
        tables
    };
    return {
        buffer: Buffer.from(JSON.stringify(document, null, 2), 'utf8'),
        fileName: `sentinel-${guild.id}-${new Date().toISOString().slice(0, 10)}.json`,
        contentType: 'application/json; charset=utf-8'
    };
}

function createMemberDataExport(userId) {
    const queries = {
        profiles: db.prepare('SELECT user_id, username, global_name, avatar_url, last_login_at, last_seen_at, updated_at FROM user_profiles WHERE user_id = ?').all(userId),
        serviceTimes: db.prepare('SELECT * FROM service_times WHERE user_id = ?').all(userId),
        serviceSessions: db.prepare('SELECT * FROM service_sessions WHERE user_id = ?').all(userId),
        weeklyPayments: db.prepare('SELECT * FROM weekly_payments WHERE user_id = ?').all(userId),
        payAdjustments: db.prepare('SELECT * FROM weekly_pay_adjustments WHERE user_id = ?').all(userId),
        moderationCases: db.prepare('SELECT * FROM moderation_cases WHERE target_user_id = ?').all(userId),
        dossiers: db.prepare('SELECT * FROM sentinel_dossiers WHERE owner_user_id = ? OR opener_user_id = ?').all(userId, userId)
            .map(row => cleanExportRow('sentinel_dossiers', row)),
        appeals: db.prepare('SELECT * FROM moderation_appeals WHERE user_id = ?').all(userId),
        notificationPreferences: db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').all(userId)
    };
    const document = {
        format: 'sentinel-member-export-v1',
        exportedAt: new Date().toISOString(),
        userId,
        data: queries
    };
    return {
        buffer: Buffer.from(JSON.stringify(document, null, 2), 'utf8'),
        fileName: `sentinel-membre-${userId}-${new Date().toISOString().slice(0, 10)}.json`,
        contentType: 'application/json; charset=utf-8'
    };
}

function mapRequest(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        requestKey: row.request_key,
        requestType: row.request_type,
        guildId: row.guild_id || null,
        subjectUserId: row.subject_user_id || null,
        requestedByUserId: row.requested_by_user_id,
        reason: row.reason || null,
        status: row.status,
        decisionNote: row.decision_note || null,
        reviewedByUserId: row.reviewed_by_user_id || null,
        createdAt: row.created_at,
        reviewedAt: row.reviewed_at || null,
        completedAt: row.completed_at || null
    };
}

function createPrivacyRequest({ requestType, guildId = null, subjectUserId = null, requestedByUserId, reason = null }) {
    if (!['guild_delete', 'member_delete'].includes(requestType)) throw new Error('Type de demande invalide.');
    if (requestType === 'guild_delete' && !guildId) throw new Error('Serveur manquant.');
    if (requestType === 'member_delete' && !subjectUserId) throw new Error('Compte membre manquant.');
    const duplicate = db.prepare(`
        SELECT * FROM data_privacy_requests
        WHERE request_type = ? AND COALESCE(guild_id, '') = COALESCE(?, '')
          AND COALESCE(subject_user_id, '') = COALESCE(?, '') AND status = 'pending'
    `).get(requestType, guildId, subjectUserId);
    if (duplicate) return mapRequest(duplicate);
    const now = new Date().toISOString();
    const requestKey = `PRV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const result = db.prepare(`
        INSERT INTO data_privacy_requests (
            request_key, request_type, guild_id, subject_user_id,
            requested_by_user_id, reason, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
        requestKey,
        requestType,
        guildId,
        subjectUserId,
        requestedByUserId,
        String(reason || '').trim().slice(0, 1000) || null,
        now
    );
    return mapRequest(db.prepare('SELECT * FROM data_privacy_requests WHERE id = ?').get(Number(result.lastInsertRowid)));
}

function listPrivacyRequests({ guildId = null, userId = null, status = 'all', limit = 100 } = {}) {
    const clauses = [];
    const params = [];
    if (guildId) { clauses.push('guild_id = ?'); params.push(guildId); }
    if (userId) { clauses.push('(requested_by_user_id = ? OR subject_user_id = ?)'); params.push(userId, userId); }
    if (status !== 'all') { clauses.push('status = ?'); params.push(status); }
    params.push(Math.min(Math.max(Number(limit) || 100, 1), 200));
    return db.prepare(`
        SELECT * FROM data_privacy_requests
        ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
        ORDER BY created_at DESC LIMIT ?
    `).all(...params).map(mapRequest);
}

function getRetentionSettings(guildId) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT OR IGNORE INTO guild_data_retention_settings (guild_id, updated_at)
        VALUES (?, ?)
    `).run(guildId, now);
    const row = db.prepare('SELECT * FROM guild_data_retention_settings WHERE guild_id = ?').get(guildId);
    return {
        guildId,
        automodDays: Number(row.automod_days),
        auditDays: Number(row.audit_days),
        purgeArchiveDays: Number(row.purge_archive_days),
        dossierArchiveDays: Number(row.dossier_archive_days),
        updatedByUserId: row.updated_by_user_id || null,
        updatedAt: row.updated_at
    };
}

function updateRetentionSettings(guildId, actorUserId, input) {
    const bounded = value => Math.min(Math.max(Number.parseInt(value, 10) || 365, 30), 3650);
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO guild_data_retention_settings (
            guild_id, automod_days, audit_days, purge_archive_days,
            dossier_archive_days, updated_by_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
            automod_days = excluded.automod_days,
            audit_days = excluded.audit_days,
            purge_archive_days = excluded.purge_archive_days,
            dossier_archive_days = excluded.dossier_archive_days,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
    `).run(
        guildId,
        bounded(input.automodDays),
        bounded(input.auditDays),
        bounded(input.purgeArchiveDays),
        bounded(input.dossierArchiveDays),
        actorUserId,
        now
    );
    return getRetentionSettings(guildId);
}

module.exports = {
    createGuildDataExport,
    createMemberDataExport,
    createPrivacyRequest,
    getRetentionSettings,
    listPrivacyRequests,
    updateRetentionSettings
};
