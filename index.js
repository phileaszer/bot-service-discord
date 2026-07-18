require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags,
    Events
} = require('discord.js');

const db = require('./database/database');
const { syncSentinelServer } = require('./server-sync');
const { startDashboardServer } = require('./dashboard');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const SENTINEL_REFERENCE_GUILD_ID = '1512509939044712569';
const FREE_HISTORY_LIMIT = 5;
const FREE_TOP_LIMIT = 10;
const FREE_CUSTOM_EMBED_LIMIT = 2;
const REFERENCE_HISTORY_LIMIT = 100;
const REFERENCE_TOP_LIMIT = 25;
const ADVANCED_HISTORY_LIMIT = REFERENCE_HISTORY_LIMIT;
const MAX_TIMEOUT_DURATION = 28 * 24 * 60 * 60 * 1000;
const MAX_TEMPBAN_DURATION = 365 * 24 * 60 * 60 * 1000;
const ADVANCED_COMMAND_NAMES = new Set([
    'heures',
    'hours',
    'top-semaine',
    'top-week',
    'ping',
    'diagnostic',
    'sync-service',
    'sync-sentinel',
    'reset-heures-all',
    'reset-hours-all',
    'resume-service',
    'summary',
    'cas',
    'case',
    'modifier-cas',
    'edit-case',
    'supprimer-cas',
    'delete-case',
    'unwarn',
    'profil-mod',
    'mod-profile',
    'tempban',
    'unban',
    'lock',
    'unlock',
    'slowmode'
]);
const ADVANCED_TEXT_COMMANDS = [
    /^!(heures|hours)(?:\s|$)/i,
    /^!(top-semaine|top-week)$/i,
    /^!ping$/i,
    /^!diagnostic$/i,
    /^!sync-service$/i,
    /^!sync-sentinel$/i,
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
const SENTINEL_BUILD = 'community-suite-2026-06-23-v1';
let lastSentinelServerSync = null;
let lastSentinelServerSyncResult = null;

const SUPPORTED_LANGUAGES = new Set(['fr', 'en']);
const MODERATION_ACTION_LABELS = {
    fr: {
        warn: 'Avertissement',
        timeout: 'Timeout',
        untimeout: 'Fin du timeout',
        kick: 'Expulsion',
        ban: 'Bannissement',
        tempban: 'Bannissement temporaire',
        tempban_expired: 'Fin du bannissement temporaire',
        unban: 'Debannissement',
        clear: 'Purge',
        case_edit: 'Modification de cas',
        case_delete: 'Suppression de cas',
        unwarn: 'Retrait d avertissement',
        lock: 'Salon verrouille',
        unlock: 'Salon deverrouille',
        slowmode: 'Mode lent'
    },
    en: {
        warn: 'Warning',
        timeout: 'Timeout',
        untimeout: 'Timeout removed',
        kick: 'Kick',
        ban: 'Ban',
        tempban: 'Temporary ban',
        tempban_expired: 'Temporary ban expired',
        unban: 'Unban',
        clear: 'Purge',
        case_edit: 'Case edited',
        case_delete: 'Case deleted',
        unwarn: 'Warning removed',
        lock: 'Channel locked',
        unlock: 'Channel unlocked',
        slowmode: 'Slowmode'
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
        resetAllPremiumOnly: '⭐ `/reset-heures-all` sera disponible avec l’abonnement Premium Sentinel. En gratuit, utilise `/reset-heures membre:@membre` ou `/reset-heures utilisateur_id:ID` pour réinitialiser une seule personne.',
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
        resetTargetRequired: '❌ Choisis un membre ou indique son ID Discord. Exemple : `/reset-heures utilisateur_id:123456789012345678`.',
        invalidUserId: '❌ ID utilisateur invalide. Copie uniquement l’ID Discord numérique de la personne.',
        resetUserNoRecord: '⏱️ Aucun temps de service enregistré pour {target} sur ce serveur.',
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
        moderationTargetRequired: '❌ Choisis un membre ou indique son ID Discord.',
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
        moderationTempban: '✅ {user} a été banni temporairement jusqu’à {expiresAt}. Cas #{caseId}.',
        moderationTempbanTooLong: '❌ La durée maximale d’un ban temporaire est de 365 jours.',
        moderationUnban: '✅ L’utilisateur `{userId}` a été débanni. Cas #{caseId}.',
        moderationTempbanExpiredReason: 'Expiration automatique du ban temporaire #{caseId}.',
        moderationTempbanActive: 'ℹ️ Un ban temporaire est déjà programmé pour cet utilisateur jusqu’à {expiresAt}. La nouvelle commande le remplace.',
        moderationClear: '✅ **{count}** message(s) supprimé(s).',
        moderationCasesEmpty: 'Aucune sanction enregistrée pour {member}.',
        moderationFailed: '❌ L’action de modération a échoué. Vérifie les permissions et la hiérarchie des rôles.',
        moderationNoChannel: '❌ Cette commande doit être utilisée dans un salon textuel.',
        moderationCasesTitle: 'Sentinel | Sanctions',
        moderationCaseTitle: 'Sentinel | Cas de modération',
        moderationProfileTitle: 'Sentinel | Profil modération',
        moderationLogTitle: 'Sentinel | Modération',
        moderationCaseNotFound: '❌ Aucun cas #{caseId} trouvé sur ce serveur.',
        moderationCaseEdited: '✅ Le cas #{caseId} a été modifié.',
        moderationCaseDeleted: '✅ Le cas #{caseId} a été supprimé.',
        moderationUnwarnOnlyWarn: '❌ `/unwarn` peut seulement retirer un cas de type avertissement.',
        moderationUnwarnDone: '✅ L’avertissement #{caseId} a été retiré.',
        moderationProfileEmpty: 'Aucun cas de modération enregistré pour {member}.',
        moderationLockDone: '🔒 Le salon {channel} est verrouillé.',
        moderationUnlockDone: '🔓 Le salon {channel} est déverrouillé.',
        moderationSlowmodeDone: '🐢 Mode lent défini sur **{duration}** dans {channel}.',
        moderationSlowmodeDisabled: '✅ Mode lent désactivé dans {channel}.',
        moderationSlowmodeTooLong: '❌ Discord limite le mode lent à 6 heures maximum.',
        premiumModerationHelp: 'Premium modération : `/cas`, `/modifier-cas`, `/supprimer-cas`, `/unwarn`, `/profil-mod`, `/tempban`, `/unban`, `/lock`, `/unlock`, `/slowmode`.',
        customEmbedBotPermissionMissing: '❌ Sentinel doit pouvoir voir le salon, envoyer des messages et intégrer des liens dans {channel}.',
        customEmbedMentionPermissionMissing: '❌ Sentinel ne peut pas mentionner ce rôle. Rends le rôle mentionnable ou donne à Sentinel la permission de mentionner les rôles.',
        customEmbedInvalidColor: '❌ Couleur invalide. Utilise `rose`, `cyan`, `vert`, `rouge`, `violet` ou un code comme `#ff2d9a`.',
        customEmbedInvalidUrl: '❌ URL invalide pour {field}. Utilise une URL `https://` ou indique `retirer` pendant une modification.',
        customEmbedTooLarge: '❌ Cet embed est trop long. Garde le titre sous 256 caractères, le message sous 4000 caractères et le total sous 6000 caractères.',
        customEmbedLimitReached: '⭐ Le gratuit permet **{limit}** embeds Sentinel actifs par serveur. Tu peux modifier tes embeds existants sans limite avec `/embed modifier`, supprimer un embed avec `/embed supprimer`, ou passer Premium pour créer en illimité.',
        customEmbedCreated: '✅ Embed Sentinel envoyé dans {channel}. ID du message : `{messageId}`.\n{quota}',
        customEmbedEdited: '✅ Embed Sentinel `{messageId}` modifié. Les modifications ne consomment pas de quota.',
        customEmbedDeleted: '✅ Embed Sentinel `{messageId}` supprimé. Son emplacement gratuit est libéré.',
        customEmbedNotFound: '❌ Aucun embed Sentinel géré ne correspond à ce message dans ce salon.',
        customEmbedNoEditFields: '❌ Indique au moins un champ à modifier : titre, message, couleur, image, miniature ou footer.',
        customEmbedQuotaFree: 'Quota gratuit : **{used}/{limit}** embeds actifs utilisés. Restant : **{remaining}**.',
        customEmbedQuotaUnlimited: 'Quota Premium : embeds illimités.'
    },
    en: {
        requestedBy: 'Requested by',
        brand: 'Performance - Security - Reliability',
        installRequired: 'Sentinel must be added as a bot on this server to work.',
        installRequiredNoInvite: 'Sentinel must be added as a bot on this server to work. Make sure the invite link contains the bot and applications.commands scopes.',
        installCommandsOnly: 'The link used probably installed commands only.',
        reinvite: 'Reinvite Sentinel with this link: {inviteUrl}',
        unavailable: 'This command is not available on this server for now.',
        resetAllPremiumOnly: '⭐ `/reset-hours-all` will be available with Sentinel Premium. On the free plan, use `/reset-hours member:@member` or `/reset-hours user_id:ID` to reset one person.',
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
        resetTargetRequired: '❌ Choose a member or provide their Discord ID. Example: `/reset-hours user_id:123456789012345678`.',
        invalidUserId: '❌ Invalid user ID. Copy only the numeric Discord ID for that user.',
        resetUserNoRecord: '⏱️ No service time is recorded for {target} on this server.',
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
        moderationTargetRequired: '❌ Choose a member or provide their Discord ID.',
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
        moderationTempban: '✅ {user} has been temporarily banned until {expiresAt}. Case #{caseId}.',
        moderationTempbanTooLong: '❌ Temporary bans are limited to 365 days maximum.',
        moderationUnban: '✅ User `{userId}` has been unbanned. Case #{caseId}.',
        moderationTempbanExpiredReason: 'Automatic expiration of temporary ban #{caseId}.',
        moderationTempbanActive: 'ℹ️ A temporary ban is already scheduled for this user until {expiresAt}. The new command replaces it.',
        moderationClear: '✅ **{count}** message(s) deleted.',
        moderationCasesEmpty: 'No moderation case recorded for {member}.',
        moderationFailed: '❌ Moderation action failed. Check permissions and role hierarchy.',
        moderationNoChannel: '❌ This command must be used in a text channel.',
        moderationCasesTitle: 'Sentinel | Moderation cases',
        moderationCaseTitle: 'Sentinel | Moderation case',
        moderationProfileTitle: 'Sentinel | Moderation profile',
        moderationLogTitle: 'Sentinel | Moderation',
        moderationCaseNotFound: '❌ No case #{caseId} found on this server.',
        moderationCaseEdited: '✅ Case #{caseId} has been edited.',
        moderationCaseDeleted: '✅ Case #{caseId} has been deleted.',
        moderationUnwarnOnlyWarn: '❌ `/unwarn` can only remove warning cases.',
        moderationUnwarnDone: '✅ Warning #{caseId} has been removed.',
        moderationProfileEmpty: 'No moderation case recorded for {member}.',
        moderationLockDone: '🔒 Channel {channel} is locked.',
        moderationUnlockDone: '🔓 Channel {channel} is unlocked.',
        moderationSlowmodeDone: '🐢 Slowmode set to **{duration}** in {channel}.',
        moderationSlowmodeDisabled: '✅ Slowmode disabled in {channel}.',
        moderationSlowmodeTooLong: '❌ Discord limits slowmode to 6 hours maximum.',
        premiumModerationHelp: 'Premium moderation: `/case`, `/edit-case`, `/delete-case`, `/unwarn`, `/mod-profile`, `/tempban`, `/unban`, `/lock`, `/unlock`, `/slowmode`.',
        customEmbedBotPermissionMissing: '❌ Sentinel must be able to view the channel, send messages, and embed links in {channel}.',
        customEmbedMentionPermissionMissing: '❌ Sentinel cannot mention this role. Make the role mentionable or give Sentinel permission to mention roles.',
        customEmbedInvalidColor: '❌ Invalid color. Use `pink`, `cyan`, `green`, `red`, `purple`, or a code like `#ff2d9a`.',
        customEmbedInvalidUrl: '❌ Invalid URL for {field}. Use an `https://` URL, or enter `remove` while editing.',
        customEmbedTooLarge: '❌ This embed is too long. Keep the title under 256 characters, the message under 4000 characters, and the total under 6000 characters.',
        customEmbedLimitReached: '⭐ Free servers can keep **{limit}** active Sentinel embeds. You can edit existing embeds without limit with `/embed edit`, delete one with `/embed delete`, or upgrade to Premium for unlimited creation.',
        customEmbedCreated: '✅ Sentinel embed sent in {channel}. Message ID: `{messageId}`.\n{quota}',
        customEmbedEdited: '✅ Sentinel embed `{messageId}` edited. Edits do not use quota.',
        customEmbedDeleted: '✅ Sentinel embed `{messageId}` deleted. Its free slot is now available.',
        customEmbedNotFound: '❌ No managed Sentinel embed matches this message in this channel.',
        customEmbedNoEditFields: '❌ Provide at least one field to edit: title, message, color, image, thumbnail, or footer.',
        customEmbedQuotaFree: 'Free quota: **{used}/{limit}** active embeds used. Remaining: **{remaining}**.',
        customEmbedQuotaUnlimited: 'Premium quota: unlimited embeds.'
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
        'sync-sentinel': 'sync-sentinel',
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
        'mod-cases': 'sanctions',
        cas: 'cas',
        case: 'cas',
        'modifier-cas': 'modifier-cas',
        'edit-case': 'modifier-cas',
        'supprimer-cas': 'supprimer-cas',
        'delete-case': 'supprimer-cas',
        unwarn: 'unwarn',
        'profil-mod': 'profil-mod',
        'mod-profile': 'profil-mod',
        tempban: 'tempban',
        unban: 'unban',
        lock: 'lock',
        unlock: 'unlock',
        slowmode: 'slowmode',
        embed: 'embed'
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

function getAdvancedGuildIds() {
    return [
        SENTINEL_REFERENCE_GUILD_ID,
        process.env.GUILD_ID,
        process.env.AUTO_SYNC_GUILD_ID,
        process.env.SENTINEL_REFERENCE_GUILD_ID
    ]
        .flatMap(value => String(value || '').split(','))
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value));
}

function isAdvancedGuild(guildId) {
    return Boolean(guildId && getAdvancedGuildIds().includes(String(guildId)));
}

function isAdvancedCommand(commandName) {
    return ADVANCED_COMMAND_NAMES.has(commandName);
}

function isAdvancedTextCommand(content) {
    const normalizedContent = content.trim();

    return ADVANCED_TEXT_COMMANDS.some(pattern => pattern.test(normalizedContent));
}

function getAdvancedUnavailableMessage(language = 'fr', commandName = null) {
    if (commandName === 'reset-heures-all') {
        return t(language, 'resetAllPremiumOnly');
    }

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

function saveDiscordUserProfile(user, options = {}) {
    if (!user?.id) {
        return;
    }

    const timestamp = new Date().toISOString();
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
        user.id,
        user.username || null,
        user.globalName || null,
        user.displayAvatarURL?.({ extension: 'png', size: 128 }) || null,
        lastLoginAt,
        timestamp,
        timestamp
    );
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

function hasUserRecord(guildId, userId) {
    const row = db.prepare(`
        SELECT 1 AS found
        FROM service_times
        WHERE guild_id = ? AND user_id = ?
        UNION
        SELECT 1 AS found
        FROM service_sessions
        WHERE guild_id = ? AND user_id = ?
        LIMIT 1
    `).get(guildId, userId, guildId, userId);

    return Boolean(row);
}

function normalizeUserId(value) {
    const rawValue = String(value || '').trim();
    const match = rawValue.match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);

    return match ? (match[1] || match[2]) : null;
}

function formatResetTarget(member, userId, language = 'fr') {
    if (member) {
        return `${member}`;
    }

    return language === 'en'
        ? `user ID \`${userId}\``
        : `l'utilisateur ID \`${userId}\``;
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

function getCustomEmbedCount(guildId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM custom_embeds
        WHERE guild_id = ?
    `).get(guildId);

    return row?.count || 0;
}

function getCustomEmbedQuota(guildId) {
    const used = getCustomEmbedCount(guildId);

    if (isAdvancedGuild(guildId)) {
        return {
            unlimited: true,
            used,
            limit: null,
            remaining: null
        };
    }

    return {
        unlimited: false,
        used,
        limit: FREE_CUSTOM_EMBED_LIMIT,
        remaining: Math.max(FREE_CUSTOM_EMBED_LIMIT - used, 0)
    };
}

function formatCustomEmbedQuota(guildId, language = 'fr') {
    const quota = getCustomEmbedQuota(guildId);

    if (quota.unlimited) {
        return t(language, 'customEmbedQuotaUnlimited');
    }

    return t(language, 'customEmbedQuotaFree', {
        used: quota.used,
        limit: quota.limit,
        remaining: quota.remaining
    });
}

function addCustomEmbedRecord(guildId, channelId, messageId, creatorUserId, data) {
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO custom_embeds (
            message_id,
            guild_id,
            channel_id,
            creator_user_id,
            title,
            description,
            color,
            image_url,
            thumbnail_url,
            footer,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        messageId,
        guildId,
        channelId,
        creatorUserId,
        data.title,
        data.description,
        data.color || null,
        data.imageUrl || null,
        data.thumbnailUrl || null,
        data.footer || null,
        now,
        now
    );
}

function getCustomEmbedRecord(guildId, messageId) {
    return db.prepare(`
        SELECT message_id, guild_id, channel_id, creator_user_id, title, description, color, image_url, thumbnail_url, footer, created_at, updated_at
        FROM custom_embeds
        WHERE guild_id = ? AND message_id = ?
    `).get(guildId, messageId);
}

function getCustomEmbeds(guildId) {
    return db.prepare(`
        SELECT message_id, guild_id, channel_id, creator_user_id, title, description, color, image_url, thumbnail_url, footer, created_at, updated_at
        FROM custom_embeds
        WHERE guild_id = ?
        ORDER BY datetime(updated_at) DESC, message_id DESC
    `).all(guildId);
}

function updateCustomEmbedRecord(guildId, messageId, data) {
    db.prepare(`
        UPDATE custom_embeds
        SET title = ?,
            description = ?,
            color = ?,
            image_url = ?,
            thumbnail_url = ?,
            footer = ?,
            updated_at = ?
        WHERE guild_id = ? AND message_id = ?
    `).run(
        data.title,
        data.description,
        data.color || null,
        data.imageUrl || null,
        data.thumbnailUrl || null,
        data.footer || null,
        new Date().toISOString(),
        guildId,
        messageId
    );
}

function deleteCustomEmbedRecord(guildId, messageId) {
    return db.prepare(`
        DELETE FROM custom_embeds
        WHERE guild_id = ? AND message_id = ?
    `).run(guildId, messageId).changes > 0;
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

function getRecentModerationCases(guildId, limit = 10) {
    return db.prepare(`
        SELECT id, target_user_id, moderator_user_id, action, reason, duration, created_at
        FROM moderation_cases
        WHERE guild_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(guildId, limit);
}

function getModerationCase(guildId, caseId) {
    return db.prepare(`
        SELECT id, target_user_id, moderator_user_id, action, reason, duration, created_at
        FROM moderation_cases
        WHERE guild_id = ? AND id = ?
    `).get(guildId, caseId);
}

function updateModerationCaseReason(guildId, caseId, reason) {
    return db.prepare(`
        UPDATE moderation_cases
        SET reason = ?
        WHERE guild_id = ? AND id = ?
    `).run(reason, guildId, caseId).changes > 0;
}

function deleteModerationCase(guildId, caseId) {
    const caseRow = getModerationCase(guildId, caseId);

    if (!caseRow) {
        return null;
    }

    db.prepare(`
        DELETE FROM moderation_cases
        WHERE guild_id = ? AND id = ?
    `).run(guildId, caseId);

    return caseRow;
}

function getModerationCaseStats(guildId, userId) {
    const rows = db.prepare(`
        SELECT action, COUNT(*) AS count
        FROM moderation_cases
        WHERE guild_id = ? AND target_user_id = ?
        GROUP BY action
    `).all(guildId, userId);

    return rows.reduce((stats, row) => {
        stats.total += row.count || 0;
        stats.actions[row.action] = row.count || 0;
        return stats;
    }, { total: 0, actions: {} });
}

function getTemporaryBan(guildId, userId) {
    return db.prepare(`
        SELECT guild_id, user_id, moderator_user_id, reason, duration, expires_at, case_id, created_at
        FROM moderation_tempbans
        WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);
}

function upsertTemporaryBan(guildId, userId, moderatorUserId, reason, duration, expiresAt, caseId) {
    db.prepare(`
        INSERT OR REPLACE INTO moderation_tempbans (
            guild_id,
            user_id,
            moderator_user_id,
            reason,
            duration,
            expires_at,
            case_id,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId,
        userId,
        moderatorUserId,
        reason || null,
        duration,
        expiresAt,
        caseId || null,
        new Date().toISOString()
    );
}

function deleteTemporaryBan(guildId, userId) {
    return db.prepare(`
        DELETE FROM moderation_tempbans
        WHERE guild_id = ? AND user_id = ?
    `).run(guildId, userId).changes > 0;
}

function getExpiredTemporaryBans(now = Date.now()) {
    return db.prepare(`
        SELECT guild_id, user_id, moderator_user_id, reason, duration, expires_at, case_id, created_at
        FROM moderation_tempbans
        WHERE expires_at <= ?
        ORDER BY expires_at ASC
        LIMIT 50
    `).all(now);
}

function formatDiscordTime(ms, style = 'f') {
    return `<t:${Math.floor(ms / 1000)}:${style}>`;
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

function parseSlowmodeToSeconds(value) {
    const normalized = String(value || '').trim().toLowerCase();

    if (['0', 'off', 'none', 'disable', 'disabled', 'desactiver', 'désactiver', 'non'].includes(normalized)) {
        return 0;
    }

    const duration = parseDurationToMs(normalized);

    if (duration === null) {
        return null;
    }

    return Math.ceil(duration / 1000);
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

function getUserTargetErrorById(guild, moderatorMember, targetUserId, targetMember, language = 'fr') {
    if (!targetUserId) {
        return t(language, 'moderationUserRequired');
    }

    if (targetUserId === moderatorMember.id) {
        return t(language, 'moderationSelfDenied');
    }

    if (targetUserId === guild.ownerId) {
        return t(language, 'moderationOwnerDenied');
    }

    if (targetUserId === client.user.id) {
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

function buildModerationCasesEmbed(member, requester, cases, language = 'fr', userId = null) {
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
    const targetLabel = member ? `${member}` : formatUserIdLabel(userId, language);
    const thumbnail = member?.user?.displayAvatarURL();

    const embed = createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: t(language, 'moderationCasesTitle'),
        description: `${language === 'en' ? 'Target' : 'Cible'} : ${targetLabel}\n\n${lines.join('\n\n')}`,
        requester,
        thumbnail,
        language
    });

    return embed;
}

function buildModerationCaseEmbed(caseRow, requester, language = 'fr') {
    const fields = [
        {
            name: language === 'en' ? 'Action' : 'Action',
            value: getModerationLabel(caseRow.action, language),
            inline: true
        },
        {
            name: language === 'en' ? 'Target' : 'Cible',
            value: caseRow.target_user_id ? `<@${caseRow.target_user_id}>` : (language === 'en' ? 'No user target' : 'Aucune cible utilisateur'),
            inline: true
        },
        {
            name: language === 'en' ? 'Moderator' : 'Modérateur',
            value: `<@${caseRow.moderator_user_id}>`,
            inline: true
        },
        {
            name: language === 'en' ? 'Date' : 'Date',
            value: `<t:${Math.floor(new Date(caseRow.created_at).getTime() / 1000)}:f>`,
            inline: false
        },
        {
            name: language === 'en' ? 'Reason' : 'Raison',
            value: caseRow.reason || t(language, 'moderationReasonDefault'),
            inline: false
        }
    ];

    if (caseRow.duration) {
        fields.push({
            name: language === 'en' ? 'Duration' : 'Durée',
            value: formatDuration(caseRow.duration),
            inline: true
        });
    }

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: `${t(language, 'moderationCaseTitle')} #${caseRow.id}`,
        requester,
        language
    }).addFields(fields);
}

function buildModerationProfileEmbed(member, requester, cases, stats, language = 'fr', userId = null) {
    const actionSummary = Object.entries(stats.actions)
        .sort((a, b) => b[1] - a[1])
        .map(([action, count]) => `${getModerationLabel(action, language)} : **${count}**`);
    const caseLines = cases.map(caseRow => {
        const duration = caseRow.duration ? ` - ${formatDuration(caseRow.duration)}` : '';

        return `**#${caseRow.id}** ${getModerationLabel(caseRow.action, language)}${duration} - <t:${Math.floor(new Date(caseRow.created_at).getTime() / 1000)}:d>`;
    });
    const targetLabel = member ? `${member}` : formatUserIdLabel(userId, language);
    const thumbnail = member?.user?.displayAvatarURL();

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: t(language, 'moderationProfileTitle'),
        description: `${language === 'en' ? 'Target' : 'Cible'} : ${targetLabel}`,
        requester,
        thumbnail,
        language
    }).addFields(
        {
            name: language === 'en' ? 'Total cases' : 'Total des cas',
            value: `**${stats.total}**`,
            inline: true
        },
        {
            name: language === 'en' ? 'Breakdown' : 'Répartition',
            value: actionSummary.length ? actionSummary.join('\n') : '-',
            inline: false
        },
        {
            name: language === 'en' ? 'Latest cases' : 'Derniers cas',
            value: caseLines.length ? caseLines.join('\n') : '-',
            inline: false
        }
    );
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

const CUSTOM_EMBED_COLOR_ALIASES = {
    rose: '#ff2d9a',
    pink: '#ff2d9a',
    sentinel: '#ff2d9a',
    defaut: '#ff2d9a',
    default: '#ff2d9a',
    cyan: '#17e7ff',
    bleu: '#17e7ff',
    blue: '#17e7ff',
    vert: '#15f5d1',
    green: '#15f5d1',
    rouge: '#ff235a',
    red: '#ff235a',
    violet: '#b76cff',
    purple: '#b76cff'
};
const CUSTOM_EMBED_CLEAR_VALUES = new Set(['retirer', 'remove', 'delete', 'supprimer', 'aucun', 'none', 'null', '-']);

function normalizeCustomEmbedColor(value, language = 'fr') {
    const rawValue = String(value || '').trim().toLowerCase();

    if (!rawValue) {
        return '#ff2d9a';
    }

    const aliasedColor = CUSTOM_EMBED_COLOR_ALIASES[rawValue] || rawValue;

    if (!/^#[0-9a-f]{6}$/i.test(aliasedColor)) {
        throw new Error(t(language, 'customEmbedInvalidColor'));
    }

    return aliasedColor.toLowerCase();
}

function customEmbedColorToNumber(value) {
    return Number.parseInt(normalizeCustomEmbedColor(value).slice(1), 16);
}

function normalizeCustomEmbedUrl(value, field, language = 'fr', allowClear = false) {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
        return null;
    }

    if (CUSTOM_EMBED_CLEAR_VALUES.has(rawValue.toLowerCase())) {
        return allowClear ? null : '';
    }

    try {
        const parsedUrl = new URL(rawValue);

        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Invalid protocol');
        }

        return parsedUrl.toString();
    } catch (error) {
        throw new Error(t(language, 'customEmbedInvalidUrl', { field }));
    }
}

function normalizeCustomEmbedOptionalText(value, allowClear = false) {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
        return null;
    }

    if (allowClear && CUSTOM_EMBED_CLEAR_VALUES.has(rawValue.toLowerCase())) {
        return null;
    }

    return rawValue;
}

function mapCustomEmbedRecord(row) {
    return {
        title: row.title,
        description: row.description,
        color: row.color || '#ff2d9a',
        imageUrl: row.image_url || null,
        thumbnailUrl: row.thumbnail_url || null,
        footer: row.footer || null
    };
}

function validateCustomEmbedSize(data, language = 'fr') {
    const totalLength = [
        data.title,
        data.description,
        data.footer,
        data.imageUrl,
        data.thumbnailUrl
    ].reduce((total, value) => total + String(value || '').length, 0);

    if (
        String(data.title || '').length > 256
        || String(data.description || '').length > 4000
        || String(data.footer || '').length > 2048
        || totalLength > 6000
    ) {
        throw new Error(t(language, 'customEmbedTooLarge'));
    }
}

function buildCustomEmbedData(input, existingData = null, language = 'fr') {
    const data = existingData
        ? { ...existingData }
        : {
            title: normalizeCustomEmbedOptionalText(input.title),
            description: normalizeCustomEmbedOptionalText(input.description),
            color: normalizeCustomEmbedColor(input.color, language),
            imageUrl: null,
            thumbnailUrl: null,
            footer: null
        };
    let changed = !existingData;

    if (existingData && Object.prototype.hasOwnProperty.call(input, 'title') && input.title !== null && input.title !== undefined) {
        const title = normalizeCustomEmbedOptionalText(input.title);
        if (title) {
            data.title = title;
            changed = true;
        }
    }

    if (existingData && Object.prototype.hasOwnProperty.call(input, 'description') && input.description !== null && input.description !== undefined) {
        const description = normalizeCustomEmbedOptionalText(input.description);
        if (description) {
            data.description = description;
            changed = true;
        }
    }

    if (Object.prototype.hasOwnProperty.call(input, 'color') && input.color !== null && input.color !== undefined && String(input.color).trim()) {
        data.color = normalizeCustomEmbedColor(input.color, language);
        changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'imageUrl') && input.imageUrl !== null && input.imageUrl !== undefined) {
        data.imageUrl = normalizeCustomEmbedUrl(input.imageUrl, 'image_url', language, Boolean(existingData));
        changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'thumbnailUrl') && input.thumbnailUrl !== null && input.thumbnailUrl !== undefined) {
        data.thumbnailUrl = normalizeCustomEmbedUrl(input.thumbnailUrl, 'thumbnail_url', language, Boolean(existingData));
        changed = true;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'footer') && input.footer !== null && input.footer !== undefined) {
        data.footer = normalizeCustomEmbedOptionalText(input.footer, Boolean(existingData));
        changed = true;
    }

    if (!data.title || !data.description) {
        throw new Error(t(language, 'customEmbedNoEditFields'));
    }

    validateCustomEmbedSize(data, language);

    return { data, changed };
}

function buildCustomAnnouncementEmbed(data, language = 'fr') {
    const brandIcon = client.user?.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setColor(customEmbedColorToNumber(data.color))
        .setTitle(data.title)
        .setDescription(data.description)
        .setFooter({
            text: data.footer || `Sentinel - ${t(language, 'brand')}`
        })
        .setTimestamp();

    if (brandIcon) {
        embed.setAuthor({
            name: 'Sentinel',
            iconURL: brandIcon
        });
    }

    if (data.imageUrl) {
        embed.setImage(data.imageUrl);
    }

    if (data.thumbnailUrl) {
        embed.setThumbnail(data.thumbnailUrl);
    }

    return embed;
}

function getCustomEmbedChannelError(guild, channel, roleToPing = null, language = 'fr') {
    if (!channel || !channel.isTextBased()) {
        return t(language, 'channelNotText');
    }

    const permissions = channel.permissionsFor(guild.members.me);

    if (!permissions?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks
    ])) {
        return t(language, 'customEmbedBotPermissionMissing', { channel });
    }

    if (roleToPing && !roleToPing.mentionable && !permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
        return t(language, 'customEmbedMentionPermissionMissing');
    }

    return null;
}

function buildCustomEmbedPayload(data, roleToPing = null, language = 'fr') {
    const payload = {
        embeds: [buildCustomAnnouncementEmbed(data, language)],
        allowedMentions: roleToPing
            ? { roles: [roleToPing.id] }
            : { parse: [] }
    };

    if (roleToPing) {
        payload.content = `${roleToPing}`;
    }

    return payload;
}

async function processExpiredTemporaryBans() {
    const expiredBans = getExpiredTemporaryBans();

    for (const tempban of expiredBans) {
        const guild = client.guilds.cache.get(tempban.guild_id)
            || await client.guilds.fetch(tempban.guild_id).catch(() => null);

        if (!guild) {
            continue;
        }

        const language = getGuildLanguage(guild.id);
        const reason = t(language, 'moderationTempbanExpiredReason', {
            caseId: tempban.case_id || '?'
        });

        try {
            await guild.bans.remove(tempban.user_id, reason);
        } catch (error) {
            if (![10007, 10026].includes(error.code)) {
                console.error('Erreur expiration tempban :', error);
                continue;
            }
        }

        deleteTemporaryBan(guild.id, tempban.user_id);

        const caseData = addModerationCase(
            guild.id,
            tempban.user_id,
            client.user.id,
            'tempban_expired',
            reason,
            null
        );

        await sendModerationLog(guild, client.user, caseData, `<@${tempban.user_id}>`, language);
    }
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

function findGuildTextChannel(guild, names) {
    const possibleNames = Array.isArray(names) ? names : [names];

    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText && possibleNames.includes(channel.name)
    ) || null;
}

function getSentinelStaffLogChannel(guild) {
    return findGuildTextChannel(guild, SENTINEL_STAFF_LOG_CHANNELS) || getLogChannel(guild);
}

async function sendSentinelStaffLog(guild, message) {
    const channel = getSentinelStaffLogChannel(guild);

    if (!channel) {
        return;
    }

    await channel.send(message).catch(() => {});
}

function getSentinelGeneralChannel(guild, language) {
    return findGuildTextChannel(guild, SENTINEL_GENERAL_CHANNELS[language] || SENTINEL_GENERAL_CHANNELS.fr);
}

function getSentinelStatusChannel(guild) {
    return findGuildTextChannel(guild, SENTINEL_STATUS_CHANNELS);
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

function buildTopServiceEmbed(requester, classement, options = {}) {
    if (classement.length === 0) {
        return null;
    }

    const displayLimit = options.isReferenceServer ? REFERENCE_TOP_LIMIT : FREE_TOP_LIMIT;
    const displayedClassement = classement.slice(0, displayLimit);
    const totalServerTime = classement.reduce((acc, user) => acc + user.totalTime, 0);
    const bestUser = classement[0];

    const lines = displayedClassement.map((user, index) => (
        `**${getRankLabel(index)}.** <@${user.userId}> - **${formatDuration(user.totalTime)}**`
    ));
    const suffix = classement.length > displayedClassement.length
        ? `\n\n${classement.length - displayedClassement.length} autre(s) agent(s) classe(s).`
        : '';
    const description = options.isReferenceServer
        ? `${lines.join('\n')}${suffix}`
        : `${lines.join('\n')}\n\nTop ${FREE_TOP_LIMIT} affiche en version gratuite.`;

    return createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: 'Sentinel | Classement global',
        description,
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

function buildSyncSentinelEmbed(guild, requester, result) {
    const description = result.skipped
        ? `Synchronisation ignoree : **${result.reason}**.`
        : `Structure Sentinel synchronisee pour **${guild.name}**.`;

    return createSentinelEmbed({
        color: result.skipped ? SENTINEL_COLORS.warning : SENTINEL_COLORS.success,
        title: 'Sentinel | Synchronisation serveur',
        description,
        requester
    }).addFields(
        {
            name: 'Creations',
            value: `**${result.created || 0}**`,
            inline: true
        },
        {
            name: 'Mises a jour',
            value: `**${result.updated || 0}**`,
            inline: true
        }
    );
}

async function runSentinelServerSync(guild, requester = client.user) {
    const result = await syncSentinelServer(client, {
        enabled: true,
        guildId: guild.id
    });

    lastSentinelServerSync = Date.now();
    lastSentinelServerSyncResult = result;
    await updateSentinelStatusPanel(guild).catch(() => {});
    await sendSentinelStaffLog(
        guild,
        result.skipped
            ? `⚠️ Synchronisation Sentinel ignoree : **${result.reason}**.`
            : `✅ Synchronisation Sentinel terminee : **${result.created}** creation(s), **${result.updated}** mise(s) a jour.`
    );

    return buildSyncSentinelEmbed(guild, requester, result);
}

function buildSentinelStatusEmbed(guild, requester = client.user) {
    let databaseOk = true;

    try {
        checkDatabase();
    } catch (error) {
        databaseOk = false;
    }

    const syncText = lastSentinelServerSync
        ? `<t:${Math.floor(lastSentinelServerSync / 1000)}:R>`
        : 'Pas encore synchronise';
    const syncDetail = lastSentinelServerSyncResult?.skipped
        ? `Ignoree : ${lastSentinelServerSyncResult.reason}`
        : lastSentinelServerSyncResult
            ? `${lastSentinelServerSyncResult.created} creation(s), ${lastSentinelServerSyncResult.updated} mise(s) a jour`
            : 'En attente';

    return createSentinelEmbed({
        color: databaseOk ? SENTINEL_COLORS.success : SENTINEL_COLORS.warning,
        title: 'Sentinel | Statut',
        description: `Etat technique de **${guild.name}**.`,
        requester
    }).addFields(
        {
            name: 'Bot',
            value: `En ligne\nLatence Discord : **${client.ws.ping}ms**\nBuild : \`${SENTINEL_BUILD}\``,
            inline: false
        },
        {
            name: 'SQLite',
            value: databaseOk ? 'OK - base disponible' : 'A verifier - base indisponible',
            inline: true
        },
        {
            name: 'Derniere synchronisation',
            value: `${syncText}\n${syncDetail}`,
            inline: true
        }
    );
}

async function updateSentinelStatusPanel(guild) {
    const channel = getSentinelStatusChannel(guild);

    if (!channel) {
        return;
    }

    const payload = { embeds: [buildSentinelStatusEmbed(guild)] };
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const botMessage = messages?.find(message => message.author.id === client.user.id);

    if (botMessage) {
        await botMessage.edit(payload).catch(() => {});
        return;
    }

    await channel.send(payload).catch(() => {});
}

async function updateAllSentinelStatusPanels() {
    for (const guild of client.guilds.cache.values()) {
        await updateSentinelStatusPanel(guild).catch(error => {
            console.error('Erreur mise a jour statut Sentinel :', error);
        });
    }
}

function buildTopWeekEmbed(requester, classement) {
    if (classement.length === 0) {
        return null;
    }

    const displayedClassement = classement.slice(0, REFERENCE_TOP_LIMIT);
    const totalWeekTime = classement.reduce((acc, user) => acc + user.totalTime, 0);
    const bestUser = classement[0];

    const lines = displayedClassement.map((user, index) => (
        `**${getRankLabel(index)}.** <@${user.userId}> - **${formatDuration(user.totalTime)}**`
    ));
    const suffix = classement.length > displayedClassement.length
        ? `\n\n${classement.length - displayedClassement.length} autre(s) agent(s) classe(s).`
        : '';

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: 'Sentinel | Classement hebdomadaire',
        description: `${lines.join('\n')}${suffix}`,
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
                .setCustomId('set_language:fr')
                .setLabel(t(language, 'languageFrench'))
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('set_language:en')
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

function buildLegacyHelpEmbed(guild, requester) {
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
                    '`/config-view` shows the current configuration.',
                    '`/reset-hours member:@member` or `user_id:ID` resets one user hours, even after they left.'
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
                    'Free moderation: `/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`.',
                    '`/ban` can use a Discord ID when the user is no longer in the server.',
                    '`/mod-cases` stays available as a limited view of the latest cases.',
                    '`/embed create` sends an announcement as Sentinel. Free servers can keep 2 active embeds; edits are unlimited.',
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
                    '`/diagnostic`, `/sync-service`, `/sync-sentinel`, `/ping`',
                    '`/reset-hours-all` is reserved for Sentinel Premium.',
                    '`/embed create` is unlimited on Premium/reference servers. `/embed edit` stays unlimited everywhere.',
                    '',
                    '**Premium moderation**',
                    '`/case`, `/edit-case`, `/delete-case`, `/unwarn`, `/mod-profile`',
                    '`/tempban duration user` or `user_id`, `/unban user_id`',
                    '`/lock`, `/unlock`, `/slowmode`',
                    'Later: automatic sanctions after X warnings, configurable per server.'
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
    const isReferenceServer = isAdvancedGuild(guild.id);
    const memberUsage = [
        '**Prendre son service**',
        'Clique sur `Prendre / Quitter`. Sentinel ajoute le role de service.',
        '',
        '**Finir son service**',
        'Clique sur le meme bouton. Sentinel retire le role et sauvegarde le temps.',
        '',
        '**Consulter ses infos**',
        isReferenceServer
            ? '`/mes-heures`, `/historique-service`, `/en-service`, `/heures`, `/top-service`, `/top-semaine` et `/resume-service` sont disponibles sur ce serveur de reference.'
            : '`/mes-heures`, `/historique-service`, `/en-service` et `/top-service` affichent le suivi gratuit.'
    ];
    const commandSummary = [
        '`/aide` - ce guide',
        '`/mes-heures` - tes heures',
        isReferenceServer
            ? '`/historique-service [membre] [limite]` - historique et consultation membre'
            : '`/historique-service` - tes 5 dernieres sessions',
        '`/en-service` - agents actuellement en service',
        isReferenceServer
            ? '`/top-service`, `/top-semaine`, `/resume-service` - classements et resume complet'
            : '`/top-service` - top 10 du serveur',
        '`/reset-heures membre` ou `utilisateur_id` - remettre les heures d une personne a zero, meme si elle a quitte le serveur',
        '`/config-role`, `/config-logs`, `/config-permissions`, `/config-voir` - configuration',
        '`/embed creer` - publier une annonce sous l identite de Sentinel'
    ];
    const moderationUsage = [
        '`/avertir membre raison` - enregistrer un avertissement',
        '`/timeout membre duree raison` - rendre muet temporairement, exemple `10m`, `2h`, `7d`',
        '`/fin-timeout membre raison` - retirer un timeout',
        '`/expulser membre raison` - expulser un membre',
        '`/bannir utilisateur ou utilisateur_id raison` - bannir, meme si la personne n est plus sur le serveur',
        '`/purge nombre` - supprimer jusqu a 100 messages recents',
        '`/sanctions membre ou utilisateur_id` - consultation simple limitee aux 10 derniers cas',
        '`/embed creer`, `/embed modifier`, `/embed supprimer` - gerer des annonces embed Sentinel',
        'Sentinel verifie les permissions et la hierarchie des roles avant chaque sanction.'
    ];
    const premiumModerationUsage = [
        '`/cas id` - afficher un dossier de moderation precis',
        '`/modifier-cas id raison` - corriger la raison d un cas',
        '`/supprimer-cas id` - supprimer un cas',
        '`/unwarn id` - retirer un avertissement par ID',
        '`/profil-mod membre ou utilisateur_id` - historique avance et profil moderation complet',
        '`/tempban duree utilisateur ou utilisateur_id` - bannir temporairement avec expiration automatique',
        '`/unban utilisateur_id` - debannir par ID et annuler un tempban actif',
        '`/lock`, `/unlock`, `/slowmode duree` - gerer rapidement un salon',
        'Plus tard : sanctions automatiques apres X avertissements, configurables par serveur.'
    ];
    const freeLimits = isReferenceServer
        ? [
            'Serveur de reference Sentinel : toutes les commandes du bot sont ouvertes ici.',
            `Historique consultable jusqu a ${REFERENCE_HISTORY_LIMIT} sessions par demande.`,
            `Classements affiches jusqu a ${REFERENCE_TOP_LIMIT} agents par panneau.`,
            '`/reset-heures-all`, `/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service` et `/sync-sentinel` sont disponibles.',
            'Embeds Sentinel : creation illimitee, modifications illimitees.',
            'Les seules limites restantes sont des limites techniques Discord ou de securite.'
        ]
        : [
            'Historique visible : 5 dernieres sessions personnelles.',
            'Classement public : top 10 global.',
            `Embeds Sentinel : ${FREE_CUSTOM_EMBED_LIMIT} embeds actifs gratuits, modifications illimitees.`,
            '`/reset-heures-all` sera reserve a l abonnement Premium Sentinel.',
            'Moderation gratuite : avertissements, timeout, kick, ban par ID, purge et consultation simple des 10 derniers cas.',
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
            name: isReferenceServer ? 'Commandes disponibles' : 'Commandes gratuites',
            value: commandSummary.join('\n'),
            inline: false
        },
        {
            name: 'Moderation',
            value: moderationUsage.join('\n'),
            inline: false
        },
        {
            name: isReferenceServer ? 'Serveur de reference' : 'Limites gratuites',
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
                '`/sync-sentinel` ou `!sync-sentinel`',
                '`/reset-heures-all` ou `!reset-heures-all`',
                '`/ping` ou `!ping`',
                `Historique jusqu a ${REFERENCE_HISTORY_LIMIT} sessions par demande`
            ].join('\n'),
            inline: false
        });
        fields.push({
            name: 'Moderation Premium',
            value: premiumModerationUsage.join('\n'),
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

const HELP_PAGE_DEFAULT = 'start';

function buildHelpPageDefinitions(guild, language = 'fr') {
    const isReferenceServer = isAdvancedGuild(guild.id);

    if (language === 'en') {
        const pages = [
            {
                id: 'start',
                label: 'Start here',
                menuDescription: 'The shortest path to start using Sentinel.',
                emoji: '👋',
                title: 'Sentinel | Help',
                description: 'Choose a section in the menu below. Each page is short so the guide stays readable on mobile.',
                fields: [
                    {
                        name: 'Recommended order',
                        value: [
                            '`1.` Invite Sentinel as a real Discord bot.',
                            '`2.` Choose the server language with `/language`.',
                            '`3.` Set the duty role and log channel.',
                            '`4.` Publish the duty panel with `!service-panel`.'
                        ].join('\n')
                    },
                    {
                        name: 'Useful checks',
                        value: [
                            '`/config-view` shows the current setup.',
                            '`/diagnostic` checks permissions and role order.',
                            '`/ping` checks whether Sentinel and SQLite respond.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'install',
                label: 'Install',
                menuDescription: 'Invite Sentinel and check Discord role order.',
                emoji: '🧩',
                title: 'Sentinel | Install',
                description: 'Before configuring anything, make sure Discord sees Sentinel as a bot.',
                fields: [
                    {
                        name: 'Discord integration',
                        value: [
                            'In `Server Settings > Integrations`, Sentinel must show the `Bot` badge.',
                            'If you only see `Commands`, remove the integration and invite Sentinel again with the official link.'
                        ].join('\n')
                    },
                    {
                        name: 'Role order',
                        value: [
                            'Create a duty role, for example `On duty`, `Patrol`, or `Active agent`.',
                            'Move the Sentinel role above that duty role, otherwise Discord will refuse role changes.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'config',
                label: 'Setup',
                menuDescription: 'Language, duty role, logs, and staff roles.',
                emoji: '⚙️',
                title: 'Sentinel | Server setup',
                description: 'These commands prepare Sentinel for this server only.',
                fields: [
                    {
                        name: 'Basic setup',
                        value: [
                            '`/language language:English` chooses English for this server.',
                            '`/config-role role:@role` sets the duty role.',
                            '`/config-channel channel_id:ID` sets the log channel by ID.',
                            '`/config-view` shows what is configured.'
                        ].join('\n')
                    },
                    {
                        name: 'Who can manage Sentinel?',
                        value: [
                            'At the start, owner/admin/manage-server/manage-roles can configure Sentinel.',
                            'Then use `/config-permissions action:add role:@role` to choose the staff roles allowed to manage it.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'service',
                label: 'Duty panel',
                menuDescription: 'Publish and use the duty buttons.',
                emoji: '🟢',
                title: 'Sentinel | Duty panel',
                description: 'The panel is a normal text command, not a slash command.',
                fields: [
                    {
                        name: 'Publish the panel',
                        value: [
                            'Go to the channel where members should clock in.',
                            'Send `!service-panel`.',
                            'Sentinel will post the buttons in that channel.'
                        ].join('\n')
                    },
                    {
                        name: 'Use the buttons',
                        value: [
                            '`Start / End` starts or ends duty.',
                            '`My hours` shows personal hours.',
                            '`On duty` shows currently active agents.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'commands',
                label: 'Free commands',
                menuDescription: 'The main free service commands.',
                emoji: '📋',
                title: 'Sentinel | Free commands',
                description: 'The free version keeps the essentials visible and simple.',
                fields: [
                    {
                        name: 'Members',
                        value: [
                            '`/my-hours` shows your hours.',
                            '`/history` shows your latest personal sessions.',
                            '`/on-duty` shows active agents.',
                            '`/top-service` shows the server top 10.'
                        ].join('\n')
                    },
                    {
                        name: 'Staff',
                        value: [
                            '`/reset-hours member:@member` or `user_id:ID` resets one person, even if they left.',
                            '`/embed create` sends an announcement as Sentinel.',
                            'Free servers can keep 2 active Sentinel embeds. Edits are unlimited.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'moderation',
                label: 'Moderation',
                menuDescription: 'Warn, timeout, kick, ban by ID, and purge.',
                emoji: '🛡️',
                title: 'Sentinel | Moderation',
                description: 'Sentinel checks Discord permissions and role hierarchy before every sanction.',
                fields: [
                    {
                        name: 'Free moderation',
                        value: [
                            '`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`.',
                            '`/ban` can use a Discord ID when the user is no longer in the server.',
                            '`/mod-cases` shows a limited view of the latest cases.'
                        ].join('\n')
                    },
                    {
                        name: 'Important',
                        value: 'If an action is refused, check Sentinel role position and Discord permissions.'
                    }
                ]
            },
            {
                id: 'limits',
                label: isReferenceServer ? 'Reference server' : 'Free limits',
                menuDescription: isReferenceServer ? 'What is open on the reference server.' : 'What free servers can use today.',
                emoji: '⭐',
                title: isReferenceServer ? 'Sentinel | Reference server' : 'Sentinel | Free limits',
                description: isReferenceServer
                    ? 'This server has access to the complete Sentinel command set.'
                    : 'The free version stays useful, while larger tools are planned for Premium.',
                fields: isReferenceServer
                    ? [
                        {
                            name: 'Reference access',
                            value: [
                                `History up to ${REFERENCE_HISTORY_LIMIT} sessions per request.`,
                                `Leaderboards up to ${REFERENCE_TOP_LIMIT} agents.`,
                                '`/reset-hours-all`, `/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-sentinel` are available.',
                                'Sentinel embeds: unlimited creation and unlimited edits.'
                            ].join('\n')
                        }
                    ]
                    : [
                        {
                            name: 'Free access',
                            value: [
                                `Personal history: last ${FREE_HISTORY_LIMIT} sessions.`,
                                `Public ranking: top ${FREE_TOP_LIMIT}.`,
                                `Sentinel embeds: ${FREE_CUSTOM_EMBED_LIMIT} active embeds, unlimited edits.`,
                                '`/reset-hours-all` will be reserved for Sentinel Premium.'
                            ].join('\n')
                        }
                    ]
            },
            {
                id: 'troubleshooting',
                label: 'Troubleshooting',
                menuDescription: 'Quick fixes when something does not work.',
                emoji: '🛠️',
                title: 'Sentinel | Troubleshooting',
                description: 'Most issues come from invite scopes, role order, or channel permissions.',
                fields: [
                    {
                        name: 'Quick fixes',
                        value: [
                            'Sentinel does not give the role? Move Sentinel above the duty role.',
                            'Logs are not sent? Check that Sentinel can view and write in the log channel.',
                            'Command refused? Check `/config-permissions action:list`.',
                            'Sentinel is not in member list? Reinvite it as a bot, not commands only.'
                        ].join('\n')
                    }
                ]
            }
        ];

        if (isReferenceServer) {
            pages.push({
                id: 'advanced',
                label: 'Advanced',
                menuDescription: 'Reference/Premium commands.',
                emoji: '💎',
                title: 'Sentinel | Advanced commands',
                description: 'These tools are reserved for the reference server and future Premium servers.',
                fields: [
                    {
                        name: 'Service',
                        value: [
                            '`/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-hours-all`.',
                            '`/embed create` is unlimited here. `/embed edit` is unlimited everywhere.'
                        ].join('\n')
                    },
                    {
                        name: 'Premium moderation',
                        value: [
                            '`/case`, `/edit-case`, `/delete-case`, `/unwarn`, `/mod-profile`.',
                            '`/tempban`, `/unban`, `/lock`, `/unlock`, `/slowmode`.',
                            'Later: automatic sanctions after X warnings.'
                        ].join('\n')
                    }
                ]
            });
        }

        return pages;
    }

    const pages = [
        {
            id: 'start',
            label: 'Commencer',
            menuDescription: 'Le chemin le plus simple pour démarrer.',
            emoji: '👋',
            title: 'Sentinel | Aide',
            description: 'Choisis une rubrique dans le menu ci-dessous. Chaque page est courte pour rester lisible sur mobile.',
            fields: [
                {
                    name: 'Ordre conseillé',
                    value: [
                        '`1.` Invite Sentinel comme vrai bot Discord.',
                        '`2.` Choisis la langue du serveur avec `/config-langue`.',
                        '`3.` Configure le rôle de service et le salon de logs.',
                        '`4.` Publie le panneau avec `!service-panel`.'
                    ].join('\n')
                },
                {
                    name: 'Vérifications utiles',
                    value: [
                        '`/config-voir` affiche les réglages actuels.',
                        '`/diagnostic` vérifie les permissions et l’ordre des rôles.',
                        '`/ping` vérifie que Sentinel et SQLite répondent.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'install',
            label: 'Installation',
            menuDescription: 'Inviter Sentinel et vérifier les rôles.',
            emoji: '🧩',
            title: 'Sentinel | Installation',
            description: 'Avant de configurer le bot, vérifie que Discord voit bien Sentinel comme un bot.',
            fields: [
                {
                    name: 'Intégration Discord',
                    value: [
                        'Dans `Paramètres du serveur > Intégrations`, Sentinel doit avoir le badge `Bot`.',
                        'Si tu vois seulement `Commandes`, retire l’intégration et réinvite Sentinel avec le lien officiel.'
                    ].join('\n')
                },
                {
                    name: 'Ordre des rôles',
                    value: [
                        'Crée un rôle de service, par exemple `En service`, `Patrouille` ou `Agent actif`.',
                        'Place le rôle Sentinel au-dessus de ce rôle, sinon Discord refusera de l’ajouter ou de le retirer.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'config',
            label: 'Configuration',
            menuDescription: 'Langue, rôle, logs et rôles staff.',
            emoji: '⚙️',
            title: 'Sentinel | Configuration serveur',
            description: 'Ces commandes préparent Sentinel pour ce serveur uniquement.',
            fields: [
                {
                    name: 'Réglages de base',
                    value: [
                        '`/config-langue langue:Français` choisit la langue du serveur.',
                        '`/config-role role:@role` choisit le rôle donné en service.',
                        '`/config-logs salon_id:ID` choisit le salon de logs par ID.',
                        '`/config-voir` affiche ce qui est configuré.'
                    ].join('\n')
                },
                {
                    name: 'Qui peut gérer Sentinel ?',
                    value: [
                        'Au départ, propriétaire/admin/Gérer le serveur/Gérer les rôles peuvent configurer.',
                        'Ensuite, utilise `/config-permissions action:ajouter role:@role` pour choisir les rôles staff autorisés.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'service',
            label: 'Panneau service',
            menuDescription: 'Publier et utiliser les boutons de service.',
            emoji: '🟢',
            title: 'Sentinel | Panneau de service',
            description: 'Le panneau est une commande texte normale, pas une commande slash.',
            fields: [
                {
                    name: 'Publier le panneau',
                    value: [
                        'Va dans le salon où les membres doivent pointer.',
                        'Envoie `!service-panel`.',
                        'Sentinel publiera les boutons dans ce salon.'
                    ].join('\n')
                },
                {
                    name: 'Utiliser les boutons',
                    value: [
                        '`Prendre / Quitter` commence ou termine le service.',
                        '`Mes heures` affiche les heures personnelles.',
                        '`En service` affiche les agents actuellement actifs.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'commands',
            label: 'Commandes gratuites',
            menuDescription: 'Les commandes service principales.',
            emoji: '📋',
            title: 'Sentinel | Commandes gratuites',
            description: 'Le gratuit garde les commandes essentielles, sans noyer les utilisateurs.',
            fields: [
                {
                    name: 'Membres',
                    value: [
                        '`/mes-heures` affiche tes heures.',
                        '`/historique-service` affiche tes dernières sessions.',
                        '`/en-service` affiche les agents actifs.',
                        '`/top-service` affiche le top 10 du serveur.'
                    ].join('\n')
                },
                {
                    name: 'Staff',
                    value: [
                        '`/reset-heures membre:@membre` ou `utilisateur_id:ID` remet une personne à zéro, même si elle a quitté.',
                        '`/embed creer` publie une annonce sous l’identité de Sentinel.',
                        `Le gratuit garde ${FREE_CUSTOM_EMBED_LIMIT} embeds actifs. Les modifications sont illimitées.`
                    ].join('\n')
                }
            ]
        },
        {
            id: 'moderation',
            label: 'Modération',
            menuDescription: 'Warn, timeout, expulsion, ban par ID et purge.',
            emoji: '🛡️',
            title: 'Sentinel | Modération',
            description: 'Sentinel vérifie les permissions Discord et la hiérarchie des rôles avant chaque sanction.',
            fields: [
                {
                    name: 'Modération gratuite',
                    value: [
                        '`/avertir`, `/timeout`, `/fin-timeout`, `/expulser`, `/bannir`, `/purge`.',
                        '`/bannir` peut utiliser un ID Discord si la personne n’est plus sur le serveur.',
                        '`/sanctions` affiche une vue simple des derniers cas.'
                    ].join('\n')
                },
                {
                    name: 'Important',
                    value: 'Si une action est refusée, vérifie la position du rôle Sentinel et les permissions Discord.'
                }
            ]
        },
        {
            id: 'limits',
            label: isReferenceServer ? 'Serveur référence' : 'Limites gratuites',
            menuDescription: isReferenceServer ? 'Ce qui est ouvert sur le serveur référence.' : 'Ce que les serveurs gratuits peuvent utiliser.',
            emoji: '⭐',
            title: isReferenceServer ? 'Sentinel | Serveur de référence' : 'Sentinel | Limites gratuites',
            description: isReferenceServer
                ? 'Ce serveur a accès à l’ensemble des commandes Sentinel.'
                : 'Le gratuit reste utile, les outils plus lourds sont prévus pour le Premium.',
            fields: isReferenceServer
                ? [
                    {
                        name: 'Accès référence',
                        value: [
                            `Historique jusqu’à ${REFERENCE_HISTORY_LIMIT} sessions par demande.`,
                            `Classements jusqu’à ${REFERENCE_TOP_LIMIT} agents.`,
                            '`/reset-heures-all`, `/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service`, `/sync-sentinel` sont disponibles.',
                            'Embeds Sentinel : création illimitée et modifications illimitées.'
                        ].join('\n')
                    }
                ]
                : [
                    {
                        name: 'Accès gratuit',
                        value: [
                            `Historique personnel : ${FREE_HISTORY_LIMIT} dernières sessions.`,
                            `Classement public : top ${FREE_TOP_LIMIT}.`,
                            `Embeds Sentinel : ${FREE_CUSTOM_EMBED_LIMIT} embeds actifs, modifications illimitées.`,
                            '`/reset-heures-all` sera réservé à Sentinel Premium.'
                        ].join('\n')
                    }
                ]
        },
        {
            id: 'troubleshooting',
            label: 'Dépannage',
            menuDescription: 'Les corrections rapides quand ça bloque.',
            emoji: '🛠️',
            title: 'Sentinel | Dépannage rapide',
            description: 'La plupart des soucis viennent du lien d’invitation, de l’ordre des rôles ou des permissions salon.',
            fields: [
                {
                    name: 'Corrections rapides',
                    value: [
                        'Sentinel ne donne pas le rôle ? Remonte son rôle au-dessus du rôle de service.',
                        'Les logs ne partent pas ? Vérifie que Sentinel peut voir et écrire dans le salon.',
                        'Commande refusée ? Vérifie `/config-permissions action:voir`.',
                        'Sentinel n’apparaît pas dans les membres ? Réinvite-le comme bot, pas seulement comme commandes.'
                    ].join('\n')
                }
            ]
        }
    ];

    if (isReferenceServer) {
        pages.push({
            id: 'advanced',
            label: 'Avancé',
            menuDescription: 'Commandes référence/Premium.',
            emoji: '💎',
            title: 'Sentinel | Commandes avancées',
            description: 'Ces outils sont réservés au serveur de référence et aux futurs serveurs Premium.',
            fields: [
                {
                    name: 'Service',
                    value: [
                        '`/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-heures-all`.',
                        '`/embed creer` est illimité ici. `/embed modifier` reste illimité partout.'
                    ].join('\n')
                },
                {
                    name: 'Modération Premium',
                    value: [
                        '`/cas`, `/modifier-cas`, `/supprimer-cas`, `/unwarn`, `/profil-mod`.',
                        '`/tempban`, `/unban`, `/lock`, `/unlock`, `/slowmode`.',
                        'Plus tard : sanctions automatiques après X avertissements.'
                    ].join('\n')
                }
            ]
        });
    }

    return pages;
}

function getHelpPage(guild, language, pageId = HELP_PAGE_DEFAULT) {
    const pages = buildHelpPageDefinitions(guild, language);
    const page = pages.find(item => item.id === pageId) || pages[0];

    return {
        pages,
        page,
        index: pages.findIndex(item => item.id === page.id)
    };
}

function buildHelpEmbed(guild, requester, pageId = HELP_PAGE_DEFAULT) {
    const language = getGuildLanguage(guild.id);
    const { pages, page, index } = getHelpPage(guild, language, pageId);
    const pageLabel = language === 'en'
        ? `Page ${index + 1}/${pages.length}`
        : `Page ${index + 1}/${pages.length}`;

    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: page.title,
        description: `${page.description}\n\n${pageLabel}`,
        requester,
        thumbnail: guild.iconURL(),
        language
    }).addFields(page.fields.map(field => ({
        ...field,
        inline: false
    })));
}

function buildHelpMenuComponents(guild, requester, pageId = HELP_PAGE_DEFAULT) {
    const language = getGuildLanguage(guild.id);
    const { pages, page } = getHelpPage(guild, language, pageId);
    const placeholder = language === 'en'
        ? 'Choose a help section'
        : 'Choisis une rubrique d’aide';

    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`sentinel_help:${requester.id}`)
                .setPlaceholder(placeholder)
                .addOptions(pages.map(item => ({
                    label: item.label,
                    value: item.id,
                    description: item.menuDescription,
                    emoji: item.emoji,
                    default: item.id === page.id
                })))
        )
    ];
}

function parseHelpMenuRequesterId(customId) {
    const match = /^sentinel_help:(\d{17,20})$/.exec(customId);

    return match ? match[1] : null;
}

async function handleHelpMenuInteraction(interaction) {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('sentinel_help:')) {
        return false;
    }

    const requesterId = parseHelpMenuRequesterId(interaction.customId);
    const language = getGuildLanguage(interaction.guild.id);

    if (requesterId && interaction.user.id !== requesterId) {
        return interaction.reply({
            content: language === 'en'
                ? 'This help menu belongs to the person who opened it. Use `/help` to open yours.'
                : 'Ce menu d’aide appartient à la personne qui l’a ouvert. Utilise `/aide` pour ouvrir le tien.',
            flags: MessageFlags.Ephemeral
        });
    }

    const pageId = interaction.values[0] || HELP_PAGE_DEFAULT;

    return interaction.update({
        embeds: [buildHelpEmbed(interaction.guild, interaction.user, pageId)],
        components: buildHelpMenuComponents(interaction.guild, interaction.user, pageId)
    });
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

function truncateAuditValue(value, maxLength = 500) {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    return String(value).slice(0, maxLength);
}

function flattenInteractionOptions(options = []) {
    const flattened = [];

    for (const option of options) {
        if (Array.isArray(option.options) && option.options.length > 0) {
            flattened.push(...flattenInteractionOptions(option.options));
            continue;
        }

        flattened.push(option);
    }

    return flattened;
}

function getAuditOptionValue(interaction, names) {
    const options = flattenInteractionOptions(interaction.options?.data || []);

    for (const name of names) {
        const option = options.find(item => item.name === name);

        if (option?.value !== undefined && option.value !== null && option.value !== '') {
            return String(option.value);
        }
    }

    return null;
}

function mapDiscordAuditAction(interaction) {
    if (interaction.isButton()) {
        if (interaction.customId === 'toggle_service') {
            return 'toggle-service';
        }

        if (interaction.customId.startsWith('set_language:')) {
            return 'set-language';
        }

        const resetConfirmation = parseResetGuildConfirmation(interaction.customId);

        if (resetConfirmation?.action === 'confirm') {
            return 'reset-guild';
        }

        return null;
    }

    if (!interaction.isChatInputCommand()) {
        return null;
    }

    const commandName = resolveCommandName(interaction.commandName);

    if (commandName === 'embed') {
        const subcommand = interaction.options.getSubcommand(false);
        const embedActions = {
            creer: 'custom-embed-create',
            create: 'custom-embed-create',
            modifier: 'custom-embed-edit',
            edit: 'custom-embed-edit',
            supprimer: 'custom-embed-delete',
            delete: 'custom-embed-delete'
        };

        return embedActions[subcommand] || 'custom-embed-create';
    }

    if (commandName === 'config-langue') {
        return 'set-language';
    }

    if (commandName === 'config-role') {
        return 'set-service-role';
    }

    if (commandName === 'config-logs') {
        return 'set-log-channel';
    }

    if (commandName === 'config-permissions') {
        const action = interaction.options.getString('action');

        if (action === 'ajouter' || action === 'add') {
            return 'add-command-role';
        }

        if (action === 'retirer' || action === 'remove') {
            return 'remove-command-role';
        }

        return null;
    }

    const actionMap = {
        'sync-service': 'sync-service',
        'sync-sentinel': 'sync-sentinel',
        'reset-heures': 'reset-user',
        'reset-heures-all': 'reset-guild',
        avertir: 'warn',
        timeout: 'timeout',
        'fin-timeout': 'untimeout',
        expulser: 'kick',
        bannir: 'ban',
        purge: 'purge',
        'modifier-cas': 'edit-case',
        'supprimer-cas': 'delete-case',
        unwarn: 'unwarn',
        tempban: 'tempban',
        unban: 'unban',
        lock: 'lock',
        unlock: 'unlock',
        slowmode: 'slowmode'
    };

    return actionMap[commandName] || null;
}

function getDiscordAuditTarget(interaction, action) {
    if (interaction.isButton()) {
        if (action === 'toggle-service') {
            return { targetType: 'user', targetId: interaction.user.id };
        }

        if (action === 'set-language' || action === 'reset-guild') {
            return { targetType: 'guild', targetId: interaction.guild?.id || null };
        }
    }

    const roleActions = new Set(['set-service-role', 'add-command-role', 'remove-command-role']);
    const channelActions = new Set(['set-log-channel', 'publish-service-panel', 'purge', 'lock', 'unlock', 'slowmode']);
    const messageActions = new Set(['custom-embed-edit', 'custom-embed-delete']);
    const caseActions = new Set(['edit-case', 'delete-case', 'unwarn']);

    if (caseActions.has(action)) {
        return { targetType: 'case', targetId: getAuditOptionValue(interaction, ['id', 'case_id']) };
    }

    if (messageActions.has(action)) {
        return { targetType: 'message', targetId: getAuditOptionValue(interaction, ['message_id', 'messageId']) };
    }

    if (roleActions.has(action)) {
        return { targetType: 'role', targetId: getAuditOptionValue(interaction, ['role', 'role_a_ping']) };
    }

    if (channelActions.has(action) || action?.startsWith('custom-embed-')) {
        return { targetType: 'channel', targetId: getAuditOptionValue(interaction, ['salon', 'channel', 'salon_id', 'channel_id']) };
    }

    const userId = getAuditOptionValue(interaction, ['membre', 'member', 'utilisateur', 'user', 'utilisateur_id', 'user_id']);

    if (userId) {
        return { targetType: 'user', targetId: userId };
    }

    return { targetType: null, targetId: null };
}

function getTextCommandAuditAction(content) {
    const trimmed = String(content || '').trim();

    if (/^!(fr|en)$/i.test(trimmed) || /^!(langue|language)\b/i.test(trimmed)) {
        return 'set-language';
    }

    if (/^!service-panel$/i.test(trimmed)) {
        return 'publish-service-panel';
    }

    if (/^!config-permissions\b/i.test(trimmed)) {
        const action = (trimmed.split(/\s+/)[1] || 'voir').toLowerCase();

        if (['ajouter', 'add'].includes(action)) {
            return 'add-command-role';
        }

        if (['retirer', 'remove'].includes(action)) {
            return 'remove-command-role';
        }

        return null;
    }

    if (/^!sync-service$/i.test(trimmed)) {
        return 'sync-service';
    }

    if (/^!sync-sentinel$/i.test(trimmed)) {
        return 'sync-sentinel';
    }

    if (/^!(reset-heures-all|reset-hours-all)$/i.test(trimmed)) {
        return 'reset-guild';
    }

    if (/^!(reset-heures|reset-hours)\b/i.test(trimmed)) {
        return 'reset-user';
    }

    const match = /^!(avertir|warn|timeout|fin-timeout|untimeout|expulser|kick|bannir|ban|purge|clear)\b/i.exec(trimmed);

    if (!match) {
        return null;
    }

    const actions = {
        avertir: 'warn',
        warn: 'warn',
        timeout: 'timeout',
        'fin-timeout': 'untimeout',
        untimeout: 'untimeout',
        expulser: 'kick',
        kick: 'kick',
        bannir: 'ban',
        ban: 'ban',
        purge: 'purge',
        clear: 'purge'
    };

    return actions[match[1].toLowerCase()] || null;
}

function getTextCommandAuditTarget(message, action) {
    if (action === 'publish-service-panel' || action === 'purge') {
        return { targetType: 'channel', targetId: message.channel?.id || null };
    }

    if (action === 'add-command-role' || action === 'remove-command-role') {
        return { targetType: 'role', targetId: message.mentions.roles.first()?.id || null };
    }

    if (action === 'set-language' || action === 'reset-guild') {
        return { targetType: 'guild', targetId: message.guild?.id || null };
    }

    const userId = message.mentions.users.first()?.id || getUserIdFromText(message.content);

    if (userId) {
        return { targetType: 'user', targetId: userId };
    }

    return { targetType: null, targetId: null };
}

function addAuditLogEntry({ guild, actor, action, status, targetType = null, targetId = null, summary, details = {}, source }) {
    if (!guild?.id || !actor?.id || !action || !source) {
        return;
    }

    try {
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
            truncateAuditValue(guild.name, 200),
            actor.id,
            truncateAuditValue(actor.tag || actor.user?.tag || actor.username || actor.displayName, 200),
            truncateAuditValue(action, 100),
            status === 'failed' ? 'failed' : 'success',
            truncateAuditValue(targetType, 50),
            truncateAuditValue(targetId, 100),
            truncateAuditValue(summary || 'Action Discord Sentinel.', 800),
            JSON.stringify(details || {}),
            source,
            new Date().toISOString()
        );
    } catch (error) {
        console.error('Erreur audit Sentinel :', error);
    }
}

function recordDiscordInteractionAudit(interaction, { status = 'success', summary = null } = {}) {
    if (!interaction?.inCachedGuild?.()) {
        return;
    }

    const action = mapDiscordAuditAction(interaction);

    if (!action) {
        return;
    }

    const target = getDiscordAuditTarget(interaction, action);
    const details = interaction.isChatInputCommand()
        ? {
            command: `/${interaction.commandName}`,
            subcommand: interaction.options.getSubcommand(false) || null
        }
        : {
            button: interaction.customId
        };
    const sourceLabel = interaction.isButton() ? 'bouton Discord' : 'commande Discord';

    addAuditLogEntry({
        guild: interaction.guild,
        actor: interaction.user,
        action,
        status,
        targetType: target.targetType,
        targetId: target.targetId,
        summary: summary || `Action Sentinel depuis ${sourceLabel}.`,
        details,
        source: 'discord'
    });
}

function recordDiscordTextAudit(message, { status = 'success', summary = null } = {}) {
    if (!message?.guild || message.author?.bot) {
        return;
    }

    const action = getTextCommandAuditAction(message.content);

    if (!action) {
        return;
    }

    const target = getTextCommandAuditTarget(message, action);
    const command = String(message.content || '').trim().split(/\s+/)[0] || '!commande';

    addAuditLogEntry({
        guild: message.guild,
        actor: message.author,
        action,
        status,
        targetType: target.targetType,
        targetId: target.targetId,
        summary: summary || 'Action Sentinel depuis une commande texte Discord.',
        details: {
            command
        },
        source: 'discord'
    });
}

const SENTINEL_SELF_ROLES = {
    announcements: '📡 Sentinel | Annonces',
    maintenance: '🛠 Sentinel | Maintenance',
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

const SENTINEL_GENERAL_CHANNELS = {
    fr: ['💬｜general'],
    en: ['💬｜general-en']
};

const SENTINEL_STATUS_CHANNELS = ['📌｜statut-sentinel', '📌｜sentinel-status'];
const SENTINEL_STAFF_LOG_CHANNELS = ['📂｜logs'];

const SENTINEL_VOTE_LABELS = {
    stability: { fr: 'Stabilite', en: 'Stability' },
    features: { fr: 'Fonctions', en: 'Features' },
    moderation: { fr: 'Moderation', en: 'Moderation' },
    ux: { fr: 'Ergonomie', en: 'Usability' }
};

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
    const language = normalizeLanguage(interaction.customId.split(':')[1]);

    if (!interaction.inCachedGuild()) {
        return interaction.reply({
            content: getGuildInstallRequiredMessage(),
            flags: MessageFlags.Ephemeral
        });
    }

    if (!isAdvancedGuild(interaction.guildId)) {
        if (!hasCommandRoleAccess(interaction.member)) {
            return interaction.reply({
                content: getCommandRoleAccessDeniedMessage(getGuildLanguage(interaction.guildId)),
                flags: MessageFlags.Ephemeral
            });
        }

        const nextLanguage = setGuildLanguage(interaction.guildId, language);

        return interaction.reply({
            content: t(nextLanguage, nextLanguage === 'en' ? 'languageSetEn' : 'languageSet'),
            flags: MessageFlags.Ephemeral
        });
    }

    const roleName = SENTINEL_LANGUAGE_ROLES[language];

    if (!roleName) {
        return interaction.reply({
            content: 'Langue Sentinel inconnue.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild || await interaction.client.guilds.fetch(interaction.guildId);
    let member;
    let selectedRole;

    try {
        ({ member, selectedRole } = await applySentinelLanguageToMember(guild, interaction.user.id, language));

        console.log(`Langue Sentinel appliquee : ${language} pour ${interaction.user.tag} (${interaction.user.id})`);
        await sendSentinelStaffLog(
            guild,
            `🌐 Langue Sentinel : ${interaction.user} a choisi **${language === 'fr' ? 'Francais' : 'English'}**.`
        );

        const generalChannel = getSentinelGeneralChannel(guild, language);

        if (generalChannel) {
            await generalChannel.send(
                language === 'fr'
                    ? `Bienvenue ${interaction.user} dans la communaute Sentinel.`
                    : `Welcome ${interaction.user} to the Sentinel community.`
            ).catch(() => {});
        }
    } catch (error) {
        console.error('Erreur bouton langue Sentinel :', error);

        return interaction.editReply('Je n arrive pas a modifier ton role de langue. Verifie que mon role Discord est bien au-dessus des roles de langue.');
    }

    const hasBypassView = member.id === guild.ownerId
        || member.permissions.has(PermissionsBitField.Flags.Administrator)
        || SENTINEL_STAFF_ROLES.some(staffRoleName => member.roles.cache.some(role => role.name === staffRoleName));
    const baseMessage = language === 'fr'
        ? `Langue configuree : ${selectedRole}.`
        : `Language set: ${selectedRole}.`;
    const visibilityMessage = language === 'fr'
        ? 'Les membres sans permission staff voient maintenant la version francaise du serveur.'
        : 'Members without staff permissions now see the English server view.';
    const bypassMessage = language === 'fr'
        ? '\n\nNote : ton compte a des permissions staff/admin, donc Discord peut encore te laisser voir les deux versions.'
        : '\n\nNote: your account has staff/admin permissions, so Discord may still let you see both versions.';

    return interaction.editReply(`${baseMessage} ${visibilityMessage}${hasBypassView ? bypassMessage : ''}`);
}

async function handleSentinelButtonFailure(interaction, error) {
    console.error(`Erreur bouton ${interaction.customId} :`, error);

    if (!interaction.isRepliable()) {
        return;
    }

    const content = 'Une erreur est survenue pendant le traitement du bouton Sentinel.';

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(content).catch(() => {});
        return;
    }

    await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
    }).catch(() => {});
}

function handleSentinelButton(interaction, handler) {
    return handler(interaction).catch(error => handleSentinelButtonFailure(interaction, error));
}

async function applySentinelLanguageToMember(guild, userId, language) {
    await guild.roles.fetch();

    const roleName = SENTINEL_LANGUAGE_ROLES[language];
    const selectedRole = findRoleByName(guild, roleName);
    const otherRole = findRoleByName(
        guild,
        language === 'fr' ? SENTINEL_LANGUAGE_ROLES.en : SENTINEL_LANGUAGE_ROLES.fr
    );

    if (!selectedRole) {
        throw new Error(`Role de langue introuvable : ${roleName}`);
    }

    const member = await guild.members.fetch(userId);

    if (otherRole && member.roles.cache.has(otherRole.id)) {
        await member.roles.remove(otherRole);
    }

    if (!member.roles.cache.has(selectedRole.id)) {
        await member.roles.add(selectedRole);
    }

    return { member, selectedRole };
}

async function handleSentinelTicketButton(interaction) {
    await interaction.guild.channels.fetch();
    const ticketType = interaction.customId === 'sentinel_ticket:bug' ? 'bug' : 'support';
    const ticketLabel = ticketType === 'bug' ? 'bug' : 'support';

    const existingTicket = interaction.guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText
        && channel.topic?.startsWith(`sentinel-ticket:${interaction.user.id}`)
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
        name: `${ticketLabel}-${sanitizeTicketName(interaction.user.username)}`,
        type: ChannelType.GuildText,
        parent: supportCategory?.id || null,
        topic: `sentinel-ticket:${interaction.user.id}:${ticketType}`,
        permissionOverwrites: buildTicketOverwrites(interaction.guild, interaction.member),
        reason: `Creation ticket Sentinel ${ticketType}`
    });

    const description = ticketType === 'bug'
        ? [
            `${interaction.user}, merci de completer le signalement avec le plus de precision possible.`,
            '',
            '**Commande ou fonction concernee :**',
            '**Ce que tu as fait :**',
            '**Resultat obtenu :**',
            '**Resultat attendu :**',
            '**Capture, message d erreur ou contexte :**',
            '',
            'Le support analysera le bug des que possible.'
        ]
        : [
            `${interaction.user}, explique ta demande clairement.`,
            '',
            '- probleme ou question',
            '- commande/fonction concernee',
            '- capture ou message d erreur si disponible',
            '',
            'Le support te repondra des que possible.'
        ];
    const embed = new EmbedBuilder()
        .setColor(ticketType === 'bug' ? SENTINEL_COLORS.danger : SENTINEL_COLORS.primary)
        .setTitle(ticketType === 'bug' ? 'Ticket Sentinel | Bug' : 'Ticket Sentinel | Support')
        .setDescription(description.join('\n'))
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
    await sendSentinelStaffLog(interaction.guild, `🎫 Ticket Sentinel ouvert : ${ticketChannel} par ${interaction.user} (${ticketType}).`);

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
    await sendSentinelStaffLog(interaction.guild, `🔒 Ticket Sentinel ferme : **${interaction.channel.name}** par ${interaction.user}.`);

    setTimeout(() => {
        interaction.channel?.delete('Fermeture ticket Sentinel').catch(() => {});
    }, 3000);
}

async function handleSentinelVoteButton(interaction) {
    const voteKey = interaction.customId.split(':')[1];
    const labels = SENTINEL_VOTE_LABELS[voteKey];

    if (!labels) {
        return interaction.reply({
            content: 'Vote Sentinel inconnu.',
            flags: MessageFlags.Ephemeral
        });
    }

    await sendSentinelStaffLog(
        interaction.guild,
        `🗳 Vote priorite Sentinel : ${interaction.user} a vote **${labels.fr} / ${labels.en}**.`
    );

    return interaction.reply({
        content: `Vote enregistre : **${labels.fr}**. Merci pour ton retour.`,
        flags: MessageFlags.Ephemeral
    });
}

async function getMemberOption(interaction, optionName) {
    const member = interaction.options.getMember(optionName);

    if (member) {
        return member;
    }

    const user = interaction.options.getUser(optionName);

    return user ? await fetchMemberSafely(interaction.guild, user.id) : null;
}

function getUserIdOption(interaction) {
    return normalizeUserId(
        interaction.options.getString('utilisateur_id')
        || interaction.options.getString('user_id')
    );
}

function formatUserIdLabel(userId, language = 'fr') {
    return language === 'en'
        ? `user ID \`${userId}\``
        : `utilisateur ID \`${userId}\``;
}

async function getMemberOrIdOption(interaction, optionName = 'membre', language = 'fr') {
    const member = await getMemberOption(interaction, optionName);
    const userId = member?.id || getUserIdOption(interaction);
    const fetchedMember = member || (userId ? await fetchMemberSafely(interaction.guild, userId) : null);

    return {
        member: fetchedMember,
        userId,
        label: fetchedMember ? `${fetchedMember}` : (userId ? formatUserIdLabel(userId, language) : null)
    };
}

async function getUserOrIdOption(interaction, optionName = 'utilisateur', language = 'fr') {
    const selectedUser = interaction.options.getUser(optionName)
        || interaction.options.getUser('user');
    const userId = selectedUser?.id || getUserIdOption(interaction);
    const user = selectedUser || (userId ? await client.users.fetch(userId).catch(() => null) : null);
    const member = userId ? await fetchMemberSafely(interaction.guild, userId) : null;

    return {
        user,
        userId,
        member,
        label: user ? `${user}` : (userId ? formatUserIdLabel(userId, language) : null)
    };
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
        'sanctions',
        'cas',
        'modifier-cas',
        'supprimer-cas',
        'unwarn',
        'profil-mod',
        'tempban',
        'unban',
        'lock',
        'unlock',
        'slowmode'
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
        sanctions: PermissionsBitField.Flags.ModerateMembers,
        cas: PermissionsBitField.Flags.ModerateMembers,
        'modifier-cas': PermissionsBitField.Flags.ModerateMembers,
        'supprimer-cas': PermissionsBitField.Flags.ModerateMembers,
        unwarn: PermissionsBitField.Flags.ModerateMembers,
        'profil-mod': PermissionsBitField.Flags.ModerateMembers,
        tempban: PermissionsBitField.Flags.BanMembers,
        unban: PermissionsBitField.Flags.BanMembers,
        lock: PermissionsBitField.Flags.ManageChannels,
        unlock: PermissionsBitField.Flags.ManageChannels,
        slowmode: PermissionsBitField.Flags.ManageChannels
    };
    const requiredPermission = permissionByCommand[commandName];

    if (!hasModerationAccess(moderator, requiredPermission)) {
        await interaction.reply({
            content: t(language, 'moderationAccessDenied'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (['timeout', 'fin-timeout', 'expulser', 'bannir', 'purge', 'tempban', 'unban', 'lock', 'unlock', 'slowmode'].includes(commandName)
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
        const target = await getMemberOrIdOption(interaction, 'membre', language);

        if (!target.userId) {
            await interaction.reply({
                content: t(language, 'moderationTargetRequired'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const cases = getModerationCases(guildId, target.userId, 10);

        if (cases.length === 0) {
            await interaction.reply({
                content: t(language, 'moderationCasesEmpty', { member: target.label }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.reply({
            embeds: [buildModerationCasesEmbed(target.member, interaction.user, cases, language, target.userId)],
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'cas') {
        const caseId = interaction.options.getInteger('id');
        const caseRow = getModerationCase(guildId, caseId);

        if (!caseRow) {
            await interaction.reply({
                content: t(language, 'moderationCaseNotFound', { caseId }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.reply({
            embeds: [buildModerationCaseEmbed(caseRow, interaction.user, language)],
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'modifier-cas') {
        const caseId = interaction.options.getInteger('id');
        const caseRow = getModerationCase(guildId, caseId);

        if (!caseRow) {
            await interaction.reply({
                content: t(language, 'moderationCaseNotFound', { caseId }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );

        updateModerationCaseReason(guildId, caseId, reason);

        const caseData = {
            id: caseId,
            guildId,
            targetUserId: caseRow.target_user_id,
            moderatorUserId: interaction.user.id,
            action: 'case_edit',
            reason,
            duration: null,
            createdAt: new Date().toISOString()
        };

        await sendModerationLog(
            interaction.guild,
            interaction.user,
            caseData,
            caseRow.target_user_id ? `<@${caseRow.target_user_id}>` : `#${caseId}`,
            language
        );

        await interaction.reply({
            content: t(language, 'moderationCaseEdited', { caseId }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'supprimer-cas' || commandName === 'unwarn') {
        const caseId = interaction.options.getInteger('id');
        const caseRow = getModerationCase(guildId, caseId);

        if (!caseRow) {
            await interaction.reply({
                content: t(language, 'moderationCaseNotFound', { caseId }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (commandName === 'unwarn' && caseRow.action !== 'warn') {
            await interaction.reply({
                content: t(language, 'moderationUnwarnOnlyWarn'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        deleteModerationCase(guildId, caseId);

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );
        const action = commandName === 'unwarn' ? 'unwarn' : 'case_delete';
        const caseData = addModerationCase(
            guildId,
            caseRow.target_user_id,
            interaction.user.id,
            action,
            `${language === 'en' ? 'Original case' : 'Cas original'} #${caseId}. ${reason}`,
            null
        );

        await sendModerationLog(
            interaction.guild,
            interaction.user,
            caseData,
            caseRow.target_user_id ? `<@${caseRow.target_user_id}>` : `#${caseId}`,
            language
        );

        await interaction.reply({
            content: commandName === 'unwarn'
                ? t(language, 'moderationUnwarnDone', { caseId })
                : t(language, 'moderationCaseDeleted', { caseId }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'profil-mod') {
        const target = await getMemberOrIdOption(interaction, 'membre', language);

        if (!target.userId) {
            await interaction.reply({
                content: t(language, 'moderationTargetRequired'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const limit = clampNumber(interaction.options.getInteger('limite') || interaction.options.getInteger('limit') || 25, 1, 25);
        const cases = getModerationCases(guildId, target.userId, limit);

        if (cases.length === 0) {
            await interaction.reply({
                content: t(language, 'moderationProfileEmpty', { member: target.label }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const stats = getModerationCaseStats(guildId, target.userId);

        await interaction.reply({
            embeds: [buildModerationProfileEmbed(target.member, interaction.user, cases, stats, language, target.userId)],
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (['lock', 'unlock', 'slowmode'].includes(commandName)) {
        if (!interaction.channel?.isTextBased()) {
            await interaction.reply({
                content: t(language, 'moderationNoChannel'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );

        try {
            if (commandName === 'lock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                }, { reason });
            }

            if (commandName === 'unlock') {
                await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    CreatePublicThreads: null,
                    CreatePrivateThreads: null
                }, { reason });
            }

            if (commandName === 'slowmode') {
                if (typeof interaction.channel.setRateLimitPerUser !== 'function') {
                    await interaction.reply({
                        content: t(language, 'moderationNoChannel'),
                        flags: MessageFlags.Ephemeral
                    });
                    return true;
                }

                const seconds = parseSlowmodeToSeconds(
                    interaction.options.getString('duree') || interaction.options.getString('duration')
                );

                if (seconds === null) {
                    await interaction.reply({
                        content: t(language, 'moderationDurationInvalid'),
                        flags: MessageFlags.Ephemeral
                    });
                    return true;
                }

                if (seconds > 21600) {
                    await interaction.reply({
                        content: t(language, 'moderationSlowmodeTooLong'),
                        flags: MessageFlags.Ephemeral
                    });
                    return true;
                }

                await interaction.channel.setRateLimitPerUser(seconds, reason);
            }
        } catch (error) {
            console.error('Erreur moderation premium :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const slowmodeSeconds = commandName === 'slowmode'
            ? parseSlowmodeToSeconds(interaction.options.getString('duree') || interaction.options.getString('duration'))
            : null;
        const caseData = addModerationCase(
            guildId,
            null,
            interaction.user.id,
            commandName,
            `${interaction.channel} - ${reason}`,
            slowmodeSeconds !== null ? slowmodeSeconds * 1000 : null
        );

        await sendModerationLog(interaction.guild, interaction.user, caseData, `${interaction.channel}`, language);

        if (commandName === 'lock') {
            await interaction.reply({
                content: t(language, 'moderationLockDone', { channel: interaction.channel }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (commandName === 'unlock') {
            await interaction.reply({
                content: t(language, 'moderationUnlockDone', { channel: interaction.channel }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.reply({
            content: slowmodeSeconds === 0
                ? t(language, 'moderationSlowmodeDisabled', { channel: interaction.channel })
                : t(language, 'moderationSlowmodeDone', {
                    channel: interaction.channel,
                    duration: formatDuration(slowmodeSeconds * 1000)
                }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'tempban') {
        const target = await getUserOrIdOption(interaction, 'utilisateur', language);
        const targetError = getUserTargetErrorById(interaction.guild, moderator, target.userId, target.member, language);

        if (targetError) {
            await interaction.reply({
                content: targetError,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const duration = parseDurationToMs(
            interaction.options.getString('duree') || interaction.options.getString('duration')
        );

        if (!duration) {
            await interaction.reply({
                content: t(language, 'moderationDurationInvalid'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (duration > MAX_TEMPBAN_DURATION) {
            await interaction.reply({
                content: t(language, 'moderationTempbanTooLong'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );
        const deleteDays = clampNumber(interaction.options.getInteger('jours_messages') || interaction.options.getInteger('delete_days') || 0, 0, 7);
        const previousTempban = getTemporaryBan(guildId, target.userId);
        const expiresAt = Date.now() + duration;

        try {
            await interaction.guild.members.ban(target.userId, {
                reason,
                deleteMessageSeconds: deleteDays * 24 * 60 * 60
            });
        } catch (error) {
            console.error('Erreur tempban :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const caseData = addModerationCase(guildId, target.userId, interaction.user.id, 'tempban', reason, duration);
        upsertTemporaryBan(guildId, target.userId, interaction.user.id, reason, duration, expiresAt, caseData.id);
        await sendModerationLog(interaction.guild, interaction.user, caseData, target.label, language);

        const notice = previousTempban
            ? `${t(language, 'moderationTempbanActive', {
                expiresAt: formatDiscordTime(previousTempban.expires_at)
            })}\n`
            : '';

        await interaction.reply({
            content: `${notice}${t(language, 'moderationTempban', {
                user: target.label,
                expiresAt: formatDiscordTime(expiresAt),
                caseId: caseData.id
            })}`,
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'unban') {
        const userId = normalizeUserId(
            interaction.options.getString('utilisateur_id') || interaction.options.getString('user_id')
        );

        if (!userId) {
            await interaction.reply({
                content: t(language, 'invalidUserId'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );

        try {
            await interaction.guild.bans.remove(userId, reason);
        } catch (error) {
            console.error('Erreur unban :', error);
            await interaction.reply({
                content: t(language, 'moderationFailed'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        deleteTemporaryBan(guildId, userId);

        const caseData = addModerationCase(guildId, userId, interaction.user.id, 'unban', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, `<@${userId}>`, language);

        await interaction.reply({
            content: t(language, 'moderationUnban', { userId, caseId: caseData.id }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'bannir') {
        const target = await getUserOrIdOption(interaction, 'utilisateur', language);
        const targetError = getUserTargetErrorById(interaction.guild, moderator, target.userId, target.member, language);

        if (targetError) {
            await interaction.reply({
                content: targetError,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const reason = getReason(
            interaction.options.getString('raison') || interaction.options.getString('reason'),
            language
        );
        const deleteDays = clampNumber(interaction.options.getInteger('jours_messages') || interaction.options.getInteger('delete_days') || 0, 0, 7);

        try {
            await interaction.guild.members.ban(target.userId, {
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

        const caseData = addModerationCase(guildId, target.userId, interaction.user.id, 'ban', reason, null);
        await sendModerationLog(interaction.guild, interaction.user, caseData, target.label, language);

        await interaction.reply({
            content: t(language, 'moderationBan', { user: target.label, caseId: caseData.id }),
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

function getCustomEmbedInteractionInput(interaction) {
    return {
        title: interaction.options.getString('titre') || interaction.options.getString('title'),
        description: interaction.options.getString('message'),
        color: interaction.options.getString('couleur') || interaction.options.getString('color'),
        imageUrl: interaction.options.getString('image_url'),
        thumbnailUrl: interaction.options.getString('thumbnail_url'),
        footer: interaction.options.getString('footer')
    };
}

async function fetchManagedCustomEmbedMessage(guildId, channel, messageId) {
    const record = getCustomEmbedRecord(guildId, messageId);

    if (!record || record.channel_id !== channel.id) {
        return { record: null, message: null };
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message || message.author.id !== client.user.id) {
        deleteCustomEmbedRecord(guildId, messageId);
        return { record: null, message: null };
    }

    return { record, message };
}

async function handleCustomEmbedInteraction(interaction, commandName, language) {
    if (commandName !== 'embed') {
        return false;
    }

    if (!hasCommandRoleAccess(interaction.member)) {
        await interaction.reply({
            content: getCommandRoleAccessDeniedMessage(language),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('salon') || interaction.options.getChannel('channel');
    const channelError = getCustomEmbedChannelError(interaction.guild, channel, null, language);

    if (channelError) {
        await interaction.reply({
            content: channelError,
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (subcommand === 'creer') {
        const quota = getCustomEmbedQuota(guildId);

        if (!quota.unlimited && quota.used >= quota.limit) {
            await interaction.reply({
                content: t(language, 'customEmbedLimitReached', { limit: quota.limit }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const roleToPing = interaction.options.getRole('role_a_ping');
        const roleError = getCustomEmbedChannelError(interaction.guild, channel, roleToPing, language);

        if (roleError) {
            await interaction.reply({
                content: roleError,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        let data;

        try {
            ({ data } = buildCustomEmbedData(getCustomEmbedInteractionInput(interaction), null, language));
        } catch (error) {
            await interaction.reply({
                content: error.message,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const sentMessage = await channel.send(buildCustomEmbedPayload(data, roleToPing, language)).catch(() => null);

        if (!sentMessage) {
            await interaction.reply({
                content: t(language, 'customEmbedBotPermissionMissing', { channel }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        addCustomEmbedRecord(guildId, channel.id, sentMessage.id, interaction.user.id, data);

        await interaction.reply({
            content: t(language, 'customEmbedCreated', {
                channel,
                messageId: sentMessage.id,
                quota: formatCustomEmbedQuota(guildId, language)
            }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const messageId = normalizeUserId(interaction.options.getString('message_id')) || String(interaction.options.getString('message_id') || '').trim();

    if (!/^\d{17,20}$/.test(messageId)) {
        await interaction.reply({
            content: t(language, 'customEmbedNotFound'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const { record, message } = await fetchManagedCustomEmbedMessage(guildId, channel, messageId);

    if (!record || !message) {
        await interaction.reply({
            content: t(language, 'customEmbedNotFound'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (subcommand === 'supprimer') {
        await message.delete().catch(() => {});
        deleteCustomEmbedRecord(guildId, messageId);

        await interaction.reply({
            content: t(language, 'customEmbedDeleted', { messageId }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (subcommand === 'modifier') {
        let nextData;
        let changed;

        try {
            ({ data: nextData, changed } = buildCustomEmbedData(
                getCustomEmbedInteractionInput(interaction),
                mapCustomEmbedRecord(record),
                language
            ));
        } catch (error) {
            await interaction.reply({
                content: error.message,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!changed) {
            await interaction.reply({
                content: t(language, 'customEmbedNoEditFields'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await message.edit({
            content: message.content || null,
            embeds: [buildCustomAnnouncementEmbed(nextData, language)],
            allowedMentions: { parse: [] }
        });
        updateCustomEmbedRecord(guildId, messageId, nextData);

        await interaction.reply({
            content: t(language, 'customEmbedEdited', { messageId }),
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
        const targetUserId = member?.id || getUserIdFromText(content);

        if (!targetUserId) {
            await message.reply(t(language, 'moderationTargetRequired'));
            return true;
        }

        const cases = getModerationCases(message.guild.id, targetUserId, 10);
        const targetLabel = member ? `${member}` : formatUserIdLabel(targetUserId, language);

        if (cases.length === 0) {
            await message.reply(t(language, 'moderationCasesEmpty', { member: targetLabel }));
            return true;
        }

        await message.reply({
            embeds: [buildModerationCasesEmbed(member, message.author, cases, language, targetUserId)]
        });
        return true;
    }

    if (commandName === 'bannir') {
        const targetUserId = getUserIdFromText(content);
        const targetUser = member?.user
            || message.mentions.users.first()
            || (targetUserId ? await client.users.fetch(targetUserId).catch(() => null) : null);
        const resolvedTargetId = targetUser?.id || targetUserId;
        const targetError = getUserTargetErrorById(message.guild, message.member, resolvedTargetId, member, language);

        if (targetError) {
            await message.reply(targetError);
            return true;
        }

        const reason = getReason(args.slice(2).join(' '), language);

        try {
            await message.guild.members.ban(resolvedTargetId, {
                reason,
                deleteMessageSeconds: 0
            });
        } catch (error) {
            console.error('Erreur bannissement texte :', error);
            await message.reply(t(language, 'moderationFailed'));
            return true;
        }

        const targetLabel = targetUser ? `${targetUser}` : formatUserIdLabel(resolvedTargetId, language);
        const caseData = addModerationCase(message.guild.id, resolvedTargetId, message.author.id, 'ban', reason, null);
        await sendModerationLog(message.guild, message.author, caseData, targetLabel, language);
        await message.reply(t(language, 'moderationBan', { user: targetLabel, caseId: caseData.id }));
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
    console.log(`Build Sentinel actif : ${SENTINEL_BUILD}`);

    startDashboardServer({
        client,
        build: SENTINEL_BUILD,
        invitePermissions: BOT_INVITE_PERMISSIONS,
        maxTimeoutDuration: MAX_TIMEOUT_DURATION,
        maxTempbanDuration: MAX_TEMPBAN_DURATION,
        helpers: {
            addCommandRole,
            addCustomEmbedRecord,
            addModerationCase,
            addSession,
            buildCustomAnnouncementEmbed,
            buildCustomEmbedData,
            buildCustomEmbedPayload,
            buildServicePanelComponents,
            createUserIfMissing,
            deleteCustomEmbedRecord,
            deleteModerationCase,
            deleteTemporaryBan,
            formatDuration,
            formatCustomEmbedQuota,
            getActiveServices,
            getCommandRoleIds,
            getCustomEmbeds,
            getCustomEmbedQuota,
            getCustomEmbedRecord,
            getGuildConfig,
            getGuildLanguage,
            getLogChannel,
            getModerationCase,
            getRecentModerationCases,
            getModerationTargetError,
            getCustomEmbedChannelError,
            getReason,
            getServiceRole,
            getServiceSummary,
            getTemporaryBan,
            getTopService,
            getTopWeek,
            getUserData,
            getUserSessions,
            getUserSessionCount,
            getUserTargetErrorById,
            hasCommandRoleAccess,
            hasModerationAccess,
            isAdvancedGuild,
            normalizeUserId,
            parseDurationToMs,
            parseSlowmodeToSeconds,
            removeCommandRole,
            resetGuild,
            resetUser,
            sendModerationLog,
            setGuildLanguage,
            syncServiceState,
            updateGuildConfig,
            updateCustomEmbedRecord,
            updateModerationCaseReason,
            updateUserTime,
            upsertTemporaryBan
        }
    });

    try {
        const syncResult = await syncSentinelServer(client);
        lastSentinelServerSync = Date.now();
        lastSentinelServerSyncResult = syncResult;

        if (syncResult.skipped) {
            console.log(`Synchronisation serveur Sentinel ignoree : ${syncResult.reason}`);
        } else {
            console.log(`Synchronisation serveur Sentinel terminee : ${syncResult.created} creation(s), ${syncResult.updated} mise(s) a jour.`);
        }
        await updateAllSentinelStatusPanels();
        await processExpiredTemporaryBans();
    } catch (error) {
        console.error('Erreur synchronisation serveur Sentinel :', error);
    }

    setInterval(updateAllSentinelStatusPanels, 5 * 60 * 1000);
    setInterval(processExpiredTemporaryBans, 60 * 1000);
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
    saveDiscordUserProfile(interaction.user);

    if (interaction.isButton()) {
        console.log(`Bouton Discord recu : ${interaction.customId} par ${interaction.user.tag} (${interaction.user.id})`);
    }

    if (
        interaction.isButton()
        && interaction.customId.startsWith('sentinel_language:')
        && interaction.inGuild()
    ) {
        return handleSentinelButton(interaction, handleSentinelLanguageButton);
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

    let auditStatus = 'success';
    let auditSummary = null;

    try {
    if (interaction.isChatInputCommand()) {
        const guildId = interaction.guild.id;
        const language = getGuildLanguage(guildId);
        const commandName = resolveCommandName(interaction.commandName);

        if (commandName === 'aide') {
            return interaction.reply({
                embeds: [buildHelpEmbed(interaction.guild, interaction.user)],
                components: buildHelpMenuComponents(interaction.guild, interaction.user),
                flags: MessageFlags.Ephemeral
            });
        }

        if (isAdvancedCommand(commandName) && !isAdvancedGuild(guildId)) {
            return interaction.reply({
                content: getAdvancedUnavailableMessage(language, commandName),
                flags: MessageFlags.Ephemeral
            });
        }

        if (await handleCustomEmbedInteraction(interaction, commandName, language)) {
            return;
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

        if (commandName === 'sync-sentinel') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const embed = await runSentinelServerSync(interaction.guild, interaction.user);

                return interaction.editReply({ embeds: [embed] });
            } catch (error) {
                console.error('Erreur sync-sentinel :', error);

                return interaction.editReply('Impossible de synchroniser la structure Sentinel pour le moment.');
            }
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
            const embed = buildTopServiceEmbed(interaction.user, classement, {
                isReferenceServer: isAdvancedGuild(guildId)
            });

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
            const userId = member?.id || normalizeUserId(interaction.options.getString('utilisateur_id'));

            if (!userId) {
                const hasRawUserId = Boolean(String(interaction.options.getString('utilisateur_id') || '').trim());

                return interaction.reply({
                    content: t(language, hasRawUserId ? 'invalidUserId' : 'resetTargetRequired'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!hasUserRecord(guildId, userId)) {
                return interaction.reply({
                    content: t(language, 'resetUserNoRecord', {
                        target: formatResetTarget(member, userId, language)
                    }),
                    flags: MessageFlags.Ephemeral
                });
            }

            resetUser(guildId, userId);

            return interaction.reply({
                content: t(language, 'resetUser', {
                    member: formatResetTarget(member, userId, language)
                }),
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

    if (interaction.isStringSelectMenu()) {
        const handled = await handleHelpMenuInteraction(interaction);

        if (handled) {
            return;
        }
    }

    if (!interaction.isButton()) return;

    const buttonLanguage = getGuildLanguage(interaction.guild.id);

    if (interaction.customId.startsWith('set_language:')) {
        if (!hasCommandRoleAccess(interaction.member)) {
            return interaction.reply({
                content: getCommandRoleAccessDeniedMessage(buttonLanguage),
                flags: MessageFlags.Ephemeral
            });
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
        return handleSentinelButton(interaction, handleSentinelSelfRoleButton);
    }

    if (interaction.customId === 'sentinel_ticket:create') {
        return handleSentinelButton(interaction, handleSentinelTicketButton);
    }

    if (interaction.customId === 'sentinel_ticket:bug') {
        return handleSentinelButton(interaction, handleSentinelTicketButton);
    }

    if (interaction.customId === 'sentinel_ticket:close') {
        return handleSentinelButton(interaction, handleSentinelTicketCloseButton);
    }

    if (interaction.customId.startsWith('sentinel_vote:')) {
        return handleSentinelButton(interaction, handleSentinelVoteButton);
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
        auditStatus = 'failed';
        auditSummary = error.message || 'Erreur Discord Sentinel.';
        console.error('Erreur interaction service :', error);

        if (!interaction.replied) {
            return interaction.reply({
                content: t(buttonLanguage, 'serviceError'),
                flags: MessageFlags.Ephemeral
            });
        }
    }
    } catch (error) {
        auditStatus = 'failed';
        auditSummary = error.message || 'Erreur Discord Sentinel.';
        throw error;
    } finally {
        recordDiscordInteractionAudit(interaction, {
            status: auditStatus,
            summary: auditSummary
        });
    }
});

client.on(Events.MessageDelete, async message => {
    if (!message.guild || message.author?.bot) {
        return;
    }

    const content = message.content
        ? message.content.replace(/\s+/g, ' ').slice(0, 400)
        : 'Contenu indisponible';

    await sendSentinelStaffLog(
        message.guild,
        [
            `🧹 Message supprime dans ${message.channel || 'un salon inconnu'}.`,
            `Auteur : ${message.author ? `${message.author.tag} (${message.author.id})` : 'inconnu'}`,
            `Contenu : ${content}`
        ].join('\n')
    );
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    saveDiscordUserProfile(message.author);
    if (!message.guild) return;

    const guildId = message.guild.id;
    let language = getGuildLanguage(guildId);
    const content = message.content.trim();
    let auditStatus = 'success';
    let auditSummary = null;

    try {
    if (/^!sentinel-build$/i.test(content)) {
        return message.reply(`Build Sentinel actif : \`${SENTINEL_BUILD}\``);
    }

    if (/^!(fr|en)$/i.test(content)) {
        const nextLanguage = /^!fr$/i.test(content) ? 'fr' : 'en';

        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        language = setGuildLanguage(guildId, nextLanguage);

        return message.reply(t(language, language === 'en' ? 'languageSetEn' : 'languageSet'));
    }

    if (/^!(aide|help)$/i.test(content)) {
        return message.reply({
            embeds: [buildHelpEmbed(message.guild, message.author)],
            components: buildHelpMenuComponents(message.guild, message.author)
        });
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

    if (/^!(reset-heures-all|reset-hours-all)$/i.test(content) && !isAdvancedGuild(guildId)) {
        return message.reply(getAdvancedUnavailableMessage(language, 'reset-heures-all'));
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

    if (content === '!sync-sentinel') {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const pendingMessage = await message.reply('Synchronisation Sentinel en cours...');

        try {
            const embed = await runSentinelServerSync(message.guild, message.author);

            return pendingMessage.edit({ content: null, embeds: [embed] });
        } catch (error) {
            console.error('Erreur sync-sentinel texte :', error);

            return pendingMessage.edit('Impossible de synchroniser la structure Sentinel pour le moment.');
        }
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
        const embed = buildTopServiceEmbed(message.author, classement, {
            isReferenceServer: isAdvancedGuild(guildId)
        });

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
        const rawTarget = content.replace(/^!(reset-heures|reset-hours)\s*/i, '').trim();
        const userId = member?.id || normalizeUserId(rawTarget);

        if (!userId) {
            return message.reply(language === 'en'
                ? '❌ Mention a member or provide a Discord ID. Example: `!reset-hours 123456789012345678`'
                : '❌ Mentionne un membre ou indique son ID Discord. Exemple : `!reset-heures 123456789012345678`');
        }

        const resolvedMember = member || await fetchMemberSafely(message.guild, userId);

        if (!hasUserRecord(guildId, userId)) {
            return message.reply(t(language, 'resetUserNoRecord', {
                target: formatResetTarget(resolvedMember, userId, language)
            }));
        }

        resetUser(guildId, userId);

        return message.reply(t(language, 'resetUser', {
            member: formatResetTarget(resolvedMember, userId, language)
        }));
    }
    } catch (error) {
        auditStatus = 'failed';
        auditSummary = error.message || 'Erreur commande texte Sentinel.';
        throw error;
    } finally {
        recordDiscordTextAudit(message, {
            status: auditStatus,
            summary: auditSummary
        });
    }
});

client.login(process.env.TOKEN);

