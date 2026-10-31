'use strict';

const db = require('./database/database');

const FEATURE_DEFINITIONS = Object.freeze([
    { key: 'automod', label: 'Auto-modération', description: 'Analyse des messages et protection anti-raid.' },
    { key: 'message-purge', label: 'Purge des messages', description: 'Archivage et suppression de messages Discord.' },
    { key: 'scheduled-announcements', label: 'Annonces programmées', description: 'Envoi des annonces planifiées et récurrentes.' },
    { key: 'scheduled-reports', label: 'Rapports automatiques', description: 'Création et envoi des rapports planifiés.' },
    { key: 'member-digests', label: 'Résumés personnels', description: 'Envoi des récapitulatifs privés aux membres.' },
    { key: 'planning-reminders', label: 'Rappels de planning', description: 'Rappels privés et publics avant un créneau.' },
    { key: 'long-service-alerts', label: 'Services trop longs', description: 'Confirmation et clôture automatique des services.' },
    { key: 'ticket-maintenance', label: 'Suivi des tickets', description: 'Rappels de délai et suppression différée des tickets.' },
    { key: 'official-updates', label: 'Nouveautés officielles', description: 'Distribution et nouvelles tentatives des annonces Noctigarde.' },
    { key: 'status-panels', label: 'Panneaux de statut', description: 'Actualisation automatique des panneaux techniques.' },
    { key: 'repair-scan', label: 'Réparation automatique', description: 'Contrôle quotidien des rôles, salons et références.' }
]);

const FEATURE_KEYS = new Set(FEATURE_DEFINITIONS.map(item => item.key));

function nowIso() {
    return new Date().toISOString();
}

function normalizeKey(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!FEATURE_KEYS.has(key)) throw new Error('Fonction Noctigarde inconnue.');
    return key;
}

function getStoredFlags() {
    return new Map(db.prepare(`
        SELECT feature_key, enabled, reason, updated_by_user_id, updated_at
        FROM system_feature_flags
    `).all().map(row => [row.feature_key, row]));
}

function listFeatureFlags() {
    const stored = getStoredFlags();
    return FEATURE_DEFINITIONS.map(definition => {
        const row = stored.get(definition.key);
        return {
            ...definition,
            enabled: row ? Boolean(row.enabled) : true,
            reason: row?.reason || null,
            updatedByUserId: row?.updated_by_user_id || null,
            updatedAt: row?.updated_at || null
        };
    });
}

function getFeatureFlag(featureKey) {
    const key = normalizeKey(featureKey);
    return listFeatureFlags().find(item => item.key === key);
}

function isFeatureEnabled(featureKey) {
    const key = normalizeKey(featureKey);
    const row = db.prepare('SELECT enabled FROM system_feature_flags WHERE feature_key = ?').get(key);
    return row ? Boolean(row.enabled) : true;
}

function updateFeatureFlag(featureKey, enabled, actorUserId, reason = null) {
    const key = normalizeKey(featureKey);
    const cleanReason = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 500) || null;
    const timestamp = nowIso();
    db.prepare(`
        INSERT INTO system_feature_flags (
            feature_key, enabled, reason, updated_by_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(feature_key) DO UPDATE SET
            enabled = excluded.enabled,
            reason = excluded.reason,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
    `).run(key, enabled ? 1 : 0, cleanReason, String(actorUserId || '') || null, timestamp);
    return getFeatureFlag(key);
}

function disabledMessage(featureKey, language = 'fr') {
    const flag = getFeatureFlag(featureKey);
    const reason = flag.reason ? ` ${flag.reason}` : '';
    return language === 'en'
        ? `This Noctigarde feature is temporarily paused.${reason}`
        : `Cette fonction Noctigarde est temporairement suspendue.${reason}`;
}

module.exports = {
    FEATURE_DEFINITIONS,
    disabledMessage,
    getFeatureFlag,
    isFeatureEnabled,
    listFeatureFlags,
    updateFeatureFlag
};
