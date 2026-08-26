require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    AttachmentBuilder,
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
const DEBUG_INTERACTIONS = String(process.env.DEBUG_INTERACTIONS || '').toLowerCase() === 'true';
const FREE_HISTORY_LIMIT = 5;
const FREE_TOP_LIMIT = 10;
const FREE_CUSTOM_EMBED_LIMIT = 2;
const FREE_DOSSIER_PANEL_LIMIT = 1;
const FREE_OPEN_DOSSIER_LIMIT = 5;
const FREE_DOSSIER_HISTORY_LIMIT = 10;
const DOSSIER_PANEL_CLICK_COOLDOWN_MS = 8 * 1000;
const DOSSIER_CREATE_COOLDOWN_MS = 90 * 1000;
const BUTTON_ACTION_COOLDOWN_MS = 3 * 1000;
const SENSITIVE_CONFIRM_TIMEOUT_MS = 2 * 60 * 1000;
const LONG_SERVICE_ALERT_HOURS = Math.max(Number.parseInt(process.env.LONG_SERVICE_ALERT_HOURS || '8', 10), 1);
const LONG_SERVICE_ALERT_MS = LONG_SERVICE_ALERT_HOURS * 60 * 60 * 1000;
const LONG_SERVICE_ALERT_INTERVAL_MS = Math.max(
    Number.parseInt(process.env.LONG_SERVICE_ALERT_INTERVAL_MINUTES || '10', 10),
    2
) * 60 * 1000;
const DEFAULT_PAY_CURRENCY = '$';
const MAX_PAY_RATE = 100000000;
const PAY_ADJUSTMENT_TYPES = new Set(['bonus', 'deduction', 'correction']);
const REFERENCE_HISTORY_LIMIT = 100;
const REFERENCE_TOP_LIMIT = 25;
const REFERENCE_DOSSIER_HISTORY_LIMIT = 100;
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
    'slowmode',
    'paie-ajustement',
    'payroll-adjustment'
]);
const ADVANCED_TEXT_COMMANDS = [
    /^!(heures|hours)(?:\s|$)/i,
    /^!(top-semaine|top-week)$/i,
    /^!ping$/i,
    /^!diagnostic$/i,
    /^!sync-service$/i,
    /^!sync-sentinel$/i,
    /^!(reset-heures-all|reset-hours-all)$/i,
    /^!(resume-service|summary)$/i,
    /^!(paie-ajustement|payroll-adjustment)\b/i
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
const SENTINEL_BUILD = 'community-suite-2026-08-25-dashboard-guidance-v5';
const DEFAULT_DASHBOARD_URL = 'https://bot-service-discord-production.up.railway.app';
const DEFAULT_PUBLIC_SITE_URL = 'https://phileaszer.github.io/bot-service-discord/';
const SUPPORT_SERVER_URL = 'https://discord.gg/jzPqcUdVns';
const PREMIUM_SERVER_GOAL = Number.parseInt(process.env.PREMIUM_SERVER_GOAL || '50', 10);
const DATABASE_FILE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database', 'service.db');
const DATABASE_BACKUP_ENABLED = String(process.env.DATABASE_BACKUP_ENABLED || 'true').toLowerCase() !== 'false';
const DATABASE_BACKUP_INTERVAL_MS = Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_INTERVAL_HOURS || '24', 10),
    1
) * 60 * 60 * 1000;
const DATABASE_BACKUP_KEEP = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_KEEP || '14', 10), 1);
const DATABASE_BACKUP_DIR = process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(DATABASE_FILE_PATH), 'backups');
let lastSentinelServerSync = null;
let lastSentinelServerSyncResult = null;
let lastDatabaseBackup = null;
let lastSlashCommandCheck = {
    status: 'pending',
    checkedAt: null,
    globalCount: null,
    guildCount: null,
    error: null
};
let databaseBackupTimer = null;

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
        autoRoleSet: '✅ Le rôle automatique d’arrivée a été configuré sur {role}. Les nouveaux membres le recevront automatiquement.',
        autoRoleDisabled: '✅ Le rôle automatique d’arrivée est désactivé sur ce serveur.',
        autoRoleCurrent: 'Rôle automatique d’arrivée : {role}',
        autoRoleNotManageable: '❌ Sentinel ne peut pas donner ce rôle. Vérifie que Sentinel a `Gérer les rôles` et que son rôle Discord est placé au-dessus de {role}.',
        autoRoleManagedDenied: '❌ Ce rôle est géré par une intégration Discord et ne peut pas être donné automatiquement.',
        autoRoleAssignedLog: '🛡️ Rôle automatique donné à {member} : {role}.',
        autoRoleFailedLog: '⚠️ Impossible de donner le rôle automatique à {member} : {role}. Vérifie la permission `Gérer les rôles` et la hiérarchie des rôles.',
        invalidChannelId: '❌ ID de salon invalide.',
        channelNotText: '❌ Aucun salon textuel accessible ne correspond à cet ID.',
        logChannelSet: '✅ Le salon de logs a été configuré sur {channel}.',
        payRateInvalid: '❌ Montant horaire invalide. Exemple : `/config-paie montant:500 devise:$`.',
        paySettingsUpdated: '✅ Paie RP configurée : **{rate}** par heure.',
        payRoleSettingsUpdated: '✅ Taux Premium configuré pour {role} : **{rate}** par heure.',
        payRoleSettingsRemoved: '✅ Le taux spécifique de {role} a été retiré. Sentinel utilisera le taux global si aucun autre rôle ne correspond.',
        payAdjustmentInvalid: '❌ Ajustement invalide. Indique un membre, un type, un montant positif et une raison courte.',
        payAdjustmentAdded: '✅ Ajustement ajouté pour {member} : **{amount}** ({type}).',
        payrollArchived: '✅ Paie RP archivée pour la semaine **{weekStart} → {weekEnd}**. Total : **{amount}**.',
        payrollWeekInvalid: '❌ Semaine invalide. Utilise le format `AAAA-MM-JJ`, par exemple `2026-08-17`.',
        payrollMarkTargetRequired: '❌ Choisis un membre ou indique son ID Discord pour marquer la paie.',
        payrollMarkNoLine: '❌ Aucune ligne de paie trouvée pour {target} sur cette semaine.',
        payrollMarked: '✅ Paie de {target} marquée **{status}** pour la semaine **{weekStart} → {weekEnd}**. Montant : **{amount}**.',
        payrollPaidStatus: 'payée',
        payrollUnpaidStatus: 'non payée',
        payrollEmpty: '📄 Aucune heure de service enregistrée sur la semaine en cours.',
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
        buttonCooldown: '⏳ Action déjà en cours. Réessaie dans **{time}**.',
        confirmationTitle: '⚠️ Confirmation Sentinel',
        confirmationBody: '**Action :** {action}\n**Cible :** {target}\n{details}\n\nConfirme seulement si tout est correct. Cette confirmation expire dans 2 minutes.',
        confirmationNotForYou: '❌ Cette confirmation ne t’est pas destinée.',
        confirmationExpired: '⏳ Confirmation expirée. Relance la commande si nécessaire.',
        confirmationCancelled: '✅ Action annulée.',
        confirmPurge: 'Purge de messages',
        confirmBan: 'Bannissement',
        confirmKick: 'Expulsion',
        confirmResetUser: 'Réinitialisation des heures',
        confirmDossierClose: 'Clôture du dossier',
        serviceLogStartTitle: 'Sentinel | Prise de service',
        serviceLogEndTitle: 'Sentinel | Fin de service',
        serviceLogLongTitle: 'Sentinel | Service prolongé',
        serviceLogLongDescription: '{member} est en service depuis **{duration}**.',
        serviceLogLongHint: 'Pense à vérifier si ce service est volontaire ou si la personne a oublié de quitter.',
        serviceLogTarget: 'Agent',
        serviceLogSource: 'Source',
        serviceLogDuration: 'Durée',
        serviceLogTotal: 'Total',
        serviceLogStartedAt: 'Début',
        serviceLogSourceDiscord: 'Discord',
        serviceLogSourceDashboard: 'Dashboard',
        staffLogTitle: 'Sentinel | Journal',
        helpTitle: 'Sentinel | Guide de démarrage',
        helpDescription: 'Commence ici. Ce guide explique comment installer Sentinel, choisir la langue du serveur, le configurer, puis l utiliser sans connaitre les bots Discord.',
        moderationAccessDenied: '❌ Tu n’as pas accès à cette commande de modération.',
        moderationBotPermissionMissing: '❌ Sentinel n’a pas la permission Discord nécessaire pour faire cette action.\nOuvre le dashboard > Sécurité > Diagnostic, ou ajoute la permission manquante au rôle Sentinel.',
        moderationMemberRequired: '❌ Tu dois choisir un membre du serveur.',
        moderationUserRequired: '❌ Tu dois choisir un utilisateur.',
        moderationTargetRequired: '❌ Choisis un membre ou indique son ID Discord.',
        moderationReasonDefault: 'Aucune raison indiquée.',
        moderationDurationInvalid: '❌ Durée invalide. Exemples valides : `10m`, `2h`, `7d`.',
        moderationDurationTooLong: '❌ Discord limite les timeouts à 28 jours maximum.',
        moderationSelfDenied: '❌ Tu ne peux pas te modérer toi-même avec Sentinel.',
        moderationOwnerDenied: '❌ Sentinel ne peut pas modérer le propriétaire du serveur.',
        moderationBotDenied: '❌ Sentinel ne peut pas modérer cet utilisateur.',
        moderationHierarchyDenied: '❌ Le rôle de cette personne est trop haut dans la hiérarchie Discord.\nMonte le rôle Sentinel au-dessus du rôle de cette personne, puis réessaie.',
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
        moderationFailed: '❌ L’action de modération a échoué.\nVérifie que Sentinel a la bonne permission Discord et que son rôle est placé au-dessus de la cible. Tu peux aussi lancer `/diagnostic`.',
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
        customEmbedNotFound: '❌ Aucun embed Sentinel géré ne correspond à cet ID.',
        customEmbedNoEditFields: '❌ Indique au moins un champ à modifier : titre, message, couleur, image, miniature ou footer.',
        customEmbedQuotaFree: 'Quota gratuit : **{used}/{limit}** embeds actifs utilisés. Restant : **{remaining}**.',
        customEmbedQuotaUnlimited: 'Quota Premium : accès illimité aux embeds.',
        dossierPanelTitle: 'Sentinel | Bureau d’accueil',
        dossierPanelDescription: 'Dans Sentinel, un dossier est un ticket privé : chaque demande ouvre un salon dédié avec le membre et l’équipe autorisée.\n\nChoisis le type de dossier à ouvrir. Sentinel demandera le sujet avant de créer le salon.',
        dossierSupportLabel: 'Support',
        dossierReportLabel: 'Signalement',
        dossierRecruitmentLabel: 'Recrutement',
        dossierPartnershipLabel: 'Partenariat',
        dossierOtherLabel: 'Autre',
        dossierModalTitle: 'Ouvrir un dossier',
        dossierModalSubject: 'Sujet',
        dossierModalSubjectPlaceholder: 'Exemple : Besoin d’aide pour configurer Sentinel',
        dossierModalDescription: 'Description',
        dossierModalDescriptionPlaceholder: 'Explique ta demande avec les détails utiles.',
        dossierOpenedTitle: 'Sentinel | Dossier ouvert',
        dossierAlreadyOpen: 'Tu as déjà un dossier ouvert : {channel}',
        dossierCooldown: '⏳ Attends encore **{time}** avant d’ouvrir un nouveau dossier.',
        dossierPanelCooldown: '⏳ Le panneau vient déjà d’être utilisé. Réessaie dans **{time}**.',
        dossierPanelLimitReached: '⭐ La version gratuite permet **{limit}** panneau de dossiers par serveur. Tu peux garder ce panneau, ou passer Premium pour publier plusieurs bureaux d’accueil.',
        dossierOpenLimitReached: '⭐ Ce serveur a déjà **{limit}** dossiers ouverts. Ferme un dossier terminé, ou passe Premium pour ouvrir plus de dossiers en même temps.',
        dossierCreated: 'Dossier créé : {channel}',
        dossierNotInDossier: 'Ce bouton doit être utilisé dans un dossier Sentinel.',
        dossierCloseDenied: 'Seul le demandeur ou un membre autorisé peut clôturer ce dossier.',
        dossierClosed: 'Dossier clôturé. Le compte rendu a été envoyé, puis le salon va être fermé.',
        dossierClaimed: 'Dossier pris en charge par {member}.',
        dossierClaimDenied: 'Tu dois avoir un rôle autorisé pour prendre en charge ce dossier.',
        dossierClaimPremiumOnly: '⭐ Les options Premium des dossiers concernent surtout les volumes, les formulaires, les priorités et les automatisations.',
        dossierStatusDenied: 'Tu dois avoir un rôle autorisé pour modifier le statut du dossier.',
        dossierStatusPremiumOnly: '⭐ Les options Premium des dossiers concernent surtout les volumes, les formulaires, les priorités et les automatisations.',
        dossierStatusUpdated: 'Statut du dossier mis à jour : **{status}**.',
        dossierRoleAdded: '✅ {role} peut maintenant prendre en charge et gérer les dossiers Sentinel.',
        dossierRoleRemoved: '✅ {role} ne peut plus prendre en charge les dossiers Sentinel.',
        dossierRoleList: 'Rôles de dossiers Sentinel :\n{roles}',
        dossierRoleListEmpty: 'Aucun rôle de dossiers configuré. Les rôles autorisés à gérer Sentinel et les membres avec les permissions Discord adaptées peuvent gérer les dossiers.',
        dossierAddDone: '✅ {member} a été ajouté comme intervenant du dossier.',
        dossierRemoveDone: '✅ {member} a été retiré du dossier.',
        dossierCommandOutside: '❌ Cette commande doit être utilisée dans un salon de dossier Sentinel.',
        dossierTranscriptDone: '✅ Compte rendu généré.',
        dossierPanelPublished: '✅ Bureau d’accueil Sentinel publié dans {channel}.'
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
        autoRoleSet: '✅ The join auto-role has been set to {role}. New members will receive it automatically.',
        autoRoleDisabled: '✅ The join auto-role is disabled on this server.',
        autoRoleCurrent: 'Join auto-role: {role}',
        autoRoleNotManageable: '❌ Sentinel cannot assign this role. Make sure Sentinel has `Manage Roles` and its Discord role is above {role}.',
        autoRoleManagedDenied: '❌ This role is managed by a Discord integration and cannot be assigned automatically.',
        autoRoleAssignedLog: '🛡️ Auto-role assigned to {member}: {role}.',
        autoRoleFailedLog: '⚠️ Could not assign the auto-role to {member}: {role}. Check `Manage Roles` and the role hierarchy.',
        invalidChannelId: '❌ Invalid channel ID.',
        channelNotText: '❌ No accessible text channel matches this ID.',
        logChannelSet: '✅ The log channel has been set to {channel}.',
        payRateInvalid: '❌ Invalid hourly amount. Example: `/payroll-config hourly_rate:500 currency:$`.',
        paySettingsUpdated: '✅ RP payroll configured: **{rate}** per hour.',
        payRoleSettingsUpdated: '✅ Premium rate configured for {role}: **{rate}** per hour.',
        payRoleSettingsRemoved: '✅ The specific rate for {role} has been removed. Sentinel will use the global rate if no other role matches.',
        payAdjustmentInvalid: '❌ Invalid adjustment. Provide a member, type, positive amount, and short reason.',
        payAdjustmentAdded: '✅ Adjustment added for {member}: **{amount}** ({type}).',
        payrollArchived: '✅ RP payroll archived for **{weekStart} → {weekEnd}**. Total: **{amount}**.',
        payrollWeekInvalid: '❌ Invalid week. Use the `YYYY-MM-DD` format, for example `2026-08-17`.',
        payrollMarkTargetRequired: '❌ Choose a member or provide their Discord ID to mark payroll.',
        payrollMarkNoLine: '❌ No payroll line found for {target} this week.',
        payrollMarked: '✅ Payroll for {target} marked **{status}** for **{weekStart} → {weekEnd}**. Amount: **{amount}**.',
        payrollPaidStatus: 'paid',
        payrollUnpaidStatus: 'unpaid',
        payrollEmpty: '📄 No service time recorded for the current week.',
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
        buttonCooldown: '⏳ Action already running. Try again in **{time}**.',
        confirmationTitle: '⚠️ Sentinel confirmation',
        confirmationBody: '**Action:** {action}\n**Target:** {target}\n{details}\n\nConfirm only if everything is correct. This confirmation expires in 2 minutes.',
        confirmationNotForYou: '❌ This confirmation is not for you.',
        confirmationExpired: '⏳ Confirmation expired. Run the command again if needed.',
        confirmationCancelled: '✅ Action cancelled.',
        confirmPurge: 'Message purge',
        confirmBan: 'Ban',
        confirmKick: 'Kick',
        confirmResetUser: 'Hours reset',
        confirmDossierClose: 'Dossier closure',
        serviceLogStartTitle: 'Sentinel | Service started',
        serviceLogEndTitle: 'Sentinel | Service ended',
        serviceLogLongTitle: 'Sentinel | Long service',
        serviceLogLongDescription: '{member} has been on duty for **{duration}**.',
        serviceLogLongHint: 'Check whether this service is intentional or if the person forgot to end it.',
        serviceLogTarget: 'Agent',
        serviceLogSource: 'Source',
        serviceLogDuration: 'Duration',
        serviceLogTotal: 'Total',
        serviceLogStartedAt: 'Started',
        serviceLogSourceDiscord: 'Discord',
        serviceLogSourceDashboard: 'Dashboard',
        staffLogTitle: 'Sentinel | Log',
        helpTitle: 'Sentinel | Getting started',
        helpDescription: 'Start here. This guide explains how to install Sentinel, choose the server language, configure it, and use it without knowing Discord bots.',
        moderationAccessDenied: '❌ You do not have access to this moderation command.',
        moderationBotPermissionMissing: '❌ Sentinel does not have the required Discord permission for this action.\nOpen Dashboard > Security > Diagnostic, or add the missing permission to Sentinel role.',
        moderationMemberRequired: '❌ You must choose a server member.',
        moderationUserRequired: '❌ You must choose a user.',
        moderationTargetRequired: '❌ Choose a member or provide their Discord ID.',
        moderationReasonDefault: 'No reason provided.',
        moderationDurationInvalid: '❌ Invalid duration. Valid examples: `10m`, `2h`, `7d`.',
        moderationDurationTooLong: '❌ Discord limits timeouts to 28 days maximum.',
        moderationSelfDenied: '❌ You cannot moderate yourself with Sentinel.',
        moderationOwnerDenied: '❌ Sentinel cannot moderate the server owner.',
        moderationBotDenied: '❌ Sentinel cannot moderate this user.',
        moderationHierarchyDenied: '❌ This person role is too high in the Discord hierarchy.\nMove Sentinel role above this person role, then try again.',
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
        moderationFailed: '❌ Moderation action failed.\nCheck that Sentinel has the right Discord permission and that its role is above the target. You can also run `/diagnostic`.',
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
        customEmbedNotFound: '❌ No managed Sentinel embed matches this ID.',
        customEmbedNoEditFields: '❌ Provide at least one field to edit: title, message, color, image, thumbnail, or footer.',
        customEmbedQuotaFree: 'Free quota: **{used}/{limit}** active embeds used. Remaining: **{remaining}**.',
        customEmbedQuotaUnlimited: 'Premium quota: unlimited embed access.',
        dossierPanelTitle: 'Sentinel | Reception desk',
        dossierPanelDescription: 'In Sentinel, a dossier is a private ticket: each request opens a dedicated channel with the member and the authorized team.\n\nChoose the dossier type to open. Sentinel will ask for the subject before creating the channel.',
        dossierSupportLabel: 'Support',
        dossierReportLabel: 'Report',
        dossierRecruitmentLabel: 'Recruitment',
        dossierPartnershipLabel: 'Partnership',
        dossierOtherLabel: 'Other',
        dossierModalTitle: 'Open a dossier',
        dossierModalSubject: 'Subject',
        dossierModalSubjectPlaceholder: 'Example: Need help configuring Sentinel',
        dossierModalDescription: 'Description',
        dossierModalDescriptionPlaceholder: 'Explain your request with useful details.',
        dossierOpenedTitle: 'Sentinel | Dossier opened',
        dossierAlreadyOpen: 'You already have an open dossier: {channel}',
        dossierCooldown: '⏳ Wait another **{time}** before opening a new dossier.',
        dossierPanelCooldown: '⏳ This panel was just used. Try again in **{time}**.',
        dossierPanelLimitReached: '⭐ The free version allows **{limit}** dossier panel per server. Keep this panel, or upgrade to Premium to publish multiple reception desks.',
        dossierOpenLimitReached: '⭐ This server already has **{limit}** open dossiers. Close a completed dossier, or upgrade to Premium to keep more dossiers open at once.',
        dossierCreated: 'Dossier created: {channel}',
        dossierNotInDossier: 'This button must be used inside a Sentinel dossier.',
        dossierCloseDenied: 'Only the requester or an authorized member can close this dossier.',
        dossierClosed: 'Dossier closed. The transcript has been sent, then the channel will be closed.',
        dossierClaimed: 'Dossier taken over by {member}.',
        dossierClaimDenied: 'You need an authorized role to take over this dossier.',
        dossierClaimPremiumOnly: '⭐ Premium dossier options mainly cover volume, forms, priorities, and automations.',
        dossierStatusDenied: 'You need an authorized role to update this dossier status.',
        dossierStatusPremiumOnly: '⭐ Premium dossier options mainly cover volume, forms, priorities, and automations.',
        dossierStatusUpdated: 'Dossier status updated: **{status}**.',
        dossierRoleAdded: '✅ {role} can now take over and manage Sentinel dossiers.',
        dossierRoleRemoved: '✅ {role} can no longer take over Sentinel dossiers.',
        dossierRoleList: 'Sentinel dossier roles:\n{roles}',
        dossierRoleListEmpty: 'No dossier role configured. Roles allowed to manage Sentinel and members with suitable Discord permissions can manage dossiers.',
        dossierAddDone: '✅ {member} has been added as a dossier participant.',
        dossierRemoveDone: '✅ {member} has been removed from this dossier.',
        dossierCommandOutside: '❌ This command must be used inside a Sentinel dossier channel.',
        dossierTranscriptDone: '✅ Transcript generated.',
        dossierPanelPublished: '✅ Sentinel reception desk published in {channel}.'
    }
};

const BOT_INVITE_PERMISSIONS = '1099780189206';

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
        dashboard: 'dashboard',
        premium: 'premium',
        support: 'support',
        'config-langue': 'config-langue',
        language: 'config-langue',
        'config-role': 'config-role',
        'config-autorole': 'config-autorole',
        'autorole-config': 'config-autorole',
        'config-logs': 'config-logs',
        'config-channel': 'config-logs',
        'config-paie': 'config-paie',
        'payroll-config': 'config-paie',
        'paie-ajustement': 'paie-ajustement',
        'payroll-adjustment': 'paie-ajustement',
        'paie-archive': 'paie-archive',
        'payroll-archive': 'paie-archive',
        'paie-marquer': 'paie-marquer',
        'payroll-mark': 'paie-marquer',
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
        'paie-semaine': 'paie-semaine',
        'weekly-payroll': 'paie-semaine',
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
        embed: 'embed',
        'dossier-panel': 'dossier-panel',
        'ticket-panel': 'dossier-panel',
        'dossier-fermer': 'dossier-fermer',
        'close-ticket': 'dossier-fermer',
        'dossier-ajouter': 'dossier-ajouter',
        'ticket-add': 'dossier-ajouter',
        'dossier-retirer': 'dossier-retirer',
        'ticket-remove': 'dossier-retirer',
        'dossier-compte-rendu': 'dossier-compte-rendu',
        'ticket-transcript': 'dossier-compte-rendu',
        'dossier-roles': 'dossier-roles',
        'ticket-roles': 'dossier-roles',
        'dossier-prendre': 'dossier-prendre',
        'ticket-claim': 'dossier-prendre',
        'dossier-statut': 'dossier-statut',
        'ticket-status': 'dossier-statut'
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

function getDashboardUrl(pathname = '/dashboard') {
    const baseUrl = String(process.env.DASHBOARD_URL || DEFAULT_DASHBOARD_URL).replace(/\/$/, '');
    const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

    return `${baseUrl}${cleanPath}`;
}

function getPublicSiteUrl(pathname = '') {
    const baseUrl = String(process.env.PUBLIC_SITE_URL || DEFAULT_PUBLIC_SITE_URL).replace(/\/$/, '');
    const cleanPath = String(pathname || '').replace(/^\/+/, '');

    return cleanPath ? `${baseUrl}/${cleanPath}` : `${baseUrl}/`;
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

function buildDashboardEmbed(guild, requester) {
    const language = getGuildLanguage(guild.id);
    const dashboardUrl = getDashboardUrl('/dashboard');
    const isEnglish = language === 'en';

    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: isEnglish ? 'Sentinel | Dashboard' : 'Sentinel | Dashboard',
        description: isEnglish
            ? [
                'Open the web dashboard to manage Sentinel from your browser.',
                '',
                '`1.` Log in with Discord.',
                '`2.` Choose the server.',
                '`3.` Configure service, logs, embeds, moderation, and audit from one place.',
                '',
                dashboardUrl
            ].join('\n')
            : [
                'Ouvre le dashboard web pour gérer Sentinel depuis ton navigateur.',
                '',
                '`1.` Connecte-toi avec Discord.',
                '`2.` Choisis le serveur.',
                '`3.` Configure le service, les logs, les embeds, la modération et l’historique au même endroit.',
                '',
                dashboardUrl
            ].join('\n'),
        requester,
        thumbnail: guild.iconURL(),
        language
    });
}

function buildDashboardComponents(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Open dashboard' : 'Ouvrir le dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(getDashboardUrl('/dashboard'))
        )
    ];
}

function buildPremiumEmbed(guild, requester, member = null) {
    const language = getGuildLanguage(guild.id);
    const guildCount = client.guilds.cache.size || 0;
    const remaining = Math.max(PREMIUM_SERVER_GOAL - guildCount, 0);
    const progressPercent = PREMIUM_SERVER_GOAL > 0
        ? Math.min(Math.round((guildCount / PREMIUM_SERVER_GOAL) * 100), 100)
        : 0;
    const hasReferenceAccess = hasAdvancedAccess(member, guild.id);

    const embed = createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: language === 'en' ? 'Sentinel | Premium' : 'Sentinel | Premium',
        description: language === 'en'
            ? [
                'Sentinel Premium is not publicly open yet.',
                `It will become available when Sentinel reaches **${PREMIUM_SERVER_GOAL} servers**.`,
                '',
                hasReferenceAccess
                    ? 'This server already has reference access to the advanced tools.'
                    : 'Until then, the free version keeps the essential service, moderation, embeds and ticket features.'
            ].join('\n')
            : [
                'Sentinel Premium n’est pas encore ouvert publiquement.',
                `Il deviendra disponible quand Sentinel aura atteint **${PREMIUM_SERVER_GOAL} serveurs**.`,
                '',
                hasReferenceAccess
                    ? 'Ce serveur dispose déjà de l’accès de référence aux outils avancés.'
                    : 'En attendant, le gratuit garde les bases utiles : service, modération, embeds et dossiers/tickets.'
            ].join('\n'),
        requester,
        thumbnail: guild.iconURL(),
        language
    });

    embed.addFields(
        {
            name: language === 'en' ? 'Current progress' : 'Progression actuelle',
            value: language === 'en'
                ? `**${guildCount}/${PREMIUM_SERVER_GOAL}** servers (${progressPercent}%).`
                : `**${guildCount}/${PREMIUM_SERVER_GOAL}** serveurs (${progressPercent}%).`,
            inline: true
        },
        {
            name: language === 'en' ? 'Remaining' : 'Restant',
            value: language === 'en'
                ? (remaining === 0 ? 'Goal reached.' : `${remaining} server(s).`)
                : (remaining === 0 ? 'Objectif atteint.' : `${remaining} serveur(s).`),
            inline: true
        },
        {
            name: language === 'en' ? 'Planned payroll benefits' : 'Paie Premium prévue',
            value: language === 'en'
                ? 'Role rates, bonuses, deductions, corrections, exports and more complete reports.'
                : 'Taux par rôle, primes, retenues, corrections, exports et rapports plus complets.',
            inline: false
        },
        {
            name: language === 'en' ? 'Where to follow it' : 'Où suivre ça',
            value: language === 'en'
                ? `[Premium page](${getPublicSiteUrl('premium.html')})\n[Sentinel status](${getPublicSiteUrl('statut.html')})`
                : `[Page Premium](${getPublicSiteUrl('premium.html')})\n[Statut Sentinel](${getPublicSiteUrl('statut.html')})`,
            inline: false
        }
    );

    return embed;
}

function buildPremiumComponents(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Premium page' : 'Page Premium')
                .setStyle(ButtonStyle.Link)
                .setURL(getPublicSiteUrl('premium.html')),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Status' : 'Statut')
                .setStyle(ButtonStyle.Link)
                .setURL(getPublicSiteUrl('statut.html'))
        )
    ];
}

function buildSupportEmbed(guild, requester) {
    const language = getGuildLanguage(guild.id);
    const dashboardUrl = getDashboardUrl('/dashboard');

    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: language === 'en' ? 'Sentinel | Support' : 'Sentinel | Support',
        description: language === 'en'
            ? [
                'Need help with setup, permissions, service tracking, moderation, embeds, or tickets?',
                'Use the support server for questions, bug reports and follow-up.'
            ].join('\n')
            : [
                'Besoin d’aide pour l’installation, les permissions, les services, la modération, les embeds ou les dossiers/tickets ?',
                'Le serveur support est là pour les questions, les bugs et les demandes qui doivent être suivies.'
            ].join('\n'),
        requester,
        thumbnail: guild.iconURL(),
        language
    }).addFields(
        {
            name: language === 'en' ? 'Useful links' : 'Liens utiles',
            value: language === 'en'
                ? `[Support server](${SUPPORT_SERVER_URL})\n[Official website](${getPublicSiteUrl()})\n[Dashboard](${dashboardUrl})\n[Status page](${getPublicSiteUrl('statut.html')})`
                : `[Serveur support](${SUPPORT_SERVER_URL})\n[Site officiel](${getPublicSiteUrl()})\n[Dashboard](${dashboardUrl})\n[Page statut](${getPublicSiteUrl('statut.html')})`,
            inline: false
        }
    );
}

function buildSupportComponents(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Support server' : 'Serveur support')
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Website' : 'Site officiel')
                .setStyle(ButtonStyle.Link)
                .setURL(getPublicSiteUrl()),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Dashboard' : 'Dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(getDashboardUrl('/dashboard')),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Status' : 'Statut')
                .setStyle(ButtonStyle.Link)
                .setURL(getPublicSiteUrl('statut.html'))
        )
    ];
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

function formatCooldownDuration(ms, language = 'fr') {
    const totalSeconds = Math.max(1, Math.ceil(ms / 1000));

    if (totalSeconds < 60) {
        return language === 'en' ? `${totalSeconds}s` : `${totalSeconds}s`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (seconds === 0) {
        return language === 'en' ? `${minutes} min` : `${minutes} min`;
    }

    return language === 'en'
        ? `${minutes} min ${seconds}s`
        : `${minutes} min ${seconds}s`;
}

function getCooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function getCooldownRemaining(cooldowns, guildId, userId) {
    const key = getCooldownKey(guildId, userId);
    const expiresAt = cooldowns.get(key) || 0;
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
        cooldowns.delete(key);
        return 0;
    }

    return remaining;
}

function setCooldown(cooldowns, guildId, userId, duration) {
    cooldowns.set(getCooldownKey(guildId, userId), Date.now() + duration);
}

function getButtonActionCooldownKey(interaction) {
    return [
        interaction.guildId || 'dm',
        interaction.channelId || 'no-channel',
        interaction.user?.id || 'anonymous',
        interaction.customId || 'button'
    ].join(':');
}

async function rejectDuplicateButtonAction(interaction, language = 'fr') {
    const key = getButtonActionCooldownKey(interaction);
    const expiresAt = buttonActionCooldowns.get(key) || 0;
    const remaining = expiresAt - Date.now();

    if (remaining > 0) {
        await interaction.reply({
            content: t(language, 'buttonCooldown', {
                time: formatCooldownDuration(remaining, language)
            }),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    buttonActionCooldowns.set(key, Date.now() + BUTTON_ACTION_COOLDOWN_MS);
    return false;
}

function cleanupSensitiveConfirmations() {
    const now = Date.now();

    for (const [token, confirmation] of pendingSensitiveConfirmations.entries()) {
        if (now - confirmation.createdAt > SENSITIVE_CONFIRM_TIMEOUT_MS) {
            pendingSensitiveConfirmations.delete(token);
        }
    }
}

function createConfirmationToken() {
    cleanupSensitiveConfirmations();
    return crypto.randomBytes(8).toString('hex');
}

function buildSensitiveConfirmationComponents(token, language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`sentinel_confirm:${token}:confirm`)
                .setLabel(t(language, 'confirm'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`sentinel_confirm:${token}:cancel`)
                .setLabel(t(language, 'cancel'))
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function formatConfirmationDetails(details = []) {
    const lines = Array.isArray(details) ? details.filter(Boolean) : [details].filter(Boolean);

    return lines.length > 0
        ? lines.map(line => `• ${line}`).join('\n')
        : '• Aucun détail supplémentaire.';
}

function parseSensitiveConfirmationId(customId) {
    const match = /^sentinel_confirm:([a-f0-9]{16}):(confirm|cancel)$/.exec(customId || '');

    if (!match) {
        return null;
    }

    return {
        token: match[1],
        action: match[2]
    };
}

async function requestSensitiveConfirmation(interaction, {
    action,
    actionLabel,
    targetLabel,
    details = [],
    payload = {},
    language = null
}) {
    const activeLanguage = language || getGuildLanguage(interaction.guild.id);
    const token = createConfirmationToken();
    const detailText = formatConfirmationDetails(details);

    pendingSensitiveConfirmations.set(token, {
        action,
        actionLabel,
        targetLabel,
        details: detailText,
        payload,
        guildId: interaction.guild.id,
        channelId: interaction.channelId,
        requesterId: interaction.user.id,
        createdAt: Date.now(),
        language: activeLanguage
    });

    const embed = createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: t(activeLanguage, 'confirmationTitle'),
        description: t(activeLanguage, 'confirmationBody', {
            action: actionLabel,
            target: targetLabel,
            details: detailText
        }),
        requester: interaction.user,
        thumbnail: interaction.guild.iconURL(),
        language: activeLanguage
    });

    return interaction.reply({
        embeds: [embed],
        components: buildSensitiveConfirmationComponents(token, activeLanguage),
        flags: MessageFlags.Ephemeral
    });
}

async function handleSensitiveConfirmationButton(interaction) {
    const parsed = parseSensitiveConfirmationId(interaction.customId);

    if (!parsed) {
        return false;
    }

    const language = interaction.inGuild() ? getGuildLanguage(interaction.guild.id) : 'fr';
    const confirmation = pendingSensitiveConfirmations.get(parsed.token);

    if (!confirmation) {
        await interaction.update({
            content: t(language, 'confirmationExpired'),
            embeds: [],
            components: []
        }).catch(() => {});
        return true;
    }

    if (interaction.user.id !== confirmation.requesterId) {
        await interaction.reply({
            content: t(confirmation.language, 'confirmationNotForYou'),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    if (Date.now() - confirmation.createdAt > SENSITIVE_CONFIRM_TIMEOUT_MS) {
        pendingSensitiveConfirmations.delete(parsed.token);
        await interaction.update({
            content: t(confirmation.language, 'confirmationExpired'),
            embeds: [],
            components: []
        }).catch(() => {});
        return true;
    }

    if (parsed.action === 'cancel') {
        pendingSensitiveConfirmations.delete(parsed.token);
        await interaction.update({
            content: t(confirmation.language, 'confirmationCancelled'),
            embeds: [],
            components: []
        }).catch(() => {});
        return true;
    }

    pendingSensitiveConfirmations.delete(parsed.token);

    await interaction.deferUpdate();

    try {
        const result = await executeSensitiveConfirmation(interaction, confirmation);

        await interaction.editReply({
            content: result,
            embeds: [],
            components: []
        });
    } catch (error) {
        console.error('Erreur confirmation Sentinel :', error);
        await interaction.editReply({
            content: error.message || t(confirmation.language, 'serviceError'),
            embeds: [],
            components: []
        }).catch(() => {});
    }

    return true;
}

function checkDatabase() {
    db.prepare('SELECT 1').get();
}

function getDatabaseBackupFilename(reason = 'auto') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const cleanReason = String(reason || 'auto')
        .replace(/[^a-z0-9_-]/gi, '-')
        .replace(/-+/g, '-')
        .slice(0, 32) || 'auto';

    return `service-${cleanReason}-${stamp}.db`;
}

function pruneDatabaseBackups() {
    if (!fs.existsSync(DATABASE_BACKUP_DIR)) {
        return;
    }

    const backups = listDatabaseBackups();

    for (const backup of backups.slice(DATABASE_BACKUP_KEEP)) {
        fs.unlinkSync(backup.fullPath);
    }
}

function listDatabaseBackups() {
    if (!fs.existsSync(DATABASE_BACKUP_DIR)) {
        return [];
    }

    return fs.readdirSync(DATABASE_BACKUP_DIR)
        .filter(fileName => /^service-.*\.db$/i.test(fileName))
        .map(fileName => {
            const fullPath = path.join(DATABASE_BACKUP_DIR, fileName);
            const stat = fs.statSync(fullPath);
            return {
                fileName,
                fullPath,
                sizeBytes: stat.size,
                createdAt: stat.mtime.toISOString(),
                mtimeMs: stat.mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function createDatabaseBackup(reason = 'auto') {
    fs.mkdirSync(DATABASE_BACKUP_DIR, { recursive: true });

    const backupPath = path.join(DATABASE_BACKUP_DIR, getDatabaseBackupFilename(reason));
    await db.backup(backupPath);
    pruneDatabaseBackups();
    lastDatabaseBackup = {
        createdAt: new Date().toISOString(),
        fileName: path.basename(backupPath),
        reason
    };

    return backupPath;
}

function startDatabaseBackupSchedule() {
    if (!DATABASE_BACKUP_ENABLED || databaseBackupTimer) {
        return;
    }

    createDatabaseBackup('startup')
        .then(backupPath => console.log(`Sauvegarde SQLite creee : ${backupPath}`))
        .catch(error => console.error('Erreur sauvegarde SQLite au demarrage :', error));

    databaseBackupTimer = setInterval(() => {
        createDatabaseBackup('auto')
            .then(backupPath => console.log(`Sauvegarde SQLite creee : ${backupPath}`))
            .catch(error => console.error('Erreur sauvegarde SQLite planifiee :', error));
    }, DATABASE_BACKUP_INTERVAL_MS);
}

function getDatabaseBackupStatus() {
    const backups = listDatabaseBackups();
    const latest = backups[0] || null;

    return {
        enabled: DATABASE_BACKUP_ENABLED,
        latestAt: lastDatabaseBackup?.createdAt || latest?.createdAt || null,
        latestFile: lastDatabaseBackup?.fileName || latest?.fileName || null,
        latestReason: lastDatabaseBackup?.reason || null,
        count: backups.length,
        keep: DATABASE_BACKUP_KEEP,
        intervalHours: Math.round(DATABASE_BACKUP_INTERVAL_MS / 60 / 60 / 1000)
    };
}

function getSentinelSyncStatus() {
    return {
        lastAt: lastSentinelServerSync ? new Date(lastSentinelServerSync).toISOString() : null,
        result: lastSentinelServerSyncResult || null
    };
}

async function refreshSlashCommandStatus() {
    const checkedAt = new Date().toISOString();

    try {
        const globalCommands = await client.application.commands.fetch();
        const advancedGuildId = getAdvancedGuildIds()[0] || null;
        const advancedGuild = advancedGuildId ? client.guilds.cache.get(advancedGuildId) : null;
        const guildCommands = advancedGuild ? await advancedGuild.commands.fetch().catch(() => null) : null;

        lastSlashCommandCheck = {
            status: 'ok',
            checkedAt,
            globalCount: globalCommands.size,
            guildCount: guildCommands ? guildCommands.size : null,
            guildId: advancedGuildId,
            error: null
        };
    } catch (error) {
        lastSlashCommandCheck = {
            status: 'error',
            checkedAt,
            globalCount: null,
            guildCount: null,
            guildId: getAdvancedGuildIds()[0] || null,
            error: error.message
        };
        console.error('Erreur verification commandes slash :', error);
    }

    return lastSlashCommandCheck;
}

function getSlashCommandStatus() {
    return lastSlashCommandCheck;
}

function getAdvancedGuildIds() {
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

function isAdvancedGuild(guildId) {
    return Boolean(guildId && getAdvancedGuildIds().includes(String(guildId)));
}

function getPremiumRoleGuildIds() {
    return [
        SENTINEL_REFERENCE_GUILD_ID
    ]
        .flatMap(value => String(value || '').split(','))
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value));
}

function normalizeRoleName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getPremiumRoleNames() {
    return [
        ...SENTINEL_STAFF_ROLES,
        process.env.SENTINEL_PREMIUM_ROLE_NAMES,
        process.env.PREMIUM_ROLE_NAMES
    ]
        .flatMap(value => String(value || '').split(','))
        .map(normalizeRoleName)
        .filter(Boolean);
}

function hasAdvancedAccess(member, guildId = null) {
    const resolvedGuildId = guildId || member?.guild?.id;

    return Boolean(resolvedGuildId && (
        isAdvancedGuild(resolvedGuildId)
        || hasSentinelStaffRole(member)
    ));
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
        autoRoleId: row?.auto_role_id || null,
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
        SELECT role_id, log_channel_id, auto_role_id, language
        FROM guild_configs
        WHERE guild_id = ?
    `).get(guildId);

    if (!row) {
        db.prepare(`
            INSERT INTO guild_configs (guild_id, role_id, log_channel_id, auto_role_id, language)
            VALUES (?, NULL, NULL, NULL, 'fr')
        `).run(guildId);

        row = {
            role_id: null,
            log_channel_id: null,
            auto_role_id: null,
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
        autoRoleId: Object.prototype.hasOwnProperty.call(newConfig, 'autoRoleId')
            ? newConfig.autoRoleId
            : currentConfig.autoRoleId,
        language: Object.prototype.hasOwnProperty.call(newConfig, 'language')
            ? normalizeLanguage(newConfig.language)
            : currentConfig.language
    };

    db.prepare(`
        UPDATE guild_configs
        SET role_id = ?, log_channel_id = ?, auto_role_id = ?, language = ?
        WHERE guild_id = ?
    `).run(nextConfig.serviceRoleId, nextConfig.logChannelId, nextConfig.autoRoleId, nextConfig.language, guildId);

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

function getDossierRoleIds(guildId) {
    return db.prepare(`
        SELECT role_id
        FROM sentinel_dossier_roles
        WHERE guild_id = ?
        ORDER BY role_id ASC
    `).all(guildId).map(row => row.role_id);
}

function addDossierRole(guildId, roleId) {
    db.prepare(`
        INSERT OR IGNORE INTO sentinel_dossier_roles (guild_id, role_id)
        VALUES (?, ?)
    `).run(guildId, roleId);
}

function removeDossierRole(guildId, roleId) {
    db.prepare(`
        DELETE FROM sentinel_dossier_roles
        WHERE guild_id = ? AND role_id = ?
    `).run(guildId, roleId);
}

function hasDossierRoleAccess(member) {
    if (!member) {
        return false;
    }

    return getDossierRoleIds(member.guild.id).some(roleId => member.roles.cache.has(roleId));
}

function hasSentinelStaffRole(member) {
    if (!member?.guild?.id || !getPremiumRoleGuildIds().includes(String(member.guild.id))) {
        return false;
    }

    const premiumRoleNames = new Set(getPremiumRoleNames());

    return member.roles.cache.some(role => premiumRoleNames.has(normalizeRoleName(role.name)));
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

    if (hasSentinelStaffRole(member)) {
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

function formatDossierRoleList(guildId, language = 'fr') {
    const roleIds = getDossierRoleIds(guildId);

    if (roleIds.length === 0) {
        return t(language, 'dossierRoleListEmpty');
    }

    return roleIds.map(roleId => `<@&${roleId}>`).join('\n');
}

const DOSSIER_TYPES = {
    support: {
        emoji: '📁',
        color: SENTINEL_COLORS.primary,
        fr: {
            label: 'Support',
            channelPrefix: 'dossier-support',
            intro: [
                'Explique ta demande clairement.',
                '',
                '- problème ou question',
                '- commande/fonction concernée',
                '- capture ou message d’erreur si disponible',
                '',
                'Un référent prendra le dossier dès que possible.'
            ]
        },
        en: {
            label: 'Support',
            channelPrefix: 'support-dossier',
            intro: [
                'Explain your request clearly.',
                '',
                '- issue or question',
                '- related command or feature',
                '- screenshot or error message if available',
                '',
                'A referent will take over the dossier as soon as possible.'
            ]
        }
    },
    report: {
        emoji: '🚨',
        color: SENTINEL_COLORS.danger,
        fr: {
            label: 'Signalement',
            channelPrefix: 'dossier-signalement',
            intro: [
                'Décris le signalement avec les éléments utiles.',
                '',
                '**Personne concernée :**',
                '**Ce qui s’est passé :**',
                '**Salon / moment :**',
                '**Preuve ou capture :**',
                '',
                'L’équipe autorisée traitera le dossier.'
            ]
        },
        en: {
            label: 'Report',
            channelPrefix: 'report-dossier',
            intro: [
                'Describe the report with useful details.',
                '',
                '**Concerned person:**',
                '**What happened:**',
                '**Channel / moment:**',
                '**Proof or screenshot:**',
                '',
                'The authorized team will handle the dossier.'
            ]
        }
    },
    recruitment: {
        emoji: '🧭',
        color: SENTINEL_COLORS.accent,
        fr: {
            label: 'Recrutement',
            channelPrefix: 'dossier-recrutement',
            intro: [
                'Présente ta candidature avec les informations utiles.',
                '',
                '**Nom / pseudo :**',
                '**Poste ou rôle souhaité :**',
                '**Disponibilités :**',
                '**Motivation :**'
            ]
        },
        en: {
            label: 'Recruitment',
            channelPrefix: 'recruitment-dossier',
            intro: [
                'Present your application with useful information.',
                '',
                '**Name / username:**',
                '**Wanted position or role:**',
                '**Availability:**',
                '**Motivation:**'
            ]
        }
    },
    partnership: {
        emoji: '🤝',
        color: SENTINEL_COLORS.success,
        fr: {
            label: 'Partenariat',
            channelPrefix: 'dossier-partenariat',
            intro: [
                'Présente la demande de partenariat clairement.',
                '',
                '**Serveur / projet :**',
                '**Objectif du partenariat :**',
                '**Contact :**',
                '**Lien ou éléments utiles :**'
            ]
        },
        en: {
            label: 'Partnership',
            channelPrefix: 'partnership-dossier',
            intro: [
                'Present the partnership request clearly.',
                '',
                '**Server / project:**',
                '**Partnership goal:**',
                '**Contact:**',
                '**Useful link or details:**'
            ]
        }
    },
    other: {
        emoji: '🧾',
        color: SENTINEL_COLORS.neutral,
        fr: {
            label: 'Autre',
            channelPrefix: 'dossier-autre',
            intro: [
                'Explique ta demande en quelques lignes.',
                '',
                '**Sujet :**',
                '**Contexte :**',
                '**Ce que tu attends :**'
            ]
        },
        en: {
            label: 'Other',
            channelPrefix: 'other-dossier',
            intro: [
                'Explain your request in a few lines.',
                '',
                '**Subject:**',
                '**Context:**',
                '**What you need:**'
            ]
        }
    }
};

const DOSSIER_STATUSES = {
    open: {
        fr: 'Ouvert',
        en: 'Open',
        color: SENTINEL_COLORS.primary
    },
    in_progress: {
        fr: 'En cours',
        en: 'In progress',
        color: SENTINEL_COLORS.accent
    },
    waiting: {
        fr: 'En attente',
        en: 'Waiting',
        color: SENTINEL_COLORS.warning
    },
    resolved: {
        fr: 'Résolu',
        en: 'Resolved',
        color: SENTINEL_COLORS.success
    },
    closed: {
        fr: 'Fermé',
        en: 'Closed',
        color: SENTINEL_COLORS.neutral
    }
};

function normalizeDossierType(value) {
    const raw = String(value || '').trim().toLowerCase();

    if (raw === 'signalement') return 'report';
    if (raw === 'recrutement') return 'recruitment';
    if (raw === 'partenariat') return 'partnership';
    if (raw === 'autre') return 'other';
    if (raw === 'plainte' || raw === 'complaint') return 'report';
    if (raw === 'administratif' || raw === 'administrative' || raw === 'admin' || raw === 'bug') return 'other';

    return DOSSIER_TYPES[raw] ? raw : 'support';
}

function normalizeDossierStatus(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');

    if (raw === 'progress' || raw === 'en_cours') return 'in_progress';
    if (raw === 'attente') return 'waiting';
    if (raw === 'resolu' || raw === 'resolved') return 'resolved';
    if (raw === 'ferme' || raw === 'closed') return 'closed';

    return DOSSIER_STATUSES[raw] ? raw : 'open';
}

function getDossierStatusLabel(status, language = 'fr') {
    const key = normalizeDossierStatus(status);
    const copy = DOSSIER_STATUSES[key] || DOSSIER_STATUSES.open;

    return copy[language === 'en' ? 'en' : 'fr'];
}

function getDossierTypeMeta(type, language = 'fr') {
    const key = normalizeDossierType(type);
    const base = DOSSIER_TYPES[key] || DOSSIER_TYPES.support;
    const copy = base[language === 'en' ? 'en' : 'fr'];

    return {
        key,
        emoji: base.emoji,
        color: base.color,
        ...copy
    };
}

function mapDossier(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        ownerUserId: row.owner_user_id,
        openerUserId: row.opener_user_id,
        type: row.type,
        status: normalizeDossierStatus(row.status),
        priority: row.priority || 'normal',
        subject: row.subject || null,
        description: row.description || null,
        referentUserId: row.referent_user_id,
        createdAt: row.created_at,
        closedAt: row.closed_at,
        closedByUserId: row.closed_by_user_id
    };
}

function getDossierByChannel(guildId, channelId) {
    return mapDossier(db.prepare(`
        SELECT *
        FROM sentinel_dossiers
        WHERE guild_id = ? AND channel_id = ?
    `).get(guildId, channelId));
}

function getOpenDossierForUser(guildId, userId) {
    return mapDossier(db.prepare(`
        SELECT *
        FROM sentinel_dossiers
        WHERE guild_id = ? AND owner_user_id = ? AND status != 'closed'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
    `).get(guildId, userId));
}

function createDossierRecord(guildId, channelId, ownerUserId, openerUserId, type, details = {}) {
    const createdAt = new Date().toISOString();
    const subject = String(details.subject || '').trim().slice(0, 120) || null;
    const description = String(details.description || '').trim().slice(0, 1500) || null;
    const priority = ['normal', 'important', 'urgent'].includes(String(details.priority || '').toLowerCase())
        ? String(details.priority).toLowerCase()
        : 'normal';
    const info = db.prepare(`
        INSERT INTO sentinel_dossiers (
            guild_id,
            channel_id,
            owner_user_id,
            opener_user_id,
            type,
            status,
            priority,
            subject,
            description,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
    `).run(guildId, channelId, ownerUserId, openerUserId, normalizeDossierType(type), priority, subject, description, createdAt);

    return getDossierByChannel(guildId, channelId) || {
        id: info.lastInsertRowid,
        guildId,
        channelId,
        ownerUserId,
        openerUserId,
        type: normalizeDossierType(type),
        status: 'open',
        priority,
        subject,
        description,
        createdAt
    };
}

function setDossierReferent(guildId, channelId, referentUserId) {
    db.prepare(`
        UPDATE sentinel_dossiers
        SET referent_user_id = ?,
            status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
        WHERE guild_id = ? AND channel_id = ? AND status != 'closed'
    `).run(referentUserId, guildId, channelId);

    return getDossierByChannel(guildId, channelId);
}

function updateDossierStatus(guildId, channelId, status) {
    const nextStatus = normalizeDossierStatus(status);

    db.prepare(`
        UPDATE sentinel_dossiers
        SET status = ?
        WHERE guild_id = ? AND channel_id = ? AND status != 'closed'
    `).run(nextStatus, guildId, channelId);

    return getDossierByChannel(guildId, channelId);
}

function closeDossierRecord(guildId, channelId, closedByUserId) {
    db.prepare(`
        UPDATE sentinel_dossiers
        SET status = 'closed',
            closed_at = ?,
            closed_by_user_id = ?
        WHERE guild_id = ? AND channel_id = ?
    `).run(new Date().toISOString(), closedByUserId, guildId, channelId);

    return getDossierByChannel(guildId, channelId);
}

function getRecentDossiers(guildId, limit = 25) {
    const safeLimit = clampNumber(limit, 1, 100);

    return db.prepare(`
        SELECT *
        FROM sentinel_dossiers
        WHERE guild_id = ?
        ORDER BY status = 'open' DESC, datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(guildId, safeLimit).map(mapDossier);
}

function getOpenDossierCount(guildId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM sentinel_dossiers
        WHERE guild_id = ? AND status != 'closed'
    `).get(guildId);

    return row?.count || 0;
}

function getDossierPanelCount(guildId) {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM sentinel_dossier_panels
        WHERE guild_id = ?
    `).get(guildId);

    return row?.count || 0;
}

function getDossierPanelQuota(guildId, member = null) {
    const used = getDossierPanelCount(guildId);
    const unlimited = isAdvancedGuild(guildId) || hasAdvancedAccess(member);
    const limit = unlimited ? null : FREE_DOSSIER_PANEL_LIMIT;

    return {
        used,
        limit,
        unlimited,
        remaining: unlimited ? null : Math.max(limit - used, 0)
    };
}

function assertDossierPanelQuota(guildId, language = 'fr', member = null) {
    const quota = getDossierPanelQuota(guildId, member);

    if (!quota.unlimited && quota.used >= quota.limit) {
        throw new Error(t(language, 'dossierPanelLimitReached', { limit: quota.limit }));
    }

    return quota;
}

function assertOpenDossierQuota(guildId, language = 'fr', member = null) {
    if (isAdvancedGuild(guildId) || hasAdvancedAccess(member)) {
        return;
    }

    const openCount = getOpenDossierCount(guildId);

    if (openCount >= FREE_OPEN_DOSSIER_LIMIT) {
        throw new Error(t(language, 'dossierOpenLimitReached', { limit: FREE_OPEN_DOSSIER_LIMIT }));
    }
}

function recordDossierPanel(guildId, channelId, messageId, creatorUserId) {
    db.prepare(`
        INSERT OR IGNORE INTO sentinel_dossier_panels (
            guild_id,
            channel_id,
            message_id,
            creator_user_id,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(guildId, channelId, messageId, creatorUserId || null, new Date().toISOString());
}

function mapDossierTypeSetting(row) {
    if (!row) {
        return null;
    }

    return {
        guildId: row.guild_id,
        type: normalizeDossierType(row.type),
        categoryId: row.category_id || null,
        questions: row.questions_json ? safeJsonParse(row.questions_json, []) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function getDossierTypeSettings(guildId) {
    return db.prepare(`
        SELECT guild_id, type, category_id, questions_json, created_at, updated_at
        FROM sentinel_dossier_type_settings
        WHERE guild_id = ?
    `).all(guildId).map(mapDossierTypeSetting);
}

function getDossierTypeSetting(guildId, type) {
    return mapDossierTypeSetting(db.prepare(`
        SELECT guild_id, type, category_id, questions_json, created_at, updated_at
        FROM sentinel_dossier_type_settings
        WHERE guild_id = ? AND type = ?
    `).get(guildId, normalizeDossierType(type)));
}

function getDossierTypeCategoryId(guildId, type) {
    return getDossierTypeSetting(guildId, type)?.categoryId || null;
}

function updateDossierTypeCategory(guildId, type, categoryId) {
    const dossierType = normalizeDossierType(type);
    const timestamp = new Date().toISOString();

    db.prepare(`
        INSERT INTO sentinel_dossier_type_settings (
            guild_id,
            type,
            category_id,
            questions_json,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, NULL, ?, ?)
        ON CONFLICT(guild_id, type) DO UPDATE SET
            category_id = excluded.category_id,
            updated_at = excluded.updated_at
    `).run(guildId, dossierType, categoryId || null, timestamp, timestamp);

    return getDossierTypeSetting(guildId, dossierType);
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

function getWeekStartDate(value = new Date()) {
    const source = value instanceof Date ? value : new Date(value);
    const date = Number.isNaN(source.getTime()) ? new Date() : source;
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay() || 7;

    utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);

    return utcDate.toISOString().slice(0, 10);
}

function getWeekRange(weekStart = null) {
    const normalizedWeekStart = /^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ''))
        ? String(weekStart)
        : getWeekStartDate();
    const startDate = new Date(`${normalizedWeekStart}T00:00:00.000Z`);
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
        weekStart: normalizedWeekStart,
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString()
    };
}

function normalizePayRate(value) {
    const rate = Number(value);

    if (!Number.isFinite(rate) || rate < 0) {
        return null;
    }

    return Math.min(rate, MAX_PAY_RATE);
}

function normalizeCurrency(value) {
    const currency = String(value || DEFAULT_PAY_CURRENCY)
        .replace(/[\r\n\t]/g, '')
        .trim()
        .slice(0, 8);

    return currency || DEFAULT_PAY_CURRENCY;
}

function getGuildPaySettings(guildId) {
    let row = db.prepare(`
        SELECT hourly_rate, currency, updated_at
        FROM guild_pay_settings
        WHERE guild_id = ?
    `).get(guildId);

    if (!row) {
        const timestamp = new Date().toISOString();

        db.prepare(`
            INSERT INTO guild_pay_settings (guild_id, hourly_rate, currency, updated_at)
            VALUES (?, 0, ?, ?)
        `).run(guildId, DEFAULT_PAY_CURRENCY, timestamp);

        row = {
            hourly_rate: 0,
            currency: DEFAULT_PAY_CURRENCY,
            updated_at: timestamp
        };
    }

    return {
        hourlyRate: Number(row.hourly_rate) || 0,
        currency: row.currency || DEFAULT_PAY_CURRENCY,
        updatedAt: row.updated_at
    };
}

function updateGuildPaySettings(guildId, hourlyRate, currency = DEFAULT_PAY_CURRENCY) {
    const normalizedRate = normalizePayRate(hourlyRate);

    if (normalizedRate === null) {
        return null;
    }

    const normalizedCurrency = normalizeCurrency(currency);
    const timestamp = new Date().toISOString();

    db.prepare(`
        INSERT INTO guild_pay_settings (guild_id, hourly_rate, currency, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
            hourly_rate = excluded.hourly_rate,
            currency = excluded.currency,
            updated_at = excluded.updated_at
    `).run(guildId, normalizedRate, normalizedCurrency, timestamp);

    return getGuildPaySettings(guildId);
}

function getGuildPayRoleSettings(guildId) {
    return db.prepare(`
        SELECT role_id, hourly_rate, updated_at
        FROM guild_pay_role_settings
        WHERE guild_id = ?
        ORDER BY hourly_rate DESC, role_id ASC
    `).all(guildId).map(row => ({
        roleId: row.role_id,
        hourlyRate: Number(row.hourly_rate) || 0,
        updatedAt: row.updated_at
    }));
}

function updateGuildPayRoleSettings(guildId, roleId, hourlyRate) {
    if (!/^\d{17,20}$/.test(String(roleId || ''))) {
        return null;
    }

    const normalizedRate = normalizePayRate(hourlyRate);

    if (normalizedRate === null) {
        return null;
    }

    const timestamp = new Date().toISOString();

    db.prepare(`
        INSERT INTO guild_pay_role_settings (guild_id, role_id, hourly_rate, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(guild_id, role_id) DO UPDATE SET
            hourly_rate = excluded.hourly_rate,
            updated_at = excluded.updated_at
    `).run(guildId, roleId, normalizedRate, timestamp);

    return {
        roleId,
        hourlyRate: normalizedRate,
        updatedAt: timestamp
    };
}

function removeGuildPayRoleSettings(guildId, roleId) {
    if (!/^\d{17,20}$/.test(String(roleId || ''))) {
        return false;
    }

    const result = db.prepare(`
        DELETE FROM guild_pay_role_settings
        WHERE guild_id = ? AND role_id = ?
    `).run(guildId, roleId);

    return result.changes > 0;
}

function normalizePayAdjustmentType(value) {
    const normalized = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    if (['prime', 'bonus', 'ajout', 'add'].includes(normalized)) {
        return 'bonus';
    }

    if (['retenue', 'deduction', 'retrait', 'remove', 'malus'].includes(normalized)) {
        return 'deduction';
    }

    if (['correction', 'fix', 'ajustement', 'adjustment'].includes(normalized)) {
        return 'correction';
    }

    return PAY_ADJUSTMENT_TYPES.has(normalized) ? normalized : null;
}

function addWeeklyPayAdjustment(guildId, userId, weekStart, type, amount, reason = '', createdByUserId = null) {
    const normalizedType = normalizePayAdjustmentType(type);
    const normalizedAmount = normalizePayRate(amount);

    if (!normalizedType || normalizedAmount === null || normalizedAmount <= 0) {
        return null;
    }

    const range = getWeekRange(weekStart);
    const signedAmount = normalizedType === 'deduction'
        ? -normalizedAmount
        : normalizedAmount;
    const timestamp = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO weekly_pay_adjustments (
            guild_id,
            user_id,
            week_start,
            type,
            amount,
            reason,
            created_by_user_id,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId,
        userId,
        range.weekStart,
        normalizedType,
        signedAmount,
        String(reason || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240) || null,
        createdByUserId || null,
        timestamp
    );

    return db.prepare(`
        SELECT id, guild_id, user_id, week_start, type, amount, reason, created_by_user_id, created_at
        FROM weekly_pay_adjustments
        WHERE id = ?
    `).get(result.lastInsertRowid);
}

function getWeeklyPayAdjustments(guildId, weekStart) {
    const range = getWeekRange(weekStart);

    return db.prepare(`
        SELECT id, guild_id, user_id, week_start, type, amount, reason, created_by_user_id, created_at
        FROM weekly_pay_adjustments
        WHERE guild_id = ? AND week_start = ?
        ORDER BY datetime(created_at) DESC, id DESC
    `).all(guildId, range.weekStart).map(row => ({
        id: row.id,
        guildId: row.guild_id,
        userId: row.user_id,
        weekStart: row.week_start,
        type: row.type,
        amount: Number(row.amount) || 0,
        reason: row.reason || null,
        createdByUserId: row.created_by_user_id || null,
        createdAt: row.created_at
    }));
}

function setWeeklyPaymentStatus(guildId, userId, weekStart, paid, paidByUserId = null) {
    const range = getWeekRange(weekStart);
    const timestamp = new Date().toISOString();
    const paidValue = paid ? 1 : 0;

    db.prepare(`
        INSERT INTO weekly_payments (
            guild_id,
            user_id,
            week_start,
            paid,
            paid_by_user_id,
            paid_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, user_id, week_start) DO UPDATE SET
            paid = excluded.paid,
            paid_by_user_id = excluded.paid_by_user_id,
            paid_at = excluded.paid_at,
            updated_at = excluded.updated_at
    `).run(
        guildId,
        userId,
        range.weekStart,
        paidValue,
        paidValue ? paidByUserId : null,
        paidValue ? timestamp : null,
        timestamp
    );

    return db.prepare(`
        SELECT guild_id, user_id, week_start, paid, paid_by_user_id, paid_at, updated_at
        FROM weekly_payments
        WHERE guild_id = ? AND user_id = ? AND week_start = ?
    `).get(guildId, userId, range.weekStart);
}

function formatPayAmount(amount, currency = DEFAULT_PAY_CURRENCY, language = 'fr') {
    const locale = language === 'en' ? 'en-US' : 'fr-FR';
    const roundedAmount = Math.round((Number(amount) || 0) * 100) / 100;
    const formatted = roundedAmount.toLocaleString(locale, {
        minimumFractionDigits: Number.isInteger(roundedAmount) ? 0 : 2,
        maximumFractionDigits: 2
    });

    return `${formatted} ${currency || DEFAULT_PAY_CURRENCY}`;
}

function formatSignedPayAmount(amount, currency = DEFAULT_PAY_CURRENCY, language = 'fr') {
    const value = Number(amount) || 0;
    const sign = value > 0 ? '+' : '';

    return `${sign}${formatPayAmount(value, currency, language)}`;
}

function getPayAdjustmentLabel(type, language = 'fr') {
    const isEnglish = language === 'en';

    if (type === 'bonus') {
        return isEnglish ? 'Bonus' : 'Prime';
    }

    if (type === 'deduction') {
        return isEnglish ? 'Deduction' : 'Retenue';
    }

    return isEnglish ? 'Correction' : 'Correction';
}

function getPayrollRoleForUser(guild, userId, roleSettings = []) {
    if (!guild || roleSettings.length === 0) {
        return null;
    }

    const member = guild.members.cache.get(userId);

    if (!member) {
        return null;
    }

    const candidates = roleSettings
        .filter(setting => member.roles.cache.has(setting.roleId))
        .map(setting => ({
            ...setting,
            roleName: guild.roles.cache.get(setting.roleId)?.name || setting.roleId
        }))
        .sort((a, b) => b.hourlyRate - a.hourlyRate);

    return candidates[0] || null;
}

function getWeeklyPayroll(guildId, options = {}) {
    const language = options.language || getGuildLanguage(guildId);
    const settings = getGuildPaySettings(guildId);
    const roleSettings = getGuildPayRoleSettings(guildId);
    const range = getWeekRange(options.weekStart);
    const rows = db.prepare(`
        SELECT user_id, SUM(duration) AS total_time
        FROM service_sessions
        WHERE guild_id = ? AND date >= ? AND date < ?
        GROUP BY user_id
    `).all(guildId, range.startIso, range.endIso);
    const totalsByUser = new Map();

    for (const row of rows) {
        totalsByUser.set(row.user_id, row.total_time || 0);
    }

    const now = Date.now();
    const activeEnd = Math.min(now, range.endMs);
    const activeRows = db.prepare(`
        SELECT user_id, start_time
        FROM service_times
        WHERE guild_id = ? AND start_time IS NOT NULL
    `).all(guildId);

    for (const row of activeRows) {
        const startTime = Number(row.start_time) || 0;

        if (startTime >= range.endMs || activeEnd <= range.startMs) {
            continue;
        }

        const countedStartTime = Math.max(startTime, range.startMs);
        const duration = Math.max(0, activeEnd - countedStartTime);
        const currentTotal = totalsByUser.get(row.user_id) || 0;

        totalsByUser.set(row.user_id, currentTotal + duration);
    }

    const paymentRows = db.prepare(`
        SELECT user_id, paid, paid_by_user_id, paid_at, updated_at
        FROM weekly_payments
        WHERE guild_id = ? AND week_start = ?
    `).all(guildId, range.weekStart);
    const paymentsByUser = new Map(paymentRows.map(row => [row.user_id, row]));
    const adjustments = getWeeklyPayAdjustments(guildId, range.weekStart);
    const adjustmentsByUser = new Map();

    for (const adjustment of adjustments) {
        const list = adjustmentsByUser.get(adjustment.userId) || [];
        list.push({
            ...adjustment,
            label: getPayAdjustmentLabel(adjustment.type, language),
            amountLabel: formatSignedPayAmount(adjustment.amount, settings.currency, language)
        });
        adjustmentsByUser.set(adjustment.userId, list);

        if (!totalsByUser.has(adjustment.userId)) {
            totalsByUser.set(adjustment.userId, 0);
        }
    }

    const items = Array.from(totalsByUser.entries())
        .map(([userId, totalTime]) => {
            const payment = paymentsByUser.get(userId) || {};
            const roleRate = getPayrollRoleForUser(options.guild, userId, roleSettings);
            const hourlyRate = roleRate?.hourlyRate ?? settings.hourlyRate;
            const baseAmount = (totalTime / (60 * 60 * 1000)) * hourlyRate;
            const userAdjustments = adjustmentsByUser.get(userId) || [];
            const adjustmentAmount = userAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
            const amount = Math.max(0, baseAmount + adjustmentAmount);

            return {
                userId,
                totalTime,
                totalTimeLabel: formatDuration(totalTime),
                hourlyRate,
                hourlyRateLabel: formatPayAmount(hourlyRate, settings.currency, language),
                payrollRoleId: roleRate?.roleId || null,
                payrollRoleName: roleRate?.roleName || null,
                baseAmount,
                baseAmountLabel: formatPayAmount(baseAmount, settings.currency, language),
                adjustmentAmount,
                adjustmentAmountLabel: formatSignedPayAmount(adjustmentAmount, settings.currency, language),
                adjustments: userAdjustments,
                amount,
                amountLabel: formatPayAmount(amount, settings.currency, language),
                paid: Boolean(payment.paid),
                paidByUserId: payment.paid_by_user_id || null,
                paidAt: payment.paid_at || null,
                updatedAt: payment.updated_at || null
            };
        })
        .filter(item => item.totalTime > 0 || item.adjustments.length > 0 || item.amount > 0)
        .sort((a, b) => b.amount - a.amount || b.totalTime - a.totalTime);

    const totalTime = items.reduce((sum, item) => sum + item.totalTime, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const paidAmount = items.filter(item => item.paid).reduce((sum, item) => sum + item.amount, 0);

    return {
        weekStart: range.weekStart,
        weekEnd: range.endIso.slice(0, 10),
        settings,
        totals: {
            userCount: items.length,
            totalTime,
            totalTimeLabel: formatDuration(totalTime),
            totalAmount,
            totalAmountLabel: formatPayAmount(totalAmount, settings.currency, language),
            paidAmount,
            paidAmountLabel: formatPayAmount(paidAmount, settings.currency, language),
            unpaidAmount: totalAmount - paidAmount,
            unpaidAmountLabel: formatPayAmount(totalAmount - paidAmount, settings.currency, language),
            adjustmentAmount: items.reduce((sum, item) => sum + item.adjustmentAmount, 0),
            adjustmentAmountLabel: formatSignedPayAmount(items.reduce((sum, item) => sum + item.adjustmentAmount, 0), settings.currency, language),
            paidCount: items.filter(item => item.paid).length,
            unpaidCount: items.filter(item => !item.paid).length
        },
        roleSettings: roleSettings.map(setting => ({
            ...setting,
            roleName: options.guild?.roles?.cache?.get(setting.roleId)?.name || null,
            hourlyRateLabel: formatPayAmount(setting.hourlyRate, settings.currency, language)
        })),
        adjustments: adjustments.map(adjustment => ({
            ...adjustment,
            label: getPayAdjustmentLabel(adjustment.type, language),
            amountLabel: formatSignedPayAmount(adjustment.amount, settings.currency, language)
        })),
        items
    };
}

function archiveWeeklyPayroll(guildId, archivedByUserId, options = {}) {
    const language = options.language || getGuildLanguage(guildId);
    const payroll = getWeeklyPayroll(guildId, {
        ...options,
        language
    });
    const timestamp = new Date().toISOString();
    const details = {
        settings: payroll.settings,
        roleSettings: payroll.roleSettings,
        totals: payroll.totals,
        items: payroll.items.map(item => ({
            userId: item.userId,
            totalTime: item.totalTime,
            totalTimeLabel: item.totalTimeLabel,
            hourlyRate: item.hourlyRate,
            payrollRoleId: item.payrollRoleId,
            payrollRoleName: item.payrollRoleName,
            baseAmount: item.baseAmount,
            adjustmentAmount: item.adjustmentAmount,
            amount: item.amount,
            paid: item.paid,
            paidByUserId: item.paidByUserId,
            paidAt: item.paidAt
        })),
        adjustments: payroll.adjustments
    };

    db.prepare(`
        INSERT INTO weekly_payroll_archives (
            guild_id,
            week_start,
            week_end,
            archived_by_user_id,
            archived_at,
            user_count,
            total_time,
            total_amount,
            paid_amount,
            unpaid_amount,
            details_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, week_start) DO UPDATE SET
            week_end = excluded.week_end,
            archived_by_user_id = excluded.archived_by_user_id,
            archived_at = excluded.archived_at,
            user_count = excluded.user_count,
            total_time = excluded.total_time,
            total_amount = excluded.total_amount,
            paid_amount = excluded.paid_amount,
            unpaid_amount = excluded.unpaid_amount,
            details_json = excluded.details_json
    `).run(
        guildId,
        payroll.weekStart,
        payroll.weekEnd,
        archivedByUserId || null,
        timestamp,
        payroll.totals.userCount,
        payroll.totals.totalTime,
        payroll.totals.totalAmount,
        payroll.totals.paidAmount,
        payroll.totals.unpaidAmount,
        JSON.stringify(details)
    );

    return {
        weekStart: payroll.weekStart,
        weekEnd: payroll.weekEnd,
        archivedAt: timestamp,
        totals: payroll.totals
    };
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

function getCustomEmbedQuota(guildId, member = null) {
    const used = getCustomEmbedCount(guildId);

    if (isAdvancedGuild(guildId) || hasAdvancedAccess(member)) {
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

function formatCustomEmbedQuota(guildId, language = 'fr', member = null) {
    const quota = getCustomEmbedQuota(guildId, member);

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

function getFilteredModerationCases(guildId, filters = {}) {
    const where = ['guild_id = ?'];
    const params = [guildId];
    const targetUserId = normalizeUserId(filters.targetUserId);
    const caseId = Number(filters.caseId);
    const action = String(filters.action || '').trim();

    if (targetUserId) {
        where.push('target_user_id = ?');
        params.push(targetUserId);
    }

    if (Number.isInteger(caseId) && caseId > 0) {
        where.push('id = ?');
        params.push(caseId);
    }

    if (/^[a-z_-]+$/i.test(action)) {
        where.push('action = ?');
        params.push(action);
    }

    const safeLimit = Math.min(Math.max(Number(filters.limit) || 10, 1), 100);
    params.push(safeLimit);

    return db.prepare(`
        SELECT id, target_user_id, moderator_user_id, action, reason, duration, created_at
        FROM moderation_cases
        WHERE ${where.join(' AND ')}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
    `).all(...params);
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

function getFallbackRequester() {
    return client.user || {
        username: 'Sentinel'
    };
}

function buildSentinelStaffLogEmbed(guild, message, {
    color = SENTINEL_COLORS.accent,
    title = null,
    requester = null,
    language = null,
    fields = []
} = {}) {
    const activeLanguage = language || getGuildLanguage(guild.id);
    const embed = createSentinelEmbed({
        color,
        title: title || t(activeLanguage, 'staffLogTitle'),
        description: String(message || '').slice(0, 4096),
        requester: requester || getFallbackRequester(),
        thumbnail: guild.iconURL(),
        language: activeLanguage
    });

    if (Array.isArray(fields) && fields.length > 0) {
        embed.addFields(fields.map(field => ({
            name: String(field.name).slice(0, 256),
            value: String(field.value || '-').slice(0, 1024),
            inline: Boolean(field.inline)
        })));
    }

    return embed;
}

async function sendSentinelStaffLog(guild, message, options = {}) {
    const channel = getSentinelStaffLogChannel(guild);

    if (!channel) {
        return;
    }

    if (message && typeof message === 'object' && (message.embeds || message.content || message.files)) {
        await channel.send(message).catch(() => {});
        return;
    }

    await channel.send({
        embeds: [buildSentinelStaffLogEmbed(guild, message, options)]
    }).catch(() => {});
}

function formatServiceLogTarget(target, userId, language = 'fr') {
    if (target?.id && target?.user) {
        return `${target}`;
    }

    if (target?.id && target?.username) {
        return `${target}`;
    }

    if (userId) {
        return language === 'en'
            ? `user ID \`${userId}\``
            : `utilisateur ID \`${userId}\``;
    }

    return language === 'en' ? 'Unknown user' : 'Utilisateur inconnu';
}

function getServiceLogAvatar(target) {
    if (typeof target?.displayAvatarURL === 'function') {
        return target.displayAvatarURL();
    }

    if (typeof target?.user?.displayAvatarURL === 'function') {
        return target.user.displayAvatarURL();
    }

    return null;
}

function getServiceLogRequester(target, actor = null) {
    if (actor?.username) {
        return actor;
    }

    if (target?.user?.username) {
        return target.user;
    }

    if (target?.username) {
        return target;
    }

    return getFallbackRequester();
}

function buildServiceLogEmbed(guild, target, action, {
    duration = null,
    totalTime = null,
    startTime = null,
    source = null,
    actor = null,
    userId = null,
    language = null
} = {}) {
    const activeLanguage = language || getGuildLanguage(guild.id);
    const targetLabel = formatServiceLogTarget(target, userId || target?.id, activeLanguage);
    const isEnd = action === 'end';
    const isLong = action === 'long';
    const embed = createSentinelEmbed({
        color: isEnd ? SENTINEL_COLORS.warning : (isLong ? SENTINEL_COLORS.danger : SENTINEL_COLORS.success),
        title: isEnd
            ? t(activeLanguage, 'serviceLogEndTitle')
            : (isLong ? t(activeLanguage, 'serviceLogLongTitle') : t(activeLanguage, 'serviceLogStartTitle')),
        description: isLong
            ? [
                t(activeLanguage, 'serviceLogLongDescription', {
                    member: targetLabel,
                    duration: formatDuration(duration || 0)
                }),
                t(activeLanguage, 'serviceLogLongHint')
            ].join('\n')
            : (isEnd
                ? t(activeLanguage, 'serviceLeftLog', {
                    member: targetLabel,
                    duration: formatDuration(duration || 0),
                    total: formatDuration(totalTime || 0)
                })
                : t(activeLanguage, 'serviceStartedLog', { member: targetLabel })),
        requester: getServiceLogRequester(target, actor),
        thumbnail: getServiceLogAvatar(target) || guild.iconURL(),
        language: activeLanguage
    });
    const fields = [
        {
            name: t(activeLanguage, 'serviceLogTarget'),
            value: targetLabel,
            inline: true
        },
        {
            name: t(activeLanguage, 'serviceLogSource'),
            value: source || t(activeLanguage, 'serviceLogSourceDiscord'),
            inline: true
        }
    ];

    if (startTime) {
        fields.push({
            name: t(activeLanguage, 'serviceLogStartedAt'),
            value: formatDiscordTime(startTime),
            inline: true
        });
    }

    if (duration !== null) {
        fields.push({
            name: t(activeLanguage, 'serviceLogDuration'),
            value: formatDuration(duration),
            inline: true
        });
    }

    if (totalTime !== null) {
        fields.push({
            name: t(activeLanguage, 'serviceLogTotal'),
            value: formatDuration(totalTime),
            inline: true
        });
    }

    return embed.addFields(fields);
}

async function sendServiceLog(guild, target, action, options = {}) {
    const channel = getLogChannel(guild) || getSentinelStaffLogChannel(guild);

    if (!channel) {
        return;
    }

    await channel.send({
        embeds: [buildServiceLogEmbed(guild, target, action, options)]
    }).catch(() => {});
}

function clearLongServiceAlert(guildId, userId) {
    const prefix = `${guildId}:${userId}:`;

    for (const key of longServiceAlertedKeys) {
        if (key.startsWith(prefix)) {
            longServiceAlertedKeys.delete(key);
        }
    }
}

function clearLongServiceAlertsForGuild(guildId) {
    const prefix = `${guildId}:`;

    for (const key of longServiceAlertedKeys) {
        if (key.startsWith(prefix)) {
            longServiceAlertedKeys.delete(key);
        }
    }
}

async function checkLongServiceAlerts() {
    for (const guild of client.guilds.cache.values()) {
        const language = getGuildLanguage(guild.id);

        for (const service of getActiveServices(guild.id)) {
            if (service.duration < LONG_SERVICE_ALERT_MS) {
                continue;
            }

            const key = `${guild.id}:${service.userId}:${service.startTime}`;

            if (longServiceAlertedKeys.has(key)) {
                continue;
            }

            longServiceAlertedKeys.add(key);
            const member = await guild.members.fetch(service.userId).catch(() => null);

            await sendServiceLog(guild, member, 'long', {
                duration: service.duration,
                startTime: service.startTime,
                userId: service.userId,
                source: 'Sentinel',
                language
            });
        }
    }
}

async function closeDossierChannelFromInteraction(interaction, channel, language) {
    const topic = parseDossierChannelTopic(channel.topic);
    const dossier = getDossierByChannel(interaction.guild.id, channel.id) || topic;
    const closedDossier = closeDossierRecord(interaction.guild.id, channel.id, interaction.user.id) || {
        ...dossier,
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedByUserId: interaction.user.id
    };

    await sendDossierTranscript(channel, closedDossier, interaction.user, language);
    await sendSentinelStaffLog(
        interaction.guild,
        language === 'en'
            ? `Sentinel dossier #${closedDossier?.id || channel.id} closed: **${channel.name}** by ${interaction.user}.`
            : `Dossier Sentinel #${closedDossier?.id || channel.id} clôturé : **${channel.name}** par ${interaction.user}.`,
        {
            color: SENTINEL_COLORS.warning,
            requester: interaction.user,
            language
        }
    );

    setTimeout(() => {
        channel?.delete('Cloture dossier Sentinel').catch(() => {});
    }, 5000);

    return t(language, 'dossierClosed');
}

async function executeSensitiveConfirmation(interaction, confirmation) {
    const language = confirmation.language || getGuildLanguage(interaction.guild.id);
    const guild = interaction.guild;
    const payload = confirmation.payload || {};

    if (!guild || guild.id !== confirmation.guildId) {
        throw new Error(t(language, 'serviceError'));
    }

    if (confirmation.action === 'purge') {
        const channel = await guild.channels.fetch(payload.channelId).catch(() => null);

        if (!channel?.isTextBased?.() || typeof channel.bulkDelete !== 'function') {
            throw new Error(t(language, 'moderationNoChannel'));
        }

        const amount = clampNumber(payload.amount, 1, 100);
        const deleted = await channel.bulkDelete(amount, true).catch(() => null);

        if (!deleted) {
            throw new Error(t(language, 'moderationFailed'));
        }

        const caseData = addModerationCase(
            guild.id,
            null,
            interaction.user.id,
            'clear',
            `${amount} messages demandés dans #${channel.name}`,
            null
        );

        await sendModerationLog(guild, interaction.user, caseData, `${channel}`, language);
        return t(language, 'moderationClear', { count: deleted.size });
    }

    if (confirmation.action === 'ban') {
        const userId = normalizeUserId(payload.userId);
        const member = userId ? await guild.members.fetch(userId).catch(() => null) : null;
        const targetError = getUserTargetErrorById(guild, interaction.member, userId, member, language);

        if (targetError) {
            throw new Error(targetError);
        }

        await guild.members.ban(userId, {
            reason: payload.reason,
            deleteMessageSeconds: clampNumber(payload.deleteDays || 0, 0, 7) * 24 * 60 * 60
        }).catch(error => {
            console.error('Erreur bannissement confirme :', error);
            throw new Error(t(language, 'moderationFailed'));
        });

        const caseData = addModerationCase(guild.id, userId, interaction.user.id, 'ban', payload.reason, null);
        await sendModerationLog(guild, interaction.user, caseData, payload.targetLabel || `<@${userId}>`, language);

        return t(language, 'moderationBan', {
            user: payload.targetLabel || `<@${userId}>`,
            caseId: caseData.id
        });
    }

    if (confirmation.action === 'kick') {
        const member = await guild.members.fetch(payload.userId).catch(() => null);
        const targetError = getModerationTargetError(interaction.member, member, language);

        if (targetError) {
            throw new Error(targetError);
        }

        await member.kick(payload.reason).catch(error => {
            console.error('Erreur expulsion confirmee :', error);
            throw new Error(t(language, 'moderationFailed'));
        });

        const caseData = addModerationCase(guild.id, member.id, interaction.user.id, 'kick', payload.reason, null);
        await sendModerationLog(guild, interaction.user, caseData, `${member.user.tag}`, language);

        return t(language, 'moderationKick', {
            member: member.user.tag,
            caseId: caseData.id
        });
    }

    if (confirmation.action === 'reset-user') {
        const userId = normalizeUserId(payload.userId);
        const member = userId ? await guild.members.fetch(userId).catch(() => null) : null;

        if (!hasCommandRoleAccess(interaction.member)) {
            throw new Error(getCommandRoleAccessDeniedMessage(language));
        }

        if (!hasUserRecord(guild.id, userId)) {
            throw new Error(t(language, 'resetUserNoRecord', {
                target: formatResetTarget(member, userId, language)
            }));
        }

        resetUser(guild.id, userId);
        clearLongServiceAlert(guild.id, userId);

        return t(language, 'resetUser', {
            member: formatResetTarget(member, userId, language)
        });
    }

    if (confirmation.action === 'dossier-close') {
        const channel = await guild.channels.fetch(payload.channelId).catch(() => null);
        const topic = parseDossierChannelTopic(channel?.topic);

        if (!channel || !topic) {
            throw new Error(t(language, 'dossierNotInDossier'));
        }

        if (!memberCanManageDossier(interaction.member) && topic.ownerUserId !== interaction.user.id) {
            throw new Error(t(language, 'dossierCloseDenied'));
        }

        return closeDossierChannelFromInteraction(interaction, channel, language);
    }

    throw new Error(t(language, 'serviceError'));
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

function getAutoRole(guild) {
    const guildConfig = getGuildConfig(guild.id);

    if (!guildConfig.autoRoleId) {
        return null;
    }

    return guild.roles.cache.get(guildConfig.autoRoleId);
}

function getAssignableRoleError(guild, role, language = 'fr') {
    if (!role) {
        return t(language, 'adminRoleRequired');
    }

    if (role.id === guild.id) {
        return t(language, 'everyoneDenied');
    }

    if (role.managed) {
        return t(language, 'autoRoleManagedDenied');
    }

    const botMember = guild.members.me;
    const canManageRoles = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles));
    const botRoleAbove = Boolean(botMember && botMember.roles.highest.comparePositionTo(role) > 0);

    if (!canManageRoles || !botRoleAbove) {
        return t(language, 'autoRoleNotManageable', { role });
    }

    return null;
}

async function assignConfiguredAutoRole(member) {
    if (!member?.guild || member.user?.bot) {
        return;
    }

    const guild = member.guild;
    const language = getGuildLanguage(guild.id);
    const guildConfig = getGuildConfig(guild.id);

    if (!guildConfig.autoRoleId) {
        return;
    }

    const role = guild.roles.cache.get(guildConfig.autoRoleId)
        || await guild.roles.fetch(guildConfig.autoRoleId).catch(() => null);

    if (!role) {
        return;
    }

    const logChannel = getLogChannel(guild);
    const error = getAssignableRoleError(guild, role, language);

    if (error) {
        if (logChannel) {
            await logChannel.send(t(language, 'autoRoleFailedLog', { member, role })).catch(() => {});
        }
        return;
    }

    try {
        await member.roles.add(role, 'Sentinel auto-role on member join');

        if (logChannel) {
            await logChannel.send(t(language, 'autoRoleAssignedLog', { member, role })).catch(() => {});
        }
    } catch (error) {
        console.error('Erreur auto-role Sentinel :', error);

        if (logChannel) {
            await logChannel.send(t(language, 'autoRoleFailedLog', { member, role })).catch(() => {});
        }
    }
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
    const autoRoleValue = guildConfig.autoRoleId ? `<@&${guildConfig.autoRoleId}>` : 'Désactivé';
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
                name: 'Rôle automatique d’arrivée',
                value: autoRoleValue,
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

function buildWeeklyPayrollEmbed(guild, requester, options = {}) {
    const language = getGuildLanguage(guild.id);
    const payroll = getWeeklyPayroll(guild.id, { language, guild });
    const displayLimit = options.isReferenceServer ? REFERENCE_TOP_LIMIT : FREE_TOP_LIMIT;
    const displayedItems = payroll.items.slice(0, displayLimit);
    const isEnglish = language === 'en';
    const lines = displayedItems.map((item, index) => {
        const status = item.paid
            ? (isEnglish ? 'Paid' : 'Payé')
            : (isEnglish ? 'To pay' : 'À payer');

        const ratePart = item.payrollRoleName
            ? `${item.payrollRoleName} · ${item.hourlyRateLabel}/h`
            : `${item.hourlyRateLabel}/h`;
        const adjustmentPart = item.adjustmentAmount
            ? ` · ${isEnglish ? 'adjustment' : 'ajustement'} ${item.adjustmentAmountLabel}`
            : '';

        return `**${getRankLabel(index)}.** <@${item.userId}> - **${item.totalTimeLabel}** - ${ratePart}${adjustmentPart} - **${item.amountLabel}** - ${status}`;
    });
    const hiddenCount = payroll.items.length - displayedItems.length;

    if (hiddenCount > 0) {
        lines.push(isEnglish
            ? `... and **${hiddenCount}** other agent(s).`
            : `... et **${hiddenCount}** autre(s) agent(s).`);
    }

    const description = lines.length > 0
        ? lines.join('\n')
        : t(language, 'payrollEmpty');

    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: isEnglish ? 'Sentinel | Weekly RP payroll' : 'Sentinel | Paie RP hebdomadaire',
        description,
        requester,
        thumbnail: guild.iconURL(),
        language
    })
        .addFields(
            {
                name: isEnglish ? 'Current week' : 'Semaine en cours',
                value: `**${payroll.weekStart} → ${payroll.weekEnd}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Hourly amount' : 'Montant horaire',
                value: `**${formatPayAmount(payroll.settings.hourlyRate, payroll.settings.currency, language)}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Total time' : 'Temps total',
                value: `**${payroll.totals.totalTimeLabel}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Already paid' : 'Déjà payé',
                value: `**${payroll.totals.paidAmountLabel}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Adjustments' : 'Ajustements',
                value: `**${payroll.totals.adjustmentAmountLabel}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Still to pay' : 'Reste à payer',
                value: `**${payroll.totals.unpaidAmountLabel}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Dashboard' : 'Dashboard',
                value: isEnglish
                    ? `Use ${getDashboardUrl('/dashboard')} to tick paid/unpaid lines.`
                    : `Utilise ${getDashboardUrl('/dashboard')} pour cocher les lignes payé/non payé.`,
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
    const autoRole = getAutoRole(guild);
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
    const botCanModerate = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ModerateMembers));
    const botCanKick = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.KickMembers));
    const botCanBan = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.BanMembers));
    const botCanManageMessages = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ManageMessages));
    const botCanManageChannels = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels));
    const rolePositionOk = Boolean(
        !role
        || (botMember && botMember.roles.highest.comparePositionTo(role) > 0)
    );
    const autoRolePositionOk = Boolean(
        !autoRole
        || (botMember && botMember.roles.highest.comparePositionTo(autoRole) > 0)
    );
    const autoRoleOk = Boolean(!guildConfig.autoRoleId || (autoRole && botCanManageRoles && autoRolePositionOk));
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
        && botCanModerate
        && botCanKick
        && botCanBan
        && botCanManageMessages
        && botCanManageChannels
        && rolePositionOk
        && autoRoleOk
        && !hasLogIssue
        && !hasConsistencyIssue;
    const fixes = [];

    if (!role) {
        fixes.push('Configure le rôle de service avec `/config-role`.');
    }

    if (!botCanManageRoles) {
        fixes.push('Ajoute `Gérer les rôles` au rôle Sentinel.');
    }

    if (!rolePositionOk) {
        fixes.push('Monte le rôle Sentinel au-dessus du rôle de service.');
    }

    if (!autoRoleOk && autoRole) {
        fixes.push('Monte le rôle Sentinel au-dessus du rôle automatique d’arrivée.');
    }

    if (!botCanModerate) {
        fixes.push('Ajoute `Modérer les membres` pour les timeouts.');
    }

    if (!botCanKick) {
        fixes.push('Ajoute `Expulser des membres` pour les expulsions.');
    }

    if (!botCanBan) {
        fixes.push('Ajoute `Bannir des membres` pour les bans et unbans.');
    }

    if (!botCanManageMessages) {
        fixes.push('Ajoute `Gérer les messages` pour `/purge`.');
    }

    if (!botCanManageChannels) {
        fixes.push('Ajoute `Gérer les salons` pour les dossiers, lock et unlock.');
    }

    if (hasLogIssue) {
        fixes.push('Vérifie le salon de logs : Sentinel doit le voir et y écrire.');
    }

    if (hasConsistencyIssue) {
        fixes.push('Lance `/sync-service` pour réparer les incohérences de service.');
    }

    const embed = createSentinelEmbed({
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
                name: 'Rôle automatique d’arrivée',
                value: [
                    diagnosticLine(!guildConfig.autoRoleId || Boolean(autoRole), 'Rôle configuré', autoRole ? `${autoRole}` : 'désactivé ou rôle supprimé'),
                    diagnosticLine(autoRoleOk, 'Attribution possible', autoRole
                        ? (autoRolePositionOk ? 'OK' : 'le rôle Sentinel doit être au-dessus du rôle automatique')
                        : 'optionnelle')
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
                name: 'Modération',
                value: [
                    diagnosticLine(botCanModerate, 'Timeout / fin-timeout', botCanModerate ? 'OK' : 'ajoute `Modérer les membres`'),
                    diagnosticLine(botCanKick, 'Expulsion', botCanKick ? 'OK' : 'ajoute `Expulser des membres`'),
                    diagnosticLine(botCanBan, 'Ban et unban par ID', botCanBan ? 'OK' : 'ajoute `Bannir des membres`'),
                    diagnosticLine(botCanManageMessages, 'Purge', botCanManageMessages ? 'OK' : 'ajoute `Gérer les messages`')
                ].join('\n'),
                inline: false
            },
            {
                name: 'Dossiers Sentinel',
                value: [
                    diagnosticLine(botCanManageChannels, 'Création et gestion des salons privés', botCanManageChannels ? 'OK' : 'ajoute `Gérer les salons`'),
                    `Rôles responsables : ${formatDossierRoleList(guild.id)}`
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

    if (fixes.length > 0) {
        embed.addFields({
            name: 'Corrections conseillées',
            value: fixes.slice(0, 8).map(item => `- ${item}`).join('\n'),
            inline: false
        });
    }

    return embed;
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

function buildServerOnboardingEmbed(guild, requester) {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: 'Sentinel | Premiers pas',
        description: [
            'Merci d’avoir invité Sentinel. Le bot est prêt, il reste juste à le configurer pour ton serveur.',
            '',
            '`1.` Choisis la langue du serveur avec les boutons ci-dessous.',
            '`2.` Configure le rôle de service avec `/config-role role:@role`.',
            '`3.` Configure le salon de logs avec `/config-logs salon_id:ID`.',
            '`4.` Ajoute les rôles autorisés avec `/config-permissions action:ajouter role:@role`.',
            '`5.` Publie le panneau de service dans le bon salon avec `!service-panel`.',
            '`6.` Si tu veux les tickets privés, publie le bureau avec `/dossier-panel`.',
            '',
            'Besoin d’un guide plus simple ? Utilise `/aide` ou ouvre le dashboard.'
        ].join('\n'),
        requester,
        thumbnail: guild.iconURL(),
        language: 'fr'
    }).addFields(
        {
            name: 'À vérifier',
            value: [
                'Le rôle Sentinel doit être au-dessus du rôle de service.',
                'Sentinel doit pouvoir voir/écrire dans les salons utiles et créer des salons pour les dossiers.',
                'Le dashboard peut aussi guider toute la configuration.'
            ].join('\n'),
            inline: false
        }
    );
}

function buildServerOnboardingComponents(language = 'fr') {
    return [
        ...buildLanguageButtons(language),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Open dashboard' : 'Ouvrir le dashboard')
                .setStyle(ButtonStyle.Link)
                .setURL(getDashboardUrl('/dashboard')),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Full guide' : 'Guide complet')
                .setStyle(ButtonStyle.Link)
                .setURL(getPublicSiteUrl('installation.html')),
            new ButtonBuilder()
                .setLabel(language === 'en' ? 'Support server' : 'Serveur support')
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL)
        )
    ];
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
                    '`/autorole-config` sets or disables the role given automatically when a member joins.',
                    '`/config-channel channel_id:ID` sets the log channel.',
                    '`/config-view` shows the current configuration.',
                    '`/payroll-config hourly_rate:500 currency:$` sets the weekly RP payroll amount.',
                    '`/weekly-payroll` shows the current week paid/unpaid summary.',
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
        '**3. Rôle automatique d’arrivée**',
        '`/config-autorole action:definir role:@role` donne un rôle aux nouveaux membres. Utilise `action:desactiver` pour le couper.',
        '',
        '**4. Verification**',
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
        '`/config-paie`, `/paie-semaine`, `/paie-archive` - regler, consulter et archiver la paie RP hebdomadaire',
        '`/config-role`, `/config-autorole`, `/config-logs`, `/config-permissions`, `/config-voir` - configuration',
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
        '`/config-paie role:@role` - definir un taux horaire Premium par role',
        '`/paie-ajustement` - ajouter une prime, une retenue ou une correction de paie',
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

function buildHelpPageDefinitions(guild, language = 'fr', member = null) {
    const isReferenceServer = isAdvancedGuild(guild.id) || hasAdvancedAccess(member);

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
                            '`/dashboard` opens the web dashboard.',
                            '`/support` shows support and official links.',
                            '`/premium` shows the Premium launch progress.',
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
                            '`/autorole-config` sets or disables the role given to new members automatically.',
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
                id: 'dashboard',
                label: 'Dashboard',
                menuDescription: 'Open the web dashboard and manage a server.',
                emoji: '🖥️',
                title: 'Sentinel | Dashboard',
                description: 'The dashboard lets authorized staff manage Sentinel from a browser.',
                fields: [
                    {
                        name: 'Open it',
                        value: [
                            'Use `/dashboard` in Discord, then click the button.',
                            'You can also open the public website and choose `Dashboard`.'
                        ].join('\n')
                    },
                    {
                        name: 'What you can do there',
                        value: [
                            'Choose a server connected to your Discord account.',
                            'Configure language, duty role, log channel, service panel, embeds, moderation actions, and audit history.',
                            'If a server asks for authorization, invite Sentinel as a real bot first.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'dossiers',
                label: 'Dossiers',
                menuDescription: 'Sentinel dossier system with a RP vocabulary.',
                emoji: '📁',
                title: 'Sentinel | Dossiers',
                description: 'In Sentinel, a dossier is a private ticket: each request opens a dedicated channel with the authorized team.',
                fields: [
                    {
                        name: 'How it works',
                        value: [
                            '`/ticket-panel` publishes the Sentinel reception desk.',
                            'Members choose a type: support, report, recruitment, partnership, or other.',
                            'Sentinel asks for a subject and description, then creates the private channel.'
                        ].join('\n')
                    },
                    {
                        name: 'Inside a dossier',
                        value: [
                            'Free servers can reply, add participants, generate a transcript, and close the dossier.',
                            '`/ticket-roles action:add role:@role` gives a role access to dossier handling.',
                            '`/ticket-claim` marks you as the dossier referent.',
                            '`/ticket-status status:...` updates the visible status if the requester made a mistake or the situation changes.',
                            '`/close-ticket` closes the current dossier.',
                            '`/ticket-add member:@member` adds a participant.',
                            '`/ticket-remove member:@member` removes a participant.',
                            '`/ticket-transcript` sends the transcript to the log channel when possible.'
                        ].join('\n')
                    },
                    {
                        name: 'Free / Premium',
                        value: [
                            `Free servers: ${FREE_DOSSIER_PANEL_LIMIT} panel, ${FREE_OPEN_DOSSIER_LIMIT} open dossiers, ${FREE_DOSSIER_HISTORY_LIMIT} visible recent dossiers.`,
                            'Premium later: unlimited panels, custom categories, advanced forms, priorities, templates, full history, statistics, and automations.'
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
                            '`/dashboard` gives the web dashboard link.',
                            '`/support` gives official support links.',
                            '`/premium` shows when Premium will open.',
                            '`/reset-hours member:@member` or `user_id:ID` resets one person, even if they left.',
                            '`/payroll-config` sets the global hourly RP amount.',
                            '`/weekly-payroll` shows who is paid or still to pay this week.',
                            '`/payroll-mark paid:true member:@member` marks a line as paid or unpaid.',
                            '`/payroll-archive` archives the current week payroll.',
                            '`/autorole-config` manages the role given to new members.',
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
                            '`/autorole-config` can give a role automatically when a member joins.',
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
                                '`/reset-hours-all` will be reserved for Sentinel Premium.',
                                `Premium is planned when Sentinel reaches ${PREMIUM_SERVER_GOAL} servers.`
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
                        '`/dashboard` ouvre le dashboard web.',
                        '`/support` affiche les liens officiels et le serveur support.',
                        '`/premium` affiche la progression avant l’ouverture Premium.',
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
                        '`/config-autorole action:definir role:@role` donne un rôle aux nouveaux membres automatiquement.',
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
                id: 'dashboard',
                label: 'Dashboard',
                menuDescription: 'Ouvrir le site et gérer un serveur.',
            emoji: '🖥️',
            title: 'Sentinel | Dashboard',
            description: 'Le dashboard permet aux staffs autorisés de gérer Sentinel depuis un navigateur.',
            fields: [
                {
                    name: 'L’ouvrir',
                    value: [
                        'Utilise `/dashboard` dans Discord, puis clique sur le bouton.',
                        'Tu peux aussi ouvrir le site public et choisir `Dashboard`.'
                    ].join('\n')
                },
                {
                    name: 'Ce que tu peux faire dessus',
                    value: [
                        'Choisir un serveur lié à ton compte Discord.',
                        'Configurer la langue, le rôle de service, l’auto-rôle, le salon de logs, le panneau de service, les embeds, les sanctions et l’historique.',
                        'Si un serveur demande une autorisation, invite d’abord Sentinel comme vrai bot.'
                    ].join('\n')
                    }
                ]
            },
            {
                id: 'dossiers',
                label: 'Dossiers',
                menuDescription: 'Le système de dossiers Sentinel avec un vocabulaire RP.',
                emoji: '📁',
                title: 'Sentinel | Dossiers',
                description: 'Dans Sentinel, un dossier est un ticket privé : chaque demande ouvre un salon dédié avec l’équipe autorisée.',
                fields: [
                    {
                        name: 'Fonctionnement',
                        value: [
                            '`/dossier-panel` publie le bureau d’accueil Sentinel.',
                            'Les membres choisissent un type : support, signalement, recrutement, partenariat ou autre.',
                            'Sentinel demande un sujet et une description, puis crée le salon privé.'
                        ].join('\n')
                    },
                    {
                        name: 'Dans un dossier',
                        value: [
                            'En gratuit, le staff peut répondre, ajouter des intervenants, générer un compte rendu et clôturer le dossier.',
                            '`/dossier-roles action:ajouter role:@rôle` donne accès à la gestion des dossiers.',
                            '`/dossier-prendre` te marque comme référent du dossier.',
                            '`/dossier-statut statut:...` corrige le statut visible si le demandeur s’est trompé ou si la situation change.',
                            '`/dossier-fermer` clôture le dossier actuel.',
                            '`/dossier-ajouter membre:@membre` ajoute un intervenant.',
                            '`/dossier-retirer membre:@membre` retire un intervenant.',
                            '`/dossier-compte-rendu` envoie le compte rendu dans le salon de logs quand c’est possible.'
                        ].join('\n')
                    },
                    {
                        name: 'Gratuit / Premium',
                        value: [
                            `Serveur gratuit : ${FREE_DOSSIER_PANEL_LIMIT} panneau, ${FREE_OPEN_DOSSIER_LIMIT} dossiers ouverts, ${FREE_DOSSIER_HISTORY_LIMIT} derniers dossiers visibles.`,
                            'Premium plus tard : panneaux illimités, catégories personnalisées, formulaires avancés, priorités, templates, historique complet, statistiques et automatisations.'
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
                        '`/dashboard` donne le lien du dashboard web.',
                        '`/support` donne les liens officiels et le serveur support.',
                        '`/premium` indique quand le Premium ouvrira.',
                        '`/reset-heures membre:@membre` ou `utilisateur_id:ID` remet une personne à zéro, même si elle a quitté.',
                        '`/config-paie` règle le montant horaire RP.',
                        '`/paie-semaine` affiche qui est payé ou encore à payer cette semaine.',
                        '`/paie-marquer paye:true membre:@membre` marque une ligne comme payée ou non payée.',
                        '`/config-autorole` gère le rôle donné automatiquement aux nouveaux membres.',
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
                        '`/config-autorole` peut donner un rôle automatiquement quand un membre rejoint.',
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
                            '`/reset-heures-all` sera réservé à Sentinel Premium.',
                            `Premium est prévu quand Sentinel aura atteint ${PREMIUM_SERVER_GOAL} serveurs.`
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

function getHelpPage(guild, language, pageId = HELP_PAGE_DEFAULT, member = null) {
    const pages = buildHelpPageDefinitions(guild, language, member);
    const page = pages.find(item => item.id === pageId) || pages[0];

    return {
        pages,
        page,
        index: pages.findIndex(item => item.id === page.id)
    };
}

function buildHelpEmbed(guild, requester, pageId = HELP_PAGE_DEFAULT, member = null) {
    const language = getGuildLanguage(guild.id);
    const { pages, page, index } = getHelpPage(guild, language, pageId, member);
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

function buildHelpMenuComponents(guild, requester, pageId = HELP_PAGE_DEFAULT, member = null) {
    const language = getGuildLanguage(guild.id);
    const { pages, page } = getHelpPage(guild, language, pageId, member);
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
        embeds: [buildHelpEmbed(interaction.guild, interaction.user, pageId, interaction.member)],
        components: buildHelpMenuComponents(interaction.guild, interaction.user, pageId, interaction.member)
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

    if (commandName === 'config-autorole') {
        const action = interaction.options.getString('action');

        if (action === 'desactiver' || action === 'disable') {
            return 'disable-auto-role';
        }

        return action === 'voir' || action === 'view' ? null : 'set-auto-role';
    }

    if (commandName === 'config-logs') {
        return 'set-log-channel';
    }

    if (commandName === 'config-paie') {
        if (interaction.options.getRole('role')) {
            const removeRoleRate = interaction.options.getBoolean('retirer')
                ?? interaction.options.getBoolean('remove')
                ?? false;
            return removeRoleRate ? 'remove-payroll-role-rate' : 'set-payroll-role-rate';
        }

        return 'set-payroll-settings';
    }

    if (commandName === 'paie-semaine') {
        return null;
    }

    if (commandName === 'paie-ajustement') {
        return 'add-payroll-adjustment';
    }

    if (commandName === 'paie-archive') {
        return 'archive-payroll';
    }

    if (commandName === 'paie-marquer') {
        return 'mark-payroll-status';
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
        slowmode: 'slowmode',
        'dossier-panel': 'publish-dossier-panel',
        'dossier-roles': 'configure-dossier-roles',
        'dossier-prendre': 'dossier-claim',
        'dossier-statut': 'dossier-status',
        'dossier-fermer': 'dossier-close',
        'dossier-ajouter': 'dossier-add',
        'dossier-retirer': 'dossier-remove',
        'dossier-compte-rendu': 'dossier-transcript'
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

    const roleActions = new Set(['set-service-role', 'add-command-role', 'remove-command-role', 'configure-dossier-roles']);
    const channelActions = new Set(['set-log-channel', 'publish-service-panel', 'publish-dossier-panel', 'dossier-claim', 'dossier-status', 'dossier-close', 'dossier-transcript', 'purge', 'lock', 'unlock', 'slowmode']);
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
        return {
            targetType: 'channel',
            targetId: getAuditOptionValue(interaction, ['salon', 'channel', 'salon_id', 'channel_id']) || interaction.channelId || interaction.channel?.id || null
        };
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

    if (/^!(dossier-panel|ticket-panel)$/i.test(trimmed)) {
        return 'publish-dossier-panel';
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

    if (/^!(config-paie|payroll-config)\b/i.test(trimmed)) {
        return 'set-payroll-settings';
    }

    if (/^!(paie-ajustement|payroll-adjustment)\b/i.test(trimmed)) {
        return 'add-payroll-adjustment';
    }

    if (/^!(paie-archive|payroll-archive)$/i.test(trimmed)) {
        return 'archive-payroll';
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
    if (action === 'publish-service-panel' || action === 'publish-dossier-panel' || action === 'purge') {
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
    '◇ Sentinel | Modérateur',
    '✚ Sentinel | Support',
    'Sentinel | Fondateur',
    'Sentinel | Administrateur',
    'Sentinel | Moderateur',
    'Sentinel | Modérateur',
    'Sentinel | Support',
    'Co fondateur',
    'Co-fondateur',
    'Fondateur',
    'Administrateur',
    'Moderateur',
    'Modérateur',
    'Moderation',
    'Modération',
    'Modo',
    'Modo temp',
    'Staff',
    'Responsable',
    'Support'
];
const dossierPanelClickCooldowns = new Map();
const dossierCreateCooldowns = new Map();
const buttonActionCooldowns = new Map();
const pendingSensitiveConfirmations = new Map();
const longServiceAlertedKeys = new Set();

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
    const allowedRoleIds = new Set();
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

    const pushAllowedRole = role => {
        if (!role || allowedRoleIds.has(role.id)) {
            return;
        }

        allowedRoleIds.add(role.id);
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
    };

    for (const roleId of getCommandRoleIds(guild.id)) {
        pushAllowedRole(guild.roles.cache.get(roleId));
    }

    for (const roleId of getDossierRoleIds(guild.id)) {
        pushAllowedRole(guild.roles.cache.get(roleId));
    }

    for (const roleName of SENTINEL_STAFF_ROLES) {
        pushAllowedRole(findRoleByName(guild, roleName));
    }

    return overwrites;
}

function buildDossierPanelEmbed(guild, requester, language = 'fr') {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: t(language, 'dossierPanelTitle'),
        description: t(language, 'dossierPanelDescription'),
        requester,
        thumbnail: guild.iconURL(),
        language
    });
}

function buildDossierPanelComponents(language = 'fr') {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:support')
                .setLabel(t(language, 'dossierSupportLabel'))
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📁'),
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:report')
                .setLabel(t(language, 'dossierReportLabel'))
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚨'),
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:recruitment')
                .setLabel(t(language, 'dossierRecruitmentLabel'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧭')
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:partnership')
                .setLabel(t(language, 'dossierPartnershipLabel'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🤝'),
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:other')
                .setLabel(t(language, 'dossierOtherLabel'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧾')
        )
    ];
}

async function publishDossierPanel(channel, requester, language = 'fr', member = null) {
    assertDossierPanelQuota(channel.guild.id, language, member);

    const message = await channel.send({
        embeds: [buildDossierPanelEmbed(channel.guild, requester, language)],
        components: buildDossierPanelComponents(language)
    });

    recordDossierPanel(channel.guild.id, channel.id, message.id, requester?.id || null);
    return message;
}

function buildDossierOpenModal(dossierType, language = 'fr') {
    const meta = getDossierTypeMeta(dossierType, language);

    return new ModalBuilder()
        .setCustomId(`sentinel_dossier_open:${meta.key}`)
        .setTitle(`${t(language, 'dossierModalTitle')} - ${meta.label}`.slice(0, 45))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('subject')
                    .setLabel(t(language, 'dossierModalSubject'))
                    .setPlaceholder(t(language, 'dossierModalSubjectPlaceholder'))
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(120)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel(t(language, 'dossierModalDescription'))
                    .setPlaceholder(t(language, 'dossierModalDescriptionPlaceholder'))
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1500)
                    .setRequired(true)
            )
        );
}

function buildDossierControlComponents(language = 'fr', options = {}) {
    const statusOptions = Object.entries(DOSSIER_STATUSES)
        .filter(([key]) => key !== 'closed')
        .map(([key, value]) => ({
            label: value[language === 'en' ? 'en' : 'fr'],
            value: key
        }));

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:claim')
                .setLabel(language === 'en' ? 'Take over' : 'Prendre en charge')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:transcript')
                .setLabel(language === 'en' ? 'Transcript' : 'Compte rendu')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧾'),
            new ButtonBuilder()
                .setCustomId('sentinel_dossier:close')
                .setLabel(language === 'en' ? 'Close dossier' : 'Clôturer le dossier')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        ),
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('sentinel_dossier_status')
                .setPlaceholder(language === 'en' ? 'Update dossier status' : 'Modifier le statut du dossier')
                .addOptions(statusOptions)
        )
    ];
}

function parseDossierChannelTopic(topic) {
    const match = /^sentinel-(?:dossier|ticket):(\d{17,20}):([a-z-]+)(?::(\d+))?/.exec(String(topic || ''));

    if (!match) {
        return null;
    }

    return {
        ownerUserId: match[1],
        type: normalizeDossierType(match[2]),
        dossierId: match[3] ? Number(match[3]) : null
    };
}

function isDossierChannel(channel) {
    return Boolean(parseDossierChannelTopic(channel?.topic));
}

function memberCanManageDossier(member) {
    return Boolean(member && (
        hasDossierRoleAccess(member)
        || hasCommandRoleAccess(member)
        || member.permissions.has(PermissionsBitField.Flags.ManageChannels)
        || member.permissions.has(PermissionsBitField.Flags.Administrator)
    ));
}

function getDossierChannelFromInteraction(interaction) {
    if (!interaction.channel || !isDossierChannel(interaction.channel)) {
        return null;
    }

    return interaction.channel;
}

async function buildDossierTranscript(channel, dossier, language = 'fr') {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const sortedMessages = messages
        ? Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        : [];
    const createdAt = dossier?.createdAt || dossier?.created_at || null;
    const closedAt = dossier?.closedAt || dossier?.closed_at || null;
    const duration = createdAt
        ? formatDuration((closedAt ? new Date(closedAt).getTime() : Date.now()) - new Date(createdAt).getTime())
        : null;
    const header = language === 'en'
        ? [
            `Sentinel dossier #${dossier?.id || 'unknown'}`,
            `Channel: #${channel.name}`,
            `Requester: ${dossier?.ownerUserId || 'unknown'}`,
            `Type: ${dossier?.type || 'support'}`,
            `Status: ${getDossierStatusLabel(dossier?.status || 'open', language)}`,
            `Referent: ${dossier?.referentUserId || 'none'}`,
            `Subject: ${dossier?.subject || 'none'}`,
            `Description: ${dossier?.description || 'none'}`,
            `Duration: ${duration || 'unknown'}`,
            `Generated: ${new Date().toISOString()}`
        ]
        : [
            `Dossier Sentinel #${dossier?.id || 'inconnu'}`,
            `Salon : #${channel.name}`,
            `Demandeur : ${dossier?.ownerUserId || 'inconnu'}`,
            `Type : ${dossier?.type || 'support'}`,
            `Statut : ${getDossierStatusLabel(dossier?.status || 'open', language)}`,
            `Référent : ${dossier?.referentUserId || 'aucun'}`,
            `Sujet : ${dossier?.subject || 'aucun'}`,
            `Description : ${dossier?.description || 'aucune'}`,
            `Durée : ${duration || 'inconnue'}`,
            `Généré : ${new Date().toISOString()}`
        ];
    const lines = sortedMessages.map(message => {
        const content = message.content || '[embed/fichier/bouton]';
        return `[${new Date(message.createdTimestamp).toISOString()}] ${message.author?.tag || message.author?.id || 'inconnu'}: ${content.replace(/\s+/g, ' ').slice(0, 1800)}`;
    });

    return [...header, '', ...lines].join('\n');
}

async function sendDossierTranscript(channel, dossier, actor, language = 'fr') {
    const transcript = await buildDossierTranscript(channel, dossier, language);
    const fileName = `dossier-sentinel-${dossier?.id || channel.id}.txt`;
    const attachment = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: fileName });
    const logChannel = getLogChannel(channel.guild);
    const createdAt = dossier?.createdAt || dossier?.created_at || null;
    const closedAt = dossier?.closedAt || dossier?.closed_at || new Date().toISOString();
    const duration = createdAt
        ? formatDuration(new Date(closedAt).getTime() - new Date(createdAt).getTime())
        : null;
    const dossierType = getDossierTypeMeta(dossier?.type || 'support', language).label;
    const status = getDossierStatusLabel(dossier?.status || 'open', language);
    const archiveEmbed = new EmbedBuilder()
        .setColor(SENTINEL_COLORS.neutral)
        .setTitle(language === 'en' ? 'Sentinel | Ticket archive' : 'Sentinel | Archive de dossier')
        .setDescription(language === 'en'
            ? `Transcript generated for ${channel}.`
            : `Compte rendu généré pour ${channel}.`
        )
        .addFields(
            {
                name: language === 'en' ? 'Dossier' : 'Dossier',
                value: `#${dossier?.id || channel.id}`,
                inline: true
            },
            {
                name: language === 'en' ? 'Type' : 'Type',
                value: dossierType,
                inline: true
            },
            {
                name: language === 'en' ? 'Status' : 'Statut',
                value: status,
                inline: true
            },
            {
                name: language === 'en' ? 'Requester' : 'Demandeur',
                value: dossier?.ownerUserId ? `<@${dossier.ownerUserId}>` : (language === 'en' ? 'unknown' : 'inconnu'),
                inline: true
            },
            {
                name: language === 'en' ? 'Referent' : 'Référent',
                value: dossier?.referentUserId ? `<@${dossier.referentUserId}>` : (language === 'en' ? 'none' : 'aucun'),
                inline: true
            },
            {
                name: language === 'en' ? 'Closed by' : 'Clôturé par',
                value: `${actor}`,
                inline: true
            },
            {
                name: language === 'en' ? 'Duration' : 'Durée',
                value: duration || (language === 'en' ? 'unknown' : 'inconnue'),
                inline: true
            },
            {
                name: language === 'en' ? 'Subject' : 'Sujet',
                value: truncateAuditValue(dossier?.subject || (language === 'en' ? 'none' : 'aucun'), 1000),
                inline: false
            }
        )
        .setTimestamp();

    if (logChannel) {
        const sent = await logChannel.send({
            embeds: [archiveEmbed],
            files: [attachment]
        }).catch(() => null);

        return {
            sentToLogChannel: Boolean(sent),
            logChannelId: logChannel.id
        };
    }

    const sent = await channel.send({
        embeds: [archiveEmbed],
        files: [attachment]
    }).catch(() => null);

    return {
        sentToLogChannel: false,
        logChannelId: null,
        sentInDossier: Boolean(sent)
    };
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
        || hasSentinelStaffRole(member);
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

function isProtectedButtonAction(customId) {
    return [
        'sentinel_dossier:claim',
        'sentinel_dossier:transcript',
        'sentinel_dossier:close',
        'sentinel_ticket:close'
    ].includes(customId);
}

async function handleSentinelButton(interaction, handler) {
    const language = interaction.inGuild() ? getGuildLanguage(interaction.guildId) : 'fr';

    if (isProtectedButtonAction(interaction.customId)
        && await rejectDuplicateButtonAction(interaction, language)) {
        return;
    }

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
    const language = getGuildLanguage(interaction.guild.id);
    const rawType = interaction.customId.startsWith('sentinel_dossier:')
        ? interaction.customId.split(':')[1]
        : (interaction.customId === 'sentinel_ticket:bug' ? 'bug' : 'support');
    const dossierType = normalizeDossierType(rawType);

    await interaction.guild.channels.fetch();
    const existingRecord = getOpenDossierForUser(interaction.guild.id, interaction.user.id);
    const existingTicket = existingRecord
        ? interaction.guild.channels.cache.get(existingRecord.channelId)
        : interaction.guild.channels.cache.find(channel =>
            channel.type === ChannelType.GuildText
            && parseDossierChannelTopic(channel.topic)?.ownerUserId === interaction.user.id
        );

    if (existingTicket) {
        return interaction.reply({
            content: t(language, 'dossierAlreadyOpen', { channel: existingTicket }),
            flags: MessageFlags.Ephemeral
        });
    }

    const creationCooldown = getCooldownRemaining(dossierCreateCooldowns, interaction.guild.id, interaction.user.id);

    if (creationCooldown > 0) {
        return interaction.reply({
            content: t(language, 'dossierCooldown', {
                time: formatCooldownDuration(creationCooldown, language)
            }),
            flags: MessageFlags.Ephemeral
        });
    }

    const panelCooldown = getCooldownRemaining(dossierPanelClickCooldowns, interaction.guild.id, interaction.user.id);

    if (panelCooldown > 0) {
        return interaction.reply({
            content: t(language, 'dossierPanelCooldown', {
                time: formatCooldownDuration(panelCooldown, language)
            }),
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        assertOpenDossierQuota(interaction.guild.id, language, interaction.member);
    } catch (error) {
        return interaction.reply({
            content: error.message,
            flags: MessageFlags.Ephemeral
        });
    }

    setCooldown(dossierPanelClickCooldowns, interaction.guild.id, interaction.user.id, DOSSIER_PANEL_CLICK_COOLDOWN_MS);

    return interaction.showModal(buildDossierOpenModal(dossierType, language));
}

async function createDossierFromInteraction(interaction, dossierType, details = {}) {
    await interaction.guild.channels.fetch();
    const language = getGuildLanguage(interaction.guild.id);
    const meta = getDossierTypeMeta(dossierType, language);
    const subject = String(details.subject || '').trim().slice(0, 120);
    const descriptionText = String(details.description || '').trim().slice(0, 1500);
    const creationCooldown = getCooldownRemaining(dossierCreateCooldowns, interaction.guild.id, interaction.user.id);

    if (creationCooldown > 0) {
        throw new Error(t(language, 'dossierCooldown', {
            time: formatCooldownDuration(creationCooldown, language)
        }));
    }

    assertOpenDossierQuota(interaction.guild.id, language, interaction.member);

    const supportCategory = findCategoryByName(interaction.guild, [
        '✦ SENTINEL // SUPPORT',
        'SENTINEL // SUPPORT',
        interaction.channel?.parent?.name
    ]);
    const configuredCategoryId = getDossierTypeCategoryId(interaction.guild.id, dossierType);
    const configuredCategory = configuredCategoryId
        ? interaction.guild.channels.cache.get(configuredCategoryId)
        : null;
    const ticketChannel = await interaction.guild.channels.create({
        name: `${meta.channelPrefix}-${sanitizeTicketName(interaction.user.username)}`,
        type: ChannelType.GuildText,
        parent: configuredCategory?.type === ChannelType.GuildCategory
            ? configuredCategory.id
            : (supportCategory?.id || interaction.channel?.parentId || null),
        topic: `sentinel-dossier:${interaction.user.id}:${dossierType}`,
        permissionOverwrites: buildTicketOverwrites(interaction.guild, interaction.member),
        reason: `Creation dossier Sentinel ${dossierType}`
    });
    const dossier = createDossierRecord(
        interaction.guild.id,
        ticketChannel.id,
        interaction.user.id,
        interaction.user.id,
        dossierType,
        {
            subject,
            description: descriptionText,
            priority: details.priority || 'normal'
        }
    );
    await ticketChannel.setTopic(`sentinel-dossier:${interaction.user.id}:${dossierType}:${dossier.id}`).catch(() => {});

    const description = [
        language === 'en'
            ? `${interaction.user}, this private channel is your Sentinel dossier.`
            : `${interaction.user}, ce salon privé est ton dossier Sentinel.`,
        subject
            ? (language === 'en' ? `**Subject:** ${subject}` : `**Sujet :** ${subject}`)
            : null,
        descriptionText
            ? (language === 'en' ? `**Description:** ${descriptionText}` : `**Description :** ${descriptionText}`)
            : null,
        '',
        ...meta.intro
    ].filter(line => line !== null);
    const embed = new EmbedBuilder()
        .setColor(meta.color)
        .setTitle(`${t(language, 'dossierOpenedTitle')} #${dossier.id}`)
        .setDescription(description.join('\n'))
        .addFields(
            { name: language === 'en' ? 'Type' : 'Type', value: `${meta.emoji} ${meta.label}`, inline: true },
            { name: language === 'en' ? 'Status' : 'Statut', value: getDossierStatusLabel(dossier.status, language), inline: true },
            { name: language === 'en' ? 'Referent' : 'Référent', value: language === 'en' ? 'None yet' : 'Aucun pour le moment', inline: true }
        )
        .setTimestamp();

    await ticketChannel.send({
        content: `${interaction.user}`,
        embeds: [embed],
        components: buildDossierControlComponents(language, {
            advanced: hasAdvancedAccess(interaction.member)
        })
    });
    await sendSentinelStaffLog(interaction.guild, `📁 Dossier Sentinel #${dossier.id} ouvert : ${ticketChannel} par ${interaction.user} (${dossierType}).`);
    setCooldown(dossierCreateCooldowns, interaction.guild.id, interaction.user.id, DOSSIER_CREATE_COOLDOWN_MS);

    return interaction.reply({
        content: t(language, 'dossierCreated', { channel: ticketChannel }),
        flags: MessageFlags.Ephemeral
    });
}

async function handleDossierOpenModal(interaction) {
    const match = /^sentinel_dossier_open:([a-z-]+)$/.exec(interaction.customId);

    if (!match) {
        return false;
    }

    const language = getGuildLanguage(interaction.guild.id);
    const dossierType = normalizeDossierType(match[1]);
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description');

    try {
        await createDossierFromInteraction(interaction, dossierType, { subject, description });
    } catch (error) {
        await interaction.reply({
            content: error.message || t(language, 'serviceError'),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    return true;
}

async function handleSentinelDossierClaimButton(interaction) {
    const language = getGuildLanguage(interaction.guild.id);
    const channel = getDossierChannelFromInteraction(interaction);

    if (!channel) {
        return interaction.reply({
            content: t(language, 'dossierNotInDossier'),
            flags: MessageFlags.Ephemeral
        });
    }

    if (!memberCanManageDossier(interaction.member)) {
        return interaction.reply({
            content: t(language, 'dossierClaimDenied'),
            flags: MessageFlags.Ephemeral
        });
    }

    const dossier = setDossierReferent(interaction.guild.id, channel.id, interaction.user.id);
    await channel.send(language === 'en'
        ? `✅ ${interaction.user} is now the dossier referent.`
        : `✅ ${interaction.user} prend ce dossier en charge.`
    ).catch(() => {});
    await sendSentinelStaffLog(interaction.guild, `✅ Dossier Sentinel #${dossier?.id || channel.id} pris en charge par ${interaction.user}.`);

    return interaction.reply({
        content: t(language, 'dossierClaimed', { member: interaction.user }),
        flags: MessageFlags.Ephemeral
    });
}

async function handleDossierStatusSelect(interaction) {
    const language = getGuildLanguage(interaction.guild.id);
    const channel = getDossierChannelFromInteraction(interaction);

    if (!channel) {
        await interaction.reply({
            content: t(language, 'dossierNotInDossier'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (!memberCanManageDossier(interaction.member)) {
        await interaction.reply({
            content: t(language, 'dossierStatusDenied'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const nextStatus = normalizeDossierStatus(interaction.values?.[0]);
    const dossier = updateDossierStatus(interaction.guild.id, channel.id, nextStatus);
    const label = getDossierStatusLabel(dossier?.status || nextStatus, language);

    await channel.send(language === 'en'
        ? `📌 ${interaction.user} updated the dossier status: **${label}**.`
        : `📌 ${interaction.user} a mis à jour le statut du dossier : **${label}**.`
    ).catch(() => {});

    await sendSentinelStaffLog(
        interaction.guild,
        language === 'en'
            ? `📌 Sentinel dossier #${dossier?.id || channel.id} status updated to **${label}** by ${interaction.user}.`
            : `📌 Statut du dossier Sentinel #${dossier?.id || channel.id} mis à jour sur **${label}** par ${interaction.user}.`
    );

    await interaction.reply({
        content: t(language, 'dossierStatusUpdated', { status: label }),
        flags: MessageFlags.Ephemeral
    });
    return true;
}

async function handleSentinelDossierTranscriptButton(interaction) {
    const language = getGuildLanguage(interaction.guild.id);
    const channel = getDossierChannelFromInteraction(interaction);

    if (!channel) {
        return interaction.reply({
            content: t(language, 'dossierNotInDossier'),
            flags: MessageFlags.Ephemeral
        });
    }

    if (!memberCanManageDossier(interaction.member)) {
        return interaction.reply({
            content: t(language, 'dossierClaimDenied'),
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const dossier = getDossierByChannel(interaction.guild.id, channel.id) || parseDossierChannelTopic(channel.topic);
    await sendDossierTranscript(channel, dossier, interaction.user, language);

    return interaction.editReply(t(language, 'dossierTranscriptDone'));
}

async function handleDossierInteraction(interaction, commandName, language) {
    const dossierCommands = new Set([
        'dossier-panel',
        'dossier-fermer',
        'dossier-ajouter',
        'dossier-retirer',
        'dossier-compte-rendu',
        'dossier-roles',
        'dossier-prendre',
        'dossier-statut'
    ]);

    if (!dossierCommands.has(commandName)) {
        return false;
    }

    if (commandName === 'dossier-panel') {
        if (!hasCommandRoleAccess(interaction.member)) {
            await interaction.reply({
                content: getCommandRoleAccessDeniedMessage(language),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const channel = interaction.options.getChannel('salon') || interaction.channel;

        if (!channel?.isTextBased?.()) {
            await interaction.reply({
                content: t(language, 'channelNotText'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        try {
            await publishDossierPanel(channel, interaction.user, language, interaction.member);
        } catch (error) {
            await interaction.reply({
                content: error.message,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        await interaction.reply({
            content: t(language, 'dossierPanelPublished', { channel }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'dossier-roles') {
        if (!hasCommandRoleAccess(interaction.member)) {
            await interaction.reply({
                content: getCommandRoleAccessDeniedMessage(language),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const action = interaction.options.getString('action') || 'voir';
        const role = interaction.options.getRole('role');

        if (action === 'voir' || action === 'view') {
            await interaction.reply({
                content: t(language, 'dossierRoleList', {
                    roles: formatDossierRoleList(interaction.guild.id, language)
                }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (!role) {
            await interaction.reply({
                content: t(language, 'adminRoleRequired'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (role.id === interaction.guild.id) {
            await interaction.reply({
                content: t(language, 'everyoneDenied'),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (action === 'retirer' || action === 'remove') {
            removeDossierRole(interaction.guild.id, role.id);
            await interaction.reply({
                content: t(language, 'dossierRoleRemoved', { role }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        addDossierRole(interaction.guild.id, role.id);
        await interaction.reply({
            content: t(language, 'dossierRoleAdded', { role }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const channel = getDossierChannelFromInteraction(interaction);

    if (!channel) {
        await interaction.reply({
            content: t(language, 'dossierCommandOutside'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (!memberCanManageDossier(interaction.member)) {
        await interaction.reply({
            content: getCommandRoleAccessDeniedMessage(language),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'dossier-compte-rendu') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const dossier = getDossierByChannel(interaction.guild.id, channel.id) || parseDossierChannelTopic(channel.topic);
        await sendDossierTranscript(channel, dossier, interaction.user, language);
        await interaction.editReply(t(language, 'dossierTranscriptDone'));
        return true;
    }

    if (commandName === 'dossier-prendre') {
        const dossier = setDossierReferent(interaction.guild.id, channel.id, interaction.user.id);
        await channel.send(language === 'en'
            ? `✅ ${interaction.user} is now the dossier referent.`
            : `✅ ${interaction.user} prend ce dossier en charge.`
        ).catch(() => {});
        await sendSentinelStaffLog(interaction.guild, `✅ Dossier Sentinel #${dossier?.id || channel.id} pris en charge par ${interaction.user}.`);

        await interaction.reply({
            content: t(language, 'dossierClaimed', { member: interaction.user }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'dossier-statut') {
        const nextStatus = normalizeDossierStatus(
            interaction.options.getString('statut') || interaction.options.getString('status')
        );
        const dossier = updateDossierStatus(interaction.guild.id, channel.id, nextStatus);
        const label = getDossierStatusLabel(dossier?.status || nextStatus, language);

        await channel.send(language === 'en'
            ? `📌 ${interaction.user} updated the dossier status: **${label}**.`
            : `📌 ${interaction.user} a mis à jour le statut du dossier : **${label}**.`
        ).catch(() => {});
        await sendSentinelStaffLog(
            interaction.guild,
            language === 'en'
                ? `📌 Sentinel dossier #${dossier?.id || channel.id} status updated to **${label}** by ${interaction.user}.`
                : `📌 Statut du dossier Sentinel #${dossier?.id || channel.id} mis à jour sur **${label}** par ${interaction.user}.`
        );

        await interaction.reply({
            content: t(language, 'dossierStatusUpdated', { status: label }),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'dossier-fermer') {
        await requestSensitiveConfirmation(interaction, {
            action: 'dossier-close',
            actionLabel: t(language, 'confirmDossierClose'),
            targetLabel: `#${channel.name}`,
            details: [
                language === 'en'
                    ? 'Sentinel will send the transcript, then close the channel.'
                    : 'Sentinel enverra le compte rendu, puis fermera le salon.'
            ],
            payload: {
                channelId: channel.id
            },
            language
        });
        return true;
    }

    const user = interaction.options.getUser('membre') || interaction.options.getUser('member');

    if (!user) {
        await interaction.reply({
            content: t(language, 'moderationUserRequired'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (commandName === 'dossier-ajouter') {
        await channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
            EmbedLinks: true
        }, { reason: `Ajout intervenant dossier Sentinel par ${interaction.user.tag}` });

        await interaction.reply({
            content: t(language, 'dossierAddDone', { member: user }),
            flags: MessageFlags.Ephemeral
        });
        await channel.send(language === 'en'
            ? `${user} has been added as a dossier participant.`
            : `${user} a été ajouté comme intervenant du dossier.`
        ).catch(() => {});
        return true;
    }

    const topic = parseDossierChannelTopic(channel.topic);

    if (topic?.ownerUserId === user.id) {
        await interaction.reply({
            content: language === 'en'
                ? 'The requester cannot be removed from their own dossier.'
                : 'Le demandeur ne peut pas être retiré de son propre dossier.',
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    await channel.permissionOverwrites.delete(user.id, `Retrait intervenant dossier Sentinel par ${interaction.user.tag}`).catch(async () => {
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: false }, { reason: `Retrait intervenant dossier Sentinel par ${interaction.user.tag}` });
    });

    await interaction.reply({
        content: t(language, 'dossierRemoveDone', { member: user }),
        flags: MessageFlags.Ephemeral
    });
    await channel.send(language === 'en'
        ? `${user} has been removed from this dossier.`
        : `${user} a été retiré du dossier.`
    ).catch(() => {});
    return true;
}

async function handleSentinelTicketCloseButton(interaction) {
    const language = getGuildLanguage(interaction.guild.id);
    const channel = getDossierChannelFromInteraction(interaction);
    const topic = parseDossierChannelTopic(interaction.channel?.topic);

    if (!channel || !topic) {
        return interaction.reply({
            content: t(language, 'dossierNotInDossier'),
            flags: MessageFlags.Ephemeral
        });
    }

    if (
        !memberCanManageDossier(interaction.member)
        && topic.ownerUserId !== interaction.user.id
    ) {
        return interaction.reply({
            content: t(language, 'dossierCloseDenied'),
            flags: MessageFlags.Ephemeral
        });
    }

    return requestSensitiveConfirmation(interaction, {
        action: 'dossier-close',
        actionLabel: t(language, 'confirmDossierClose'),
        targetLabel: `#${channel.name}`,
        details: [
            language === 'en'
                ? 'Sentinel will send the transcript, then close the channel.'
                : 'Sentinel enverra le compte rendu, puis fermera le salon.'
        ],
        payload: {
            channelId: channel.id
        },
        language
    });
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

        await requestSensitiveConfirmation(interaction, {
            action: 'purge',
            actionLabel: t(language, 'confirmPurge'),
            targetLabel: `${interaction.channel}`,
            details: [
                language === 'en'
                    ? `${amount} recent message(s) will be deleted if Discord allows it.`
                    : `${amount} message(s) récent(s) seront supprimés si Discord les autorise.`,
                language === 'en'
                    ? 'Messages older than 14 days cannot be removed by bulk purge.'
                    : 'Les messages de plus de 14 jours ne peuvent pas être supprimés par purge groupée.'
            ],
            payload: {
                channelId: interaction.channel.id,
                amount
            },
            language
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

        await requestSensitiveConfirmation(interaction, {
            action: 'ban',
            actionLabel: t(language, 'confirmBan'),
            targetLabel: target.label,
            details: [
                language === 'en'
                    ? `Reason: ${reason}`
                    : `Raison : ${reason}`,
                language === 'en'
                    ? `Messages to delete: ${deleteDays} day(s).`
                    : `Messages à supprimer : ${deleteDays} jour(s).`
            ],
            payload: {
                userId: target.userId,
                targetLabel: target.label,
                reason,
                deleteDays
            },
            language
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
        await requestSensitiveConfirmation(interaction, {
            action: 'kick',
            actionLabel: t(language, 'confirmKick'),
            targetLabel: `${member.user.tag}`,
            details: [
                language === 'en'
                    ? `Reason: ${reason}`
                    : `Raison : ${reason}`
            ],
            payload: {
                userId: member.id,
                targetLabel: member.user.tag,
                reason
            },
            language
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

async function fetchManagedCustomEmbedMessage(guildId, fallbackChannel, messageId) {
    const record = getCustomEmbedRecord(guildId, messageId);

    if (!record) {
        return { record: null, message: null, channel: null };
    }

    const guild = fallbackChannel?.guild || client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(record.channel_id)
        || await guild?.channels.fetch(record.channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        return { record: null, message: null, channel: null };
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message || message.author.id !== client.user.id) {
        deleteCustomEmbedRecord(guildId, messageId);
        return { record: null, message: null, channel: null };
    }

    return { record, message, channel };
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

    if (subcommand === 'creer') {
        const channelError = getCustomEmbedChannelError(interaction.guild, channel, null, language);

        if (channelError) {
            await interaction.reply({
                content: channelError,
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        const quota = getCustomEmbedQuota(guildId, interaction.member);

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
                quota: formatCustomEmbedQuota(guildId, language, interaction.member)
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

    const { record, message, channel: embedChannel } = await fetchManagedCustomEmbedMessage(guildId, channel, messageId);

    if (!record || !message) {
        await interaction.reply({
            content: t(language, 'customEmbedNotFound'),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const channelError = getCustomEmbedChannelError(interaction.guild, embedChannel, null, language);

    if (channelError) {
        await interaction.reply({
            content: channelError,
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
    startDatabaseBackupSchedule();

    startDashboardServer({
        client,
        build: SENTINEL_BUILD,
        invitePermissions: BOT_INVITE_PERMISSIONS,
        maxTimeoutDuration: MAX_TIMEOUT_DURATION,
        maxTempbanDuration: MAX_TEMPBAN_DURATION,
        helpers: {
            addCommandRole,
            addCustomEmbedRecord,
            addDossierRole,
            addModerationCase,
            addSession,
            addWeeklyPayAdjustment,
            archiveWeeklyPayroll,
            buildCustomAnnouncementEmbed,
            buildCustomEmbedData,
            buildCustomEmbedPayload,
            buildDossierPanelComponents,
            buildDossierPanelEmbed,
            buildServicePanelComponents,
            clearLongServiceAlert,
            clearLongServiceAlertsForGuild,
            closeDossierRecord,
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
            getDatabaseBackupStatus,
            getDossierRoleIds,
            getGuildConfig,
            getGuildLanguage,
            getGuildPayRoleSettings,
            getAutoRole,
            getAssignableRoleError,
            getDossierByChannel,
            getDossierPanelQuota,
            getDossierTypeSettings,
            getLogChannel,
            getOpenDossierCount,
            getFilteredModerationCases,
            getModerationCases,
            getModerationCase,
            getGuildPaySettings,
            getRecentDossiers,
            getRecentModerationCases,
            getModerationTargetError,
            getCustomEmbedChannelError,
            getReason,
            getServiceRole,
            getServiceSummary,
            getSentinelSyncStatus,
            getSlashCommandStatus,
            getTemporaryBan,
            getTopService,
            getTopWeek,
            getWeeklyPayroll,
            getUserData,
            getUserSessions,
            getUserSessionCount,
            getUserTargetErrorById,
            hasCommandRoleAccess,
            hasAdvancedAccess,
            memberCanManageDossier,
            hasModerationAccess,
            isAdvancedGuild,
            normalizeUserId,
            parseDurationToMs,
            parseSlowmodeToSeconds,
            removeDossierRole,
            removeCommandRole,
            removeGuildPayRoleSettings,
            recordDossierPanel,
            resetGuild,
            resetUser,
            sendModerationLog,
            sendDossierTranscript,
            sendServiceLog,
            setDossierReferent,
            setGuildLanguage,
            setWeeklyPaymentStatus,
            updateGuildPayRoleSettings,
            updateDossierStatus,
            updateDossierTypeCategory,
            syncServiceState,
            updateGuildPaySettings,
            updateGuildConfig,
            updateCustomEmbedRecord,
            updateModerationCaseReason,
            updateUserTime,
            upsertTemporaryBan
        }
    });

    try {
        await refreshSlashCommandStatus();
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

    setInterval(refreshSlashCommandStatus, 6 * 60 * 60 * 1000);
    setInterval(updateAllSentinelStatusPanels, 5 * 60 * 1000);
    setInterval(processExpiredTemporaryBans, 60 * 1000);
    setInterval(checkLongServiceAlerts, LONG_SERVICE_ALERT_INTERVAL_MS);
    setTimeout(checkLongServiceAlerts, 60 * 1000);
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

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const payload = {
        embeds: [buildServerOnboardingEmbed(guild, client.user)],
        components: buildServerOnboardingComponents('fr')
    };
    const canSendOnboarding = candidate => Boolean(
        me
        && typeof candidate?.isTextBased === 'function'
        && candidate.isTextBased()
        && candidate.permissionsFor(me)?.has([
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks
        ])
    );
    const channel = canSendOnboarding(guild.systemChannel)
        ? guild.systemChannel
        : guild.channels.cache.find(canSendOnboarding);

    if (channel) {
        await channel.send(payload).catch(() => {});
        return;
    }

    const owner = await guild.fetchOwner().catch(() => null);
    await owner?.send(payload).catch(() => {});
});

client.on(Events.GuildMemberAdd, async member => {
    await assignConfiguredAutoRole(member);
});

client.on(Events.InteractionCreate, async interaction => {
    saveDiscordUserProfile(interaction.user);

    if (DEBUG_INTERACTIONS && interaction.isButton()) {
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
    if (interaction.isModalSubmit()) {
        if (await handleDossierOpenModal(interaction)) {
            return;
        }
    }

    if (interaction.isChatInputCommand()) {
        const guildId = interaction.guild.id;
        const language = getGuildLanguage(guildId);
        const commandName = resolveCommandName(interaction.commandName);

        if (commandName === 'aide') {
            return interaction.reply({
                embeds: [buildHelpEmbed(interaction.guild, interaction.user, HELP_PAGE_DEFAULT, interaction.member)],
                components: buildHelpMenuComponents(interaction.guild, interaction.user, HELP_PAGE_DEFAULT, interaction.member),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'dashboard') {
            return interaction.reply({
                embeds: [buildDashboardEmbed(interaction.guild, interaction.user)],
                components: buildDashboardComponents(language),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'premium') {
            return interaction.reply({
                embeds: [buildPremiumEmbed(interaction.guild, interaction.user, interaction.member)],
                components: buildPremiumComponents(language),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'support') {
            return interaction.reply({
                embeds: [buildSupportEmbed(interaction.guild, interaction.user)],
                components: buildSupportComponents(language),
                flags: MessageFlags.Ephemeral
            });
        }

        if (isAdvancedCommand(commandName) && !hasAdvancedAccess(interaction.member)) {
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

        if (await handleDossierInteraction(interaction, commandName, language)) {
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

        if (commandName === 'config-autorole') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const action = interaction.options.getString('action') || 'voir';
            const role = interaction.options.getRole('role');

            if (['voir', 'view'].includes(action)) {
                const config = getGuildConfig(guildId);
                const currentRole = config.autoRoleId ? `<@&${config.autoRoleId}>` : 'Désactivé';

                return interaction.reply({
                    content: t(language, 'autoRoleCurrent', { role: currentRole }),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['desactiver', 'disable'].includes(action)) {
                updateGuildConfig(guildId, {
                    autoRoleId: null
                });

                return interaction.reply({
                    content: t(language, 'autoRoleDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const error = getAssignableRoleError(interaction.guild, role, language);

            if (error) {
                return interaction.reply({
                    content: error,
                    flags: MessageFlags.Ephemeral
                });
            }

            updateGuildConfig(guildId, {
                autoRoleId: role.id
            });

            return interaction.reply({
                content: t(language, 'autoRoleSet', { role }),
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

        if (commandName === 'config-paie') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const hourlyRate = interaction.options.getNumber('montant')
                ?? interaction.options.getNumber('hourly_rate');
            const currency = interaction.options.getString('devise')
                || interaction.options.getString('currency')
                || DEFAULT_PAY_CURRENCY;
            const payRole = interaction.options.getRole('role');
            const removeRoleRate = interaction.options.getBoolean('retirer')
                ?? interaction.options.getBoolean('remove')
                ?? false;

            if (payRole) {
                if (!hasAdvancedAccess(interaction.member, guildId)) {
                    return interaction.reply({
                        content: getAdvancedUnavailableMessage(language, commandName),
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (payRole.id === interaction.guild.id) {
                    return interaction.reply({
                        content: t(language, 'everyoneDenied'),
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (removeRoleRate) {
                    removeGuildPayRoleSettings(guildId, payRole.id);

                    return interaction.reply({
                        content: t(language, 'payRoleSettingsRemoved', { role: payRole }),
                        flags: MessageFlags.Ephemeral
                    });
                }

                const roleSettings = updateGuildPayRoleSettings(guildId, payRole.id, hourlyRate);

                if (!roleSettings) {
                    return interaction.reply({
                        content: t(language, 'payRateInvalid'),
                        flags: MessageFlags.Ephemeral
                    });
                }

                return interaction.reply({
                    content: t(language, 'payRoleSettingsUpdated', {
                        role: payRole,
                        rate: formatPayAmount(roleSettings.hourlyRate, getGuildPaySettings(guildId).currency, language)
                    }),
                    flags: MessageFlags.Ephemeral
                });
            }

            const settings = updateGuildPaySettings(guildId, hourlyRate, currency);

            if (!settings) {
                return interaction.reply({
                    content: t(language, 'payRateInvalid'),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: t(language, 'paySettingsUpdated', {
                    rate: formatPayAmount(settings.hourlyRate, settings.currency, language)
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'paie-ajustement') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!hasAdvancedAccess(interaction.member, guildId)) {
                return interaction.reply({
                    content: getAdvancedUnavailableMessage(language, commandName),
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = interaction.options.getMember('membre');
            const user = interaction.options.getUser('membre');
            const userId = member?.id
                || user?.id
                || normalizeUserId(interaction.options.getString('utilisateur_id') || interaction.options.getString('user_id'));
            const type = interaction.options.getString('type');
            const amount = interaction.options.getNumber('montant') ?? interaction.options.getNumber('amount');
            const reason = interaction.options.getString('raison') || interaction.options.getString('reason') || '';
            const adjustment = userId
                ? addWeeklyPayAdjustment(guildId, userId, null, type, amount, reason, interaction.user.id)
                : null;

            if (!adjustment) {
                return interaction.reply({
                    content: t(language, 'payAdjustmentInvalid'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const settings = getGuildPaySettings(guildId);

            return interaction.reply({
                content: t(language, 'payAdjustmentAdded', {
                    member: member || user || `\`${userId}\``,
                    amount: formatSignedPayAmount(adjustment.amount, settings.currency, language),
                    type: getPayAdjustmentLabel(adjustment.type, language)
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'paie-archive') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const archive = archiveWeeklyPayroll(guildId, interaction.user.id, {
                guild: interaction.guild,
                language
            });

            return interaction.reply({
                content: t(language, 'payrollArchived', {
                    weekStart: archive.weekStart,
                    weekEnd: archive.weekEnd,
                    amount: archive.totals.totalAmountLabel
                }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (commandName === 'paie-marquer') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const member = interaction.options.getMember('membre');
            const user = interaction.options.getUser('membre');
            const userId = member?.id
                || user?.id
                || normalizeUserId(interaction.options.getString('utilisateur_id') || interaction.options.getString('user_id'));
            const paid = interaction.options.getBoolean('paye')
                ?? interaction.options.getBoolean('paid');
            const requestedWeekStart = interaction.options.getString('semaine')
                || interaction.options.getString('week')
                || null;

            if (!userId) {
                return interaction.reply({
                    content: t(language, 'payrollMarkTargetRequired'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (requestedWeekStart && !/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekStart)) {
                return interaction.reply({
                    content: t(language, 'payrollWeekInvalid'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const range = getWeekRange(requestedWeekStart);
            const payroll = getWeeklyPayroll(guildId, {
                guild: interaction.guild,
                language,
                weekStart: range.weekStart
            });
            const line = payroll.items.find(item => item.userId === userId);
            const targetLabel = member || user || `\`${userId}\``;

            if (!line) {
                return interaction.reply({
                    content: t(language, 'payrollMarkNoLine', { target: targetLabel }),
                    flags: MessageFlags.Ephemeral
                });
            }

            setWeeklyPaymentStatus(guildId, userId, range.weekStart, paid, interaction.user.id);

            return interaction.reply({
                content: t(language, 'payrollMarked', {
                    target: targetLabel,
                    status: t(language, paid ? 'payrollPaidStatus' : 'payrollUnpaidStatus'),
                    weekStart: payroll.weekStart,
                    weekEnd: payroll.weekEnd,
                    amount: line.amountLabel
                }),
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

        if (commandName === 'paie-semaine') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                embeds: [buildWeeklyPayrollEmbed(interaction.guild, interaction.user, {
                    isReferenceServer: hasAdvancedAccess(interaction.member)
                })],
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
            const isAdvancedServer = hasAdvancedAccess(interaction.member);

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
            if (!hasAdvancedAccess(interaction.member)) {
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
                isReferenceServer: hasAdvancedAccess(interaction.member)
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

            return requestSensitiveConfirmation(interaction, {
                action: 'reset-user',
                actionLabel: t(language, 'confirmResetUser'),
                targetLabel: formatResetTarget(member, userId, language),
                details: [
                    language === 'en'
                        ? 'The user total and saved sessions will be reset to zero.'
                        : 'Le total et les sessions enregistrées de cette personne seront remis à zéro.'
                ],
                payload: {
                    userId,
                    targetLabel: formatResetTarget(member, userId, language)
                },
                language
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
        if (interaction.customId === 'sentinel_dossier_status') {
            await handleDossierStatusSelect(interaction);
            return;
        }

        const handled = await handleHelpMenuInteraction(interaction);

        if (handled) {
            return;
        }
    }

    if (!interaction.isButton()) return;

    const buttonLanguage = getGuildLanguage(interaction.guild.id);

    if (await handleSensitiveConfirmationButton(interaction)) {
        return;
    }

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
        if (await rejectDuplicateButtonAction(interaction, buttonLanguage)) {
            return;
        }

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
        clearLongServiceAlertsForGuild(interaction.guild.id);

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

    if (
        interaction.customId.startsWith('sentinel_dossier:')
        && ['support', 'report', 'recruitment', 'partnership', 'other', 'complaint', 'admin', 'bug'].includes(interaction.customId.split(':')[1])
    ) {
        return handleSentinelButton(interaction, handleSentinelTicketButton);
    }

    if (interaction.customId === 'sentinel_dossier:bug' || interaction.customId === 'sentinel_ticket:create' || interaction.customId === 'sentinel_ticket:bug') {
        return handleSentinelButton(interaction, handleSentinelTicketButton);
    }

    if (interaction.customId === 'sentinel_dossier:claim') {
        return handleSentinelButton(interaction, handleSentinelDossierClaimButton);
    }

    if (interaction.customId === 'sentinel_dossier:transcript') {
        return handleSentinelButton(interaction, handleSentinelDossierTranscriptButton);
    }

    if (interaction.customId === 'sentinel_dossier:close' || interaction.customId === 'sentinel_ticket:close') {
        return handleSentinelButton(interaction, handleSentinelTicketCloseButton);
    }

    if (interaction.customId.startsWith('sentinel_vote:')) {
        return handleSentinelButton(interaction, handleSentinelVoteButton);
    }

    if (interaction.customId !== 'toggle_service') return;

    if (await rejectDuplicateButtonAction(interaction, buttonLanguage)) {
        return;
    }

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
            clearLongServiceAlert(guildId, userId);

            await member.roles.remove(role);

            await sendServiceLog(interaction.guild, member, 'end', {
                duration,
                totalTime,
                source: t(buttonLanguage, 'serviceLogSourceDiscord'),
                language: buttonLanguage
            });

            return interaction.reply({
                content: t(buttonLanguage, 'serviceLeft', { duration: formatDuration(duration) }),
                flags: MessageFlags.Ephemeral
            });
        }

        const serviceStartTime = Date.now();

        updateUserTime(guildId, userId, userData.totalTime, serviceStartTime);
        clearLongServiceAlert(guildId, userId);

        await member.roles.add(role);

        await sendServiceLog(interaction.guild, member, 'start', {
            startTime: serviceStartTime,
            source: t(buttonLanguage, 'serviceLogSourceDiscord'),
            language: buttonLanguage
        });

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
            embeds: [buildHelpEmbed(message.guild, message.author, HELP_PAGE_DEFAULT, message.member)],
            components: buildHelpMenuComponents(message.guild, message.author, HELP_PAGE_DEFAULT, message.member)
        });
    }

    if (/^!dashboard$/i.test(content)) {
        return message.reply({
            embeds: [buildDashboardEmbed(message.guild, message.author)],
            components: buildDashboardComponents(language)
        });
    }

    if (/^!premium$/i.test(content)) {
        return message.reply({
            embeds: [buildPremiumEmbed(message.guild, message.author, message.member)],
            components: buildPremiumComponents(language)
        });
    }

    if (/^!support$/i.test(content)) {
        return message.reply({
            embeds: [buildSupportEmbed(message.guild, message.author)],
            components: buildSupportComponents(language)
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

    if (/^!(reset-heures-all|reset-hours-all)$/i.test(content) && !hasAdvancedAccess(message.member)) {
        return message.reply(getAdvancedUnavailableMessage(language, 'reset-heures-all'));
    }

    if (isAdvancedTextCommand(content) && !hasAdvancedAccess(message.member)) {
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

    if (/^!(dossier-panel|ticket-panel)$/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        try {
            await publishDossierPanel(message.channel, message.author, language, message.member);
        } catch (error) {
            return message.reply(error.message);
        }

        return message.reply(t(language, 'dossierPanelPublished', { channel: message.channel }));
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

    if (/^!(config-autorole|autorole-config)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const args = content.split(/\s+/);
        const action = (args[1] || 'voir').toLowerCase();

        if (['voir', 'view', 'liste', 'list'].includes(action)) {
            const config = getGuildConfig(guildId);
            const currentRole = config.autoRoleId ? `<@&${config.autoRoleId}>` : 'Désactivé';

            return message.reply(t(language, 'autoRoleCurrent', { role: currentRole }));
        }

        if (['off', 'disable', 'desactiver', 'désactiver', 'retirer', 'remove'].includes(action)) {
            updateGuildConfig(guildId, {
                autoRoleId: null
            });

            return message.reply(t(language, 'autoRoleDisabled'));
        }

        const role = message.mentions.roles.first();
        const error = getAssignableRoleError(message.guild, role, language);

        if (error) {
            return message.reply(error);
        }

        updateGuildConfig(guildId, {
            autoRoleId: role.id
        });

        return message.reply(t(language, 'autoRoleSet', { role }));
    }

    if (/^!(config-paie|payroll-config)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const args = content.split(/\s+/);
        const hourlyRate = args[1] ? args[1].replace(',', '.') : null;
        const currency = args.slice(2).join(' ').trim() || DEFAULT_PAY_CURRENCY;
        const settings = updateGuildPaySettings(guildId, hourlyRate, currency);

        if (!settings) {
            return message.reply(t(language, 'payRateInvalid'));
        }

        return message.reply(t(language, 'paySettingsUpdated', {
            rate: formatPayAmount(settings.hourlyRate, settings.currency, language)
        }));
    }

    if (/^!(paie-ajustement|payroll-adjustment)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        if (!hasAdvancedAccess(message.member, guildId)) {
            return message.reply(getAdvancedUnavailableMessage(language, 'paie-ajustement'));
        }

        const args = content.split(/\s+/);
        const mentionedUser = message.mentions.users.first();
        const userId = mentionedUser?.id || normalizeUserId(args[1]);
        const type = args[2];
        const amount = args[3] ? args[3].replace(',', '.') : null;
        const reason = args.slice(4).join(' ').trim();
        const adjustment = userId
            ? addWeeklyPayAdjustment(guildId, userId, null, type, amount, reason, message.author.id)
            : null;

        if (!adjustment) {
            return message.reply(t(language, 'payAdjustmentInvalid'));
        }

        const settings = getGuildPaySettings(guildId);

        return message.reply(t(language, 'payAdjustmentAdded', {
            member: mentionedUser || `\`${userId}\``,
            amount: formatSignedPayAmount(adjustment.amount, settings.currency, language),
            type: getPayAdjustmentLabel(adjustment.type, language)
        }));
    }

    if (/^!(paie-archive|payroll-archive)$/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const archive = archiveWeeklyPayroll(guildId, message.author.id, {
            guild: message.guild,
            language
        });

        return message.reply(t(language, 'payrollArchived', {
            weekStart: archive.weekStart,
            weekEnd: archive.weekEnd,
            amount: archive.totals.totalAmountLabel
        }));
    }

    if (/^!(paie-semaine|weekly-payroll)$/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        return message.reply({
            embeds: [buildWeeklyPayrollEmbed(message.guild, message.author, {
                isReferenceServer: hasAdvancedAccess(message.member)
            })]
        });
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
        const isAdvancedServer = hasAdvancedAccess(message.member);
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
        if (!hasAdvancedAccess(message.member)) {
            return message.reply(getAdvancedUnavailableMessage(language));
        }

        const embed = buildServiceSummaryEmbed(message.guild, message.author);

        return message.reply({ embeds: [embed] });
    }

    if (content === '!top-service') {
        const classement = getTopService(guildId);
        const embed = buildTopServiceEmbed(message.author, classement, {
            isReferenceServer: hasAdvancedAccess(message.member)
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
        clearLongServiceAlert(guildId, userId);

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

