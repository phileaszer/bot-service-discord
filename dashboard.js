const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const zlib = require('zlib');
const { ChannelType, PermissionsBitField } = require('discord.js');
const db = require('./database/database');

const sessions = new Map();
const oauthStates = new Map();
const staticFileCache = new Map();
let dashboardServer = null;
const dashboardStartedAt = new Date().toISOString();

function boundedEnvInteger(name, fallback, min, max) {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    const value = Number.isSafeInteger(parsed) ? parsed : fallback;
    return Math.min(Math.max(value, min), max);
}

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'sentinel_session';
const SECURE_SESSION_COOKIE = '__Host-sentinel_session';
const OAUTH_COOKIE = 'sentinel_oauth';
const SECURE_OAUTH_COOKIE = '__Host-sentinel_oauth';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const OAUTH_STATES_MAX = 1000;
const PRIVILEGED_REAUTH_TTL = boundedEnvInteger('DASHBOARD_PRIVILEGED_REAUTH_MINUTES', 30, 5, 120) * 60 * 1000;
const PRIVILEGED_IDENTITY_TTL = boundedEnvInteger('DASHBOARD_PRIVILEGED_VERIFY_SECONDS', 300, 60, 900) * 1000;
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;
const SENTINEL_REFERENCE_GUILD_ID = '1512509939044712569';
const PUBLIC_SITE_BASE_PATH = '/bot-service-discord';
const SERVER_PRESET_IDS = new Set(['standard', 'rp-modern', 'western', 'staff', 'community']);
const SERVER_PRESET_LABELS = {
    standard: 'Standard',
    'rp-modern': 'Police / EMS / Staff RP',
    western: 'Époque 1900 / Western',
    staff: 'Staff et modération',
    community: 'Communauté Discord'
};
const CREATOR_USER_IDS = new Set(
    String(process.env.SENTINEL_CREATOR_USER_ID || process.env.CREATOR_USER_ID || '')
        .split(/[,\s]+/)
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value))
);
const SITE_ACCESS_ROLES = {
    FOUNDER: 'founder',
    STAFF: 'staff',
    USER: 'user'
};
const ALLOWED_RETURN_PATHS = new Set([
    '/',
    '/index.html',
    '/dashboard',
    '/dashboard.html',
    '/fonctionnalites',
    '/fonctionnalites.html',
    '/commandes',
    '/commandes.html',
    '/premium',
    '/premium.html',
    '/securite',
    '/securite.html',
    '/installation',
    '/installation.html',
    '/pourquoi',
    '/pourquoi.html',
    '/statut',
    '/statut.html'
]);
const DEFAULT_DASHBOARD_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
const PUBLIC_SITE_ORIGIN = 'https://phileaszer.github.io';
const TRUSTED_INLINE_THEME_SCRIPT_HASH = "'sha256-Uu777sEy6oOiMQiWxnehxOXPt2q3s3srNqyZMOTy+Mg='";
const CSRF_HEADER = 'x-sentinel-csrf';
const STORED_SECRET_PREFIX = 'enc:v1:';
const STORED_SESSION_ID_PREFIX = 'sha256:';
const MAX_JSON_BODY_BYTES = Math.min(
    Math.max(Number.parseInt(process.env.DASHBOARD_MAX_JSON_BYTES || `${12 * 1024 * 1024}`, 10), 16 * 1024),
    16 * 1024 * 1024
);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RATE_LIMIT_BUCKETS_MAX = 5000;
const rateLimitBuckets = new Map();
const RATE_LIMITS = {
    global: {
        windowMs: 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_GLOBAL || '360', 10), 60)
    },
    api: {
        windowMs: 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_API || '180', 10), 30)
    },
    mutate: {
        windowMs: 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_MUTATE || '60', 10), 10)
    },
    auth: {
        windowMs: 10 * 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_AUTH || '30', 10), 5)
    },
    creator: {
        windowMs: 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_CREATOR || '20', 10), 5)
    },
    status: {
        windowMs: 60 * 1000,
        max: Math.max(Number.parseInt(process.env.DASHBOARD_RATE_LIMIT_STATUS || '120', 10), 20)
    }
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};
const COMPRESSIBLE_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt']);
const STATIC_CACHE_MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
const STATIC_SCRIPT_CACHE_CONTROL = 'no-cache';
const STATIC_HTML_CACHE_CONTROL = 'no-cache';
const STATIC_VERSIONED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const JSON_COMPRESSION_MIN_BYTES = 1024;

function createHttpError(status, message, details = {}) {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
}

const DASHBOARD_PERMISSION_LABELS = {
    fr: new Map([
        [PermissionsBitField.Flags.ViewChannel, 'Voir le salon'],
        [PermissionsBitField.Flags.SendMessages, 'Envoyer des messages'],
        [PermissionsBitField.Flags.EmbedLinks, 'Intégrer des liens'],
        [PermissionsBitField.Flags.ReadMessageHistory, 'Voir les anciens messages'],
        [PermissionsBitField.Flags.AttachFiles, 'Joindre des fichiers'],
        [PermissionsBitField.Flags.ManageMessages, 'Gérer les messages'],
        [PermissionsBitField.Flags.ManageChannels, 'Gérer les salons'],
        [PermissionsBitField.Flags.ManageRoles, 'Gérer les rôles'],
        [PermissionsBitField.Flags.ModerateMembers, 'Exclure temporairement des membres'],
        [PermissionsBitField.Flags.KickMembers, 'Expulser des membres'],
        [PermissionsBitField.Flags.BanMembers, 'Bannir des membres'],
        [PermissionsBitField.Flags.MentionEveryone, 'Mentionner @everyone et les rôles']
    ]),
    en: new Map([
        [PermissionsBitField.Flags.ViewChannel, 'View Channel'],
        [PermissionsBitField.Flags.SendMessages, 'Send Messages'],
        [PermissionsBitField.Flags.EmbedLinks, 'Embed Links'],
        [PermissionsBitField.Flags.ReadMessageHistory, 'Read Message History'],
        [PermissionsBitField.Flags.AttachFiles, 'Attach Files'],
        [PermissionsBitField.Flags.ManageMessages, 'Manage Messages'],
        [PermissionsBitField.Flags.ManageChannels, 'Manage Channels'],
        [PermissionsBitField.Flags.ManageRoles, 'Manage Roles'],
        [PermissionsBitField.Flags.ModerateMembers, 'Moderate Members'],
        [PermissionsBitField.Flags.KickMembers, 'Kick Members'],
        [PermissionsBitField.Flags.BanMembers, 'Ban Members'],
        [PermissionsBitField.Flags.MentionEveryone, 'Mention @everyone and roles']
    ])
};

function getErrorLanguage(language = 'fr') {
    return language === 'en' ? 'en' : 'fr';
}

function getDashboardPermissionLabel(permissionFlag, language = 'fr') {
    const lang = getErrorLanguage(language);
    return DASHBOARD_PERMISSION_LABELS[lang].get(permissionFlag)
        || (lang === 'en' ? 'the required permission' : 'la permission nécessaire');
}

function getBotRoleName(guild) {
    return guild?.members?.me?.roles?.highest?.name || 'Sentinel';
}

function getDashboardBotPermissionFix(guild, permissionFlag, language = 'fr') {
    const lang = getErrorLanguage(language);
    const permission = getDashboardPermissionLabel(permissionFlag, lang);
    const botRoleName = getBotRoleName(guild);

    if (lang === 'en') {
        return `Add the “${permission}” permission to the Sentinel role (${botRoleName}), then try again.`;
    }

    return `Ajoute la permission “${permission}” au rôle Sentinel (${botRoleName}), puis réessaie.`;
}

function getDashboardUserPermissionFix(permissionFlag, language = 'fr') {
    const lang = getErrorLanguage(language);
    const permission = getDashboardPermissionLabel(permissionFlag, lang);

    if (lang === 'en') {
        return `Give your Discord role the “${permission}” permission, or add your role to Sentinel allowed roles.`;
    }

    return `Donne la permission “${permission}” à ton rôle Discord, ou ajoute ton rôle aux rôles autorisés de Sentinel.`;
}

function getDashboardTextChannelFix(language = 'fr') {
    return getErrorLanguage(language) === 'en'
        ? 'Choose a text channel that still exists and is visible to Sentinel.'
        : 'Choisis un salon texte encore présent et visible par Sentinel.';
}

function getDashboardChannelPermissionFix(channel, permissionFlag, language = 'fr') {
    const lang = getErrorLanguage(language);
    const channelLabel = channel?.name
        ? `#${channel.name}`
        : (lang === 'en' ? 'the selected channel' : 'le salon choisi');

    if (permissionFlag === PermissionsBitField.Flags.ViewChannel) {
        return lang === 'en'
            ? `Allow Sentinel to view ${channelLabel}.`
            : `Autorise Sentinel à voir ${channelLabel}.`;
    }

    if (permissionFlag === PermissionsBitField.Flags.SendMessages) {
        return lang === 'en'
            ? `Allow Sentinel to send messages in ${channelLabel}.`
            : `Autorise Sentinel à envoyer des messages dans ${channelLabel}.`;
    }

    if (permissionFlag === PermissionsBitField.Flags.EmbedLinks) {
        return lang === 'en'
            ? `Allow Sentinel to embed links in ${channelLabel}.`
            : `Ajoute la permission “Intégrer des liens” à Sentinel dans ${channelLabel}.`;
    }

    if (permissionFlag === PermissionsBitField.Flags.ReadMessageHistory) {
        return lang === 'en'
            ? `Allow Sentinel to read message history in ${channelLabel}.`
            : `Autorise Sentinel à voir les anciens messages dans ${channelLabel}.`;
    }

    return getDashboardBotPermissionFix(channel?.guild, permissionFlag, lang);
}

function requireBotChannelPermissions(guild, channel, permissionFlags, language = 'fr') {
    const permissions = channel?.permissionsFor(guild.members.me);
    const missingPermission = permissionFlags.find(permissionFlag => !permissions?.has(permissionFlag));

    if (missingPermission) {
        throw createHttpError(403, 'Sentinel cannot use the selected channel.', {
            missingPermission: getDashboardPermissionLabel(missingPermission, language),
            fix: getDashboardChannelPermissionFix(channel, missingPermission, language)
        });
    }
}

function createDiscordActionError(error, guild, permissionFlag, language = 'fr', targetMember = null) {
    const lang = getErrorLanguage(language);
    const discordCode = Number(error?.code || error?.rawError?.code || 0) || null;
    const message = String(error?.message || '');
    const botMember = guild?.members?.me;

    if (discordCode === 10026) {
        return createHttpError(404, 'Discord ban not found.', {
            discordCode,
            fix: lang === 'en'
                ? 'Check the full Discord ID, then try again only if this user is still banned.'
                : 'Vérifie l’ID Discord complet, puis réessaie seulement si cette personne est encore bannie.'
        });
    }

    if (discordCode === 50013 || /Missing Permissions/i.test(message)) {
        const targetRole = targetMember?.roles?.highest;

        if (botMember && targetRole && targetRole.comparePositionTo(botMember.roles.highest) >= 0) {
            return createHttpError(403, 'Discord refused the action.', {
                discordCode,
                fix: lang === 'en'
                    ? `Move my role above “${targetRole.name}”, then try again.`
                    : `Place mon rôle au-dessus de “${targetRole.name}”, puis réessaie.`
            });
        }

        return createHttpError(403, 'Discord refused the action.', {
            discordCode,
            fix: getDashboardBotPermissionFix(guild, permissionFlag, lang)
        });
    }

    return createHttpError(400, 'Discord refused the action.', {
        discordCode,
        fix: lang === 'en'
            ? 'Open Dashboard > Security > Diagnostic, fix the red item, then try again.'
            : 'Ouvre le dashboard > Sécurité > Diagnostic, corrige le point rouge, puis réessaie.'
    });
}

function nowIso() {
    return new Date().toISOString();
}

function normalizeSiteLanguage(value) {
    return value === 'en' ? 'en' : 'fr';
}

function truncateText(value, maxLength = 600) {
    if (typeof value !== 'string') {
        return null;
    }

    return value.slice(0, maxLength);
}

function isCreatorUser(userId) {
    return Boolean(userId && CREATOR_USER_IDS.has(String(userId)));
}

function firstHeaderValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function splitConfiguredList(value) {
    return String(value || '')
        .split(/[,\s]+/)
        .map(item => item.trim())
        .filter(Boolean);
}

function safeUrl(value) {
    try {
        return value ? new URL(value) : null;
    } catch (error) {
        return null;
    }
}

function normalizeHostname(value) {
    const raw = firstHeaderValue(value);

    if (!raw) {
        return null;
    }

    try {
        return new URL(`http://${String(raw).trim()}`).hostname.toLowerCase();
    } catch (error) {
        return null;
    }
}

function isLocalHostname(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getConfiguredDashboardOrigin() {
    const configured = safeUrl(process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_ORIGIN);
    return configured?.origin || DEFAULT_DASHBOARD_ORIGIN;
}

function getTrustedDashboardHostnames() {
    const hostnames = new Set(['localhost', '127.0.0.1', '::1']);
    const defaultOrigin = safeUrl(DEFAULT_DASHBOARD_ORIGIN);
    const configuredOrigin = safeUrl(getConfiguredDashboardOrigin());

    if (defaultOrigin?.hostname) {
        hostnames.add(defaultOrigin.hostname.toLowerCase());
    }

    if (configuredOrigin?.hostname) {
        hostnames.add(configuredOrigin.hostname.toLowerCase());
    }

    for (const entry of splitConfiguredList(process.env.DASHBOARD_ALLOWED_HOSTS)) {
        const hostname = normalizeHostname(entry);

        if (hostname) {
            hostnames.add(hostname);
        }
    }

    return hostnames;
}

function getRequestHostname(req) {
    return normalizeHostname(req.headers.host);
}

function requireTrustedHost(req) {
    const hostname = getRequestHostname(req);

    if (!hostname || !getTrustedDashboardHostnames().has(hostname)) {
        throw createHttpError(400, 'Invalid request host.');
    }
}

function isRequestSecure(req) {
    const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']);

    if (String(forwardedProto || '').split(',')[0].trim().toLowerCase() === 'https') {
        return true;
    }

    return Boolean(req.socket?.encrypted);
}

function shouldUseSecureCookies(req) {
    const hostname = getRequestHostname(req);

    return isRequestSecure(req)
        || (!isLocalHostname(hostname) && getConfiguredDashboardOrigin().startsWith('https://'));
}

function getAllowedPublicOrigins() {
    return new Set([
        PUBLIC_SITE_ORIGIN,
        getConfiguredDashboardOrigin(),
        ...splitConfiguredList(process.env.DASHBOARD_ALLOWED_CORS_ORIGINS)
            .map(value => safeUrl(value)?.origin)
            .filter(Boolean)
    ]);
}

function normalizeClientIp(value) {
    const raw = String(firstHeaderValue(value) || '').trim();

    if (!raw) {
        return null;
    }

    const normalized = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
    return net.isIP(normalized) ? normalized : null;
}

function getClientIp(req) {
    const railwayRealIp = normalizeClientIp(req.headers['x-real-ip']);

    if (railwayRealIp) {
        return railwayRealIp;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = String(forwarded || '')
        .split(',')
        .map(value => normalizeClientIp(value))
        .find(Boolean);

    return forwardedIp || normalizeClientIp(req.socket?.remoteAddress);
}

function hashSessionValue(value) {
    if (!value) {
        return null;
    }

    return crypto
        .createHash('sha256')
        .update(String(value))
        .digest('hex');
}

function getSessionFingerprint(req) {
    return {
        ipHash: hashSessionValue(getClientIp(req)),
        userAgent: truncateText(req.headers['user-agent'] || null, 400)
    };
}

function normalizeAuditValue(value) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return truncateText(String(value), 500);
}

function getAuditTarget(body = {}) {
    const targetChecks = [
        ['user', body.userId],
        ['role', body.roleId],
        ['category', body.categoryId],
        ['channel', body.channelId],
        ['message', body.messageId],
        ['case', body.caseId]
    ];

    for (const [targetType, targetId] of targetChecks) {
        const normalized = normalizeAuditValue(targetId);

        if (normalized) {
            return { targetType, targetId: normalized };
        }
    }

    return { targetType: null, targetId: null };
}

function sanitizeAuditDetails(body = {}) {
    const allowedKeys = [
        'language',
        'preset',
        'roleId',
        'channelId',
        'categoryId',
        'userId',
        'messageId',
        'caseId',
        'dossierId',
        'dossierStatus',
        'dossierType',
        'word',
        'enabled',
        'forbiddenWordsEnabled',
        'forbiddenWordsAction',
        'inviteFilterEnabled',
        'inviteAction',
        'spamFilterEnabled',
        'spamAction',
        'spamMaxMessages',
        'spamWindowSeconds',
        'spamTimeoutSeconds',
        'premiumCapsEnabled',
        'premiumCapsAction',
        'premiumMentionsEnabled',
        'premiumMentionsAction',
        'premiumMentionLimit',
        'premiumProgressiveEnabled',
        'premiumProgressiveWindowMinutes',
        'premiumProgressiveTimeoutThreshold',
        'premiumProgressiveKickThreshold',
        'premiumProgressiveBanThreshold',
        'premiumRaidEnabled',
        'premiumRaidJoinCount',
        'premiumRaidWindowSeconds',
        'premiumIgnoredRoleIds',
        'premiumIgnoredChannelIds',
        'weekStart',
        'paid',
        'hourlyRate',
        'currency',
        'duration',
        'count',
        'deleteDays',
        'title',
        'color',
        'imageUrl',
        'thumbnailUrl',
        'footer',
        'reason'
    ];
    const details = {};

    for (const key of allowedKeys) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) {
            continue;
        }

        const value = normalizeAuditValue(body[key]);

        if (value !== null) {
            details[key] = value;
        }
    }

    return details;
}

function normalizeServerPreset(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return SERVER_PRESET_IDS.has(normalized) ? normalized : null;
}

function mapAuditLog(row) {
    if (!row) {
        return null;
    }

    let details = {};

    try {
        details = row.details ? JSON.parse(row.details) : {};
    } catch (error) {
        details = {};
    }

    return {
        id: row.id,
        guildId: row.guild_id,
        guildName: row.guild_name,
        actorUserId: row.actor_user_id,
        actorUsername: row.actor_username,
        action: row.action,
        status: row.status,
        targetType: row.target_type,
        targetId: row.target_id,
        summary: row.summary,
        details,
        source: row.source,
        createdAt: row.created_at
    };
}

function addDashboardAuditLog({ guild, actor, body, status, summary }) {
    const action = normalizeAuditValue(body?.action) || 'unknown';
    const auditTarget = getAuditTarget(body);
    const guildLevelActions = new Set([
        'disable-status-channel',
        'set-status-updates',
        'enable-status-updates',
        'disable-status-updates'
    ]);
    const targetType = auditTarget.targetType || (guildLevelActions.has(action) ? 'guild' : null);
    const targetId = auditTarget.targetId || (guildLevelActions.has(action) ? guild.id : null);
    const details = sanitizeAuditDetails(body);

    db.prepare(`
        INSERT INTO dashboard_audit_logs (
            guild_id,
            guild_name,
            actor_user_id,
            actor_username,
            action,
            status,
            target_type,
            target_id,
            summary,
            details,
            source,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guild.id,
        truncateText(guild.name || null, 200),
        actor?.id || 'unknown',
        truncateText(actor?.user?.tag || actor?.user?.username || actor?.displayName || null, 200),
        action,
        status,
        targetType,
        targetId,
        truncateText(summary || 'Action dashboard Sentinel.', 800),
        JSON.stringify(details),
        'dashboard',
        nowIso()
    );
}

function addSiteAccessAuditLog({ session, body, status, summary, kind }) {
    const operation = ['add', 'remove', 'ajouter', 'retirer'].includes(String(body?.action || '').toLowerCase())
        ? String(body.action).toLowerCase()
        : 'unknown';
    const target = kind === 'site_staff'
        ? 'user'
        : String(body?.target || 'unknown').toLowerCase();
    const guildId = normalizeDiscordIdValue(body?.guildId || body?.serverId || body?.serveurId);
    const targetId = normalizeDiscordIdValue(
        body?.userId
        || body?.utilisateurId
        || body?.roleId
        || guildId
    );

    db.prepare(`
        INSERT INTO dashboard_audit_logs (
            guild_id,
            guild_name,
            actor_user_id,
            actor_username,
            action,
            status,
            target_type,
            target_id,
            summary,
            details,
            source,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId || 'site',
        guildId ? null : 'Régie Sentinel',
        session?.user?.id || 'unknown',
        truncateText(session?.user?.username || session?.user?.globalName || null, 200),
        truncateText(`${kind}_${operation}_${target}`, 500),
        status,
        target,
        targetId,
        truncateText(summary || 'Action protégée Sentinel.', 800),
        JSON.stringify({ kind, operation, target }),
        'site',
        nowIso()
    );
}

function buildAuditQuery({ guildId = null, actorUserId = null, targetId = null, action = null, status = null, source = null, limit = 25 } = {}) {
    const where = [];
    const params = [];

    if (guildId) {
        where.push('guild_id = ?');
        params.push(guildId);
    }

    if (actorUserId) {
        where.push('actor_user_id = ?');
        params.push(actorUserId);
    }

    if (targetId) {
        where.push('target_id = ?');
        params.push(targetId);
    }

    if (action) {
        where.push('action = ?');
        params.push(action);
    }

    if (status) {
        where.push('status = ?');
        params.push(status);
    }

    if (source) {
        where.push('source = ?');
        params.push(source);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    params.push(safeLimit);

    return {
        sql: `
            SELECT id, guild_id, guild_name, actor_user_id, actor_username, action, status, target_type, target_id, summary, details, source, created_at
            FROM dashboard_audit_logs
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
            ORDER BY datetime(created_at) DESC, id DESC
            LIMIT ?
        `,
        params
    };
}

function getDashboardAuditLogs(filters) {
    const query = buildAuditQuery(filters);

    return db.prepare(query.sql).all(...query.params).map(mapAuditLog);
}

function mapUserProfile(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.user_id,
        username: row.username,
        globalName: row.global_name,
        avatar: row.avatar_url
    };
}

function saveUserProfile(profile, options = {}) {
    if (!profile?.id) {
        return null;
    }

    const timestamp = nowIso();
    const lastLoginAt = options.markLogin ? timestamp : null;

    db.prepare(`
        INSERT INTO user_profiles (
            user_id,
            username,
            global_name,
            avatar_url,
            last_login_at,
            last_seen_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            username = excluded.username,
            global_name = excluded.global_name,
            avatar_url = excluded.avatar_url,
            last_login_at = COALESCE(excluded.last_login_at, user_profiles.last_login_at),
            last_seen_at = excluded.last_seen_at,
            updated_at = excluded.updated_at
    `).run(
        profile.id,
        profile.username || null,
        profile.globalName || null,
        profile.avatar || null,
        lastLoginAt,
        timestamp,
        timestamp
    );

    return getUserProfile(profile.id);
}

function getUserProfile(userId) {
    return mapUserProfile(db.prepare(`
        SELECT user_id, username, global_name, avatar_url
        FROM user_profiles
        WHERE user_id = ?
    `).get(userId));
}

function isSiteStaffUser(userId) {
    if (!userId) {
        return false;
    }

    return Boolean(db.prepare(`
        SELECT 1
        FROM site_staff_users
        WHERE user_id = ?
    `).get(String(userId)));
}

function getSiteAccessRole(userId) {
    if (isCreatorUser(userId)) {
        return SITE_ACCESS_ROLES.FOUNDER;
    }

    if (isSiteStaffUser(userId)) {
        return SITE_ACCESS_ROLES.STAFF;
    }

    return SITE_ACCESS_ROLES.USER;
}

function getStoredSiteAccess(userId) {
    const role = getSiteAccessRole(userId);

    return {
        role,
        isFounder: role === SITE_ACCESS_ROLES.FOUNDER,
        isStaff: role === SITE_ACCESS_ROLES.STAFF,
        canViewSitePanel: role === SITE_ACCESS_ROLES.FOUNDER || role === SITE_ACCESS_ROLES.STAFF,
        canManagePremium: role === SITE_ACCESS_ROLES.FOUNDER,
        canManageSiteStaff: role === SITE_ACCESS_ROLES.FOUNDER,
        staffAssignment: role === SITE_ACCESS_ROLES.STAFF,
        discordStaffRole: role === SITE_ACCESS_ROLES.FOUNDER
    };
}

async function getReferenceStaffRoleState(ctx, userId) {
    const guild = ctx.client.guilds.cache.get(SENTINEL_REFERENCE_GUILD_ID)
        || await ctx.client.guilds.fetch(SENTINEL_REFERENCE_GUILD_ID).catch(() => null);
    const requiredRoleIds = guild && ctx.helpers.getCommandRoleIds
        ? ctx.helpers.getCommandRoleIds(guild.id)
        : [];
    const member = guild && userId
        ? await guild.members.fetch({ user: String(userId), force: true }).catch(() => null)
        : null;
    const matchingRoleIds = member
        ? requiredRoleIds.filter(roleId => member.roles.cache.has(roleId))
        : [];

    return {
        guild,
        member,
        requiredRoleIds,
        matchingRoleIds,
        hasRequiredRole: matchingRoleIds.length > 0
    };
}

async function getSiteAccess(ctx, userId) {
    const storedAccess = getStoredSiteAccess(userId);

    if (!storedAccess.isStaff) {
        return storedAccess;
    }

    const roleState = await getReferenceStaffRoleState(ctx, userId);

    if (!roleState.hasRequiredRole) {
        return {
            role: SITE_ACCESS_ROLES.USER,
            isFounder: false,
            isStaff: false,
            canViewSitePanel: false,
            canManagePremium: false,
            canManageSiteStaff: false,
            staffAssignment: true,
            discordStaffRole: false
        };
    }

    return {
        ...storedAccess,
        discordStaffRole: true
    };
}

async function verifyPrivilegedDiscordIdentity(session) {
    if (!session?.user?.id || !session.accessToken) {
        throw createHttpError(401, 'Login required.');
    }

    if (
        session.privilegedIdentityVerifiedAt
        && session.privilegedIdentityVerifiedAt > Date.now() - PRIVILEGED_IDENTITY_TTL
    ) {
        return;
    }

    let user;

    try {
        user = await discordFetch('/users/@me', session.accessToken);
    } catch (error) {
        throw createHttpError(401, 'Discord session verification failed.', {
            code: 'REAUTH_REQUIRED',
            reauthUrl: '/auth/login?return_to=%2Fdashboard'
        });
    }

    if (String(user.id) !== String(session.user.id)) {
        throw createHttpError(401, 'Discord session verification failed.', {
            code: 'REAUTH_REQUIRED',
            reauthUrl: '/auth/login?return_to=%2Fdashboard'
        });
    }

    session.privilegedIdentityVerifiedAt = Date.now();
}

async function requireFounderAccess(session, options = {}) {
    if (!isCreatorUser(session?.user?.id)) {
        throw createHttpError(403, 'Founder access is required.');
    }

    await verifyPrivilegedDiscordIdentity(session);

    const createdAt = Number(session.createdAt);

    if (
        options.recentLogin
        && (!Number.isFinite(createdAt) || createdAt < Date.now() - PRIVILEGED_REAUTH_TTL)
    ) {
        throw createHttpError(401, 'Recent Discord login is required.', {
            code: 'REAUTH_REQUIRED',
            reauthUrl: '/auth/login?return_to=%2Fdashboard'
        });
    }
}

async function requireSitePanelAccess(ctx, session) {
    const access = await getSiteAccess(ctx, session?.user?.id);

    if (!access.canViewSitePanel) {
        if (access.staffAssignment && !access.discordStaffRole) {
            throw createHttpError(403, 'A Sentinel Discord staff role is required for site staff access.');
        }

        throw createHttpError(403, 'Site staff access is required.');
    }

    await verifyPrivilegedDiscordIdentity(session);

    return access;
}

function listSiteStaffRows() {
    return db.prepare(`
        SELECT user_id, granted_by_user_id, created_at, updated_at
        FROM site_staff_users
        ORDER BY datetime(created_at) DESC, user_id ASC
    `).all();
}

function grantSiteStaffUser(userId, grantedByUserId = null) {
    const timestamp = nowIso();

    db.prepare(`
        INSERT INTO site_staff_users (user_id, granted_by_user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            granted_by_user_id = excluded.granted_by_user_id,
            updated_at = excluded.updated_at
    `).run(String(userId), grantedByUserId || null, timestamp, timestamp);
}

function revokeSiteStaffUser(userId) {
    db.prepare(`
        DELETE FROM site_staff_users
        WHERE user_id = ?
    `).run(String(userId));
}

function getUserSiteSettings(userId) {
    const row = db.prepare(`
        SELECT site_language, last_guild_id, last_return_url
        FROM user_site_settings
        WHERE user_id = ?
    `).get(userId);

    if (!row) {
        const timestamp = nowIso();
        db.prepare(`
            INSERT INTO user_site_settings (user_id, site_language, last_guild_id, last_return_url, updated_at)
            VALUES (?, 'fr', NULL, NULL, ?)
        `).run(userId, timestamp);

        return {
            siteLanguage: 'fr',
            lastGuildId: null,
            lastReturnUrl: null
        };
    }

    return {
        siteLanguage: normalizeSiteLanguage(row.site_language),
        lastGuildId: row.last_guild_id || null,
        lastReturnUrl: row.last_return_url || null
    };
}

function updateUserSiteSettings(userId, patch = {}) {
    const current = getUserSiteSettings(userId);
    const next = {
        siteLanguage: Object.prototype.hasOwnProperty.call(patch, 'siteLanguage')
            ? normalizeSiteLanguage(patch.siteLanguage)
            : current.siteLanguage,
        lastGuildId: Object.prototype.hasOwnProperty.call(patch, 'lastGuildId')
            ? (/^\d{17,20}$/.test(String(patch.lastGuildId || '')) ? String(patch.lastGuildId) : null)
            : current.lastGuildId,
        lastReturnUrl: Object.prototype.hasOwnProperty.call(patch, 'lastReturnUrl')
            ? truncateText(patch.lastReturnUrl, 600)
            : current.lastReturnUrl
    };

    db.prepare(`
        INSERT INTO user_site_settings (user_id, site_language, last_guild_id, last_return_url, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            site_language = excluded.site_language,
            last_guild_id = excluded.last_guild_id,
            last_return_url = excluded.last_return_url,
            updated_at = excluded.updated_at
    `).run(userId, next.siteLanguage, next.lastGuildId, next.lastReturnUrl, nowIso());

    return next;
}

function getRequestBaseUrl(req) {
    if (process.env.DASHBOARD_URL) {
        return process.env.DASHBOARD_URL.replace(/\/$/, '');
    }

    const host = firstHeaderValue(req.headers.host);
    const hostname = getRequestHostname(req);
    const proto = isRequestSecure(req) || !isLocalHostname(hostname) ? 'https' : 'http';

    return `${proto}://${host}`;
}

function getRedirectUri(req) {
    return `${getRequestBaseUrl(req)}/auth/callback`;
}

function normalizeReturnPath(pathname) {
    let normalizedPath = pathname || '/';

    if (normalizedPath === PUBLIC_SITE_BASE_PATH) {
        normalizedPath = '/';
    } else if (normalizedPath.startsWith(`${PUBLIC_SITE_BASE_PATH}/`)) {
        normalizedPath = normalizedPath.slice(PUBLIC_SITE_BASE_PATH.length);
    }

    if (!normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
    }

    return ALLOWED_RETURN_PATHS.has(normalizedPath) ? normalizedPath : '/dashboard';
}

function getSafeReturnTo(req, value) {
    const baseUrl = getRequestBaseUrl(req);

    if (!value) {
        return `${baseUrl}/dashboard`;
    }

    try {
        const parsed = new URL(truncateText(String(value), 1000), baseUrl);
        const base = new URL(baseUrl);
        const isSameOrigin = parsed.origin === base.origin;
        const isGithubPages = parsed.hostname.toLowerCase() === 'phileaszer.github.io';

        if (!isSameOrigin && !isGithubPages) {
            return `${baseUrl}/dashboard`;
        }

        const path = normalizeReturnPath(parsed.pathname);
        return `${baseUrl}${path}${truncateText(parsed.search || '', 300)}${truncateText(parsed.hash || '', 200)}`;
    } catch (error) {
        return `${baseUrl}/dashboard`;
    }
}

function getInviteUrl(ctx, guildId = null) {
    const clientId = process.env.CLIENT_ID || ctx.client.user?.id;
    const params = new URLSearchParams({
        client_id: clientId,
        permissions: ctx.invitePermissions,
        integration_type: '0',
        scope: 'bot applications.commands'
    });

    if (guildId) {
        params.set('guild_id', guildId);
        params.set('disable_guild_select', 'true');
    }

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function parseCookies(req) {
    const header = req.headers.cookie || '';

    return header.split(';').reduce((cookies, entry) => {
        const [name, ...valueParts] = entry.trim().split('=');

        if (name) {
            try {
                cookies[name] = decodeURIComponent(valueParts.join('='));
            } catch (error) {
                cookies[name] = '';
            }
        }

        return cookies;
    }, {});
}

function appendSetCookie(res, value) {
    const current = res.getHeader('Set-Cookie');

    if (!current) {
        res.setHeader('Set-Cookie', value);
        return;
    }

    res.setHeader('Set-Cookie', [
        ...(Array.isArray(current) ? current : [current]),
        value
    ]);
}

function getSessionCookieName(req) {
    return shouldUseSecureCookies(req) ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
}

function getOauthCookieName(req) {
    return shouldUseSecureCookies(req) ? SECURE_OAUTH_COOKIE : OAUTH_COOKIE;
}

function sessionCookieAttributes(req, maxAge) {
    const secure = shouldUseSecureCookies(req) ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Priority=High${secure}`;
}

function oauthCookieAttributes(req, maxAge) {
    const secure = shouldUseSecureCookies(req) ? '; Secure' : '';
    return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Priority=High${secure}`;
}

function setSessionCookie(res, req, sessionId) {
    const cookieName = getSessionCookieName(req);
    appendSetCookie(res, `${cookieName}=${encodeURIComponent(sessionId)}; ${sessionCookieAttributes(req, Math.floor(SESSION_TTL / 1000))}`);

    if (cookieName !== SESSION_COOKIE) {
        appendSetCookie(res, `${SESSION_COOKIE}=; ${sessionCookieAttributes(req, 0)}`);
    }
}

function clearSessionCookie(res, req) {
    appendSetCookie(res, `${getSessionCookieName(req)}=; ${sessionCookieAttributes(req, 0)}`);

    if (getSessionCookieName(req) !== SESSION_COOKIE) {
        appendSetCookie(res, `${SESSION_COOKIE}=; ${sessionCookieAttributes(req, 0)}`);
    }
}

function setOauthCookie(res, req, nonce) {
    appendSetCookie(res, `${getOauthCookieName(req)}=${encodeURIComponent(nonce)}; ${oauthCookieAttributes(req, Math.floor(OAUTH_STATE_TTL / 1000))}`);
}

function clearOauthCookie(res, req) {
    appendSetCookie(res, `${getOauthCookieName(req)}=; ${oauthCookieAttributes(req, 0)}`);

    if (getOauthCookieName(req) !== OAUTH_COOKIE) {
        appendSetCookie(res, `${OAUTH_COOKIE}=; ${oauthCookieAttributes(req, 0)}`);
    }
}

function isValidSessionId(sessionId) {
    return /^[a-f0-9]{64}$/i.test(String(sessionId || ''));
}

function hashSessionId(sessionId) {
    return `${STORED_SESSION_ID_PREFIX}${hashSessionValue(sessionId)}`;
}

function getSessionStorageIds(sessionId) {
    if (!isValidSessionId(sessionId)) {
        return [];
    }

    return [hashSessionId(sessionId), String(sessionId)];
}

function getSessionEncryptionKey() {
    const secret = process.env.DASHBOARD_SESSION_SECRET
        || process.env.CLIENT_SECRET
        || process.env.TOKEN
        || null;

    if (!secret || String(secret).length < 24) {
        return null;
    }

    return crypto.createHash('sha256').update(String(secret)).digest();
}

function encodeStoredSecret(value) {
    if (!value) {
        return value || null;
    }

    const key = getSessionEncryptionKey();

    if (!key) {
        return String(value);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${STORED_SECRET_PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decodeStoredSecret(value) {
    if (!value || !String(value).startsWith(STORED_SECRET_PREFIX)) {
        return value || null;
    }

    const key = getSessionEncryptionKey();

    if (!key) {
        throw createHttpError(401, 'Session encryption key unavailable.');
    }

    const encoded = String(value).slice(STORED_SECRET_PREFIX.length);
    const [ivBase64, tagBase64, encryptedBase64] = encoded.split('.');

    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
        throw createHttpError(401, 'Invalid stored session secret.');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

function constantTimeEqual(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');

    if (left.length !== right.length || left.length === 0) {
        return false;
    }

    return crypto.timingSafeEqual(left, right);
}

function saveDashboardSession(sessionId, session, req = null) {
    const fingerprint = req ? getSessionFingerprint(req) : {};
    const storedSessionId = hashSessionId(sessionId);

    db.prepare(`
        INSERT OR REPLACE INTO dashboard_sessions (
            session_id,
            user_id,
            access_token,
            refresh_token,
            token_expires_at,
            csrf_token,
            ip_hash,
            user_agent,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        storedSessionId,
        session.user.id,
        encodeStoredSecret(session.accessToken),
        encodeStoredSecret(session.refreshToken),
        session.tokenExpiresAt || null,
        session.csrfToken,
        fingerprint.ipHash || session.ipHash || null,
        fingerprint.userAgent || session.userAgent || null,
        session.createdAt,
        session.expiresAt
    );
}

function loadDashboardSession(sessionId) {
    const sessionIds = getSessionStorageIds(sessionId);

    if (sessionIds.length === 0) {
        return null;
    }

    const row = db.prepare(`
        SELECT session_id, user_id, access_token, refresh_token, token_expires_at, csrf_token, ip_hash, user_agent, created_at, expires_at
        FROM dashboard_sessions
        WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})
    `).get(...sessionIds);

    if (!row) {
        return null;
    }

    const profile = getUserProfile(row.user_id);

    if (!profile) {
        db.prepare(`DELETE FROM dashboard_sessions WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})`).run(...sessionIds);
        return null;
    }

    try {
        const session = {
            accessToken: decodeStoredSecret(row.access_token),
            refreshToken: decodeStoredSecret(row.refresh_token),
            tokenExpiresAt: row.token_expires_at,
            csrfToken: row.csrf_token || createCsrfToken(),
            ipHash: row.ip_hash,
            userAgent: row.user_agent,
            user: profile,
            createdAt: row.created_at,
            expiresAt: row.expires_at
        };
        const storedSessionId = hashSessionId(sessionId);
        const encryptionAvailable = Boolean(getSessionEncryptionKey());
        const shouldMigrate = row.session_id !== storedSessionId
            || (
                encryptionAvailable
                && (
                    !String(row.access_token || '').startsWith(STORED_SECRET_PREFIX)
                    || (row.refresh_token && !String(row.refresh_token).startsWith(STORED_SECRET_PREFIX))
                )
            );

        if (shouldMigrate) {
            saveDashboardSession(sessionId, session);

            if (row.session_id !== storedSessionId) {
                db.prepare('DELETE FROM dashboard_sessions WHERE session_id = ?').run(row.session_id);
            }
        }

        return session;
    } catch (error) {
        db.prepare(`DELETE FROM dashboard_sessions WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})`).run(...sessionIds);
        return null;
    }
}

function extendDashboardSession(sessionId, session, req = null) {
    const fingerprint = req ? getSessionFingerprint(req) : {};
    const ipHash = fingerprint.ipHash || session.ipHash || null;
    const userAgent = fingerprint.userAgent || session.userAgent || null;
    const sessionIds = getSessionStorageIds(sessionId);

    if (sessionIds.length === 0) {
        return;
    }

    session.ipHash = ipHash;
    session.userAgent = userAgent;

    db.prepare(`
        UPDATE dashboard_sessions
        SET expires_at = ?, csrf_token = ?, ip_hash = ?, user_agent = ?
        WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})
    `).run(session.expiresAt, session.csrfToken, ipHash, userAgent, ...sessionIds);
}

function deleteDashboardSession(sessionId) {
    sessions.delete(sessionId);
    const sessionIds = getSessionStorageIds(sessionId);

    if (sessionIds.length > 0) {
        db.prepare(`DELETE FROM dashboard_sessions WHERE session_id IN (${sessionIds.map(() => '?').join(', ')})`).run(...sessionIds);
    }
}

function deleteDashboardSessionsForUser(userId) {
    const normalizedUserId = String(userId || '');

    for (const [sessionId, session] of sessions.entries()) {
        if (String(session?.user?.id || '') === normalizedUserId) {
            sessions.delete(sessionId);
        }
    }

    db.prepare('DELETE FROM dashboard_sessions WHERE user_id = ?').run(normalizedUserId);
}

function sessionFingerprintMatches(req, session) {
    const fingerprint = getSessionFingerprint(req);

    if (session.userAgent && fingerprint.userAgent && session.userAgent !== fingerprint.userAgent) {
        return false;
    }

    if (
        String(process.env.DASHBOARD_STRICT_SESSION_IP || '').toLowerCase() === 'true'
        && session.ipHash
        && fingerprint.ipHash
        && session.ipHash !== fingerprint.ipHash
    ) {
        return false;
    }

    return true;
}

function getSession(req) {
    const sessionId = parseCookies(req)[getSessionCookieName(req)];

    if (!isValidSessionId(sessionId)) {
        return null;
    }

    let session = sessions.get(sessionId);

    if (!session) {
        session = loadDashboardSession(sessionId);

        if (session) {
            sessions.set(sessionId, session);
        }
    }

    if (!session || session.expiresAt <= Date.now()) {
        deleteDashboardSession(sessionId);
        return null;
    }

    if (!sessionFingerprintMatches(req, session)) {
        deleteDashboardSession(sessionId);
        return null;
    }

    if (!session.csrfToken) {
        session.csrfToken = createCsrfToken();
    }

    const profile = getUserProfile(session.user.id);
    if (profile) {
        session.user = profile;
    }

    session.expiresAt = Date.now() + SESSION_TTL;
    extendDashboardSession(sessionId, session, req);
    return session;
}

function createSession(payload, req = null) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const fingerprint = req ? getSessionFingerprint(req) : {};
    const session = {
        ...payload,
        csrfToken: createCsrfToken(),
        privilegedIdentityVerifiedAt: Date.now(),
        ipHash: fingerprint.ipHash || null,
        userAgent: fingerprint.userAgent || null,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL
    };

    sessions.set(sessionId, session);
    saveDashboardSession(sessionId, session, req);
    return { sessionId, session };
}

function appendVary(headers, value) {
    const current = headers.Vary || headers.vary;

    if (!current) {
        headers.Vary = value;
        return;
    }

    const values = new Set(String(current).split(',').map(item => item.trim()).filter(Boolean));
    values.add(value);
    headers.Vary = Array.from(values).join(', ');
}

function buildContentSecurityPolicy(req) {
    const directives = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        `script-src 'self' ${TRUSTED_INLINE_THEME_SCRIPT_HASH}`,
        "style-src 'self'",
        "img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net https://phileaszer.github.io",
        "font-src 'self' data:",
        `connect-src 'self' ${DEFAULT_DASHBOARD_ORIGIN} ${getConfiguredDashboardOrigin()}`,
        "form-action 'self' https://discord.com",
        "manifest-src 'self'",
        "worker-src 'none'"
    ];

    if (isRequestSecure(req)) {
        directives.push('upgrade-insecure-requests');
    }

    return directives.join('; ');
}

function securityHeaders(req, headers = {}) {
    const next = {
        'X-Content-Type-Options': 'nosniff',
        'X-DNS-Prefetch-Control': 'off',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Origin-Agent-Cluster': '?1',
        'X-Permitted-Cross-Domain-Policies': 'none',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': buildContentSecurityPolicy(req),
        ...headers
    };

    if (isRequestSecure(req)) {
        next['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
    }

    return next;
}

function corsHeaders(req, url) {
    const origin = firstHeaderValue(req.headers.origin);

    if (!origin || url?.pathname !== '/api/status') {
        return {};
    }

    const parsed = safeUrl(origin);

    if (!parsed || !getAllowedPublicOrigins().has(parsed.origin)) {
        return {};
    }

    return {
        'Access-Control-Allow-Origin': parsed.origin,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '600'
    };
}

function responseHeaders(res, headers = {}) {
    const req = res.sentinelRequest;
    const url = res.sentinelUrl;
    const next = securityHeaders(req, {
        ...headers,
        ...corsHeaders(req, url)
    });

    if (next['Access-Control-Allow-Origin']) {
        appendVary(next, 'Origin');
        next['Cross-Origin-Resource-Policy'] = 'cross-origin';
    }

    if (
        url?.pathname?.startsWith('/api/')
        || url?.pathname?.startsWith('/auth/')
        || ['/dashboard', '/dashboard.html'].includes(url?.pathname)
    ) {
        next['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
    }

    return next;
}

function writeResponse(res, status, headers = {}, body = undefined) {
    res.writeHead(status, responseHeaders(res, headers));
    res.end(body);
}

function streamPrivateFile(res, file) {
    const stat = fs.statSync(file.fullPath);
    res.writeHead(200, responseHeaders(res, {
        'Content-Type': file.contentType || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff'
    }));
    const stream = fs.createReadStream(file.fullPath);
    stream.on('error', error => {
        console.error('Erreur lecture archive Sentinel :', error);
        res.destroy(error);
    });
    stream.pipe(res);
}

function json(res, status, payload) {
    const req = res.sentinelRequest;
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    };
    let content = Buffer.from(JSON.stringify(payload));
    const canCompress = !payload?.csrfToken && content.length >= JSON_COMPRESSION_MIN_BYTES;

    if (canCompress && acceptsEncoding(req, 'br')) {
        content = zlib.brotliCompressSync(content, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 4
            }
        });
        headers['Content-Encoding'] = 'br';
        headers.Vary = 'Accept-Encoding';
    } else if (canCompress && acceptsEncoding(req, 'gzip')) {
        content = zlib.gzipSync(content, { level: 6 });
        headers['Content-Encoding'] = 'gzip';
        headers.Vary = 'Accept-Encoding';
    }

    headers['Content-Length'] = content.length;
    writeResponse(res, status, headers, content);
}

function redirect(res, location) {
    writeResponse(res, 302, {
        Location: location,
        'Cache-Control': 'no-store'
    });
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

        if (contentType && contentType !== 'application/json') {
            reject(createHttpError(415, 'Content-Type must be application/json.'));
            return;
        }

        const chunks = [];
        let size = 0;
        let rejected = false;

        req.on('data', chunk => {
            if (rejected) {
                return;
            }

            size += chunk.length;

            if (size > MAX_JSON_BODY_BYTES) {
                rejected = true;
                reject(createHttpError(413, 'Payload too large.'));
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on('end', () => {
            if (rejected) {
                return;
            }

            const body = Buffer.concat(chunks).toString('utf8');

            if (!body.trim()) {
                resolve({});
                return;
            }

            try {
                const parsed = JSON.parse(body);

                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    reject(createHttpError(400, 'JSON body must be an object.'));
                    return;
                }

                resolve(parsed);
            } catch (error) {
                reject(createHttpError(400, 'Invalid JSON body.'));
            }
        });

        req.on('error', () => {
            if (!rejected) {
                reject(createHttpError(400, 'Request body read failed.'));
            }
        });
    });
}

function sameOriginFromHeader(req, value) {
    if (!value) {
        return false;
    }

    const parsed = safeUrl(value);

    if (!parsed) {
        return false;
    }

    return parsed.origin === new URL(getRequestBaseUrl(req)).origin;
}

function requireTrustedMutationOrigin(req) {
    if (!MUTATING_METHODS.has(req.method)) {
        return;
    }

    const origin = firstHeaderValue(req.headers.origin);
    const referer = firstHeaderValue(req.headers.referer);
    const fetchSite = String(firstHeaderValue(req.headers['sec-fetch-site']) || '').toLowerCase();

    if (origin) {
        if (sameOriginFromHeader(req, origin)) {
            return;
        }

        throw createHttpError(403, 'Cross-origin request blocked.');
    }

    if (referer) {
        if (sameOriginFromHeader(req, referer)) {
            return;
        }

        throw createHttpError(403, 'Cross-origin request blocked.');
    }

    if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
        throw createHttpError(403, 'Cross-origin request blocked.');
    }

    if (!fetchSite && !isLocalHostname(getRequestHostname(req))) {
        throw createHttpError(403, 'Missing request origin.');
    }
}

function requireCsrfToken(req, session) {
    if (!MUTATING_METHODS.has(req.method) || !session) {
        return;
    }

    const headerValue = firstHeaderValue(req.headers[CSRF_HEADER]);

    if (!constantTimeEqual(headerValue, session.csrfToken)) {
        throw createHttpError(403, 'Invalid security token.');
    }
}

function rateLimitKey(req, scope, userId = null) {
    return `${scope}:${userId || hashSessionValue(getClientIp(req) || 'unknown')}`;
}

function checkRateLimit(key, limit) {
    const now = Date.now();
    let bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
        bucket = {
            count: 0,
            resetAt: now + limit.windowMs
        };
        rateLimitBuckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > limit.max) {
        const retryAfter = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
        throw createHttpError(429, 'Too many requests.', { retryAfter });
    }
}

function pruneRateLimitBuckets() {
    const now = Date.now();

    for (const [key, bucket] of rateLimitBuckets.entries()) {
        if (bucket.resetAt <= now || rateLimitBuckets.size > RATE_LIMIT_BUCKETS_MAX) {
            rateLimitBuckets.delete(key);
        }
    }
}

function applyRequestRateLimits(req, url) {
    checkRateLimit(rateLimitKey(req, 'global'), RATE_LIMITS.global);

    if (url.pathname === '/auth/login' || url.pathname === '/auth/callback') {
        checkRateLimit(rateLimitKey(req, 'auth'), RATE_LIMITS.auth);
        return;
    }

    if (!url.pathname.startsWith('/api/')) {
        return;
    }

    if (url.pathname === '/api/status') {
        checkRateLimit(rateLimitKey(req, 'status'), RATE_LIMITS.status);
        return;
    }

    checkRateLimit(rateLimitKey(req, 'api'), RATE_LIMITS.api);

    if (MUTATING_METHODS.has(req.method)) {
        checkRateLimit(rateLimitKey(req, 'mutate'), RATE_LIMITS.mutate);
    }
}

async function discordFetch(pathname, accessToken) {
    const response = await fetch(`${DISCORD_API}${pathname}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw createHttpError(response.status, 'Discord API request failed.');
    }

    return response.json();
}

async function exchangeCode(req, code) {
    if (!process.env.CLIENT_SECRET) {
        throw createHttpError(503, 'Discord OAuth is not configured. Add CLIENT_SECRET on Railway.');
    }

    const redirectUri = getRedirectUri(req);
    const body = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
    });

    const response = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        let discordError = {};

        try {
            discordError = await response.json();
        } catch (error) {
            discordError = { error: 'unknown_error' };
        }

        console.warn('Discord OAuth token exchange failed', {
            status: response.status,
            error: discordError.error,
            errorDescription: discordError.error_description,
            redirectUri
        });

        throw createHttpError(401, 'Discord authorization failed.');
    }

    return response.json();
}

function userCanManageOauthGuild(oauthGuild) {
    if (!oauthGuild) {
        return false;
    }

    if (oauthGuild.owner) {
        return true;
    }

    const permissions = BigInt(oauthGuild.permissions || '0');
    return Boolean((permissions & ADMINISTRATOR) || (permissions & MANAGE_GUILD));
}

async function getOauthGuilds(session) {
    if (session.guilds && session.guildsFetchedAt > Date.now() - 60 * 1000) {
        return session.guilds;
    }

    session.guilds = await discordFetch('/users/@me/guilds', session.accessToken);
    session.guildsFetchedAt = Date.now();
    return session.guilds;
}

async function getDashboardAccess(ctx, session, guildId) {
    const oauthGuilds = await getOauthGuilds(session);
    const oauthGuild = oauthGuilds.find(guild => guild.id === guildId) || null;
    const siteAccess = await getSiteAccess(ctx, session?.user?.id);
    const guild = ctx.client.guilds.cache.get(guildId)
        || await ctx.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        throw createHttpError(403, 'Sentinel is not installed on this server.', {
            code: 'BOT_NOT_INSTALLED',
            inviteUrl: getInviteUrl(ctx, guildId)
        });
    }

    const member = await guild.members.fetch(session.user.id).catch(() => null);
    const oauthManage = userCanManageOauthGuild(oauthGuild);
    const commandRoleAccess = member ? ctx.helpers.hasCommandRoleAccess(member) : false;
    const siteRoleAccess = siteAccess.canViewSitePanel;

    if (!oauthManage && !commandRoleAccess && !siteRoleAccess) {
        throw createHttpError(403, 'You do not have access to this server dashboard.');
    }

    return { guild, member, oauthGuild, oauthManage, commandRoleAccess, siteRoleAccess, siteAccess };
}

function requireSession(req) {
    const session = getSession(req);

    if (!session) {
        throw createHttpError(401, 'Login required.');
    }

    return session;
}

function requireCommandAccess(ctx, member) {
    if (!member || !ctx.helpers.hasCommandRoleAccess(member)) {
        throw createHttpError(403, 'You do not have permission to manage Sentinel on this server.');
    }
}

function requireDossierAccess(ctx, member) {
    const canManageDossier = ctx.helpers.memberCanManageDossier
        ? ctx.helpers.memberCanManageDossier(member)
        : ctx.helpers.hasCommandRoleAccess(member);

    if (!member || !canManageDossier) {
        throw createHttpError(403, 'You do not have permission to manage Sentinel dossiers on this server.');
    }
}

function requireModerationAccess(ctx, member, permissionFlag, language = 'fr') {
    if (!member || !ctx.helpers.hasModerationAccess(member, permissionFlag)) {
        throw createHttpError(403, 'You do not have permission for this moderation action.', {
            missingPermission: getDashboardPermissionLabel(permissionFlag, language),
            fix: getDashboardUserPermissionFix(permissionFlag, language)
        });
    }
}

function requireBotPermission(guild, permissionFlag, language = 'fr') {
    if (!guild.members.me?.permissions.has(permissionFlag)) {
        throw createHttpError(403, 'Sentinel does not have the required Discord permission.', {
            missingPermission: getDashboardPermissionLabel(permissionFlag, language),
            fix: getDashboardBotPermissionFix(guild, permissionFlag, language)
        });
    }
}

function hasDirectAdvancedAccess(ctx, guildId, member = null) {
    return ctx.helpers.hasAdvancedAccess
        ? ctx.helpers.hasAdvancedAccess(member, guildId)
        : ctx.helpers.isAdvancedGuild(guildId);
}

async function getReferenceMemberForSession(ctx, session = null) {
    const userId = session?.user?.id;

    if (!userId || !ctx.helpers.hasReferencePremiumSubscription) {
        return null;
    }

    const referenceGuild = ctx.client.guilds.cache.get(SENTINEL_REFERENCE_GUILD_ID)
        || await ctx.client.guilds.fetch(SENTINEL_REFERENCE_GUILD_ID).catch(() => null);

    if (!referenceGuild) {
        return null;
    }

    return referenceGuild.members.cache.get(userId)
        || await referenceGuild.members.fetch(userId).catch(() => null);
}

async function hasDashboardPremiumSubscription(ctx, session = null) {
    if (isCreatorUser(session?.user?.id)) {
        return true;
    }

    if (ctx.helpers.hasManualPremiumUserSubscription?.(session?.user?.id)) {
        return true;
    }

    const referenceMember = await getReferenceMemberForSession(ctx, session);

    return Boolean(
        referenceMember
        && ctx.helpers.hasReferencePremiumSubscription?.(referenceMember)
    );
}

async function hasDashboardAdvancedAccess(ctx, guildId, member = null, session = null) {
    if (hasDirectAdvancedAccess(ctx, guildId, member)) {
        return true;
    }

    return hasDashboardPremiumSubscription(ctx, session);
}

function applyDashboardPremiumQuota(quota, advanced = false) {
    if (!advanced || !quota || quota.unlimited) {
        return quota;
    }

    return {
        ...quota,
        unlimited: true,
        limit: null,
        remaining: null
    };
}

function formatDashboardCustomEmbedQuota(ctx, guildId, language = 'fr', member = null, advanced = false) {
    if (advanced) {
        return language === 'en'
            ? 'Premium quota: unlimited embed access.'
            : 'Quota Premium : accès illimité aux embeds.';
    }

    return ctx.helpers.formatCustomEmbedQuota(guildId, language, member);
}

function getEmbedAttachmentName(value) {
    const match = /^attachment:\/\/([^?#]+)$/i.exec(String(value || '').trim());
    return match ? match[1] : null;
}

async function requireAdvanced(ctx, guildId, member = null, session = null) {
    const hasAccess = await hasDashboardAdvancedAccess(ctx, guildId, member, session);

    if (!hasAccess) {
        throw createHttpError(402, 'This action is reserved for Sentinel Premium.');
    }
}

function getDashboardAdvancedGuildIds() {
    return [
        SENTINEL_REFERENCE_GUILD_ID,
        process.env.SENTINEL_REFERENCE_GUILD_ID,
        process.env.SENTINEL_PREMIUM_GUILD_ID,
        process.env.SENTINEL_PREMIUM_GUILD_IDS,
        process.env.PREMIUM_GUILD_IDS
    ]
        .flatMap(value => String(value || '').split(','))
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value));
}

function normalizeDiscordIdValue(value) {
    const id = String(value || '').trim();
    return /^\d{17,20}$/.test(id) ? id : null;
}

function getManualPremiumGuildIds() {
    return new Set(db.prepare(`
        SELECT guild_id
        FROM sentinel_premium_guilds
        ORDER BY guild_id ASC
    `).all().map(row => row.guild_id));
}

function getManualPremiumRolesByGuild() {
    const byGuild = new Map();

    for (const row of db.prepare(`
        SELECT guild_id, role_id, granted_by_user_id, created_at
        FROM sentinel_premium_roles
        ORDER BY guild_id ASC, role_id ASC
    `).all()) {
        if (!byGuild.has(row.guild_id)) {
            byGuild.set(row.guild_id, []);
        }

        byGuild.get(row.guild_id).push(row);
    }

    return byGuild;
}

function getManualPremiumUsersByGuild() {
    const byGuild = new Map();

    for (const row of db.prepare(`
        SELECT guild_id, user_id, granted_by_user_id, created_at
        FROM sentinel_premium_users
        ORDER BY guild_id ASC, user_id ASC
    `).all()) {
        if (!byGuild.has(row.guild_id)) {
            byGuild.set(row.guild_id, []);
        }

        byGuild.get(row.guild_id).push(row);
    }

    return byGuild;
}

function grantDashboardPremiumGuild(guildId, grantedByUserId = null) {
    db.prepare(`
        INSERT OR REPLACE INTO sentinel_premium_guilds (guild_id, granted_by_user_id, created_at)
        VALUES (?, ?, ?)
    `).run(String(guildId), grantedByUserId || null, new Date().toISOString());
}

function revokeDashboardPremiumGuild(guildId) {
    db.prepare(`
        DELETE FROM sentinel_premium_guilds
        WHERE guild_id = ?
    `).run(String(guildId));
}

function grantDashboardPremiumRole(guildId, roleId, grantedByUserId = null) {
    db.prepare(`
        INSERT OR REPLACE INTO sentinel_premium_roles (guild_id, role_id, granted_by_user_id, created_at)
        VALUES (?, ?, ?, ?)
    `).run(String(guildId), String(roleId), grantedByUserId || null, new Date().toISOString());
}

function revokeDashboardPremiumRole(guildId, roleId) {
    db.prepare(`
        DELETE FROM sentinel_premium_roles
        WHERE guild_id = ? AND role_id = ?
    `).run(String(guildId), String(roleId));
}

function grantDashboardPremiumUser(guildId, userId, grantedByUserId = null) {
    db.prepare(`
        INSERT OR REPLACE INTO sentinel_premium_users (guild_id, user_id, granted_by_user_id, created_at)
        VALUES (?, ?, ?, ?)
    `).run(String(guildId), String(userId), grantedByUserId || null, new Date().toISOString());
}

function revokeDashboardPremiumUser(userId, guildId = null) {
    if (guildId) {
        db.prepare(`
            DELETE FROM sentinel_premium_users
            WHERE guild_id = ? AND user_id = ?
        `).run(String(guildId), String(userId));
        return;
    }

    db.prepare(`
        DELETE FROM sentinel_premium_users
        WHERE user_id = ?
    `).run(String(userId));
}

async function manageCreatorPremiumAccess(ctx, session, body) {
    const action = String(body.action || '').trim().toLowerCase();
    const target = String(body.target || '').trim().toLowerCase();
    const add = action === 'add' || action === 'ajouter';
    const remove = action === 'remove' || action === 'retirer';
    const guildId = normalizeDiscordIdValue(body.guildId || body.serverId || body.serveurId);
    const roleId = normalizeDiscordIdValue(body.roleId);
    const userId = normalizeDiscordIdValue(body.userId || body.utilisateurId);

    if (!add && !remove) {
        throw createHttpError(400, 'Invalid Premium action.');
    }

    if (target === 'server' || target === 'serveur') {
        if (!guildId) {
            throw createHttpError(400, 'Invalid server ID.');
        }

        if (add) {
            grantDashboardPremiumGuild(guildId, session.user.id);
            return `Premium serveur ajouté pour ${guildId}.`;
        }

        revokeDashboardPremiumGuild(guildId);
        return `Premium serveur retiré pour ${guildId}.`;
    }

    if (target === 'role') {
        if (!guildId) {
            throw createHttpError(400, 'Invalid server ID.');
        }

        if (!roleId) {
            throw createHttpError(400, 'Invalid role ID.');
        }

        const guild = ctx.client.guilds.cache.get(guildId)
            || await ctx.client.guilds.fetch(guildId).catch(() => null);

        if (!guild) {
            throw createHttpError(404, 'Sentinel is not installed on this server.');
        }

        await guild.roles.fetch().catch(() => null);

        if (!guild.roles.cache.has(roleId)) {
            throw createHttpError(404, 'Role not found.');
        }

        if (add) {
            grantDashboardPremiumRole(guildId, roleId, session.user.id);
            return `Premium rôle ajouté pour ${roleId}.`;
        }

        revokeDashboardPremiumRole(guildId, roleId);
        return `Premium rôle retiré pour ${roleId}.`;
    }

    if (target === 'user' || target === 'utilisateur') {
        if (!userId) {
            throw createHttpError(400, 'Invalid Discord user ID.');
        }

        if (add) {
            grantDashboardPremiumUser(guildId || SENTINEL_REFERENCE_GUILD_ID, userId, session.user.id);
            return `Premium utilisateur ajouté pour ${userId}.`;
        }

        revokeDashboardPremiumUser(userId, guildId);
        return guildId
            ? `Premium utilisateur retiré pour ${userId} sur ${guildId}.`
            : `Premium utilisateur retiré partout pour ${userId}.`;
    }

    throw createHttpError(400, 'Invalid Premium target.');
}

async function getSiteStaffUsers(ctx) {
    const staff = [];

    for (const row of listSiteStaffRows()) {
        const profile = getUserProfile(row.user_id);
        const roleState = await getReferenceStaffRoleState(ctx, row.user_id);
        const user = roleState.member?.user || (
            profile
                ? null
                : await ctx.client.users.fetch(row.user_id).catch(() => null)
        );

        staff.push({
            id: row.user_id,
            username: profile?.username || user?.username || null,
            globalName: profile?.globalName || user?.globalName || null,
            tag: user?.tag || profile?.username || row.user_id,
            avatar: profile?.avatar || user?.displayAvatarURL?.() || null,
            inReferenceGuild: Boolean(roleState.member),
            discordRoleVerified: roleState.hasRequiredRole,
            matchingRoleIds: roleState.matchingRoleIds,
            grantedByUserId: row.granted_by_user_id || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        });
    }

    return staff;
}

async function manageCreatorSiteStaffAccess(ctx, session, body) {
    const action = String(body.action || '').trim().toLowerCase();
    const add = action === 'add' || action === 'ajouter';
    const remove = action === 'remove' || action === 'retirer';
    const userId = normalizeDiscordIdValue(body.userId || body.utilisateurId);

    if (!add && !remove) {
        throw createHttpError(400, 'Invalid site staff action.');
    }

    if (!userId) {
        throw createHttpError(400, 'Invalid Discord user ID.');
    }

    if (isCreatorUser(userId)) {
        throw createHttpError(400, 'Founder access cannot be managed as staff.');
    }

    if (add) {
        const roleState = await getReferenceStaffRoleState(ctx, userId);
        const user = roleState.member?.user || await ctx.client.users.fetch(userId).catch(() => null);

        if (!user) {
            throw createHttpError(404, 'Discord user not found.');
        }

        if (user.bot) {
            throw createHttpError(400, 'Bot accounts cannot receive site staff access.');
        }

        if (!roleState.guild) {
            throw createHttpError(503, 'The Sentinel Discord server is unavailable.');
        }

        if (roleState.requiredRoleIds.length === 0) {
            throw createHttpError(409, 'No Sentinel Discord staff role is configured.');
        }

        if (!roleState.member) {
            throw createHttpError(403, 'The user must join the Sentinel Discord server before receiving site staff access.');
        }

        if (!roleState.hasRequiredRole) {
            throw createHttpError(403, 'The user must have a Sentinel Discord staff role before receiving site staff access.');
        }

        saveUserProfile({
            id: user.id,
            username: user.username,
            globalName: user.globalName,
            avatar: user.displayAvatarURL?.() || null
        });

        grantSiteStaffUser(userId, session.user.id);
        return `Accès staff site ajouté pour ${user.tag || userId}.`;
    }

    revokeSiteStaffUser(userId);
    deleteDashboardSessionsForUser(userId);
    return `Accès staff site retiré pour ${userId}.`;
}

async function buildCreatorPremiumOverview(ctx, session = null) {
    const siteAccess = await getSiteAccess(ctx, session?.user?.id);
    const configuredAdvancedGuildIds = new Set(getDashboardAdvancedGuildIds());
    const manualPremiumGuildIds = getManualPremiumGuildIds();
    const premiumRolesByGuild = getManualPremiumRolesByGuild();
    const premiumUsersByGuild = getManualPremiumUsersByGuild();
    const guilds = Array.from(ctx.client.guilds.cache.values())
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

    const items = [];

    for (const guild of guilds) {
        await guild.roles.fetch().catch(() => null);

        const isConfiguredPremium = configuredAdvancedGuildIds.has(guild.id);
        const isManualPremium = manualPremiumGuildIds.has(guild.id);
        const isReferenceGuild = guild.id === SENTINEL_REFERENCE_GUILD_ID;
        const premiumRoleRows = premiumRolesByGuild.get(guild.id) || [];
        const premiumUserRows = premiumUsersByGuild.get(guild.id) || [];
        const premiumRoles = premiumRoleRows.map(row => {
            const role = guild.roles.cache.get(row.role_id);

            return {
                id: row.role_id,
                name: role?.name || null,
                exists: Boolean(role),
                grantedByUserId: row.granted_by_user_id || null,
                createdAt: row.created_at
            };
        });
        const premiumUsers = [];

        for (const row of premiumUserRows) {
            const member = await guild.members.fetch(row.user_id).catch(() => null);
            const user = member?.user || await ctx.client.users.fetch(row.user_id).catch(() => null);

            premiumUsers.push({
                id: row.user_id,
                tag: user?.tag || user?.username || null,
                username: user?.username || null,
                inGuild: Boolean(member),
                grantedByUserId: row.granted_by_user_id || null,
                createdAt: row.created_at
            });
        }

        const referenceStaffRoleIds = isReferenceGuild && ctx.helpers.getCommandRoleIds
            ? ctx.helpers.getCommandRoleIds(guild.id)
            : [];
        const referenceStaffRoles = referenceStaffRoleIds.map(roleId => {
            const role = guild.roles.cache.get(roleId);

            return {
                id: roleId,
                name: role?.name || null,
                exists: Boolean(role)
            };
        });
        const reasons = [];

        if (isConfiguredPremium) {
            reasons.push(isReferenceGuild ? 'Serveur de référence' : 'Serveur Premium configuré');
        }

        if (isManualPremium) {
            reasons.push('Premium serveur manuel');
        }

        if (premiumRoles.length > 0) {
            reasons.push(`${premiumRoles.length} rôle(s) Premium`);
        }

        if (premiumUsers.length > 0) {
            reasons.push(`${premiumUsers.length} personne(s) Premium`);
        }

        if (isReferenceGuild && referenceStaffRoles.length > 0) {
            reasons.push('Staff Sentinel reconnu automatiquement');
        }

        const fullPremium = isConfiguredPremium || isManualPremium;
        const partialPremium = !fullPremium && (
            premiumRoles.length > 0
            || premiumUsers.length > 0
            || (isReferenceGuild && referenceStaffRoles.length > 0)
        );

        items.push({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount || null,
            premium: fullPremium || partialPremium,
            premiumScope: fullPremium ? 'server' : (partialPremium ? 'partial' : 'none'),
            fullPremium,
            partialPremium,
            configuredPremium: isConfiguredPremium,
            manualPremium: isManualPremium,
            referenceGuild: isReferenceGuild,
            reasons,
            premiumRoles,
            premiumUsers,
            referenceStaffRoles
        });
    }

    const premiumOrder = { server: 0, partial: 1, none: 2 };
    items.sort((a, b) => {
        const scopeDiff = (premiumOrder[a.premiumScope] ?? 99) - (premiumOrder[b.premiumScope] ?? 99);

        if (scopeDiff !== 0) {
            return scopeDiff;
        }

        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
    });

    const summary = items.reduce((acc, item) => {
        acc.guildCount += 1;

        if (item.premiumScope === 'server') {
            acc.serverPremiumCount += 1;
        } else if (item.premiumScope === 'partial') {
            acc.partialPremiumCount += 1;
        } else {
            acc.freeCount += 1;
        }

        acc.premiumRoleCount += item.premiumRoles.length;
        acc.premiumUserCount += item.premiumUsers.length;
        return acc;
    }, {
        guildCount: 0,
        serverPremiumCount: 0,
        partialPremiumCount: 0,
        freeCount: 0,
        premiumRoleCount: 0,
        premiumUserCount: 0
    });

    const storage = ctx.helpers.getDatabaseBackupStatus
        ? ctx.helpers.getDatabaseBackupStatus()
        : null;
    const protectedStorage = storage && !siteAccess.isFounder && !storage.error
        ? {
            ...storage,
            latestFile: null,
            lastBackupFailure: storage.lastBackupFailure ? { occurredAt: storage.lastBackupFailure.occurredAt } : null,
            backups: (storage.backups || []).map(({ fileName, ...backup }) => ({
                ...backup,
                verification: backup.verification ? {
                    status: backup.verification.status,
                    checkedAt: backup.verification.checkedAt,
                    integrityResult: backup.verification.integrityResult,
                    durationMs: backup.verification.durationMs
                } : null
            })),
            coldArchives: (storage.coldArchives || []).map(({ fileName, ...archive }) => archive),
            lastMaintenance: storage.lastMaintenance ? {
                startedAt: storage.lastMaintenance.startedAt,
                completedAt: storage.lastMaintenance.completedAt,
                durationMs: storage.lastMaintenance.durationMs,
                reason: storage.lastMaintenance.reason,
                cleanup: storage.lastMaintenance.cleanup,
                archived: storage.lastMaintenance.archived ? {
                    automodEvents: storage.lastMaintenance.archived.automodEvents,
                    dashboardAuditLogs: storage.lastMaintenance.archived.dashboardAuditLogs,
                    bytes: storage.lastMaintenance.archived.bytes
                } : null,
                backupVerification: storage.lastMaintenance.backupVerification ? {
                    status: storage.lastMaintenance.backupVerification.status,
                    checkedAt: storage.lastMaintenance.backupVerification.checkedAt,
                    durationMs: storage.lastMaintenance.backupVerification.durationMs
                } : null,
                media: storage.lastMaintenance.media ? {
                    checked: storage.lastMaintenance.media.checked,
                    orphaned: storage.lastMaintenance.media.orphaned,
                    synchronized: storage.lastMaintenance.media.synchronized,
                    purged: storage.lastMaintenance.media.purged
                } : null
            } : null,
            alerts: (storage.alerts || []).map(alert => ({
                key: alert.key,
                level: alert.level,
                message: alert.message,
                firstSeenAt: alert.firstSeenAt,
                lastSeenAt: alert.lastSeenAt
            })),
            performance: {
                database: storage.performance?.database ? {
                    ...storage.performance.database,
                    recentSlowQueries: []
                } : null,
                runtime: storage.performance?.runtime ? {
                    ...storage.performance.runtime,
                    dashboard: {
                        ...storage.performance.runtime.dashboard,
                        recentSlowRequests: []
                    },
                    discord: {
                        ...storage.performance.runtime.discord,
                        recentSlowInteractions: []
                    }
                } : null
            }
        }
        : storage;

    return {
        generatedAt: new Date().toISOString(),
        canView: true,
        access: siteAccess,
        summary,
        storage: protectedStorage,
        staff: await getSiteStaffUsers(ctx),
        guilds: items
    };
}

function getDossierStatusLabel(status, language = 'fr') {
    const labels = {
        open: { fr: 'Ouvert', en: 'Open' },
        in_progress: { fr: 'En cours', en: 'In progress' },
        waiting: { fr: 'En attente', en: 'Waiting' },
        resolved: { fr: 'Résolu', en: 'Resolved' },
        closed: { fr: 'Fermé', en: 'Closed' }
    };
    const key = String(status || 'open').trim().toLowerCase().replace(/-/g, '_');
    const copy = labels[key] || labels.open;

    return copy[language === 'en' ? 'en' : 'fr'];
}

function normalizeUserId(ctx, value, language = 'fr') {
    const userId = ctx.helpers.normalizeUserId(value);

    if (!userId) {
        throw createHttpError(400, 'Invalid Discord user ID.', {
            fix: getErrorLanguage(language) === 'en'
                ? 'Copy the full numeric Discord ID, not the username.'
                : 'Copie l’ID Discord numérique complet de la personne, pas son pseudo.'
        });
    }

    return userId;
}

function getReason(ctx, value, language = 'fr') {
    return ctx.helpers.getReason(value, language);
}

async function resolveTarget(ctx, guild, userId) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await ctx.client.users.fetch(userId).catch(() => null);

    return {
        userId,
        member,
        user,
        label: user ? `${user}` : `user ID ${userId}`
    };
}

function getChannel(guild, channelId) {
    return guild.channels.cache.get(channelId) || null;
}

function getTextChannel(guild, channelId, language = 'fr') {
    const channel = getChannel(guild, channelId);

    if (!channel || !channel.isTextBased()) {
        throw createHttpError(400, 'Text channel not found.', {
            fix: getDashboardTextChannelFix(language)
        });
    }

    return channel;
}

function mapModerationCase(ctx, item) {
    return {
        id: item.id,
        targetUserId: item.target_user_id,
        moderatorUserId: item.moderator_user_id,
        action: item.action,
        reason: item.reason,
        duration: item.duration,
        durationLabel: item.duration ? ctx.helpers.formatDuration(item.duration) : null,
        createdAt: item.created_at
    };
}

function mapDossier(item) {
    return {
        id: item.id,
        guildId: item.guildId || item.guild_id,
        channelId: item.channelId || item.channel_id,
        ownerUserId: item.ownerUserId || item.owner_user_id,
        openerUserId: item.openerUserId || item.opener_user_id,
        type: item.type,
        status: item.status,
        priority: item.priority || 'normal',
        subject: item.subject || null,
        description: item.description || null,
        referentUserId: item.referentUserId || item.referent_user_id,
        createdAt: item.createdAt || item.created_at,
        closedAt: item.closedAt || item.closed_at,
        closedByUserId: item.closedByUserId || item.closed_by_user_id
    };
}

function getUserDossiersForProfile(guildId, userId, limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);

    return db.prepare(`
        SELECT *
        FROM sentinel_dossiers
        WHERE guild_id = ?
          AND (
            owner_user_id = ?
            OR opener_user_id = ?
            OR referent_user_id = ?
          )
        ORDER BY status != 'closed' DESC, datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(guildId, userId, userId, userId, safeLimit).map(mapDossier);
}

function permissionCheck(id, label, ok, fix, detail = null) {
    return {
        id,
        label,
        ok: Boolean(ok),
        value: ok ? 'Oui' : 'Non',
        fix: ok ? null : fix,
        detail
    };
}

function buildPermissionDiagnostics(ctx, guild, config) {
    const botMember = guild.members.me;
    const serviceRole = config.serviceRoleId ? guild.roles.cache.get(config.serviceRoleId) : null;
    const autoRole = config.autoRoleId ? guild.roles.cache.get(config.autoRoleId) : null;
    const logChannel = config.logChannelId ? guild.channels.cache.get(config.logChannelId) : null;
    const statusChannel = config.statusChannelId ? guild.channels.cache.get(config.statusChannelId) : null;
    const botPermissions = botMember?.permissions;
    const logPermissions = logChannel && botMember ? logChannel.permissionsFor(botMember) : null;
    const statusPermissions = statusChannel && botMember ? statusChannel.permissionsFor(botMember) : null;
    const has = permission => Boolean(botPermissions?.has(permission));
    const canManageRoles = has(PermissionsBitField.Flags.ManageRoles);
    const serviceRoleTooHigh = Boolean(
        serviceRole
        && botMember
        && botMember.roles.highest.comparePositionTo(serviceRole) <= 0
    );
    const autoRoleTooHigh = Boolean(
        autoRole
        && botMember
        && botMember.roles.highest.comparePositionTo(autoRole) <= 0
    );
    const logChannelWritable = !logChannel || Boolean(
        logPermissions?.has(PermissionsBitField.Flags.ViewChannel)
        && logPermissions?.has(PermissionsBitField.Flags.SendMessages)
    );
    const statusChannelWritable = !config.statusChannelId || Boolean(
        statusChannel
        && statusPermissions?.has(PermissionsBitField.Flags.ViewChannel)
        && statusPermissions?.has(PermissionsBitField.Flags.SendMessages)
        && statusPermissions?.has(PermissionsBitField.Flags.EmbedLinks)
    );
    const checks = [
        permissionCheck(
            'ban',
            'Sentinel peut bannir',
            has(PermissionsBitField.Flags.BanMembers),
            'Ajoute la permission “Bannir des membres” au rôle Sentinel.'
        ),
        permissionCheck(
            'timeout',
            'Sentinel peut timeout',
            has(PermissionsBitField.Flags.ModerateMembers),
            'Ajoute la permission “Exclure temporairement des membres” au rôle Sentinel.'
        ),
        permissionCheck(
            'kick',
            'Sentinel peut expulser',
            has(PermissionsBitField.Flags.KickMembers),
            'Ajoute la permission “Expulser des membres” au rôle Sentinel.'
        ),
        permissionCheck(
            'purge',
            'Sentinel peut purger',
            has(PermissionsBitField.Flags.ManageMessages),
            'Ajoute la permission “Gérer les messages” au rôle Sentinel.'
        ),
        permissionCheck(
            'manageChannels',
            'Sentinel peut créer des salons',
            has(PermissionsBitField.Flags.ManageChannels),
            'Ajoute la permission “Gérer les salons” au rôle Sentinel.'
        ),
        permissionCheck(
            'attachFiles',
            'Sentinel peut joindre des fichiers',
            has(PermissionsBitField.Flags.AttachFiles),
            'Ajoute la permission “Joindre des fichiers” au rôle Sentinel pour les comptes rendus.'
        ),
        permissionCheck(
            'manageRoles',
            'Sentinel peut gérer les rôles',
            canManageRoles,
            'Ajoute la permission “Gérer les rôles” au rôle Sentinel.'
        ),
        permissionCheck(
            'autoRole',
            'Rôle automatique d’arrivée',
            !config.autoRoleId || Boolean(autoRole),
            'Choisis un rôle automatique valide, ou désactive cette option.'
        ),
        permissionCheck(
            'serviceRole',
            'Rôle de service configuré',
            Boolean(serviceRole),
            'Choisis le rôle de service dans l’assistant de configuration.'
        ),
        {
            id: 'roleOrder',
            label: 'Rôle Sentinel trop bas',
            ok: !serviceRoleTooHigh,
            value: serviceRoleTooHigh ? 'Oui' : 'Non',
            fix: serviceRoleTooHigh
                ? `Monte le rôle Sentinel au-dessus du rôle “${serviceRole.name}”.`
                : null,
            detail: serviceRole ? `Rôle de service : ${serviceRole.name}` : null
        },
        {
            id: 'autoRoleOrder',
            label: 'Auto-rôle trop haut',
            ok: !autoRoleTooHigh,
            value: autoRoleTooHigh ? 'Oui' : 'Non',
            fix: autoRoleTooHigh
                ? `Monte le rôle Sentinel au-dessus du rôle “${autoRole.name}”.`
                : null,
            detail: autoRole ? `Rôle automatique : ${autoRole.name}` : null
        },
        permissionCheck(
            'logs',
            'Salon de logs accessible',
            logChannelWritable,
            logChannel
                ? `Autorise Sentinel à voir et écrire dans #${logChannel.name}.`
                : 'Le salon de logs est optionnel, mais recommandé.'
        ),
        permissionCheck(
            'statusChannel',
            'Salon statut accessible',
            statusChannelWritable,
            statusChannel
                ? `Autorise Sentinel à voir, écrire et intégrer des liens dans #${statusChannel.name}.`
                : (config.statusChannelId
                    ? 'Choisis un autre salon statut ou désactive cette option.'
                    : 'Le salon statut est optionnel.')
        )
    ];

    return {
        canBan: has(PermissionsBitField.Flags.BanMembers),
        canTimeout: has(PermissionsBitField.Flags.ModerateMembers),
        canKick: has(PermissionsBitField.Flags.KickMembers),
        canPurge: has(PermissionsBitField.Flags.ManageMessages),
        canManageChannels: has(PermissionsBitField.Flags.ManageChannels),
        canAttachFiles: has(PermissionsBitField.Flags.AttachFiles),
        canManageRoles,
        serviceRoleTooHigh,
        autoRoleTooHigh,
        canManageServiceRole: Boolean(serviceRole && canManageRoles && !serviceRoleTooHigh),
        canManageAutoRole: Boolean(autoRole && canManageRoles && !autoRoleTooHigh),
        logChannelWritable,
        statusChannelWritable,
        checks,
        fixes: checks.filter(item => !item.ok).map(item => item.fix)
    };
}

function getStatusListFromEnv(name) {
    return String(process.env[name] || '')
        .split(/\r?\n|;;/)
        .map(item => item.trim())
        .filter(Boolean);
}

async function buildUserDashboardProfile(ctx, guild, userId, session = null) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const user = member?.user || await ctx.client.users.fetch(userId).catch(() => null);
    const viewerMember = session?.user?.id
        ? await guild.members.fetch(session.user.id).catch(() => null)
        : null;
    const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, viewerMember, session);
    const sessionLimit = advanced ? 25 : 5;
    const caseLimit = advanced ? 25 : 10;
    const dossierLimit = advanced ? 25 : 10;
    const userData = ctx.helpers.getUserData(guild.id, userId);
    const sessions = ctx.helpers.getUserSessions(guild.id, userId, sessionLimit);
    const cases = ctx.helpers.getModerationCases(guild.id, userId, caseLimit);
    const dossiers = getUserDossiersForProfile(guild.id, userId, dossierLimit);
    const payroll = ctx.helpers.getWeeklyPayroll
        ? ctx.helpers.getWeeklyPayroll(guild.id, {
            language: ctx.helpers.getGuildLanguage(guild.id),
            guild
        })
        : null;
    const payrollArchives = ctx.helpers.getWeeklyPayrollArchives
        ? ctx.helpers.getWeeklyPayrollArchives(guild.id, {
            language: ctx.helpers.getGuildLanguage(guild.id),
            guild,
            limit: 52
        })
        : { items: [] };
    const payrollLine = payroll?.items?.find(item => item.userId === userId) || null;
    const payrollHistory = (payrollArchives.items || [])
        .map(archive => ({
            weekStart: archive.weekStart,
            weekEnd: archive.weekEnd,
            line: archive.items.find(item => item.userId === userId) || null
        }))
        .filter(item => item.line)
        .slice(0, 12);
    const actionsByTarget = getDashboardAuditLogs({ guildId: guild.id, targetId: userId, limit: 10 });
    const actionsByActor = getDashboardAuditLogs({ guildId: guild.id, actorUserId: userId, limit: 10 });
    const actions = Array.from(
        new Map([...actionsByTarget, ...actionsByActor].map(item => [item.id, item])).values()
    )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);

    return {
        user: {
            id: userId,
            tag: user?.tag || user?.username || null,
            username: user?.username || null,
            avatar: user?.displayAvatarURL?.({ extension: 'png', size: 128 }) || null,
            inGuild: Boolean(member)
        },
        service: {
            totalTime: userData?.totalTime || 0,
            totalTimeLabel: ctx.helpers.formatDuration(userData?.totalTime || 0),
            active: Boolean(userData?.startTime),
            activeDuration: userData?.startTime ? Date.now() - userData.startTime : 0,
            activeDurationLabel: userData?.startTime ? ctx.helpers.formatDuration(Date.now() - userData.startTime) : null,
            sessionCount: ctx.helpers.getUserSessionCount(guild.id, userId),
            sessions: sessions.map(item => ({
                date: item.date,
                duration: item.duration || 0,
                durationLabel: ctx.helpers.formatDuration(item.duration || 0)
            }))
        },
        moderationCases: {
            limit: caseLimit,
            items: cases.map(item => mapModerationCase(ctx, item))
        },
        dossiers: {
            limit: dossierLimit,
            items: dossiers
        },
        payroll: payroll
            ? {
                weekStart: payroll.weekStart,
                weekEnd: payroll.weekEnd,
                line: payrollLine
                    ? {
                        totalTimeLabel: payrollLine.totalTimeLabel,
                        hourlyRateLabel: payrollLine.hourlyRateLabel,
                        adjustmentAmountLabel: payrollLine.adjustmentAmountLabel,
                        amountLabel: payrollLine.amountLabel,
                        paid: payrollLine.paid,
                        paidAt: payrollLine.paidAt,
                        paidByUserId: payrollLine.paidByUserId
                    }
                    : null,
                history: payrollHistory.map(item => ({
                    weekStart: item.weekStart,
                    weekEnd: item.weekEnd,
                    amountLabel: item.line.amountLabel,
                    paid: item.line.paid,
                    updatedAt: item.line.updatedAt
                }))
            }
            : null,
        actions
    };
}

async function buildGuildState(ctx, guild, session = null) {
    await Promise.all([
        guild.roles.fetch().catch(() => null),
        guild.channels.fetch().catch(() => null)
    ]);

    const config = ctx.helpers.getGuildConfig(guild.id);
    const summary = ctx.helpers.getServiceSummary(guild.id);
    const viewerUserId = session?.user?.id || null;
    const viewerMember = viewerUserId
        ? await guild.members.fetch(viewerUserId).catch(() => null)
        : null;
    const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, viewerMember, session);
    const viewerData = viewerUserId ? ctx.helpers.getUserData(guild.id, viewerUserId) : null;
    const viewerSessions = viewerUserId && ctx.helpers.getUserSessions
        ? ctx.helpers.getUserSessions(guild.id, viewerUserId, 8)
        : [];
    const viewerSessionCount = viewerUserId && ctx.helpers.getUserSessionCount
        ? ctx.helpers.getUserSessionCount(guild.id, viewerUserId)
        : viewerSessions.length;
    const commandRoleIds = ctx.helpers.getCommandRoleIds(guild.id);
    const dossierRoleIds = ctx.helpers.getDossierRoleIds
        ? ctx.helpers.getDossierRoleIds(guild.id)
        : [];
    const customEmbedQuota = applyDashboardPremiumQuota(
        ctx.helpers.getCustomEmbedQuota(guild.id, viewerMember),
        advanced
    );
    const siteAccess = await getSiteAccess(ctx, session?.user?.id);
    const canViewGlobalAudit = siteAccess.isFounder;
    const auditLimit = advanced || canViewGlobalAudit ? 50 : 10;
    const moderationCaseLimit = advanced || canViewGlobalAudit ? 25 : 10;
    const dossierHistoryLimit = advanced || canViewGlobalAudit ? 100 : 10;
    const moderationCases = ctx.helpers.getRecentModerationCases
        ? ctx.helpers.getRecentModerationCases(guild.id, moderationCaseLimit)
        : [];
    const automodSettings = ctx.helpers.getDashboardAutomodSettings
        ? ctx.helpers.getDashboardAutomodSettings(guild.id)
        : null;
    const automodWords = ctx.helpers.getAutomodWords
        ? ctx.helpers.getAutomodWords(guild.id)
        : [];
    const automodEvents = ctx.helpers.getRecentAutomodEvents
        ? ctx.helpers.getRecentAutomodEvents(guild.id, advanced || canViewGlobalAudit ? 25 : 10)
        : [];
    const roles = guild.roles.cache
        .filter(role => !role.managed && role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor
        }));
    const channels = guild.channels.cache
        .filter(channel => channel.isTextBased?.())
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(channel => ({
            id: channel.id,
            name: channel.name,
            type: channel.type
        }));
    const categories = guild.channels.cache
        .filter(channel => channel.type === ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(channel => ({
            id: channel.id,
            name: channel.name,
            type: channel.type
        }));

    return {
        guild: {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL()
        },
        advanced,
        creator: {
            canViewPremiumOverview: siteAccess.canViewSitePanel,
            canManagePremium: siteAccess.canManagePremium,
            canManageSiteStaff: siteAccess.canManageSiteStaff,
            role: siteAccess.role
        },
        siteAccess,
        inviteUrl: getInviteUrl(ctx, guild.id),
        config: {
            ...config,
            commandRoleIds
        },
        roles,
        channels,
        categories,
        summary: {
            registeredUsers: summary.registeredUsers,
            activeCount: summary.activeServices.length,
            totalServiceTime: ctx.helpers.formatDuration(summary.totalServiceTime),
            weeklyServiceTime: ctx.helpers.formatDuration(summary.weeklyServiceTime),
            bestUser: summary.bestUser,
            bestWeekUser: summary.bestWeekUser
        },
        activeServices: ctx.helpers.getActiveServices(guild.id).slice(0, 20).map(service => ({
            ...service,
            durationLabel: ctx.helpers.formatDuration(service.duration)
        })),
        topService: ctx.helpers.getTopService(guild.id).slice(0, 10).map(user => ({
            ...user,
            totalTimeLabel: ctx.helpers.formatDuration(user.totalTime)
        })),
        topWeek: ctx.helpers.getTopWeek(guild.id).slice(0, 10).map(user => ({
            ...user,
            totalTimeLabel: ctx.helpers.formatDuration(user.totalTime)
        })),
        payroll: ctx.helpers.getWeeklyPayroll
            ? ctx.helpers.getWeeklyPayroll(guild.id, { language: config.language, guild })
            : null,
        payrollArchives: ctx.helpers.getWeeklyPayrollArchives
            ? ctx.helpers.getWeeklyPayrollArchives(guild.id, {
                language: config.language,
                guild,
                limit: 12
            })
            : { limit: 12, totalCount: 0, hasMore: false, items: [] },
        personalService: viewerUserId
            ? {
                userId: viewerUserId,
                totalTime: viewerData?.totalTime || 0,
                totalTimeLabel: ctx.helpers.formatDuration(viewerData?.totalTime || 0),
                active: Boolean(viewerData?.startTime),
                activeDuration: viewerData?.startTime ? Date.now() - viewerData.startTime : 0,
                activeDurationLabel: viewerData?.startTime ? ctx.helpers.formatDuration(Date.now() - viewerData.startTime) : null,
                sessionCount: viewerSessionCount,
                sessions: viewerSessions.map(item => ({
                    date: item.date,
                    duration: item.duration || 0,
                    durationLabel: ctx.helpers.formatDuration(item.duration || 0)
                }))
            }
            : null,
        customEmbeds: {
            quota: customEmbedQuota,
            items: ctx.helpers.getCustomEmbeds(guild.id).map(item => ({
                messageId: item.message_id,
                channelId: item.channel_id,
                title: item.title,
                description: item.description,
                color: item.color,
                imageUrl: item.image_url,
                thumbnailUrl: item.thumbnail_url,
                footer: item.footer,
                updatedAt: item.updated_at
            }))
        },
        dossiers: {
            openCount: ctx.helpers.getOpenDossierCount(guild.id),
            historyLimit: dossierHistoryLimit,
            roleIds: dossierRoleIds,
            panelQuota: applyDashboardPremiumQuota(
                ctx.helpers.getDossierPanelQuota
                    ? ctx.helpers.getDossierPanelQuota(guild.id, viewerMember)
                    : { used: 0, limit: 1, unlimited: false, remaining: 1 },
                advanced
            ),
            settings: ctx.helpers.getDossierTypeSettings
                ? ctx.helpers.getDossierTypeSettings(guild.id)
                : [],
            items: ctx.helpers.getRecentDossiers(guild.id, dossierHistoryLimit).map(mapDossier)
        },
        diagnostics: buildPermissionDiagnostics(ctx, guild, config),
        moderationCases: {
            limit: moderationCaseLimit,
            items: moderationCases.map(item => mapModerationCase(ctx, item))
        },
        automod: {
            settings: automodSettings,
            words: automodWords,
            events: automodEvents
        },
        recentActions: getDashboardAuditLogs({
            guildId: guild.id,
            limit: 5
        }),
        auditLogs: {
            canViewGlobal: canViewGlobalAudit,
            limit: auditLimit,
            items: getDashboardAuditLogs({
                guildId: guild.id,
                limit: auditLimit
            })
        }
    };
}

async function startServiceForUser(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const userId = normalizeUserId(ctx, body.userId);
    const role = ctx.helpers.getServiceRole(guild);
    const language = ctx.helpers.getGuildLanguage(guild.id);

    if (!role) {
        throw createHttpError(400, 'Aucun rôle de service n’est configuré.');
    }

    const roleError = ctx.helpers.getServiceRoleManageError
        ? ctx.helpers.getServiceRoleManageError(guild, role, language)
        : null;

    if (roleError) {
        throw createHttpError(400, roleError);
    }

    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) {
        throw createHttpError(400, 'Cette personne doit être présente sur le serveur pour prendre son service.');
    }

    const userData = ctx.helpers.createUserIfMissing(guild.id, userId);

    if (userData?.startTime) {
        throw createHttpError(409, 'Cette personne est déjà en service.');
    }

    const serviceStartTime = Date.now();

    await member.roles.add(role);
    ctx.helpers.updateUserTime(guild.id, userId, userData?.totalTime || 0, serviceStartTime);

    if (ctx.helpers.sendServiceLog) {
        await ctx.helpers.sendServiceLog(guild, member, 'start', {
            startTime: serviceStartTime,
            source: 'Dashboard',
            actor: actor.user,
            language
        });
    }

    return `${member.user.tag} est maintenant en service.`;
}

async function endServiceForUser(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const userId = normalizeUserId(ctx, body.userId);
    const userData = ctx.helpers.getUserData(guild.id, userId);
    const language = ctx.helpers.getGuildLanguage(guild.id);

    if (!userData?.startTime) {
        throw createHttpError(409, 'Cette personne n’est pas en service.');
    }

    const duration = Date.now() - userData.startTime;
    const totalTime = (userData.totalTime || 0) + duration;
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = ctx.helpers.getServiceRole(guild);

    if (member && role) {
        const roleError = ctx.helpers.getServiceRoleManageError
            ? ctx.helpers.getServiceRoleManageError(guild, role, language)
            : null;

        if (roleError) {
            throw createHttpError(400, roleError);
        }

        await member.roles.remove(role);
    }

    ctx.helpers.addSession(guild.id, userId, duration);
    ctx.helpers.updateUserTime(guild.id, userId, totalTime, null);

    if (ctx.helpers.sendServiceLog) {
        await ctx.helpers.sendServiceLog(guild, member, 'end', {
            duration,
            totalTime,
            userId,
            source: 'Dashboard',
            actor: actor.user,
            language
        });
    }

    return `Service terminé. Durée : ${ctx.helpers.formatDuration(duration)}.`;
}

async function resetUserFromDashboard(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const userId = normalizeUserId(ctx, body.userId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = ctx.helpers.getServiceRole(guild);
    const language = ctx.helpers.getGuildLanguage(guild.id);

    if (member && role) {
        const roleError = ctx.helpers.getServiceRoleManageError
            ? ctx.helpers.getServiceRoleManageError(guild, role, language)
            : null;

        if (roleError) {
            throw createHttpError(400, roleError);
        }

        await member.roles.remove(role);
    }

    ctx.helpers.resetUser(guild.id, userId);
    ctx.helpers.clearLongServiceAlert?.(guild.id, userId);

    return `Heures réinitialisées pour ${member?.user?.tag || userId}.`;
}

const AUTOMOD_PREMIUM_BODY_KEYS = new Set([
    'premiumCapsEnabled',
    'premiumCapsAction',
    'premiumMentionsEnabled',
    'premiumMentionsAction',
    'premiumMentionLimit',
    'premiumProgressiveEnabled',
    'premiumProgressiveWindowMinutes',
    'premiumProgressiveTimeoutThreshold',
    'premiumProgressiveKickThreshold',
    'premiumProgressiveBanThreshold',
    'premiumRaidEnabled',
    'premiumRaidJoinCount',
    'premiumRaidWindowSeconds',
    'premiumIgnoredRoleIds',
    'premiumIgnoredChannelIds'
]);

function normalizeDashboardAutomodWord(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

async function automodAction(ctx, guild, actor, body, session = null) {
    requireCommandAccess(ctx, actor);

    const action = body.action;
    const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, actor, session);
    const hasPremiumPatch = Object.keys(body || {}).some(key => AUTOMOD_PREMIUM_BODY_KEYS.has(key));

    if (hasPremiumPatch && !advanced) {
        throw createHttpError(402, 'This action is reserved for Sentinel Premium.');
    }

    if (action === 'set-automod-settings') {
        ctx.helpers.updateAutomodSettings(guild.id, body, {
            premium: advanced,
            premiumUserId: session?.user?.id || actor?.id || null
        });

        return 'Auto-modération mise à jour.';
    }

    if (action === 'add-automod-word') {
        const word = normalizeDashboardAutomodWord(body.word);

        if (word.length < 2) {
            throw createHttpError(400, 'Automod word is invalid.');
        }

        const settings = ctx.helpers.getDashboardAutomodSettings?.(guild.id) || {};
        const words = ctx.helpers.getAutomodWords?.(guild.id) || [];
        const alreadyExists = words.some(item => item.word === word);
        const limit = advanced
            ? (settings.premiumWordLimit || 200)
            : (settings.freeWordLimit || 25);

        if (!alreadyExists && words.length >= limit) {
            throw createHttpError(402, `Limite auto-mod atteinte : ${limit} mot(s) interdits.`);
        }

        const savedWord = ctx.helpers.addAutomodWord(guild.id, word, actor.id);

        if (!savedWord) {
            throw createHttpError(400, 'Automod word is invalid.');
        }

        return `Mot interdit ajoute : ${savedWord.word}.`;
    }

    if (action === 'remove-automod-word') {
        const word = normalizeDashboardAutomodWord(body.word);

        if (!word) {
            throw createHttpError(400, 'Automod word is invalid.');
        }

        ctx.helpers.removeAutomodWord(guild.id, word);
        return `Mot interdit retire : ${word}.`;
    }

    throw createHttpError(400, 'Unknown automod action.');
}

async function moderationAction(ctx, guild, actor, body, session = null) {
    const language = ctx.helpers.getGuildLanguage(guild.id);
    const action = body.action;
    const reason = getReason(ctx, body.reason, language);

    if (action === 'warn') {
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ModerateMembers, language);
        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId, language));
        const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'warn', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
        return `Avertissement ajoute. Cas #${caseData.id}.`;
    }

    if (action === 'timeout' || action === 'untimeout' || action === 'kick') {
        const flag = action === 'kick'
            ? PermissionsBitField.Flags.KickMembers
            : PermissionsBitField.Flags.ModerateMembers;
        requireModerationAccess(ctx, actor, flag, language);
        requireBotPermission(guild, flag, language);

        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId, language));
        const targetError = ctx.helpers.getModerationTargetError(actor, target.member, language);

        if (targetError) {
            throw createHttpError(400, targetError);
        }

        if (action === 'timeout') {
            const duration = ctx.helpers.parseDurationToMs(body.duration);

            if (!duration || duration > ctx.maxTimeoutDuration) {
                throw createHttpError(400, 'Invalid timeout duration.');
            }

            try {
                await target.member.timeout(duration, reason);
            } catch (error) {
                throw createDiscordActionError(error, guild, flag, language, target.member);
            }

            const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'timeout', reason, duration);
            await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
            return `Timeout applique. Cas #${caseData.id}.`;
        }

        if (action === 'untimeout') {
            try {
                await target.member.timeout(null, reason);
            } catch (error) {
                throw createDiscordActionError(error, guild, flag, language, target.member);
            }

            const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'untimeout', reason, null);
            await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
            return `Timeout retire. Cas #${caseData.id}.`;
        }

        try {
            await target.member.kick(reason);
        } catch (error) {
            throw createDiscordActionError(error, guild, flag, language, target.member);
        }

        const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'kick', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
        return `Membre expulse. Cas #${caseData.id}.`;
    }

    if (action === 'ban' || action === 'tempban') {
        if (action === 'tempban') {
            await requireAdvanced(ctx, guild.id, actor, session);
        }

        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.BanMembers, language);
        requireBotPermission(guild, PermissionsBitField.Flags.BanMembers, language);

        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId, language));
        const targetError = ctx.helpers.getUserTargetErrorById(guild, actor, target.userId, target.member, language);

        if (targetError) {
            throw createHttpError(400, targetError);
        }

        const deleteDays = Math.min(Math.max(Number(body.deleteDays) || 0, 0), 7);
        let duration = null;

        if (action === 'tempban') {
            duration = ctx.helpers.parseDurationToMs(body.duration);

            if (!duration || duration > ctx.maxTempbanDuration) {
                throw createHttpError(400, 'Invalid temporary ban duration.');
            }
        }

        try {
            await guild.members.ban(target.userId, {
                reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.BanMembers, language, target.member);
        }

        const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, action, reason, duration);

        if (action === 'tempban') {
            ctx.helpers.upsertTemporaryBan(guild.id, target.userId, actor.id, reason, duration, Date.now() + duration, caseData.id);
        } else {
            ctx.helpers.deleteTemporaryBan(guild.id, target.userId);
        }

        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
        return action === 'tempban' ? `Ban temporaire programme. Cas #${caseData.id}.` : `Utilisateur banni. Cas #${caseData.id}.`;
    }

    if (action === 'unban') {
        await requireAdvanced(ctx, guild.id, actor, session);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.BanMembers, language);
        requireBotPermission(guild, PermissionsBitField.Flags.BanMembers, language);

        const userId = normalizeUserId(ctx, body.userId, language);

        try {
            await guild.bans.remove(userId, reason);
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.BanMembers, language);
        }

        ctx.helpers.deleteTemporaryBan(guild.id, userId);

        const caseData = ctx.helpers.addModerationCase(guild.id, userId, actor.id, 'unban', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `user ID ${userId}`, language);
        return `Utilisateur debanni. Cas #${caseData.id}.`;
    }

    if (action === 'purge') {
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ManageMessages, language);
        requireBotPermission(guild, PermissionsBitField.Flags.ManageMessages, language);

        const channel = getTextChannel(guild, body.channelId, language);
        requireBotChannelPermissions(guild, channel, [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages
        ], language);
        const count = Math.min(Math.max(Number(body.count) || 1, 1), 100);
        let deleted;

        try {
            deleted = await channel.bulkDelete(count, true);
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.ManageMessages, language);
        }

        const caseData = ctx.helpers.addModerationCase(guild.id, null, actor.id, 'clear', `${count} messages demandes dans #${channel.name}`, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `${channel}`, language);
        return `${deleted.size} message(s) supprime(s).`;
    }

    if (['lock', 'unlock', 'slowmode'].includes(action)) {
        await requireAdvanced(ctx, guild.id, actor, session);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ManageChannels, language);
        requireBotPermission(guild, PermissionsBitField.Flags.ManageChannels, language);

        const channel = getTextChannel(guild, body.channelId, language);

        if (action === 'lock') {
            try {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                }, { reason });
            } catch (error) {
                throw createDiscordActionError(error, guild, PermissionsBitField.Flags.ManageChannels, language);
            }
        }

        if (action === 'unlock') {
            try {
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null
                }, { reason });
            } catch (error) {
                throw createDiscordActionError(error, guild, PermissionsBitField.Flags.ManageChannels, language);
            }
        }

        if (action === 'slowmode') {
            const seconds = ctx.helpers.parseSlowmodeToSeconds(body.duration);

            if (seconds === null || seconds > 21600) {
                throw createHttpError(400, 'Invalid slowmode duration.');
            }

            try {
                await channel.setRateLimitPerUser(seconds, reason);
            } catch (error) {
                throw createDiscordActionError(error, guild, PermissionsBitField.Flags.ManageChannels, language);
            }
        }

        const duration = action === 'slowmode'
            ? ctx.helpers.parseSlowmodeToSeconds(body.duration) * 1000
            : null;
        const caseData = ctx.helpers.addModerationCase(guild.id, null, actor.id, action, `${channel} - ${reason}`, duration);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `${channel}`, language);
        return `Action ${action} appliquee. Cas #${caseData.id}.`;
    }

    if (['edit-case', 'delete-case', 'unwarn'].includes(action)) {
        await requireAdvanced(ctx, guild.id, actor, session);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ModerateMembers, language);

        const caseId = Number(body.caseId);
        const caseRow = ctx.helpers.getModerationCase(guild.id, caseId);

        if (!caseRow) {
            throw createHttpError(404, 'Case not found.');
        }

        if (action === 'edit-case') {
            ctx.helpers.updateModerationCaseReason(guild.id, caseId, reason);
            return `Cas #${caseId} modifie.`;
        }

        if (action === 'unwarn' && caseRow.action !== 'warn') {
            throw createHttpError(400, 'Only warning cases can be removed with unwarn.');
        }

        ctx.helpers.deleteModerationCase(guild.id, caseId);
        const auditAction = action === 'unwarn' ? 'unwarn' : 'case_delete';
        const caseData = ctx.helpers.addModerationCase(guild.id, caseRow.target_user_id, actor.id, auditAction, `Cas original #${caseId}. ${reason}`, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, caseRow.target_user_id ? `<@${caseRow.target_user_id}>` : `#${caseId}`, language);
        return action === 'unwarn' ? `Avertissement #${caseId} retire.` : `Cas #${caseId} supprime.`;
    }

    throw createHttpError(400, 'Unknown moderation action.');
}

async function customEmbedAction(ctx, guild, actor, body, session = null) {
    requireCommandAccess(ctx, actor);

    const language = ctx.helpers.getGuildLanguage(guild.id);
    const action = body.action;
    const roleToPing = body.roleId ? guild.roles.cache.get(body.roleId) : null;

    if (body.roleId && !roleToPing) {
        throw createHttpError(400, 'Role not found.');
    }

    if (action === 'custom-embed-create') {
        const channel = getTextChannel(guild, body.channelId, language);
        const hasUploadedFiles = Boolean(ctx.helpers.hasCustomEmbedUpload?.(body));
        const channelError = ctx.helpers.getCustomEmbedChannelError(guild, channel, roleToPing, language, hasUploadedFiles);

        if (channelError) {
            throw createHttpError(403, channelError);
        }

        const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, actor, session);
        const quota = applyDashboardPremiumQuota(
            ctx.helpers.getCustomEmbedQuota(guild.id, actor),
            advanced
        );

        if (!quota.unlimited && quota.used >= quota.limit) {
            throw createHttpError(402, `Quota gratuit atteint : ${quota.limit} embeds actifs.`);
        }

        let data;

        try {
            ({ data } = ctx.helpers.buildCustomEmbedData({
                title: body.title,
                description: body.description,
                color: body.color,
                imageUrl: body.imageUrl,
                thumbnailUrl: body.thumbnailUrl,
                footer: body.footer
            }, null, language));
        } catch (error) {
            throw createHttpError(400, error.message);
        }

        let files = [];

        try {
            files = ctx.helpers.prepareCustomEmbedUploads
                ? ctx.helpers.prepareCustomEmbedUploads(body, data, language)
                : [];
        } catch (error) {
            throw createHttpError(400, error.message);
        }

        let sentMessage;

        try {
            sentMessage = await channel.send(ctx.helpers.buildCustomEmbedPayload(data, roleToPing, language, files));
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        if (!sentMessage) {
            throw createHttpError(403, 'Sentinel cannot send this embed in the selected channel.', {
                fix: getDashboardChannelPermissionFix(channel, PermissionsBitField.Flags.SendMessages, language)
            });
        }

        ctx.helpers.addCustomEmbedRecord(guild.id, channel.id, sentMessage.id, actor.id, data);
        ctx.helpers.syncCustomEmbedMedia?.(sentMessage, body, language);

        return `Embed Sentinel envoye dans #${channel.name}. ID : ${sentMessage.id}. ${formatDashboardCustomEmbedQuota(ctx, guild.id, language, actor, advanced)}`;
    }

    const messageId = String(body.messageId || '').trim();

    if (!/^\d{17,20}$/.test(messageId)) {
        throw createHttpError(400, 'Invalid message ID.');
    }

    let record = ctx.helpers.getCustomEmbedRecord(guild.id, messageId);
    const fallbackChannel = body.channelId ? getTextChannel(guild, body.channelId, language) : null;
    const channelId = record?.channel_id || fallbackChannel?.id || null;
    const channel = channelId
        ? guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)
        : null;

    const hasUploadedFiles = Boolean(ctx.helpers.hasCustomEmbedUpload?.(body));
    const channelError = ctx.helpers.getCustomEmbedChannelError(guild, channel, null, language, hasUploadedFiles);

    if (channelError) {
        throw createHttpError(403, channelError);
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message || message.author.id !== ctx.client.user.id) {
        if (record) {
            ctx.helpers.deleteCustomEmbedRecord(guild.id, messageId);
        }
        throw createHttpError(404, 'Sentinel embed not found.');
    }

    if (!record) {
        const data = ctx.helpers.mapCustomEmbedMessageData
            ? ctx.helpers.mapCustomEmbedMessageData(message)
            : null;

        if (!data) {
            throw createHttpError(404, 'Sentinel embed not found.');
        }

        ctx.helpers.addCustomEmbedRecord(guild.id, channel.id, message.id, actor.id, data);
        ctx.helpers.syncCustomEmbedMedia?.(message, null, language);
        record = ctx.helpers.getCustomEmbedRecord(guild.id, message.id);
    }

    if (action === 'custom-embed-delete') {
        try {
            await message.delete();
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        ctx.helpers.deleteCustomEmbedRecord(guild.id, messageId);
        return `Embed Sentinel ${messageId} supprime.`;
    }

    if (action === 'custom-embed-edit') {
        let data;
        let changed;

        try {
            ({ data, changed } = ctx.helpers.buildCustomEmbedData({
                title: body.title || null,
                description: body.description || null,
                color: body.color || null,
                imageUrl: body.imageUrl || null,
                thumbnailUrl: body.thumbnailUrl || null,
                footer: body.footer || null
            }, {
                title: record.title,
                description: record.description,
                color: record.color,
                imageUrl: record.image_url,
                thumbnailUrl: record.thumbnail_url,
                footer: record.footer
            }, language));
        } catch (error) {
            throw createHttpError(400, error.message);
        }

        let files = [];

        try {
            files = ctx.helpers.prepareCustomEmbedUploads
                ? ctx.helpers.prepareCustomEmbedUploads(body, data, language)
                : [];
        } catch (error) {
            throw createHttpError(400, error.message);
        }

        if (files.length > 0) {
            changed = true;
        }

        if (!changed) {
            throw createHttpError(400, 'No embed field provided.');
        }

        try {
            const editPayload = {
                content: message.content || null,
                embeds: [ctx.helpers.buildCustomAnnouncementEmbed(data, language)],
                allowedMentions: { parse: [] }
            };

            if (files.length > 0) {
                editPayload.files = files;
            }

            const attachmentNamesToKeep = new Set([
                getEmbedAttachmentName(data.imageUrl),
                getEmbedAttachmentName(data.thumbnailUrl)
            ].filter(Boolean));
            const keptAttachments = message.attachments
                .filter(attachment => attachmentNamesToKeep.has(attachment.name))
                .map(attachment => attachment);

            if (files.length > 0 || keptAttachments.length !== message.attachments.size) {
                editPayload.attachments = keptAttachments;
            }

            const editedMessage = await message.edit(editPayload);
            ctx.helpers.syncCustomEmbedMedia?.(editedMessage, body, language);
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        ctx.helpers.updateCustomEmbedRecord(guild.id, messageId, data);
        return `Embed Sentinel ${messageId} modifie.`;
    }

    throw createHttpError(400, 'Unknown custom embed action.');
}

async function dossierAction(ctx, guild, actor, body, session = null) {
    const language = ctx.helpers.getGuildLanguage(guild.id);
    const action = body.action;

    if (action === 'publish-dossier-panel') {
        requireCommandAccess(ctx, actor);

        const channel = getTextChannel(guild, body.channelId, language);
        requireBotChannelPermissions(guild, channel, [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks
        ], language);

        let message;

        try {
            if (ctx.helpers.publishOrUpdateDossierPanel) {
                message = await ctx.helpers.publishOrUpdateDossierPanel(channel, actor.user, language, actor);
            } else {
                const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, actor, session);
                const quota = applyDashboardPremiumQuota(
                    ctx.helpers.getDossierPanelQuota
                        ? ctx.helpers.getDossierPanelQuota(guild.id, actor)
                        : { unlimited: false, used: 0, limit: 1 },
                    advanced
                );

                if (!quota.unlimited && quota.used >= quota.limit) {
                    throw createHttpError(402, `Le gratuit permet ${quota.limit} panneau de dossiers par serveur.`);
                }

                message = await channel.send({
                    embeds: [ctx.helpers.buildDossierPanelEmbed(guild, actor.user, language)],
                    components: ctx.helpers.buildDossierPanelComponents(language)
                });
                ctx.helpers.recordDossierPanel?.(guild.id, channel.id, message.id, actor.id);
            }
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        return `Bureau d'accueil Sentinel publie ou mis a jour dans #${channel.name}.`;
    }

    if (action === 'add-dossier-role' || action === 'remove-dossier-role') {
        requireCommandAccess(ctx, actor);

        const role = guild.roles.cache.get(body.roleId);

        if (!role || role.id === guild.id) {
            throw createHttpError(400, 'Role not found.');
        }

        if (action === 'add-dossier-role') {
            ctx.helpers.addDossierRole(guild.id, role.id);
            return `Rôle responsable de ticket ajouté : ${role.name}.`;
        }

        ctx.helpers.removeDossierRole(guild.id, role.id);
        return `Rôle responsable de ticket retiré : ${role.name}.`;
    }

    if (action === 'dossier-close') {
        requireDossierAccess(ctx, actor);

        const channel = getTextChannel(guild, body.channelId, language);
        if (!String(channel.topic || '').startsWith('sentinel-dossier:') && !String(channel.topic || '').startsWith('sentinel-ticket:')) {
            throw createHttpError(400, 'This channel is not a Sentinel dossier.');
        }

        const dossier = ctx.helpers.getDossierByChannel(guild.id, channel.id) || {
            id: channel.id,
            channelId: channel.id,
            ownerUserId: null,
            type: 'support'
        };

        const closedDossier = ctx.helpers.closeDossierRecord(guild.id, channel.id, actor.id) || {
            ...dossier,
            status: 'closed',
            closedAt: new Date().toISOString(),
            closedByUserId: actor.id
        };

        await ctx.helpers.sendDossierTranscript(channel, closedDossier, actor.user, language);

        try {
            await channel.delete('Cloture dossier Sentinel depuis le dashboard');
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.ManageChannels, language);
        }

        return `Dossier Sentinel cloture : #${channel.name}.`;
    }

    if (action === 'dossier-status') {
        requireDossierAccess(ctx, actor);

        const channel = getTextChannel(guild, body.channelId, language);
        if (!String(channel.topic || '').startsWith('sentinel-dossier:') && !String(channel.topic || '').startsWith('sentinel-ticket:')) {
            throw createHttpError(400, 'This channel is not a Sentinel dossier.');
        }

        const dossier = ctx.helpers.updateDossierStatus(guild.id, channel.id, body.dossierStatus || body.status);
        const nextStatus = dossier?.status || body.dossierStatus || body.status || 'open';
        const nextStatusLabel = getDossierStatusLabel(nextStatus, language);

        try {
            await channel.send(`📌 ${actor.user} a mis à jour le statut du dossier : **${nextStatusLabel}**.`);
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        return `Statut du dossier mis a jour : ${nextStatusLabel}.`;
    }

    if (action === 'dossier-claim') {
        requireDossierAccess(ctx, actor);

        const channel = getTextChannel(guild, body.channelId, language);
        if (!String(channel.topic || '').startsWith('sentinel-dossier:') && !String(channel.topic || '').startsWith('sentinel-ticket:')) {
            throw createHttpError(400, 'This channel is not a Sentinel dossier.');
        }

        const dossier = ctx.helpers.setDossierReferent
            ? ctx.helpers.setDossierReferent(guild.id, channel.id, actor.id)
            : null;

        try {
            await channel.send(`✅ ${actor.user} prend ce dossier en charge.`);
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        return `Dossier Sentinel pris en charge${dossier?.id ? ` : #${dossier.id}` : ''}.`;
    }

    if (action === 'set-dossier-category') {
        requireCommandAccess(ctx, actor);
        await requireAdvanced(ctx, guild.id, actor, session);

        const dossierType = String(body.dossierType || '').trim();
        const categoryId = String(body.categoryId || '').trim() || null;

        if (!dossierType) {
            throw createHttpError(400, 'Missing dossier type.');
        }

        if (categoryId) {
            const category = guild.channels.cache.get(categoryId);

            if (!category || category.type !== ChannelType.GuildCategory) {
                throw createHttpError(400, 'Category not found.');
            }
        }

        const setting = ctx.helpers.updateDossierTypeCategory(guild.id, dossierType, categoryId);
        return `Categorie dossier mise a jour pour ${setting.type}.`;
    }

    throw createHttpError(400, 'Unknown dossier action.');
}

async function runDashboardAction(ctx, guild, member, body, session = null) {
    const action = body.action;
    const language = ctx.helpers.getGuildLanguage(guild.id);

    if (action === 'set-language') {
        requireCommandAccess(ctx, member);
        const nextLanguage = body.language === 'en' ? 'en' : 'fr';
        ctx.helpers.setGuildLanguage(guild.id, nextLanguage);
        return `Langue du serveur mise à jour : ${nextLanguage}.`;
    }

    if (action === 'set-server-preset') {
        requireCommandAccess(ctx, member);
        const preset = normalizeServerPreset(body.preset);

        if (!preset) {
            throw createHttpError(400, 'Invalid server profile.');
        }

        ctx.helpers.updateGuildConfig(guild.id, { serverPreset: preset });
        return `Profil serveur mis à jour : ${SERVER_PRESET_LABELS[preset] || preset}.`;
    }

    if (action === 'set-service-role') {
        requireCommandAccess(ctx, member);
        const role = guild.roles.cache.get(body.roleId);

        if (!role) {
            throw createHttpError(400, 'Rôle introuvable.');
        }

        const roleError = ctx.helpers.getServiceRoleManageError
            ? ctx.helpers.getServiceRoleManageError(guild, role, language)
            : null;

        if (roleError) {
            throw createHttpError(400, roleError);
        }

        ctx.helpers.updateGuildConfig(guild.id, { serviceRoleId: role.id });
        return `Rôle de service configuré : ${role.name}.`;
    }

    if (action === 'set-auto-role') {
        requireCommandAccess(ctx, member);
        const role = guild.roles.cache.get(body.roleId);
        const error = ctx.helpers.getAssignableRoleError
            ? ctx.helpers.getAssignableRoleError(guild, role, language)
            : null;

        if (error) {
            throw createHttpError(400, error);
        }

        ctx.helpers.updateGuildConfig(guild.id, { autoRoleId: role.id });
        return `Rôle automatique d’arrivée configuré : ${role.name}.`;
    }

    if (action === 'disable-auto-role') {
        requireCommandAccess(ctx, member);
        ctx.helpers.updateGuildConfig(guild.id, { autoRoleId: null });
        return 'Rôle automatique d’arrivée désactivé.';
    }

    if (action === 'set-log-channel') {
        requireCommandAccess(ctx, member);
        const channel = getTextChannel(guild, body.channelId, language);
        requireBotChannelPermissions(guild, channel, [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
        ], language);
        ctx.helpers.updateGuildConfig(guild.id, { logChannelId: channel.id });
        return `Salon de logs configuré : #${channel.name}.`;
    }

    if (action === 'set-status-channel') {
        requireCommandAccess(ctx, member);
        const channel = getTextChannel(guild, body.channelId, language);
        requireBotChannelPermissions(guild, channel, [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks
        ], language);
        ctx.helpers.updateGuildConfig(guild.id, { statusChannelId: channel.id });
        await ctx.helpers.updateSentinelStatusPanel?.(guild);
        return `Salon statut Sentinel configuré : #${channel.name}.`;
    }

    if (action === 'disable-status-channel') {
        requireCommandAccess(ctx, member);
        ctx.helpers.updateGuildConfig(guild.id, {
            statusChannelId: null,
            statusUpdatesEnabled: false
        });
        return 'Salon statut Sentinel désactivé sur ce serveur.';
    }

    if (action === 'set-status-updates') {
        requireCommandAccess(ctx, member);
        const enabled = ['true', '1', 'yes', 'on'].includes(String(body.enabled || '').toLowerCase());
        const config = ctx.helpers.getGuildConfig(guild.id);

        if (enabled && !config.statusChannelId) {
            throw createHttpError(400, 'Choisis d’abord un salon statut Sentinel.');
        }

        ctx.helpers.updateGuildConfig(guild.id, { statusUpdatesEnabled: enabled });
        await ctx.helpers.updateSentinelStatusPanel?.(guild);
        return enabled
            ? 'Les nouveautés officielles Sentinel pourront être envoyées dans le salon statut.'
            : 'Les nouveautés officielles Sentinel ne seront plus envoyées dans le salon statut.';
    }

    if (action === 'add-command-role' || action === 'remove-command-role') {
        requireCommandAccess(ctx, member);
        const role = guild.roles.cache.get(body.roleId);

        if (!role || role.id === guild.id) {
            throw createHttpError(400, 'Rôle introuvable.');
        }

        if (action === 'add-command-role') {
            ctx.helpers.addCommandRole(guild.id, role.id);
            return `Rôle autorisé ajouté : ${role.name}.`;
        }

        ctx.helpers.removeCommandRole(guild.id, role.id);
        return `Rôle autorisé retiré : ${role.name}.`;
    }

    if (action === 'publish-service-panel') {
        requireCommandAccess(ctx, member);
        const channel = getTextChannel(guild, body.channelId, language);
        requireBotChannelPermissions(guild, channel, [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages
        ], language);
        const role = ctx.helpers.getServiceRole(guild);
        const roleError = ctx.helpers.getServiceRoleManageError
            ? ctx.helpers.getServiceRoleManageError(guild, role, language)
            : null;

        if (roleError) {
            throw createHttpError(400, roleError);
        }

        try {
            if (ctx.helpers.publishOrUpdateServicePanel) {
                await ctx.helpers.publishOrUpdateServicePanel(channel, language);
            } else {
                await channel.send(ctx.helpers.buildServicePanelPayload
                    ? ctx.helpers.buildServicePanelPayload(language)
                    : {
                        content: language === 'en'
                            ? '**Sentinel | Duty desk**\nSecured operations channel. Use the controls below to clock in, clock out, or consult the service registry.'
                            : '**Sentinel | Bureau de service**\nCanal opérationnel sécurisé. Utilise les contrôles ci-dessous pour prendre ton service, le clôturer ou consulter le registre.',
                        embeds: [],
                        components: ctx.helpers.buildServicePanelComponents(language)
                    });
            }
        } catch (error) {
            throw createDiscordActionError(error, guild, PermissionsBitField.Flags.SendMessages, language);
        }

        return `Panneau de service publié ou mis à jour dans #${channel.name}.`;
    }

    if (action === 'set-payroll-settings') {
        requireCommandAccess(ctx, member);

        const hourlyRate = Number(body.hourlyRate);

        if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
            throw createHttpError(400, 'Invalid hourly rate.');
        }

        const settings = ctx.helpers.updateGuildPaySettings(guild.id, hourlyRate, body.currency || '$');

        if (!settings) {
            throw createHttpError(400, 'Invalid hourly rate.');
        }

        return `Paie RP mise a jour : ${settings.hourlyRate} ${settings.currency}/h.`;
    }

    if (action === 'set-payroll-role-rate') {
        await requireAdvanced(ctx, guild.id, member, session);
        requireCommandAccess(ctx, member);

        const role = guild.roles.cache.get(body.roleId);
        const hourlyRate = Number(body.hourlyRate);

        if (!role || role.id === guild.id) {
            throw createHttpError(400, 'Role not found.');
        }

        if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
            throw createHttpError(400, 'Invalid hourly rate.');
        }

        const roleSettings = ctx.helpers.updateGuildPayRoleSettings(guild.id, role.id, hourlyRate);

        if (!roleSettings) {
            throw createHttpError(400, 'Invalid hourly rate.');
        }

        return `Taux de paie configure pour ${role.name} : ${roleSettings.hourlyRate}/h.`;
    }

    if (action === 'remove-payroll-role-rate') {
        await requireAdvanced(ctx, guild.id, member, session);
        requireCommandAccess(ctx, member);

        const role = guild.roles.cache.get(body.roleId);

        if (!role || role.id === guild.id) {
            throw createHttpError(400, 'Role not found.');
        }

        ctx.helpers.removeGuildPayRoleSettings(guild.id, role.id);
        return `Taux de paie specifique retire pour ${role.name}.`;
    }

    if (action === 'add-payroll-adjustment') {
        await requireAdvanced(ctx, guild.id, member, session);
        requireCommandAccess(ctx, member);

        const userId = normalizeUserId(ctx, body.userId);
        const amount = Number(body.amount);
        const adjustment = ctx.helpers.addWeeklyPayAdjustment(
            guild.id,
            userId,
            body.weekStart || null,
            body.adjustmentType || body.type,
            amount,
            body.reason || '',
            member?.id || null
        );

        if (!adjustment) {
            throw createHttpError(400, 'Invalid payroll adjustment.');
        }

        return `Ajustement de paie ajoute pour ${userId}.`;
    }

    if (action === 'archive-payroll') {
        requireCommandAccess(ctx, member);

        const archive = ctx.helpers.archiveWeeklyPayroll(guild.id, member?.id || null, {
            guild,
            language
        });

        return archive.replaced
            ? `Archive de paie mise a jour pour ${archive.weekStart} - ${archive.weekEnd}.`
            : `Paie RP archivee pour ${archive.weekStart} - ${archive.weekEnd}.`;
    }

    if (action === 'toggle-payroll-paid') {
        requireCommandAccess(ctx, member);

        const userId = normalizeUserId(ctx, body.userId);
        const weekStart = String(body.weekStart || '');
        const weekDate = new Date(`${weekStart}T00:00:00.000Z`);

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)
            || Number.isNaN(weekDate.getTime())
            || weekDate.toISOString().slice(0, 10) !== weekStart
        ) {
            throw createHttpError(400, 'Invalid payroll week.');
        }

        const archive = ctx.helpers.getWeeklyPayrollArchive
            ? ctx.helpers.getWeeklyPayrollArchive(guild.id, weekStart, { guild, language })
            : null;
        const livePayroll = ctx.helpers.getWeeklyPayroll(guild.id, {
            guild,
            language,
            weekStart
        });
        const line = archive?.items?.find(item => item.userId === userId)
            || livePayroll?.items?.find(item => item.userId === userId);

        if (!line) {
            throw createHttpError(404, 'Payroll line not found.');
        }

        const paidInput = typeof body.paid === 'boolean'
            ? String(body.paid)
            : String(body.paid || '').toLowerCase();

        if (!['true', 'false', '1', '0'].includes(paidInput)) {
            throw createHttpError(400, 'Invalid payroll status.');
        }

        const paid = paidInput === 'true' || paidInput === '1';
        ctx.helpers.setWeeklyPaymentStatus(guild.id, userId, weekStart, paid, member?.id || null);

        return paid
            ? `Paie RP marquee comme payee pour ${userId}, semaine du ${weekStart}.`
            : `Paie RP remise a payer pour ${userId}, semaine du ${weekStart}.`;
    }

    if (action === 'start-service') {
        return startServiceForUser(ctx, guild, member, body);
    }

    if (action === 'end-service') {
        return endServiceForUser(ctx, guild, member, body);
    }

    if (action === 'reset-user') {
        return resetUserFromDashboard(ctx, guild, member, body);
    }

    if (action === 'reset-guild') {
        await requireAdvanced(ctx, guild.id, member, session);
        requireCommandAccess(ctx, member);
        ctx.helpers.resetGuild(guild.id);
        ctx.helpers.clearLongServiceAlertsForGuild?.(guild.id);
        return 'Toutes les heures du serveur ont ete reinitialisees.';
    }

    if (action === 'sync-service') {
        await requireAdvanced(ctx, guild.id, member, session);
        requireCommandAccess(ctx, member);
        const result = await ctx.helpers.syncServiceState(guild);
        return `Synchronisation terminee : ${result.closedSessions} session(s) fermee(s), ${result.removedRoles} role(s) retire(s).`;
    }

    if (['custom-embed-create', 'custom-embed-edit', 'custom-embed-delete'].includes(action)) {
        return customEmbedAction(ctx, guild, member, body, session);
    }

    if (['publish-dossier-panel', 'add-dossier-role', 'remove-dossier-role', 'dossier-close', 'dossier-status', 'dossier-claim', 'set-dossier-category'].includes(action)) {
        return dossierAction(ctx, guild, member, body, session);
    }

    if (['set-automod-settings', 'add-automod-word', 'remove-automod-word'].includes(action)) {
        return automodAction(ctx, guild, member, body, session);
    }

    return moderationAction(ctx, guild, member, body, session);
}

async function handleApi(req, res, ctx, url) {
    if (req.method === 'OPTIONS') {
        if (url.pathname === '/api/status' && corsHeaders(req, url)['Access-Control-Allow-Origin']) {
            writeResponse(res, 204, {
                'Cache-Control': 'no-store'
            });
            return;
        }

        throw createHttpError(405, 'Method not allowed.');
    }

    if (!SAFE_METHODS.has(req.method)) {
        requireTrustedMutationOrigin(req);
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
        const incidents = getStatusListFromEnv('SENTINEL_STATUS_INCIDENTS');
        const maintenance = String(process.env.SENTINEL_STATUS_MAINTENANCE || '').trim() || null;

        json(res, 200, {
            ok: true,
            status: {
                botOnline: Boolean(ctx.client?.isReady?.()),
                dashboardOnline: true,
                guildCount: ctx.client?.guilds?.cache?.size || 0,
                incidents,
                maintenance
            }
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
        const sessionId = parseCookies(req)[getSessionCookieName(req)];
        const session = getSession(req);

        if (session) {
            requireCsrfToken(req, session);
        }

        if (sessionId) {
            deleteDashboardSession(sessionId);
        }

        clearSessionCookie(res, req);
        json(res, 200, { ok: true });
        return;
    }

    const session = requireSession(req);

    if (!SAFE_METHODS.has(req.method)) {
        requireCsrfToken(req, session);
    }

    if (req.method === 'GET' && url.pathname === '/api/session') {
        const siteAccess = await getSiteAccess(ctx, session.user.id);

        json(res, 200, {
            ok: true,
            user: session.user,
            csrfToken: session.csrfToken,
            settings: getUserSiteSettings(session.user.id),
            siteAccess,
            creator: {
                canViewPremiumOverview: siteAccess.canViewSitePanel,
                canManagePremium: siteAccess.canManagePremium,
                canManageSiteStaff: siteAccess.canManageSiteStaff,
                role: siteAccess.role
            }
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/me/settings') {
        const body = await parseBody(req);
        const settingsPatch = {};

        if (Object.prototype.hasOwnProperty.call(body, 'siteLanguage')) {
            settingsPatch.siteLanguage = body.siteLanguage;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'lastGuildId')) {
            settingsPatch.lastGuildId = body.lastGuildId;
        }

        if (Object.prototype.hasOwnProperty.call(body, 'lastReturnUrl')) {
            settingsPatch.lastReturnUrl = body.lastReturnUrl
                ? getSafeReturnTo(req, body.lastReturnUrl)
                : null;
        }

        const settings = updateUserSiteSettings(session.user.id, settingsPatch);

        json(res, 200, { ok: true, settings });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/guilds') {
        const oauthGuilds = await getOauthGuilds(session);
        const hasPremiumSubscription = await hasDashboardPremiumSubscription(ctx, session);
        const siteAccess = await getSiteAccess(ctx, session.user.id);
        const guilds = [];
        const oauthGuildIds = new Set(oauthGuilds.map(guild => guild.id));
        const guildCandidates = siteAccess.canViewSitePanel
            ? [
                ...oauthGuilds,
                ...Array.from(ctx.client.guilds.cache.values())
                    .filter(guild => !oauthGuildIds.has(guild.id))
                    .map(guild => ({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.icon,
                        permissions: '0'
                    }))
            ]
            : oauthGuilds;

        for (const oauthGuild of guildCandidates) {
            const installed = ctx.client.guilds.cache.has(oauthGuild.id);
            let memberAccess = false;
            let advanced = ctx.helpers.isAdvancedGuild(oauthGuild.id)
                || hasPremiumSubscription;

            if (installed) {
                const guild = ctx.client.guilds.cache.get(oauthGuild.id);
                const member = await guild.members.fetch(session.user.id).catch(() => null);
                memberAccess = member ? ctx.helpers.hasCommandRoleAccess(member) : false;
                advanced = await hasDashboardAdvancedAccess(ctx, oauthGuild.id, member, session);
            }

            if (!userCanManageOauthGuild(oauthGuild) && !memberAccess && !siteAccess.canViewSitePanel) {
                continue;
            }

            guilds.push({
                id: oauthGuild.id,
                name: oauthGuild.name,
                icon: oauthGuild.icon
                    ? `https://cdn.discordapp.com/icons/${oauthGuild.id}/${oauthGuild.icon}.png`
                    : null,
                installed,
                inviteUrl: installed ? null : getInviteUrl(ctx, oauthGuild.id),
                advanced
            });
        }

        json(res, 200, { ok: true, guilds });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/creator/premium-overview') {
        await requireSitePanelAccess(ctx, session);
        checkRateLimit(rateLimitKey(req, 'creator', session.user.id), RATE_LIMITS.creator);

        json(res, 200, {
            ok: true,
            overview: await buildCreatorPremiumOverview(ctx, session)
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/creator/maintenance/download') {
        await requireFounderAccess(session, { recentLogin: true });
        checkRateLimit(rateLimitKey(req, 'creator', session.user.id), RATE_LIMITS.creator);
        const kind = url.searchParams.get('kind');
        const fileName = url.searchParams.get('file');
        const file = ctx.helpers.resolveMaintenanceFile?.(kind, fileName);

        if (!file) {
            throw createHttpError(404, 'Archive Sentinel introuvable.');
        }

        streamPrivateFile(res, file);
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/creator/maintenance') {
        await requireFounderAccess(session, { recentLogin: true });
        checkRateLimit(rateLimitKey(req, 'creator', session.user.id), RATE_LIMITS.creator);
        const body = await parseBody(req);
        const action = String(body.action || '').trim();
        let message;

        try {
            if (action === 'run-maintenance') {
                const result = await ctx.helpers.runManualDatabaseMaintenance();
                message = `Entretien terminé. ${result.maintenance?.cleanup?.expiredSessions || 0} session(s) expirée(s), ${result.maintenance?.archived?.files?.length || 0} archive(s) froide(s).`;
            } else if (action === 'verify-backup') {
                const check = await ctx.helpers.verifyManagedDatabaseBackup(body.fileName);
                message = `Copie ${check.fileName} vérifiée : intégrité ${check.integrityResult}.`;
            } else if (action === 'scan-media') {
                const scan = await ctx.helpers.scanCustomEmbedMediaOrphans(250);
                message = `Médias contrôlés : ${scan.checked}, orphelins placés en corbeille : ${scan.orphaned}, purgés : ${scan.purged?.links || 0}.`;
            } else if (action === 'restore-backup') {
                if (String(body.confirmation || '').trim() !== 'RESTAURER SENTINEL') {
                    throw createHttpError(400, 'Confirmation invalide. Écris exactement RESTAURER SENTINEL.');
                }

                const restore = await ctx.helpers.restoreManagedDatabaseBackup(body.fileName);
                message = `Restauration de ${restore.backupFile} préparée. Copie de sécurité : ${restore.safetyBackupFile}. Sentinel va redémarrer.`;
            } else {
                throw createHttpError(400, 'Action de maintenance inconnue.');
            }

            addSiteAccessAuditLog({ session, body, status: 'success', summary: message, kind: 'maintenance' });
        } catch (error) {
            addSiteAccessAuditLog({
                session,
                body: { action, fileName: body.fileName || null },
                status: 'failed',
                summary: error.message || 'Action de maintenance refusée.',
                kind: 'maintenance'
            });
            throw error;
        }

        json(res, 200, {
            ok: true,
            message,
            overview: await buildCreatorPremiumOverview(ctx, session)
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/creator/premium-access') {
        await requireFounderAccess(session, { recentLogin: true });

        checkRateLimit(rateLimitKey(req, 'creator', session.user.id), RATE_LIMITS.creator);
        const body = await parseBody(req);
        let message;

        try {
            message = await manageCreatorPremiumAccess(ctx, session, body);
            addSiteAccessAuditLog({ session, body, status: 'success', summary: message, kind: 'premium' });
        } catch (error) {
            addSiteAccessAuditLog({
                session,
                body,
                status: 'failed',
                summary: error.message || 'Modification Premium refusée.',
                kind: 'premium'
            });
            throw error;
        }

        json(res, 200, {
            ok: true,
            message,
            overview: await buildCreatorPremiumOverview(ctx, session)
        });
        return;
    }

    if (req.method === 'POST' && url.pathname === '/api/creator/site-staff') {
        await requireFounderAccess(session, { recentLogin: true });

        checkRateLimit(rateLimitKey(req, 'creator', session.user.id), RATE_LIMITS.creator);
        const body = await parseBody(req);
        let message;

        try {
            message = await manageCreatorSiteStaffAccess(ctx, session, body);
            addSiteAccessAuditLog({ session, body, status: 'success', summary: message, kind: 'site_staff' });
        } catch (error) {
            addSiteAccessAuditLog({
                session,
                body,
                status: 'failed',
                summary: error.message || 'Modification staff refusée.',
                kind: 'site_staff'
            });
            throw error;
        }

        json(res, 200, {
            ok: true,
            message,
            overview: await buildCreatorPremiumOverview(ctx, session)
        });
        return;
    }

    const stateMatch = /^\/api\/guilds\/(\d{17,20})\/state$/.exec(url.pathname);
    if (req.method === 'GET' && stateMatch) {
        const { guild } = await getDashboardAccess(ctx, session, stateMatch[1]);
        updateUserSiteSettings(session.user.id, { lastGuildId: guild.id });
        json(res, 200, { ok: true, state: await buildGuildState(ctx, guild, session) });
        return;
    }

    const casesMatch = /^\/api\/guilds\/(\d{17,20})\/moderation-cases$/.exec(url.pathname);
    if (req.method === 'GET' && casesMatch) {
        const { guild, member } = await getDashboardAccess(ctx, session, casesMatch[1]);
        const canViewGlobalAudit = isCreatorUser(session.user.id);
        const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, member, session) || canViewGlobalAudit;
        const maxLimit = advanced ? 100 : 10;
        const limit = Math.min(Number(url.searchParams.get('limit')) || maxLimit, maxLimit);
        const targetUserId = normalizeAuditValue(url.searchParams.get('userId'));
        const action = normalizeAuditValue(url.searchParams.get('action'));
        const caseId = normalizeAuditValue(url.searchParams.get('caseId'));
        const items = ctx.helpers.getFilteredModerationCases(guild.id, {
            targetUserId,
            action,
            caseId,
            limit
        }).map(item => mapModerationCase(ctx, item));

        json(res, 200, {
            ok: true,
            moderationCases: {
                limit: maxLimit,
                items
            }
        });
        return;
    }

    const payrollArchivesMatch = /^\/api\/guilds\/(\d{17,20})\/payroll-archives$/.exec(url.pathname);
    if (req.method === 'GET' && payrollArchivesMatch) {
        const { guild } = await getDashboardAccess(ctx, session, payrollArchivesMatch[1]);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 24, 1), 52);
        const offset = Math.min(Math.max(Number(url.searchParams.get('offset')) || 0, 0), 10000);

        json(res, 200, {
            ok: true,
            payrollArchives: ctx.helpers.getWeeklyPayrollArchives
                ? ctx.helpers.getWeeklyPayrollArchives(guild.id, {
                    language: ctx.helpers.getGuildLanguage(guild.id),
                    guild,
                    limit,
                    offset
                })
                : { limit, offset, totalCount: 0, hasMore: false, items: [] }
        });
        return;
    }

    const userMatch = /^\/api\/guilds\/(\d{17,20})\/users\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && userMatch) {
        const { guild } = await getDashboardAccess(ctx, session, userMatch[1]);
        const userId = normalizeUserId(ctx, decodeURIComponent(userMatch[2]));

        json(res, 200, {
            ok: true,
            profile: await buildUserDashboardProfile(ctx, guild, userId, session)
        });
        return;
    }

    const auditMatch = /^\/api\/guilds\/(\d{17,20})\/audit$/.exec(url.pathname);
    if (req.method === 'GET' && auditMatch) {
        const { guild, member } = await getDashboardAccess(ctx, session, auditMatch[1]);
        const canViewGlobalAudit = isCreatorUser(session.user.id);
        const advanced = await hasDashboardAdvancedAccess(ctx, guild.id, member, session) || canViewGlobalAudit;
        const maxLimit = advanced ? 100 : 10;
        const limit = Math.min(Number(url.searchParams.get('limit')) || maxLimit, maxLimit);

        json(res, 200, {
            ok: true,
            auditLogs: {
                canViewGlobal: canViewGlobalAudit,
                limit: maxLimit,
                items: getDashboardAuditLogs({
                    guildId: guild.id,
                    actorUserId: normalizeAuditValue(url.searchParams.get('actorUserId')),
                    targetId: normalizeAuditValue(url.searchParams.get('targetId')),
                    action: normalizeAuditValue(url.searchParams.get('action')),
                    status: normalizeAuditValue(url.searchParams.get('status')),
                    source: normalizeAuditValue(url.searchParams.get('source')),
                    limit
                })
            }
        });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/audit/global') {
        if (!isCreatorUser(session.user.id)) {
            throw createHttpError(403, 'Global audit is reserved for the Sentinel creator.');
        }

        json(res, 200, {
            ok: true,
            auditLogs: {
                canViewGlobal: true,
                limit: 100,
                items: getDashboardAuditLogs({
                    actorUserId: normalizeAuditValue(url.searchParams.get('actorUserId')),
                    targetId: normalizeAuditValue(url.searchParams.get('targetId')),
                    action: normalizeAuditValue(url.searchParams.get('action')),
                    status: normalizeAuditValue(url.searchParams.get('status')),
                    source: normalizeAuditValue(url.searchParams.get('source')),
                    limit: Math.min(Number(url.searchParams.get('limit')) || 100, 100)
                })
            }
        });
        return;
    }

    const actionMatch = /^\/api\/guilds\/(\d{17,20})\/action$/.exec(url.pathname);
    if (req.method === 'POST' && actionMatch) {
        const { guild, member } = await getDashboardAccess(ctx, session, actionMatch[1]);

        if (!member) {
            throw createHttpError(403, 'Site staff must be a member of this Discord server to perform actions.');
        }

        updateUserSiteSettings(session.user.id, { lastGuildId: guild.id });
        const body = await parseBody(req);
        const auditActor = member || {
            id: session.user.id,
            user: {
                tag: session.user.username,
                username: session.user.username
            },
            displayName: session.user.globalName || session.user.username
        };
        let message;

        try {
            message = await runDashboardAction(ctx, guild, member, body, session);
            addDashboardAuditLog({
                guild,
                actor: auditActor,
                body,
                status: 'success',
                summary: message
            });
        } catch (error) {
            addDashboardAuditLog({
                guild,
                actor: auditActor,
                body,
                status: 'failed',
                summary: error.message || 'Action dashboard echouee.'
            });
            throw error;
        }

        const state = await buildGuildState(ctx, guild, session);
        const payrollArchive = body.action === 'toggle-payroll-paid' && ctx.helpers.getWeeklyPayrollArchive
            ? ctx.helpers.getWeeklyPayrollArchive(guild.id, body.weekStart, {
                language: ctx.helpers.getGuildLanguage(guild.id),
                guild
            })
            : null;

        json(res, 200, {
            ok: true,
            message,
            state,
            payrollArchive
        });
        return;
    }

    throw createHttpError(404, 'API route not found.');
}

function acceptsEncoding(req, encoding) {
    return String(req.headers['accept-encoding'] || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .some(value => value === encoding || value.startsWith(`${encoding};`));
}

function createStaticEtag(stats) {
    return `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
}

function getCachedStaticFile(filePath, ext, stats) {
    const cached = staticFileCache.get(filePath);

    if (
        cached
        && cached.size === stats.size
        && cached.mtimeMs === stats.mtimeMs
    ) {
        return cached;
    }

    const content = fs.readFileSync(filePath);
    const cacheable = content.length <= STATIC_CACHE_MAX_ENTRY_BYTES;
    const compressible = COMPRESSIBLE_EXTENSIONS.has(ext) && content.length >= 1024;
    const entry = {
        content,
        etag: createStaticEtag(stats),
        lastModified: stats.mtime.toUTCString(),
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        br: compressible ? zlib.brotliCompressSync(content, {
            params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 4
            }
        }) : null,
        gzip: compressible ? zlib.gzipSync(content, { level: 6 }) : null
    };

    if (cacheable) {
        staticFileCache.set(filePath, entry);
    }

    return entry;
}

function isFreshStaticRequest(req, entry) {
    const ifNoneMatch = req.headers['if-none-match'];

    if (ifNoneMatch && ifNoneMatch.split(',').map(value => value.trim()).includes(entry.etag)) {
        return true;
    }

    const ifModifiedSince = req.headers['if-modified-since'];

    if (!ifModifiedSince) {
        return false;
    }

    const modifiedSince = new Date(ifModifiedSince).getTime();

    return Number.isFinite(modifiedSince) && modifiedSince >= Math.floor(entry.mtimeMs / 1000) * 1000;
}

function serveStatic(req, res, url) {
    const siteDir = path.resolve(__dirname, 'site');
    let cleanPath;

    try {
        cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    } catch (error) {
        throw createHttpError(400, 'Invalid URL path.');
    }

    const routeMap = {
        '': 'index.html',
        dashboard: 'dashboard.html',
        fonctionnalites: 'fonctionnalites.html',
        commandes: 'commandes.html',
        premium: 'premium.html',
        securite: 'securite.html',
        installation: 'installation.html',
        pourquoi: 'pourquoi.html',
        statut: 'statut.html'
    };
    const relativePath = routeMap[cleanPath] || cleanPath;
    const filePath = path.resolve(siteDir, relativePath);

    if (filePath !== siteDir && !filePath.startsWith(`${siteDir}${path.sep}`)) {
        throw createHttpError(403, 'Forbidden.');
    }

    const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(siteDir, '404.html');
    const statusCode = finalPath.endsWith('404.html') ? 404 : 200;
    const ext = path.extname(finalPath).toLowerCase();

    if (!MIME_TYPES[ext]) {
        throw createHttpError(404, 'Not found.');
    }

    const stats = fs.statSync(finalPath);
    const entry = getCachedStaticFile(finalPath, ext, stats);
    const versionedAsset = ['.css', '.js'].includes(ext)
        && /^[a-z0-9._-]{1,64}$/i.test(url.searchParams.get('v') || '');
    const cacheControl = statusCode === 404
        ? 'no-store'
        : (finalPath === path.join(siteDir, 'dashboard.html')
            ? 'no-store'
            : (versionedAsset
                ? STATIC_VERSIONED_CACHE_CONTROL
                : (ext === '.html'
                    ? STATIC_HTML_CACHE_CONTROL
                    : (ext === '.js' ? STATIC_SCRIPT_CACHE_CONTROL : STATIC_ASSET_CACHE_CONTROL))));
    const headers = {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': cacheControl,
        ETag: entry.etag,
        'Last-Modified': entry.lastModified,
        Vary: 'Accept-Encoding'
    };

    if (statusCode === 200 && isFreshStaticRequest(req, entry)) {
        writeResponse(res, 304, headers);
        return;
    }

    let content = entry.content;

    if (entry.br && acceptsEncoding(req, 'br')) {
        content = entry.br;
        headers['Content-Encoding'] = 'br';
    } else if (entry.gzip && acceptsEncoding(req, 'gzip')) {
        content = entry.gzip;
        headers['Content-Encoding'] = 'gzip';
    }

    headers['Content-Length'] = content.length;
    writeResponse(res, statusCode, headers, req.method === 'HEAD' ? undefined : content);
}

async function handleRequest(req, res, ctx) {
    let url = null;
    const requestStartedAt = process.hrtime.bigint();
    res.sentinelRequest = req;
    res.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - requestStartedAt) / 1e6;
        ctx.helpers.recordDashboardRequestMetric?.({
            durationMs,
            status: res.statusCode,
            method: req.method,
            route: res.sentinelUrl?.pathname || '/invalid-request'
        });
    });

    try {
        requireTrustedHost(req);
        url = new URL(req.url, getRequestBaseUrl(req));
        res.sentinelUrl = url;
        applyRequestRateLimits(req, url);

        if (req.method === 'GET' && url.pathname === '/auth/login') {
            if (!process.env.CLIENT_SECRET) {
                throw createHttpError(503, 'Discord OAuth is not configured. Add CLIENT_SECRET on Railway.');
            }

            while (oauthStates.size >= OAUTH_STATES_MAX) {
                oauthStates.delete(oauthStates.keys().next().value);
            }

            const state = crypto.randomBytes(32).toString('hex');
            const oauthNonce = crypto.randomBytes(32).toString('hex');
            const returnTo = getSafeReturnTo(req, url.searchParams.get('return_to'));
            oauthStates.set(state, {
                expiresAt: Date.now() + OAUTH_STATE_TTL,
                returnTo,
                oauthNonceHash: hashSessionValue(oauthNonce)
            });
            const oauthUrl = new URL('https://discord.com/oauth2/authorize');
            oauthUrl.searchParams.set('client_id', process.env.CLIENT_ID);
            oauthUrl.searchParams.set('redirect_uri', getRedirectUri(req));
            oauthUrl.searchParams.set('response_type', 'code');
            oauthUrl.searchParams.set('scope', 'identify guilds');
            oauthUrl.searchParams.set('state', state);

            setOauthCookie(res, req, oauthNonce);
            redirect(res, oauthUrl.toString());
            return;
        }

        if (req.method === 'GET' && url.pathname === '/auth/logout') {
            const sessionId = parseCookies(req)[getSessionCookieName(req)];

            if (sessionId) {
                deleteDashboardSession(sessionId);
            }

            clearSessionCookie(res, req);
            redirect(res, getSafeReturnTo(req, url.searchParams.get('return_to')));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/auth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const oauthNonce = parseCookies(req)[getOauthCookieName(req)];

            if (!code || code.length > 2048) {
                clearOauthCookie(res, req);
                throw createHttpError(400, 'Missing Discord authorization code.');
            }

            if (!state || !/^[a-f0-9]{64}$/i.test(state)) {
                clearOauthCookie(res, req);
                throw createHttpError(400, 'Invalid Discord authorization state.');
            }

            const stateData = oauthStates.get(state);
            const stateExpiresAt = typeof stateData === 'number' ? stateData : stateData?.expiresAt;
            const nonceMatches = Boolean(
                oauthNonce
                && stateData?.oauthNonceHash
                && constantTimeEqual(hashSessionValue(oauthNonce), stateData.oauthNonceHash)
            );

            if (!stateData || stateExpiresAt <= Date.now() || !nonceMatches) {
                oauthStates.delete(state);
                clearOauthCookie(res, req);
                throw createHttpError(400, 'Invalid Discord authorization state.');
            }

            oauthStates.delete(state);
            clearOauthCookie(res, req);
            const token = await exchangeCode(req, code);
            const user = await discordFetch('/users/@me', token.access_token);
            const profile = saveUserProfile({
                id: user.id,
                username: user.username,
                globalName: user.global_name,
                avatar: user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                    : null
            }, { markLogin: true });
            const returnTo = typeof stateData === 'number'
                ? `${getRequestBaseUrl(req)}/dashboard`
                : stateData.returnTo;

            updateUserSiteSettings(user.id, { lastReturnUrl: returnTo });

            const { sessionId } = createSession({
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                tokenExpiresAt: Date.now() + (token.expires_in * 1000),
                user: profile
            }, req);

            setSessionCookie(res, req, sessionId);
            redirect(res, returnTo);
            return;
        }

        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, ctx, url);
            return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            throw createHttpError(405, 'Method not allowed.');
        }

        serveStatic(req, res, url);
    } catch (error) {
        if (!url) {
            url = { pathname: '' };
            res.sentinelUrl = url;
        }

        const status = error.status || 500;

        if (status >= 500) {
            console.error('Erreur dashboard :', error);
        }

        if (url.pathname.startsWith('/api/')) {
            json(res, error.status || 500, {
                ok: false,
                error: status >= 500 ? 'Internal server error.' : (error.message || 'Internal server error.'),
                ...(status < 500 ? (error.details || {}) : {})
            });
            return;
        }

        writeResponse(res, status, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store'
        }, status >= 500 ? 'Internal server error.' : (error.message || 'Internal server error.'));
    }
}

function cleanupSessions() {
    const now = Date.now();

    for (const [sessionId, session] of sessions.entries()) {
        if (session.expiresAt <= now) {
            sessions.delete(sessionId);
        }
    }

    for (const [state, stateData] of oauthStates.entries()) {
        const expiresAt = typeof stateData === 'number' ? stateData : stateData.expiresAt;

        if (expiresAt <= now) {
            oauthStates.delete(state);
        }
    }

    db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now);
    pruneRateLimitBuckets();
}

function startDashboardServer(ctx) {
    if (dashboardServer) {
        return dashboardServer;
    }

    const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);

    dashboardServer = http.createServer({
        maxHeaderSize: 16 * 1024,
        requestTimeout: 30 * 1000,
        headersTimeout: 15 * 1000,
        keepAliveTimeout: 5 * 1000
    }, (req, res) => {
        handleRequest(req, res, ctx);
    });
    dashboardServer.maxHeadersCount = 100;
    dashboardServer.maxRequestsPerSocket = 100;

    dashboardServer.listen(port, () => {
        console.log(`Dashboard Sentinel actif sur le port ${port}`);
    });

    const cleanupTimer = setInterval(cleanupSessions, 60 * 60 * 1000);
    cleanupTimer.unref();
    return dashboardServer;
}

module.exports = {
    startDashboardServer
};
