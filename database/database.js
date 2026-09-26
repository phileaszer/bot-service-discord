const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { applyPendingDatabaseRestore } = require('./storage');

const databasePath = process.env.DATABASE_PATH || './database/service.db';
const databaseDirectory = path.dirname(databasePath);

if (databaseDirectory && databaseDirectory !== '.') {
    fs.mkdirSync(databaseDirectory, { recursive: true });
}

const pendingRestore = applyPendingDatabaseRestore(databasePath);

if (pendingRestore?.restored) {
    console.log(`Restauration Sentinel appliquee au demarrage : ${pendingRestore.restoredAt}`);
}

const db = new Database(databasePath);
const hasExistingSchema = Boolean(db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    LIMIT 1
`).get());

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -16000');
db.pragma('mmap_size = 67108864');
db.pragma('wal_autocheckpoint = 1000');
db.pragma('journal_size_limit = 8388608');
db.pragma('secure_delete = FAST');

if (!hasExistingSchema) {
    db.pragma('auto_vacuum = INCREMENTAL');
}

db.exec(`
CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    role_id TEXT,
    log_channel_id TEXT,
    status_channel_id TEXT,
    status_updates_enabled INTEGER NOT NULL DEFAULT 0,
    auto_role_id TEXT,
    language TEXT NOT NULL DEFAULT 'fr',
    server_preset TEXT NOT NULL DEFAULT 'standard'
);

CREATE TABLE IF NOT EXISTS service_times (
    guild_id TEXT,
    user_id TEXT,
    total_time INTEGER DEFAULT 0,
    start_time INTEGER,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS service_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    user_id TEXT,
    date TEXT,
    duration INTEGER
);

CREATE TABLE IF NOT EXISTS guild_pay_settings (
    guild_id TEXT PRIMARY KEY,
    hourly_rate REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT '$',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_payments (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    paid INTEGER NOT NULL DEFAULT 0,
    paid_by_user_id TEXT,
    paid_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id, week_start)
);

CREATE TABLE IF NOT EXISTS guild_pay_role_settings (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    hourly_rate REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS weekly_pay_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_payroll_archives (
    guild_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    archived_by_user_id TEXT,
    archived_at TEXT NOT NULL,
    user_count INTEGER NOT NULL DEFAULT 0,
    total_time INTEGER NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    unpaid_amount REAL NOT NULL DEFAULT 0,
    details_json TEXT NOT NULL,
    PRIMARY KEY (guild_id, week_start)
);

CREATE TABLE IF NOT EXISTS weekly_payment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    paid INTEGER NOT NULL,
    changed_by_user_id TEXT,
    changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_command_roles (
    guild_id TEXT,
    role_id TEXT,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS sentinel_premium_guilds (
    guild_id TEXT PRIMARY KEY,
    granted_by_user_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_premium_roles (
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    granted_by_user_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS sentinel_premium_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    granted_by_user_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_roles (
    guild_id TEXT,
    role_id TEXT,
    PRIMARY KEY (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS moderation_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    target_user_id TEXT,
    moderator_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    duration INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_tempbans (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_user_id TEXT NOT NULL,
    reason TEXT,
    duration INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    case_id INTEGER,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS guild_automod_settings (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    forbidden_words_enabled INTEGER NOT NULL DEFAULT 1,
    forbidden_words_action TEXT NOT NULL DEFAULT 'delete',
    invite_filter_enabled INTEGER NOT NULL DEFAULT 0,
    invite_action TEXT NOT NULL DEFAULT 'delete',
    spam_filter_enabled INTEGER NOT NULL DEFAULT 0,
    spam_action TEXT NOT NULL DEFAULT 'timeout',
    spam_max_messages INTEGER NOT NULL DEFAULT 5,
    spam_window_seconds INTEGER NOT NULL DEFAULT 8,
    spam_timeout_seconds INTEGER NOT NULL DEFAULT 600,
    premium_caps_enabled INTEGER NOT NULL DEFAULT 0,
    premium_caps_action TEXT NOT NULL DEFAULT 'delete',
    premium_mentions_enabled INTEGER NOT NULL DEFAULT 0,
    premium_mentions_action TEXT NOT NULL DEFAULT 'timeout',
    premium_mention_limit INTEGER NOT NULL DEFAULT 6,
    premium_progressive_enabled INTEGER NOT NULL DEFAULT 0,
    premium_progressive_window_minutes INTEGER NOT NULL DEFAULT 60,
    premium_progressive_timeout_threshold INTEGER NOT NULL DEFAULT 3,
    premium_progressive_kick_threshold INTEGER NOT NULL DEFAULT 5,
    premium_progressive_ban_threshold INTEGER NOT NULL DEFAULT 7,
    premium_raid_enabled INTEGER NOT NULL DEFAULT 0,
    premium_raid_join_count INTEGER NOT NULL DEFAULT 6,
    premium_raid_window_seconds INTEGER NOT NULL DEFAULT 30,
    premium_ignored_role_ids_json TEXT NOT NULL DEFAULT '[]',
    premium_ignored_channel_ids_json TEXT NOT NULL DEFAULT '[]',
    premium_unlocked_by_user_id TEXT,
    premium_unlocked_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_automod_words (
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL,
    match_mode TEXT NOT NULL DEFAULT 'contains',
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, word)
);

CREATE TABLE IF NOT EXISTS guild_automod_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rule TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    message_id TEXT,
    channel_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_embeds (
    message_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creator_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    footer TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_dossiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    opener_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    subject TEXT,
    description TEXT,
    referent_user_id TEXT,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    closed_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    creator_user_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_type_settings (
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    category_id TEXT,
    questions_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, type)
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    global_name TEXT,
    avatar_url TEXT,
    last_login_at TEXT,
    last_seen_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_site_settings (
    user_id TEXT PRIMARY KEY,
    site_language TEXT NOT NULL DEFAULT 'fr',
    last_guild_id TEXT,
    last_return_url TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_staff_users (
    user_id TEXT PRIMARY KEY,
    granted_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at INTEGER,
    csrf_token TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    guild_name TEXT,
    actor_user_id TEXT NOT NULL,
    actor_username TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    summary TEXT NOT NULL,
    details TEXT,
    source TEXT NOT NULL DEFAULT 'dashboard',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    captured_at TEXT NOT NULL,
    database_bytes INTEGER NOT NULL DEFAULT 0,
    backup_bytes INTEGER NOT NULL DEFAULT 0,
    archive_bytes INTEGER NOT NULL DEFAULT 0,
    media_bytes INTEGER NOT NULL DEFAULT 0,
    volume_used_bytes INTEGER NOT NULL DEFAULT 0,
    volume_total_bytes INTEGER NOT NULL DEFAULT 0,
    usage_percent REAL NOT NULL DEFAULT 0,
    database_growth_bytes INTEGER NOT NULL DEFAULT 0,
    alert_level INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS storage_table_metrics (
    captured_at TEXT NOT NULL,
    category TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (captured_at, category)
);

CREATE TABLE IF NOT EXISTS storage_alerts (
    alert_key TEXT PRIMARY KEY,
    level INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_notified_at TEXT,
    resolved_at TEXT,
    details_json TEXT
);

CREATE TABLE IF NOT EXISTS storage_backup_checks (
    file_name TEXT PRIMARY KEY,
    checked_at TEXT NOT NULL,
    status TEXT NOT NULL,
    integrity_result TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS cold_archive_manifests (
    file_name TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    min_row_id INTEGER,
    max_row_id INTEGER,
    row_count INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    from_at TEXT,
    to_at TEXT,
    created_at TEXT NOT NULL,
    verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS embed_media_objects (
    content_hash TEXT PRIMARY KEY,
    file_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_provider TEXT NOT NULL DEFAULT 'local',
    storage_bucket TEXT,
    storage_key TEXT,
    public_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS embed_media_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_hash TEXT,
    guild_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    slot TEXT NOT NULL,
    attachment_name TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    trashed_at TEXT,
    purge_after TEXT,
    UNIQUE (message_id, slot),
    FOREIGN KEY (content_hash) REFERENCES embed_media_objects(content_hash) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_times_guild_start
ON service_times (guild_id, start_time);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_date
ON service_sessions (guild_id, date);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_user_date
ON service_sessions (guild_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_weekly_payments_guild_week
ON weekly_payments (guild_id, week_start);

CREATE INDEX IF NOT EXISTS idx_weekly_payments_user_week
ON weekly_payments (guild_id, user_id, week_start);

CREATE INDEX IF NOT EXISTS idx_pay_role_settings_guild
ON guild_pay_role_settings (guild_id);

CREATE INDEX IF NOT EXISTS idx_weekly_pay_adjustments_guild_week
ON weekly_pay_adjustments (guild_id, week_start);

CREATE INDEX IF NOT EXISTS idx_weekly_pay_adjustments_user_week
ON weekly_pay_adjustments (guild_id, user_id, week_start);

CREATE INDEX IF NOT EXISTS idx_weekly_payroll_archives_guild_week
ON weekly_payroll_archives (guild_id, week_start);

CREATE INDEX IF NOT EXISTS idx_weekly_payment_events_guild_week
ON weekly_payment_events (guild_id, week_start, changed_at);

CREATE INDEX IF NOT EXISTS idx_weekly_payment_events_user_week
ON weekly_payment_events (guild_id, user_id, week_start, changed_at);

CREATE INDEX IF NOT EXISTS idx_guild_command_roles_guild
ON guild_command_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_sentinel_premium_roles_guild
ON sentinel_premium_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_sentinel_premium_users_guild
ON sentinel_premium_users (guild_id);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_roles_guild
ON sentinel_dossier_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target
ON moderation_cases (guild_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created
ON moderation_cases (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_tempbans_expires
ON moderation_tempbans (expires_at);

CREATE INDEX IF NOT EXISTS idx_guild_automod_words_guild
ON guild_automod_words (guild_id);

CREATE INDEX IF NOT EXISTS idx_guild_automod_events_guild_created
ON guild_automod_events (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_guild_automod_events_guild_user_created
ON guild_automod_events (guild_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_custom_embeds_guild
ON custom_embeds (guild_id);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossiers_guild_status
ON sentinel_dossiers (guild_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossiers_owner
ON sentinel_dossiers (guild_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossiers_type_status
ON sentinel_dossiers (guild_id, type, status, created_at);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossiers_referent
ON sentinel_dossiers (guild_id, referent_user_id, status);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_panels_guild
ON sentinel_dossier_panels (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_templates_guild
ON sentinel_dossier_templates (guild_id, name);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_user
ON dashboard_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires
ON dashboard_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_site_staff_created
ON site_staff_users (created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_guild_created
ON dashboard_audit_logs (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_actor_created
ON dashboard_audit_logs (actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_target_created
ON dashboard_audit_logs (target_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_action_created
ON dashboard_audit_logs (action, created_at);

CREATE INDEX IF NOT EXISTS idx_storage_metrics_captured
ON storage_metrics (captured_at);

CREATE INDEX IF NOT EXISTS idx_storage_metrics_usage
ON storage_metrics (usage_percent, captured_at);

CREATE INDEX IF NOT EXISTS idx_storage_table_metrics_category
ON storage_table_metrics (category, captured_at);

CREATE INDEX IF NOT EXISTS idx_backup_checks_checked
ON storage_backup_checks (checked_at);

CREATE INDEX IF NOT EXISTS idx_cold_archives_table_created
ON cold_archive_manifests (table_name, created_at);

CREATE INDEX IF NOT EXISTS idx_embed_media_links_status_purge
ON embed_media_links (status, purge_after);

CREATE INDEX IF NOT EXISTS idx_embed_media_links_message
ON embed_media_links (guild_id, message_id);

CREATE INDEX IF NOT EXISTS idx_embed_media_links_hash
ON embed_media_links (content_hash, status);
`);

const guildConfigColumns = db.prepare('PRAGMA table_info(guild_configs)').all()
    .map(column => column.name);

if (!guildConfigColumns.includes('language')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'").run();
}

if (!guildConfigColumns.includes('auto_role_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN auto_role_id TEXT').run();
}

if (!guildConfigColumns.includes('status_channel_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN status_channel_id TEXT').run();
}

if (!guildConfigColumns.includes('status_updates_enabled')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN status_updates_enabled INTEGER NOT NULL DEFAULT 0').run();
}

if (!guildConfigColumns.includes('server_preset')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN server_preset TEXT NOT NULL DEFAULT 'standard'").run();
}

const dashboardSessionColumns = db.prepare('PRAGMA table_info(dashboard_sessions)').all()
    .map(column => column.name);

if (!dashboardSessionColumns.includes('ip_hash')) {
    db.prepare('ALTER TABLE dashboard_sessions ADD COLUMN ip_hash TEXT').run();
}

if (!dashboardSessionColumns.includes('user_agent')) {
    db.prepare('ALTER TABLE dashboard_sessions ADD COLUMN user_agent TEXT').run();
}

if (!dashboardSessionColumns.includes('csrf_token')) {
    db.prepare('ALTER TABLE dashboard_sessions ADD COLUMN csrf_token TEXT').run();
}

const automodSettingsColumns = db.prepare('PRAGMA table_info(guild_automod_settings)').all()
    .map(column => column.name);

if (!automodSettingsColumns.includes('premium_unlocked_by_user_id')) {
    db.prepare('ALTER TABLE guild_automod_settings ADD COLUMN premium_unlocked_by_user_id TEXT').run();
}

if (!automodSettingsColumns.includes('premium_unlocked_at')) {
    db.prepare('ALTER TABLE guild_automod_settings ADD COLUMN premium_unlocked_at TEXT').run();
}

const dossierColumns = db.prepare('PRAGMA table_info(sentinel_dossiers)').all()
    .map(column => column.name);

if (!dossierColumns.includes('priority')) {
    db.prepare("ALTER TABLE sentinel_dossiers ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'").run();
}

if (!dossierColumns.includes('subject')) {
    db.prepare('ALTER TABLE sentinel_dossiers ADD COLUMN subject TEXT').run();
}

if (!dossierColumns.includes('description')) {
    db.prepare('ALTER TABLE sentinel_dossiers ADD COLUMN description TEXT').run();
}

const embedMediaObjectColumns = db.prepare('PRAGMA table_info(embed_media_objects)').all()
    .map(column => column.name);

if (!embedMediaObjectColumns.includes('storage_provider')) {
    db.prepare("ALTER TABLE embed_media_objects ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'local'").run();
}

if (!embedMediaObjectColumns.includes('storage_key')) {
    db.prepare('ALTER TABLE embed_media_objects ADD COLUMN storage_key TEXT').run();
}

if (!embedMediaObjectColumns.includes('storage_bucket')) {
    db.prepare('ALTER TABLE embed_media_objects ADD COLUMN storage_bucket TEXT').run();
}

if (!embedMediaObjectColumns.includes('public_url')) {
    db.prepare('ALTER TABLE embed_media_objects ADD COLUMN public_url TEXT').run();
}

const databasePerformance = {
    startedAt: new Date().toISOString(),
    queryCount: 0,
    errorCount: 0,
    slowQueryCount: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    recentSlowQueries: []
};
const slowQueryThresholdMs = Math.min(Math.max(
    Number.parseInt(process.env.DATABASE_SLOW_QUERY_MS || '80', 10),
    10
), 5000);
const nativePrepare = db.prepare.bind(db);

function databaseQueryLabel(sql) {
    return String(sql || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/'(?:''|[^'])*'/g, '?')
        .replace(/\b\d{8,}\b/g, ':number')
        .replace(/\b(VALUES|IN)\s*\([^)]{80,}\)/gi, '$1 (...)')
        .slice(0, 220);
}

function recordDatabaseQuery(sql, method, startedAt, failed) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    databasePerformance.queryCount += 1;
    databasePerformance.totalDurationMs += durationMs;
    databasePerformance.maxDurationMs = Math.max(databasePerformance.maxDurationMs, durationMs);

    if (failed) {
        databasePerformance.errorCount += 1;
    }

    if (durationMs >= slowQueryThresholdMs) {
        databasePerformance.slowQueryCount += 1;
        databasePerformance.recentSlowQueries.unshift({
            operation: method,
            query: databaseQueryLabel(sql),
            durationMs: Math.round(durationMs * 10) / 10,
            failed: Boolean(failed),
            occurredAt: new Date().toISOString()
        });
        databasePerformance.recentSlowQueries.length = Math.min(
            databasePerformance.recentSlowQueries.length,
            25
        );
    }
}

db.prepare = function monitoredPrepare(sql) {
    const statement = nativePrepare(sql);

    return new Proxy(statement, {
        get(target, property) {
            const value = Reflect.get(target, property, target);

            if (!['run', 'get', 'all'].includes(property) || typeof value !== 'function') {
                return typeof value === 'function' ? value.bind(target) : value;
            }

            return (...args) => {
                const startedAt = process.hrtime.bigint();

                try {
                    const result = value.apply(target, args);
                    recordDatabaseQuery(sql, property, startedAt, false);
                    return result;
                } catch (error) {
                    recordDatabaseQuery(sql, property, startedAt, true);
                    throw error;
                }
            };
        }
    });
};

db.getSentinelPerformance = () => ({
    ...databasePerformance,
    averageDurationMs: databasePerformance.queryCount
        ? Math.round((databasePerformance.totalDurationMs / databasePerformance.queryCount) * 100) / 100
        : 0,
    totalDurationMs: Math.round(databasePerformance.totalDurationMs * 100) / 100,
    maxDurationMs: Math.round(databasePerformance.maxDurationMs * 100) / 100,
    slowQueryThresholdMs,
    recentSlowQueries: databasePerformance.recentSlowQueries.map(item => ({ ...item }))
});

module.exports = db;
