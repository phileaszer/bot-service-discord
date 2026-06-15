require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags,
    Events
} = require('discord.js');

const db = require('./database/database');
const { syncSentinelServer } = require('./server-sync');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const FREE_HISTORY_LIMIT = 5;
const ADVANCED_HISTORY_LIMIT = 25;
const MAX_TIMEOUT_DURATION = 28 * 24 * 60 * 60 * 1000;
const ADVANCED_COMMAND_NAMES = new Set([
    'heures',
    'hours',
    'top-semaine',
    'top-week',
    'ping',
    'diagnostic',
    'sync-service',
    'reset-heures',
    'reset-hours',
    'reset-heures-all',
    'reset-hours-all',
    'resume-service',
    'summary'
]);
const ADVANCED_TEXT_COMMANDS = [
    /^!(heures|hours)(?:\s|$)/i,
    /^!(top-semaine|top-week)$/i,
    /^!ping$/i,
    /^!diagnostic$/i,
    /^!sync-service$/i,
    /^!(reset-heures|reset-hours)(?:\s|$)/i,
    /^!(reset-heures-all|reset-hours-all)$/i,
    /^!(resume-service|summary)$/i
];
const SENTINEL_COLORS = {
    primary: 0xff2d9a,
    accent: 0x17e7ff,
    success: 0x15f5d1,
    warning: 0xff4fb8,
    danger: 0xff235a,
    neutral: 0x8b8fa3,
    advanced: 0xb76cff
};

const SUPPORTED_LANGUAGES = new Set(['fr', 'en']);
const MODERATION_ACTION_LABELS = {
    fr: {
        warn: 'Avertissement',
        timeout: 'Timeout',
        untimeout: 'Fin du timeout',
        kick: 'Expulsion',
        ban: 'Bannissement',
        clear: 'Purge'
    },
    en: {
        warn: 'Warning',
        timeout: 'Timeout',
        untimeout: 'Timeout removed',
        kick: 'Kick',
        ban: 'Ban',
        clear: 'Purge'
    }
};

const I18N = {
    fr: {
        requestedBy: 'Demandé par',
        brand: 'Performance - Sécurité - Fiabilité',
        installRequired: 'Sentinel doit etre ajoute comme bot sur ce serveur pour fonctionner.',
        installRequiredNoInvite: 'Sentinel doit etre ajoute comme bot sur ce serveur pour fonctionner. Verifie que le lien d invitation contient les scopes bot et applications.commands.',
        installCommandsOnly: 'Le lien utilise a probablement installe uniquement les commandes.',
        reinvite: 'Reinvite Sentinel avec ce lien : {inviteUrl}',
        unavailable: 'Cette commande n’est pas disponible sur ce serveur pour le moment.',
        bootstrapRoles: 'Aucun role configure. En amorcage, le proprietaire, les administrateurs et les membres avec Gerer le serveur ou Gerer les roles peuvent configurer Sentinel.',
        accessDenied: '❌ Tu n’as pas accès à cette commande.\nSi aucun rôle de gestion n’est encore configuré, un membre avec `Administrateur`, `Gérer le serveur` ou `Gérer les rôles` peut lancer `/config-permissions action:ajouter role:@role`.',
        languageSet: '✅ La langue de ce serveur est maintenant le français.',
        languageSetEn: '✅ La langue de ce serveur est maintenant l’anglais.',
        languageChooseTitle: 'Sentinel | Choix de la langue',
        languageChooseDescription: 'Choisis la langue de ce serveur. Ce choix est propre a ce serveur et ne change pas les autres serveurs.',
        languageFrench: 'Français',
        languageEnglish: 'English',
        adminRoleRequired: '❌ Tu dois choisir un rôle pour cette action.',
        everyoneDenied: '❌ Tu ne peux pas utiliser le rôle @everyone.',
        commandRoleAdded: '✅ {role} peut maintenant utiliser les commandes de gestion du bot.',
        commandRoleRemoved: '✅ {role} ne peut plus utiliser les commandes de gestion du bot.',
        serviceRoleSet: '✅ Le rôle de service a été configuré sur {role}.',
        invalidChannelId: '❌ ID de salon invalide.',
        channelNotText: '❌ Aucun salon textuel accessible ne correspond à cet ID.',
        logChannelSet: '✅ Le salon de logs a été configuré sur {channel}.',
        pingOk: '🏓 Pong ! SQLite OK. Latence Discord : **{ping}ms**',
        pingDbError: '❌ Le bot répond, mais SQLite ne répond pas correctement.',
        freeHistoryOwnOnly: 'En gratuit, tu peux consulter seulement ton historique personnel et les {limit} dernières sessions.',
        noMemberHours: '⏱️ {member} n’a encore aucune heure enregistrée sur ce serveur.',
        noActive: '🟢 Aucun agent n’est actuellement en service sur ce serveur.',
        noTop: '🏆 Aucun temps de service enregistré sur ce serveur pour le moment.',
        noWeek: '📅 Aucun temps de service enregistré cette semaine sur ce serveur.',
        resetUser: '✅ Les heures de service de {member} ont été réinitialisées sur ce serveur.',
        resetConfirm: '⚠️ Confirme la réinitialisation de toutes les heures de service de ce serveur.\nCette action supprimera aussi les sessions enregistrées.',
        resetNotForYou: '❌ Cette confirmation ne t’est pas destinée.',
        resetExpired: '⏳ Confirmation expirée. Relance la commande si tu veux toujours réinitialiser les heures.',
        resetCancelled: '✅ Réinitialisation annulée.',
        resetGuildDone: '✅ Toutes les heures de service de ce serveur ont été réinitialisées.',
        noServiceRole: '❌ Aucun rôle de service n’est configuré sur ce serveur.\nUtilise `/config-role` pour en définir un.',
        serviceLeftLog: '🔴 {member} a quitté son service.\n⏱️ Durée : **{duration}**\n📊 Total : **{total}**',
        serviceLeft: '🔴 Tu as quitté ton service.\n⏱️ Durée de cette session : **{duration}**',
        serviceStartedLog: '🟢 {member} a pris son service.',
        serviceStarted: '🟢 Tu as pris ton service.',
        serviceError: '❌ Une erreur est survenue. Regarde le terminal du bot.',
        showMyHoursLabel: 'Mes heures',
        activeLabel: 'En service',
        toggleLabel: 'Prendre / Quitter',
        confirm: 'Confirmer',
        cancel: 'Annuler',
        helpTitle: 'Sentinel | Guide de démarrage',
        helpDescription: 'Commence ici. Ce guide explique comment installer Sentinel, choisir la langue du serveur, le configurer, puis l utiliser sans connaitre les bots Discord.',
        moderationAccessDenied: '❌ Tu n’as pas accès à cette commande de modération.',
        moderationBotPermissionMissing: '❌ Sentinel n’a pas la permission Discord nécessaire pour faire cette action.',
        moderationMemberRequired: '❌ Tu dois choisir un membre du serveur.',
        moderationUserRequired: '❌ Tu dois choisir un utilisateur.',
        moderationReasonDefault: 'Aucune raison indiquée.',
        moderationDurationInvalid: '❌ Durée invalide. Exemples valides : `10m`, `2h`, `7d`.',
        moderationDurationTooLong: '❌ Discord limite les timeouts à 28 jours maximum.',
        moderationSelfDenied: '❌ Tu ne peux pas te modérer toi-même avec Sentinel.',
        moderationOwnerDenied: '❌ Sentinel ne peut pas modérer le propriétaire du serveur.',
        moderationBotDenied: '❌ Sentinel ne peut pas modérer cet utilisateur.',
        moderationHierarchyDenied: '❌ Le rôle de cette personne est trop haut dans la hiérarchie Discord.',
        moderationWarned: '✅ {member} a reçu un avertissement. Cas #{caseId}.',
        moderationTimeout: '✅ {member} a été timeout pendant **{duration}**. Cas #{caseId}.',
        moderationUntimeout: '✅ Le timeout de {member} a été retiré. Cas #{caseId}.',
        moderationKick: '✅ {member} a été expulsé du serveur. Cas #{caseId}.',
        moderationBan: '✅ {user} a été banni du serveur. Cas #{caseId}.',
        moderationClear: '✅ **{count}** message(s) supprimé(s).',
        moderationCasesEmpty: 'Aucune sanction enregistrée pour {member}.',
        moderationFailed: '❌ L’action de modération a échoué. Vérifie les permissions et la hiérarchie des rôles.',
        moderationNoChannel: '❌ Cette commande doit être utilisée dans un salon textuel.',
        moderationCasesTitle: 'Sentinel | Sanctions',
        moderationLogTitle: 'Sentinel | Modération'
    },
    en: {
        requestedBy: 'Requested by',
        brand: 'Performance - Security - Reliability',
        installRequired: 'Sentinel must be added as a bot on this server to work.',
        installRequiredNoInvite: 'Sentinel must be added as a bot on this server to work. Make sure the invite link contains the bot and applications.commands scopes.',
        installCommandsOnly: 'The link used probably installed commands only.',
        reinvite: 'Reinvite Sentinel with this link: {inviteUrl}',
        unavailable: 'This command is not available on this server for now.',
        bootstrapRoles: 'No role configured. During setup, the owner, administrators, and members with Manage Server or Manage Roles can configure Sentinel.',
        accessDenied: '❌ You do not have access to this command.\nIf no management role is configured yet, a member with `Administrator`, `Manage Server`, or `Manage Roles` can run `/config-permissions action:add role:@role`.',
        languageSet: '✅ This server language is now French.',
        languageSetEn: '✅ This server language is now English.',
        languageChooseTitle: 'Sentinel | Language selection',
        languageChooseDescription: 'Choose this server language. This setting is specific to this server and does not affect other servers.',
        languageFrench: 'Français',
        languageEnglish: 'English',
        adminRoleRequired: '❌ You must choose a role for this action.',
        everyoneDenied: '❌ You cannot use the @everyone role.',
        commandRoleAdded: '✅ {role} can now use bot management commands.',
        commandRoleRemoved: '✅ {role} can no longer use bot management commands.',
        serviceRoleSet: '✅ The service role has been set to {role}.',
        invalidChannelId: '❌ Invalid channel ID.',
        channelNotText: '❌ No accessible text channel matches this ID.',
        logChannelSet: '✅ The log channel has been set to {channel}.',
        pingOk: '🏓 Pong! SQLite OK. Discord latency: **{ping}ms**',
        pingDbError: '❌ The bot is responding, but SQLite is not responding correctly.',
        freeHistoryOwnOnly: 'In free mode, you can only view your personal history and the last {limit} sessions.',
        noMemberHours: '⏱️ {member} does not have any recorded hours on this server yet.',
        noActive: '🟢 No agent is currently on duty on this server.',
        noTop: '🏆 No service time has been recorded on this server yet.',
        noWeek: '📅 No service time has been recorded this week on this server.',
        resetUser: '✅ Service hours for {member} have been reset on this server.',
        resetConfirm: '⚠️ Confirm the reset of all service hours on this server.\nThis action will also delete recorded sessions.',
        resetNotForYou: '❌ This confirmation is not for you.',
        resetExpired: '⏳ Confirmation expired. Run the command again if you still want to reset the hours.',
        resetCancelled: '✅ Reset cancelled.',
        resetGuildDone: '✅ All service hours on this server have been reset.',
        noServiceRole: '❌ No service role is configured on this server.\nUse `/config-role` to set one.',
        serviceLeftLog: '🔴 {member} ended their service.\n⏱️ Duration: **{duration}**\n📊 Total: **{total}**',
        serviceLeft: '🔴 You ended your service.\n⏱️ Session duration: **{duration}**',
        serviceStartedLog: '🟢 {member} started their service.',
        serviceStarted: '🟢 You started your service.',
        serviceError: '❌ An error occurred. Check the bot terminal.',
        showMyHoursLabel: 'My hours',
        activeLabel: 'On duty',
        toggleLabel: 'Start / End',
        confirm: 'Confirm',
        cancel: 'Cancel',
        helpTitle: 'Sentinel | Getting started',
        helpDescription: 'Start here. This guide explains how to install Sentinel, choose the server language, configure it, and use it without knowing Discord bots.',
        moderationAccessDenied: '❌ You do not have access to this moderation command.',
        moderationBotPermissionMissing: '❌ Sentinel does not have the required Discord permission for this action.',
        moderationMemberRequired: '❌ You must choose a server member.',
        moderationUserRequired: '❌ You must choose a user.',
        moderationReasonDefault: 'No reason provided.',
        moderationDurationInvalid: '❌ Invalid duration. Valid examples: `10m`, `2h`, `7d`.',
        moderationDurationTooLong: '❌ Discord limits timeouts to 28 days maximum.',
        moderationSelfDenied: '❌ You cannot moderate yourself with Sentinel.',
        moderationOwnerDenied: '❌ Sentinel cannot moderate the server owner.',
        moderationBotDenied: '❌ Sentinel cannot moderate this user.',
        moderationHierarchyDenied: '❌ This person role is too high in the Discord hierarchy.',
        moderationWarned: '✅ {member} has been warned. Case #{caseId}.',
        moderationTimeout: '✅ {member} has been timed out for **{duration}**. Case #{caseId}.',
        moderationUntimeout: '✅ Timeout removed from {member}. Case #{caseId}.',
        moderationKick: '✅ {member} has been kicked from the server. Case #{caseId}.',
        moderationBan: '✅ {user} has been banned from the server. Case #{caseId}.',
        moderationClear: '✅ **{count}** message(s) deleted.',
        moderationCasesEmpty: 'No moderation case recorded for {member}.',
        moderationFailed: '❌ Moderation action failed. Check permissions and role hierarchy.',
        moderationNoChannel: '❌ This command must be used in a text channel.',
        moderationCasesTitle: 'Sentinel | Moderation cases',
        moderationLogTitle: 'Sentinel | Moderation'
    }
};

const BOT_INVITE_PERMISSIONS = '1099780156422';

function normalizeLanguage(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (['en', 'english', 'anglais', 'eng'].includes(normalized)) {
        return 'en';
    }

    return 'fr';
}

function interpolate(template, values = {}) {
    return template.replace(/\{(\w+)\}/g, (_, key) => (
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    ));
}

function t(language, key, values = {}) {
    const lang = SUPPORTED_LANGUAGES.has(language) ? language : 'fr';
    const template = I18N[lang][key] || I18N.fr[key] || key;

    return interpolate(template, values);
}

function getGuildLanguage(guildId) {
    return getGuildConfig(guildId).language;
}

function setGuildLanguage(guildId, language) {
    return updateGuildConfig(guildId, {
        language: normalizeLanguage(language)
    }).language;
}

function resolveCommandName(commandName) {
    const aliases = {
        aide: 'aide',
        help: 'aide',
        'config-langue': 'config-langue',
        language: 'config-langue',
        'config-role': 'config-role',
        'config-logs': 'config-logs',
        'config-channel': 'config-logs',
        'config-voir': 'config-voir',
        'config-view': 'config-voir',
        'mes-heures': 'mes-heures',
        'my-hours': 'mes-heures',
        'historique-service': 'historique-service',
        history: 'historique-service',
        'en-service': 'en-service',
        'on-duty': 'en-service',
        heures: 'heures',
        hours: 'heures',
        'top-service': 'top-service',
        'top-semaine': 'top-semaine',
        'top-week': 'top-semaine',
        ping: 'ping',
        diagnostic: 'diagnostic',
        'sync-service': 'sync-service',
        'reset-heures': 'reset-heures',
        'reset-hours': 'reset-heures',
        'reset-heures-all': 'reset-heures-all',
        'reset-hours-all': 'reset-heures-all',
        'resume-service': 'resume-service',
        summary: 'resume-service',
        avertir: 'avertir',
        warn: 'avertir',
        timeout: 'timeout',
        'fin-timeout': 'fin-timeout',
        untimeout: 'fin-timeout',
        expulser: 'expulser',
        kick: 'expulser',
        bannir: 'bannir',
        ban: 'bannir',
        purge: 'purge',
        clear: 'purge',
        sanctions: 'sanctions',
        'mod-cases': 'sanctions'
    };

    return aliases[commandName] || commandName;
}

function getBotInviteUrl() {
    const clientId = String(process.env.CLIENT_ID || client.user?.id || '').trim();

    if (!/^\d{17,20}$/.test(clientId)) {
        return null;
    }

    const params = new URLSearchParams({
        client_id: clientId,
        permissions: BOT_INVITE_PERMISSIONS,
        integration_type: '0',
        scope: 'bot applications.commands'
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function getGuildInstallRequiredMessage() {
    const language = 'fr';
    const inviteUrl = getBotInviteUrl();

    if (!inviteUrl) {
        return t(language, 'installRequiredNoInvite');
    }

    return [
        t(language, 'installRequired'),
        t(language, 'installCommandsOnly'),
        '',
        t(language, 'reinvite', { inviteUrl })
    ].join('\n');
}

function buildFooter(requester, language = 'fr') {
    const footer = {
        text: `Sentinel - ${t(language, 'requestedBy')} ${requester.username}`
    };

    if (typeof requester.displayAvatarURL === 'function') {
        footer.iconURL = requester.displayAvatarURL();
    }

    return footer;
}

function createSentinelEmbed({
    color = SENTINEL_COLORS.primary,
    title,
    description = null,
    requester,
    thumbnail = null,
    language = 'fr'
}) {
    const brandIcon = client.user?.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setFooter(buildFooter(requester, language))
        .setTimestamp();

    if (brandIcon) {
        embed.setAuthor({
            name: t(language, 'brand'),
            iconURL: brandIcon
        });
    }

    if (description) {
        embed.setDescription(description);
    }

    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    return embed;
}

function getRankLabel(index) {
    if (index === 0) return '01';
    if (index === 1) return '02';
    if (index === 2) return '03';

    return String(index + 1).padStart(2, '0');
}

function getServiceStatusText(startTime) {
    return startTime ? 'En service' : 'Hors service';
}

function formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours}h ${minutes}min ${seconds}s`;
}

function checkDatabase() {
    db.prepare('SELECT 1').get();
}

function getAdvancedGuildId() {
    const guildId = String(process.env.GUILD_ID || '').trim();

    return /^\d{17,20}$/.test(guildId) ? guildId : null;
}

function isAdvancedGuild(guildId) {
    return Boolean(guildId && guildId === getAdvancedGuildId());
}

function isAdvancedCommand(commandName) {
    return ADVANCED_COMMAND_NAMES.has(commandName);
}

function isAdvancedTextCommand(content) {
    const normalizedContent = content.trim();

    return ADVANCED_TEXT_COMMANDS.some(pattern => pattern.test(normalizedContent));
}

function getAdvancedUnavailableMessage(language = 'fr') {
    return t(language, 'unavailable');
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
}

function mapGuildConfig(row) {
    return {
        serviceRoleId: row?.role_id || null,
        logChannelId: row?.log_channel_id || null,
        language: normalizeLanguage(row?.language)
    };
}

function mapUserData(row) {
    if (!row) {
        return null;
    }

    return {
        totalTime: row.total_time || 0,
        startTime: row.start_time || null
    };
}

function getGuildConfig(guildId) {
    let row = db.prepare(`
        SELECT role_id, log_channel_id, language
        FROM guild_configs
        WHERE guild_id = ?
    `).get(guildId);

    if (!row) {
        db.prepare(`
            INSERT INTO guild_configs (guild_id, role_id, log_channel_id, language)
            VALUES (?, NULL, NULL, 'fr')
        `).run(guildId);

        row = {
            role_id: null,
            log_channel_id: null,
            language: 'fr'
        };
    }

    return mapGuildConfig(row);
}

function updateGuildConfig(guildId, newConfig) {
    const currentConfig = getGuildConfig(guildId);
    const nextConfig = {
        serviceRoleId: Object.prototype.hasOwnProperty.call(newConfig, 'serviceRoleId')
            ? newConfig.serviceRoleId
            : currentConfig.serviceRoleId,
        logChannelId: Object.prototype.hasOwnProperty.call(newConfig, 'logChannelId')
            ? newConfig.logChannelId
            : currentConfig.logChannelId,
        language: Object.prototype.hasOwnProperty.call(newConfig, 'language')
            ? normalizeLanguage(newConfig.language)
            : currentConfig.language
    };

    db.prepare(`
        UPDATE guild_configs
        SET role_id = ?, log_channel_id = ?, language = ?
        WHERE guild_id = ?
    `).run(nextConfig.serviceRoleId, nextConfig.logChannelId, nextConfig.language, guildId);

    return nextConfig;
}

function getCommandRoleIds(guildId) {
    return db.prepare(`
        SELECT role_id
        FROM guild_command_roles
        WHERE guild_id = ?
        ORDER BY role_id ASC
    `).all(guildId).map(row => row.role_id);
}

function addCommandRole(guildId, roleId) {
    db.prepare(`
        INSERT OR IGNORE INTO guild_command_roles (guild_id, role_id)
        VALUES (?, ?)
    `).run(guildId, roleId);
}

function removeCommandRole(guildId, roleId) {
    db.prepare(`
        DELETE FROM guild_command_roles
        WHERE guild_id = ? AND role_id = ?
    `).run(guildId, roleId);
}

function formatCommandRoleList(guildId, language = 'fr') {
    const roleIds = getCommandRoleIds(guildId);

    if (roleIds.length === 0) {
        return t(language, 'bootstrapRoles');
    }

    return roleIds.map(roleId => `<@&${roleId}>`).join('\n');
}

function hasBootstrapManageAccess(member) {
    return member.permissions.has(PermissionsBitField.Flags.Administrator)
        || member.permissions.has(PermissionsBitField.Flags.ManageGuild)
        || member.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

function hasCommandRoleAccess(member) {
    if (!member) {
        return false;
    }

    if (member.id === member.guild.ownerId) {
        return true;
    }

    const roleIds = getCommandRoleIds(member.guild.id);

    if (roleIds.length === 0) {
        return hasBootstrapManageAccess(member);
    }

    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function getCommandRoleAccessDeniedMessage(language = 'fr') {
    return t(language, 'accessDenied');
}

function getUserData(guildId, userId) {
    const row = db.prepare(`
        SELECT total_time, start_time
        FROM service_times
        WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    return mapUserData(row);
}

function createUserIfMissing(guildId, userId) {
    db.prepare(`
        INSERT OR IGNORE INTO service_times (guild_id, user_id, total_time, start_time)
        VALUES (?, ?, 0, NULL)
    `).run(guildId, userId);

    return getUserData(guildId, userId);
}

function updateUserTime(guildId, userId, totalTime, startTime) {
    createUserIfMissing(guildId, userId);

    db.prepare(`
        UPDATE service_times
        SET total_time = ?, start_time = ?
        WHERE guild_id = ? AND user_id = ?
    `).run(totalTime, startTime, guildId, userId);

    return getUserData(guildId, userId);
}

function addSession(guildId, userId, duration, date = new Date().toISOString()) {
    db.prepare(`
        INSERT INTO service_sessions (guild_id, user_id, date, duration)
        VALUES (?, ?, ?, ?)
    `).run(guildId, userId, date, duration);
}

function resetUser(guildId, userId) {
    const reset = db.transaction(() => {
        db.prepare(`
            INSERT OR REPLACE INTO service_times (guild_id, user_id, total_time, start_time)
            VALUES (?, ?, 0, NULL)
        `).run(guildId, userId);

        db.prepare(`
            DELETE FROM service_sessions
            WHERE guild_id = ? AND user_id = ?
        `).run(guildId, userId);
    });

    reset();
}

function resetGuild(guildId) {
    const reset = db.transaction(() => {
        db.prepare(`
            DELETE FROM service_times
            WHERE guild_id = ?
        `).run(guildId);

        db.prepare(`
            DELETE FROM service_sessions
            WHERE guild_id = ?
        `).run(guildId);
    });

    reset();
}

function getTopService(guildId) {
    const now = Date.now();
    const rows = db.prepare(`
        SELECT user_id, total_time, start_time
        FROM service_times
        WHERE guild_id = ?
    `).all(guildId);

    return rows
        .map(row => {
            let totalTime = row.total_time || 0;

            if (row.start_time) {
                totalTime += now - row.start_time;
            }

            return {
                userId: row.user_id,
                totalTime
            };
        })
        .filter(user => user.totalTime > 0)
        .sort((a, b) => b.totalTime - a.totalTime);
}

function getRegisteredUserCount(guildId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM service_times
        WHERE guild_id = ?
    `).get(guildId);

    return row?.count || 0;
}

function getActiveServices(guildId) {
    const now = Date.now();
    const rows = db.prepare(`
        SELECT user_id, start_time
        FROM service_times
        WHERE guild_id = ? AND start_time IS NOT NULL
        ORDER BY start_time ASC
    `).all(guildId);

    return rows.map(row => ({
        userId: row.user_id,
        startTime: row.start_time,
        duration: Math.max(0, now - row.start_time)
    }));
}

function getActiveServiceRows(guildId) {
    return db.prepare(`
        SELECT user_id, total_time, start_time
        FROM service_times
        WHERE guild_id = ? AND start_time IS NOT NULL
    `).all(guildId).map(row => ({
        userId: row.user_id,
        totalTime: row.total_time || 0,
        startTime: row.start_time
    }));
}

async function fetchMemberSafely(guild, userId) {
    return guild.members.cache.get(userId)
        || await guild.members.fetch(userId).catch(() => null);
}

async function getServiceConsistencyStats(guild) {
    const role = getServiceRole(guild);
    const activeRows = getActiveServiceRows(guild.id);

    if (!role) {
        return {
            activeWithoutRole: activeRows.length,
            roleWithoutActiveSession: 0
        };
    }

    await guild.members.fetch().catch(() => null);

    let activeWithoutRole = 0;

    for (const row of activeRows) {
        const member = await fetchMemberSafely(guild, row.userId);

        if (!member || !member.roles.cache.has(role.id)) {
            activeWithoutRole += 1;
        }
    }

    const roleWithoutActiveSession = role.members.filter(member => {
        if (member.user.bot) {
            return false;
        }

        const userData = getUserData(guild.id, member.id);

        return !userData?.startTime;
    }).size;

    return {
        activeWithoutRole,
        roleWithoutActiveSession
    };
}

async function syncServiceState(guild) {
    const role = getServiceRole(guild);

    if (!role) {
        return {
            ok: false,
            reason: 'missing_role',
            closedSessions: 0,
            removedRoles: 0,
            failedRoleRemovals: 0
        };
    }

    await guild.members.fetch().catch(() => null);

    const now = Date.now();
    const activeRows = getActiveServiceRows(guild.id);
    let closedSessions = 0;
    let removedRoles = 0;
    let failedRoleRemovals = 0;

    for (const row of activeRows) {
        const member = await fetchMemberSafely(guild, row.userId);

        if (member && member.roles.cache.has(role.id)) {
            continue;
        }

        const duration = Math.max(0, now - row.startTime);
        const totalTime = row.totalTime + duration;

        if (duration > 0) {
            addSession(guild.id, row.userId, duration);
        }

        updateUserTime(guild.id, row.userId, totalTime, null);
        closedSessions += 1;
    }

    for (const member of role.members.values()) {
        if (member.user.bot) {
            continue;
        }

        const userData = getUserData(guild.id, member.id);

        if (userData?.startTime) {
            continue;
        }

        try {
            await member.roles.remove(role);
            removedRoles += 1;
        } catch (error) {
            failedRoleRemovals += 1;
        }
    }

    return {
        ok: true,
        closedSessions,
        removedRoles,
        failedRoleRemovals
    };
}

function getServiceSummary(guildId) {
    const classement = getTopService(guildId);
    const weeklyClassement = getTopWeek(guildId);
    const activeServices = getActiveServices(guildId);

    return {
        registeredUsers: getRegisteredUserCount(guildId),
        activeServices,
        totalServiceTime: classement.reduce((acc, user) => acc + user.totalTime, 0),
        weeklyServiceTime: weeklyClassement.reduce((acc, user) => acc + user.totalTime, 0),
        bestUser: classement[0] || null,
        bestWeekUser: weeklyClassement[0] || null
    };
}

function getTopWeek(guildId) {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const sevenDaysAgoIso = new Date(sevenDaysAgo).toISOString();

    const sessionRows = db.prepare(`
        SELECT user_id, SUM(duration) AS weekly_time
        FROM service_sessions
        WHERE guild_id = ? AND date >= ?
        GROUP BY user_id
    `).all(guildId, sevenDaysAgoIso);

    const totalsByUser = new Map();

    for (const row of sessionRows) {
        totalsByUser.set(row.user_id, row.weekly_time || 0);
    }

    const activeRows = db.prepare(`
        SELECT user_id, start_time
        FROM service_times
        WHERE guild_id = ? AND start_time IS NOT NULL
    `).all(guildId);

    for (const row of activeRows) {
        const countedStartTime = Math.max(row.start_time, sevenDaysAgo);
        const currentTotal = totalsByUser.get(row.user_id) || 0;
        totalsByUser.set(row.user_id, currentTotal + now - countedStartTime);
    }

    return Array.from(totalsByUser.entries())
        .map(([userId, totalTime]) => ({
            userId,
            totalTime
        }))
        .filter(user => user.totalTime > 0)
        .sort((a, b) => b.totalTime - a.totalTime);
}

function getUserSessions(guildId, userId, limit = 10) {
    return db.prepare(`
        SELECT date, duration
        FROM service_sessions
        WHERE guild_id = ? AND user_id = ?
        ORDER BY date DESC
        LIMIT ?
    `).all(guildId, userId, limit);
}

function getUserSessionCount(guildId, userId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM service_sessions
        WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    return row?.count || 0;
}

function addModerationCase(guildId, targetUserId, moderatorUserId, action, reason, duration = null) {
    const result = db.prepare(`
        INSERT INTO moderation_cases (
            guild_id,
            target_user_id,
            moderator_user_id,
            action,
            reason,
            duration,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId,
        targetUserId || null,
        moderatorUserId,
        action,
        reason || null,
        duration,
        new Date().toISOString()
    );

    return {
        id: result.lastInsertRowid,
        guildId,
        targetUserId: targetUserId || null,
        moderatorUserId,
        action,
        reason: reason || null,
        duration,
        createdAt: new Date().toISOString()
    };
}

function getModerationCases(guildId, userId, limit = 10) {
    return db.prepare(`
        SELECT id, target_user_id, moderator_user_id, action, reason, duration, created_at
        FROM moderation_cases
        WHERE guild_id = ? AND target_user_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(guildId, userId, limit);
}

function getModerationLabel(action, language = 'fr') {
    const labels = MODERATION_ACTION_LABELS[language] || MODERATION_ACTION_LABELS.fr;

    return labels[action] || action;
}

function parseDurationToMs(value) {
    const match = /^(\d+)\s*(s|sec|secs|second|seconds|seconde|secondes|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|heure|heures|j|d|day|days|jour|jours)$/i
        .exec(String(value || '').trim());

    if (!match) {
        return null;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1000,
        sec: 1000,
        secs: 1000,
        second: 1000,
        seconds: 1000,
        seconde: 1000,
        secondes: 1000,
        m: 60 * 1000,
        min: 60 * 1000,
        mins: 60 * 1000,
        minute: 60 * 1000,
        minutes: 60 * 1000,
        h: 60 * 60 * 1000,
        hr: 60 * 60 * 1000,
        hrs: 60 * 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        heure: 60 * 60 * 1000,
        heures: 60 * 60 * 1000,
        j: 24 * 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        jour: 24 * 60 * 60 * 1000,
        jours: 24 * 60 * 60 * 1000
    };

    return amount * multipliers[unit];
}

function hasModerationAccess(member, permissionFlag) {
    if (!member) {
        return false;
    }

    return hasCommandRoleAccess(member) || member.permissions.has(permissionFlag);
}

function botHasPermission(guild, permissionFlag) {
    return Boolean(guild.members.me?.permissions.has(permissionFlag));
}

function getModerationTargetError(moderatorMember, targetMember, language = 'fr') {
    if (!targetMember) {
        return t(language, 'moderationMemberRequired');
    }

    if (targetMember.id === moderatorMember.id) {
        return t(language, 'moderationSelfDenied');
    }

    if (targetMember.id === targetMember.guild.ownerId) {
        return t(language, 'moderationOwnerDenied');
    }

    if (targetMember.id === client.user.id) {
        return t(language, 'moderationBotDenied');
    }

    const botMember = targetMember.guild.members.me;

    if (botMember && targetMember.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
        return t(language, 'moderationHierarchyDenied');
    }

    if (
        moderatorMember.id !== moderatorMember.guild.ownerId
        && targetMember.roles.highest.comparePositionTo(moderatorMember.roles.highest) >= 0
    ) {
        return t(language, 'moderationHierarchyDenied');
    }

    return null;
}

function getUserTargetError(guild, moderatorMember, targetUser, targetMember, language = 'fr') {
    if (!targetUser) {
        return t(language, 'moderationUserRequired');
    }

    if (targetUser.id === moderatorMember.id) {
        return t(language, 'moderationSelfDenied');
    }

    if (targetUser.id === guild.ownerId) {
        return t(language, 'moderationOwnerDenied');
    }

    if (targetUser.id === client.user.id) {
        return t(language, 'moderationBotDenied');
    }

    if (targetMember) {
        return getModerationTargetError(moderatorMember, targetMember, language);
    }

    return null;
}

function getReason(value, language = 'fr') {
    const reason = String(value || '').trim();

    return reason || t(language, 'moderationReasonDefault');
}

function buildModerationCasesEmbed(member, requester, cases, language = 'fr') {
    const lines = cases.map(caseRow => {
        const duration = caseRow.duration
            ? ` - ${formatDuration(caseRow.duration)}`
            : '';
        const reason = caseRow.reason || t(language, 'moderationReasonDefault');

        return [
            `**#${caseRow.id}** ${getModerationLabel(caseRow.action, language)}${duration}`,
            `<t:${Math.floor(new Date(caseRow.created_at).getTime() / 1000)}:f>`,
            `${language === 'en' ? 'Moderator' : 'Modérateur'} : <@${caseRow.moderator_user_id}>`,
            `${language === 'en' ? 'Reason' : 'Raison'} : ${reason}`
        ].join('\n');
    });

    return createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: t(language, 'moderationCasesTitle'),
        description: `${language === 'en' ? 'Member' : 'Membre'} : ${member}\n\n${lines.join('\n\n')}`,
        requester,
        thumbnail: member.user.displayAvatarURL(),
        language
    });
}

function buildModerationLogEmbed(guild, requester, caseData, targetLabel, language = 'fr') {
    const fields = [
        {
            name: language === 'en' ? 'Action' : 'Action',
            value: getModerationLabel(caseData.action, language),
            inline: true
        },
        {
            name: language === 'en' ? 'Moderator' : 'Modérateur',
            value: `<@${caseData.moderatorUserId}>`,
            inline: true
        },
        {
            name: language === 'en' ? 'Target' : 'Cible',
            value: targetLabel,
            inline: false
        },
        {
            name: language === 'en' ? 'Reason' : 'Raison',
            value: caseData.reason || t(language, 'moderationReasonDefault'),
            inline: false
        }
    ];

    if (caseData.duration) {
        fields.push({
            name: language === 'en' ? 'Duration' : 'Durée',
            value: formatDuration(caseData.duration),
            inline: true
        });
    }

    fields.push({
        name: language === 'en' ? 'Case' : 'Cas',
        value: `#${caseData.id}`,
        inline: true
    });

    return createSentinelEmbed({
        color: SENTINEL_COLORS.danger,
        title: t(language, 'moderationLogTitle'),
        description: `Serveur : **${guild.name}**`,
        requester,
        language
    }).addFields(fields);
}

async function sendModerationLog(guild, requester, caseData, targetLabel, language = 'fr') {
    const logChannel = getLogChannel(guild);

    if (!logChannel) {
        return;
    }

    await logChannel.send({
        embeds: [buildModerationLogEmbed(guild, requester, caseData, targetLabel, language)]
    }).catch(() => {});
}

function formatSessionDate(date) {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return date;
    }

    return `<t:${Math.floor(parsedDate.getTime() / 1000)}:f>`;
}

function buildServiceHistoryEmbed(member, requester, userData, sessions, options = {}) {
    let totalTime = userData?.totalTime || 0;

    if (userData?.startTime) {
        totalTime += Date.now() - userData.startTime;
    }

    const status = getServiceStatusText(userData?.startTime);
    const sessionLines = sessions.map((session, index) => (
        `**${getRankLabel(index)}.** ${formatSessionDate(session.date)} - **${formatDuration(session.duration || 0)}**`
    ));
    const fields = [
        {
            name: 'Statut actuel',
            value: `**${status}**`,
            inline: true
        },
        {
            name: 'Temps total',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    ];

    if (!options.isAdvancedServer) {
        const totalSessionCount = options.totalSessionCount || 0;
        const visibleUsage = Math.min(totalSessionCount, FREE_HISTORY_LIMIT);
        const remainingSlots = Math.max(FREE_HISTORY_LIMIT - totalSessionCount, 0);
        const hiddenSessions = Math.max(totalSessionCount - FREE_HISTORY_LIMIT, 0);
        const limitLines = [
            `Utilisation gratuite : **${visibleUsage}/${FREE_HISTORY_LIMIT}** sessions visibles.`,
            remainingSlots > 0
                ? `Il te reste **${remainingSlots}** emplacement(s) visible(s) avant la limite gratuite.`
                : 'Tu as atteint la limite visible gratuite.'
        ];

        if (hiddenSessions > 0) {
            limitLines.push(`Sessions plus anciennes masquées : **${hiddenSessions}**.`);
        }

        fields.push({
            name: 'Limite gratuite',
            value: limitLines.join('\n'),
            inline: false
        });
    }

    return createSentinelEmbed({
        color: userData?.startTime ? SENTINEL_COLORS.success : SENTINEL_COLORS.accent,
        title: 'Sentinel | Historique',
        description: `Agent : ${member}\n${sessionLines.length > 0 ? sessionLines.join('\n') : 'Aucune session enregistrée.'}`,
        requester,
        thumbnail: member.user.displayAvatarURL()
    })
        .addFields(fields);
}

function getLogChannel(guild) {
    const guildConfig = getGuildConfig(guild.id);

    if (!guildConfig.logChannelId) {
        return null;
    }

    return guild.channels.cache.get(guildConfig.logChannelId);
}

function getServiceRole(guild) {
    const guildConfig = getGuildConfig(guild.id);

    if (!guildConfig.serviceRoleId) {
        return null;
    }

    return guild.roles.cache.get(guildConfig.serviceRoleId);
}

function buildMyHoursEmbed(user, userData) {
    if (!userData) {
        return createSentinelEmbed({
            color: SENTINEL_COLORS.neutral,
            title: 'Sentinel | Mes heures',
            description: 'Aucune heure enregistrée pour le moment.\nPrends ton service avec le bouton Sentinel pour commencer le suivi.',
            requester: user,
            thumbnail: user.displayAvatarURL()
        });
    }

    let totalTime = userData.totalTime;

    if (userData.startTime) {
        totalTime += Date.now() - userData.startTime;
    }

    const fields = [
        {
            name: 'Statut',
            value: `**${getServiceStatusText(userData.startTime)}**`,
            inline: true
        },
        {
            name: 'Temps total',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    ];

    if (userData.startTime) {
        fields.push({
            name: 'Session en cours',
            value: `Démarrée <t:${Math.floor(userData.startTime / 1000)}:R>\nDurée actuelle : **${formatDuration(Date.now() - userData.startTime)}**`,
            inline: false
        });
    }

    return createSentinelEmbed({
        color: userData.startTime ? SENTINEL_COLORS.success : SENTINEL_COLORS.danger,
        title: 'Sentinel | Mes heures',
        description: `Agent : ${user}`,
        requester: user,
        thumbnail: user.displayAvatarURL()
    }).addFields(fields);
}

function buildMemberHoursEmbed(member, requester, userData) {
    if (!userData) {
        return null;
    }

    let totalTime = userData.totalTime;

    if (userData.startTime) {
        totalTime += Date.now() - userData.startTime;
    }

    return createSentinelEmbed({
        color: userData.startTime ? SENTINEL_COLORS.success : SENTINEL_COLORS.primary,
        title: 'Sentinel | Heures membre',
        description: `Agent : ${member}`,
        requester,
        thumbnail: member.user.displayAvatarURL()
    }).addFields(
        {
            name: 'Statut',
            value: `**${getServiceStatusText(userData.startTime)}**`,
            inline: true
        },
        {
            name: 'Temps total',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    );
}

function buildTopServiceEmbed(requester, classement) {
    if (classement.length === 0) {
        return null;
    }

    const top10 = classement.slice(0, 10);
    const totalServerTime = classement.reduce((acc, user) => acc + user.totalTime, 0);
    const bestUser = classement[0];

    const lines = top10.map((user, index) => (
        `**${getRankLabel(index)}.** <@${user.userId}> - **${formatDuration(user.totalTime)}**`
    ));

    return createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: 'Sentinel | Classement global',
        description: `${lines.join('\n')}\n\nTop 10 affiché en version gratuite.`,
        requester
    })
        .addFields(
            {
                name: 'Agents classés',
                value: `**${classement.length}**`,
                inline: true
            },
            {
                name: 'Temps cumulé',
                value: `**${formatDuration(totalServerTime)}**`,
                inline: true
            },
            {
                name: 'Leader',
                value: `<@${bestUser.userId}>`,
                inline: false
            }
        );
}

function buildConfigEmbed(guild, requester) {
    const guildConfig = getGuildConfig(guild.id);
    const registeredUserCount = getRegisteredUserCount(guild.id);
    const roleValue = guildConfig.serviceRoleId ? `<@&${guildConfig.serviceRoleId}>` : 'Non configuré';
    const logChannelValue = guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'Non configuré';
    const commandRolesValue = formatCommandRoleList(guild.id);

    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: 'Sentinel | Configuration',
        description: `Serveur : **${guild.name}**`,
        requester
    })
        .addFields(
            {
                name: 'Rôle de service',
                value: roleValue,
                inline: true
            },
            {
                name: 'Salon de logs',
                value: logChannelValue,
                inline: true
            },
            {
                name: 'Agents suivis',
                value: `**${registeredUserCount}**`,
                inline: false
            },
            {
                name: 'Rôles autorisés',
                value: commandRolesValue,
                inline: false
            }
        );
}

function buildCommandRolesEmbed(guild, requester) {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: 'Sentinel | Accès de gestion',
        description: 'Ces rôles peuvent configurer Sentinel et gérer les données de service.',
        requester
    })
        .addFields(
            {
                name: 'Rôles configurés',
                value: formatCommandRoleList(guild.id),
                inline: false
            },
            {
                name: 'Accès de secours',
                value: 'Sans role configure, les membres avec Administrateur, Gerer le serveur ou Gerer les roles peuvent demarrer la configuration. Ensuite, les roles configures deviennent la regle d acces. Le proprietaire garde un acces de secours.',
                inline: false
            }
        );
}

function buildActiveServicesEmbed(requester, activeServices) {
    if (activeServices.length === 0) {
        return null;
    }

    const displayedServices = activeServices.slice(0, 15);
    const hiddenCount = activeServices.length - displayedServices.length;
    const totalActiveTime = activeServices.reduce((acc, service) => acc + service.duration, 0);
    const lines = displayedServices.map((service, index) => (
        `**${getRankLabel(index)}.** <@${service.userId}> - **${formatDuration(service.duration)}** - <t:${Math.floor(service.startTime / 1000)}:R>`
    ));

    if (hiddenCount > 0) {
        lines.push(`... et **${hiddenCount}** autre(s) agent(s) en service.`);
    }

    return createSentinelEmbed({
        color: SENTINEL_COLORS.success,
        title: 'Sentinel | Services actifs',
        description: lines.join('\n'),
        requester
    })
        .addFields(
            {
                name: 'Agents en service',
                value: `**${activeServices.length}**`,
                inline: true
            },
            {
                name: 'Temps actif cumulé',
                value: `**${formatDuration(totalActiveTime)}**`,
                inline: true
            }
        );
}

function buildServiceSummaryEmbed(guild, requester) {
    const summary = getServiceSummary(guild.id);
    const guildConfig = getGuildConfig(guild.id);
    const roleValue = guildConfig.serviceRoleId ? `<@&${guildConfig.serviceRoleId}>` : 'Non configuré';
    const logChannelValue = guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'Non configuré';
    const bestUserValue = summary.bestUser
        ? `<@${summary.bestUser.userId}> - **${formatDuration(summary.bestUser.totalTime)}**`
        : 'Aucun agent';
    const bestWeekUserValue = summary.bestWeekUser
        ? `<@${summary.bestWeekUser.userId}> - **${formatDuration(summary.bestWeekUser.totalTime)}**`
        : 'Aucun agent';

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: 'Sentinel | Résumé du service',
        description: `Vue d’ensemble de **${guild.name}**.`,
        requester
    })
        .addFields(
            {
                name: 'En service',
                value: `**${summary.activeServices.length}**`,
                inline: true
            },
            {
                name: 'Agents suivis',
                value: `**${summary.registeredUsers}**`,
                inline: true
            },
            {
                name: 'Total serveur',
                value: `**${formatDuration(summary.totalServiceTime)}**`,
                inline: true
            },
            {
                name: 'Cette semaine',
                value: `**${formatDuration(summary.weeklyServiceTime)}**`,
                inline: true
            },
            {
                name: 'Leader global',
                value: bestUserValue,
                inline: false
            },
            {
                name: 'Leader semaine',
                value: bestWeekUserValue,
                inline: false
            },
            {
                name: 'Configuration',
                value: `Rôle : ${roleValue}\nLogs : ${logChannelValue}`,
                inline: false
            }
        );
}

function diagnosticLine(ok, label, detail = '') {
    return `${ok ? 'OK' : 'À vérifier'} - ${label}${detail ? ` : ${detail}` : ''}`;
}

async function buildDiagnosticEmbed(guild, requester) {
    const guildConfig = getGuildConfig(guild.id);
    const role = getServiceRole(guild);
    const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
    const logChannel = guildConfig.logChannelId
        ? await guild.channels.fetch(guildConfig.logChannelId).catch(() => null)
        : null;
    const logPermissions = logChannel && botMember
        ? logChannel.permissionsFor(botMember)
        : null;
    const serviceConsistency = await getServiceConsistencyStats(guild);

    let databaseOk = true;

    try {
        checkDatabase();
    } catch (error) {
        databaseOk = false;
    }

    const botCanManageRoles = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles));
    const rolePositionOk = Boolean(
        !role
        || (botMember && botMember.roles.highest.comparePositionTo(role) > 0)
    );
    const logChannelOk = Boolean(logChannel?.isTextBased());
    const logCanSend = Boolean(
        logChannelOk
        && logPermissions?.has(PermissionsBitField.Flags.ViewChannel)
        && logPermissions?.has(PermissionsBitField.Flags.SendMessages)
    );
    const hasLogIssue = Boolean(guildConfig.logChannelId) && (!logChannelOk || !logCanSend);
    const hasConsistencyIssue = serviceConsistency.activeWithoutRole > 0
        || serviceConsistency.roleWithoutActiveSession > 0;
    const diagnosticOk = databaseOk
        && role
        && botCanManageRoles
        && rolePositionOk
        && !hasLogIssue
        && !hasConsistencyIssue;

    return createSentinelEmbed({
        color: diagnosticOk ? SENTINEL_COLORS.success : SENTINEL_COLORS.warning,
        title: 'Sentinel | Diagnostic',
        description: `Contrôle technique de **${guild.name}**.`,
        requester
    })
        .addFields(
            {
                name: 'Base de données',
                value: [
                    diagnosticLine(databaseOk, 'SQLite répond'),
                    `Agents suivis : **${getRegisteredUserCount(guild.id)}**`,
                    `Services actifs : **${getActiveServices(guild.id).length}**`
                ].join('\n'),
                inline: false
            },
            {
                name: 'Role de service',
                value: [
                    diagnosticLine(Boolean(role), 'Rôle configuré', role ? `${role}` : 'à configurer avec `/config-role`'),
                    diagnosticLine(botCanManageRoles, 'Permission Manage Roles du bot'),
                    diagnosticLine(rolePositionOk, 'Position du rôle du bot', rolePositionOk ? 'OK' : 'le rôle du bot doit être au-dessus du rôle de service')
                ].join('\n'),
                inline: false
            },
            {
                name: 'Salon de logs',
                value: [
                    diagnosticLine(Boolean(guildConfig.logChannelId), 'Salon configuré', guildConfig.logChannelId ? `<#${guildConfig.logChannelId}>` : 'optionnel'),
                    diagnosticLine(logChannelOk || !guildConfig.logChannelId, 'Salon textuel accessible'),
                    diagnosticLine(logCanSend || !guildConfig.logChannelId, 'Le bot peut envoyer les logs')
                ].join('\n'),
                inline: false
            },
            {
                name: 'Rôles autorisés',
                value: formatCommandRoleList(guild.id),
                inline: false
            },
            {
                name: 'Cohérence service',
                value: [
                    diagnosticLine(serviceConsistency.activeWithoutRole === 0, 'Sessions actives sans rôle', `**${serviceConsistency.activeWithoutRole}**`),
                    diagnosticLine(serviceConsistency.roleWithoutActiveSession === 0, 'Rôles sans session active', `**${serviceConsistency.roleWithoutActiveSession}**`),
                    serviceConsistency.activeWithoutRole > 0 || serviceConsistency.roleWithoutActiveSession > 0
                        ? 'Utilise `/sync-service` pour réparer.'
                        : 'Aucune incohérence détectée.'
                ].join('\n'),
                inline: false
            }
        );
}

function buildSyncServiceEmbed(requester, result) {
    if (!result.ok && result.reason === 'missing_role') {
        return createSentinelEmbed({
            color: SENTINEL_COLORS.danger,
            title: 'Sentinel | Synchronisation',
            description: 'Impossible de synchroniser : aucun rôle de service n’est configuré. Utilise `/config-role` avant de relancer.',
            requester
        });
    }

    return createSentinelEmbed({
        color: result.failedRoleRemovals > 0 ? SENTINEL_COLORS.warning : SENTINEL_COLORS.success,
        title: 'Sentinel | Synchronisation',
        description: 'La base SQLite et le rôle de service ont été remis en cohérence.',
        requester
    })
        .addFields(
            {
                name: 'Sessions fermées',
                value: `**${result.closedSessions}**`,
                inline: true
            },
            {
                name: 'Rôles retirés',
                value: `**${result.removedRoles}**`,
                inline: true
            },
            {
                name: 'Retraits échoués',
                value: `**${result.failedRoleRemovals}**`,
                inline: true
            }
        );
}

function buildTopWeekEmbed(requester, classement) {
    if (classement.length === 0) {
        return null;
    }

    const top10 = classement.slice(0, 10);
    const totalWeekTime = classement.reduce((acc, user) => acc + user.totalTime, 0);
    const bestUser = classement[0];

    const lines = top10.map((user, index) => (
        `**${getRankLabel(index)}.** <@${user.userId}> - **${formatDuration(user.totalTime)}**`
    ));

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: 'Sentinel | Classement hebdomadaire',
        description: `${lines.join('\n')}\n\nClassement avancé réservé au serveur configuré.`,
        requester
    })
        .addFields(
            {
                name: 'Agents classés',
                value: `**${classement.length}**`,
                inline: true
            },
            {
                name: 'Temps cumulé',
                value: `**${formatDuration(totalWeekTime)}**`,
                inline: true
            },
            {
                name: 'Leader semaine',
                value: `<@${bestUser.userId}>`,
                inline: false
            }
        );
}

function buildLanguageButtons(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sentinel_language:fr')
                .setLabel(t(language, 'languageFrench'))
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('sentinel_language:en')
                .setLabel(t(language, 'languageEnglish'))
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function buildLanguageChoiceEmbed(requester, language = 'fr') {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: t(language, 'languageChooseTitle'),
        description: t(language, 'languageChooseDescription'),
        requester,
        language
    });
}

function buildHelpEmbed(guild, requester) {
    const language = getGuildLanguage(guild.id);
    if (language === 'en') {
        const fields = [
            {
                name: 'Installation first',
                value: [
                    '**1. Check Sentinel is a real bot**',
                    'In `Server Settings > Integrations`, Sentinel must have the `Bot` badge.',
                    '',
                    '**2. Create a service role**',
                    'Examples: `On duty`, `Patrol`, `Active agent`.',
                    '',
                    '**3. Role order**',
                    'The Sentinel role must be above the service role.'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Language',
                value: [
                    '`/language language:English` sets this server to English.',
                    '`/config-langue langue:Francais` switches it back to French.',
                    'This setting is stored per server only.'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Server setup',
                value: [
                    '`/config-role role:@role` sets the service role.',
                    '`/config-channel channel_id:ID` sets the log channel.',
                    '`/config-view` shows the current configuration.'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Members',
                value: [
                    '`/my-hours`, `/history`, `/on-duty`, `/top-service` show free tracking.',
                    'Text aliases: `!my-hours`, `!history`, `!on-duty`, `!top-service`.'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Moderation',
                value: [
                    '`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`, `/mod-cases`.',
                    'Text aliases: `!warn`, `!timeout`, `!untimeout`, `!kick`, `!ban`, `!clear`, `!mod-cases`.',
                    'Sentinel checks role hierarchy before applying a sanction.'
                ].join('\n'),
                inline: false
            }
        ];

        if (isAdvancedGuild(guild.id)) {
            fields.push({
                name: 'Advanced commands',
                value: [
                    '`/hours member` or `!hours @member`',
                    '`/top-week` or `!top-week`',
                    '`/summary` or `!summary`',
                    '`/diagnostic`, `/sync-service`, `/reset-hours`, `/reset-hours-all`, `/ping`'
                ].join('\n'),
                inline: false
            });
        }

        return createSentinelEmbed({
            color: SENTINEL_COLORS.primary,
            title: t(language, 'helpTitle'),
            description: t(language, 'helpDescription'),
            requester,
            thumbnail: guild.iconURL(),
            language
        })
            .addFields(fields);
    }

    const firstSetup = [
        '**1. Verifie que Sentinel est bien un bot**',
        'Dans `Parametres du serveur > Integrations`, Sentinel doit avoir le badge `Bot`. Si tu vois seulement `Commandes`, reinvite-le avec le lien officiel.',
        '',
        '**2. Cree un role de service**',
        'Exemples : `En service`, `Patrouille`, `Agent actif`.',
        '',
        '**3. Place les roles dans le bon ordre**',
        'Le role Sentinel doit etre au-dessus du role de service, sinon Discord refuse de donner ou retirer ce role.'
    ];
    const managementAccess = [
        '**Premier reglage**',
        'Si aucun role de gestion n existe encore, peuvent configurer : proprietaire, `Administrateur`, `Gerer le serveur` ou `Gerer les roles`.',
        '',
        '**Apres le premier reglage**',
        'Ajoute ton equipe avec `/config-permissions action:ajouter role:@role`. Ensuite, seuls ces roles gerent Sentinel. Le proprietaire garde un acces de secours.'
    ];
    const configurationSteps = [
        '**1. Role de service**',
        '`/config-role role:@role` choisit le role donne quand un membre prend son service.',
        '',
        '**2. Salon de logs**',
        'Active le mode developpeur Discord, clic droit sur le salon, copie son ID, puis lance `/config-logs salon_id:ID`.',
        '',
        '**3. Verification**',
        '`/config-voir` affiche le role, le salon de logs et les roles autorises.'
    ];
    const panelSteps = [
        '**Publier le panneau**',
        'Dans le salon ou les membres doivent pointer, envoie `!service-panel`.',
        '',
        '**Utiliser le panneau**',
        '`Prendre / Quitter` commence ou termine le service. Sentinel calcule la duree, met a jour le total et envoie les logs.'
    ];
    const memberUsage = [
        '**Prendre son service**',
        'Clique sur `Prendre / Quitter`. Sentinel ajoute le role de service.',
        '',
        '**Finir son service**',
        'Clique sur le meme bouton. Sentinel retire le role et sauvegarde le temps.',
        '',
        '**Consulter ses infos**',
        '`/mes-heures`, `/historique-service`, `/en-service` et `/top-service` affichent le suivi gratuit.'
    ];
    const commandSummary = [
        '`/aide` - ce guide',
        '`/mes-heures` - tes heures',
        '`/historique-service` - tes 5 dernieres sessions',
        '`/en-service` - agents actuellement en service',
        '`/top-service` - top 10 du serveur',
        '`/config-role`, `/config-logs`, `/config-permissions`, `/config-voir` - configuration'
    ];
    const moderationUsage = [
        '`/avertir membre raison` - enregistrer un avertissement',
        '`/timeout membre duree raison` - rendre muet temporairement, exemple `10m`, `2h`, `7d`',
        '`/fin-timeout membre raison` - retirer un timeout',
        '`/expulser membre raison` - expulser un membre',
        '`/bannir utilisateur raison` - bannir un utilisateur',
        '`/purge nombre` - supprimer jusqu a 100 messages recents',
        '`/sanctions membre` - voir les 10 dernieres sanctions',
        'Sentinel verifie les permissions et la hierarchie des roles avant chaque sanction.'
    ];
    const freeLimits = [
        'Historique visible : 5 dernieres sessions personnelles.',
        'Classement public : top 10 global.',
        'Les donnees restent stockees en SQLite pour le fonctionnement du bot.',
        'Les options avancees ne sont pas ouvertes publiquement pour le moment.'
    ];
    const troubleshooting = [
        'Sentinel ne donne pas le role ? Remonte son role au-dessus du role de service.',
        'Les logs ne partent pas ? Verifie que Sentinel peut voir et ecrire dans le salon.',
        'Commande refusee ? Verifie les roles dans `/config-permissions action:voir`.',
        'Sentinel n apparait pas dans les membres ? L installation est seulement en `Commandes`, il faut le reinviter comme bot.'
    ];
    const fields = [
        {
            name: 'Installation avant tout',
            value: firstSetup.join('\n'),
            inline: false
        },
        {
            name: 'Qui peut configurer ?',
            value: managementAccess.join('\n'),
            inline: false
        },
        {
            name: 'Configuration serveur',
            value: configurationSteps.join('\n'),
            inline: false
        },
        {
            name: 'Panneau de service',
            value: panelSteps.join('\n'),
            inline: false
        },
        {
            name: 'Utilisation membre',
            value: memberUsage.join('\n'),
            inline: false
        },
        {
            name: 'Commandes gratuites',
            value: commandSummary.join('\n'),
            inline: false
        },
        {
            name: 'Moderation',
            value: moderationUsage.join('\n'),
            inline: false
        },
        {
            name: 'Limites gratuites',
            value: freeLimits.join('\n'),
            inline: false
        }
    ];

    if (isAdvancedGuild(guild.id)) {
        fields.push({
            name: 'Commandes avancées',
            value: [
                '`/heures membre` ou `!heures @membre`',
                '`/top-semaine` ou `!top-semaine`',
                '`/resume-service` ou `!resume-service`',
                '`/historique-service [membre] [limite]` ou `!historique-service [@membre] [limite]`',
                '`/diagnostic` ou `!diagnostic`',
                '`/sync-service` ou `!sync-service`',
                '`/reset-heures membre` ou `!reset-heures @membre`',
                '`/reset-heures-all` ou `!reset-heures-all`',
                '`/ping` ou `!ping`',
                'Historique complet jusqu’à 25 sessions'
            ].join('\n'),
            inline: false
        });
    }

    fields.push(
        {
            name: 'Depannage rapide',
            value: troubleshooting.join('\n'),
            inline: false
        }
    );

    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: t(language, 'helpTitle'),
        description: t(language, 'helpDescription'),
        requester,
        thumbnail: guild.iconURL(),
        language
    })
        .addFields(fields);
}

function buildServicePanelComponents(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('toggle_service')
                .setLabel(t(language, 'toggleLabel'))
                .setStyle(ButtonStyle.Success)
                .setEmoji('🟢'),
            new ButtonBuilder()
                .setCustomId('show_my_hours')
                .setLabel(t(language, 'showMyHoursLabel'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('show_active_services')
                .setLabel(t(language, 'activeLabel'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👥')
        )
    ];
}

function buildResetGuildConfirmationComponents(requesterId, language = 'fr') {
    const createdAt = Date.now();

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_reset_guild:${requesterId}:${createdAt}`)
                .setLabel(t(language, 'confirm'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_reset_guild:${requesterId}:${createdAt}`)
                .setLabel(t(language, 'cancel'))
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function parseResetGuildConfirmation(customId) {
    const match = /^(confirm|cancel)_reset_guild:(\d{17,20}):(\d+)$/.exec(customId);

    if (!match) {
        return null;
    }

    return {
        action: match[1],
        requesterId: match[2],
        createdAt: Number(match[3])
    };
}

const SENTINEL_SELF_ROLES = {
    announcements: '📡 Sentinel | Annonces',
    changelog: '🧬 Sentinel | Journal dev',
    beta: '⚡ Sentinel | Acces anticipe',
    partner: '💎 Sentinel | Partenaire'
};

const SENTINEL_LANGUAGE_ROLES = {
    fr: '🌐 Sentinel | Français',
    en: '🌐 Sentinel | English'
};

const SENTINEL_STAFF_ROLES = [
    '✦ Sentinel | Fondateur',
    '◆ Sentinel | Administrateur',
    '◇ Sentinel | Moderateur',
    '✚ Sentinel | Support'
];

function findRoleByName(guild, roleName) {
    return guild.roles.cache.find(role => role.name === roleName) || null;
}

function findCategoryByName(guild, names) {
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory && names.includes(channel.name)
    ) || null;
}

function sanitizeTicketName(value) {
    return String(value || 'membre')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'membre';
}

function buildTicketOverwrites(guild, member) {
    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ]
        }
    ];

    for (const roleName of SENTINEL_STAFF_ROLES) {
        const role = findRoleByName(guild, roleName);

        if (role) {
            overwrites.push({
                id: role.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks
                ]
            });
        }
    }

    return overwrites;
}

async function handleSentinelSelfRoleButton(interaction) {
    const key = interaction.customId.split(':')[1];
    const roleName = SENTINEL_SELF_ROLES[key];

    if (!roleName) {
        return interaction.reply({
            content: 'Role Sentinel inconnu.',
            flags: MessageFlags.Ephemeral
        });
    }

    const role = findRoleByName(interaction.guild, roleName);

    if (!role) {
        return interaction.reply({
            content: `Le role \`${roleName}\` est introuvable sur ce serveur.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.member.roles.cache.has(role.id)) {
        await interaction.member.roles.remove(role);

        return interaction.reply({
            content: `Role retire : ${role}`,
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.member.roles.add(role);

    return interaction.reply({
        content: `Role ajoute : ${role}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleSentinelLanguageButton(interaction) {
    const language = interaction.customId.split(':')[1];
    const roleName = SENTINEL_LANGUAGE_ROLES[language];
    const guild = interaction.guild || await interaction.client.guilds.fetch(interaction.guildId);

    if (!roleName) {
        return interaction.reply({
            content: 'Langue Sentinel inconnue.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await guild.roles.fetch();

    const member = await guild.members.fetch(interaction.user.id);
    const selectedRole = findRoleByName(guild, roleName);
    const otherRole = findRoleByName(
        guild,
        language === 'fr' ? SENTINEL_LANGUAGE_ROLES.en : SENTINEL_LANGUAGE_ROLES.fr
    );

    if (!selectedRole) {
        return interaction.editReply(`Le role \`${roleName}\` est introuvable sur ce serveur.`);
    }

    try {
        if (otherRole && member.roles.cache.has(otherRole.id)) {
            await member.roles.remove(otherRole);
        }

        if (!member.roles.cache.has(selectedRole.id)) {
            await member.roles.add(selectedRole);
        }

        console.log(`Langue Sentinel appliquee : ${language} pour ${interaction.user.tag} (${interaction.user.id})`);
    } catch (error) {
        console.error('Erreur bouton langue Sentinel :', error);

        return interaction.editReply('Je n arrive pas a modifier ton role de langue. Verifie que mon role Discord est bien au-dessus des roles de langue.');
    }

    return interaction.editReply(
        language === 'fr'
            ? `Langue configuree : ${selectedRole}. Tu vois maintenant le serveur en francais.`
            : `Language set: ${selectedRole}. You now see the server in English.`
    );
}

async function handleSentinelTicketButton(interaction) {
    await interaction.guild.channels.fetch();

    const existingTicket = interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText
        && channel.topic === `sentinel-ticket:${interaction.user.id}`
    );

    if (existingTicket) {
        return interaction.reply({
            content: `Tu as deja un ticket ouvert : ${existingTicket}`,
            flags: MessageFlags.Ephemeral
        });
    }

    const supportCategory = findCategoryByName(interaction.guild, [
        '✦ SENTINEL // SUPPORT',
        'SENTINEL // SUPPORT'
    ]);
    const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${sanitizeTicketName(interaction.user.username)}`,
        type: ChannelType.GuildText,
        parent: supportCategory?.id || null,
        topic: `sentinel-ticket:${interaction.user.id}`,
        permissionOverwrites: buildTicketOverwrites(interaction.guild, interaction.member),
        reason: 'Creation ticket Sentinel'
    });

    const embed = new EmbedBuilder()
        .setColor(SENTINEL_COLORS.primary)
        .setTitle('Ticket Sentinel')
        .setDescription([
            `${interaction.user}, explique ta demande clairement.`,
            '',
            '- probleme ou question',
            '- commande/fonction concernee',
            '- capture ou message d erreur si disponible',
            '',
            'Le support te repondra des que possible.'
        ].join('\n'))
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('sentinel_ticket:close')
            .setLabel('Fermer le ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
    );

    await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({
        content: `Ticket cree : ${ticketChannel}`,
        flags: MessageFlags.Ephemeral
    });
}

async function handleSentinelTicketCloseButton(interaction) {
    if (!interaction.channel?.topic?.startsWith('sentinel-ticket:')) {
        return interaction.reply({
            content: 'Ce bouton ne peut etre utilise que dans un ticket Sentinel.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (
        !interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
        && interaction.channel.topic !== `sentinel-ticket:${interaction.user.id}`
    ) {
        return interaction.reply({
            content: 'Tu ne peux fermer que ton ticket, sauf si tu as la permission Gerer les salons.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.reply({
        content: 'Ticket ferme. Suppression dans quelques secondes...',
        flags: MessageFlags.Ephemeral
    });

    setTimeout(() => {
        interaction.channel?.delete('Fermeture ticket Sentinel').catch(() => {});
    }, 3000);
}

async function getMemberOption(interaction, optionName) {
    const member = interaction.options.getMember(optionName);

    if (member) {
        return member;
    }

    const user = interaction.options.getUser(optionName);

    return user ? await fetchMemberSafely(interaction.guild, user.id) : null;
}

async function handleModerationInteraction(interaction, commandName, language) {
    const guildId = interaction.guild.id;
    const moderator = interaction.member;
    const moderationCommands = new Set([
        'avertir',
        'timeout',
        'fin-timeout',
        'expulser',
        'bannir',
        'purge',
        'sanctions'
    ]);

    if (!moderationCommands.has(commandName)) {
        return false;
    }

    const permissionByCommand = {
        avertir: PermissionsBitField.Flags.ModerateMembers,
        timeout: PermissionsBitField.Flags.ModerateMembers,
        'fin-timeout': PermissionsBitField.Flags.ModerateMembers,
        expulser: PermissionsBitField.Flags.KickMembers,
        bannir: PermissionsBitField.Flags.BanMembers,
        purge: PermissionsBitField.Flags.ManageMessages,
        sanctions: PermissionsBitField.Flags.ModerateMembers
    };
    const requiredPermission = permissionByCommand[commandName];

    if (!hasModerationAccess(moderator, requiredPermission)) {
        await interaction.reply({
            content: t(language, 'moderationAccessDenied'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (['timeout', 'fin-timeout', 'expulser', 'bannir', 'purge'].includes(commandName)
        && !botHasPermission(interaction.guild, requiredPermission)) {
        await interaction.reply({
            content: t(language, 'moderationBotPermissionMissing'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'purge') {
        if (!interaction.channel?.isTextBased() || typeof interaction.channel.bulkDelete !== 'function') {
            await interaction.reply({
                content: t(language, 'moderationNoChannel'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const amount = clampNumber(interaction.options.getInteger('nombre'), 1, 100);
        const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);

        if (!deleted) {
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(
            guildId,
            null,
            interaction.user.id,
            'clear',
            `${amount} messages demandés dans #${interaction.channel.name}`,
            null
        );

        await sendModerationLog(interaction.guild, interaction.user, caseData, `${interaction.channel}`, language);

        await interaction.reply({
            content: t(language, 'moderationClear', { count: deleted.size }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'sanctions') {
        const member = await getMemberOption(interaction, 'membre');

        if (!member) {
            await interaction.reply({
                content: t(language, 'moderationMemberRequired'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const cases = getModerationCases(guildId, member.id, 10);

        if (cases.length === 0) {
            await interaction.reply({
                content: t(language, 'moderationCasesEmpty', { member }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.reply({
            embeds: [buildModerationCasesEmbed(member, interaction.user, cases, language)],
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'bannir') {
        const user = interaction.options.getUser('utilisateur');
        const member = user ? await fetchMemberSafely(interaction.guild, user.id) : null;
        const targetError = getUserTargetError(interaction.guild, moderator, user, member, language);

        if (targetError) {
            await interaction.reply({
                content: targetError,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(interaction.options.getString('raison'), language);
        const deleteDays = clampNumber(interaction.options.getInteger('jours_messages') || 0, 0, 7);

        try {
            await interaction.guild.members.ban(user.id, {
                reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
        } catch (error) {
            console.error('Erreur bannissement :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(guildId, user.id, interaction.user.id, 'ban', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `${user}`, language);

        await interaction.reply({
            content: t(language, 'moderationBan', { user, caseId: caseData.id }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const member = await getMemberOption(interaction, 'membre');
    const targetError = getModerationTargetError(moderator, member, language);

    if (targetError) {
        await interaction.reply({
            content: targetError,
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const reason = getReason(interaction.options.getString('raison'), language);

    if (commandName === 'avertir') {
        const caseData = addModerationCase(guildId, member.id, interaction.user.id, 'warn', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `${member}`, language);

        await interaction.reply({
            content: t(language, 'moderationWarned', { member, caseId: caseData.id }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'timeout') {
        const duration = parseDurationToMs(interaction.options.getString('duree'));

        if (!duration) {
            await interaction.reply({
                content: t(language, 'moderationDurationInvalid'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (duration > MAX_TIMEOUT_DURATION) {
            await interaction.reply({
                content: t(language, 'moderationDurationTooLong'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        try {
            await member.timeout(duration, reason);
        } catch (error) {
            console.error('Erreur timeout :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(guildId, member.id, interaction.user.id, 'timeout', reason, duration);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `${member}`, language);

        await interaction.reply({
            content: t(language, 'moderationTimeout', {
                member,
                duration: formatDuration(duration),
                caseId: caseData.id
            }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'fin-timeout') {
        try {
            await member.timeout(null, reason);
        } catch (error) {
            console.error('Erreur fin timeout :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(guildId, member.id, interaction.user.id, 'untimeout', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `${member}`, language);

        await interaction.reply({
            content: t(language, 'moderationUntimeout', { member, caseId: caseData.id }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'expulser') {
        try {
            await member.kick(reason);
        } catch (error) {
            console.error('Erreur expulsion :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(guildId, member.id, interaction.user.id, 'kick', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `${member.user.tag}`, language);

        await interaction.reply({
            content: t(language, 'moderationKick', { member: member.user.tag, caseId: caseData.id }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    return true;
}

function getUserIdFromText(content) {
    const match = /<@!?(\d{17,20})>|(?:^|\s)(\d{17,20})(?:\s|$)/.exec(content);

    return match ? match[1] || match[2] : null;
}

async function getMemberFromText(message) {
    const mentionedMember = message.mentions.members.first();

    if (mentionedMember) {
        return mentionedMember;
    }

    const userId = getUserIdFromText(message.content);

    return userId ? await fetchMemberSafely(message.guild, userId) : null;
}

async function handleModerationMessage(message, language) {
    const content = message.content.trim();
    const commandMatch = /^!(avertir|warn|timeout|fin-timeout|untimeout|expulser|kick|bannir|ban|purge|clear|sanctions|mod-cases)\b/i
        .exec(content);

    if (!commandMatch) {
        return false;
    }

    const rawCommand = commandMatch[1].toLowerCase();
    const commandName = resolveCommandName(rawCommand);
    const permissionByCommand = {
        avertir: PermissionsBitField.Flags.ModerateMembers,
        timeout: PermissionsBitField.Flags.ModerateMembers,
        'fin-timeout': PermissionsBitField.Flags.ModerateMembers,
        expulser: PermissionsBitField.Flags.KickMembers,
        bannir: PermissionsBitField.Flags.BanMembers,
        purge: PermissionsBitField.Flags.ManageMessages,
        sanctions: PermissionsBitField.Flags.ModerateMembers
    };
    const requiredPermission = permissionByCommand[commandName];

    if (!hasModerationAccess(message.member, requiredPermission)) {
        await message.reply(t(language, 'moderationAccessDenied'));
        return true;
    }

    if (['timeout', 'fin-timeout', 'expulser', 'bannir', 'purge'].includes(commandName)
        && !botHasPermission(message.guild, requiredPermission)) {
        await message.reply(t(language, 'moderationBotPermissionMissing'));
        return true;
    }

    const args = content.split(/\s+/);

    if (commandName === 'purge') {
        if (!message.channel?.isTextBased() || typeof message.channel.bulkDelete !== 'function') {
            await message.reply(t(language, 'moderationNoChannel'));
            return true;
        }

        const amount = clampNumber(args[1], 1, 100);
        const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);

        if (!deleted) {
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const caseData = addModerationCase(
            message.guild.id,
            null,
            message.author.id,
            'clear',
            `${amount} messages demandés dans #${message.channel.name}`,
            null
        );

        await sendModerationLog(message.guild, message.author, caseData, `${message.channel}`, language);
        await message.channel.send(t(language, 'moderationClear', { count: deleted.size })).catch(() => {});
        return true;
    }

    const member = await getMemberFromText(message);

    if (commandName === 'sanctions') {
        if (!member) {
            await message.reply(t(language, 'moderationMemberRequired'));
            return true;
        }

        const cases = getModerationCases(message.guild.id, member.id, 10);

        if (cases.length === 0) {
            await message.reply(t(language, 'moderationCasesEmpty', { member }));
            return true;
        }

        await message.reply({
            embeds: [buildModerationCasesEmbed(member, message.author, cases, language)]
        });
        return true;
    }

    if (commandName === 'bannir') {
        const targetUserId = getUserIdFromText(content);
        const targetUser = member?.user
            || message.mentions.users.first()
            || (targetUserId ? await client.users.fetch(targetUserId).catch(() => null) : null);
        const targetError = getUserTargetError(message.guild, message.member, targetUser, member, language);

        if (targetError) {
            await message.reply(targetError);
            return true;
        }

        const reason = getReason(args.slice(2).join(' '), language);

        try {
            await message.guild.members.ban(targetUser.id, {
                reason,
                deleteMessageSeconds: 0
            });
        } catch (error) {
            console.error('Erreur bannissement texte :', error);
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const caseData = addModerationCase(message.guild.id, targetUser.id, message.author.id, 'ban', reason, null);
        await sendModerationLog(message.guild, message.author, caseData, `${targetUser}`, language);
        await message.reply(t(language, 'moderationBan', { user: targetUser, caseId: caseData.id }));
        return true;
    }

    const targetError = getModerationTargetError(message.member, member, language);

    if (targetError) {
        await message.reply(targetError);
        return true;
    }

    if (commandName === 'avertir') {
        const reason = getReason(args.slice(2).join(' '), language);
        const caseData = addModerationCase(message.guild.id, member.id, message.author.id, 'warn', reason, null);

        await sendModerationLog(message.guild, message.author, caseData, `${member}`, language);
        await message.reply(t(language, 'moderationWarned', { member, caseId: caseData.id }));
        return true;
    }

    if (commandName === 'timeout') {
        const duration = parseDurationToMs(args[2]);

        if (!duration) {
            await message.reply(t(language, 'moderationDurationInvalid'));
            return true;
        }

        if (duration > MAX_TIMEOUT_DURATION) {
            await message.reply(t(language, 'moderationDurationTooLong'));
            return true;
        }

        const reason = getReason(args.slice(3).join(' '), language);

        try {
            await member.timeout(duration, reason);
        } catch (error) {
            console.error('Erreur timeout texte :', error);
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const caseData = addModerationCase(message.guild.id, member.id, message.author.id, 'timeout', reason, duration);
        await sendModerationLog(message.guild, message.author, caseData, `${member}`, language);
        await message.reply(t(language, 'moderationTimeout', {
            member,
            duration: formatDuration(duration),
            caseId: caseData.id
        }));
        return true;
    }

    if (commandName === 'fin-timeout') {
        const reason = getReason(args.slice(2).join(' '), language);

        try {
            await member.timeout(null, reason);
        } catch (error) {
            console.error('Erreur fin timeout texte :', error);
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const caseData = addModerationCase(message.guild.id, member.id, message.author.id, 'untimeout', reason, null);
        await sendModerationLog(message.guild, message.author, caseData, `${member}`, language);
        await message.reply(t(language, 'moderationUntimeout', { member, caseId: caseData.id }));
        return true;
    }

    if (commandName === 'expulser') {
        const reason = getReason(args.slice(2).join(' '), language);

        try {
            await member.kick(reason);
        } catch (error) {
            console.error('Erreur expulsion texte :', error);
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const caseData = addModerationCase(message.guild.id, member.id, message.author.id, 'kick', reason, null);
        await sendModerationLog(message.guild, message.author, caseData, `${member.user.tag}`, language);
        await message.reply(t(language, 'moderationKick', { member: member.user.tag, caseId: caseData.id }));
        return true;
    }

    return true;
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    try {
        const syncResult = await syncSentinelServer(client);

        if (syncResult.skipped) {
            console.log(`Synchronisation serveur Sentinel ignoree : ${syncResult.reason}`);
        } else {
            console.log(`Synchronisation serveur Sentinel terminee : ${syncResult.created} creation(s), ${syncResult.updated} mise(s) a jour.`);
        }
    } catch (error) {
        console.error('Erreur synchronisation serveur Sentinel :', error);
    }
});

client.on(Events.Error, error => {
    console.error('Erreur client Discord :', error);
});

process.on('unhandledRejection', error => {
    console.error('Promesse non geree :', error);
});

process.on('uncaughtException', error => {
    console.error('Exception non geree :', error);
});

client.on(Events.GuildCreate, async guild => {
    getGuildConfig(guild.id);

    const me = guild.members.me;
    const channel = guild.systemChannel
        || guild.channels.cache.find(candidate => (
            typeof candidate.isTextBased === 'function'
            && candidate.isTextBased()
            && candidate.permissionsFor(me)?.has([
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages
            ])
        ));

    if (!channel) {
        return;
    }

    await channel.send({
        embeds: [buildLanguageChoiceEmbed(client.user, 'fr')],
        components: buildLanguageButtons('fr')
    }).catch(() => {});
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isButton()) {
        console.log(`Bouton Discord recu : ${interaction.customId} par ${interaction.user.tag} (${interaction.user.id})`);
    }

    if (
        interaction.isButton()
        && interaction.customId.startsWith('sentinel_language:')
        && interaction.inGuild()
    ) {
        return handleSentinelLanguageButton(interaction);
    }

    if (!interaction.inCachedGuild()) {
        if (interaction.isRepliable()) {
            await interaction.reply({
                content: getGuildInstallRequiredMessage(),
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }

        return;
    }

    if (interaction.isChatInputCommand()) {
        const guildId = interaction.guild.id;
        const language = getGuildLanguage(guildId);
        const commandName = resolveCommandName(interaction.commandName);

        if (commandName === 'aide') {
            const embed = buildHelpEmbed(interaction.guild, interaction.user);

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (isAdvancedCommand(commandName) && !isAdvancedGuild(guildId)) {
            return interaction.reply({
                content: getAdvancedUnavailableMessage(language),
                flags: MessageFlags.Ephemeral
            });
        }

        if (await handleModerationInteraction(interaction, commandName, language)) {
            return;
        }

        if (commandName === 'config-langue') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const selectedLanguage = normalizeLanguage(
                interaction.options.getString('langue') || interaction.options.getString('language')
            );
            const nextLanguage = setGuildLanguage(guildId, selectedLanguage);

            return interaction.reply({
                content: t(nextLanguage, nextLanguage === 'en' ? 'languageSetEn' : 'languageSet'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'config-permissions') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const action = interaction.options.getString('action');
            const role = interaction.options.getRole('role');

            if (action === 'voir') {
                const embed = buildCommandRolesEmbed(interaction.guild, interaction.user);

                return interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!role) {
                return interaction.reply({
                    content: t(language, 'adminRoleRequired'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (role.id === interaction.guild.id) {
                return interaction.reply({
                    content: t(language, 'everyoneDenied'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (action === 'ajouter') {
                addCommandRole(guildId, role.id);

                return interaction.reply({
                    content: t(language, 'commandRoleAdded', { role }),
                    flags: MessageFlags.Ephemeral
                });
            }

            removeCommandRole(guildId, role.id);

            return interaction.reply({
                content: t(language, 'commandRoleRemoved', { role }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'config-role') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const role = interaction.options.getRole('role');

            updateGuildConfig(guildId, {
                serviceRoleId: role.id
            });

            return interaction.reply({
                content: t(language, 'serviceRoleSet', { role }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'config-logs') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const channelId = (interaction.options.getString('salon_id') || interaction.options.getString('channel_id')).trim();

            if (!/^\d{17,20}$/.test(channelId)) {
                return interaction.reply({
                    content: t(language, 'invalidChannelId'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    content: t(language, 'channelNotText'),
                    flags: MessageFlags.Ephemeral
                });
            }

            updateGuildConfig(guildId, {
                logChannelId: channelId
            });

            return interaction.reply({
                content: t(language, 'logChannelSet', { channel }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'config-voir') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = buildConfigEmbed(interaction.guild, interaction.user);

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'ping') {
            try {
                checkDatabase();

                return interaction.reply({
                    content: t(language, 'pingOk', { ping: client.ws.ping }),
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                console.error('Erreur ping SQLite :', error);

                return interaction.reply({
                    content: t(language, 'pingDbError'),
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (commandName === 'diagnostic') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = await buildDiagnosticEmbed(interaction.guild, interaction.user);

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'sync-service') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const result = await syncServiceState(interaction.guild);
            const embed = buildSyncServiceEmbed(interaction.user, result);

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'historique-service') {
            const requestedMember = interaction.options.getMember('membre');
            const isAdvancedServer = isAdvancedGuild(guildId);

            if (!isAdvancedServer && requestedMember && requestedMember.id !== interaction.member.id) {
                return interaction.reply({
                    content: t(language, 'freeHistoryOwnOnly', { limit: FREE_HISTORY_LIMIT }),
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = isAdvancedServer
                ? requestedMember || interaction.member
                : interaction.member;
            const maxLimit = isAdvancedServer ? ADVANCED_HISTORY_LIMIT : FREE_HISTORY_LIMIT;
            const defaultLimit = isAdvancedServer ? 10 : FREE_HISTORY_LIMIT;
            const limit = clampNumber(interaction.options.getInteger('limite') || defaultLimit, 1, maxLimit);

            const userData = getUserData(guildId, member.id);
            const totalSessionCount = getUserSessionCount(guildId, member.id);
            const sessions = getUserSessions(guildId, member.id, limit);
            const embed = buildServiceHistoryEmbed(member, interaction.user, userData, sessions, {
                isAdvancedServer,
                totalSessionCount
            });

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'mes-heures') {
            const userData = getUserData(guildId, interaction.user.id);
            const embed = buildMyHoursEmbed(interaction.user, userData);

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'heures') {
            const member = interaction.options.getMember('membre');
            const userData = getUserData(guildId, member.id);
            const embed = buildMemberHoursEmbed(member, interaction.user, userData);

            if (!embed) {
                return interaction.reply({
                    content: t(language, 'noMemberHours', { member }),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'en-service') {
            const activeServices = getActiveServices(guildId);
            const embed = buildActiveServicesEmbed(interaction.user, activeServices);

            if (!embed) {
                return interaction.reply({
                    content: t(language, 'noActive'),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [embed]
            });
        }

        if (commandName === 'resume-service') {
            if (!isAdvancedGuild(guildId)) {
                return interaction.reply({
                    content: getAdvancedUnavailableMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = buildServiceSummaryEmbed(interaction.guild, interaction.user);

            return interaction.reply({
                embeds: [embed]
            });
        }

        if (commandName === 'top-service') {
            const classement = getTopService(guildId);
            const embed = buildTopServiceEmbed(interaction.user, classement);

            if (!embed) {
                return interaction.reply({
                    content: t(language, 'noTop'),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [embed]
            });
        }

        if (commandName === 'top-semaine') {
            const classement = getTopWeek(guildId);
            const embed = buildTopWeekEmbed(interaction.user, classement);

            if (!embed) {
                return interaction.reply({
                    content: t(language, 'noWeek'),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [embed]
            });
        }

        if (commandName === 'reset-heures') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = interaction.options.getMember('membre');

            resetUser(guildId, member.id);

            return interaction.reply({
                content: t(language, 'resetUser', { member }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'reset-heures-all') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: t(language, 'resetConfirm'),
                components: buildResetGuildConfirmationComponents(interaction.user.id, language),
                flags: MessageFlags.Ephemeral
            });
        }

        return;
    }

    if (!interaction.isButton()) return;

    const buttonLanguage = getGuildLanguage(interaction.guild.id);

    if (interaction.customId.startsWith('set_language:')) {
        if (!hasCommandRoleAccess(interaction.member)) {
            return handleSentinelLanguageButton(interaction);
        }

        const nextLanguage = setGuildLanguage(interaction.guild.id, interaction.customId.split(':')[1]);

        return interaction.reply({
            content: t(nextLanguage, nextLanguage === 'en' ? 'languageSetEn' : 'languageSet'),
            flags: MessageFlags.Ephemeral
        });
    }

    const resetConfirmation = parseResetGuildConfirmation(interaction.customId);

    if (resetConfirmation) {
        if (interaction.user.id !== resetConfirmation.requesterId) {
            return interaction.reply({
                content: t(buttonLanguage, 'resetNotForYou'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (Date.now() - resetConfirmation.createdAt > 10 * 60 * 1000) {
            return interaction.update({
                content: t(buttonLanguage, 'resetExpired'),
                components: [],
                embeds: []
            });
        }

        if (resetConfirmation.action === 'cancel') {
            return interaction.update({
                content: t(buttonLanguage, 'resetCancelled'),
                components: [],
                embeds: []
            });
        }

        if (!hasCommandRoleAccess(interaction.member)) {
            return interaction.reply({
                content: getCommandRoleAccessDeniedMessage(buttonLanguage),
                flags: MessageFlags.Ephemeral
            });
        }

        resetGuild(interaction.guild.id);

        return interaction.update({
            content: t(buttonLanguage, 'resetGuildDone'),
            components: [],
            embeds: []
        });
    }

    if (interaction.customId === 'show_my_hours') {
        const userData = getUserData(interaction.guild.id, interaction.user.id);
        const embed = buildMyHoursEmbed(interaction.user, userData);

        return interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.customId === 'show_active_services') {
        const activeServices = getActiveServices(interaction.guild.id);
        const embed = buildActiveServicesEmbed(interaction.user, activeServices);

        if (!embed) {
            return interaction.reply({
                content: t(buttonLanguage, 'noActive'),
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.customId.startsWith('sentinel_selfrole:')) {
        return handleSentinelSelfRoleButton(interaction);
    }

    if (interaction.customId === 'sentinel_ticket:create') {
        return handleSentinelTicketButton(interaction);
    }

    if (interaction.customId === 'sentinel_ticket:close') {
        return handleSentinelTicketCloseButton(interaction);
    }

    if (interaction.customId !== 'toggle_service') return;

    try {
        const role = getServiceRole(interaction.guild);

        if (!role) {
            return interaction.reply({
                content: t(buttonLanguage, 'noServiceRole'),
                flags: MessageFlags.Ephemeral
            });
        }

        const member = interaction.member;
        const guildId = interaction.guild.id;
        const userId = member.id;
        const userData = createUserIfMissing(guildId, userId);

        if (member.roles.cache.has(role.id)) {
            const startTime = userData.startTime;
            let duration = 0;
            let totalTime = userData.totalTime;

            if (startTime) {
                duration = Date.now() - startTime;
                totalTime += duration;
                addSession(guildId, userId, duration);
            }

            updateUserTime(guildId, userId, totalTime, null);

            await member.roles.remove(role);

            const logChannel = getLogChannel(interaction.guild);

            if (logChannel) {
                await logChannel.send(
                    t(buttonLanguage, 'serviceLeftLog', {
                        member,
                        duration: formatDuration(duration),
                        total: formatDuration(totalTime)
                    })
                ).catch(() => {});
            }

            return interaction.reply({
                content: t(buttonLanguage, 'serviceLeft', { duration: formatDuration(duration) }),
                flags: MessageFlags.Ephemeral
            });
        }

        updateUserTime(guildId, userId, userData.totalTime, Date.now());

        await member.roles.add(role);

        const logChannel = getLogChannel(interaction.guild);

        if (logChannel) {
            await logChannel.send(t(buttonLanguage, 'serviceStartedLog', { member })).catch(() => {});
        }

        return interaction.reply({
            content: t(buttonLanguage, 'serviceStarted'),
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        console.error('Erreur interaction service :', error);

        if (!interaction.replied) {
            return interaction.reply({
                content: t(buttonLanguage, 'serviceError'),
                flags: MessageFlags.Ephemeral
            });
        }
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    let language = getGuildLanguage(guildId);
    const content = message.content.trim();

    if (/^!(aide|help)$/i.test(content)) {
        const embed = buildHelpEmbed(message.guild, message.author);

        return message.reply({ embeds: [embed] });
    }

    if (/^!(langue|language)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const [, rawLanguage] = content.split(/\s+/);

        if (!rawLanguage) {
            return message.reply({
                embeds: [buildLanguageChoiceEmbed(message.author, language)],
                components: buildLanguageButtons(language)
            });
        }

        language = setGuildLanguage(guildId, rawLanguage);

        return message.reply(t(language, language === 'en' ? 'languageSetEn' : 'languageSet'));
    }

    if (isAdvancedTextCommand(content) && !isAdvancedGuild(guildId)) {
        return message.reply(getAdvancedUnavailableMessage(language));
    }

    if (await handleModerationMessage(message, language)) {
        return;
    }

    if (content === '!service-panel') {
        return message.channel.send({
            content: '**Sentinel | Panneau de service**\nPrends ton service, consulte tes heures ou vois les agents actifs avec les boutons ci-dessous.',
            components: buildServicePanelComponents(language)
        });
    }

    if (/^!(config-voir|config-view)$/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const embed = buildConfigEmbed(message.guild, message.author);

        return message.reply({ embeds: [embed] });
    }

    if (content === '!ping') {
        try {
            checkDatabase();

            return message.reply(t(language, 'pingOk', { ping: client.ws.ping }));
        } catch (error) {
            console.error('Erreur ping SQLite :', error);

            return message.reply(t(language, 'pingDbError'));
        }
    }

    if (content.startsWith('!config-permissions')) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const args = content.split(/\s+/);
        const action = (args[1] || 'voir').toLowerCase();
        const role = message.mentions.roles.first();

        if (['voir', 'liste', 'list'].includes(action)) {
            const embed = buildCommandRolesEmbed(message.guild, message.author);

            return message.reply({ embeds: [embed] });
        }

        if (!['ajouter', 'add', 'retirer', 'remove'].includes(action)) {
            return message.reply(language === 'en' ? '❌ Invalid action. Use `add`, `remove`, or `list`.' : '❌ Action invalide. Utilise `ajouter`, `retirer` ou `voir`.');
        }

        if (!role) {
            return message.reply(t(language, 'adminRoleRequired'));
        }

        if (role.id === message.guild.id) {
            return message.reply(t(language, 'everyoneDenied'));
        }

        if (['ajouter', 'add'].includes(action)) {
            addCommandRole(guildId, role.id);

            return message.reply(t(language, 'commandRoleAdded', { role }));
        }

        removeCommandRole(guildId, role.id);

        return message.reply(t(language, 'commandRoleRemoved', { role }));
    }

    if (content === '!diagnostic') {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const embed = await buildDiagnosticEmbed(message.guild, message.author);

        return message.reply({ embeds: [embed] });
    }

    if (content === '!sync-service') {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const result = await syncServiceState(message.guild);
        const embed = buildSyncServiceEmbed(message.author, result);

        return message.reply({ embeds: [embed] });
    }

    if (/^!(historique-service|history)\b/i.test(content)) {
        const isAdvancedServer = isAdvancedGuild(guildId);
        const mentionedMember = message.mentions.members.first();

        if (!isAdvancedServer && mentionedMember && mentionedMember.id !== message.member.id) {
            return message.reply(t(language, 'freeHistoryOwnOnly', { limit: FREE_HISTORY_LIMIT }));
        }

        const member = isAdvancedServer
            ? mentionedMember || message.member
            : message.member;
        const args = content.split(/\s+/);
        const limitArg = args.find(arg => /^\d+$/.test(arg));
        const maxLimit = isAdvancedServer ? ADVANCED_HISTORY_LIMIT : FREE_HISTORY_LIMIT;
        const defaultLimit = isAdvancedServer ? 10 : FREE_HISTORY_LIMIT;
        const limit = clampNumber(limitArg || defaultLimit, 1, maxLimit);

        const userData = getUserData(guildId, member.id);
        const totalSessionCount = getUserSessionCount(guildId, member.id);
        const sessions = getUserSessions(guildId, member.id, limit);
        const embed = buildServiceHistoryEmbed(member, message.author, userData, sessions, {
            isAdvancedServer,
            totalSessionCount
        });

        return message.reply({ embeds: [embed] });
    }

    if (/^!(mes-heures|my-hours)$/i.test(content)) {
        const userData = getUserData(guildId, message.author.id);
        const embed = buildMyHoursEmbed(message.author, userData);

        return message.reply({ embeds: [embed] });
    }

    if (/^!(heures|hours)\b/i.test(content)) {
        const member = message.mentions.members.first();

        if (!member) {
            return message.reply(language === 'en' ? '❌ You must mention a member. Example: `!hours @member`' : '❌ Tu dois mentionner un membre. Exemple : `!heures @membre`');
        }

        const userData = getUserData(guildId, member.id);
        const embed = buildMemberHoursEmbed(member, message.author, userData);

        if (!embed) {
            return message.reply(t(language, 'noMemberHours', { member }));
        }

        return message.reply({ embeds: [embed] });
    }

    if (/^!(en-service|on-duty)$/i.test(content)) {
        const activeServices = getActiveServices(guildId);
        const embed = buildActiveServicesEmbed(message.author, activeServices);

        if (!embed) {
            return message.reply(t(language, 'noActive'));
        }

        return message.reply({ embeds: [embed] });
    }

    if (/^!(resume-service|summary)$/i.test(content)) {
        if (!isAdvancedGuild(guildId)) {
            return message.reply(getAdvancedUnavailableMessage(language));
        }

        const embed = buildServiceSummaryEmbed(message.guild, message.author);

        return message.reply({ embeds: [embed] });
    }

    if (content === '!top-service') {
        const classement = getTopService(guildId);
        const embed = buildTopServiceEmbed(message.author, classement);

        if (!embed) {
            return message.reply(t(language, 'noTop'));
        }

        return message.reply({ embeds: [embed] });
    }

    if (/^!(top-semaine|top-week)$/i.test(content)) {
        const classement = getTopWeek(guildId);
        const embed = buildTopWeekEmbed(message.author, classement);

        if (!embed) {
            return message.reply(t(language, 'noWeek'));
        }

        return message.reply({ embeds: [embed] });
    }

    if (/^!(reset-heures-all|reset-hours-all)$/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        return message.reply({
            content: t(language, 'resetConfirm'),
            components: buildResetGuildConfirmationComponents(message.author.id, language)
        });
    }

    if (/^!(reset-heures|reset-hours)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const member = message.mentions.members.first();

        if (!member) {
            return message.reply(language === 'en' ? '❌ You must mention a member. Example: `!reset-hours @member`' : '❌ Tu dois mentionner un membre. Exemple : `!reset-heures @membre`');
        }

        resetUser(guildId, member.id);

        return message.reply(t(language, 'resetUser', { member }));
    }
});

client.login(process.env.TOKEN);

