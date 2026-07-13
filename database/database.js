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
    language TEXT NOT NULL DEFAULT 'fr'
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

CREATE TABLE IF NOT EXISTS guild_command_roles (
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

CREATE INDEX IF NOT EXISTS idx_service_times_guild_start
ON service_times (guild_id, start_time);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_date
ON service_sessions (guild_id, date);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_user_date
ON service_sessions (guild_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_guild_command_roles_guild
ON guild_command_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target
ON moderation_cases (guild_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created
ON moderation_cases (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_tempbans_expires
ON moderation_tempbans (expires_at);

CREATE INDEX IF NOT EXISTS idx_custom_embeds_guild
ON custom_embeds (guild_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_user
ON dashboard_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_sessions_expires
ON dashboard_sessions (expires_at);
`);

const guildConfigColumns = db.prepare('PRAGMA table_info(guild_configs)').all()
    .map(column => column.name);

if (!guildConfigColumns.includes('language')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'").run();
}

const dashboardSessionColumns = db.prepare('PRAGMA table_info(dashboard_sessions)').all()
    .map(column => column.name);

if (!dashboardSessionColumns.includes('ip_hash')) {
    db.prepare('ALTER TABLE dashboard_sessions ADD COLUMN ip_hash TEXT').run();
}

if (!dashboardSessionColumns.includes('user_agent')) {
    db.prepare('ALTER TABLE dashboard_sessions ADD COLUMN user_agent TEXT').run();
}

module.exports = db;
