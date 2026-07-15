const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { PermissionsBitField } = require('discord.js');
const db = require('./database/database');

const sessions = new Map();
const oauthStates = new Map();
let dashboardServer = null;

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'sentinel_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;
const PUBLIC_SITE_BASE_PATH = '/bot-service-discord';
const CREATOR_USER_IDS = new Set(
    String(process.env.SENTINEL_CREATOR_USER_ID || process.env.CREATOR_USER_ID || '')
        .split(/[,\s]+/)
        .map(value => value.trim())
        .filter(Boolean)
);
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
    '/installation.html'
]);

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

function createHttpError(status, message, details = {}) {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    return error;
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

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ip = forwarded?.split(',')[0]?.trim()
        || req.socket?.remoteAddress
        || null;

    return ip;
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
        'roleId',
        'channelId',
        'userId',
        'messageId',
        'caseId',
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
    const { targetType, targetId } = getAuditTarget(body);
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

function buildAuditQuery({ guildId = null, actorUserId = null, targetId = null, action = null, status = null, limit = 25 } = {}) {
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

    const forwardedProto = req.headers['x-forwarded-proto'];
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;

    return `${proto || 'http'}://${host}`;
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
        const parsed = new URL(value, baseUrl);
        const base = new URL(baseUrl);
        const isSameOrigin = parsed.origin === base.origin;
        const isGithubPages = parsed.hostname.toLowerCase() === 'phileaszer.github.io';

        if (!isSameOrigin && !isGithubPages) {
            return `${baseUrl}/dashboard`;
        }

        const path = normalizeReturnPath(parsed.pathname);
        return `${baseUrl}${path}${parsed.search}${parsed.hash}`;
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
            cookies[name] = decodeURIComponent(valueParts.join('='));
        }

        return cookies;
    }, {});
}

function setSessionCookie(res, sessionId) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL / 1000)}`);
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function saveDashboardSession(sessionId, session, req = null) {
    const fingerprint = req ? getSessionFingerprint(req) : {};

    db.prepare(`
        INSERT OR REPLACE INTO dashboard_sessions (
            session_id,
            user_id,
            access_token,
            refresh_token,
            token_expires_at,
            ip_hash,
            user_agent,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        session.user.id,
        session.accessToken,
        session.refreshToken || null,
        session.tokenExpiresAt || null,
        fingerprint.ipHash || session.ipHash || null,
        fingerprint.userAgent || session.userAgent || null,
        session.createdAt,
        session.expiresAt
    );
}

function loadDashboardSession(sessionId) {
    const row = db.prepare(`
        SELECT session_id, user_id, access_token, refresh_token, token_expires_at, ip_hash, user_agent, created_at, expires_at
        FROM dashboard_sessions
        WHERE session_id = ?
    `).get(sessionId);

    if (!row) {
        return null;
    }

    const profile = getUserProfile(row.user_id);

    if (!profile) {
        db.prepare('DELETE FROM dashboard_sessions WHERE session_id = ?').run(sessionId);
        return null;
    }

    return {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        tokenExpiresAt: row.token_expires_at,
        ipHash: row.ip_hash,
        userAgent: row.user_agent,
        user: profile,
        createdAt: row.created_at,
        expiresAt: row.expires_at
    };
}

function extendDashboardSession(sessionId, session, req = null) {
    const fingerprint = req ? getSessionFingerprint(req) : {};
    const ipHash = fingerprint.ipHash || session.ipHash || null;
    const userAgent = fingerprint.userAgent || session.userAgent || null;

    session.ipHash = ipHash;
    session.userAgent = userAgent;

    db.prepare(`
        UPDATE dashboard_sessions
        SET expires_at = ?, ip_hash = ?, user_agent = ?
        WHERE session_id = ?
    `).run(session.expiresAt, ipHash, userAgent, sessionId);
}

function deleteDashboardSession(sessionId) {
    sessions.delete(sessionId);
    db.prepare('DELETE FROM dashboard_sessions WHERE session_id = ?').run(sessionId);
}

function getSession(req) {
    const sessionId = parseCookies(req)[SESSION_COOKIE];

    if (!sessionId) {
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
        ipHash: fingerprint.ipHash || null,
        userAgent: fingerprint.userAgent || null,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL
    };

    sessions.set(sessionId, session);
    saveDashboardSession(sessionId, session, req);
    return { sessionId, session };
}

function json(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(payload));
}

function redirect(res, location) {
    res.writeHead(302, { Location: location });
    res.end();
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;

            if (body.length > 1024 * 1024) {
                reject(createHttpError(413, 'Payload too large.'));
            }
        });

        req.on('end', () => {
            if (!body.trim()) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(createHttpError(400, 'Invalid JSON body.'));
            }
        });
    });
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

    if (!oauthManage && !commandRoleAccess) {
        throw createHttpError(403, 'You do not have access to this server dashboard.');
    }

    return { guild, member, oauthGuild, oauthManage, commandRoleAccess };
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

function requireModerationAccess(ctx, member, permissionFlag) {
    if (!member || !ctx.helpers.hasModerationAccess(member, permissionFlag)) {
        throw createHttpError(403, 'You do not have permission for this moderation action.');
    }
}

function requireBotPermission(guild, permissionFlag) {
    if (!guild.members.me?.permissions.has(permissionFlag)) {
        throw createHttpError(403, 'Sentinel does not have the required Discord permission.');
    }
}

function requireAdvanced(ctx, guildId) {
    if (!ctx.helpers.isAdvancedGuild(guildId)) {
        throw createHttpError(402, 'This action is reserved for Sentinel Premium.');
    }
}

function normalizeUserId(ctx, value) {
    const userId = ctx.helpers.normalizeUserId(value);

    if (!userId) {
        throw createHttpError(400, 'Invalid Discord user ID.');
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

function getTextChannel(guild, channelId) {
    const channel = getChannel(guild, channelId);

    if (!channel || !channel.isTextBased()) {
        throw createHttpError(400, 'Text channel not found.');
    }

    return channel;
}

async function buildGuildState(ctx, guild, session = null) {
    await guild.roles.fetch().catch(() => null);
    await guild.channels.fetch().catch(() => null);

    const config = ctx.helpers.getGuildConfig(guild.id);
    const summary = ctx.helpers.getServiceSummary(guild.id);
    const commandRoleIds = ctx.helpers.getCommandRoleIds(guild.id);
    const customEmbedQuota = ctx.helpers.getCustomEmbedQuota(guild.id);
    const canViewGlobalAudit = isCreatorUser(session?.user?.id);
    const auditLimit = ctx.helpers.isAdvancedGuild(guild.id) || canViewGlobalAudit ? 50 : 10;
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

    return {
        guild: {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL()
        },
        advanced: ctx.helpers.isAdvancedGuild(guild.id),
        inviteUrl: getInviteUrl(ctx, guild.id),
        config: {
            ...config,
            commandRoleIds
        },
        roles,
        channels,
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

    if (!role) {
        throw createHttpError(400, 'No service role is configured.');
    }

    const member = await guild.members.fetch(userId).catch(() => null);

    if (!member) {
        throw createHttpError(400, 'This user must be in the server to start duty.');
    }

    const userData = ctx.helpers.createUserIfMissing(guild.id, userId);

    if (userData?.startTime) {
        throw createHttpError(409, 'This user is already on duty.');
    }

    ctx.helpers.updateUserTime(guild.id, userId, userData?.totalTime || 0, Date.now());
    await member.roles.add(role).catch(() => {});

    const logChannel = ctx.helpers.getLogChannel(guild);
    if (logChannel) {
        await logChannel.send(`🟢 ${member} a pris son service depuis le dashboard.`).catch(() => {});
    }

    return `${member.user.tag} est maintenant en service.`;
}

async function endServiceForUser(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const userId = normalizeUserId(ctx, body.userId);
    const userData = ctx.helpers.getUserData(guild.id, userId);

    if (!userData?.startTime) {
        throw createHttpError(409, 'This user is not on duty.');
    }

    const duration = Date.now() - userData.startTime;
    const totalTime = (userData.totalTime || 0) + duration;
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = ctx.helpers.getServiceRole(guild);

    ctx.helpers.addSession(guild.id, userId, duration);
    ctx.helpers.updateUserTime(guild.id, userId, totalTime, null);

    if (member && role) {
        await member.roles.remove(role).catch(() => {});
    }

    const logChannel = ctx.helpers.getLogChannel(guild);
    if (logChannel) {
        await logChannel.send(`🔴 ${member || `user ID ${userId}`} a quitte son service depuis le dashboard. Duree : **${ctx.helpers.formatDuration(duration)}**`).catch(() => {});
    }

    return `Service termine. Duree : ${ctx.helpers.formatDuration(duration)}.`;
}

async function resetUserFromDashboard(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const userId = normalizeUserId(ctx, body.userId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = ctx.helpers.getServiceRole(guild);

    ctx.helpers.resetUser(guild.id, userId);

    if (member && role) {
        await member.roles.remove(role).catch(() => {});
    }

    return `Heures reinitialisees pour ${member?.user?.tag || userId}.`;
}

async function moderationAction(ctx, guild, actor, body) {
    const language = ctx.helpers.getGuildLanguage(guild.id);
    const action = body.action;
    const reason = getReason(ctx, body.reason, language);

    if (action === 'warn') {
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ModerateMembers);
        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId));
        const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'warn', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
        return `Avertissement ajoute. Cas #${caseData.id}.`;
    }

    if (action === 'timeout' || action === 'untimeout' || action === 'kick') {
        const flag = action === 'kick'
            ? PermissionsBitField.Flags.KickMembers
            : PermissionsBitField.Flags.ModerateMembers;
        requireModerationAccess(ctx, actor, flag);
        requireBotPermission(guild, flag);

        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId));
        const targetError = ctx.helpers.getModerationTargetError(actor, target.member, language);

        if (targetError) {
            throw createHttpError(400, targetError);
        }

        if (action === 'timeout') {
            const duration = ctx.helpers.parseDurationToMs(body.duration);

            if (!duration || duration > ctx.maxTimeoutDuration) {
                throw createHttpError(400, 'Invalid timeout duration.');
            }

            await target.member.timeout(duration, reason);
            const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'timeout', reason, duration);
            await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
            return `Timeout applique. Cas #${caseData.id}.`;
        }

        if (action === 'untimeout') {
            await target.member.timeout(null, reason);
            const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'untimeout', reason, null);
            await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
            return `Timeout retire. Cas #${caseData.id}.`;
        }

        await target.member.kick(reason);
        const caseData = ctx.helpers.addModerationCase(guild.id, target.userId, actor.id, 'kick', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, target.label, language);
        return `Membre expulse. Cas #${caseData.id}.`;
    }

    if (action === 'ban' || action === 'tempban') {
        if (action === 'tempban') {
            requireAdvanced(ctx, guild.id);
        }

        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.BanMembers);
        requireBotPermission(guild, PermissionsBitField.Flags.BanMembers);

        const target = await resolveTarget(ctx, guild, normalizeUserId(ctx, body.userId));
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

        await guild.members.ban(target.userId, {
            reason,
            deleteMessageSeconds: deleteDays * 24 * 60 * 60
        });

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
        requireAdvanced(ctx, guild.id);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.BanMembers);
        requireBotPermission(guild, PermissionsBitField.Flags.BanMembers);

        const userId = normalizeUserId(ctx, body.userId);
        await guild.bans.remove(userId, reason);
        ctx.helpers.deleteTemporaryBan(guild.id, userId);

        const caseData = ctx.helpers.addModerationCase(guild.id, userId, actor.id, 'unban', reason, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `user ID ${userId}`, language);
        return `Utilisateur debanni. Cas #${caseData.id}.`;
    }

    if (action === 'purge') {
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ManageMessages);
        requireBotPermission(guild, PermissionsBitField.Flags.ManageMessages);

        const channel = getTextChannel(guild, body.channelId);
        const count = Math.min(Math.max(Number(body.count) || 1, 1), 100);
        const deleted = await channel.bulkDelete(count, true);
        const caseData = ctx.helpers.addModerationCase(guild.id, null, actor.id, 'clear', `${count} messages demandes dans #${channel.name}`, null);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `${channel}`, language);
        return `${deleted.size} message(s) supprime(s).`;
    }

    if (['lock', 'unlock', 'slowmode'].includes(action)) {
        requireAdvanced(ctx, guild.id);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ManageChannels);
        requireBotPermission(guild, PermissionsBitField.Flags.ManageChannels);

        const channel = getTextChannel(guild, body.channelId);

        if (action === 'lock') {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                SendMessages: false,
                SendMessagesInThreads: false,
                CreatePublicThreads: false,
                CreatePrivateThreads: false
            }, { reason });
        }

        if (action === 'unlock') {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                SendMessages: null,
                SendMessagesInThreads: null,
                CreatePublicThreads: null,
                CreatePrivateThreads: null
            }, { reason });
        }

        if (action === 'slowmode') {
            const seconds = ctx.helpers.parseSlowmodeToSeconds(body.duration);

            if (seconds === null || seconds > 21600) {
                throw createHttpError(400, 'Invalid slowmode duration.');
            }

            await channel.setRateLimitPerUser(seconds, reason);
        }

        const duration = action === 'slowmode'
            ? ctx.helpers.parseSlowmodeToSeconds(body.duration) * 1000
            : null;
        const caseData = ctx.helpers.addModerationCase(guild.id, null, actor.id, action, `${channel} - ${reason}`, duration);
        await ctx.helpers.sendModerationLog(guild, actor.user, caseData, `${channel}`, language);
        return `Action ${action} appliquee. Cas #${caseData.id}.`;
    }

    if (['edit-case', 'delete-case', 'unwarn'].includes(action)) {
        requireAdvanced(ctx, guild.id);
        requireModerationAccess(ctx, actor, PermissionsBitField.Flags.ModerateMembers);

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

async function customEmbedAction(ctx, guild, actor, body) {
    requireCommandAccess(ctx, actor);

    const language = ctx.helpers.getGuildLanguage(guild.id);
    const action = body.action;
    const channel = getTextChannel(guild, body.channelId);
    const roleToPing = body.roleId ? guild.roles.cache.get(body.roleId) : null;

    if (body.roleId && !roleToPing) {
        throw createHttpError(400, 'Role not found.');
    }

    const channelError = ctx.helpers.getCustomEmbedChannelError(guild, channel, roleToPing, language);

    if (channelError) {
        throw createHttpError(403, channelError);
    }

    if (action === 'custom-embed-create') {
        const quota = ctx.helpers.getCustomEmbedQuota(guild.id);

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

        const sentMessage = await channel
            .send(ctx.helpers.buildCustomEmbedPayload(data, roleToPing, language))
            .catch(() => null);

        if (!sentMessage) {
            throw createHttpError(403, 'Sentinel cannot send this embed in the selected channel.');
        }

        ctx.helpers.addCustomEmbedRecord(guild.id, channel.id, sentMessage.id, actor.id, data);

        return `Embed Sentinel envoye dans #${channel.name}. ID : ${sentMessage.id}. ${ctx.helpers.formatCustomEmbedQuota(guild.id, language)}`;
    }

    const messageId = String(body.messageId || '').trim();

    if (!/^\d{17,20}$/.test(messageId)) {
        throw createHttpError(400, 'Invalid message ID.');
    }

    const record = ctx.helpers.getCustomEmbedRecord(guild.id, messageId);

    if (!record || record.channel_id !== channel.id) {
        throw createHttpError(404, 'Sentinel embed not found.');
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message || message.author.id !== ctx.client.user.id) {
        ctx.helpers.deleteCustomEmbedRecord(guild.id, messageId);
        throw createHttpError(404, 'Sentinel embed not found.');
    }

    if (action === 'custom-embed-delete') {
        await message.delete().catch(() => {});
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

        if (!changed) {
            throw createHttpError(400, 'No embed field provided.');
        }

        await message.edit({
            content: message.content || null,
            embeds: [ctx.helpers.buildCustomAnnouncementEmbed(data, language)],
            allowedMentions: { parse: [] }
        });
        ctx.helpers.updateCustomEmbedRecord(guild.id, messageId, data);
        return `Embed Sentinel ${messageId} modifie.`;
    }

    throw createHttpError(400, 'Unknown custom embed action.');
}

async function runDashboardAction(ctx, guild, member, body) {
    const action = body.action;
    const language = ctx.helpers.getGuildLanguage(guild.id);

    if (action === 'set-language') {
        requireCommandAccess(ctx, member);
        const nextLanguage = body.language === 'en' ? 'en' : 'fr';
        ctx.helpers.setGuildLanguage(guild.id, nextLanguage);
        return `Langue du serveur mise a jour : ${nextLanguage}.`;
    }

    if (action === 'set-service-role') {
        requireCommandAccess(ctx, member);
        const role = guild.roles.cache.get(body.roleId);

        if (!role) {
            throw createHttpError(400, 'Role not found.');
        }

        ctx.helpers.updateGuildConfig(guild.id, { serviceRoleId: role.id });
        return `Role de service configure : ${role.name}.`;
    }

    if (action === 'set-log-channel') {
        requireCommandAccess(ctx, member);
        const channel = getTextChannel(guild, body.channelId);
        ctx.helpers.updateGuildConfig(guild.id, { logChannelId: channel.id });
        return `Salon de logs configure : #${channel.name}.`;
    }

    if (action === 'add-command-role' || action === 'remove-command-role') {
        requireCommandAccess(ctx, member);
        const role = guild.roles.cache.get(body.roleId);

        if (!role || role.id === guild.id) {
            throw createHttpError(400, 'Role not found.');
        }

        if (action === 'add-command-role') {
            ctx.helpers.addCommandRole(guild.id, role.id);
            return `Role autorise ajoute : ${role.name}.`;
        }

        ctx.helpers.removeCommandRole(guild.id, role.id);
        return `Role autorise retire : ${role.name}.`;
    }

    if (action === 'publish-service-panel') {
        requireCommandAccess(ctx, member);
        const channel = getTextChannel(guild, body.channelId);
        await channel.send({
            content: '**Sentinel | Panneau de service**\nPrends ton service, consulte tes heures ou vois les agents actifs avec les boutons ci-dessous.',
            components: ctx.helpers.buildServicePanelComponents(language)
        });
        return `Panneau de service publie dans #${channel.name}.`;
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
        requireAdvanced(ctx, guild.id);
        requireCommandAccess(ctx, member);
        ctx.helpers.resetGuild(guild.id);
        return 'Toutes les heures du serveur ont ete reinitialisees.';
    }

    if (action === 'sync-service') {
        requireAdvanced(ctx, guild.id);
        requireCommandAccess(ctx, member);
        const result = await ctx.helpers.syncServiceState(guild);
        return `Synchronisation terminee : ${result.closedSessions} session(s) fermee(s), ${result.removedRoles} role(s) retire(s).`;
    }

    if (['custom-embed-create', 'custom-embed-edit', 'custom-embed-delete'].includes(action)) {
        return customEmbedAction(ctx, guild, member, body);
    }

    return moderationAction(ctx, guild, member, body);
}

async function handleApi(req, res, ctx, url) {
    if (req.method === 'POST' && url.pathname === '/api/logout') {
        const sessionId = parseCookies(req)[SESSION_COOKIE];

        if (sessionId) {
            deleteDashboardSession(sessionId);
        }

        clearSessionCookie(res);
        json(res, 200, { ok: true });
        return;
    }

    const session = requireSession(req);

    if (req.method === 'GET' && url.pathname === '/api/session') {
        json(res, 200, {
            ok: true,
            user: session.user,
            settings: getUserSiteSettings(session.user.id)
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
        const guilds = [];

        for (const oauthGuild of oauthGuilds) {
            const installed = ctx.client.guilds.cache.has(oauthGuild.id);
            let memberAccess = false;

            if (installed) {
                const guild = ctx.client.guilds.cache.get(oauthGuild.id);
                const member = await guild.members.fetch(session.user.id).catch(() => null);
                memberAccess = member ? ctx.helpers.hasCommandRoleAccess(member) : false;
            }

            if (!userCanManageOauthGuild(oauthGuild) && !memberAccess) {
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
                advanced: ctx.helpers.isAdvancedGuild(oauthGuild.id)
            });
        }

        json(res, 200, { ok: true, guilds });
        return;
    }

    const stateMatch = /^\/api\/guilds\/(\d{17,20})\/state$/.exec(url.pathname);
    if (req.method === 'GET' && stateMatch) {
        const { guild } = await getDashboardAccess(ctx, session, stateMatch[1]);
        updateUserSiteSettings(session.user.id, { lastGuildId: guild.id });
        json(res, 200, { ok: true, state: await buildGuildState(ctx, guild, session) });
        return;
    }

    const auditMatch = /^\/api\/guilds\/(\d{17,20})\/audit$/.exec(url.pathname);
    if (req.method === 'GET' && auditMatch) {
        const { guild } = await getDashboardAccess(ctx, session, auditMatch[1]);
        const canViewGlobalAudit = isCreatorUser(session.user.id);
        const maxLimit = ctx.helpers.isAdvancedGuild(guild.id) || canViewGlobalAudit ? 100 : 10;
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
                    limit: Math.min(Number(url.searchParams.get('limit')) || 100, 100)
                })
            }
        });
        return;
    }

    const actionMatch = /^\/api\/guilds\/(\d{17,20})\/action$/.exec(url.pathname);
    if (req.method === 'POST' && actionMatch) {
        const { guild, member } = await getDashboardAccess(ctx, session, actionMatch[1]);
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
            message = await runDashboardAction(ctx, guild, member, body);
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

        json(res, 200, {
            ok: true,
            message,
            state: await buildGuildState(ctx, guild, session)
        });
        return;
    }

    throw createHttpError(404, 'API route not found.');
}

function serveStatic(req, res, url) {
    const siteDir = path.join(__dirname, 'site');
    const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const routeMap = {
        '': 'index.html',
        dashboard: 'dashboard.html',
        fonctionnalites: 'fonctionnalites.html',
        commandes: 'commandes.html',
        premium: 'premium.html',
        securite: 'securite.html',
        installation: 'installation.html'
    };
    const relativePath = routeMap[cleanPath] || cleanPath;
    const filePath = path.normalize(path.join(siteDir, relativePath));

    if (!filePath.startsWith(siteDir)) {
        throw createHttpError(403, 'Forbidden.');
    }

    const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : path.join(siteDir, '404.html');
    const ext = path.extname(finalPath);
    const content = fs.readFileSync(finalPath);

    res.writeHead(finalPath.endsWith('404.html') ? 404 : 200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });
    res.end(content);
}

async function handleRequest(req, res, ctx) {
    const url = new URL(req.url, getRequestBaseUrl(req));

    try {
        if (req.method === 'GET' && url.pathname === '/auth/login') {
            if (!process.env.CLIENT_SECRET) {
                throw createHttpError(503, 'Discord OAuth is not configured. Add CLIENT_SECRET on Railway.');
            }

            const state = crypto.randomBytes(16).toString('hex');
            const returnTo = getSafeReturnTo(req, url.searchParams.get('return_to'));
            oauthStates.set(state, {
                expiresAt: Date.now() + 10 * 60 * 1000,
                returnTo
            });
            const oauthUrl = new URL('https://discord.com/oauth2/authorize');
            oauthUrl.searchParams.set('client_id', process.env.CLIENT_ID);
            oauthUrl.searchParams.set('redirect_uri', getRedirectUri(req));
            oauthUrl.searchParams.set('response_type', 'code');
            oauthUrl.searchParams.set('scope', 'identify guilds');
            oauthUrl.searchParams.set('state', state);

            redirect(res, oauthUrl.toString());
            return;
        }

        if (req.method === 'GET' && url.pathname === '/auth/logout') {
            const sessionId = parseCookies(req)[SESSION_COOKIE];

            if (sessionId) {
                deleteDashboardSession(sessionId);
            }

            clearSessionCookie(res);
            redirect(res, getSafeReturnTo(req, url.searchParams.get('return_to')));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/auth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');

            if (!code) {
                throw createHttpError(400, 'Missing Discord authorization code.');
            }

            const stateData = state ? oauthStates.get(state) : null;
            const stateExpiresAt = typeof stateData === 'number' ? stateData : stateData?.expiresAt;

            if (!state || !stateData || stateExpiresAt <= Date.now()) {
                throw createHttpError(400, 'Invalid Discord authorization state.');
            }

            oauthStates.delete(state);
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

            setSessionCookie(res, sessionId);
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
        if (url.pathname.startsWith('/api/')) {
            json(res, error.status || 500, {
                ok: false,
                error: error.message || 'Internal server error.',
                ...(error.details || {})
            });
            return;
        }

        res.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(error.message || 'Internal server error.');
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
}

function startDashboardServer(ctx) {
    if (dashboardServer) {
        return dashboardServer;
    }

    const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);

    dashboardServer = http.createServer((req, res) => {
        handleRequest(req, res, ctx);
    });

    dashboardServer.listen(port, () => {
        console.log(`Dashboard Sentinel actif sur le port ${port}`);
    });

    setInterval(cleanupSessions, 60 * 60 * 1000);
    return dashboardServer;
}

module.exports = {
    startDashboardServer
};
