const db = require('./database/database');

function issue(key, kind, label, detail, repairable = false, metadata = {}) {
    return { key, kind, label, detail, repairable, metadata };
}

function parseIds(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
        return [];
    }
}

async function messageExists(channel, messageId) {
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) return false;
    return Boolean(await channel.messages.fetch(messageId).catch(() => null));
}

async function scanGuildConfiguration(guild, actorUserId = null) {
    const issues = [];
    const config = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?').get(guild.id) || {};
    const checkRole = (id, key, label, repairable = true) => {
        if (id && !guild.roles.cache.has(id)) {
            issues.push(issue(key, 'missing_role', label, `Le rôle ${id} n’existe plus.`, repairable, { roleId: id }));
        }
    };
    const checkChannel = (id, key, label, repairable = true) => {
        if (id && !guild.channels.cache.has(id)) {
            issues.push(issue(key, 'missing_channel', label, `Le salon ${id} n’existe plus.`, repairable, { channelId: id }));
        }
    };

    checkRole(config.role_id, 'service-role', 'Rôle de service supprimé');
    checkChannel(config.log_channel_id, 'log-channel', 'Salon de logs supprimé');
    checkChannel(config.status_channel_id, 'status-channel', 'Salon de statut supprimé');
    checkChannel(config.updates_channel_id, 'updates-channel', 'Salon de nouveautés supprimé');

    for (const row of db.prepare('SELECT role_id FROM guild_command_roles WHERE guild_id = ?').all(guild.id)) {
        checkRole(row.role_id, `command-role:${row.role_id}`, 'Rôle de gestion supprimé');
    }
    for (const row of db.prepare('SELECT role_id FROM sentinel_dossier_roles WHERE guild_id = ?').all(guild.id)) {
        checkRole(row.role_id, `dossier-role:${row.role_id}`, 'Rôle responsable de dossiers supprimé');
    }
    for (const row of db.prepare('SELECT type, role_id FROM sentinel_dossier_type_roles WHERE guild_id = ?').all(guild.id)) {
        checkRole(row.role_id, `dossier-type-role:${row.type}:${row.role_id}`, `Rôle du dossier ${row.type} supprimé`);
    }

    for (const panel of db.prepare('SELECT id, channel_id, message_id FROM sentinel_dossier_panels WHERE guild_id = ?').all(guild.id)) {
        const channel = guild.channels.cache.get(panel.channel_id);
        if (!channel || !await messageExists(channel, panel.message_id)) {
            issues.push(issue(
                `dossier-panel:${panel.id}`,
                'dead_panel',
                'Panneau de dossiers introuvable',
                `La référence au panneau ${panel.message_id} ne correspond plus à un message Discord.`,
                true,
                { id: panel.id, channelId: panel.channel_id, messageId: panel.message_id }
            ));
        }
    }

    for (const embed of db.prepare('SELECT message_id, channel_id, title FROM custom_embeds WHERE guild_id = ?').all(guild.id)) {
        const channel = guild.channels.cache.get(embed.channel_id);
        if (!channel || !await messageExists(channel, embed.message_id)) {
            issues.push(issue(
                `custom-embed:${embed.message_id}`,
                'dead_embed',
                'Annonce Sentinel introuvable',
                `L’annonce « ${embed.title || embed.message_id} » n’existe plus sur Discord.`,
                true,
                { channelId: embed.channel_id, messageId: embed.message_id }
            ));
        }
    }

    for (const item of db.prepare(`
        SELECT id, channel_id, title FROM scheduled_announcements
        WHERE guild_id = ? AND status IN ('draft', 'pending_approval', 'scheduled')
    `).all(guild.id)) {
        if (!guild.channels.cache.has(item.channel_id)) {
            issues.push(issue(
                `scheduled-announcement:${item.id}`,
                'dead_schedule',
                'Annonce programmée sans salon',
                `L’annonce « ${item.title} » vise un salon supprimé.`,
                true,
                { id: item.id, channelId: item.channel_id }
            ));
        }
    }

    for (const item of db.prepare('SELECT id, channel_id, report_kind FROM guild_report_schedules WHERE guild_id = ? AND enabled = 1').all(guild.id)) {
        if (!guild.channels.cache.has(item.channel_id)) {
            issues.push(issue(
                `report-schedule:${item.id}`,
                'dead_report_schedule',
                'Rapport automatique sans salon',
                `Le rapport ${item.report_kind} vise un salon supprimé.`,
                true,
                { id: item.id, channelId: item.channel_id }
            ));
        }
    }

    const automod = db.prepare('SELECT premium_ignored_channel_ids_json FROM guild_automod_settings WHERE guild_id = ?').get(guild.id);
    for (const channelId of parseIds(automod?.premium_ignored_channel_ids_json)) {
        if (!guild.channels.cache.has(channelId)) {
            issues.push(issue(
                `automod-ignored-channel:${channelId}`,
                'dead_automod_reference',
                'Exception d’auto-modération supprimée',
                `Le salon ignoré ${channelId} n’existe plus.`,
                true,
                { channelId }
            ));
        }
    }

    const report = {
        guildId: guild.id,
        status: issues.length ? 'needs_attention' : 'healthy',
        issues,
        repairs: [],
        scannedByUserId: actorUserId,
        scannedAt: new Date().toISOString(),
        repairedAt: null
    };
    db.prepare(`
        INSERT INTO guild_repair_reports (
            guild_id, status, issues_json, repairs_json, scanned_by_user_id, scanned_at, repaired_at
        ) VALUES (?, ?, ?, '[]', ?, ?, NULL)
        ON CONFLICT(guild_id) DO UPDATE SET
            status = excluded.status,
            issues_json = excluded.issues_json,
            repairs_json = '[]',
            scanned_by_user_id = excluded.scanned_by_user_id,
            scanned_at = excluded.scanned_at,
            repaired_at = NULL
    `).run(guild.id, report.status, JSON.stringify(issues), actorUserId, report.scannedAt);
    return report;
}

function getGuildRepairReport(guildId) {
    const row = db.prepare('SELECT * FROM guild_repair_reports WHERE guild_id = ?').get(guildId);
    if (!row) return null;
    let issues = [];
    let repairs = [];
    try { issues = JSON.parse(row.issues_json || '[]'); } catch (error) { issues = []; }
    try { repairs = JSON.parse(row.repairs_json || '[]'); } catch (error) { repairs = []; }
    return {
        guildId,
        status: row.status,
        issues,
        repairs,
        scannedByUserId: row.scanned_by_user_id || null,
        scannedAt: row.scanned_at,
        repairedAt: row.repaired_at || null
    };
}

async function applySafeGuildRepairs(guild, actorUserId = null) {
    const report = await scanGuildConfiguration(guild, actorUserId);
    const repairs = [];
    const now = new Date().toISOString();
    const repair = db.transaction(() => {
        for (const item of report.issues.filter(candidate => candidate.repairable)) {
            const meta = item.metadata || {};
            if (item.key === 'service-role') {
                db.prepare('UPDATE guild_configs SET role_id = NULL WHERE guild_id = ?').run(guild.id);
            } else if (item.key === 'log-channel') {
                db.prepare('UPDATE guild_configs SET log_channel_id = NULL WHERE guild_id = ?').run(guild.id);
            } else if (item.key === 'status-channel') {
                db.prepare('UPDATE guild_configs SET status_channel_id = NULL WHERE guild_id = ?').run(guild.id);
            } else if (item.key === 'updates-channel') {
                db.prepare(`
                    UPDATE guild_configs SET updates_channel_id = NULL, status_updates_enabled = 0
                    WHERE guild_id = ?
                `).run(guild.id);
            } else if (item.kind === 'missing_role' && item.key.startsWith('command-role:')) {
                db.prepare('DELETE FROM guild_command_roles WHERE guild_id = ? AND role_id = ?').run(guild.id, meta.roleId);
            } else if (item.kind === 'missing_role' && item.key.startsWith('dossier-role:')) {
                db.prepare('DELETE FROM sentinel_dossier_roles WHERE guild_id = ? AND role_id = ?').run(guild.id, meta.roleId);
            } else if (item.kind === 'missing_role' && item.key.startsWith('dossier-type-role:')) {
                db.prepare('DELETE FROM sentinel_dossier_type_roles WHERE guild_id = ? AND role_id = ?').run(guild.id, meta.roleId);
            } else if (item.kind === 'dead_panel') {
                db.prepare('DELETE FROM sentinel_dossier_panels WHERE guild_id = ? AND id = ?').run(guild.id, meta.id);
            } else if (item.kind === 'dead_embed') {
                db.prepare(`
                    UPDATE embed_media_links
                    SET status = 'trash', trashed_at = ?, purge_after = ?, updated_at = ?
                    WHERE guild_id = ? AND message_id = ?
                `).run(now, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), now, guild.id, meta.messageId);
                db.prepare('DELETE FROM custom_embeds WHERE guild_id = ? AND message_id = ?').run(guild.id, meta.messageId);
            } else if (item.kind === 'dead_schedule') {
                db.prepare(`
                    UPDATE scheduled_announcements
                    SET status = 'cancelled', next_run_at = NULL, last_error = ?, updated_at = ?
                    WHERE guild_id = ? AND id = ?
                `).run('Salon supprimé détecté par le Centre de réparation.', now, guild.id, meta.id);
            } else if (item.kind === 'dead_report_schedule') {
                db.prepare(`
                    UPDATE guild_report_schedules
                    SET enabled = 0, last_error = ?, updated_at = ?
                    WHERE guild_id = ? AND id = ?
                `).run('Salon supprimé détecté par le Centre de réparation.', now, guild.id, meta.id);
            } else if (item.kind === 'dead_automod_reference') {
                const row = db.prepare('SELECT premium_ignored_channel_ids_json FROM guild_automod_settings WHERE guild_id = ?').get(guild.id);
                const retained = parseIds(row?.premium_ignored_channel_ids_json).filter(id => id !== meta.channelId);
                db.prepare(`
                    UPDATE guild_automod_settings
                    SET premium_ignored_channel_ids_json = ?, updated_at = ? WHERE guild_id = ?
                `).run(JSON.stringify(retained), now, guild.id);
            } else {
                continue;
            }
            repairs.push({ key: item.key, label: item.label, repairedAt: now });
        }
    });
    repair();
    const next = await scanGuildConfiguration(guild, actorUserId);
    db.prepare(`
        UPDATE guild_repair_reports
        SET repairs_json = ?, repaired_at = ? WHERE guild_id = ?
    `).run(JSON.stringify(repairs), now, guild.id);
    return { ...next, repairs, repairedAt: now };
}

module.exports = {
    applySafeGuildRepairs,
    getGuildRepairReport,
    scanGuildConfiguration
};
