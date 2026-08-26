const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databasePath = process.env.DATABASE_PATH || './database/service.db';
const databaseDirectory = path.dirname(databasePath);

if (databaseDirectory && databaseDirectory !== '.') {
    fs.mkdirSync(databaseDirectory, { recursive: true });
}

const db = new Database(databasePath);

db.exec(`
CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    role_id TEXT,
    log_channel_id TEXT,
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

CREATE TABLE IF NOT EXISTS guild_command_roles (
    guild_id TEXT,
    role_id TEXT,
    PRIMARY KEY (guild_id, role_id)
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

CREATE TABLE IF NOT EXISTS dashboard_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_guild_command_roles_guild
ON guild_command_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_roles_guild
ON sentinel_dossier_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target
ON moderation_cases (guild_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created
ON moderation_cases (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_tempbans_expires
ON moderation_tempbans (expires_at);

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

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_guild_created
ON dashboard_audit_logs (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_actor_created
ON dashboard_audit_logs (actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_target_created
ON dashboard_audit_logs (target_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_audit_action_created
ON dashboard_audit_logs (action, created_at);
`);

const guildConfigColumns = db.prepare('PRAGMA table_info(guild_configs)').all()
    .map(column => column.name);

if (!guildConfigColumns.includes('language')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'").run();
}

if (!guildConfigColumns.includes('auto_role_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN auto_role_id TEXT').run();
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

module.exports = db;
