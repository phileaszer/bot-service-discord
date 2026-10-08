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
    updates_channel_id TEXT,
    updates_ping_role_id TEXT,
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

CREATE TABLE IF NOT EXISTS service_checkins (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sending',
    response TEXT,
    prompt_count INTEGER NOT NULL DEFAULT 1,
    dm_message_id TEXT,
    prompted_at TEXT,
    responded_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id, start_time)
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

CREATE TABLE IF NOT EXISTS message_purge_archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    requested_count INTEGER,
    archive_path TEXT NOT NULL UNIQUE,
    archive_sha256 TEXT NOT NULL,
    archive_size INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    embed_count INTEGER NOT NULL DEFAULT 0,
    deleted_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    has_remaining INTEGER NOT NULL DEFAULT 0,
    replacement_channel_id TEXT,
    replacement_channel_name TEXT,
    status TEXT NOT NULL DEFAULT 'archived',
    created_at TEXT NOT NULL,
    completed_at TEXT
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
    form_answers_json TEXT,
    referent_user_id TEXT,
    created_at TEXT NOT NULL,
    closed_at TEXT,
    closed_by_user_id TEXT,
    close_reason TEXT,
    resolution_summary TEXT,
    archive_path TEXT,
    archive_sha256 TEXT,
    archive_size INTEGER,
    archived_at TEXT,
    archive_message_count INTEGER NOT NULL DEFAULT 0,
    archive_attachment_count INTEGER NOT NULL DEFAULT 0,
    archive_embed_count INTEGER NOT NULL DEFAULT 0,
    first_staff_response_at TEXT,
    last_staff_reply_at TEXT,
    last_requester_reply_at TEXT,
    last_activity_at TEXT,
    deletion_scheduled_at TEXT,
    reopen_until TEXT,
    reopened_count INTEGER NOT NULL DEFAULT 0,
    last_reminder_at TEXT
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
    sla_first_response_minutes INTEGER,
    sla_resolution_minutes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, type)
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT,
    kind TEXT NOT NULL DEFAULT 'reply',
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_dossier_type_roles (
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, type, role_id)
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

CREATE TABLE IF NOT EXISTS official_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key TEXT UNIQUE,
    title_fr TEXT NOT NULL,
    body_fr TEXT NOT NULL,
    title_en TEXT,
    body_en TEXT,
    source TEXT,
    created_by_user_id TEXT,
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS official_update_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    update_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'fr',
    ping_role_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    message_id TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT,
    delivered_at TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE(update_id, guild_id, channel_id),
    FOREIGN KEY (update_id) REFERENCES official_updates(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS guild_warning_escalation_settings (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    window_days INTEGER NOT NULL DEFAULT 30,
    timeout_threshold INTEGER NOT NULL DEFAULT 3,
    timeout_seconds INTEGER NOT NULL DEFAULT 3600,
    kick_threshold INTEGER NOT NULL DEFAULT 5,
    ban_threshold INTEGER NOT NULL DEFAULT 7,
    ignored_role_ids_json TEXT NOT NULL DEFAULT '[]',
    updated_by_user_id TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warning_escalation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    warning_case_id INTEGER,
    warning_count INTEGER NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_notification_states (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    notification_key TEXT NOT NULL,
    read_at TEXT,
    dismissed_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id, notification_key)
);

CREATE TABLE IF NOT EXISTS scheduled_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    color TEXT,
    recurrence TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'draft',
    next_run_at TEXT,
    last_run_at TEXT,
    last_message_id TEXT,
    last_error TEXT,
    approved_by_user_id TEXT,
    approved_at TEXT,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_report_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    report_kind TEXT NOT NULL,
    frequency TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'csv',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_by_user_id TEXT,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    last_message_id TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (guild_id, report_kind, frequency)
);

CREATE TABLE IF NOT EXISTS user_notification_preferences (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    service_enabled INTEGER NOT NULL DEFAULT 1,
    payroll_enabled INTEGER NOT NULL DEFAULT 1,
    dossier_enabled INTEGER NOT NULL DEFAULT 1,
    moderation_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS simulation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    actor_user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    input_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sentinel_validation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    checks_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS founder_mfa (
    user_id TEXT PRIMARY KEY,
    secret_encrypted TEXT,
    pending_secret_encrypted TEXT,
    recovery_code_hashes_json TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 0,
    last_counter INTEGER,
    enabled_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS critical_action_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    guild_id TEXT,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by_user_id TEXT NOT NULL,
    approved_by_user_id TEXT,
    rejected_by_user_id TEXT,
    decision_reason TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    executed_at TEXT,
    error_message TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_notification_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    frequency TEXT NOT NULL,
    status TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    message_id TEXT,
    error_message TEXT,
    attempted_at TEXT NOT NULL,
    delivered_at TEXT,
    UNIQUE (guild_id, user_id, period_key)
);

CREATE TABLE IF NOT EXISTS scheduled_job_leases (
    job_key TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    leased_until INTEGER NOT NULL,
    last_started_at TEXT NOT NULL,
    last_finished_at TEXT,
    last_status TEXT NOT NULL DEFAULT 'running',
    last_error TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_job_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    item_key TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'claimed',
    result_json TEXT,
    error_message TEXT,
    claimed_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE (job_type, item_key, scheduled_for)
);

CREATE TABLE IF NOT EXISTS runtime_incidents (
    incident_id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    context_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS guild_repair_reports (
    guild_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    issues_json TEXT NOT NULL DEFAULT '[]',
    repairs_json TEXT NOT NULL DEFAULT '[]',
    scanned_by_user_id TEXT,
    scanned_at TEXT NOT NULL,
    repaired_at TEXT
);

CREATE TABLE IF NOT EXISTS guild_data_retention_settings (
    guild_id TEXT PRIMARY KEY,
    automod_days INTEGER NOT NULL DEFAULT 365,
    audit_days INTEGER NOT NULL DEFAULT 365,
    purge_archive_days INTEGER NOT NULL DEFAULT 365,
    dossier_archive_days INTEGER NOT NULL DEFAULT 365,
    updated_by_user_id TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_privacy_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_key TEXT NOT NULL UNIQUE,
    request_type TEXT NOT NULL,
    guild_id TEXT,
    subject_user_id TEXT,
    requested_by_user_id TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_note TEXT,
    reviewed_by_user_id TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS moderation_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    case_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    statement TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decision TEXT,
    decided_by_user_id TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    UNIQUE (guild_id, case_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_service_times_guild_start
ON service_times (guild_id, start_time);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_date
ON service_sessions (guild_id, date);

CREATE INDEX IF NOT EXISTS idx_service_sessions_guild_user_date
ON service_sessions (guild_id, user_id, date);

CREATE INDEX IF NOT EXISTS idx_service_checkins_status_updated
ON service_checkins (status, updated_at);

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

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_roles_guild
ON sentinel_dossier_roles (guild_id);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_target
ON moderation_cases (guild_id, target_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_guild_created
ON moderation_cases (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_message_purge_archives_guild_created
ON message_purge_archives (guild_id, created_at);

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

CREATE INDEX IF NOT EXISTS idx_sentinel_dossier_type_roles_guild_type
ON sentinel_dossier_type_roles (guild_id, type);

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

CREATE INDEX IF NOT EXISTS idx_official_updates_published
ON official_updates (is_public, published_at);

CREATE INDEX IF NOT EXISTS idx_official_deliveries_guild_updated
ON official_update_deliveries (guild_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_official_deliveries_retry
ON official_update_deliveries (status, next_attempt_at);

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

CREATE INDEX IF NOT EXISTS idx_warning_escalation_events_guild_user
ON warning_escalation_events (guild_id, user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dashboard_notifications_user
ON dashboard_notification_states (guild_id, user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_announcements_due
ON scheduled_announcements (status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_announcements_guild
ON scheduled_announcements (guild_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_report_schedules_due
ON guild_report_schedules (enabled, next_run_at);

CREATE INDEX IF NOT EXISTS idx_report_schedules_guild
ON guild_report_schedules (guild_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_simulation_runs_guild
ON simulation_runs (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_validation_runs_guild
ON sentinel_validation_runs (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_critical_actions_scope_status
ON critical_action_requests (scope, guild_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_member_notification_deliveries_user
ON member_notification_deliveries (guild_id, user_id, attempted_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_executions_status
ON scheduled_job_executions (job_type, status, claimed_at);

CREATE INDEX IF NOT EXISTS idx_runtime_incidents_status_seen
ON runtime_incidents (status, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_created
ON data_privacy_requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_guild
ON data_privacy_requests (guild_id, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_guild_status
ON moderation_appeals (guild_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals_user
ON moderation_appeals (user_id, created_at);

`);

const guildConfigColumns = db.prepare('PRAGMA table_info(guild_configs)').all()
    .map(column => column.name);

const messagePurgeArchiveColumns = db.prepare('PRAGMA table_info(message_purge_archives)').all()
    .map(column => column.name);

if (!messagePurgeArchiveColumns.includes('replacement_channel_id')) {
    db.prepare('ALTER TABLE message_purge_archives ADD COLUMN replacement_channel_id TEXT').run();
}

if (!messagePurgeArchiveColumns.includes('replacement_channel_name')) {
    db.prepare('ALTER TABLE message_purge_archives ADD COLUMN replacement_channel_name TEXT').run();
}

if (!guildConfigColumns.includes('language')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN language TEXT NOT NULL DEFAULT 'fr'").run();
}

if (!guildConfigColumns.includes('auto_role_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN auto_role_id TEXT').run();
}

if (!guildConfigColumns.includes('status_channel_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN status_channel_id TEXT').run();
}

if (!guildConfigColumns.includes('updates_channel_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN updates_channel_id TEXT').run();
}

if (!guildConfigColumns.includes('updates_ping_role_id')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN updates_ping_role_id TEXT').run();
}

if (!guildConfigColumns.includes('status_updates_enabled')) {
    db.prepare('ALTER TABLE guild_configs ADD COLUMN status_updates_enabled INTEGER NOT NULL DEFAULT 0').run();
}

if (!guildConfigColumns.includes('server_preset')) {
    db.prepare("ALTER TABLE guild_configs ADD COLUMN server_preset TEXT NOT NULL DEFAULT 'standard'").run();
}

db.prepare(`
    UPDATE guild_configs
    SET updates_channel_id = status_channel_id
    WHERE updates_channel_id IS NULL
      AND status_updates_enabled = 1
      AND status_channel_id IS NOT NULL
`).run();

db.prepare(`
    INSERT OR IGNORE INTO official_updates (
        public_key,
        title_fr,
        body_fr,
        title_en,
        body_en,
        source,
        created_by_user_id,
        is_public,
        created_at,
        published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
`).run(
    'sentinel-major-update-2026-10-02',
    'Sentinel | Mise à jour majeure',
    [
        'Le dashboard est plus rapide, plus clair et mieux adapté aux appareils mobiles.',
        'Toutes les fonctions Sentinel sont accessibles à chaque serveur depuis une interface unique.',
        'Le service, la paie RP, les dossiers privés et le Centre de sûreté disposent de nouveaux outils de suivi.',
        'Les images peuvent être importées directement depuis un ordinateur pour les annonces Discord.',
        'Chaque serveur peut désormais recevoir les annonces officielles Sentinel dans un salon séparé du statut technique.',
        'Le salon peut être testé depuis le dashboard, prévenir un rôle choisi et afficher le suivi des livraisons.',
        'Les annonces manquées sont retentées automatiquement et restent consultables sur la nouvelle page publique Nouveautés.'
    ].join('\n'),
    'Sentinel | Major update',
    [
        'The dashboard is faster, clearer, and better suited to mobile devices.',
        'Every Sentinel feature is available to every server from one unified interface.',
        'Duty tracking, RP payroll, private cases, and the Safety Center now provide improved follow-up tools.',
        'Images can be uploaded directly from a computer for Discord announcements.',
        'Every server can now receive official Sentinel announcements in a channel separate from technical status.',
        'The channel can be tested from the dashboard, notify a selected role, and display delivery tracking.',
        'Missed announcements are retried automatically and remain available on the new public Updates page.'
    ].join('\n'),
    'mise à jour officielle',
    '2026-10-02T00:00:00.000Z',
    '2026-10-02T00:00:00.000Z'
);

db.prepare(`
    UPDATE official_updates
    SET body_fr = ?, body_en = ?
    WHERE public_key = 'sentinel-major-update-2026-10-02'
`).run(
    [
        'Le dashboard est plus rapide, plus clair et mieux adapté aux appareils mobiles.',
        'Toutes les fonctions Sentinel sont accessibles à chaque serveur depuis une interface unique.',
        'Le service, la paie RP, les dossiers privés et le Centre de sûreté disposent de nouveaux outils de suivi.',
        'Les images peuvent être importées directement depuis un ordinateur pour les annonces Discord.',
        'Chaque serveur peut désormais recevoir les annonces officielles Sentinel dans un salon séparé du statut technique.',
        'Le salon peut être testé depuis le dashboard, prévenir un rôle choisi et afficher le suivi des livraisons.',
        'Les annonces manquées sont retentées automatiquement et restent consultables sur la nouvelle page publique Nouveautés.'
    ].join('\n'),
    [
        'The dashboard is faster, clearer, and better suited to mobile devices.',
        'Every Sentinel feature is available to every server from one unified interface.',
        'Duty tracking, RP payroll, private cases, and the Safety Center now provide improved follow-up tools.',
        'Images can be uploaded directly from a computer for Discord announcements.',
        'Every server can now receive official Sentinel announcements in a channel separate from technical status.',
        'The channel can be tested from the dashboard, notify a selected role, and display delivery tracking.',
        'Missed announcements are retried automatically and remain available on the new public Updates page.'
    ].join('\n')
);

db.prepare(`
    INSERT OR IGNORE INTO official_updates (
        public_key,
        title_fr,
        body_fr,
        title_en,
        body_en,
        source,
        created_by_user_id,
        is_public,
        created_at,
        published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
`).run(
    'sentinel-public-demo-2026-10-07',
    'Sentinel | Version de démonstration',
    [
        'La version actuelle de Sentinel est une démonstration publique : toutes ses fonctions sont accessibles sans paiement pendant cette phase.',
        'Elle sert à tester le service en conditions réelles, corriger les problèmes et préparer la suite.',
        'À l’avenir, seules certaines options avancées pourront devenir payantes. Une partie gratuite de Sentinel restera disponible.',
        'Aucun abonnement, prélèvement ou achat n’est actif aujourd’hui. Les fonctions concernées, les tarifs et les conditions seront annoncés clairement avant tout changement.'
    ].join('\n'),
    'Sentinel | Demonstration version',
    [
        'The current Sentinel release is a public demonstration: every feature is available at no cost during this phase.',
        'It is used to test the service in real conditions, fix issues, and prepare what comes next.',
        'Only some advanced features may become paid later. A free part of Sentinel will remain available.',
        'No subscription, charge, or purchase is active today. The affected features, pricing, and terms will be announced clearly before any change.'
    ].join('\n'),
    'information officielle',
    '2026-10-07T00:00:00.000Z',
    '2026-10-07T00:00:00.000Z'
);

db.prepare(`
    UPDATE official_updates
    SET body_fr = ?, body_en = ?
    WHERE public_key = ?
`).run(
    [
        'La version actuelle de Sentinel est une démonstration publique : toutes ses fonctions sont accessibles sans paiement pendant cette phase.',
        'Elle sert à tester le service en conditions réelles, corriger les problèmes et préparer la suite.',
        'À l’avenir, seules certaines options avancées pourront devenir payantes. Une partie gratuite de Sentinel restera disponible.',
        'Aucun abonnement, prélèvement ou achat n’est actif aujourd’hui. Les fonctions concernées, les tarifs et les conditions seront annoncés clairement avant tout changement.'
    ].join('\n'),
    [
        'The current Sentinel release is a public demonstration: every feature is available at no cost during this phase.',
        'It is used to test the service in real conditions, fix issues, and prepare what comes next.',
        'Only some advanced features may become paid later. A free part of Sentinel will remain available.',
        'No subscription, charge, or purchase is active today. The affected features, pricing, and terms will be announced clearly before any change.'
    ].join('\n'),
    'sentinel-public-demo-2026-10-07'
);

db.prepare(`
    INSERT OR IGNORE INTO official_updates (
        public_key,
        title_fr,
        body_fr,
        title_en,
        body_en,
        source,
        created_by_user_id,
        is_public,
        created_at,
        published_at
    )
    VALUES (?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
`).run(
    'sentinel-public-demo-scope-2026-10-07',
    'Sentinel | Précision sur la démonstration',
    [
        'Sentinel n’a pas vocation à devenir entièrement payant.',
        'À l’avenir, seules certaines options avancées pourront devenir payantes. Le site et les fonctions essentielles conserveront une partie accessible gratuitement.',
        'Aucun abonnement ni prélèvement n’est actif aujourd’hui. Les fonctions concernées et leurs conditions seront annoncées avant tout changement.'
    ].join('\n'),
    'Sentinel | Demonstration clarification',
    [
        'Sentinel is not intended to become entirely paid.',
        'Only some advanced features may become paid later. The website and essential features will keep a part available at no cost.',
        'No subscription or charge is active today. The affected features and their terms will be announced before any change.'
    ].join('\n'),
    'information officielle',
    '2026-10-07T11:25:00.000Z',
    '2026-10-07T11:25:00.000Z'
);

const dashboardSessionColumns = db.prepare('PRAGMA table_info(dashboard_sessions)').all()
    .map(column => column.name);

const scheduledAnnouncementColumns = db.prepare('PRAGMA table_info(scheduled_announcements)').all()
    .map(column => column.name);

if (!scheduledAnnouncementColumns.includes('approved_by_user_id')) {
    db.prepare('ALTER TABLE scheduled_announcements ADD COLUMN approved_by_user_id TEXT').run();
}

if (!scheduledAnnouncementColumns.includes('approved_at')) {
    db.prepare('ALTER TABLE scheduled_announcements ADD COLUMN approved_at TEXT').run();
}

const userNotificationPreferenceColumns = db.prepare('PRAGMA table_info(user_notification_preferences)').all()
    .map(column => column.name);

if (!userNotificationPreferenceColumns.includes('digest_frequency')) {
    db.prepare("ALTER TABLE user_notification_preferences ADD COLUMN digest_frequency TEXT NOT NULL DEFAULT 'none'").run();
}

if (!userNotificationPreferenceColumns.includes('next_digest_at')) {
    db.prepare('ALTER TABLE user_notification_preferences ADD COLUMN next_digest_at TEXT').run();
}

if (!userNotificationPreferenceColumns.includes('last_digest_at')) {
    db.prepare('ALTER TABLE user_notification_preferences ADD COLUMN last_digest_at TEXT').run();
}

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

const dossierColumnMigrations = [
    ['form_answers_json', 'TEXT'],
    ['close_reason', 'TEXT'],
    ['resolution_summary', 'TEXT'],
    ['archive_path', 'TEXT'],
    ['archive_sha256', 'TEXT'],
    ['archive_size', 'INTEGER'],
    ['archived_at', 'TEXT'],
    ['archive_message_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['archive_attachment_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['archive_embed_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['first_staff_response_at', 'TEXT'],
    ['last_staff_reply_at', 'TEXT'],
    ['last_requester_reply_at', 'TEXT'],
    ['last_activity_at', 'TEXT'],
    ['deletion_scheduled_at', 'TEXT'],
    ['reopen_until', 'TEXT'],
    ['reopened_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_reminder_at', 'TEXT']
];

for (const [name, definition] of dossierColumnMigrations) {
    if (!dossierColumns.includes(name)) {
        db.prepare(`ALTER TABLE sentinel_dossiers ADD COLUMN ${name} ${definition}`).run();
    }
}

const dossierTypeSettingColumns = db.prepare('PRAGMA table_info(sentinel_dossier_type_settings)').all()
    .map(column => column.name);

if (!dossierTypeSettingColumns.includes('sla_first_response_minutes')) {
    db.prepare('ALTER TABLE sentinel_dossier_type_settings ADD COLUMN sla_first_response_minutes INTEGER').run();
}

if (!dossierTypeSettingColumns.includes('sla_resolution_minutes')) {
    db.prepare('ALTER TABLE sentinel_dossier_type_settings ADD COLUMN sla_resolution_minutes INTEGER').run();
}

const dossierTemplateColumns = db.prepare('PRAGMA table_info(sentinel_dossier_templates)').all()
    .map(column => column.name);

if (!dossierTemplateColumns.includes('type')) {
    db.prepare('ALTER TABLE sentinel_dossier_templates ADD COLUMN type TEXT').run();
}

if (!dossierTemplateColumns.includes('kind')) {
    db.prepare("ALTER TABLE sentinel_dossier_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'reply'").run();
}

db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_sentinel_dossiers_deletion
    ON sentinel_dossiers (deletion_scheduled_at, status)
`).run();

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
