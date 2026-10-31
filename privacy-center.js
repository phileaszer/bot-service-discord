const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database/database');
require('./community-suite');
const { cleanText, createProfessionalPdf } = require('./pdf-document');

const GUILD_EXPORT_TABLES = [
    'guild_configs',
    'service_times',
    'service_sessions',
    'service_checkins',
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
    'moderation_appeals',
    'recruitment_forms',
    'recruitment_applications',
    'team_shifts',
    'team_shift_responses',
    'team_absences',
    'community_suggestions',
    'community_suggestion_votes',
    'guild_panel_themes'
];

const EXPORT_SECTION_LABELS = {
    guild_configs: 'Configuration du serveur',
    service_times: 'Temps de service',
    service_sessions: 'Sessions de service',
    service_checkins: 'Contrôles de service',
    guild_pay_settings: 'Réglages des salaires',
    weekly_payments: 'Salaires hebdomadaires',
    guild_pay_role_settings: 'Taux par rôle',
    weekly_pay_adjustments: 'Ajustements des salaires',
    weekly_payroll_archives: 'Archives des salaires',
    weekly_payment_events: 'Suivi des salaires',
    guild_command_roles: 'Accès aux commandes',
    sentinel_dossier_roles: 'Rôles responsables des tickets',
    moderation_cases: 'Registre de modération',
    message_purge_archives: 'Archives des nettoyages',
    moderation_tempbans: 'Exclusions temporaires',
    guild_automod_settings: 'Réglages de l’auto-modération',
    guild_automod_words: 'Mots surveillés',
    guild_automod_events: 'Interventions automatiques',
    custom_embeds: 'Messages personnalisés',
    sentinel_dossiers: 'Tickets',
    sentinel_dossier_panels: 'Panneaux de tickets',
    sentinel_dossier_type_settings: 'Réglages des tickets',
    sentinel_dossier_templates: 'Réponses préparées',
    sentinel_dossier_type_roles: 'Confidentialité des tickets',
    dashboard_audit_logs: 'Historique du dashboard',
    official_update_deliveries: 'Diffusion des nouveautés',
    guild_warning_escalation_settings: 'Sanctions progressives',
    warning_escalation_events: 'Historique des sanctions progressives',
    scheduled_announcements: 'Annonces programmées',
    guild_report_schedules: 'Rapports programmés',
    moderation_appeals: 'Contestations de sanctions',
    recruitment_forms: 'Formulaires de recrutement',
    recruitment_applications: 'Candidatures',
    team_shifts: 'Planning des équipes',
    team_shift_responses: 'Disponibilités du planning',
    team_absences: 'Absences déclarées',
    community_suggestions: 'Idées communautaires',
    community_suggestion_votes: 'Votes communautaires',
    guild_panel_themes: 'Personnalisation des panneaux',
    profiles: 'Profil Discord',
    serviceTimes: 'Temps de service',
    serviceSessions: 'Sessions de service',
    weeklyPayments: 'Salaires hebdomadaires',
    payAdjustments: 'Ajustements des salaires',
    moderationCases: 'Registre disciplinaire',
    dossiers: 'Tickets',
    appeals: 'Contestations',
    notificationPreferences: 'Préférences de notification',
    recruitmentApplications: 'Candidatures',
    shiftResponses: 'Disponibilités du planning',
    absences: 'Absences déclarées',
    suggestions: 'Idées communautaires',
    suggestionVotes: 'Votes communautaires'
};

const EXPORT_FIELD_LABELS = {
    id: 'N°',
    guild_id: 'Serveur',
    user_id: 'Utilisateur',
    target_user_id: 'Membre concerné',
    moderator_user_id: 'Responsable',
    owner_user_id: 'Demandeur',
    opener_user_id: 'Ouvert par',
    channel_id: 'Salon',
    role_id: 'Rôle',
    created_at: 'Création',
    updated_at: 'Mise à jour',
    closed_at: 'Clôture',
    last_activity_at: 'Dernière activité',
    total_time: 'Temps total',
    start_time: 'Début',
    duration: 'Durée',
    reason: 'Motif',
    status: 'Statut',
    action: 'Action',
    subject: 'Sujet',
    type: 'Type',
    amount: 'Montant',
    paid: 'Salaire versé',
    username: 'Pseudo',
    global_name: 'Nom affiché',
    last_login_at: 'Dernière connexion',
    last_seen_at: 'Dernière présence'
};

function exportLabel(value) {
    return EXPORT_FIELD_LABELS[value]
        || String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function exportValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (Buffer.isBuffer(value)) return `[fichier de ${value.length} octets]`;
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'object') return cleanText(JSON.stringify(value));
    const text = String(value);
    if (text === '0' || text === '1') return text;
    return cleanText(text);
}

function exportSection(key, rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const keys = [...new Set(sourceRows.flatMap(row => Object.keys(row || {})))];
    const columns = keys.map(exportLabel);
    return {
        title: EXPORT_SECTION_LABELS[key] || exportLabel(key),
        description: `${sourceRows.length.toLocaleString('fr-FR')} enregistrement(s)`,
        columns,
        rows: sourceRows.map(row => Object.fromEntries(keys.map((field, index) => [columns[index], exportValue(row[field])])))
    };
}

function jsonExport(document, fileName) {
    return {
        buffer: Buffer.from(JSON.stringify(document, null, 2), 'utf8'),
        fileName,
        contentType: 'application/json; charset=utf-8'
    };
}

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

function createGuildDataExport(guild, format = 'pdf') {
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
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'json') return jsonExport(document, `sentinel-${guild.id}-${date}.json`);
    const populatedTables = Object.entries(tables).filter(([, rows]) => rows.length);
    const summaryRows = Object.entries(tables).map(([key, rows]) => ({
        Catégorie: EXPORT_SECTION_LABELS[key] || exportLabel(key),
        Enregistrements: rows.length.toLocaleString('fr-FR')
    }));
    return {
        buffer: createProfessionalPdf({
            title: 'Rapport des données du serveur',
            subtitle: 'Copie lisible des informations conservées par Noctigarde',
            metadata: [
                { label: 'Serveur', value: guild.name || guild.id },
                { label: 'Identifiant', value: guild.id },
                { label: 'Catégories actives', value: populatedTables.length }
            ],
            sections: [
                {
                    title: 'Synthèse',
                    description: 'Répartition des données par catégorie.',
                    columns: ['Catégorie', 'Enregistrements'],
                    rows: summaryRows
                },
                ...populatedTables.map(([key, rows]) => exportSection(key, rows))
            ],
            confidentiality: 'Copie confidentielle destinée au propriétaire du serveur'
        }),
        fileName: `sentinel-${guild.id}-${date}.pdf`,
        contentType: 'application/pdf'
    };
}

function createMemberDataExport(userId, format = 'pdf') {
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
        notificationPreferences: db.prepare('SELECT * FROM user_notification_preferences WHERE user_id = ?').all(userId),
        recruitmentApplications: db.prepare('SELECT * FROM recruitment_applications WHERE user_id = ?').all(userId),
        shiftResponses: db.prepare('SELECT * FROM team_shift_responses WHERE user_id = ?').all(userId),
        absences: db.prepare('SELECT * FROM team_absences WHERE user_id = ?').all(userId),
        suggestions: db.prepare('SELECT * FROM community_suggestions WHERE user_id = ?').all(userId),
        suggestionVotes: db.prepare('SELECT * FROM community_suggestion_votes WHERE user_id = ?').all(userId)
    };
    const document = {
        format: 'sentinel-member-export-v1',
        exportedAt: new Date().toISOString(),
        userId,
        data: queries
    };
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'json') return jsonExport(document, `sentinel-membre-${userId}-${date}.json`);
    const sections = Object.entries(queries)
        .filter(([, rows]) => rows.length)
        .map(([key, rows]) => exportSection(key, rows));
    const recordCount = Object.values(queries).reduce((total, rows) => total + rows.length, 0);
    return {
        buffer: createProfessionalPdf({
            title: 'Rapport personnel Noctigarde',
            subtitle: 'Copie lisible des informations associées à ton compte',
            metadata: [
                { label: 'Compte Discord', value: userId },
                { label: 'Enregistrements', value: recordCount.toLocaleString('fr-FR') },
                { label: 'Catégories actives', value: sections.length }
            ],
            sections: sections.length ? sections : [{
                title: 'Synthèse',
                description: 'Aucune information personnelle enregistrée.',
                columns: [],
                rows: []
            }],
            confidentiality: 'Copie confidentielle destinée au membre concerné'
        }),
        fileName: `sentinel-membre-${userId}-${date}.pdf`,
        contentType: 'application/pdf'
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

function removeManagedArchiveDirectory(filePath, resolver, rootDirectory) {
    const resolved = resolver(filePath);
    if (!resolved) return false;
    const root = path.resolve(rootDirectory);
    const directory = path.dirname(resolved);
    if (directory === root || !directory.startsWith(`${root}${path.sep}`)) return false;
    fs.rmSync(directory, { recursive: true, force: true });
    return true;
}

function applyGuildDataRetentionPolicies(options = {}) {
    const {
        dossierArchiveDirectory,
        purgeArchiveDirectory,
        resolveDossierArchivePath,
        resolveMessagePurgeArchivePath,
        onError = () => {}
    } = options;
    if (!dossierArchiveDirectory || !purgeArchiveDirectory
        || typeof resolveDossierArchivePath !== 'function'
        || typeof resolveMessagePurgeArchivePath !== 'function') {
        throw new Error('Configuration de rétention incomplète.');
    }

    const settings = db.prepare('SELECT * FROM guild_data_retention_settings').all();
    const summary = { guilds: settings.length, automodEvents: 0, auditLogs: 0, purgeArchives: 0, dossierArchives: 0 };
    const cutoff = days => new Date(Date.now() - Math.max(Number(days) || 30, 30) * 86400000).toISOString();

    for (const setting of settings) {
        summary.automodEvents += db.prepare('DELETE FROM guild_automod_events WHERE guild_id = ? AND created_at < ?')
            .run(setting.guild_id, cutoff(setting.automod_days)).changes;
        summary.auditLogs += db.prepare('DELETE FROM dashboard_audit_logs WHERE guild_id = ? AND created_at < ?')
            .run(setting.guild_id, cutoff(setting.audit_days)).changes;

        const purgeArchives = db.prepare(`
            SELECT id, archive_path FROM message_purge_archives
            WHERE guild_id = ? AND created_at < ?
        `).all(setting.guild_id, cutoff(setting.purge_archive_days));
        for (const archive of purgeArchives) {
            try {
                removeManagedArchiveDirectory(archive.archive_path, resolveMessagePurgeArchivePath, purgeArchiveDirectory);
                summary.purgeArchives += db.prepare('DELETE FROM message_purge_archives WHERE guild_id = ? AND id = ?')
                    .run(setting.guild_id, archive.id).changes;
            } catch (error) {
                onError('retention:purge-archive', error, { guildId: setting.guild_id, archiveId: archive.id });
            }
        }

        const dossierArchives = db.prepare(`
            SELECT id, archive_path FROM sentinel_dossiers
            WHERE guild_id = ? AND archive_path IS NOT NULL AND archived_at < ?
        `).all(setting.guild_id, cutoff(setting.dossier_archive_days));
        for (const dossier of dossierArchives) {
            try {
                removeManagedArchiveDirectory(dossier.archive_path, resolveDossierArchivePath, dossierArchiveDirectory);
                summary.dossierArchives += db.prepare(`
                    UPDATE sentinel_dossiers SET archive_path = NULL, archive_sha256 = NULL,
                        archive_size = NULL WHERE guild_id = ? AND id = ?
                `).run(setting.guild_id, dossier.id).changes;
            } catch (error) {
                onError('retention:dossier-archive', error, { guildId: setting.guild_id, dossierId: dossier.id });
            }
        }
    }
    return summary;
}

module.exports = {
    applyGuildDataRetentionPolicies,
    createGuildDataExport,
    createMemberDataExport,
    createPrivacyRequest,
    getRetentionSettings,
    listPrivacyRequests,
    updateRetentionSettings
};
