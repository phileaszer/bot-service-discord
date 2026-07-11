const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { PermissionsBitField } = require('discord.js');

const sessions = new Map();
const oauthStates = new Map();
let dashboardServer = null;

const DISCORD_API = 'https://discord.com/api/v10';
const SESSION_COOKIE = 'sentinel_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

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

function getSession(req) {
    const sessionId = parseCookies(req)[SESSION_COOKIE];

    if (!sessionId) {
        return null;
    }

    const session = sessions.get(sessionId);

    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return null;
    }

    session.expiresAt = Date.now() + SESSION_TTL;
    return session;
}

function createSession(payload) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const session = {
        ...payload,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL
    };

    sessions.set(sessionId, session);
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

async function buildGuildState(ctx, guild) {
    await guild.roles.fetch().catch(() => null);
    await guild.channels.fetch().catch(() => null);

    const config = ctx.helpers.getGuildConfig(guild.id);
    const summary = ctx.helpers.getServiceSummary(guild.id);
    const commandRoleIds = ctx.helpers.getCommandRoleIds(guild.id);
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
        }))
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

    return moderationAction(ctx, guild, member, body);
}

async function handleApi(req, res, ctx, url) {
    const session = requireSession(req);

    if (req.method === 'POST' && url.pathname === '/api/logout') {
        const sessionId = parseCookies(req)[SESSION_COOKIE];

        if (sessionId) {
            sessions.delete(sessionId);
        }

        clearSessionCookie(res);
        json(res, 200, { ok: true });
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/session') {
        json(res, 200, { ok: true, user: session.user });
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
        json(res, 200, { ok: true, state: await buildGuildState(ctx, guild) });
        return;
    }

    const actionMatch = /^\/api\/guilds\/(\d{17,20})\/action$/.exec(url.pathname);
    if (req.method === 'POST' && actionMatch) {
        const { guild, member } = await getDashboardAccess(ctx, session, actionMatch[1]);
        const body = await parseBody(req);
        const message = await runDashboardAction(ctx, guild, member, body);
        json(res, 200, {
            ok: true,
            message,
            state: await buildGuildState(ctx, guild)
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
            oauthStates.set(state, Date.now() + 10 * 60 * 1000);
            const oauthUrl = new URL('https://discord.com/oauth2/authorize');
            oauthUrl.searchParams.set('client_id', process.env.CLIENT_ID);
            oauthUrl.searchParams.set('redirect_uri', getRedirectUri(req));
            oauthUrl.searchParams.set('response_type', 'code');
            oauthUrl.searchParams.set('scope', 'identify guilds');
            oauthUrl.searchParams.set('state', state);

            redirect(res, oauthUrl.toString());
            return;
        }

        if (req.method === 'GET' && url.pathname === '/auth/callback') {
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');

            if (!code) {
                throw createHttpError(400, 'Missing Discord authorization code.');
            }

            if (!state || !oauthStates.has(state) || oauthStates.get(state) <= Date.now()) {
                throw createHttpError(400, 'Invalid Discord authorization state.');
            }

            oauthStates.delete(state);
            const token = await exchangeCode(req, code);
            const user = await discordFetch('/users/@me', token.access_token);
            const { sessionId } = createSession({
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                tokenExpiresAt: Date.now() + (token.expires_in * 1000),
                user: {
                    id: user.id,
                    username: user.username,
                    globalName: user.global_name,
                    avatar: user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                        : null
                }
            });

            setSessionCookie(res, sessionId);
            redirect(res, '/dashboard');
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

    for (const [state, expiresAt] of oauthStates.entries()) {
        if (expiresAt <= now) {
            oauthStates.delete(state);
        }
    }
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
