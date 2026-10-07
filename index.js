require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

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
const {
    BACKUP_PATTERN,
    COLD_ARCHIVE_PATTERN,
    compressExistingDatabaseBackups,
    createCompressedDatabaseBackup,
    evaluateStorageAlerts,
    getDatabaseStorageStatus,
    listDatabaseBackups,
    markStorageAlertsNotified,
    pruneDatabaseBackupGenerations,
    resolveManagedStorageFile,
    runDatabaseMaintenance,
    saveBackupVerification,
    stageDatabaseRestore,
    verifyDatabaseBackup
} = require('./database/storage');
const {
    createObjectStorageFromEnv,
    embedMediaObjectKey,
    getImageOptimizationOptions,
    optimizeEmbedImage
} = require('./database/object-storage');
const { syncSentinelServer } = require('./server-sync');
const { startDashboardServer } = require('./dashboard');
const operations = require('./operations');
const governance = require('./governance');
const { runDiscordStagingValidation, stagingValidationConfig } = require('./staging-validation');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const SENTINEL_REFERENCE_GUILD_ID = '1512509939044712569';
// Every Sentinel server receives the complete feature set. There is no paid access tier.
const ADVANCED_FEATURES_FREE = true;
const DEBUG_INTERACTIONS = String(process.env.DEBUG_INTERACTIONS || '').toLowerCase() === 'true';
const FREE_DOSSIER_PANEL_LIMIT = 1;
const FREE_OPEN_DOSSIER_LIMIT = 5;
const FREE_DOSSIER_HISTORY_LIMIT = 10;
const FREE_AUTOMOD_WORD_LIMIT = 25;
const PREMIUM_AUTOMOD_WORD_LIMIT = 200;
const AUTOMOD_FREE_ACTIONS = new Set(['log', 'delete', 'warn', 'timeout']);
const AUTOMOD_PREMIUM_ACTIONS = new Set([...AUTOMOD_FREE_ACTIONS, 'kick', 'ban']);
const AUTOMOD_DEFAULT_TIMEOUT_SECONDS = 10 * 60;
const AUTOMOD_FREE_MAX_TIMEOUT_SECONDS = 60 * 60;
const AUTOMOD_PREMIUM_MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
const AUTOMOD_MODERATOR_USER_ID = 'sentinel-automod';
const AUTOMOD_SPAM_BUCKET_MAX = 5000;
const AUTOMOD_RAID_BUCKET_MAX = 1000;
const OPERATIONS_INTERVAL_MS = 60 * 1000;
const DOSSIER_PANEL_CLICK_COOLDOWN_MS = 8 * 1000;
const DOSSIER_CREATE_COOLDOWN_MS = 90 * 1000;
const DOSSIER_ARCHIVE_DIR = process.env.DOSSIER_ARCHIVE_DIR
    || path.join(path.dirname(process.env.DATABASE_PATH || path.join(__dirname, 'database', 'service.db')), 'dossier-archives');
const DOSSIER_ARCHIVE_MAX_ATTACHMENT_BYTES = Math.max(
    Number.parseInt(process.env.DOSSIER_ARCHIVE_MAX_ATTACHMENT_MB || '25', 10),
    1
) * 1024 * 1024;
const DOSSIER_ARCHIVE_MAX_TOTAL_BYTES = Math.max(
    Number.parseInt(process.env.DOSSIER_ARCHIVE_MAX_TOTAL_MB || '100', 10),
    10
) * 1024 * 1024;
const DOSSIER_ARCHIVE_FETCH_TIMEOUT_MS = Math.max(
    Number.parseInt(process.env.DOSSIER_ARCHIVE_FETCH_TIMEOUT_SECONDS || '30', 10),
    5
) * 1000;
const DOSSIER_RETENTION_HOURS = Math.min(Math.max(
    Number.parseInt(process.env.DOSSIER_RETENTION_HOURS || process.env.DOSSIER_PREMIUM_RETENTION_HOURS || '24', 10),
    1
), 168);
const DOSSIER_MAINTENANCE_INTERVAL_MS = 10 * 60 * 1000;
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
    'payroll-adjustment',
    'maj-sentinel',
    'sentinel-update',
    'dossier-reouvrir',
    'reopen-ticket'
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
    advanced: 0xb76cff,
    service: 0xb21f4b
};
const SENTINEL_BUILD = 'community-suite-2026-10-04-standard-v1';
const CUSTOM_EMBED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const CUSTOM_EMBED_UPLOAD_MIMES = new Map([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp']
]);
const DEFAULT_DASHBOARD_URL = 'https://bot-service-discord-production.up.railway.app';
const DEFAULT_PUBLIC_SITE_URL = 'https://phileaszer.github.io/bot-service-discord/';
const SUPPORT_SERVER_URL = 'https://discord.gg/jzPqcUdVns';
const CREATOR_USER_IDS = new Set(
    String(process.env.SENTINEL_CREATOR_USER_ID || process.env.CREATOR_USER_ID || '')
        .split(/[,\s]+/)
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value))
);
const REFERENCE_SERVICE_ROLE_NAME = '🟢 Sentinel | En service';
const REFERENCE_LOG_CHANNEL_NAMES = ['📂｜logs'];
const REFERENCE_AUTO_ROLE_NAME = '◌ Sentinel | Nouveau';
const SERVER_PRESET_IDS = new Set(['standard', 'rp-modern', 'western', 'staff', 'community']);
const DATABASE_FILE_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'database', 'service.db');
const DATABASE_BACKUP_ENABLED = String(process.env.DATABASE_BACKUP_ENABLED || 'true').toLowerCase() !== 'false';
const DATABASE_BACKUP_INTERVAL_MS = Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_INTERVAL_HOURS || '24', 10),
    1
) * 60 * 60 * 1000;
const DATABASE_BACKUP_KEEP = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_KEEP || '14', 10), 1);
const DATABASE_BACKUP_DIR = process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(DATABASE_FILE_PATH), 'backups');
const DATABASE_COLD_ARCHIVE_DIR = process.env.DATABASE_COLD_ARCHIVE_DIR
    || path.join(path.dirname(DATABASE_FILE_PATH), 'cold-archives');
const EMBED_MEDIA_DIR = process.env.EMBED_MEDIA_DIR
    || path.join(path.dirname(DATABASE_FILE_PATH), 'embed-media');
const EMBED_MEDIA_TRASH_DAYS = Math.max(Number.parseInt(process.env.EMBED_MEDIA_TRASH_DAYS || '30', 10), 1);
const EMBED_MEDIA_MAX_BYTES = Math.max(Number.parseInt(process.env.EMBED_MEDIA_MAX_MB || '128', 10), 16)
    * 1024 * 1024;
const EMBED_MEDIA_QUOTA_BYTES = Math.max(
    Number.parseInt(process.env.EMBED_MEDIA_QUOTA_MB || process.env.EMBED_MEDIA_PREMIUM_QUOTA_MB || '512', 10),
    32
) * 1024 * 1024;
const EMBED_MEDIA_IMAGE_OPTIONS = getImageOptimizationOptions();
const embedMediaObjectStorage = createObjectStorageFromEnv();
const preparedCustomEmbedUploads = new WeakMap();
const DATABASE_BACKUP_COMPRESS = String(process.env.DATABASE_BACKUP_COMPRESS || 'true').toLowerCase() !== 'false';
const DATABASE_BACKUP_COMPRESSION_LEVEL = Math.min(Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_COMPRESSION_LEVEL || '9', 10),
    1
), 9);
const DATABASE_BACKUP_MAX_BYTES = Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_MAX_MB || '96', 10),
    16
) * 1024 * 1024;
const DATABASE_BACKUP_STARTUP_MIN_AGE_MS = Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_STARTUP_MIN_AGE_HOURS || '6', 10),
    1
) * 60 * 60 * 1000;
const DATABASE_BACKUP_DAILY = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_DAILY || '7', 10), 1);
const DATABASE_BACKUP_WEEKLY = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_WEEKLY || '8', 10), 1);
const DATABASE_BACKUP_MONTHLY = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_MONTHLY || '12', 10), 1);
const DATABASE_AUTOMOD_RETENTION_DAYS = Math.max(
    Number.parseInt(process.env.DATABASE_AUTOMOD_RETENTION_DAYS || '180', 10),
    30
);
const DATABASE_AUDIT_RETENTION_DAYS = Math.max(
    Number.parseInt(process.env.DATABASE_AUDIT_RETENTION_DAYS || '365', 10),
    90
);
const DATABASE_INCREMENTAL_VACUUM_ENABLED = String(
    process.env.DATABASE_INCREMENTAL_VACUUM_ENABLED || 'true'
).toLowerCase() !== 'false';
let lastSentinelServerSync = null;
let lastSentinelServerSyncResult = null;
let lastDatabaseBackup = null;
let lastDatabaseMaintenance = null;
let lastDatabaseBackupFailure = null;
let mediaScanPromise = null;
const runtimePerformance = {
    startedAt: new Date().toISOString(),
    dashboard: {
        requestCount: 0,
        errorCount: 0,
        slowRequestCount: 0,
        maxDurationMs: 0,
        recentDurations: [],
        recentSlowRequests: []
    },
    discord: {
        interactionCount: 0,
        errorCount: 0,
        slowInteractionCount: 0,
        maxDurationMs: 0,
        recentDurations: [],
        recentSlowInteractions: []
    }
};
const automodSpamBuckets = new Map();
const automodRaidBuckets = new Map();
let lastSlashCommandCheck = {
    status: 'pending',
    checkedAt: null,
    globalCount: null,
    guildCount: null,
    error: null
};
let databaseBackupTimer = null;
let databaseStorageCyclePromise = null;

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
        channelNotText: '❌ Choisis un salon texte encore présent et visible par Sentinel.',
        logChannelSet: '✅ Le salon de logs a été configuré sur {channel}.',
        statusChannelCurrent: 'État technique : {channel}\nSalon des nouveautés : {updatesChannel}\nDiffusion officielle : **{updates}**\nRôle mentionné : {pingRole}.',
        statusChannelSet: '✅ Le panneau d’état Sentinel sera maintenu dans {channel}.',
        statusChannelDisabled: '✅ Le salon statut Sentinel est désactivé sur ce serveur.',
        statusUpdatesChannelSet: '✅ Les annonces officielles Sentinel seront publiées dans {channel}.',
        statusUpdatesTested: '✅ Message de test envoyé dans {channel}.',
        statusUpdatesEnabled: '✅ Les nouveautés officielles Sentinel seront publiées dans le salon prévu à cet effet.',
        statusUpdatesDisabled: '✅ Les nouveautés officielles Sentinel ne seront plus publiées sur ce serveur.',
        statusUpdatesRoleSet: '✅ {role} sera mentionné lors des prochaines annonces officielles.',
        statusUpdatesRoleDisabled: '✅ Aucun rôle ne sera mentionné lors des annonces officielles.',
        statusChannelRequired: '❌ Choisis un salon pour cette action.',
        statusUpdatesChannelRequired: '❌ Choisis d’abord le salon des nouveautés avec `/config-statut action:Définir le salon des nouveautés salon:#salon`.',
        officialUpdateDenied: '❌ Cette commande est réservée à la créatrice de Sentinel.',
        officialUpdateSent: '✅ Mise à jour officielle publiée. Serveur Sentinel : **{referenceCount}** salon(s). Serveurs abonnés : **{subscriberCount}** salon(s).',
        officialUpdateNoTarget: '❌ Aucun salon de nouveautés disponible pour publier cette mise à jour.',
        payRateInvalid: '❌ Montant horaire invalide. Exemple : `/config-paie montant:500 devise:$`.',
        paySettingsUpdated: '✅ Paie RP configurée : **{rate}** par heure.',
        payRoleSettingsUpdated: '✅ Taux configuré pour {role} : **{rate}** par heure.',
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
        pingOk: '🏓 Pong ! Données internes OK. Latence Discord : **{ping}ms**',
        pingDbError: '❌ Le bot répond, mais les données internes ne répondent pas correctement.',
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
        serviceRoleEveryoneDenied: '❌ Le rôle de service ne peut pas être `@everyone`.\nChoisis un vrai rôle avec `/config-role`, puis réessaie.',
        serviceRoleManagedDenied: '❌ Sentinel ne peut pas gérer le rôle de service {role}, car il est contrôlé par une intégration Discord.\nChoisis un rôle classique avec `/config-role`, puis réessaie.',
        serviceRoleMissingManageRoles: '❌ Sentinel ne peut pas gérer le rôle de service, car il n’a pas la permission `Gérer les rôles`.\nAjoute cette permission au rôle Sentinel, puis réessaie.',
        serviceRoleTooHigh: '❌ Sentinel ne peut pas gérer le rôle de service {role}, car ce rôle est placé trop haut.\nMonte le rôle {botRole} au-dessus de {role} dans les réglages Discord, puis réessaie.',
        serviceLeftLog: '🔴 {member} a quitté son service.\n⏱️ Durée : **{duration}**\n📊 Total : **{total}**',
        serviceLeft: '🔴 Tu as quitté ton service.\n⏱️ Durée de cette session : **{duration}**',
        serviceStartedLog: '🟢 {member} a pris son service.',
        serviceStarted: '🟢 Tu as pris ton service.',
        serviceAlreadyStarted: '🟢 Tu es déjà en service.',
        serviceNotStarted: '🔴 Tu n’es pas en service pour le moment.',
        serviceError: '❌ Sentinel n’a pas pu modifier ton service.\nVérifie les permissions du bot ou lance `/diagnostic` pour voir quoi corriger.',
        servicePanelTitle: 'Sentinel | Bureau de service',
        servicePanelDescription: '`Registre opérationnel`\nDéclare ta prise de poste, clôture ton service ou consulte les agents déjà déployés.\nChaque action ajuste ton badge de service et archive la présence dans le registre.',
        servicePanelStartName: 'Ouverture de service',
        servicePanelStartValue: '🟢 Active ton badge et inscrit ton départ dans le registre.',
        servicePanelEndName: 'Clôture de service',
        servicePanelEndValue: '🔴 Ferme ton service, retire le badge et consigne la durée.',
        servicePanelRegistryName: 'Registre vivant',
        servicePanelRegistryValue: '📊 `Ma fiche` affiche ton relevé. `Déploiement` montre les agents actuellement sur le terrain.',
        servicePanelFooter: 'Bureau Sentinel - registre de présence',
        showMyHoursLabel: 'Ma fiche',
        activeLabel: 'Déploiement',
        toggleLabel: 'Service',
        startServiceLabel: 'Prendre poste',
        endServiceLabel: 'Fin de poste',
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
        serviceLogSourceDashboard: 'Console',
        staffLogTitle: 'Sentinel | Journal',
        helpTitle: 'Sentinel | Briefing',
        helpDescription: 'Commence ici. Ce briefing explique comment ouvrir le poste Sentinel, préparer les grades et tenir le registre.',
        moderationAccessDenied: '❌ Tu n’as pas accès à cette commande de modération.',
        moderationAccessDeniedSpecific: '❌ Tu ne peux pas lancer cette sanction.\nÀ faire : donne la permission “{permission}” à ton rôle Discord, ou ajoute ton rôle aux rôles autorisés de Sentinel.',
        moderationBotPermissionMissing: '❌ Sentinel n’a pas la permission Discord nécessaire pour faire cette action.\nOuvre la console > Sécurité > Diagnostic, ou ajoute la permission manquante au rôle Sentinel.',
        moderationBotPermissionMissingSpecific: '❌ Sentinel ne peut pas faire cette action.\nÀ faire : ajoute la permission “{permission}” au rôle Sentinel, puis réessaie.',
        moderationDiscordRefused: '❌ Discord a refusé l’action.\nÀ faire : {fix}',
        moderationBotPermissionFix: 'ajoute la permission “{permission}” au rôle Sentinel, puis réessaie.',
        moderationRoleOrderFix: 'place mon rôle au-dessus de “{role}”, puis réessaie.',
        moderationBanNotFound: '❌ Aucun bannissement Discord n’a été trouvé pour cet ID.\nÀ faire : vérifie l’ID Discord complet, puis réessaie seulement si cette personne est encore bannie.',
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
        customEmbedBotPermissionMissing: '❌ Sentinel doit pouvoir voir le salon, envoyer des messages et intégrer des liens dans {channel}.',
        customEmbedChannelViewMissing: '❌ Sentinel ne voit pas {channel}.\nÀ faire : autorise Sentinel à voir ce salon.',
        customEmbedChannelSendMissing: '❌ Sentinel ne peut pas écrire dans {channel}.\nÀ faire : autorise Sentinel à envoyer des messages dans ce salon.',
        customEmbedChannelEmbedMissing: '❌ Sentinel ne peut pas envoyer d’embed dans {channel}.\nÀ faire : ajoute la permission “Intégrer des liens” à Sentinel dans ce salon.',
        customEmbedChannelAttachMissing: '❌ Sentinel ne peut pas joindre de fichier dans {channel}.\nÀ faire : ajoute la permission “Joindre des fichiers” à Sentinel dans ce salon.',
        customEmbedMentionPermissionMissing: '❌ Sentinel ne peut pas mentionner ce rôle.\nÀ faire : rends le rôle mentionnable, ou donne à Sentinel la permission de mentionner les rôles.',
        customEmbedInvalidColor: '❌ Couleur invalide. Utilise `rose`, `cyan`, `vert`, `rouge`, `violet` ou un code comme `#ff2d9a`.',
        customEmbedInvalidUrl: '❌ URL invalide pour {field}. Utilise une URL `https://` ou indique `retirer` pendant une modification.',
        customEmbedInvalidUpload: '❌ Image locale invalide. Utilise une image PNG, JPG, WebP ou GIF.',
        customEmbedUploadTooLarge: '❌ Image locale trop lourde. Garde un total maximum de 8 Mo par embed.',
        customEmbedMediaQuotaReached: '❌ Quota d’images atteint pour ce serveur ({used} Mo sur {limit} Mo). Supprime un ancien embed ou libère de l’espace avant de réessayer.',
        customEmbedTooLarge: '❌ Cet embed est trop long. Garde le titre sous 256 caractères, le message sous 4000 caractères et le total sous 6000 caractères.',
        customEmbedLimitReached: 'Ce serveur peut conserver **{limit}** embeds Sentinel actifs. Tu peux modifier ou supprimer les embeds existants depuis le dashboard.',
        customEmbedCreated: '✅ Embed Sentinel envoyé dans {channel}. ID du message : `{messageId}`.\n{quota}',
        customEmbedEdited: '✅ Embed Sentinel `{messageId}` modifié. Les modifications ne consomment pas de quota.',
        customEmbedDeleted: '✅ Embed Sentinel `{messageId}` supprimé. Son emplacement est libéré.',
        customEmbedNotFound: '❌ Aucun embed Sentinel géré ne correspond à cet ID.',
        customEmbedNoEditFields: '❌ Indique au moins un champ à modifier : titre, message, couleur, image, miniature ou footer.',
        customEmbedQuotaUnlimited: 'Quota sans limite.',
        dossierPanelTitle: 'Sentinel | Bureau d’accueil',
        dossierPanelDescription: '`Accueil confidentiel`\nChoisis la nature de ta demande. Sentinel préparera un espace réservé avec les personnes habilitées et gardera le suivi dans un dossier clair.',
        dossierPanelAccessName: 'Accueil',
        dossierPanelAccessValue: 'Chaque demande ouvre un espace confidentiel pour échanger avec l’équipe concernée.',
        dossierPanelFollowName: 'Suivi',
        dossierPanelFollowValue: 'Le statut, le référent et le compte rendu restent rattachés au même dossier.',
        dossierPanelBeforeName: 'Avant d’ouvrir',
        dossierPanelBeforeValue: 'Prépare un sujet court et les éléments utiles : faits, personnes concernées, moment, preuves ou contexte.',
        dossierPanelFooter: 'Sentinel - bureau d’accueil',
        dossierSupportLabel: 'Assistance',
        dossierReportLabel: 'Signalement',
        dossierRecruitmentLabel: 'Candidature',
        dossierPartnershipLabel: 'Alliance',
        dossierOtherLabel: 'Requête',
        dossierModalTitle: 'Ouvrir un dossier',
        dossierModalSubject: 'Sujet',
        dossierModalSubjectPlaceholder: 'Exemple : demande d’assistance administrative',
        dossierModalDescription: 'Description',
        dossierModalDescriptionPlaceholder: 'Explique ta demande avec les détails utiles.',
        dossierOpenedTitle: 'Sentinel | Dossier ouvert',
        dossierAlreadyOpen: 'Tu as déjà un dossier ouvert : {channel}',
        dossierCooldown: '⏳ Attends encore **{time}** avant d’ouvrir un nouveau dossier.',
        dossierPanelCooldown: '⏳ Le panneau vient déjà d’être utilisé. Réessaie dans **{time}**.',
        dossierPanelLimitReached: 'Ce serveur peut conserver **{limit}** panneau de dossiers. Garde ce panneau ou supprime-le avant d’en publier un autre.',
        dossierOpenLimitReached: 'Ce serveur a déjà **{limit}** dossiers ouverts. Ferme un dossier terminé avant d’en ouvrir un autre.',
        dossierCreated: 'Dossier créé : {channel}',
        dossierNotInDossier: 'Ce bouton doit être utilisé dans un dossier Sentinel.',
        dossierCloseDenied: 'Seul le demandeur ou un membre autorisé peut clôturer ce dossier.',
        dossierClosed: 'Dossier clôturé. Le compte rendu a été transmis, puis l’espace va être fermé.',
        dossierClaimed: 'Dossier pris en charge par {member}.',
        dossierClaimDenied: 'Tu dois avoir un rôle autorisé pour prendre en charge ce dossier.',
        dossierStatusDenied: 'Tu dois avoir un rôle autorisé pour modifier le statut du dossier.',
        dossierStatusUpdated: 'Statut du dossier mis à jour : **{status}**.',
        dossierRoleAdded: '✅ {role} peut maintenant prendre en charge et gérer les dossiers Sentinel.',
        dossierRoleRemoved: '✅ {role} ne peut plus prendre en charge les dossiers Sentinel.',
        dossierRoleList: 'Rôles de dossiers Sentinel :\n{roles}',
        dossierRoleListEmpty: 'Aucun rôle de dossiers configuré. Les rôles autorisés à gérer Sentinel et les membres avec les permissions Discord adaptées peuvent gérer les dossiers.',
        dossierAddDone: '✅ {member} a été ajouté comme intervenant du dossier.',
        dossierRemoveDone: '✅ {member} a été retiré du dossier.',
        dossierCommandOutside: '❌ Cette commande doit être utilisée dans un salon de dossier Sentinel.',
        dossierTranscriptDone: '✅ Compte rendu préparé.',
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
        channelNotText: '❌ Choose a text channel that still exists and is visible to Sentinel.',
        logChannelSet: '✅ The log channel has been set to {channel}.',
        statusChannelCurrent: 'Technical status: {channel}\nUpdates channel: {updatesChannel}\nOfficial delivery: **{updates}**\nMentioned role: {pingRole}.',
        statusChannelSet: '✅ The Sentinel status panel will be maintained in {channel}.',
        statusChannelDisabled: '✅ The Sentinel status channel is disabled on this server.',
        statusUpdatesChannelSet: '✅ Official Sentinel announcements will be posted in {channel}.',
        statusUpdatesTested: '✅ Test message sent in {channel}.',
        statusUpdatesEnabled: '✅ Official Sentinel updates will be posted in the dedicated updates channel.',
        statusUpdatesDisabled: '✅ Official Sentinel updates will no longer be posted on this server.',
        statusUpdatesRoleSet: '✅ {role} will be mentioned for future official announcements.',
        statusUpdatesRoleDisabled: '✅ No role will be mentioned for official announcements.',
        statusChannelRequired: '❌ Choose a channel for this action.',
        statusUpdatesChannelRequired: '❌ First choose an updates channel with `/status-channel`, then select “Set updates channel”.',
        officialUpdateDenied: '❌ This command is reserved for the Sentinel creator.',
        officialUpdateSent: '✅ Official update published. Sentinel server: **{referenceCount}** channel(s). Subscribed servers: **{subscriberCount}** channel(s).',
        officialUpdateNoTarget: '❌ No updates channel is available for this announcement.',
        payRateInvalid: '❌ Invalid hourly amount. Example: `/payroll-config hourly_rate:500 currency:$`.',
        paySettingsUpdated: '✅ RP payroll configured: **{rate}** per hour.',
        payRoleSettingsUpdated: '✅ Rate configured for {role}: **{rate}** per hour.',
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
        pingOk: '🏓 Pong! Internal data OK. Discord latency: **{ping}ms**',
        pingDbError: '❌ The bot is responding, but internal data is not responding correctly.',
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
        serviceRoleEveryoneDenied: '❌ The service role cannot be `@everyone`.\nChoose a real role with `/config-role`, then try again.',
        serviceRoleManagedDenied: '❌ Sentinel cannot manage the service role {role}, because it is controlled by a Discord integration.\nChoose a normal role with `/config-role`, then try again.',
        serviceRoleMissingManageRoles: '❌ Sentinel cannot manage the service role because it does not have the `Manage Roles` permission.\nAdd this permission to the Sentinel role, then try again.',
        serviceRoleTooHigh: '❌ Sentinel cannot manage the service role {role}, because this role is too high.\nMove {botRole} above {role} in Discord settings, then try again.',
        serviceLeftLog: '🔴 {member} ended their service.\n⏱️ Duration: **{duration}**\n📊 Total: **{total}**',
        serviceLeft: '🔴 You ended your service.\n⏱️ Session duration: **{duration}**',
        serviceStartedLog: '🟢 {member} started their service.',
        serviceStarted: '🟢 You started your service.',
        serviceAlreadyStarted: '🟢 You are already on duty.',
        serviceNotStarted: '🔴 You are not on duty right now.',
        serviceError: '❌ Sentinel could not update your service.\nCheck the bot permissions or run `/diagnostic` to see what to fix.',
        servicePanelTitle: 'Sentinel | Duty desk',
        servicePanelDescription: '`Operations ledger`\nOpen your duty post, close your service, or inspect agents already deployed.\nEach action updates your duty badge and records presence in the ledger.',
        servicePanelStartName: 'Duty opening',
        servicePanelStartValue: '🟢 Enables your badge and records your departure in the ledger.',
        servicePanelEndName: 'Duty closure',
        servicePanelEndValue: '🔴 Closes duty, removes the badge, and records the duration.',
        servicePanelRegistryName: 'Live ledger',
        servicePanelRegistryValue: '📊 `My file` shows your record. `Deployment` shows agents currently in the field.',
        servicePanelFooter: 'Sentinel desk - presence ledger',
        showMyHoursLabel: 'My file',
        activeLabel: 'Deployment',
        toggleLabel: 'Duty',
        startServiceLabel: 'Open post',
        endServiceLabel: 'Close post',
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
        moderationAccessDeniedSpecific: '❌ You cannot run this moderation action.\nFix: give your Discord role the “{permission}” permission, or add your role to Sentinel allowed roles.',
        moderationBotPermissionMissing: '❌ Sentinel does not have the required Discord permission for this action.\nOpen Dashboard > Security > Diagnostic, or add the missing permission to Sentinel role.',
        moderationBotPermissionMissingSpecific: '❌ Sentinel cannot perform this action.\nFix: add the “{permission}” permission to the Sentinel role, then try again.',
        moderationDiscordRefused: '❌ Discord refused the action.\nFix: {fix}',
        moderationBotPermissionFix: 'add the “{permission}” permission to the Sentinel role, then try again.',
        moderationRoleOrderFix: 'move my role above “{role}”, then try again.',
        moderationBanNotFound: '❌ No Discord ban was found for this ID.\nFix: check the full Discord ID, then try again only if this user is still banned.',
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
        customEmbedBotPermissionMissing: '❌ Sentinel must be able to view the channel, send messages, and embed links in {channel}.',
        customEmbedChannelViewMissing: '❌ Sentinel cannot see {channel}.\nFix: allow Sentinel to view this channel.',
        customEmbedChannelSendMissing: '❌ Sentinel cannot write in {channel}.\nFix: allow Sentinel to send messages in this channel.',
        customEmbedChannelEmbedMissing: '❌ Sentinel cannot send embeds in {channel}.\nFix: give Sentinel the “Embed Links” permission in this channel.',
        customEmbedChannelAttachMissing: '❌ Sentinel cannot attach files in {channel}.\nFix: give Sentinel the “Attach Files” permission in this channel.',
        customEmbedMentionPermissionMissing: '❌ Sentinel cannot mention this role.\nFix: make the role mentionable, or give Sentinel permission to mention roles.',
        customEmbedInvalidColor: '❌ Invalid color. Use `pink`, `cyan`, `green`, `red`, `purple`, or a code like `#ff2d9a`.',
        customEmbedInvalidUrl: '❌ Invalid URL for {field}. Use an `https://` URL, or enter `remove` while editing.',
        customEmbedInvalidUpload: '❌ Invalid local image. Use a PNG, JPG, WebP, or GIF image.',
        customEmbedUploadTooLarge: '❌ Local image too large. Keep the total under 8 MB per embed.',
        customEmbedMediaQuotaReached: '❌ This server reached its image quota ({used} MB of {limit} MB). Delete an older embed or free storage before trying again.',
        customEmbedTooLarge: '❌ This embed is too long. Keep the title under 256 characters, the message under 4000 characters, and the total under 6000 characters.',
        customEmbedLimitReached: 'This server can keep **{limit}** active Sentinel embeds. You can edit or delete existing embeds from the dashboard.',
        customEmbedCreated: '✅ Sentinel embed sent in {channel}. Message ID: `{messageId}`.\n{quota}',
        customEmbedEdited: '✅ Sentinel embed `{messageId}` edited. Edits do not use quota.',
        customEmbedDeleted: '✅ Sentinel embed `{messageId}` deleted. Its slot is now available.',
        customEmbedNotFound: '❌ No managed Sentinel embed matches this ID.',
        customEmbedNoEditFields: '❌ Provide at least one field to edit: title, message, color, image, thumbnail, or footer.',
        customEmbedQuotaUnlimited: 'Unlimited quota.',
        dossierPanelTitle: 'Sentinel | Reception desk',
        dossierPanelDescription: '`Confidential reception`\nChoose the nature of your request. Sentinel will prepare a reserved space with authorized personnel and keep the follow-up inside one clear dossier.',
        dossierPanelAccessName: 'Reception',
        dossierPanelAccessValue: 'Each request opens a confidential space for discussion with the assigned team.',
        dossierPanelFollowName: 'Follow-up',
        dossierPanelFollowValue: 'Status, referent, and written record stay attached to the same dossier.',
        dossierPanelBeforeName: 'Before opening',
        dossierPanelBeforeValue: 'Prepare a short subject and the useful elements: facts, people involved, moment, proof, or context.',
        dossierPanelFooter: 'Sentinel - reception desk',
        dossierSupportLabel: 'Assistance',
        dossierReportLabel: 'Report',
        dossierRecruitmentLabel: 'Application',
        dossierPartnershipLabel: 'Alliance',
        dossierOtherLabel: 'Request',
        dossierModalTitle: 'Open a dossier',
        dossierModalSubject: 'Subject',
        dossierModalSubjectPlaceholder: 'Example: administrative assistance request',
        dossierModalDescription: 'Description',
        dossierModalDescriptionPlaceholder: 'Explain your request with useful details.',
        dossierOpenedTitle: 'Sentinel | Dossier opened',
        dossierAlreadyOpen: 'You already have an open dossier: {channel}',
        dossierCooldown: '⏳ Wait another **{time}** before opening a new dossier.',
        dossierPanelCooldown: '⏳ This panel was just used. Try again in **{time}**.',
        dossierPanelLimitReached: 'This server can keep **{limit}** dossier panel. Keep this panel or delete it before publishing another one.',
        dossierOpenLimitReached: 'This server already has **{limit}** open dossiers. Close a completed dossier before opening another one.',
        dossierCreated: 'Dossier created: {channel}',
        dossierNotInDossier: 'This button must be used inside a Sentinel dossier.',
        dossierCloseDenied: 'Only the requester or an authorized member can close this dossier.',
        dossierClosed: 'Dossier closed. The written record has been sent, then the space will be sealed.',
        dossierClaimed: 'Dossier taken over by {member}.',
        dossierClaimDenied: 'You need an authorized role to take over this dossier.',
        dossierStatusDenied: 'You need an authorized role to update this dossier status.',
        dossierStatusUpdated: 'Dossier status updated: **{status}**.',
        dossierRoleAdded: '✅ {role} can now take over and manage Sentinel dossiers.',
        dossierRoleRemoved: '✅ {role} can no longer take over Sentinel dossiers.',
        dossierRoleList: 'Sentinel dossier roles:\n{roles}',
        dossierRoleListEmpty: 'No dossier role configured. Roles allowed to manage Sentinel and members with suitable Discord permissions can manage dossiers.',
        dossierAddDone: '✅ {member} has been added as a dossier participant.',
        dossierRemoveDone: '✅ {member} has been removed from this dossier.',
        dossierCommandOutside: '❌ This command must be used inside a Sentinel dossier channel.',
        dossierTranscriptDone: '✅ Written record prepared.',
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

function normalizeServerPreset(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return SERVER_PRESET_IDS.has(normalized) ? normalized : 'standard';
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
        support: 'support',
        'config-langue': 'config-langue',
        language: 'config-langue',
        'config-role': 'config-role',
        'config-autorole': 'config-autorole',
        'autorole-config': 'config-autorole',
        'config-logs': 'config-logs',
        'config-channel': 'config-logs',
        'config-statut': 'config-statut',
        'status-channel': 'config-statut',
        'maj-sentinel': 'maj-sentinel',
        'sentinel-update': 'maj-sentinel',
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
        'paie-historique': 'paie-historique',
        'payroll-history': 'paie-historique',
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
        'dossier-reouvrir': 'dossier-reouvrir',
        'reopen-ticket': 'dossier-reouvrir',
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
        title: isEnglish ? 'Sentinel | Dashboard' : 'Sentinel | Console',
        description: isEnglish
            ? [
                'Open the web dashboard to manage Sentinel from your browser.',
                '',
                '`1.` Log in with Discord.',
                '`2.` Choose the server.',
                '`3.` Configure service, logs, embeds, moderation, and audit from one place.',
                '',
                '**Current release:** public demonstration. No subscription or charge is active today. Some advanced features may become paid later, but a free part of Sentinel will remain available. The details will be announced before any change.',
                '',
                dashboardUrl
            ].join('\n')
            : [
                'Ouvre la console Sentinel pour gérer ton poste depuis le site.',
                '',
                '`1.` Connecte-toi avec ton compte.',
                '`2.` Choisis le serveur.',
                '`3.` Prépare le service, le registre, les annonces, la sécurité et l’historique au même endroit.',
                '',
                '**Version actuelle :** démonstration publique. Aucun abonnement ni prélèvement n’est actif aujourd’hui. Certaines options avancées pourront devenir payantes plus tard, mais une partie gratuite de Sentinel restera disponible. Les détails seront annoncés avant tout changement.',
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
                .setLabel(language === 'en' ? 'Open dashboard' : 'Ouvrir la console')
                .setStyle(ButtonStyle.Link)
                .setURL(getDashboardUrl('/dashboard'))
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
                'Need help with setup, permissions, service tracking, moderation, embeds, or dossiers?',
                'Use the support server for questions, bug reports and follow-up.'
            ].join('\n')
            : [
                'Besoin d’aide pour l’installation, les permissions, les services, la modération, les embeds ou les dossiers ?',
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

function recordDashboardRequestMetric({ durationMs, status, method, route }) {
    const bucket = runtimePerformance.dashboard;
    const duration = Math.max(Number(durationMs) || 0, 0);
    bucket.requestCount += 1;
    bucket.errorCount += Number(status) >= 500 ? 1 : 0;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, duration);
    bucket.recentDurations.push(duration);
    bucket.recentDurations = bucket.recentDurations.slice(-500);

    if (duration >= 1000) {
        bucket.slowRequestCount += 1;
        bucket.recentSlowRequests.unshift({
            method: String(method || 'GET').slice(0, 12),
            route: String(route || '/').replace(/\d{17,20}/g, ':id').slice(0, 160),
            status: Number(status) || 0,
            durationMs: Math.round(duration),
            occurredAt: new Date().toISOString()
        });
        bucket.recentSlowRequests.length = Math.min(bucket.recentSlowRequests.length, 25);
    }
}

function recordDiscordInteractionMetric(interaction, durationMs, failed = false) {
    const bucket = runtimePerformance.discord;
    const duration = Math.max(Number(durationMs) || 0, 0);
    bucket.interactionCount += 1;
    bucket.errorCount += failed ? 1 : 0;
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, duration);
    bucket.recentDurations.push(duration);
    bucket.recentDurations = bucket.recentDurations.slice(-500);

    if (duration >= 1500) {
        bucket.slowInteractionCount += 1;
        bucket.recentSlowInteractions.unshift({
            type: interaction?.isChatInputCommand?.() ? 'command' : (interaction?.isButton?.() ? 'button' : 'interaction'),
            name: String(interaction?.commandName || interaction?.customId || 'unknown').slice(0, 120),
            durationMs: Math.round(duration),
            failed: Boolean(failed),
            occurredAt: new Date().toISOString()
        });
        bucket.recentSlowInteractions.length = Math.min(bucket.recentSlowInteractions.length, 25);
    }
}

function percentile(values, ratio) {
    if (!values.length) {
        return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    return Math.round(sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)] * 10) / 10;
}

function getRuntimePerformanceStatus() {
    const dashboard = runtimePerformance.dashboard;
    const discord = runtimePerformance.discord;

    return {
        startedAt: runtimePerformance.startedAt,
        dashboard: {
            requestCount: dashboard.requestCount,
            errorCount: dashboard.errorCount,
            slowRequestCount: dashboard.slowRequestCount,
            p50Ms: percentile(dashboard.recentDurations, 0.5),
            p95Ms: percentile(dashboard.recentDurations, 0.95),
            maxDurationMs: Math.round(dashboard.maxDurationMs * 10) / 10,
            recentSlowRequests: dashboard.recentSlowRequests.map(item => ({ ...item }))
        },
        discord: {
            interactionCount: discord.interactionCount,
            errorCount: discord.errorCount,
            slowInteractionCount: discord.slowInteractionCount,
            p50Ms: percentile(discord.recentDurations, 0.5),
            p95Ms: percentile(discord.recentDurations, 0.95),
            maxDurationMs: Math.round(discord.maxDurationMs * 10) / 10,
            gatewayPingMs: Math.max(Number(client.ws.ping) || 0, 0),
            recentSlowInteractions: discord.recentSlowInteractions.map(item => ({ ...item }))
        }
    };
}

async function createDatabaseBackup(reason = 'auto') {
    const backup = await createCompressedDatabaseBackup(db, {
        backupDirectory: DATABASE_BACKUP_DIR,
        reason,
        compress: DATABASE_BACKUP_COMPRESS,
        compressionLevel: DATABASE_BACKUP_COMPRESSION_LEVEL
    });
    pruneDatabaseBackupGenerations(DATABASE_BACKUP_DIR, {
        daily: DATABASE_BACKUP_DAILY,
        weekly: DATABASE_BACKUP_WEEKLY,
        monthly: DATABASE_BACKUP_MONTHLY,
        maxBytes: DATABASE_BACKUP_MAX_BYTES
    });
    lastDatabaseBackup = {
        createdAt: new Date().toISOString(),
        fileName: backup.fileName,
        reason
    };

    return backup.fullPath;
}

async function notifyFounderStorageAlerts(alerts) {
    const pending = (alerts || []).filter(alert => alert.shouldNotify);

    if (!pending.length || !CREATOR_USER_IDS.size) {
        return { sent: false, keys: [] };
    }

    const payload = {
        embeds: [new EmbedBuilder()
            .setColor(SENTINEL_COLORS.warning)
            .setTitle('Sentinel | Alerte de conservation')
            .setDescription(pending.map(alert => `• ${alert.message}`).join('\n'))
            .addFields({
                name: 'Contrôle',
                value: 'Ouvre la Console fondateur puis le Centre de maintenance pour consulter le relevé et les copies protégées.'
            })
            .setTimestamp()]
    };
    let sent = false;

    for (const userId of CREATOR_USER_IDS) {
        const user = await client.users.fetch(userId).catch(() => null);

        if (user && await user.send(payload).then(() => true).catch(() => false)) {
            sent = true;
        }
    }

    if (sent) {
        markStorageAlertsNotified(db, pending.map(alert => alert.key));
    }

    return { sent, keys: sent ? pending.map(alert => alert.key) : [] };
}

function shouldCreateStartupBackup() {
    const latest = listDatabaseBackups(DATABASE_BACKUP_DIR)[0] || null;

    return !latest || Date.now() - latest.mtimeMs >= DATABASE_BACKUP_STARTUP_MIN_AGE_MS;
}

async function runDatabaseStorageCycle(reason = 'auto', { forceBackup = false } = {}) {
    if (databaseStorageCyclePromise) {
        return databaseStorageCyclePromise;
    }

    databaseStorageCyclePromise = (async () => {
        fs.mkdirSync(DATABASE_BACKUP_DIR, { recursive: true });

        const compression = DATABASE_BACKUP_COMPRESS
            ? await compressExistingDatabaseBackups(
                DATABASE_BACKUP_DIR,
                DATABASE_BACKUP_COMPRESSION_LEVEL
            )
            : { compressedCount: 0, reclaimedBytes: 0 };

        fs.mkdirSync(DATABASE_COLD_ARCHIVE_DIR, { recursive: true });
        fs.mkdirSync(path.join(EMBED_MEDIA_DIR, 'objects'), { recursive: true });

        pruneDatabaseBackupGenerations(DATABASE_BACKUP_DIR, {
            daily: DATABASE_BACKUP_DAILY,
            weekly: DATABASE_BACKUP_WEEKLY,
            monthly: DATABASE_BACKUP_MONTHLY,
            maxBytes: DATABASE_BACKUP_MAX_BYTES
        });

        const createBackup = DATABASE_BACKUP_ENABLED && (
            forceBackup
            || reason !== 'startup'
            || shouldCreateStartupBackup()
        );
        let backupPath = null;
        let verification = null;

        try {
            backupPath = createBackup
                ? await createDatabaseBackup(reason)
                : listDatabaseBackups(DATABASE_BACKUP_DIR)[0]?.fullPath || null;

            if (backupPath) {
                verification = await verifyDatabaseBackup(backupPath);
                saveBackupVerification(db, verification);

                if (verification.status !== 'ok') {
                    throw new Error(verification.errorMessage || 'La verification de la sauvegarde a echoue.');
                }
            }

            lastDatabaseBackupFailure = null;
        } catch (error) {
            lastDatabaseBackupFailure = {
                occurredAt: new Date().toISOString(),
                message: String(error.message || error).slice(0, 500)
            };
            console.error('Erreur sauvegarde Sentinel :', error);
        }

        const maintenance = runDatabaseMaintenance(db, {
            automodRetentionDays: DATABASE_AUTOMOD_RETENTION_DAYS,
            auditRetentionDays: DATABASE_AUDIT_RETENTION_DAYS,
            archiveDirectory: DATABASE_COLD_ARCHIVE_DIR,
            enableIncrementalVacuum: DATABASE_INCREMENTAL_VACUUM_ENABLED
        });
        const media = await scanCustomEmbedMediaOrphans(reason === 'startup' ? 25 : 100).catch(error => ({
            error: String(error.message || error).slice(0, 500),
            checked: 0,
            orphaned: 0,
            synchronized: 0,
            purged: { links: 0, objects: 0, bytes: 0 }
        }));

        lastDatabaseMaintenance = {
            ...maintenance,
            reason,
            compressedBackups: compression.compressedCount,
            reclaimedBackupBytes: compression.reclaimedBytes,
            backupVerification: verification,
            media
        };

        const status = getDatabaseBackupStatus();
        const alerts = evaluateStorageAlerts(db, status, {
            latestBackupAt: status.latestVerifiedAt || status.latestAt,
            backupFailure: lastDatabaseBackupFailure?.message || null,
            backupMaxAgeHours: Math.max(36, Math.round(DATABASE_BACKUP_INTERVAL_MS / 3600000) + 12)
        });
        await notifyFounderStorageAlerts(alerts);

        const backupLabel = backupPath
            ? path.basename(backupPath)
            : 'recente, aucune copie dupliquee';
        console.log([
            'Entretien stockage Sentinel termine',
            `sauvegarde=${backupLabel}`,
            `anciennes copies compressees=${compression.compressedCount}`,
            `sessions expirees=${maintenance.cleanup.expiredSessions}`,
            `journaux automod archives=${maintenance.cleanup.automodEvents}`,
            `journaux dashboard archives=${maintenance.cleanup.dashboardAuditLogs}`,
            `medias orphelins=${media.orphaned}`,
            `verification=${verification?.status || 'absente'}`,
            `duree=${maintenance.durationMs}ms`
        ].join(' | '));

        return {
            backupPath,
            compression,
            verification,
            maintenance,
            media,
            alerts
        };
    })().finally(() => {
        databaseStorageCyclePromise = null;
    });

    return databaseStorageCyclePromise;
}

async function reportDatabaseStorageCycleFailure(error) {
    lastDatabaseBackupFailure = {
        occurredAt: new Date().toISOString(),
        message: String(error?.message || error).slice(0, 500)
    };

    try {
        const status = getDatabaseBackupStatus();
        const alerts = evaluateStorageAlerts(db, status, {
            latestBackupAt: status.latestVerifiedAt || status.latestAt,
            backupFailure: lastDatabaseBackupFailure.message
        });
        await notifyFounderStorageAlerts(alerts);
    } catch (alertError) {
        console.error('Erreur alerte stockage Sentinel :', alertError);
    }
}

function startDatabaseBackupSchedule() {
    if (databaseBackupTimer) {
        return;
    }

    runDatabaseStorageCycle('startup').catch(async error => {
        console.error('Erreur entretien stockage au demarrage :', error);
        await reportDatabaseStorageCycleFailure(error);
    });

    databaseBackupTimer = setInterval(() => {
        runDatabaseStorageCycle('auto', { forceBackup: true }).catch(async error => {
            console.error('Erreur entretien stockage planifie :', error);
            await reportDatabaseStorageCycleFailure(error);
        });
    }, DATABASE_BACKUP_INTERVAL_MS);
    databaseBackupTimer.unref();
}

function getDatabaseBackupStatus() {
    try {
        const status = getDatabaseStorageStatus(db, {
            databasePath: DATABASE_FILE_PATH,
            backupDirectory: DATABASE_BACKUP_DIR,
            archiveDirectory: DATABASE_COLD_ARCHIVE_DIR,
            mediaDirectory: EMBED_MEDIA_DIR,
            mediaMaxBytes: EMBED_MEDIA_MAX_BYTES,
            backupKeep: DATABASE_BACKUP_KEEP,
            backupDaily: DATABASE_BACKUP_DAILY,
            backupWeekly: DATABASE_BACKUP_WEEKLY,
            backupMonthly: DATABASE_BACKUP_MONTHLY,
            backupMaxBytes: DATABASE_BACKUP_MAX_BYTES,
            automodRetentionDays: DATABASE_AUTOMOD_RETENTION_DAYS,
            auditRetentionDays: DATABASE_AUDIT_RETENTION_DAYS,
            lastBackup: lastDatabaseBackup,
            lastMaintenance: lastDatabaseMaintenance,
            lastBackupFailure: lastDatabaseBackupFailure,
            backupEnabled: DATABASE_BACKUP_ENABLED,
            backupIntervalHours: Math.round(DATABASE_BACKUP_INTERVAL_MS / 60 / 60 / 1000),
            runtimePerformance: getRuntimePerformanceStatus()
        });

        status.media.objectStorage = embedMediaObjectStorage.status();
        status.media.quotaBytes = EMBED_MEDIA_QUOTA_BYTES;
        status.media.webp = { ...EMBED_MEDIA_IMAGE_OPTIONS };
        return status;
    } catch (error) {
        return {
            enabled: DATABASE_BACKUP_ENABLED,
            error: 'Storage status unavailable.',
            lastMaintenance: lastDatabaseMaintenance
        };
    }
}

function resolveMaintenanceFile(kind, fileName) {
    if (kind === 'backup') {
        const fullPath = resolveManagedStorageFile(DATABASE_BACKUP_DIR, fileName, BACKUP_PATTERN);
        return fullPath ? {
            fullPath,
            fileName: path.basename(fullPath),
            contentType: fullPath.toLowerCase().endsWith('.gz') ? 'application/gzip' : 'application/x-sqlite3'
        } : null;
    }

    if (kind === 'archive') {
        const fullPath = resolveManagedStorageFile(DATABASE_COLD_ARCHIVE_DIR, fileName, COLD_ARCHIVE_PATTERN);
        return fullPath ? { fullPath, fileName: path.basename(fullPath), contentType: 'application/gzip' } : null;
    }

    return null;
}

async function runManualDatabaseMaintenance() {
    return runDatabaseStorageCycle('manual', { forceBackup: true });
}

async function verifyManagedDatabaseBackup(fileName) {
    const file = resolveMaintenanceFile('backup', fileName);

    if (!file) {
        throw new Error('Sauvegarde Sentinel introuvable.');
    }

    const check = await verifyDatabaseBackup(file.fullPath);
    saveBackupVerification(db, check);

    if (check.status !== 'ok') {
        lastDatabaseBackupFailure = { occurredAt: check.checkedAt, message: check.errorMessage };
        throw new Error(check.errorMessage || 'La verification de la sauvegarde a echoue.');
    }

    lastDatabaseBackupFailure = null;
    return check;
}

async function restoreManagedDatabaseBackup(fileName) {
    if (databaseStorageCyclePromise) {
        await databaseStorageCyclePromise;
    }

    const file = resolveMaintenanceFile('backup', fileName);

    if (!file) {
        throw new Error('Sauvegarde Sentinel introuvable.');
    }

    const safetyBackup = await createCompressedDatabaseBackup(db, {
        backupDirectory: DATABASE_BACKUP_DIR,
        reason: 'pre-restore',
        compress: true,
        compressionLevel: DATABASE_BACKUP_COMPRESSION_LEVEL
    });
    const safetyCheck = await verifyDatabaseBackup(safetyBackup.fullPath);
    saveBackupVerification(db, safetyCheck);

    if (safetyCheck.status !== 'ok') {
        throw new Error('La copie de securite avant restauration a echoue. Restauration annulee.');
    }

    const staged = await stageDatabaseRestore(file.fullPath, DATABASE_FILE_PATH);
    setTimeout(() => process.exit(0), 2500).unref();

    return {
        backupFile: staged.backupFile,
        safetyBackupFile: safetyBackup.fileName,
        restartScheduled: true
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
        process.env.SENTINEL_REFERENCE_GUILD_ID
    ]
        .flatMap(value => String(value || '').split(','))
        .map(value => value.trim())
        .filter(value => /^\d{17,20}$/.test(value));
}

function isAdvancedGuild(guildId) {
    return Boolean(ADVANCED_FEATURES_FREE && /^\d{17,20}$/.test(String(guildId || '')));
}

function isCreatorUser(userId) {
    return Boolean(userId && CREATOR_USER_IDS.has(String(userId)));
}

function canPublishOfficialSentinelUpdate(interaction) {
    return Boolean(
        interaction?.user?.id
        && (
            isCreatorUser(interaction.user.id)
            || (
                interaction.guild?.id === SENTINEL_REFERENCE_GUILD_ID
                && interaction.guild?.ownerId === interaction.user.id
            )
        )
    );
}

function getStaffRoleGuildIds() {
    return [
        SENTINEL_REFERENCE_GUILD_ID,
        process.env.SENTINEL_REFERENCE_GUILD_ID
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

function hasAdvancedAccess(member, guildId = null) {
    const resolvedGuildId = guildId || member?.guild?.id;
    return isAdvancedGuild(resolvedGuildId);
}

function isAdvancedCommand(commandName) {
    return ADVANCED_COMMAND_NAMES.has(commandName);
}

function isAdvancedTextCommand(content) {
    const normalizedContent = content.trim();

    return ADVANCED_TEXT_COMMANDS.some(pattern => pattern.test(normalizedContent));
}

function getAdvancedUnavailableMessage(language = 'fr', commandName = null) {
    return language === 'en'
        ? 'This command is currently unavailable.'
        : 'Cette commande est indisponible pour le moment.';
}

function clampNumber(value, min, max) {
    return Math.min(Math.max(Number(value) || min, min), max);
}

function mapGuildConfig(row) {
    return {
        serviceRoleId: row?.role_id || null,
        logChannelId: row?.log_channel_id || null,
        statusChannelId: row?.status_channel_id || null,
        updatesChannelId: row?.updates_channel_id || null,
        updatesPingRoleId: row?.updates_ping_role_id || null,
        statusUpdatesEnabled: Boolean(row?.status_updates_enabled),
        autoRoleId: row?.auto_role_id || null,
        language: normalizeLanguage(row?.language),
        serverPreset: normalizeServerPreset(row?.server_preset)
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
        SELECT role_id, log_channel_id, status_channel_id, updates_channel_id, updates_ping_role_id,
               status_updates_enabled, auto_role_id, language, server_preset
        FROM guild_configs
        WHERE guild_id = ?
    `).get(guildId);

    if (!row) {
        db.prepare(`
            INSERT INTO guild_configs (
                guild_id, role_id, log_channel_id, status_channel_id, updates_channel_id,
                updates_ping_role_id, status_updates_enabled, auto_role_id, language, server_preset
            )
            VALUES (?, NULL, NULL, NULL, NULL, NULL, 0, NULL, 'fr', 'standard')
        `).run(guildId);

        row = {
            role_id: null,
            log_channel_id: null,
            status_channel_id: null,
            updates_channel_id: null,
            updates_ping_role_id: null,
            status_updates_enabled: 0,
            auto_role_id: null,
            language: 'fr',
            server_preset: 'standard'
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
        statusChannelId: Object.prototype.hasOwnProperty.call(newConfig, 'statusChannelId')
            ? newConfig.statusChannelId
            : currentConfig.statusChannelId,
        updatesChannelId: Object.prototype.hasOwnProperty.call(newConfig, 'updatesChannelId')
            ? newConfig.updatesChannelId
            : currentConfig.updatesChannelId,
        updatesPingRoleId: Object.prototype.hasOwnProperty.call(newConfig, 'updatesPingRoleId')
            ? newConfig.updatesPingRoleId
            : currentConfig.updatesPingRoleId,
        statusUpdatesEnabled: Object.prototype.hasOwnProperty.call(newConfig, 'statusUpdatesEnabled')
            ? Boolean(newConfig.statusUpdatesEnabled)
            : currentConfig.statusUpdatesEnabled,
        autoRoleId: Object.prototype.hasOwnProperty.call(newConfig, 'autoRoleId')
            ? newConfig.autoRoleId
            : currentConfig.autoRoleId,
        language: Object.prototype.hasOwnProperty.call(newConfig, 'language')
            ? normalizeLanguage(newConfig.language)
            : currentConfig.language,
        serverPreset: Object.prototype.hasOwnProperty.call(newConfig, 'serverPreset')
            ? normalizeServerPreset(newConfig.serverPreset)
            : currentConfig.serverPreset
    };

    db.prepare(`
        UPDATE guild_configs
        SET role_id = ?, log_channel_id = ?, status_channel_id = ?, updates_channel_id = ?,
            updates_ping_role_id = ?, status_updates_enabled = ?, auto_role_id = ?, language = ?, server_preset = ?
        WHERE guild_id = ?
    `).run(
        nextConfig.serviceRoleId,
        nextConfig.logChannelId,
        nextConfig.statusChannelId,
        nextConfig.updatesChannelId,
        nextConfig.updatesPingRoleId,
        nextConfig.statusUpdatesEnabled ? 1 : 0,
        nextConfig.autoRoleId,
        nextConfig.language,
        nextConfig.serverPreset,
        guildId
    );

    return nextConfig;
}

function boolFromInput(value, fallback = false) {
    if (typeof value === 'boolean') {
        return value;
    }

    const normalized = String(value ?? '').trim().toLowerCase();

    if (['true', '1', 'yes', 'oui', 'on', 'enabled', 'active'].includes(normalized)) {
        return true;
    }

    if (['false', '0', 'no', 'non', 'off', 'disabled', 'inactive', ''].includes(normalized)) {
        return false;
    }

    return fallback;
}

function normalizeInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    const safeValue = Number.isFinite(parsed) ? parsed : fallback;

    return Math.min(Math.max(safeValue, min), max);
}

function parseStoredJsonArray(value) {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed.map(item => String(item)).filter(Boolean)
            : [];
    } catch (error) {
        return [];
    }
}

function normalizeDiscordIdList(value, limit = 50) {
    const rawValues = Array.isArray(value)
        ? value.join(' ')
        : String(value || '');
    const ids = rawValues.match(/\d{17,20}/g) || [];

    return Array.from(new Set(ids)).slice(0, limit);
}

function normalizeAutomodAction(value, premium = false, fallback = 'delete') {
    const normalized = String(value || '').trim().toLowerCase();
    const allowedActions = premium ? AUTOMOD_PREMIUM_ACTIONS : AUTOMOD_FREE_ACTIONS;

    if (allowedActions.has(normalized)) {
        return normalized;
    }

    return allowedActions.has(fallback) ? fallback : 'delete';
}

function normalizeAutomodWord(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
}

function mapAutomodSettings(row) {
    return {
        guildId: row.guild_id,
        enabled: Boolean(row.enabled),
        forbiddenWordsEnabled: Boolean(row.forbidden_words_enabled),
        forbiddenWordsAction: row.forbidden_words_action || 'delete',
        inviteFilterEnabled: Boolean(row.invite_filter_enabled),
        inviteAction: row.invite_action || 'delete',
        spamFilterEnabled: Boolean(row.spam_filter_enabled),
        spamAction: row.spam_action || 'timeout',
        spamMaxMessages: row.spam_max_messages || 5,
        spamWindowSeconds: row.spam_window_seconds || 8,
        spamTimeoutSeconds: row.spam_timeout_seconds || AUTOMOD_DEFAULT_TIMEOUT_SECONDS,
        premiumCapsEnabled: Boolean(row.premium_caps_enabled),
        premiumCapsAction: row.premium_caps_action || 'delete',
        premiumMentionsEnabled: Boolean(row.premium_mentions_enabled),
        premiumMentionsAction: row.premium_mentions_action || 'timeout',
        premiumMentionLimit: row.premium_mention_limit || 6,
        premiumProgressiveEnabled: Boolean(row.premium_progressive_enabled),
        premiumProgressiveWindowMinutes: row.premium_progressive_window_minutes || 60,
        premiumProgressiveTimeoutThreshold: row.premium_progressive_timeout_threshold || 3,
        premiumProgressiveKickThreshold: row.premium_progressive_kick_threshold || 5,
        premiumProgressiveBanThreshold: row.premium_progressive_ban_threshold || 7,
        premiumRaidEnabled: Boolean(row.premium_raid_enabled),
        premiumRaidJoinCount: row.premium_raid_join_count || 6,
        premiumRaidWindowSeconds: row.premium_raid_window_seconds || 30,
        premiumIgnoredRoleIds: parseStoredJsonArray(row.premium_ignored_role_ids_json),
        premiumIgnoredChannelIds: parseStoredJsonArray(row.premium_ignored_channel_ids_json),
        premiumUnlockedByUserId: row.premium_unlocked_by_user_id || null,
        premiumUnlockedAt: row.premium_unlocked_at || null,
        updatedAt: row.updated_at
    };
}

function createDefaultAutomodSettings(guildId) {
    const timestamp = new Date().toISOString();

    db.prepare(`
        INSERT OR IGNORE INTO guild_automod_settings (
            guild_id,
            enabled,
            forbidden_words_enabled,
            forbidden_words_action,
            invite_filter_enabled,
            invite_action,
            spam_filter_enabled,
            spam_action,
            spam_max_messages,
            spam_window_seconds,
            spam_timeout_seconds,
            premium_caps_enabled,
            premium_caps_action,
            premium_mentions_enabled,
            premium_mentions_action,
            premium_mention_limit,
            premium_progressive_enabled,
            premium_progressive_window_minutes,
            premium_progressive_timeout_threshold,
            premium_progressive_kick_threshold,
            premium_progressive_ban_threshold,
            premium_raid_enabled,
            premium_raid_join_count,
            premium_raid_window_seconds,
            premium_ignored_role_ids_json,
            premium_ignored_channel_ids_json,
            premium_unlocked_by_user_id,
            premium_unlocked_at,
            updated_at
        )
        VALUES (?, 0, 1, 'delete', 0, 'delete', 0, 'timeout', 5, 8, ?, 0, 'delete', 0, 'timeout', 6, 0, 60, 3, 5, 7, 0, 6, 30, '[]', '[]', NULL, NULL, ?)
    `).run(guildId, AUTOMOD_DEFAULT_TIMEOUT_SECONDS, timestamp);
}

function getAutomodSettings(guildId) {
    createDefaultAutomodSettings(guildId);

    const row = db.prepare(`
        SELECT *
        FROM guild_automod_settings
        WHERE guild_id = ?
    `).get(guildId);

    return mapAutomodSettings(row);
}

function hasActivePremiumUnlockForAutomod(guildId, settings = null) {
    return isAdvancedGuild(guildId);
}

function withAutomodPremiumFlag(settings) {
    return {
        ...settings,
        premiumActive: hasActivePremiumUnlockForAutomod(settings.guildId, settings),
        freeWordLimit: FREE_AUTOMOD_WORD_LIMIT,
        premiumWordLimit: PREMIUM_AUTOMOD_WORD_LIMIT
    };
}

function getDashboardAutomodSettings(guildId) {
    return withAutomodPremiumFlag(getAutomodSettings(guildId));
}

function updateAutomodSettings(guildId, patch = {}, options = {}) {
    const current = getAutomodSettings(guildId);
    const premium = Boolean(options.premium);
    const has = key => Object.prototype.hasOwnProperty.call(patch, key);
    const next = { ...current };
    let premiumFieldChanged = false;

    if (has('enabled')) next.enabled = boolFromInput(patch.enabled, current.enabled);
    if (has('forbiddenWordsEnabled')) next.forbiddenWordsEnabled = boolFromInput(patch.forbiddenWordsEnabled, current.forbiddenWordsEnabled);
    if (has('forbiddenWordsAction')) next.forbiddenWordsAction = normalizeAutomodAction(patch.forbiddenWordsAction, false, current.forbiddenWordsAction);
    if (has('inviteFilterEnabled')) next.inviteFilterEnabled = boolFromInput(patch.inviteFilterEnabled, current.inviteFilterEnabled);
    if (has('inviteAction')) next.inviteAction = normalizeAutomodAction(patch.inviteAction, false, current.inviteAction);
    if (has('spamFilterEnabled')) next.spamFilterEnabled = boolFromInput(patch.spamFilterEnabled, current.spamFilterEnabled);
    if (has('spamAction')) next.spamAction = normalizeAutomodAction(patch.spamAction, false, current.spamAction);
    if (has('spamMaxMessages')) next.spamMaxMessages = normalizeInteger(patch.spamMaxMessages, current.spamMaxMessages, 2, 12);
    if (has('spamWindowSeconds')) next.spamWindowSeconds = normalizeInteger(patch.spamWindowSeconds, current.spamWindowSeconds, 3, 60);
    if (has('spamTimeoutSeconds')) {
        next.spamTimeoutSeconds = normalizeInteger(
            patch.spamTimeoutSeconds,
            current.spamTimeoutSeconds,
            30,
            premium ? AUTOMOD_PREMIUM_MAX_TIMEOUT_SECONDS : AUTOMOD_FREE_MAX_TIMEOUT_SECONDS
        );
    }

    if (premium) {
        const setPremiumField = (key, value) => {
            next[key] = value;
            premiumFieldChanged = true;
        };

        if (has('premiumCapsEnabled')) setPremiumField('premiumCapsEnabled', boolFromInput(patch.premiumCapsEnabled, current.premiumCapsEnabled));
        if (has('premiumCapsAction')) setPremiumField('premiumCapsAction', normalizeAutomodAction(patch.premiumCapsAction, true, current.premiumCapsAction));
        if (has('premiumMentionsEnabled')) setPremiumField('premiumMentionsEnabled', boolFromInput(patch.premiumMentionsEnabled, current.premiumMentionsEnabled));
        if (has('premiumMentionsAction')) setPremiumField('premiumMentionsAction', normalizeAutomodAction(patch.premiumMentionsAction, true, current.premiumMentionsAction));
        if (has('premiumMentionLimit')) setPremiumField('premiumMentionLimit', normalizeInteger(patch.premiumMentionLimit, current.premiumMentionLimit, 3, 30));
        if (has('premiumProgressiveEnabled')) setPremiumField('premiumProgressiveEnabled', boolFromInput(patch.premiumProgressiveEnabled, current.premiumProgressiveEnabled));
        if (has('premiumProgressiveWindowMinutes')) setPremiumField('premiumProgressiveWindowMinutes', normalizeInteger(patch.premiumProgressiveWindowMinutes, current.premiumProgressiveWindowMinutes, 5, 10080));
        if (has('premiumProgressiveTimeoutThreshold')) setPremiumField('premiumProgressiveTimeoutThreshold', normalizeInteger(patch.premiumProgressiveTimeoutThreshold, current.premiumProgressiveTimeoutThreshold, 2, 30));
        if (has('premiumProgressiveKickThreshold')) setPremiumField('premiumProgressiveKickThreshold', normalizeInteger(patch.premiumProgressiveKickThreshold, current.premiumProgressiveKickThreshold, 3, 40));
        if (has('premiumProgressiveBanThreshold')) setPremiumField('premiumProgressiveBanThreshold', normalizeInteger(patch.premiumProgressiveBanThreshold, current.premiumProgressiveBanThreshold, 4, 50));
        if (has('premiumRaidEnabled')) setPremiumField('premiumRaidEnabled', boolFromInput(patch.premiumRaidEnabled, current.premiumRaidEnabled));
        if (has('premiumRaidJoinCount')) setPremiumField('premiumRaidJoinCount', normalizeInteger(patch.premiumRaidJoinCount, current.premiumRaidJoinCount, 3, 30));
        if (has('premiumRaidWindowSeconds')) setPremiumField('premiumRaidWindowSeconds', normalizeInteger(patch.premiumRaidWindowSeconds, current.premiumRaidWindowSeconds, 10, 300));
        if (has('premiumIgnoredRoleIds')) setPremiumField('premiumIgnoredRoleIds', normalizeDiscordIdList(patch.premiumIgnoredRoleIds));
        if (has('premiumIgnoredChannelIds')) setPremiumField('premiumIgnoredChannelIds', normalizeDiscordIdList(patch.premiumIgnoredChannelIds));

        if (premiumFieldChanged && options.premiumUserId) {
            next.premiumUnlockedByUserId = String(options.premiumUserId);
            next.premiumUnlockedAt = new Date().toISOString();
        }
    }

    const updatedAt = new Date().toISOString();

    db.prepare(`
        UPDATE guild_automod_settings
        SET enabled = ?,
            forbidden_words_enabled = ?,
            forbidden_words_action = ?,
            invite_filter_enabled = ?,
            invite_action = ?,
            spam_filter_enabled = ?,
            spam_action = ?,
            spam_max_messages = ?,
            spam_window_seconds = ?,
            spam_timeout_seconds = ?,
            premium_caps_enabled = ?,
            premium_caps_action = ?,
            premium_mentions_enabled = ?,
            premium_mentions_action = ?,
            premium_mention_limit = ?,
            premium_progressive_enabled = ?,
            premium_progressive_window_minutes = ?,
            premium_progressive_timeout_threshold = ?,
            premium_progressive_kick_threshold = ?,
            premium_progressive_ban_threshold = ?,
            premium_raid_enabled = ?,
            premium_raid_join_count = ?,
            premium_raid_window_seconds = ?,
            premium_ignored_role_ids_json = ?,
            premium_ignored_channel_ids_json = ?,
            premium_unlocked_by_user_id = ?,
            premium_unlocked_at = ?,
            updated_at = ?
        WHERE guild_id = ?
    `).run(
        next.enabled ? 1 : 0,
        next.forbiddenWordsEnabled ? 1 : 0,
        next.forbiddenWordsAction,
        next.inviteFilterEnabled ? 1 : 0,
        next.inviteAction,
        next.spamFilterEnabled ? 1 : 0,
        next.spamAction,
        next.spamMaxMessages,
        next.spamWindowSeconds,
        next.spamTimeoutSeconds,
        next.premiumCapsEnabled ? 1 : 0,
        next.premiumCapsAction,
        next.premiumMentionsEnabled ? 1 : 0,
        next.premiumMentionsAction,
        next.premiumMentionLimit,
        next.premiumProgressiveEnabled ? 1 : 0,
        next.premiumProgressiveWindowMinutes,
        next.premiumProgressiveTimeoutThreshold,
        next.premiumProgressiveKickThreshold,
        next.premiumProgressiveBanThreshold,
        next.premiumRaidEnabled ? 1 : 0,
        next.premiumRaidJoinCount,
        next.premiumRaidWindowSeconds,
        JSON.stringify(next.premiumIgnoredRoleIds),
        JSON.stringify(next.premiumIgnoredChannelIds),
        next.premiumUnlockedByUserId || null,
        next.premiumUnlockedAt || null,
        updatedAt,
        guildId
    );

    return getDashboardAutomodSettings(guildId);
}

function getAutomodWords(guildId) {
    return db.prepare(`
        SELECT word, match_mode, created_by_user_id, created_at
        FROM guild_automod_words
        WHERE guild_id = ?
        ORDER BY word ASC
    `).all(guildId).map(row => ({
        word: row.word,
        matchMode: row.match_mode || 'contains',
        createdByUserId: row.created_by_user_id || null,
        createdAt: row.created_at
    }));
}

function addAutomodWord(guildId, word, createdByUserId = null) {
    const normalizedWord = normalizeAutomodWord(word);

    if (normalizedWord.length < 2) {
        return null;
    }

    const timestamp = new Date().toISOString();

    db.prepare(`
        INSERT OR REPLACE INTO guild_automod_words (guild_id, word, match_mode, created_by_user_id, created_at)
        VALUES (?, ?, 'contains', ?, ?)
    `).run(guildId, normalizedWord, createdByUserId || null, timestamp);

    return {
        word: normalizedWord,
        matchMode: 'contains',
        createdByUserId: createdByUserId || null,
        createdAt: timestamp
    };
}

function removeAutomodWord(guildId, word) {
    const normalizedWord = normalizeAutomodWord(word);

    if (!normalizedWord) {
        return false;
    }

    return db.prepare(`
        DELETE FROM guild_automod_words
        WHERE guild_id = ? AND word = ?
    `).run(guildId, normalizedWord).changes > 0;
}

function addAutomodEvent(guildId, userId, rule, action, reason, messageId = null, channelId = null) {
    const timestamp = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO guild_automod_events (guild_id, user_id, rule, action, reason, message_id, channel_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId,
        userId,
        rule,
        action,
        reason || null,
        messageId || null,
        channelId || null,
        timestamp
    );

    return {
        id: result.lastInsertRowid,
        guildId,
        userId,
        rule,
        action,
        reason: reason || null,
        messageId: messageId || null,
        channelId: channelId || null,
        createdAt: timestamp
    };
}

function getRecentAutomodEvents(guildId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    return db.prepare(`
        SELECT id, guild_id, user_id, rule, action, reason, message_id, channel_id, created_at
        FROM guild_automod_events
        WHERE guild_id = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(guildId, safeLimit).map(row => ({
        id: row.id,
        guildId: row.guild_id,
        userId: row.user_id,
        rule: row.rule,
        action: row.action,
        reason: row.reason,
        messageId: row.message_id,
        channelId: row.channel_id,
        createdAt: row.created_at
    }));
}

function getAutomodEventCount(guildId, userId, windowMinutes = 60) {
    const since = new Date(Date.now() - normalizeInteger(windowMinutes, 60, 1, 10080) * 60 * 1000).toISOString();
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM guild_automod_events
        WHERE guild_id = ? AND user_id = ? AND created_at >= ?
    `).get(guildId, userId, since);

    return row?.count || 0;
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
    if (!member?.guild?.id || !getStaffRoleGuildIds().includes(String(member.guild.id))) {
        return false;
    }

    const staffRoleNames = new Set(SENTINEL_STAFF_ROLES.map(normalizeRoleName));

    return member.roles.cache.some(role => staffRoleNames.has(normalizeRoleName(role.name)));
}

async function ensureReferenceGuildRuntimeConfig() {
    const guild = client.guilds.cache.get(SENTINEL_REFERENCE_GUILD_ID)
        || await client.guilds.fetch(SENTINEL_REFERENCE_GUILD_ID).catch(() => null);

    if (!guild) {
        return {
            skipped: true,
            reason: 'serveur de reference inaccessible'
        };
    }

    await Promise.all([
        guild.roles.fetch().catch(() => null),
        guild.channels.fetch().catch(() => null)
    ]);

    const config = getGuildConfig(guild.id);
    const serviceRole = findRoleByName(guild, REFERENCE_SERVICE_ROLE_NAME);
    const logChannel = findGuildTextChannel(guild, REFERENCE_LOG_CHANNEL_NAMES);
    const autoRole = findRoleByName(guild, REFERENCE_AUTO_ROLE_NAME);
    const nextConfig = {};

    if (serviceRole && (!config.serviceRoleId || !guild.roles.cache.has(config.serviceRoleId))) {
        nextConfig.serviceRoleId = serviceRole.id;
    }

    if (logChannel && (!config.logChannelId || !guild.channels.cache.has(config.logChannelId))) {
        nextConfig.logChannelId = logChannel.id;
    }

    if (autoRole && (!config.autoRoleId || !guild.roles.cache.has(config.autoRoleId))) {
        nextConfig.autoRoleId = autoRole.id;
    }

    if (Object.keys(nextConfig).length > 0) {
        updateGuildConfig(guild.id, nextConfig);
    }

    const staffRoles = SENTINEL_STAFF_ROLES
        .map(roleName => findRoleByName(guild, roleName))
        .filter(Boolean);

    for (const role of staffRoles) {
        addCommandRole(guild.id, role.id);
        addDossierRole(guild.id, role.id);
    }

    return {
        skipped: false,
        updated: Object.keys(nextConfig),
        serviceRole: serviceRole?.name || null,
        logChannel: logChannel?.name || null,
        autoRole: autoRole?.name || null,
        staffRoles: staffRoles.map(role => role.name)
    };
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
            label: 'Assistance',
            channelPrefix: 'dossier-support',
            intro: [
                'Explique ta demande clairement pour que l’équipe puisse agir vite.',
                '',
                '- situation rencontrée',
                '- élément concerné',
                '- pièce jointe ou preuve si disponible',
                '',
                'Un référent prendra le dossier dès que possible.'
            ]
        },
        en: {
            label: 'Assistance',
            channelPrefix: 'support-dossier',
            intro: [
                'Explain your request clearly so the team can act quickly.',
                '',
                '- situation encountered',
                '- element concerned',
                '- attachment or proof if available',
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
                '**Lieu / moment :**',
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
                '**Place / moment:**',
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
            label: 'Candidature',
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
            label: 'Application',
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
            label: 'Alliance',
            channelPrefix: 'dossier-partenariat',
            intro: [
                'Présente la demande d’alliance clairement.',
                '',
                '**Structure / projet :**',
                '**Objectif de l’alliance :**',
                '**Contact :**',
                '**Lien ou éléments utiles :**'
            ]
        },
        en: {
            label: 'Alliance',
            channelPrefix: 'partnership-dossier',
            intro: [
                'Present the alliance request clearly.',
                '',
                '**Structure / project:**',
                '**Alliance goal:**',
                '**Contact:**',
                '**Useful link or details:**'
            ]
        }
    },
    other: {
        emoji: '🧾',
        color: SENTINEL_COLORS.neutral,
        fr: {
            label: 'Requête',
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
            label: 'Request',
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
        formAnswers: row.form_answers_json ? safeJsonParse(row.form_answers_json, []) : [],
        referentUserId: row.referent_user_id,
        createdAt: row.created_at,
        closedAt: row.closed_at,
        closedByUserId: row.closed_by_user_id,
        closeReason: row.close_reason || null,
        resolutionSummary: row.resolution_summary || null,
        archivePath: row.archive_path || null,
        archiveSha256: row.archive_sha256 || null,
        archiveSize: Number(row.archive_size || 0),
        archivedAt: row.archived_at || null,
        archiveMessageCount: Number(row.archive_message_count || 0),
        archiveAttachmentCount: Number(row.archive_attachment_count || 0),
        archiveEmbedCount: Number(row.archive_embed_count || 0),
        firstStaffResponseAt: row.first_staff_response_at || null,
        lastStaffReplyAt: row.last_staff_reply_at || null,
        lastRequesterReplyAt: row.last_requester_reply_at || null,
        lastActivityAt: row.last_activity_at || row.created_at,
        deletionScheduledAt: row.deletion_scheduled_at || null,
        reopenUntil: row.reopen_until || null,
        reopenedCount: Number(row.reopened_count || 0),
        lastReminderAt: row.last_reminder_at || null
    };
}

function getDossierByChannel(guildId, channelId) {
    return mapDossier(db.prepare(`
        SELECT *
        FROM sentinel_dossiers
        WHERE guild_id = ? AND channel_id = ?
    `).get(guildId, channelId));
}

function getDossierById(guildId, dossierId) {
    return mapDossier(db.prepare(`
        SELECT * FROM sentinel_dossiers
        WHERE guild_id = ? AND id = ?
    `).get(guildId, dossierId));
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
            form_answers_json,
            last_requester_reply_at,
            last_activity_at,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?)
    `).run(
        guildId,
        channelId,
        ownerUserId,
        openerUserId,
        normalizeDossierType(type),
        priority,
        subject,
        description,
        JSON.stringify(Array.isArray(details.formAnswers) ? details.formAnswers : []),
        createdAt,
        createdAt,
        createdAt
    );

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
        formAnswers: Array.isArray(details.formAnswers) ? details.formAnswers : [],
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

function updateDossierPriority(guildId, channelId, priority) {
    const nextPriority = ['normal', 'important', 'urgent'].includes(String(priority || '').toLowerCase())
        ? String(priority).toLowerCase()
        : 'normal';

    db.prepare(`
        UPDATE sentinel_dossiers SET priority = ?
        WHERE guild_id = ? AND channel_id = ? AND status != 'closed'
    `).run(nextPriority, guildId, channelId);

    return getDossierByChannel(guildId, channelId);
}

function closeDossierRecord(guildId, channelId, closedByUserId, details = {}) {
    const closedAt = new Date().toISOString();
    const retentionHours = DOSSIER_RETENTION_HOURS;
    const deletionScheduledAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000).toISOString();
    const reopenUntil = deletionScheduledAt;

    db.prepare(`
        UPDATE sentinel_dossiers
        SET status = 'closed',
            closed_at = ?,
            closed_by_user_id = ?,
            close_reason = ?,
            resolution_summary = ?,
            deletion_scheduled_at = ?,
            reopen_until = ?
        WHERE guild_id = ? AND channel_id = ?
    `).run(
        closedAt,
        closedByUserId,
        String(details.reason || '').trim().slice(0, 500) || null,
        String(details.resolution || '').trim().slice(0, 1500) || null,
        deletionScheduledAt,
        reopenUntil,
        guildId,
        channelId
    );

    return getDossierByChannel(guildId, channelId);
}

function saveDossierArchiveMetadata(guildId, channelId, archive) {
    db.prepare(`
        UPDATE sentinel_dossiers
        SET archive_path = ?,
            archive_sha256 = ?,
            archive_size = ?,
            archived_at = ?,
            archive_message_count = ?,
            archive_attachment_count = ?,
            archive_embed_count = ?
        WHERE guild_id = ? AND channel_id = ?
    `).run(
        archive.relativePath,
        archive.sha256,
        archive.size,
        archive.archivedAt,
        archive.messageCount,
        archive.attachmentCount,
        archive.embedCount,
        guildId,
        channelId
    );

    return getDossierByChannel(guildId, channelId);
}

function updateDossierActivity(guildId, channelId, authorUserId, isStaff, createdAt = new Date().toISOString()) {
    const dossier = getDossierByChannel(guildId, channelId);

    if (!dossier || dossier.status === 'closed') {
        return dossier;
    }

    if (isStaff) {
        db.prepare(`
            UPDATE sentinel_dossiers
            SET first_staff_response_at = COALESCE(first_staff_response_at, ?),
                last_staff_reply_at = ?,
                last_activity_at = ?,
                status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
            WHERE guild_id = ? AND channel_id = ?
        `).run(createdAt, createdAt, createdAt, guildId, channelId);
    } else if (authorUserId === dossier.ownerUserId) {
        db.prepare(`
            UPDATE sentinel_dossiers
            SET last_requester_reply_at = ?,
                last_activity_at = ?
            WHERE guild_id = ? AND channel_id = ?
        `).run(createdAt, createdAt, guildId, channelId);
    }

    return getDossierByChannel(guildId, channelId);
}

function reopenDossierRecord(guildId, channelId) {
    const dossier = getDossierByChannel(guildId, channelId);

    if (!dossier || dossier.status !== 'closed' || !dossier.reopenUntil || new Date(dossier.reopenUntil).getTime() < Date.now()) {
        return null;
    }

    db.prepare(`
        UPDATE sentinel_dossiers
        SET status = 'in_progress',
            closed_at = NULL,
            closed_by_user_id = NULL,
            close_reason = NULL,
            resolution_summary = NULL,
            deletion_scheduled_at = NULL,
            reopen_until = NULL,
            reopened_count = reopened_count + 1,
            last_activity_at = ?
        WHERE guild_id = ? AND channel_id = ?
    `).run(new Date().toISOString(), guildId, channelId);

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

function getDossierPanels(guildId) {
    return db.prepare(`
        SELECT id, guild_id, channel_id, message_id, creator_user_id, created_at
        FROM sentinel_dossier_panels
        WHERE guild_id = ?
        ORDER BY datetime(created_at) ASC
    `).all(guildId);
}

function deleteDossierPanelRecord(id) {
    return db.prepare('DELETE FROM sentinel_dossier_panels WHERE id = ?').run(id).changes > 0;
}

async function reconcileDossierPanels(guild) {
    let removed = 0;

    for (const panel of getDossierPanels(guild.id)) {
        let channel;
        let message;

        try {
            channel = await guild.channels.fetch(panel.channel_id);
        } catch (error) {
            if (error?.code === 10003) {
                removed += deleteDossierPanelRecord(panel.id) ? 1 : 0;
            }
            continue;
        }

        if (!channel?.isTextBased?.()) {
            removed += deleteDossierPanelRecord(panel.id) ? 1 : 0;
            continue;
        }

        try {
            message = await channel.messages.fetch(panel.message_id);
        } catch (error) {
            if (error?.code === 10008) {
                removed += deleteDossierPanelRecord(panel.id) ? 1 : 0;
            }
            continue;
        }

        if (!message || !isDossierPanelMessage(message)) {
            removed += deleteDossierPanelRecord(panel.id) ? 1 : 0;
        }
    }

    return {
        removed,
        remaining: getDossierPanelCount(guild.id)
    };
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
        slaFirstResponseMinutes: Number(row.sla_first_response_minutes || 60),
        slaResolutionMinutes: Number(row.sla_resolution_minutes || 1440),
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
        SELECT *
        FROM sentinel_dossier_type_settings
        WHERE guild_id = ?
    `).all(guildId).map(mapDossierTypeSetting);
}

function getDossierTypeSetting(guildId, type) {
    return mapDossierTypeSetting(db.prepare(`
        SELECT *
        FROM sentinel_dossier_type_settings
        WHERE guild_id = ? AND type = ?
    `).get(guildId, normalizeDossierType(type)));
}

function updateDossierTypeSettings(guildId, type, patch = {}) {
    const dossierType = normalizeDossierType(type);
    const current = getDossierTypeSetting(guildId, dossierType);
    const timestamp = new Date().toISOString();
    const questions = Array.isArray(patch.questions)
        ? patch.questions.slice(0, 3).map((question, index) => ({
            id: `question_${index}`,
            label: String(question.label || question || '').trim().slice(0, 45),
            required: question.required !== false,
            style: question.style === 'short' ? 'short' : 'paragraph',
            maxLength: clampNumber(question.maxLength || 500, 20, 1000)
        })).filter(question => question.label)
        : (current?.questions || []);
    const firstResponse = clampNumber(
        patch.slaFirstResponseMinutes ?? current?.slaFirstResponseMinutes ?? 60,
        5,
        10080
    );
    const resolution = clampNumber(
        patch.slaResolutionMinutes ?? current?.slaResolutionMinutes ?? 1440,
        30,
        43200
    );

    db.prepare(`
        INSERT INTO sentinel_dossier_type_settings (
            guild_id, type, category_id, questions_json,
            sla_first_response_minutes, sla_resolution_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id, type) DO UPDATE SET
            category_id = excluded.category_id,
            questions_json = excluded.questions_json,
            sla_first_response_minutes = excluded.sla_first_response_minutes,
            sla_resolution_minutes = excluded.sla_resolution_minutes,
            updated_at = excluded.updated_at
    `).run(
        guildId,
        dossierType,
        patch.categoryId !== undefined ? (patch.categoryId || null) : (current?.categoryId || null),
        JSON.stringify(questions),
        firstResponse,
        resolution,
        current?.createdAt || timestamp,
        timestamp
    );

    return getDossierTypeSetting(guildId, dossierType);
}

function getDossierTypeRoleIds(guildId, type) {
    return db.prepare(`
        SELECT role_id
        FROM sentinel_dossier_type_roles
        WHERE guild_id = ? AND type = ?
        ORDER BY datetime(created_at) ASC
    `).all(guildId, normalizeDossierType(type)).map(row => row.role_id);
}

function getAllDossierTypeRoles(guildId) {
    return db.prepare(`
        SELECT type, role_id
        FROM sentinel_dossier_type_roles
        WHERE guild_id = ?
        ORDER BY type, datetime(created_at) ASC
    `).all(guildId).map(row => ({ type: normalizeDossierType(row.type), roleId: row.role_id }));
}

function addDossierTypeRole(guildId, type, roleId) {
    db.prepare(`
        INSERT OR IGNORE INTO sentinel_dossier_type_roles (guild_id, type, role_id, created_at)
        VALUES (?, ?, ?, ?)
    `).run(guildId, normalizeDossierType(type), roleId, new Date().toISOString());
}

function removeDossierTypeRole(guildId, type, roleId) {
    db.prepare(`
        DELETE FROM sentinel_dossier_type_roles
        WHERE guild_id = ? AND type = ? AND role_id = ?
    `).run(guildId, normalizeDossierType(type), roleId);
}

function getDossierTemplates(guildId) {
    return db.prepare(`
        SELECT * FROM sentinel_dossier_templates
        WHERE guild_id = ?
        ORDER BY name COLLATE NOCASE ASC
    `).all(guildId).map(row => ({
        id: row.id,
        guildId: row.guild_id,
        name: row.name,
        content: row.content,
        type: row.type ? normalizeDossierType(row.type) : null,
        kind: row.kind || 'reply',
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}

function createDossierTemplate(guildId, data, actorUserId) {
    const timestamp = new Date().toISOString();
    const name = String(data.name || '').trim().slice(0, 80);
    const content = String(data.content || '').trim().slice(0, 1900);
    const type = data.type ? normalizeDossierType(data.type) : null;
    const kind = ['reply', 'request_info', 'close'].includes(data.kind) ? data.kind : 'reply';

    if (!name || !content) {
        throw new Error('Le nom et le contenu de la réponse sont obligatoires.');
    }

    const info = db.prepare(`
        INSERT INTO sentinel_dossier_templates (
            guild_id, name, content, type, kind, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, name, content, type, kind, actorUserId || null, timestamp, timestamp);

    return getDossierTemplates(guildId).find(item => Number(item.id) === Number(info.lastInsertRowid));
}

function deleteDossierTemplate(guildId, templateId) {
    return db.prepare(`DELETE FROM sentinel_dossier_templates WHERE guild_id = ? AND id = ?`)
        .run(guildId, templateId).changes > 0;
}

function getDossierTemplate(guildId, templateId) {
    return getDossierTemplates(guildId).find(item => Number(item.id) === Number(templateId)) || null;
}

function getDossierStats(guildId) {
    const totals = db.prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status != 'closed' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status != 'closed' AND referent_user_id IS NULL THEN 1 ELSE 0 END) AS unassigned,
            AVG(CASE
                WHEN first_staff_response_at IS NOT NULL
                THEN (julianday(first_staff_response_at) - julianday(created_at)) * 86400000
            END) AS average_first_response_ms,
            AVG(CASE
                WHEN closed_at IS NOT NULL
                THEN (julianday(closed_at) - julianday(created_at)) * 86400000
            END) AS average_resolution_ms
        FROM sentinel_dossiers
        WHERE guild_id = ?
    `).get(guildId);
    const byType = Object.fromEntries(db.prepare(`
        SELECT type, COUNT(*) AS count
        FROM sentinel_dossiers
        WHERE guild_id = ?
        GROUP BY type
    `).all(guildId).map(row => [row.type, Number(row.count || 0)]));
    const byReferent = Object.fromEntries(db.prepare(`
        SELECT referent_user_id AS user_id, COUNT(*) AS count
        FROM sentinel_dossiers
        WHERE guild_id = ? AND referent_user_id IS NOT NULL
        GROUP BY referent_user_id
        ORDER BY count DESC
        LIMIT 100
    `).all(guildId).map(row => [row.user_id, Number(row.count || 0)]));

    return {
        total: Number(totals?.total || 0),
        open: Number(totals?.open || 0),
        unassigned: Number(totals?.unassigned || 0),
        averageFirstResponseMs: totals?.average_first_response_ms == null
            ? null
            : Math.max(0, Math.round(totals.average_first_response_ms)),
        averageResolutionMs: totals?.average_resolution_ms == null
            ? null
            : Math.max(0, Math.round(totals.average_resolution_ms)),
        byType,
        byReferent
    };
}

function resolveDossierArchivePath(relativePath) {
    const root = path.resolve(DOSSIER_ARCHIVE_DIR);
    const resolved = path.resolve(root, String(relativePath || ''));

    if (!relativePath || (resolved !== root && !resolved.startsWith(`${root}${path.sep}`))) {
        return null;
    }

    return resolved;
}

function getDossierArchiveFile(guildId, dossierId) {
    const dossier = mapDossier(db.prepare(`
        SELECT * FROM sentinel_dossiers WHERE guild_id = ? AND id = ?
    `).get(guildId, dossierId));
    const filePath = resolveDossierArchivePath(dossier?.archivePath);

    if (!dossier || !filePath || !fs.existsSync(filePath)) {
        return null;
    }

    const buffer = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (!dossier.archiveSha256 || sha256 !== dossier.archiveSha256) {
        return null;
    }

    return {
        path: filePath,
        name: `dossier-sentinel-${dossier.id}.tar.gz`,
        mimeType: 'application/gzip',
        size: buffer.length,
        dossier
    };
}

function searchDossierArchives(guildId, query, limit = 25) {
    const needle = String(query || '').trim().toLocaleLowerCase('fr').slice(0, 120);

    if (needle.length < 3) {
        return [];
    }

    const rows = db.prepare(`
        SELECT id, archive_path
        FROM sentinel_dossiers
        WHERE guild_id = ? AND archive_path IS NOT NULL
        ORDER BY datetime(archived_at) DESC
    `).all(guildId);
    const matches = [];

    for (const row of rows) {
        const filePath = resolveDossierArchivePath(row.archive_path);

        if (!filePath || !fs.existsSync(filePath)) {
            continue;
        }

        try {
            const searchPath = path.join(path.dirname(filePath), 'recherche.txt.gz');
            let searchable;

            if (fs.existsSync(searchPath)) {
                searchable = zlib.gunzipSync(fs.readFileSync(searchPath)).toString('utf8');
            } else {
                const tarBuffer = zlib.gunzipSync(fs.readFileSync(filePath));
                const manifestBuffer = readTarEntry(tarBuffer, 'manifest.json');

                if (!manifestBuffer) {
                    throw new Error('Manifest absent de l’archive.');
                }

                const manifest = JSON.parse(manifestBuffer.toString('utf8'));
                searchable = [
                    JSON.stringify(manifest.dossier || {}),
                    ...manifest.messages.map(message => `${message.author?.tag || ''} ${message.content || ''} ${JSON.stringify(message.embeds || [])}`)
                ].join('\n');
            }
            const normalized = searchable.toLocaleLowerCase('fr');
            const index = normalized.indexOf(needle);

            if (index === -1) {
                continue;
            }

            matches.push({
                dossierId: row.id,
                excerpt: searchable.slice(Math.max(0, index - 80), index + needle.length + 140).replace(/\s+/g, ' ').trim()
            });

            if (matches.length >= clampNumber(limit, 1, 50)) {
                break;
            }
        } catch (error) {
            console.error(`Recherche archive dossier #${row.id} :`, error);
        }
    }

    return matches;
}

function getPendingDossierDeletions(limit = 50) {
    return db.prepare(`
        SELECT * FROM sentinel_dossiers
        WHERE status = 'closed'
          AND deletion_scheduled_at IS NOT NULL
          AND datetime(deletion_scheduled_at) <= datetime('now')
        ORDER BY datetime(deletion_scheduled_at) ASC
        LIMIT ?
    `).all(clampNumber(limit, 1, 200)).map(mapDossier);
}

function clearDossierDeletionSchedule(guildId, channelId) {
    db.prepare(`
        UPDATE sentinel_dossiers
        SET deletion_scheduled_at = NULL
        WHERE guild_id = ? AND channel_id = ?
    `).run(guildId, channelId);
}

function markDossierReminder(guildId, channelId) {
    db.prepare(`
        UPDATE sentinel_dossiers SET last_reminder_at = ?
        WHERE guild_id = ? AND channel_id = ?
    `).run(new Date().toISOString(), guildId, channelId);
}

async function reopenDossierChannel(guild, channel, actor, language = 'fr', options = {}) {
    if (!isAdvancedGuild(guild.id) && !options.advanced) {
        throw new Error(language === 'en'
            ? 'Dossier reopening is currently unavailable.'
            : 'La réouverture des dossiers est indisponible pour le moment.');
    }

    const dossier = reopenDossierRecord(guild.id, channel.id);

    if (!dossier) {
        throw new Error(language === 'en'
            ? 'This dossier can no longer be reopened.'
            : 'Ce dossier ne peut plus être réouvert.');
    }

    await channel.permissionOverwrites.edit(dossier.ownerUserId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true
    }, { reason: `Réouverture du dossier Sentinel par ${actor.id}` });
    await channel.send(language === 'en'
        ? `The dossier has been reopened by ${actor}.`
        : `Le dossier a été réouvert par ${actor}.`);

    return dossier;
}

async function processDossierMaintenance() {
    for (const dossier of getPendingDossierDeletions()) {
        const archive = getDossierArchiveFile(dossier.guildId, dossier.id);

        if (!archive) {
            console.error(`Suppression dossier refusée : archive absente ou invalide pour #${dossier.id}.`);
            continue;
        }

        const guild = client.guilds.cache.get(dossier.guildId);
        const channel = guild ? await guild.channels.fetch(dossier.channelId).catch(() => null) : null;

        if (channel) {
            const deleted = await channel.delete('Dossier Sentinel archivé et délai de conservation écoulé')
                .then(() => true)
                .catch(error => {
                    console.error(`Suppression différée dossier #${dossier.id} :`, error);
                    return false;
                });

            if (!deleted) {
                continue;
            }
        }

        clearDossierDeletionSchedule(dossier.guildId, dossier.channelId);
    }

    for (const guild of client.guilds.cache.values()) {
        await reconcileDossierPanels(guild).catch(error => {
            console.error(`Réparation panneaux dossiers ${guild.id} :`, error);
        });

        const dossierSettings = getDossierTypeSettings(guild.id);
        const premiumDossierConfigured = dossierSettings.length > 0 || getDossierTemplates(guild.id).length > 0;

        if (!isAdvancedGuild(guild.id) && !premiumDossierConfigured) {
            continue;
        }

        const dossiers = getRecentDossiers(guild.id, 100).filter(item => item.status !== 'closed');

        for (const dossier of dossiers) {
            const settings = getDossierTypeSetting(guild.id, dossier.type);
            const firstDeadline = new Date(dossier.createdAt).getTime()
                + (settings?.slaFirstResponseMinutes || 60) * 60 * 1000;
            const resolutionDeadline = new Date(dossier.createdAt).getTime()
                + (settings?.slaResolutionMinutes || 1440) * 60 * 1000;
            const overdue = (!dossier.firstStaffResponseAt && Date.now() > firstDeadline)
                || Date.now() > resolutionDeadline;
            const remindedRecently = dossier.lastReminderAt
                && Date.now() - new Date(dossier.lastReminderAt).getTime() < 60 * 60 * 1000;

            if (!overdue || remindedRecently) {
                continue;
            }

            const channel = await guild.channels.fetch(dossier.channelId).catch(() => null);

            if (!channel?.isTextBased?.()) {
                continue;
            }

            const roleMentions = getDossierTypeRoleIds(guild.id, dossier.type)
                .map(roleId => `<@&${roleId}>`)
                .join(' ');
            const fallbackRoleMentions = getDossierRoleIds(guild.id)
                .map(roleId => `<@&${roleId}>`)
                .join(' ');
            const recipients = dossier.referentUserId
                ? `<@${dossier.referentUserId}>`
                : (roleMentions || fallbackRoleMentions);
            await channel.send(`${recipients ? `${recipients} ` : ''}Ce dossier demande une intervention : le délai prévu est dépassé.`)
                .catch(() => {});
            markDossierReminder(guild.id, dossier.channelId);
        }
    }
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

function isValidDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getWeekRange(weekStart = null) {
    const normalizedWeekStart = isValidDateKey(weekStart)
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
    const existing = db.prepare(`
        SELECT guild_id, user_id, week_start, paid, paid_by_user_id, paid_at, updated_at
        FROM weekly_payments
        WHERE guild_id = ? AND user_id = ? AND week_start = ?
    `).get(guildId, userId, range.weekStart);

    if (existing && Boolean(existing.paid) === Boolean(paidValue)) {
        return existing;
    }

    return db.transaction(() => {
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

        db.prepare(`
            INSERT INTO weekly_payment_events (
                guild_id,
                user_id,
                week_start,
                paid,
                changed_by_user_id,
                changed_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            userId,
            range.weekStart,
            paidValue,
            paidByUserId || null,
            timestamp
        );

        const payment = db.prepare(`
            SELECT guild_id, user_id, week_start, paid, paid_by_user_id, paid_at, updated_at
            FROM weekly_payments
            WHERE guild_id = ? AND user_id = ? AND week_start = ?
        `).get(guildId, userId, range.weekStart);

        syncPayrollArchivePaymentStatus(guildId, userId, range.weekStart, payment);

        return payment;
    })();
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
            const member = options.guild?.members?.cache?.get(userId) || null;
            const roleRate = getPayrollRoleForUser(options.guild, userId, roleSettings);
            const hourlyRate = roleRate?.hourlyRate ?? settings.hourlyRate;
            const baseAmount = (totalTime / (60 * 60 * 1000)) * hourlyRate;
            const userAdjustments = adjustmentsByUser.get(userId) || [];
            const adjustmentAmount = userAdjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
            const amount = Math.max(0, baseAmount + adjustmentAmount);

            return {
                userId,
                displayName: member?.displayName || member?.user?.globalName || member?.user?.username || null,
                username: member?.user?.username || null,
                avatar: member?.displayAvatarURL?.() || member?.user?.displayAvatarURL?.() || null,
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
    const existingArchive = db.prepare(`
        SELECT archived_at
        FROM weekly_payroll_archives
        WHERE guild_id = ? AND week_start = ?
        LIMIT 1
    `).get(guildId, payroll.weekStart);
    const details = {
        settings: payroll.settings,
        roleSettings: payroll.roleSettings,
        totals: payroll.totals,
        items: payroll.items.map(item => ({
            userId: item.userId,
            displayName: item.displayName,
            username: item.username,
            avatar: item.avatar,
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
        replaced: Boolean(existingArchive),
        previousArchivedAt: existingArchive?.archived_at || null,
        totals: payroll.totals
    };
}

function parsePayrollArchiveDetails(value) {
    try {
        const details = JSON.parse(value || '{}');
        return details && typeof details === 'object' ? details : {};
    } catch (error) {
        return {};
    }
}

function getPayrollIdentity(guild, userId, fallback = {}) {
    const member = guild?.members?.cache?.get(String(userId)) || null;

    return {
        displayName: fallback.displayName
            || member?.displayName
            || member?.user?.globalName
            || member?.user?.username
            || null,
        username: fallback.username || member?.user?.username || null,
        avatar: fallback.avatar
            || member?.displayAvatarURL?.()
            || member?.user?.displayAvatarURL?.()
            || null
    };
}

function hydrateWeeklyPayrollArchiveRows(guildId, rows, options = {}) {
    if (!rows.length) {
        return [];
    }

    const language = options.language || getGuildLanguage(guildId);
    const weekStarts = rows.map(row => row.week_start);
    const placeholders = weekStarts.map(() => '?').join(', ');
    const paymentRows = db.prepare(`
        SELECT user_id, week_start, paid, paid_by_user_id, paid_at, updated_at
        FROM weekly_payments
        WHERE guild_id = ? AND week_start IN (${placeholders})
    `).all(guildId, ...weekStarts);
    const eventRows = db.prepare(`
        SELECT id, user_id, week_start, paid, changed_by_user_id, changed_at
        FROM weekly_payment_events
        WHERE guild_id = ? AND week_start IN (${placeholders})
        ORDER BY datetime(changed_at) DESC, id DESC
        LIMIT 1000
    `).all(guildId, ...weekStarts);
    const paymentsByKey = new Map(paymentRows.map(row => [`${row.week_start}:${row.user_id}`, row]));
    const eventsByWeek = new Map();

    for (const event of eventRows) {
        const list = eventsByWeek.get(event.week_start) || [];
        list.push(event);
        eventsByWeek.set(event.week_start, list);
    }

    return rows.map(row => {
        const details = parsePayrollArchiveDetails(row.details_json);
        const currency = details.settings?.currency || DEFAULT_PAY_CURRENCY;
        const weekEvents = eventsByWeek.get(row.week_start) || [];
        const latestEventByUser = new Map();
        const eventCountByUser = new Map();

        for (const event of weekEvents) {
            if (!latestEventByUser.has(event.user_id)) {
                latestEventByUser.set(event.user_id, event);
            }

            eventCountByUser.set(event.user_id, (eventCountByUser.get(event.user_id) || 0) + 1);
        }

        const items = (Array.isArray(details.items) ? details.items : []).map(item => {
            const userId = String(item.userId || '');
            const payment = paymentsByKey.get(`${row.week_start}:${userId}`) || null;
            const latestEvent = latestEventByUser.get(userId) || null;
            const identity = getPayrollIdentity(options.guild, userId, item);
            const totalTime = Number(item.totalTime) || 0;
            const hourlyRate = Number(item.hourlyRate) || 0;
            const baseAmount = Number(item.baseAmount) || 0;
            const adjustmentAmount = Number(item.adjustmentAmount) || 0;
            const amount = Number(item.amount) || 0;
            const paid = payment ? Boolean(payment.paid) : Boolean(item.paid);

            return {
                userId,
                ...identity,
                totalTime,
                totalTimeLabel: item.totalTimeLabel || formatDuration(totalTime),
                hourlyRate,
                hourlyRateLabel: formatPayAmount(hourlyRate, currency, language),
                payrollRoleId: item.payrollRoleId || null,
                payrollRoleName: item.payrollRoleName || null,
                baseAmount,
                baseAmountLabel: formatPayAmount(baseAmount, currency, language),
                adjustmentAmount,
                adjustmentAmountLabel: formatSignedPayAmount(adjustmentAmount, currency, language),
                amount,
                amountLabel: formatPayAmount(amount, currency, language),
                paid,
                paidByUserId: payment?.paid_by_user_id || item.paidByUserId || null,
                paidAt: payment?.paid_at || item.paidAt || null,
                updatedAt: payment?.updated_at || latestEvent?.changed_at || item.updatedAt || null,
                statusChangedByUserId: latestEvent?.changed_by_user_id || null,
                statusEventCount: eventCountByUser.get(userId) || 0
            };
        });
        const hasDetailedItems = items.length > 0;
        const totalTime = hasDetailedItems
            ? items.reduce((sum, item) => sum + item.totalTime, 0)
            : Number(row.total_time) || 0;
        const totalAmount = hasDetailedItems
            ? items.reduce((sum, item) => sum + item.amount, 0)
            : Number(row.total_amount) || 0;
        const paidAmount = hasDetailedItems
            ? items.filter(item => item.paid).reduce((sum, item) => sum + item.amount, 0)
            : Number(row.paid_amount) || 0;
        const paidCount = hasDetailedItems
            ? items.filter(item => item.paid).length
            : Number(details.totals?.paidCount) || 0;
        const userCount = hasDetailedItems ? items.length : Number(row.user_count) || 0;
        const unpaidCount = hasDetailedItems
            ? items.length - paidCount
            : Number(details.totals?.unpaidCount) || Math.max(0, userCount - paidCount);
        const adjustmentAmount = items.reduce((sum, item) => sum + item.adjustmentAmount, 0);
        const events = weekEvents.slice(0, 25).map(event => ({
            id: event.id,
            userId: event.user_id,
            userDisplayName: getPayrollIdentity(options.guild, event.user_id).displayName,
            paid: Boolean(event.paid),
            changedByUserId: event.changed_by_user_id || null,
            changedByDisplayName: event.changed_by_user_id
                ? getPayrollIdentity(options.guild, event.changed_by_user_id).displayName
                : null,
            changedAt: event.changed_at
        }));
        const archivedByIdentity = row.archived_by_user_id
            ? getPayrollIdentity(options.guild, row.archived_by_user_id)
            : {};

        return {
            weekStart: row.week_start,
            weekEnd: row.week_end,
            archivedAt: row.archived_at,
            archivedByUserId: row.archived_by_user_id || null,
            archivedByDisplayName: archivedByIdentity.displayName || null,
            settings: {
                ...(details.settings || {}),
                currency
            },
            totals: {
                userCount,
                totalTime,
                totalTimeLabel: formatDuration(totalTime),
                totalAmount,
                totalAmountLabel: formatPayAmount(totalAmount, currency, language),
                paidAmount,
                paidAmountLabel: formatPayAmount(paidAmount, currency, language),
                unpaidAmount: totalAmount - paidAmount,
                unpaidAmountLabel: formatPayAmount(totalAmount - paidAmount, currency, language),
                adjustmentAmount,
                adjustmentAmountLabel: formatSignedPayAmount(adjustmentAmount, currency, language),
                paidCount,
                unpaidCount,
                completionPercent: userCount ? Math.round((paidCount / userCount) * 100) : 0
            },
            items,
            events,
            paymentEventCount: weekEvents.length,
            lastActivityAt: weekEvents[0]?.changed_at || row.archived_at
        };
    });
}

function getWeeklyPayrollArchives(guildId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 52, 1), 104);
    const offset = Math.min(Math.max(Number(options.offset) || 0, 0), 10000);
    const rows = db.prepare(`
        SELECT guild_id, week_start, week_end, archived_by_user_id, archived_at,
               user_count, total_time, total_amount, paid_amount, unpaid_amount, details_json
        FROM weekly_payroll_archives
        WHERE guild_id = ?
        ORDER BY week_start DESC
        LIMIT ? OFFSET ?
    `).all(guildId, limit, offset);
    const countRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM weekly_payroll_archives
        WHERE guild_id = ?
    `).get(guildId);
    const items = hydrateWeeklyPayrollArchiveRows(guildId, rows, options);
    const totalCount = Number(countRow?.count) || 0;

    return {
        limit,
        offset,
        totalCount,
        hasMore: totalCount > offset + items.length,
        items
    };
}

function getWeeklyPayrollArchive(guildId, weekStart, options = {}) {
    if (!isValidDateKey(weekStart)) {
        return null;
    }

    const row = db.prepare(`
        SELECT guild_id, week_start, week_end, archived_by_user_id, archived_at,
               user_count, total_time, total_amount, paid_amount, unpaid_amount, details_json
        FROM weekly_payroll_archives
        WHERE guild_id = ? AND week_start = ?
        LIMIT 1
    `).get(guildId, String(weekStart));

    return row
        ? hydrateWeeklyPayrollArchiveRows(guildId, [row], options)[0]
        : null;
}

function syncPayrollArchivePaymentStatus(guildId, userId, weekStart, payment) {
    const row = db.prepare(`
        SELECT details_json
        FROM weekly_payroll_archives
        WHERE guild_id = ? AND week_start = ?
        LIMIT 1
    `).get(guildId, weekStart);

    if (!row) {
        return false;
    }

    const details = parsePayrollArchiveDetails(row.details_json);
    const items = Array.isArray(details.items) ? details.items : [];
    const item = items.find(entry => String(entry.userId) === String(userId));

    if (!item) {
        return false;
    }

    item.paid = Boolean(payment?.paid);
    item.paidByUserId = payment?.paid_by_user_id || null;
    item.paidAt = payment?.paid_at || null;
    item.updatedAt = payment?.updated_at || new Date().toISOString();

    const totalAmount = items.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paidAmount = items
        .filter(entry => entry.paid)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const paidCount = items.filter(entry => entry.paid).length;

    details.totals = {
        ...(details.totals || {}),
        paidAmount,
        unpaidAmount: totalAmount - paidAmount,
        paidCount,
        unpaidCount: items.length - paidCount
    };

    db.prepare(`
        UPDATE weekly_payroll_archives
        SET paid_amount = ?, unpaid_amount = ?, details_json = ?
        WHERE guild_id = ? AND week_start = ?
    `).run(
        paidAmount,
        totalAmount - paidAmount,
        JSON.stringify(details),
        guildId,
        weekStart
    );

    return true;
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

    return {
        unlimited: true,
        used,
        limit: null,
        remaining: null
    };
}

function formatCustomEmbedQuota(guildId, language = 'fr', member = null) {
    const quota = getCustomEmbedQuota(guildId, member);

    return t(language, 'customEmbedQuotaUnlimited');
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
    markCustomEmbedMediaTrash(guildId, messageId);
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

async function applyWarningEscalation(guild, member, userId, warningCase, language = 'fr') {
    const settings = operations.getWarningEscalationSettings(guild.id);

    if (!settings.enabled) {
        return null;
    }

    const warningCount = operations.getActiveWarningCount(guild.id, userId, settings.windowDays);
    const action = operations.getWarningEscalationAction(settings, warningCount);

    if (!action) {
        return { warningCount, action: null, status: 'below_threshold' };
    }

    if (member && settings.ignoredRoleIds.some(roleId => member.roles.cache.has(roleId))) {
        operations.addWarningEscalationEvent({
            guildId: guild.id,
            userId,
            warningCaseId: warningCase.id,
            warningCount,
            action,
            status: 'ignored',
            reason: 'Rôle exempté de l’escalade automatique.'
        });
        return { warningCount, action, status: 'ignored' };
    }

    const duration = action === 'timeout' ? settings.timeoutSeconds * 1000 : null;
    const reason = language === 'en'
        ? `Sentinel automatic escalation after ${warningCount} active warnings.`
        : `Escalade automatique Sentinel après ${warningCount} avertissements actifs.`;
    let error = null;

    try {
        if (action === 'timeout') {
            if (!member) throw new Error('Le membre n’est plus présent sur le serveur.');
            if (!botHasPermission(guild, PermissionsBitField.Flags.ModerateMembers)) throw new Error('Permission Discord ModerateMembers manquante.');
            if (!member.moderatable) throw new Error('Le rôle Sentinel est trop bas pour appliquer le timeout.');
            await member.timeout(duration, reason);
        } else if (action === 'kick') {
            if (!member) throw new Error('Le membre n’est plus présent sur le serveur.');
            if (!botHasPermission(guild, PermissionsBitField.Flags.KickMembers)) throw new Error('Permission Discord KickMembers manquante.');
            if (!member.kickable) throw new Error('Le rôle Sentinel est trop bas pour expulser ce membre.');
            await member.kick(reason);
        } else {
            if (!botHasPermission(guild, PermissionsBitField.Flags.BanMembers)) throw new Error('Permission Discord BanMembers manquante.');
            if (member && !member.bannable) throw new Error('Le rôle Sentinel est trop bas pour bannir ce membre.');
            await guild.members.ban(userId, { reason, deleteMessageSeconds: 0 });
        }
    } catch (caught) {
        error = caught;
    }

    operations.addWarningEscalationEvent({
        guildId: guild.id,
        userId,
        warningCaseId: warningCase.id,
        warningCount,
        action,
        status: error ? 'failed' : 'applied',
        reason,
        errorMessage: error?.message || null
    });

    if (error) {
        return { warningCount, action, status: 'failed', error: error.message };
    }

    const escalationCase = addModerationCase(
        guild.id,
        userId,
        AUTOMOD_MODERATOR_USER_ID,
        `warning_${action}`,
        reason,
        duration
    );
    await sendModerationLog(guild, client.user, escalationCase, `<@${userId}>`, language);
    return { warningCount, action, status: 'applied', caseId: escalationCase.id };
}

async function addWarningWithEscalation(guild, actorUser, member, userId, reason, language = 'fr') {
    const warningCase = addModerationCase(guild.id, userId, actorUser.id, 'warn', reason, null);
    await sendModerationLog(guild, actorUser, warningCase, member ? `${member}` : `<@${userId}>`, language);
    const escalation = await applyWarningEscalation(guild, member, userId, warningCase, language);
    return { caseData: warningCase, escalation };
}

function warningEscalationSummary(escalation, language = 'fr') {
    if (!escalation?.action) return '';
    const labels = language === 'en'
        ? { timeout: 'timeout', kick: 'kick', ban: 'ban' }
        : { timeout: 'timeout', kick: 'expulsion', ban: 'bannissement' };
    if (escalation.status === 'applied') {
        return language === 'en'
            ? ` Automatic ${labels[escalation.action]} applied at ${escalation.warningCount} active warnings.`
            : ` ${labels[escalation.action]} automatique appliqué au palier de ${escalation.warningCount} avertissements actifs.`;
    }
    if (escalation.status === 'failed') {
        return language === 'en'
            ? ` The automatic ${labels[escalation.action]} could not be applied; the incident was logged.`
            : ` La sanction automatique (${labels[escalation.action]}) n’a pas pu être appliquée; l’incident est journalisé.`;
    }
    if (escalation.status === 'ignored') {
        return language === 'en' ? ' The member is exempt from automatic escalation.' : ' Ce membre est exempté de l’escalade automatique.';
    }
    return '';
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

const DISCORD_PERMISSION_LABELS = {
    fr: new Map([
        [PermissionsBitField.Flags.ManageMessages, 'Gérer les messages'],
        [PermissionsBitField.Flags.ManageChannels, 'Gérer les salons'],
        [PermissionsBitField.Flags.ManageRoles, 'Gérer les rôles'],
        [PermissionsBitField.Flags.ModerateMembers, 'Exclure temporairement des membres'],
        [PermissionsBitField.Flags.KickMembers, 'Expulser des membres'],
        [PermissionsBitField.Flags.BanMembers, 'Bannir des membres'],
        [PermissionsBitField.Flags.ViewChannel, 'Voir le salon'],
        [PermissionsBitField.Flags.SendMessages, 'Envoyer des messages'],
        [PermissionsBitField.Flags.EmbedLinks, 'Intégrer des liens'],
        [PermissionsBitField.Flags.MentionEveryone, 'Mentionner @everyone et les rôles']
    ]),
    en: new Map([
        [PermissionsBitField.Flags.ManageMessages, 'Manage Messages'],
        [PermissionsBitField.Flags.ManageChannels, 'Manage Channels'],
        [PermissionsBitField.Flags.ManageRoles, 'Manage Roles'],
        [PermissionsBitField.Flags.ModerateMembers, 'Moderate Members'],
        [PermissionsBitField.Flags.KickMembers, 'Kick Members'],
        [PermissionsBitField.Flags.BanMembers, 'Ban Members'],
        [PermissionsBitField.Flags.ViewChannel, 'View Channel'],
        [PermissionsBitField.Flags.SendMessages, 'Send Messages'],
        [PermissionsBitField.Flags.EmbedLinks, 'Embed Links'],
        [PermissionsBitField.Flags.MentionEveryone, 'Mention @everyone and roles']
    ])
};

function getDiscordPermissionLabel(permissionFlag, language = 'fr') {
    const lang = language === 'en' ? 'en' : 'fr';
    return DISCORD_PERMISSION_LABELS[lang].get(permissionFlag)
        || (lang === 'en' ? 'the required permission' : 'la permission nécessaire');
}

function getModerationAccessDeniedMessage(permissionFlag, language = 'fr') {
    return t(language, 'moderationAccessDeniedSpecific', {
        permission: getDiscordPermissionLabel(permissionFlag, language)
    });
}

function getModerationBotPermissionMissingMessage(permissionFlag, language = 'fr') {
    return t(language, 'moderationBotPermissionMissingSpecific', {
        permission: getDiscordPermissionLabel(permissionFlag, language)
    });
}

function getModerationActionFailureMessage(error, guild, permissionFlag, targetMember, language = 'fr') {
    const discordCode = Number(error?.code || error?.rawError?.code || 0) || null;
    const message = String(error?.message || '');
    const botMember = guild?.members?.me;

    if (discordCode === 10026) {
        return t(language, 'moderationBanNotFound');
    }

    if (discordCode === 50013 || /Missing Permissions/i.test(message)) {
        const targetRole = targetMember?.roles?.highest;

        if (botMember && targetRole && targetRole.comparePositionTo(botMember.roles.highest) >= 0) {
            return t(language, 'moderationDiscordRefused', {
                fix: t(language, 'moderationRoleOrderFix', { role: targetRole.name })
            });
        }

        return t(language, 'moderationDiscordRefused', {
            fix: t(language, 'moderationBotPermissionFix', {
                permission: getDiscordPermissionLabel(permissionFlag, language)
            })
        });
    }

    return t(language, 'moderationFailed');
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

function pruneAutomodBucketMap(bucketMap, maxSize) {
    while (bucketMap.size > maxSize) {
        const firstKey = bucketMap.keys().next().value;

        if (!firstKey) {
            break;
        }

        bucketMap.delete(firstKey);
    }
}

function automodMemberBypasses(member, settings, premiumActive = false) {
    if (!member) {
        return true;
    }

    if (member.user?.bot || member.id === member.guild.ownerId || member.id === client.user?.id) {
        return true;
    }

    if (hasCommandRoleAccess(member)) {
        return true;
    }

    if (member.permissions.has(PermissionsBitField.Flags.Administrator)
        || member.permissions.has(PermissionsBitField.Flags.ManageGuild)
        || member.permissions.has(PermissionsBitField.Flags.ManageMessages)
        || member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
        || member.permissions.has(PermissionsBitField.Flags.KickMembers)
        || member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return true;
    }

    return Boolean(
        premiumActive
        && settings.premiumIgnoredRoleIds?.some(roleId => member.roles.cache.has(roleId))
    );
}

function automodChannelBypasses(channel, settings, premiumActive = false) {
    if (!premiumActive || !channel) {
        return false;
    }

    const ignoredIds = new Set(settings.premiumIgnoredChannelIds || []);

    return ignoredIds.has(channel.id) || (channel.parentId && ignoredIds.has(channel.parentId));
}

function findAutomodForbiddenWord(content, words) {
    const normalizedContent = String(content || '')
        .normalize('NFKC')
        .toLowerCase();

    return words.find(item => item.word && normalizedContent.includes(item.word)) || null;
}

function hasDiscordInvite(content) {
    return /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i.test(String(content || ''));
}

function isCapsAbuse(content) {
    const letters = String(content || '').replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ]/g, '');

    if (letters.length < 16) {
        return false;
    }

    const uppercase = letters.replace(/[^A-ZÀ-Ö]/g, '').length;

    return uppercase / letters.length >= 0.78;
}

function getMentionCount(message) {
    const everyoneCount = message.mentions.everyone ? 1 : 0;
    const userCount = message.mentions.users?.size || 0;
    const roleCount = message.mentions.roles?.size || 0;

    return everyoneCount + userCount + roleCount;
}

function isAutomodSpam(message, settings) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const windowMs = settings.spamWindowSeconds * 1000;
    const timestamps = (automodSpamBuckets.get(key) || [])
        .filter(timestamp => now - timestamp <= windowMs);

    timestamps.push(now);

    if (timestamps.length > settings.spamMaxMessages) {
        automodSpamBuckets.set(key, [now]);
        pruneAutomodBucketMap(automodSpamBuckets, AUTOMOD_SPAM_BUCKET_MAX);
        return true;
    }

    automodSpamBuckets.set(key, timestamps);
    pruneAutomodBucketMap(automodSpamBuckets, AUTOMOD_SPAM_BUCKET_MAX);
    return false;
}

function getAutomodTrigger(message, settings, words, premiumActive = false) {
    const content = String(message.content || '');

    if (settings.forbiddenWordsEnabled) {
        const forbiddenWord = findAutomodForbiddenWord(content, words);

        if (forbiddenWord) {
            return {
                rule: 'forbidden_words',
                action: settings.forbiddenWordsAction,
                reason: `Mot interdit detecte : ${forbiddenWord.word}`
            };
        }
    }

    if (settings.inviteFilterEnabled && hasDiscordInvite(content)) {
        return {
            rule: 'discord_invite',
            action: settings.inviteAction,
            reason: 'Invitation Discord detectee'
        };
    }

    if (settings.spamFilterEnabled && isAutomodSpam(message, settings)) {
        return {
            rule: 'spam',
            action: settings.spamAction,
            reason: `${settings.spamMaxMessages + 1}+ messages en ${settings.spamWindowSeconds}s`
        };
    }

    if (premiumActive && settings.premiumCapsEnabled && isCapsAbuse(content)) {
        return {
            rule: 'premium_caps',
            action: settings.premiumCapsAction,
            reason: 'Message majoritairement en majuscules'
        };
    }

    const mentionCount = getMentionCount(message);

    if (premiumActive && settings.premiumMentionsEnabled && mentionCount >= settings.premiumMentionLimit) {
        return {
            rule: 'premium_mentions',
            action: settings.premiumMentionsAction,
            reason: `${mentionCount} mention(s) dans un message`
        };
    }

    return null;
}

function automodSeverity(action) {
    return {
        log: 0,
        delete: 1,
        warn: 2,
        timeout: 3,
        kick: 4,
        ban: 5
    }[action] ?? 0;
}

function automodTimeoutDurationMs(settings, premiumActive = false) {
    const maxSeconds = premiumActive
        ? AUTOMOD_PREMIUM_MAX_TIMEOUT_SECONDS
        : AUTOMOD_FREE_MAX_TIMEOUT_SECONDS;
    const seconds = Math.min(Math.max(Number(settings.spamTimeoutSeconds) || AUTOMOD_DEFAULT_TIMEOUT_SECONDS, 30), maxSeconds);

    return seconds * 1000;
}

function truncateAutomodText(value, maxLength = 650) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();

    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function applyAutomodSanction(guild, member, userId, action, reason, durationMs, language = 'fr') {
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const targetLabel = member ? `${member}` : `<@${userId}>`;

    if (action === 'warn') {
        const result = await addWarningWithEscalation(
            guild,
            client.user || getFallbackRequester(),
            member,
            userId,
            reason,
            language
        );
        return { applied: true, caseData: result.caseData, escalation: result.escalation };
    }

    if (action === 'timeout') {
        if (!member || !botMember || !botHasPermission(guild, PermissionsBitField.Flags.ModerateMembers)) {
            return { applied: false, failure: 'permission_timeout' };
        }

        const targetError = getModerationTargetError(botMember, member, language);

        if (targetError || !member.moderatable) {
            return { applied: false, failure: 'target_timeout' };
        }

        const timeoutApplied = await member.timeout(durationMs, reason)
            .then(() => true)
            .catch(() => false);

        if (!timeoutApplied) {
            return { applied: false, failure: 'discord_timeout' };
        }

        const caseData = addModerationCase(guild.id, userId, AUTOMOD_MODERATOR_USER_ID, 'timeout', reason, durationMs);
        await sendModerationLog(guild, client.user || getFallbackRequester(), caseData, targetLabel, language);
        return { applied: true, caseData };
    }

    if (action === 'kick') {
        if (!member || !botMember || !botHasPermission(guild, PermissionsBitField.Flags.KickMembers)) {
            return { applied: false, failure: 'permission_kick' };
        }

        const targetError = getModerationTargetError(botMember, member, language);

        if (targetError || !member.kickable) {
            return { applied: false, failure: 'target_kick' };
        }

        await member.kick(reason);
        const caseData = addModerationCase(guild.id, userId, AUTOMOD_MODERATOR_USER_ID, 'kick', reason, null);
        await sendModerationLog(guild, client.user || getFallbackRequester(), caseData, targetLabel, language);
        return { applied: true, caseData };
    }

    if (action === 'ban') {
        if (!botMember || !botHasPermission(guild, PermissionsBitField.Flags.BanMembers)) {
            return { applied: false, failure: 'permission_ban' };
        }

        const targetError = getUserTargetErrorById(guild, botMember, userId, member, language);

        if (targetError) {
            return { applied: false, failure: 'target_ban' };
        }

        await guild.members.ban(userId, {
            reason,
            deleteMessageSeconds: 0
        });
        const caseData = addModerationCase(guild.id, userId, AUTOMOD_MODERATOR_USER_ID, 'ban', reason, null);
        await sendModerationLog(guild, client.user || getFallbackRequester(), caseData, targetLabel, language);
        return { applied: true, caseData };
    }

    return { applied: true, caseData: null };
}

function getProgressiveAutomodAction(settings, eventCount) {
    if (!settings.premiumProgressiveEnabled) {
        return null;
    }

    if (eventCount >= settings.premiumProgressiveBanThreshold) {
        return 'ban';
    }

    if (eventCount >= settings.premiumProgressiveKickThreshold) {
        return 'kick';
    }

    if (eventCount >= settings.premiumProgressiveTimeoutThreshold) {
        return 'timeout';
    }

    return null;
}

async function applyAutomodAction(message, trigger, settings, premiumActive = false) {
    const language = getGuildLanguage(message.guild.id);
    const userId = message.author.id;
    const member = message.member || await message.guild.members.fetch(userId).catch(() => null);
    const action = normalizeAutomodAction(trigger.action, premiumActive);
    const reason = `Auto-moderation Sentinel - ${trigger.reason}`;
    const durationMs = automodTimeoutDurationMs(settings, premiumActive);
    let deleted = false;
    let sanction = { applied: action === 'log' || action === 'delete', caseData: null };
    let progressive = null;

    if (action !== 'log' && message.deletable) {
        deleted = await message.delete().then(() => true).catch(() => false);
    }

    if (['warn', 'timeout', 'kick', 'ban'].includes(action)) {
        sanction = await applyAutomodSanction(message.guild, member, userId, action, reason, durationMs, language)
            .catch(error => ({ applied: false, failure: error.message }));
    }

    const event = addAutomodEvent(
        message.guild.id,
        userId,
        trigger.rule,
        action,
        reason,
        message.id,
        message.channelId
    );
    const eventCount = getAutomodEventCount(
        message.guild.id,
        userId,
        settings.premiumProgressiveWindowMinutes
    );
    const progressiveAction = premiumActive
        ? getProgressiveAutomodAction(settings, eventCount)
        : null;

    if (progressiveAction && automodSeverity(progressiveAction) > automodSeverity(action)) {
        const progressiveReason = `Escalade auto-moderation Sentinel - ${eventCount} infraction(s) en ${settings.premiumProgressiveWindowMinutes} min`;
        progressive = {
            action: progressiveAction,
            ...(await applyAutomodSanction(message.guild, member, userId, progressiveAction, progressiveReason, durationMs, language)
                .catch(error => ({ applied: false, failure: error.message })))
        };
    }

    const logLines = [
        `Auto-moderation declenchee dans ${message.channel || 'un salon inconnu'}.`,
        `Membre : ${message.author.tag} (${userId})`,
        `Regle : ${trigger.rule}`,
        `Action : ${action}${sanction.failure ? ` (${sanction.failure})` : ''}`,
        `Message supprime : ${deleted ? 'oui' : 'non'}`,
        `Evenement : #${event.id}`
    ];

    if (sanction.caseData?.id) {
        logLines.push(`Cas moderation : #${sanction.caseData.id}`);
    }

    if (progressive?.action) {
        logLines.push(`Escalade automatique : ${progressive.action}${progressive.failure ? ` (${progressive.failure})` : ''}`);
        if (progressive.caseData?.id) {
            logLines.push(`Cas escalade : #${progressive.caseData.id}`);
        }
    }

    if (message.content) {
        logLines.push(`Contenu : ${truncateAutomodText(message.content)}`);
    }

    await sendSentinelStaffLog(message.guild, logLines.join('\n'), {
        color: SENTINEL_COLORS.warning,
        title: 'Sentinel | Auto-modération',
        language
    });

    return true;
}

async function handleAutomodMessage(message) {
    if (!message.guild || message.author.bot || String(message.content || '').trim().startsWith('!')) {
        return false;
    }

    const settings = getAutomodSettings(message.guild.id);

    if (!settings.enabled) {
        return false;
    }

    const premiumActive = hasActivePremiumUnlockForAutomod(message.guild.id, settings);
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);

    if (automodMemberBypasses(member, settings, premiumActive)
        || automodChannelBypasses(message.channel, settings, premiumActive)) {
        return false;
    }

    const words = settings.forbiddenWordsEnabled ? getAutomodWords(message.guild.id) : [];
    const trigger = getAutomodTrigger(message, settings, words, premiumActive);

    if (!trigger) {
        return false;
    }

    return applyAutomodAction(message, trigger, settings, premiumActive);
}

async function handleAutomodRaid(member) {
    if (!member?.guild || member.user?.bot) {
        return;
    }

    const settings = getAutomodSettings(member.guild.id);
    const premiumActive = hasActivePremiumUnlockForAutomod(member.guild.id, settings);

    if (!settings.enabled || !premiumActive || !settings.premiumRaidEnabled) {
        return;
    }

    const key = member.guild.id;
    const now = Date.now();
    const windowMs = settings.premiumRaidWindowSeconds * 1000;
    const timestamps = (automodRaidBuckets.get(key) || [])
        .filter(timestamp => now - timestamp <= windowMs);

    timestamps.push(now);
    automodRaidBuckets.set(key, timestamps);
    pruneAutomodBucketMap(automodRaidBuckets, AUTOMOD_RAID_BUCKET_MAX);

    if (timestamps.length < settings.premiumRaidJoinCount) {
        return;
    }

    const reason = `${timestamps.length} arrivees en ${settings.premiumRaidWindowSeconds}s`;
    automodRaidBuckets.set(key, [now]);
    addAutomodEvent(member.guild.id, member.id, 'premium_raid', 'log', reason, null, null);
    await sendSentinelStaffLog(member.guild, [
        'Alerte anti-raid Sentinel.',
        `Signal : ${reason}`,
        `Derniere arrivee : ${member.user.tag} (${member.id})`,
        'Action : alerte staff uniquement pour eviter un faux positif destructeur.'
    ].join('\n'), {
        color: SENTINEL_COLORS.danger,
        title: 'Sentinel | Anti-raid',
        language: getGuildLanguage(member.guild.id)
    });
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

function detectCustomEmbedImageMime(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
        return null;
    }

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return 'image/png';
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    const header = buffer.subarray(0, 6).toString('ascii');

    if (header === 'GIF87a' || header === 'GIF89a') {
        return 'image/gif';
    }

    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'image/webp';
    }

    return null;
}

function normalizeCustomEmbedUpload(upload, slot, language = 'fr') {
    if (!upload || typeof upload !== 'object' || !upload.dataUrl) {
        return null;
    }

    const dataUrl = String(upload.dataUrl || '').trim();
    const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);

    if (!match) {
        throw new Error(t(language, 'customEmbedInvalidUpload'));
    }

    const declaredMime = match[1].toLowerCase() === 'image/jpg'
        ? 'image/jpeg'
        : match[1].toLowerCase();
    const cleanBase64 = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const detectedMime = detectCustomEmbedImageMime(buffer);

    if (!buffer.length || !detectedMime || detectedMime !== declaredMime || !CUSTOM_EMBED_UPLOAD_MIMES.has(detectedMime)) {
        throw new Error(t(language, 'customEmbedInvalidUpload'));
    }

    if (buffer.length > CUSTOM_EMBED_UPLOAD_MAX_BYTES) {
        throw new Error(t(language, 'customEmbedUploadTooLarge'));
    }

    const safeSlot = slot === 'thumbnail' ? 'thumbnail' : 'image';

    return {
        size: buffer.length,
        buffer,
        mimeType: detectedMime,
        slot: safeSlot
    };
}

function hasCustomEmbedUpload(input = {}) {
    return Boolean(
        input?.imageUpload?.dataUrl
        || input?.thumbnailUpload?.dataUrl
    );
}

function customEmbedUploadRequiresAttachment() {
    return !embedMediaObjectStorage.configured;
}

function getGuildEmbedMediaUsage(guildId, excludeMessageId = null) {
    if (!guildId) {
        return { bytes: 0, hashes: new Set() };
    }

    const rows = db.prepare(`
        SELECT DISTINCT objects.content_hash, objects.size_bytes
        FROM embed_media_objects AS objects
        INNER JOIN embed_media_links AS links ON links.content_hash = objects.content_hash
        WHERE links.guild_id = ?
          AND links.status = 'active'
          AND (? IS NULL OR links.message_id != ?)
    `).all(guildId, excludeMessageId, excludeMessageId);

    return {
        bytes: rows.reduce((total, row) => total + Number(row.size_bytes || 0), 0),
        hashes: new Set(rows.map(row => row.content_hash))
    };
}

function assertGuildEmbedMediaQuota(uploads, language, {
    guildId = null,
    messageId = null,
    premium = false
} = {}) {
    if (!guildId || !uploads.length) {
        return;
    }

    const usage = getGuildEmbedMediaUsage(guildId, messageId);
    const newObjects = new Map();

    for (const upload of uploads) {
        if (!usage.hashes.has(upload.contentHash)) {
            newObjects.set(upload.contentHash, upload.size);
        }
    }

    const projectedBytes = usage.bytes + [...newObjects.values()].reduce((total, size) => total + size, 0);
    const quotaBytes = EMBED_MEDIA_QUOTA_BYTES;

    if (projectedBytes > quotaBytes) {
        throw new Error(t(language, 'customEmbedMediaQuotaReached', {
            used: Math.ceil(projectedBytes / 1024 / 1024),
            limit: Math.floor(quotaBytes / 1024 / 1024)
        }));
    }
}

function upsertEmbedMediaObject(upload, {
    provider = 'local',
    storageBucket = null,
    storageKey = null,
    publicUrl = null,
    fileName = `${upload.contentHash}.${upload.extension}`
} = {}) {
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO embed_media_objects (
            content_hash, file_name, mime_type, size_bytes,
            storage_provider, storage_bucket, storage_key, public_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(content_hash) DO UPDATE SET
            file_name = excluded.file_name,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            storage_provider = excluded.storage_provider,
            storage_bucket = excluded.storage_bucket,
            storage_key = excluded.storage_key,
            public_url = excluded.public_url,
            updated_at = excluded.updated_at
    `).run(
        upload.contentHash,
        fileName,
        upload.mimeType,
        upload.size,
        provider,
        storageBucket,
        storageKey,
        publicUrl,
        now,
        now
    );
}

async function prepareCustomEmbedUploads(input, data, language = 'fr', context = {}) {
    const imageUpload = normalizeCustomEmbedUpload(input?.imageUpload, 'image', language);
    const thumbnailUpload = normalizeCustomEmbedUpload(input?.thumbnailUpload, 'thumbnail', language);
    const originalUploads = [imageUpload, thumbnailUpload].filter(Boolean);
    const totalSize = originalUploads.reduce((total, upload) => total + upload.size, 0);

    if (totalSize > CUSTOM_EMBED_UPLOAD_MAX_BYTES) {
        throw new Error(t(language, 'customEmbedUploadTooLarge'));
    }

    const uploads = await Promise.all(originalUploads.map(async original => {
        let optimized;

        try {
            optimized = await optimizeEmbedImage(original.buffer, EMBED_MEDIA_IMAGE_OPTIONS);
        } catch (error) {
            console.error('Erreur optimisation image embed Sentinel :', error);
            throw new Error(t(language, 'customEmbedInvalidUpload'));
        }

        const name = `sentinel-embed-${original.slot}-${optimized.contentHash.slice(0, 14)}.webp`;
        return {
            ...optimized,
            slot: original.slot,
            name,
            provider: 'local',
            storageKey: null,
            publicUrl: null,
            url: `attachment://${name}`,
            file: {
                attachment: optimized.buffer,
                name,
                description: original.slot === 'thumbnail'
                    ? 'Miniature embed Sentinel'
                    : 'Image embed Sentinel'
            }
        };
    }));

    assertGuildEmbedMediaQuota(uploads, language, context);

    for (const upload of uploads) {
        if (!embedMediaObjectStorage.configured) {
            continue;
        }

        const storageKey = embedMediaObjectKey(upload.contentHash);
        const existingObject = db.prepare(`
            SELECT file_name, storage_provider, storage_bucket, storage_key, public_url
            FROM embed_media_objects
            WHERE content_hash = ?
        `).get(upload.contentHash);
        const reusableObject = existingObject
            && existingObject.storage_provider === embedMediaObjectStorage.provider
            && existingObject.storage_bucket === embedMediaObjectStorage.bucket
            && existingObject.storage_key === storageKey
            && existingObject.public_url;

        if (reusableObject) {
            upload.provider = embedMediaObjectStorage.provider;
            upload.storageKey = storageKey;
            upload.publicUrl = existingObject.public_url;
            upload.url = existingObject.public_url;
            upload.file = null;
            continue;
        }

        try {
            const stored = await embedMediaObjectStorage.putIfAbsent({
                key: storageKey,
                body: upload.buffer,
                contentType: upload.mimeType,
                metadata: {
                    sha256: upload.contentHash,
                    width: upload.width,
                    height: upload.height
                }
            });
            upsertEmbedMediaObject(upload, {
                provider: embedMediaObjectStorage.provider,
                storageBucket: embedMediaObjectStorage.bucket,
                storageKey,
                publicUrl: stored.url
            });

            if (existingObject?.storage_provider === 'local' && existingObject.file_name) {
                fs.rmSync(path.join(EMBED_MEDIA_DIR, 'objects', existingObject.file_name), { force: true });
            }

            upload.provider = embedMediaObjectStorage.provider;
            upload.storageKey = storageKey;
            upload.publicUrl = stored.url;
            upload.url = stored.url;
            upload.file = null;
        } catch (error) {
            console.error(`Erreur stockage objet embed ${upload.contentHash.slice(0, 12)} :`, error);
        }
    }

    const preparedImage = uploads.find(upload => upload.slot === 'image');
    const preparedThumbnail = uploads.find(upload => upload.slot === 'thumbnail');

    if (preparedImage) {
        data.imageUrl = preparedImage.url;
    }

    if (preparedThumbnail) {
        data.thumbnailUrl = preparedThumbnail.url;
    }

    if (input && typeof input === 'object') {
        preparedCustomEmbedUploads.set(input, uploads);
    }

    return uploads.map(upload => upload.file).filter(Boolean);
}

function mediaTrashDate() {
    return new Date(Date.now() + EMBED_MEDIA_TRASH_DAYS * 86400000).toISOString();
}

function markCustomEmbedMediaTrash(guildId, messageId, slots = null) {
    const now = new Date().toISOString();
    const purgeAfter = mediaTrashDate();

    if (Array.isArray(slots) && slots.length) {
        const update = db.prepare(`
            UPDATE embed_media_links
            SET status = 'trash', updated_at = ?, trashed_at = ?, purge_after = ?
            WHERE guild_id = ? AND message_id = ? AND slot = ? AND status != 'trash'
        `);

        return db.transaction(() => slots.reduce((total, slot) => (
            total + update.run(now, now, purgeAfter, guildId, messageId, slot).changes
        ), 0))();
    }

    return db.prepare(`
        UPDATE embed_media_links
        SET status = 'trash', updated_at = ?, trashed_at = ?, purge_after = ?
        WHERE guild_id = ? AND message_id = ? AND status != 'trash'
    `).run(now, now, purgeAfter, guildId, messageId).changes;
}

function writeEmbedMediaObject(upload) {
    const objectsDirectory = path.join(EMBED_MEDIA_DIR, 'objects');
    const fileName = `${upload.contentHash}.${upload.extension}`;
    const fullPath = path.join(objectsDirectory, fileName);
    const temporaryPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    fs.mkdirSync(objectsDirectory, { recursive: true });

    if (!fs.existsSync(fullPath)) {
        const storedBytes = Number(db.prepare(`
            SELECT COALESCE(SUM(size_bytes), 0) AS bytes
            FROM embed_media_objects
            WHERE storage_provider = 'local'
        `).get()?.bytes || 0);

        if (storedBytes + upload.size > EMBED_MEDIA_MAX_BYTES) {
            return { stored: false, fileName: null, fullPath: null };
        }

        try {
            fs.writeFileSync(temporaryPath, upload.buffer, { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporaryPath, fullPath);
        } finally {
            fs.rmSync(temporaryPath, { force: true });
        }
    }

    if (fs.statSync(fullPath).size !== upload.size) {
        throw new Error('La copie locale du média ne correspond pas au fichier validé.');
    }

    upsertEmbedMediaObject(upload, { provider: 'local', fileName });

    return { stored: true, fileName, fullPath };
}

function upsertEmbedMediaLink({
    upload = null,
    attachment = null,
    guildId,
    messageId,
    slot
}) {
    const now = new Date().toISOString();
    const previous = db.prepare(`
        SELECT content_hash FROM embed_media_links
        WHERE message_id = ? AND slot = ?
    `).get(messageId, slot);

    if (previous?.content_hash && previous.content_hash !== upload?.contentHash) {
        db.prepare('UPDATE embed_media_objects SET updated_at = ? WHERE content_hash = ?')
            .run(now, previous.content_hash);
    }

    db.prepare(`
        INSERT INTO embed_media_links (
            content_hash, guild_id, message_id, slot, attachment_name, attachment_url,
            status, created_at, updated_at, trashed_at, purge_after
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL)
        ON CONFLICT(message_id, slot) DO UPDATE SET
            content_hash = excluded.content_hash,
            guild_id = excluded.guild_id,
            attachment_name = excluded.attachment_name,
            attachment_url = excluded.attachment_url,
            status = 'active',
            updated_at = excluded.updated_at,
            trashed_at = NULL,
            purge_after = NULL
    `).run(
        upload?.contentHash || null,
        guildId,
        messageId,
        slot,
        attachment?.name || upload?.name || null,
        attachment?.url || upload?.publicUrl || null,
        now,
        now
    );
}

function attachmentSlot(attachment) {
    const name = String(attachment?.name || '');
    if (/^sentinel-embed-thumbnail-/i.test(name)) return 'thumbnail';
    if (/^sentinel-embed-image-/i.test(name)) return 'image';
    return null;
}

async function syncCustomEmbedMedia(message, input = null) {
    if (!message?.guildId || !message?.id) {
        return { active: 0, trashed: 0, stored: 0 };
    }

    const preparedUploads = input && typeof input === 'object'
        ? preparedCustomEmbedUploads.get(input) || []
        : [];
    const attachments = [...message.attachments.values()];
    const liveSlots = new Set();
    let stored = 0;

    for (const upload of preparedUploads) {
        const localObject = upload.provider === 'local'
            ? writeEmbedMediaObject(upload)
            : { stored: true };
        const attachment = attachments.find(item => item.name === upload.name) || null;
        upsertEmbedMediaLink({
            upload: localObject.stored ? upload : null,
            attachment,
            guildId: message.guildId,
            messageId: message.id,
            slot: upload.slot
        });
        liveSlots.add(upload.slot);
        stored += localObject.stored ? 1 : 0;
    }

    if (input && typeof input === 'object') {
        preparedCustomEmbedUploads.delete(input);
    }

    for (const attachment of attachments) {
        const slot = attachmentSlot(attachment);

        if (!slot || liveSlots.has(slot)) {
            continue;
        }

        const existing = db.prepare(`
            SELECT content_hash FROM embed_media_links
            WHERE guild_id = ? AND message_id = ? AND slot = ?
        `).get(message.guildId, message.id, slot);
        upsertEmbedMediaLink({
            upload: existing?.content_hash ? { contentHash: existing.content_hash } : null,
            attachment,
            guildId: message.guildId,
            messageId: message.id,
            slot
        });
        liveSlots.add(slot);
    }

    const embed = message.embeds?.[0] || null;
    const embedUrls = {
        image: embed?.image?.url || null,
        thumbnail: embed?.thumbnail?.url || null
    };

    for (const [slot, url] of Object.entries(embedUrls)) {
        if (!url || liveSlots.has(slot)) {
            continue;
        }

        const existing = db.prepare(`
            SELECT links.content_hash, links.attachment_name, links.attachment_url,
                   objects.public_url
            FROM embed_media_links AS links
            LEFT JOIN embed_media_objects AS objects ON objects.content_hash = links.content_hash
            WHERE links.guild_id = ? AND links.message_id = ? AND links.slot = ?
        `).get(message.guildId, message.id, slot);

        if (existing?.content_hash && [existing.attachment_url, existing.public_url].includes(url)) {
            upsertEmbedMediaLink({
                upload: {
                    contentHash: existing.content_hash,
                    name: existing.attachment_name,
                    publicUrl: url
                },
                guildId: message.guildId,
                messageId: message.id,
                slot
            });
            liveSlots.add(slot);
        }
    }

    const currentLinks = db.prepare(`
        SELECT slot FROM embed_media_links
        WHERE guild_id = ? AND message_id = ? AND status = 'active'
    `).all(message.guildId, message.id);
    const staleSlots = currentLinks.map(row => row.slot).filter(slot => !liveSlots.has(slot));
    const trashed = staleSlots.length
        ? markCustomEmbedMediaTrash(message.guildId, message.id, staleSlots)
        : 0;

    return { active: liveSlots.size, trashed, stored };
}

async function purgeTrashedEmbedMedia() {
    const expired = db.prepare(`
        SELECT id, content_hash
        FROM embed_media_links
        WHERE status = 'trash' AND purge_after IS NOT NULL AND purge_after <= ?
        ORDER BY id ASC
        LIMIT 1000
    `).all(new Date().toISOString());

    const hashes = new Set(expired.map(row => row.content_hash).filter(Boolean));
    const deleteLink = db.prepare('DELETE FROM embed_media_links WHERE id = ?');
    db.transaction(() => expired.forEach(row => deleteLink.run(row.id)))();
    const orphanObjects = db.prepare(`
        SELECT content_hash, file_name, size_bytes
        FROM embed_media_objects
        WHERE updated_at <= ?
          AND NOT EXISTS (
              SELECT 1 FROM embed_media_links
              WHERE embed_media_links.content_hash = embed_media_objects.content_hash
          )
        LIMIT 1000
    `).all(new Date(Date.now() - EMBED_MEDIA_TRASH_DAYS * 86400000).toISOString());
    orphanObjects.forEach(item => hashes.add(item.content_hash));
    let removedObjects = 0;
    let removedBytes = 0;
    let deferredObjects = 0;

    for (const hash of hashes) {
        const reference = db.prepare('SELECT 1 FROM embed_media_links WHERE content_hash = ? LIMIT 1').get(hash);

        if (reference) {
            continue;
        }

        const object = db.prepare(`
            SELECT file_name, size_bytes, storage_provider, storage_bucket, storage_key
            FROM embed_media_objects
            WHERE content_hash = ?
        `).get(hash);

        if (object) {
            if (object.storage_provider !== 'local') {
                const matchingStorage = embedMediaObjectStorage.configured
                    && object.storage_provider === embedMediaObjectStorage.provider
                    && object.storage_bucket === embedMediaObjectStorage.bucket;

                if (!matchingStorage || !object.storage_key) {
                    deferredObjects += 1;
                    continue;
                }

                try {
                    await embedMediaObjectStorage.delete(object.storage_key);
                } catch (error) {
                    deferredObjects += 1;
                    console.error(`Erreur suppression objet embed ${hash.slice(0, 12)} :`, error);
                    continue;
                }
            } else {
                fs.rmSync(path.join(EMBED_MEDIA_DIR, 'objects', object.file_name), { force: true });
            }

            db.prepare('DELETE FROM embed_media_objects WHERE content_hash = ?').run(hash);
            removedObjects += 1;
            removedBytes += Number(object.size_bytes || 0);
        }
    }

    return { links: expired.length, objects: removedObjects, bytes: removedBytes, deferredObjects };
}

async function performCustomEmbedMediaScan(limit = 100) {
    const rows = db.prepare(`
        SELECT message_id, guild_id, channel_id
        FROM custom_embeds
        ORDER BY datetime(updated_at) ASC
        LIMIT ?
    `).all(Math.max(Math.min(Number(limit) || 100, 250), 1));
    let checked = 0;
    let orphaned = 0;
    let synchronized = 0;

    for (const row of rows) {
        const guild = client.guilds.cache.get(row.guild_id);
        const channel = guild?.channels.cache.get(row.channel_id)
            || await guild?.channels.fetch(row.channel_id).catch(() => null);
        const message = channel?.isTextBased()
            ? await channel.messages.fetch(row.message_id).catch(() => null)
            : null;
        checked += 1;

        if (!message || message.author?.id !== client.user?.id) {
            deleteCustomEmbedRecord(row.guild_id, row.message_id);
            orphaned += 1;
            continue;
        }

        await syncCustomEmbedMedia(message);
        db.prepare('UPDATE custom_embeds SET updated_at = ? WHERE guild_id = ? AND message_id = ?')
            .run(new Date().toISOString(), row.guild_id, row.message_id);
        synchronized += 1;
    }

    const now = new Date().toISOString();
    const missingRecords = db.prepare(`
        UPDATE embed_media_links
        SET status = 'trash', updated_at = ?, trashed_at = ?, purge_after = ?
        WHERE status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM custom_embeds
              WHERE custom_embeds.message_id = embed_media_links.message_id
                AND custom_embeds.guild_id = embed_media_links.guild_id
          )
    `).run(now, now, mediaTrashDate()).changes;
    const purged = await purgeTrashedEmbedMedia();

    return { checked, orphaned: orphaned + missingRecords, synchronized, purged };
}

async function scanCustomEmbedMediaOrphans(limit = 100) {
    if (mediaScanPromise) {
        return mediaScanPromise;
    }

    mediaScanPromise = performCustomEmbedMediaScan(limit)
        .finally(() => {
            mediaScanPromise = null;
        });

    return mediaScanPromise;
}

async function getPublicEmbedMedia(requestPath) {
    const match = /^\/media\/sentinel\/embeds\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/i.exec(
        String(requestPath || '')
    );

    if (!match || match[2].slice(0, 2).toLowerCase() !== match[1].toLowerCase()) {
        return null;
    }

    const contentHash = match[2].toLowerCase();
    const object = db.prepare(`
        SELECT storage_provider, storage_bucket, storage_key, mime_type, size_bytes
        FROM embed_media_objects
        WHERE content_hash = ?
    `).get(contentHash);
    const validObject = object
        && object.storage_provider === embedMediaObjectStorage.provider
        && object.storage_bucket === embedMediaObjectStorage.bucket
        && object.storage_key === embedMediaObjectKey(contentHash)
        && object.mime_type === 'image/webp';

    if (!validObject || !embedMediaObjectStorage.configured) {
        return null;
    }

    const remote = await embedMediaObjectStorage.get(object.storage_key);

    if (!remote?.body) {
        return null;
    }

    return {
        ...remote,
        contentHash,
        contentLength: remote.contentLength || Number(object.size_bytes || 0),
        contentType: 'image/webp'
    };
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

function mapCustomEmbedMessageData(message) {
    const embed = message?.embeds?.[0];

    if (!embed?.title || !embed?.description) {
        return null;
    }

    return {
        title: embed.title,
        description: embed.description,
        color: embed.hexColor || '#ff2d9a',
        imageUrl: embed.image?.url || null,
        thumbnailUrl: embed.thumbnail?.url || null,
        footer: embed.footer?.text || null
    };
}

function getCustomEmbedChannelError(guild, channel, roleToPing = null, language = 'fr', requiresFiles = false) {
    if (!channel || !channel.isTextBased()) {
        return t(language, 'channelNotText');
    }

    const permissions = channel.permissionsFor(guild.members.me);

    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
        return t(language, 'customEmbedChannelViewMissing', { channel });
    }

    if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
        return t(language, 'customEmbedChannelSendMissing', { channel });
    }

    if (!permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
        return t(language, 'customEmbedChannelEmbedMissing', { channel });
    }

    if (requiresFiles && !permissions.has(PermissionsBitField.Flags.AttachFiles)) {
        return t(language, 'customEmbedChannelAttachMissing', { channel });
    }

    if (roleToPing && !roleToPing.mentionable && !permissions.has(PermissionsBitField.Flags.MentionEveryone)) {
        return t(language, 'customEmbedMentionPermissionMissing');
    }

    return null;
}

function buildCustomEmbedPayload(data, roleToPing = null, language = 'fr', files = []) {
    const payload = {
        embeds: [buildCustomAnnouncementEmbed(data, language)],
        allowedMentions: roleToPing
            ? { roles: [roleToPing.id] }
            : { parse: [] }
    };

    if (Array.isArray(files) && files.length > 0) {
        payload.files = files;
    }

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
            name: 'État de mission',
            value: `**${status}**`,
            inline: true
        },
        {
            name: 'Temps consigné',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    ];

    return createSentinelEmbed({
        color: userData?.startTime ? SENTINEL_COLORS.success : SENTINEL_COLORS.accent,
        title: 'Sentinel | Registre agent',
        description: `Fiche : ${member}\n${sessionLines.length > 0 ? sessionLines.join('\n') : 'Aucun service consigné.'}`,
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

async function closeDossierChannel(channel, actor, language = 'fr', details = {}) {
    const reason = String(details.reason || '').trim().slice(0, 500);
    const resolution = String(details.resolution || '').trim().slice(0, 1500);

    if (!reason || !resolution) {
        throw new Error(language === 'en'
            ? 'A closing reason and resolution summary are required.'
            : 'Le motif de clôture et le résumé de résolution sont obligatoires.');
    }

    const topic = parseDossierChannelTopic(channel.topic);
    const dossier = getDossierByChannel(channel.guild.id, channel.id) || (topic
        ? createDossierRecord(
            channel.guild.id,
            channel.id,
            topic.ownerUserId,
            topic.ownerUserId,
            topic.type,
            { subject: channel.name, description: 'Dossier repris dans le registre avant sa clôture.' }
        )
        : null);

    if (!dossier) {
        throw new Error(language === 'en'
            ? 'This channel is not a Sentinel dossier.'
            : 'Ce salon n’est pas un dossier Sentinel.');
    }
    const actorUser = actor.user || actor;
    const actorId = actorUser.id;
    const closureDraft = {
        ...dossier,
        status: 'closed',
        closedAt: new Date().toISOString(),
        closedByUserId: actorId,
        closeReason: reason,
        resolutionSummary: resolution
    };
    const archive = await sendDossierTranscript(channel, closureDraft, actorUser, language);

    if (!archive?.archived) {
        throw new Error(language === 'en'
            ? 'The complete archive could not be confirmed. The dossier remains open.'
            : 'L’archive complète n’a pas pu être confirmée. Le dossier reste ouvert.');
    }

    const closedDossier = closeDossierRecord(channel.guild.id, channel.id, actorId, {
        reason,
        resolution,
        advanced: Boolean(details.advanced)
    }) || closureDraft;

    if (closedDossier.ownerUserId) {
        await channel.permissionOverwrites.edit(closedDossier.ownerUserId, {
            SendMessages: false
        }, { reason: 'Dossier Sentinel scellé après archivage confirmé' }).catch(() => {});

        const owner = await client.users.fetch(closedDossier.ownerUserId).catch(() => null);
        await owner?.send({
            embeds: [new EmbedBuilder()
                .setColor(SENTINEL_COLORS.neutral)
                .setTitle(language === 'en' ? 'Sentinel | Dossier closed' : 'Sentinel | Dossier clôturé')
                .setDescription(language === 'en'
                    ? `Your dossier #${closedDossier.id || channel.id} has been closed and safely archived.`
                    : `Ton dossier #${closedDossier.id || channel.id} a été clôturé et archivé.`)
                .addFields(
                    { name: language === 'en' ? 'Reason' : 'Motif', value: reason },
                    { name: language === 'en' ? 'Resolution' : 'Résolution', value: resolution }
                )
                .setTimestamp()]
        }).catch(() => {});
    }

    await sendSentinelStaffLog(
        channel.guild,
        language === 'en'
            ? `Sentinel dossier #${closedDossier?.id || channel.id} closed and archived: **${channel.name}** by ${actorUser}.`
            : `Dossier Sentinel #${closedDossier?.id || channel.id} clôturé et archivé : **${channel.name}** par ${actorUser}.`,
        {
            color: SENTINEL_COLORS.warning,
            requester: actorUser,
            language
        }
    );

    await channel.send(language === 'en'
        ? `This dossier is sealed. Its complete archive is confirmed. This space will be withdrawn ${closedDossier.deletionScheduledAt ? `<t:${Math.floor(new Date(closedDossier.deletionScheduledAt).getTime() / 1000)}:R>` : 'later'}.`
        : `Ce dossier est scellé. Son archive complète est confirmée. Cet espace sera retiré ${closedDossier.deletionScheduledAt ? `<t:${Math.floor(new Date(closedDossier.deletionScheduledAt).getTime() / 1000)}:R>` : 'ultérieurement'}.`
    ).catch(() => {});

    return closedDossier;
}

async function closeDossierChannelFromInteraction(interaction, channel, language, details = {}) {
    await closeDossierChannel(channel, interaction.user, language, details);

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
        let deleted;

        try {
            deleted = await channel.bulkDelete(amount, true);
        } catch (error) {
            console.error('Erreur purge confirmee :', error);
            throw new Error(getModerationActionFailureMessage(
                error,
                guild,
                PermissionsBitField.Flags.ManageMessages,
                null,
                language
            ));
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
            throw new Error(getModerationActionFailureMessage(
                error,
                guild,
                PermissionsBitField.Flags.BanMembers,
                member,
                language
            ));
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
            throw new Error(getModerationActionFailureMessage(
                error,
                guild,
                PermissionsBitField.Flags.KickMembers,
                member,
                language
            ));
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
    return getSentinelStatusChannels(guild)[0]?.channel || null;
}

function getSentinelStatusChannels(guild) {
    const channels = [];
    const seenChannelIds = new Set();
    const addTarget = (channel, language) => {
        if (!channel || !channel.isTextBased?.() || seenChannelIds.has(channel.id)) {
            return;
        }

        seenChannelIds.add(channel.id);
        channels.push({
            channel,
            language
        });
    };

    const guildConfig = getGuildConfig(guild.id);

    if (guildConfig.statusChannelId) {
        addTarget(guild.channels.cache.get(guildConfig.statusChannelId), guildConfig.language);
    }

    for (const target of SENTINEL_STATUS_CHANNELS) {
        const channel = findGuildTextChannel(guild, target.name);

        addTarget(channel, target.language);
    }

    return channels;
}

function getSentinelOfficialUpdateChannels(guild) {
    const channels = [];
    const seenChannelIds = new Set();
    const addTarget = (channel, language) => {
        if (!channel?.isTextBased?.() || seenChannelIds.has(channel.id)) {
            return;
        }

        seenChannelIds.add(channel.id);
        channels.push({ channel, language });
    };
    for (const target of SENTINEL_OFFICIAL_UPDATE_CHANNELS) {
        addTarget(findGuildTextChannel(guild, target.name), target.language);
    }

    const config = getGuildConfig(guild.id);

    if (config.updatesChannelId && config.updatesChannelId !== config.statusChannelId) {
        addTarget(guild.channels.cache.get(config.updatesChannelId), config.language);
    }

    return channels;
}

function getServiceRole(guild) {
    const guildConfig = getGuildConfig(guild.id);

    if (!guildConfig.serviceRoleId) {
        return null;
    }

    return guild.roles.cache.get(guildConfig.serviceRoleId);
}

function getServiceRoleManageError(guild, role, language = 'fr') {
    if (!role) {
        return t(language, 'noServiceRole');
    }

    if (role.id === guild.id) {
        return t(language, 'serviceRoleEveryoneDenied');
    }

    if (role.managed) {
        return t(language, 'serviceRoleManagedDenied', { role });
    }

    const botMember = guild.members.me;
    const botRole = botMember?.roles.highest || 'Sentinel';
    const canManageRoles = Boolean(botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles));
    const botRoleAbove = Boolean(botMember && botMember.roles.highest.comparePositionTo(role) > 0);

    if (!canManageRoles) {
        return t(language, 'serviceRoleMissingManageRoles');
    }

    if (!botRoleAbove) {
        return t(language, 'serviceRoleTooHigh', { role, botRole });
    }

    return null;
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
            title: 'Sentinel | Fiche agent',
            description: 'Aucun service consigné pour le moment.\nPrends ton service depuis le Bureau Sentinel pour ouvrir ta fiche.',
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
            name: 'État',
            value: `**${getServiceStatusText(userData.startTime)}**`,
            inline: true
        },
        {
            name: 'Temps consigné',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    ];

    if (userData.startTime) {
        fields.push({
            name: 'Service en cours',
            value: `Ouvert <t:${Math.floor(userData.startTime / 1000)}:R>\nDurée actuelle : **${formatDuration(Date.now() - userData.startTime)}**`,
            inline: false
        });
    }

    return createSentinelEmbed({
        color: userData.startTime ? SENTINEL_COLORS.success : SENTINEL_COLORS.danger,
        title: 'Sentinel | Fiche agent',
        description: `Fiche : ${user}`,
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
        title: 'Sentinel | Fiche agent',
        description: `Fiche : ${member}`,
        requester,
        thumbnail: member.user.displayAvatarURL()
    }).addFields(
        {
            name: 'État',
            value: `**${getServiceStatusText(userData.startTime)}**`,
            inline: true
        },
        {
            name: 'Temps consigné',
            value: `**${formatDuration(totalTime)}**`,
            inline: true
        }
    );
}

function buildTopServiceEmbed(requester, classement, options = {}) {
    if (classement.length === 0) {
        return null;
    }

    const displayLimit = REFERENCE_TOP_LIMIT;
    const displayedClassement = classement.slice(0, displayLimit);
    const totalServerTime = classement.reduce((acc, user) => acc + user.totalTime, 0);
    const bestUser = classement[0];

    const lines = displayedClassement.map((user, index) => (
        `**${getRankLabel(index)}.** <@${user.userId}> - **${formatDuration(user.totalTime)}**`
    ));
    const suffix = classement.length > displayedClassement.length
        ? `\n\n${classement.length - displayedClassement.length} autre(s) agent(s) consigné(s).`
        : '';
    const description = `${lines.join('\n')}${suffix}`;

    return createSentinelEmbed({
        color: SENTINEL_COLORS.warning,
        title: 'Sentinel | Registre général',
        description,
        requester
    })
        .addFields(
            {
                name: 'Agents consignés',
                value: `**${classement.length}**`,
                inline: true
            },
            {
                name: 'Temps total',
                value: `**${formatDuration(totalServerTime)}**`,
                inline: true
            },
            {
                name: 'Tête de registre',
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
    const statusChannelValue = guildConfig.statusChannelId ? `<#${guildConfig.statusChannelId}>` : 'Non configuré';
    const updatesChannelValue = guildConfig.updatesChannelId ? `<#${guildConfig.updatesChannelId}>` : 'Non configuré';
    const updatesPingRoleValue = guildConfig.updatesPingRoleId ? `<@&${guildConfig.updatesPingRoleId}>` : 'Aucun';
    const statusUpdatesValue = guildConfig.statusUpdatesEnabled ? 'Activées' : 'Désactivées';
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
                name: 'État technique',
                value: statusChannelValue,
                inline: true
            },
            {
                name: 'Nouveautés officielles',
                value: `${updatesChannelValue}\nDiffusion : **${statusUpdatesValue}**\nMention : ${updatesPingRoleValue}`,
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
        lines.push(`... et **${hiddenCount}** autre(s) agent(s) en déploiement.`);
    }

    return createSentinelEmbed({
        color: SENTINEL_COLORS.success,
        title: 'Sentinel | Déploiement actif',
        description: lines.join('\n'),
        requester
    })
        .addFields(
            {
                name: 'Agents déployés',
                value: `**${activeServices.length}**`,
                inline: true
            },
            {
                name: 'Temps de présence cumulé',
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
        title: 'Sentinel | Rapport de service',
        description: `État du registre de **${guild.name}**.`,
        requester
    })
        .addFields(
            {
                name: 'Déployés',
                value: `**${summary.activeServices.length}**`,
                inline: true
            },
            {
                name: 'Agents enregistrés',
                value: `**${summary.registeredUsers}**`,
                inline: true
            },
            {
                name: 'Temps consigné',
                value: `**${formatDuration(summary.totalServiceTime)}**`,
                inline: true
            },
            {
                name: 'Cycle courant',
                value: `**${formatDuration(summary.weeklyServiceTime)}**`,
                inline: true
            },
            {
                name: 'Premier registre',
                value: bestUserValue,
                inline: false
            },
            {
                name: 'Premier cycle',
                value: bestWeekUserValue,
                inline: false
            },
            {
                name: 'Poste de service',
                value: `Grade : ${roleValue}\nRegistre : ${logChannelValue}`,
                inline: false
            }
        );
}

function buildWeeklyPayrollEmbed(guild, requester, options = {}) {
    const language = getGuildLanguage(guild.id);
    const payroll = getWeeklyPayroll(guild.id, { language, guild });
    const displayLimit = REFERENCE_TOP_LIMIT;
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
        title: isEnglish ? 'Sentinel | Weekly RP payroll' : 'Sentinel | Registre de paie',
        description,
        requester,
        thumbnail: guild.iconURL(),
        language
    })
        .addFields(
            {
                name: isEnglish ? 'Current week' : 'Cycle en cours',
                value: `**${payroll.weekStart} → ${payroll.weekEnd}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Hourly amount' : 'Montant horaire',
                value: `**${formatPayAmount(payroll.settings.hourlyRate, payroll.settings.currency, language)}**`,
                inline: true
            },
            {
                name: isEnglish ? 'Total time' : 'Temps consigné',
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

function buildPayrollArchiveHistoryEmbed(guild, requester, weekStart = null) {
    const language = getGuildLanguage(guild.id);
    const isEnglish = language === 'en';
    const selectedArchive = weekStart
        ? getWeeklyPayrollArchive(guild.id, weekStart, { guild, language })
        : null;

    if (weekStart && !selectedArchive) {
        return null;
    }

    const archives = selectedArchive
        ? [selectedArchive]
        : getWeeklyPayrollArchives(guild.id, { guild, language, limit: 8 }).items;

    if (!archives.length) {
        return null;
    }

    if (!selectedArchive) {
        const lines = archives.map(archive => {
            const settled = archive.totals.unpaidCount === 0 && archive.totals.userCount > 0;
            const status = settled
                ? (isEnglish ? 'Paid' : 'Réglée')
                : (isEnglish ? `${archive.totals.unpaidCount} pending` : `${archive.totals.unpaidCount} en attente`);

            return [
                `**${archive.weekStart} → ${archive.weekEnd}**`,
                `${archive.totals.totalAmountLabel} · ${status}`,
                `${archive.totals.totalTimeLabel} · ${archive.totals.userCount} agent(s)`
            ].join('\n');
        });

        return createSentinelEmbed({
            color: SENTINEL_COLORS.accent,
            title: isEnglish ? 'Sentinel | Payroll archives' : 'Sentinel | Archives de paie',
            description: lines.join('\n\n'),
            requester,
            thumbnail: guild.iconURL(),
            language
        }).addFields({
            name: isEnglish ? 'Full ledger' : 'Registre complet',
            value: isEnglish
                ? `Open ${getDashboardUrl('/dashboard')} to search all periods and update payment status.`
                : `Ouvre ${getDashboardUrl('/dashboard')} pour rechercher toutes les périodes et suivre les règlements.`,
            inline: false
        });
    }

    const lines = selectedArchive.items.slice(0, 10).map(item => {
        const status = item.paid
            ? (isEnglish ? 'Paid' : 'Payé')
            : (isEnglish ? 'Pending' : 'À payer');

        return `<@${item.userId}> · **${item.amountLabel}** · ${item.totalTimeLabel} · ${status}`;
    });
    const hiddenCount = selectedArchive.items.length - lines.length;

    if (hiddenCount > 0) {
        lines.push(isEnglish
            ? `... and **${hiddenCount}** other agent(s).`
            : `... et **${hiddenCount}** autre(s) agent(s).`);
    }

    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title: isEnglish ? 'Sentinel | Archived payroll' : 'Sentinel | Paie archivée',
        description: lines.join('\n') || (isEnglish ? 'No payroll line in this archive.' : 'Aucune ligne de paie dans cette archive.'),
        requester,
        thumbnail: guild.iconURL(),
        language
    }).addFields(
        {
            name: isEnglish ? 'Period' : 'Période',
            value: `**${selectedArchive.weekStart} → ${selectedArchive.weekEnd}**`,
            inline: true
        },
        {
            name: isEnglish ? 'Total' : 'Total',
            value: `**${selectedArchive.totals.totalAmountLabel}**`,
            inline: true
        },
        {
            name: isEnglish ? 'Progress' : 'Avancement',
            value: `**${selectedArchive.totals.paidCount}/${selectedArchive.totals.userCount} · ${selectedArchive.totals.completionPercent}%**`,
            inline: true
        },
        {
            name: isEnglish ? 'Already paid' : 'Déjà payé',
            value: `**${selectedArchive.totals.paidAmountLabel}**`,
            inline: true
        },
        {
            name: isEnglish ? 'Still to pay' : 'Reste à payer',
            value: `**${selectedArchive.totals.unpaidAmountLabel}**`,
            inline: true
        },
        {
            name: isEnglish ? 'Last activity' : 'Dernière activité',
            value: `<t:${Math.floor(new Date(selectedArchive.lastActivityAt).getTime() / 1000)}:R>`,
            inline: true
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
    const statusChannel = guildConfig.statusChannelId
        ? await guild.channels.fetch(guildConfig.statusChannelId).catch(() => null)
        : null;
    const statusPermissions = statusChannel && botMember
        ? statusChannel.permissionsFor(botMember)
        : null;
    const updatesChannel = guildConfig.updatesChannelId
        ? await guild.channels.fetch(guildConfig.updatesChannelId).catch(() => null)
        : null;
    const updatesPermissions = updatesChannel && botMember
        ? updatesChannel.permissionsFor(botMember)
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
    const statusChannelOk = Boolean(statusChannel?.isTextBased());
    const statusCanSend = Boolean(
        !guildConfig.statusChannelId
        || (statusChannelOk
        && statusPermissions?.has(PermissionsBitField.Flags.ViewChannel)
        && statusPermissions?.has(PermissionsBitField.Flags.SendMessages)
        && statusPermissions?.has(PermissionsBitField.Flags.EmbedLinks))
    );
    const updatesChannelOk = Boolean(updatesChannel?.isTextBased());
    const updatesCanSend = Boolean(
        updatesChannelOk
        && updatesPermissions?.has(PermissionsBitField.Flags.ViewChannel)
        && updatesPermissions?.has(PermissionsBitField.Flags.SendMessages)
        && updatesPermissions?.has(PermissionsBitField.Flags.EmbedLinks)
    );
    const statusUpdatesReady = Boolean(guildConfig.statusUpdatesEnabled && updatesCanSend);
    const hasStatusIssue = !statusCanSend || !guildConfig.updatesChannelId || !statusUpdatesReady;
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
        && !hasStatusIssue
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

    if (!guildConfig.updatesChannelId) {
        fixes.push('Choisis le salon obligatoire des nouveautés avec `/config-statut`.');
    } else if (!updatesCanSend) {
        fixes.push('Vérifie le salon des nouveautés : Sentinel doit le voir, y écrire et intégrer des liens.');
    } else if (!statusUpdatesReady) {
        fixes.push('Réactive les nouveautés avec `/config-statut action:Recevoir les mises à jour`.');
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
                    diagnosticLine(databaseOk, 'Données internes disponibles'),
                    `Agents suivis : **${getRegisteredUserCount(guild.id)}**`,
                    `Déploiement actif : **${getActiveServices(guild.id).length}**`
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
                name: 'État technique',
                value: [
                    diagnosticLine(statusCanSend, 'Salon accessible à Sentinel', guildConfig.statusChannelId ? `<#${guildConfig.statusChannelId}>` : 'optionnel')
                ].join('\n'),
                inline: false
            },
            {
                name: 'Nouveautés officielles',
                value: [
                    diagnosticLine(Boolean(guildConfig.updatesChannelId), 'Salon obligatoire configuré', guildConfig.updatesChannelId ? `<#${guildConfig.updatesChannelId}>` : 'à choisir avec `/config-statut`'),
                    diagnosticLine(updatesCanSend, 'Salon accessible à Sentinel'),
                    diagnosticLine(statusUpdatesReady, 'Annonces officielles activées')
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
        description: 'Les données de service et le rôle Discord ont été remis en cohérence.',
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

function buildSentinelStatusEmbed(guild, requester = client.user, language = 'fr') {
    const isEnglish = language === 'en';
    const guildConfig = getGuildConfig(guild.id);
    let databaseOk = true;

    try {
        checkDatabase();
    } catch (error) {
        databaseOk = false;
    }

    const syncText = lastSentinelServerSync
        ? `<t:${Math.floor(lastSentinelServerSync / 1000)}:R>`
        : (isEnglish ? 'No relay yet' : 'Aucun relais pour le moment');
    const syncDetail = lastSentinelServerSyncResult?.skipped
        ? (isEnglish
            ? `Relay held: ${lastSentinelServerSyncResult.reason}`
            : `Relais retenu : ${lastSentinelServerSyncResult.reason}`)
        : lastSentinelServerSyncResult
            ? (isEnglish
                ? `${lastSentinelServerSyncResult.created} opening(s), ${lastSentinelServerSyncResult.updated} refresh(es)`
                : `${lastSentinelServerSyncResult.created} ouverture(s), ${lastSentinelServerSyncResult.updated} rafraîchissement(s)`)
            : (isEnglish ? 'Standing by' : 'En veille');

    return createSentinelEmbed({
        color: databaseOk ? SENTINEL_COLORS.success : SENTINEL_COLORS.warning,
        title: isEnglish ? 'Sentinel | Operations' : 'Sentinel | État opérationnel',
        description: isEnglish
            ? `Operations channel for **${guild.name}**.`
            : `Canal de contrôle opérationnel pour **${guild.name}**.`,
        requester,
        language
    }).addFields(
        {
            name: isEnglish ? 'Sentinel core' : 'Noyau Sentinel',
            value: isEnglish
                ? `Awake\nSignal: **${client.ws.ping}ms**\nProtocol: \`${SENTINEL_BUILD}\``
                : `Éveillé\nSignal : **${client.ws.ping}ms**\nProtocole : \`${SENTINEL_BUILD}\``,
            inline: false
        },
        {
            name: isEnglish ? 'Internal ledger' : 'Registre interne',
            value: databaseOk
                ? (isEnglish ? 'Stable - ledger accessible' : 'Stable - registre accessible')
                : (isEnglish ? 'Needs inspection - ledger unreachable' : 'À inspecter - registre injoignable'),
            inline: true
        },
        {
            name: isEnglish ? 'Latest relay' : 'Dernier relais',
            value: `${syncText}\n${syncDetail}`,
            inline: true
        },
        {
            name: isEnglish ? 'Technical watch' : 'Veille technique',
            value: isEnglish
                ? 'This panel is reserved for Sentinel operational status.'
                : 'Ce panneau est réservé à l’état opérationnel de Sentinel.',
            inline: false
        }
    );
}

async function updateSentinelStatusPanel(guild) {
    await guild.channels.fetch().catch(() => null);

    const targets = getSentinelStatusChannels(guild);

    if (targets.length === 0) {
        return;
    }

    for (const { channel, language } of targets) {
        const payload = buildSentinelStatusPayload(guild, language);
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        const botMessages = messages?.filter(message => message.author.id === client.user.id);
        const mixedServicePanel = botMessages?.find(isMixedServiceStatusPanelMessage);
        const botMessage = botMessages?.find(isSentinelStatusPanelMessage);

        if (mixedServicePanel) {
            await mixedServicePanel.edit(buildServicePanelPayload(language)).catch(() => {});
        }

        if (botMessage) {
            await botMessage.edit(payload).catch(() => {});
            continue;
        }

        await channel.send(payload).catch(() => {});
    }
}

async function updateAllSentinelStatusPanels() {
    for (const guild of client.guilds.cache.values()) {
        await updateSentinelStatusPanel(guild).catch(error => {
            console.error('Erreur mise a jour statut Sentinel :', error);
        });
    }
}

function buildOfficialStatusUpdateEmbed({ title, body, requester, language = 'fr' }) {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.accent,
        title,
        description: body,
        requester,
        language
    }).addFields({
        name: language === 'en' ? 'Sentinel update' : 'Mise à jour Sentinel',
        value: language === 'en'
            ? 'This message was selected for public update channels by the Sentinel creator.'
            : 'Ce message a été choisi par la créatrice pour les salons publics de nouveautés.',
        inline: false
    });
}

function getOfficialStatusUpdatePayload({ title, body, requester, language, pingRoleId = null }) {
    const payload = {
        embeds: [buildOfficialStatusUpdateEmbed({
            title,
            body,
            requester,
            language
        })],
        allowedMentions: pingRoleId ? { roles: [pingRoleId] } : { parse: [] }
    };

    if (pingRoleId) {
        payload.content = `<@&${pingRoleId}>`;
    }

    return payload;
}

function mapOfficialUpdate(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        publicKey: row.public_key || null,
        titleFr: row.title_fr,
        bodyFr: row.body_fr,
        titleEn: row.title_en || null,
        bodyEn: row.body_en || null,
        source: row.source || null,
        createdByUserId: row.created_by_user_id || null,
        createdAt: row.created_at,
        publishedAt: row.published_at
    };
}

function createOfficialUpdateRecord({ titleFr, bodyFr, titleEn, bodyEn, source, requester }) {
    const timestamp = new Date().toISOString();
    const result = db.prepare(`
        INSERT INTO official_updates (
            public_key, title_fr, body_fr, title_en, body_en, source,
            created_by_user_id, is_public, created_at, published_at
        )
        VALUES (NULL, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
        titleFr,
        bodyFr,
        titleEn || null,
        bodyEn || null,
        source || 'mise à jour officielle',
        requester?.id || null,
        timestamp,
        timestamp
    );

    return mapOfficialUpdate(db.prepare('SELECT * FROM official_updates WHERE id = ?').get(result.lastInsertRowid));
}

function getPublicOfficialUpdates(limit = 20) {
    const safeLimit = clampNumber(limit, 1, 50);
    return db.prepare(`
        SELECT *
        FROM official_updates
        WHERE is_public = 1
        ORDER BY published_at DESC, id DESC
        LIMIT ?
    `).all(safeLimit).map(mapOfficialUpdate);
}

function getGuildOfficialUpdateHistory(guildId, limit = 20) {
    const safeLimit = clampNumber(limit, 1, 50);
    return db.prepare(`
        SELECT
            d.id,
            d.update_id,
            d.channel_id,
            d.language,
            d.ping_role_id,
            d.status,
            d.message_id,
            d.attempt_count,
            d.last_error,
            d.next_attempt_at,
            d.delivered_at,
            d.updated_at,
            u.title_fr,
            u.title_en,
            u.published_at
        FROM official_update_deliveries d
        JOIN official_updates u ON u.id = d.update_id
        WHERE d.guild_id = ?
        ORDER BY d.updated_at DESC, d.id DESC
        LIMIT ?
    `).all(guildId, safeLimit).map(row => ({
        id: row.id,
        updateId: row.update_id,
        channelId: row.channel_id,
        language: row.language,
        pingRoleId: row.ping_role_id || null,
        status: row.status,
        messageId: row.message_id || null,
        attemptCount: row.attempt_count || 0,
        lastError: row.last_error || null,
        nextAttemptAt: row.next_attempt_at || null,
        deliveredAt: row.delivered_at || null,
        updatedAt: row.updated_at,
        publishedAt: row.published_at,
        title: row.language === 'en' && row.title_en ? row.title_en : row.title_fr
    }));
}

function queueOfficialUpdateDelivery(updateId, target) {
    const timestamp = new Date().toISOString();
    db.prepare(`
        INSERT INTO official_update_deliveries (
            update_id, guild_id, channel_id, language, ping_role_id,
            status, attempt_count, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?)
        ON CONFLICT(update_id, guild_id, channel_id) DO UPDATE SET
            language = excluded.language,
            ping_role_id = excluded.ping_role_id,
            updated_at = excluded.updated_at
    `).run(
        updateId,
        target.guild.id,
        target.channel.id,
        target.language === 'en' ? 'en' : 'fr',
        target.pingRoleId || null,
        timestamp
    );

    return db.prepare(`
        SELECT id
        FROM official_update_deliveries
        WHERE update_id = ? AND guild_id = ? AND channel_id = ?
    `).get(updateId, target.guild.id, target.channel.id)?.id || null;
}

const OFFICIAL_UPDATE_MAX_ATTEMPTS = 5;
const OFFICIAL_UPDATE_RETRY_DELAYS_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

function officialUpdateRetryAt(attemptCount) {
    const delay = OFFICIAL_UPDATE_RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), OFFICIAL_UPDATE_RETRY_DELAYS_MS.length - 1)];
    return new Date(Date.now() + delay).toISOString();
}

function officialUpdateErrorMessage(error) {
    return String(error?.message || error || 'Échec de livraison inconnu.').replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function attemptOfficialUpdateDelivery(deliveryId) {
    const delivery = db.prepare(`
        SELECT d.*, u.title_fr, u.body_fr, u.title_en, u.body_en
        FROM official_update_deliveries d
        JOIN official_updates u ON u.id = d.update_id
        WHERE d.id = ?
    `).get(deliveryId);

    if (!delivery || delivery.status === 'delivered' || delivery.status === 'cancelled' || delivery.status === 'failed') {
        return { ok: delivery?.status === 'delivered', skipped: true };
    }

    const attemptCount = (delivery.attempt_count || 0) + 1;
    const timestamp = new Date().toISOString();
    const staleSendingBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const claimed = db.prepare(`
        UPDATE official_update_deliveries
        SET status = 'sending', updated_at = ?
        WHERE id = ?
          AND (
            status IN ('pending', 'retrying')
            OR (status = 'sending' AND updated_at <= ?)
          )
    `).run(timestamp, deliveryId, staleSendingBefore);

    if (claimed.changes !== 1) {
        return { ok: false, skipped: true };
    }

    try {
        const guild = client.guilds.cache.get(delivery.guild_id)
            || await client.guilds.fetch(delivery.guild_id);
        const channel = guild.channels.cache.get(delivery.channel_id)
            || await guild.channels.fetch(delivery.channel_id);

        if (!channel?.isTextBased?.()) {
            throw new Error('Le salon des nouveautés est introuvable ou non textuel.');
        }

        const language = delivery.language === 'en' ? 'en' : 'fr';
        const channelError = getCustomEmbedChannelError(guild, channel, null, language);

        if (channelError) {
            throw new Error(channelError);
        }

        let pingRoleId = delivery.ping_role_id || null;
        if (pingRoleId) {
            const pingRole = guild.roles.cache.get(pingRoleId)
                || await guild.roles.fetch(pingRoleId).catch(() => null);
            pingRoleId = pingRole ? pingRole.id : null;
        }

        const title = language === 'en' && delivery.title_en ? delivery.title_en : delivery.title_fr;
        const body = language === 'en' && delivery.body_en ? delivery.body_en : delivery.body_fr;
        const recentMessages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        const existingMessage = recentMessages?.find(message => (
            message.author?.id === client.user.id
            && message.embeds?.some(embed => embed.title === title && embed.description === body)
        ));
        const message = existingMessage || await channel.send(getOfficialStatusUpdatePayload({
            title,
            body,
            requester: client.user,
            language,
            pingRoleId
        }));

        db.prepare(`
            UPDATE official_update_deliveries
            SET status = 'delivered', message_id = ?, attempt_count = ?, last_error = NULL,
                next_attempt_at = NULL, delivered_at = ?, updated_at = ?
            WHERE id = ?
        `).run(message.id, attemptCount, timestamp, timestamp, deliveryId);

        return { ok: true, messageId: message.id, guildId: guild.id, channelId: channel.id };
    } catch (error) {
        const terminal = attemptCount >= OFFICIAL_UPDATE_MAX_ATTEMPTS;
        const nextAttemptAt = terminal ? null : officialUpdateRetryAt(attemptCount);
        db.prepare(`
            UPDATE official_update_deliveries
            SET status = ?, attempt_count = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
            WHERE id = ?
        `).run(
            terminal ? 'failed' : 'retrying',
            attemptCount,
            officialUpdateErrorMessage(error),
            nextAttemptAt,
            timestamp,
            deliveryId
        );

        return { ok: false, retrying: !terminal, error: officialUpdateErrorMessage(error) };
    }
}

async function processOfficialUpdateRetries() {
    const staleSendingBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const due = db.prepare(`
        SELECT id
        FROM official_update_deliveries
        WHERE (
            status IN ('pending', 'retrying')
            AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
          )
          OR (status = 'sending' AND updated_at <= ?)
        ORDER BY updated_at ASC
        LIMIT 20
    `).all(new Date().toISOString(), staleSendingBefore);

    for (const item of due) {
        await attemptOfficialUpdateDelivery(item.id);
    }

    return due.length;
}

async function distributeLatestPublicOfficialUpdate() {
    const update = db.prepare(`
        SELECT *
        FROM official_updates
        WHERE is_public = 1
        ORDER BY published_at DESC, id DESC
        LIMIT 1
    `).get();

    if (!update) {
        return { queued: 0, delivered: 0 };
    }

    let queued = 0;
    let delivered = 0;

    for (const guild of client.guilds.cache.values()) {
        let targets = [];

        if (guild.id === SENTINEL_REFERENCE_GUILD_ID) {
            await guild.channels.fetch().catch(() => null);
            const pingRoleId = getGuildConfig(guild.id).updatesPingRoleId || null;
            targets = getSentinelOfficialUpdateChannels(guild)
                .map(target => ({ guild, ...target, pingRoleId }));
        } else {
            const target = await getConfiguredStatusUpdateTarget(guild).catch(() => null);
            targets = target ? [target] : [];
        }

        for (const target of targets) {
            const deliveryId = queueOfficialUpdateDelivery(update.id, target);
            if (!deliveryId) {
                continue;
            }

            const current = db.prepare('SELECT status FROM official_update_deliveries WHERE id = ?').get(deliveryId);
            if (current?.status === 'delivered') {
                continue;
            }

            queued += 1;
            const result = await attemptOfficialUpdateDelivery(deliveryId);
            if (result.ok) {
                delivered += 1;
            }
        }
    }

    return { queued, delivered };
}

async function getConfiguredStatusUpdateTarget(guild) {
    const config = getGuildConfig(guild.id);

    if (!config.updatesChannelId || !config.statusUpdatesEnabled) {
        return null;
    }

    await guild.channels.fetch().catch(() => null);
    const channel = guild.channels.cache.get(config.updatesChannelId);

    if (!channel || !channel.isTextBased?.()) {
        return null;
    }

    return {
        guild,
        channel,
        language: config.language,
        pingRoleId: config.updatesPingRoleId || null
    };
}

async function sendOfficialUpdateTest(guild, requester = client.user) {
    const config = getGuildConfig(guild.id);

    if (!config.updatesChannelId) {
        throw new Error('Choisis d’abord un salon des nouveautés Sentinel.');
    }

    const channel = guild.channels.cache.get(config.updatesChannelId)
        || await guild.channels.fetch(config.updatesChannelId).catch(() => null);
    const language = config.language === 'en' ? 'en' : 'fr';

    if (!channel?.isTextBased?.()) {
        throw new Error('Le salon des nouveautés est introuvable ou non textuel.');
    }

    const channelError = getCustomEmbedChannelError(guild, channel, null, language);
    if (channelError) {
        throw new Error(channelError);
    }

    await channel.send(getOfficialStatusUpdatePayload({
        title: language === 'en' ? 'Sentinel | Update channel ready' : 'Sentinel | Salon des nouveautés prêt',
        body: language === 'en'
            ? 'The channel is configured correctly. Future official Sentinel announcements will appear here.'
            : 'Le salon est correctement configuré. Les prochaines annonces officielles Sentinel apparaîtront ici.',
        requester,
        language
    }));

    return channel;
}

async function publishOfficialStatusUpdate({
    titleFr,
    bodyFr,
    titleEn = '',
    bodyEn = '',
    requester = client.user,
    includeSubscribers = false
}) {
    const update = createOfficialUpdateRecord({
        titleFr,
        bodyFr,
        titleEn,
        bodyEn,
        source: 'mise à jour officielle',
        requester
    });
    const referenceGuild = client.guilds.cache.get(SENTINEL_REFERENCE_GUILD_ID)
        || await client.guilds.fetch(SENTINEL_REFERENCE_GUILD_ID).catch(() => null);
    const referenceTargets = [];
    const subscriberTargets = [];
    const usedChannelIds = new Set();

    if (referenceGuild) {
        await referenceGuild.channels.fetch().catch(() => null);

        for (const target of getSentinelOfficialUpdateChannels(referenceGuild)) {
            referenceTargets.push({
                guild: referenceGuild,
                ...target
            });
        }
    }

    if (includeSubscribers) {
        for (const guild of client.guilds.cache.values()) {
            if (guild.id === SENTINEL_REFERENCE_GUILD_ID) {
                continue;
            }

            const target = await getConfiguredStatusUpdateTarget(guild).catch(() => null);

            if (target) {
                subscriberTargets.push(target);
            }
        }
    }

    const postToTarget = async (target, posted) => {
        if (!target?.channel || usedChannelIds.has(target.channel.id)) {
            return;
        }

        const deliveryId = queueOfficialUpdateDelivery(update.id, target);
        const result = deliveryId ? await attemptOfficialUpdateDelivery(deliveryId) : { ok: false };

        if (result.ok) {
            usedChannelIds.add(target.channel.id);
            posted.push({
                guildId: target.guild.id,
                channelId: target.channel.id,
                messageId: result.messageId
            });
        }
    };

    const referencePosted = [];
    const subscriberPosted = [];

    for (const target of referenceTargets) {
        await postToTarget(target, referencePosted);
    }

    for (const target of subscriberTargets) {
        await postToTarget(target, subscriberPosted);
    }

    return {
        referenceCount: referencePosted.length,
        subscriberCount: subscriberPosted.length,
        totalCount: referencePosted.length + subscriberPosted.length,
        referencePosted,
        subscriberPosted
    };
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
        ? `\n\n${classement.length - displayedClassement.length} autre(s) agent(s) consigné(s).`
        : '';

    return createSentinelEmbed({
        color: SENTINEL_COLORS.advanced,
        title: 'Sentinel | Registre hebdomadaire',
        description: `${lines.join('\n')}${suffix}`,
        requester
    })
        .addFields(
            {
                name: 'Agents consignés',
                value: `**${classement.length}**`,
                inline: true
            },
            {
                name: 'Temps du cycle',
                value: `**${formatDuration(totalWeekTime)}**`,
                inline: true
            },
            {
                name: 'Premier cycle',
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
            'Merci d’avoir ouvert l’accès Sentinel. Le noyau est prêt, il reste juste à configurer ton poste.',
            '',
            '`1.` Choisis la langue du serveur avec les boutons ci-dessous.',
            '`2.` Configure le grade de service avec `/config-role role:@role`.',
            '`3.` Configure le salon de registre avec `/config-logs salon_id:ID`.',
            '`4.` Ajoute les grades autorisés avec `/config-permissions action:ajouter role:@role`.',
            '`5.` Choisis obligatoirement le salon des nouveautés avec `/config-statut action:Définir le salon des nouveautés salon:#salon`.',
            '`6.` Publie le Bureau de service dans le bon salon avec `!service-panel`.',
            '`7.` Si tu veux les dossiers privés, publie le bureau avec `/dossier-panel`.',
            '',
            'Besoin d’un guide plus simple ? Utilise `/aide` ou ouvre la console.'
        ].join('\n'),
        requester,
        thumbnail: guild.iconURL(),
        language: 'fr'
    }).addFields(
        {
            name: 'À vérifier',
            value: [
                'Le grade Sentinel doit être au-dessus du grade de service.',
                'Sentinel doit pouvoir voir/écrire dans les salons utiles et créer des salons pour les dossiers.',
                'La console peut aussi guider toute la configuration.'
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
                .setLabel(language === 'en' ? 'Open dashboard' : 'Ouvrir la console')
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
                    '`/status-channel` lets you separate the optional technical status panel from the required official updates channel.',
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
                    '`/my-hours`, `/history`, `/on-duty`, `/top-service` show service tracking.',
                    'Text aliases: `!my-hours`, `!history`, `!on-duty`, `!top-service`.'
                ].join('\n'),
                inline: false
            },
            {
                name: 'Moderation',
                value: [
                    'Moderation: `/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`.',
                    '`/ban` can use a Discord ID when the user is no longer in the server.',
                    '`/mod-cases` shows the latest moderation cases.',
                    '`/embed create` sends an announcement as Sentinel. Creation and edits are unlimited.',
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
                    '`/reset-hours-all` resets every service record after confirmation.',
                    '`/embed create` and `/embed edit` are available without an active-embed quota.',
                    '',
                    '**Complete moderation**',
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
        '**4. Salon des nouveautés obligatoire**',
        '`/config-statut action:Définir le salon des nouveautés salon:#salon` active les annonces officielles Sentinel dans un salon dédié.',
        'Le panneau d’état technique reste optionnel et se configure séparément avec `action:Définir le salon de statut`.',
        '',
        '**5. Verification**',
        '`/config-voir` affiche le rôle, les salons configurés et les rôles autorisés.'
    ];
    const panelSteps = [
        '**Publier le bureau**',
        'Dans le salon ou les membres doivent pointer, envoie `!service-panel`.',
        '',
        '**Utiliser le bureau**',
        '`Prendre poste` ouvre le service, `Fin de poste` le clôture. Sentinel consigne la durée et met le registre à jour.'
    ];
    const memberUsage = [
        '**Ouvrir son poste**',
        'Clique sur `Prendre poste`. Sentinel ajoute le grade de service.',
        '',
        '**Clôturer son poste**',
        'Clique sur `Fin de poste`. Sentinel retire le grade et consigne le temps.',
        '',
        '**Consulter ses infos**',
        '`/mes-heures`, `/historique-service`, `/en-service`, `/heures`, `/top-service`, `/top-semaine` et `/resume-service` donnent accès au registre complet.'
    ];
    const commandSummary = [
        '`/aide` - ce guide',
        '`/mes-heures` - tes heures',
        '`/historique-service [membre] [limite]` - historique et consultation membre',
        '`/en-service` - agents actuellement en service',
        '`/top-service`, `/top-semaine`, `/resume-service` - classements et resume complet',
        '`/reset-heures membre` ou `utilisateur_id` - remettre les heures d une personne a zero, meme si elle a quitte le serveur',
        '`/config-paie`, `/paie-semaine`, `/paie-historique`, `/paie-archive` - régler, consulter et archiver la paie RP hebdomadaire',
        '`/config-role`, `/config-autorole`, `/config-logs`, `/config-statut`, `/config-permissions`, `/config-voir` - configuration',
        '`/embed creer` - publier une annonce sous l identite de Sentinel'
    ];
    const moderationUsage = [
        '`/avertir membre raison` - enregistrer un avertissement',
        '`/timeout membre duree raison` - rendre muet temporairement, exemple `10m`, `2h`, `7d`',
        '`/fin-timeout membre raison` - retirer un timeout',
        '`/expulser membre raison` - expulser un membre',
        '`/bannir utilisateur ou utilisateur_id raison` - bannir, meme si la personne n est plus sur le serveur',
        '`/purge nombre` - supprimer jusqu a 100 messages recents',
        '`/sanctions membre ou utilisateur_id` - consulter les dossiers disciplinaires',
        '`/embed creer`, `/embed modifier`, `/embed supprimer` - gerer des annonces embed Sentinel',
        'Sentinel verifie les permissions et la hierarchie des roles avant chaque sanction.'
    ];
    const completeModerationUsage = [
        '`/cas id` - afficher un dossier de moderation precis',
        '`/modifier-cas id raison` - corriger la raison d un cas',
        '`/supprimer-cas id` - supprimer un cas',
        '`/unwarn id` - retirer un avertissement par ID',
        '`/profil-mod membre ou utilisateur_id` - historique avance et profil moderation complet',
        '`/tempban duree utilisateur ou utilisateur_id` - bannir temporairement avec expiration automatique',
        '`/unban utilisateur_id` - debannir par ID et annuler un tempban actif',
        '`/lock`, `/unlock`, `/slowmode duree` - gerer rapidement un salon',
        '`/config-paie role:@role` - definir un taux horaire par role',
        '`/paie-ajustement` - ajouter une prime, une retenue ou une correction de paie',
        'Escalade active : timeout, expulsion ou bannissement après les seuils d’avertissements choisis, avec expiration, rôles exemptés et journal.'
    ];
    const availableCapacity = [
        'Toutes les commandes du bot sont ouvertes sur chaque serveur.',
        `Historique consultable jusqu a ${REFERENCE_HISTORY_LIMIT} sessions par demande.`,
        `Classements affiches jusqu a ${REFERENCE_TOP_LIMIT} agents par panneau.`,
        '`/reset-heures-all`, `/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service` et `/sync-sentinel` sont disponibles.',
        'Embeds Sentinel : creation et modifications illimitees.',
        'Les seules limites restantes sont des limites techniques Discord ou de securite.'
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
            name: 'Bureau de service',
            value: panelSteps.join('\n'),
            inline: false
        },
        {
            name: 'Utilisation membre',
            value: memberUsage.join('\n'),
            inline: false
        },
        {
            name: 'Commandes disponibles',
            value: commandSummary.join('\n'),
            inline: false
        },
        {
            name: 'Moderation',
            value: moderationUsage.join('\n'),
            inline: false
        },
        {
            name: 'Capacités Sentinel',
            value: availableCapacity.join('\n'),
            inline: false
        }
    ];

    fields.push({
        name: 'Outils approfondis',
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
        name: 'Moderation complete',
        value: completeModerationUsage.join('\n'),
        inline: false
    });

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
                        name: 'Public demonstration version',
                        value: 'Sentinel is currently available at no cost for testing. Some advanced features may become paid later, but a free part of Sentinel will remain available. No subscription or charge is active today, and the details will be announced before any change.'
                    },
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
                            '`/diagnostic` checks permissions and role order.',
                            '`/ping` checks whether Sentinel and its internal data respond.'
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
                            '`/status-channel` publishes the optional Sentinel status panel.',
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
                            '`Start duty` starts duty, `End duty` ends it.',
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
                description: 'In Sentinel, a dossier is a reserved request space handled by authorized personnel.',
                fields: [
                    {
                        name: 'How it works',
                        value: [
                            '`/ticket-panel` publishes the Sentinel reception desk.',
                            'Members choose a type: assistance, report, application, alliance, or request.',
                            'Sentinel asks for a subject and description, then prepares the reserved space.'
                        ].join('\n')
                    },
                    {
                        name: 'Inside a dossier',
                        value: [
                            'Teams can reply, add participants, prepare a written record, and close the dossier.',
                            '`/ticket-roles action:add role:@role` gives a role access to dossier handling.',
                            '`/ticket-claim` marks you as the dossier referent.',
                            '`/ticket-status status:...` updates the visible status if the requester made a mistake or the situation changes.',
                            '`/close-ticket` closes the current dossier.',
                            '`/ticket-add member:@member` adds a participant.',
                            '`/ticket-remove member:@member` removes a participant.',
                            '`/ticket-transcript` sends the written record to the log channel when possible.'
                        ].join('\n')
                    },
                    {
                        name: 'Capacity',
                        value: [
                            'Reception panels, open dossiers, and complete history without a plan quota.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'commands',
                label: 'Commands',
                menuDescription: 'The main Sentinel service commands.',
                emoji: '📋',
                title: 'Sentinel | Commands',
                description: 'The available actions stay visible and simple.',
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
                            '`/reset-hours member:@member` or `user_id:ID` resets one person, even if they left.',
                            '`/payroll-config` sets the global hourly RP amount.',
                            '`/weekly-payroll` shows who is paid or still to pay this week.',
                            '`/payroll-history` retrieves prior payroll archives.',
                            '`/payroll-mark paid:true member:@member` marks a line as paid or unpaid.',
                            '`/payroll-archive` archives the current week payroll.',
                            '`/autorole-config` manages the role given to new members.',
                            '`/embed create` sends an announcement as Sentinel.',
                            'Sentinel embeds can be created and edited without an active-embed quota.'
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
                        name: 'Moderation actions',
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
                label: 'Full access',
                menuDescription: 'The complete Sentinel feature set available here.',
                emoji: '⭐',
                title: 'Sentinel | Full access',
                description: 'Every Sentinel server has access to the complete command set.',
                fields: [
                        {
                            name: 'Available to everyone',
                            value: [
                                `History up to ${REFERENCE_HISTORY_LIMIT} sessions per request.`,
                                `Leaderboards up to ${REFERENCE_TOP_LIMIT} agents.`,
                                '`/reset-hours-all`, `/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-sentinel` are available.',
                                'Sentinel embeds: unlimited creation and unlimited edits.'
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
                menuDescription: 'Complete service and security commands.',
                emoji: '💎',
                title: 'Sentinel | Advanced commands',
                description: 'These tools are available on every Sentinel server to authorized staff.',
                fields: [
                    {
                        name: 'Service',
                        value: [
                            '`/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-hours-all`.',
                            '`/embed create` is unlimited here. `/embed edit` is unlimited everywhere.'
                        ].join('\n')
                    },
                    {
                        name: 'Complete moderation',
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
            label: 'Briefing',
            menuDescription: 'Le chemin court pour ouvrir le poste.',
            emoji: '🗂️',
            title: 'Sentinel | Briefing',
            description: 'Choisis une rubrique dans le registre ci-dessous. Chaque page reste courte pour une lecture rapide.',
            fields: [
                {
                    name: 'Version de démonstration publique',
                    value: 'Sentinel est actuellement accessible sans paiement pour être testé en conditions réelles. Certaines options avancées pourront devenir payantes plus tard, mais une partie gratuite de Sentinel restera disponible. Aucun abonnement ni prélèvement n’est actif aujourd’hui, et les détails seront annoncés avant tout changement.'
                },
                {
                    name: 'Ordre de mise en place',
                    value: [
                        '`1.` Ouvre l’accès Sentinel avec le lien officiel.',
                        '`2.` Choisis la langue du poste avec `/config-langue`.',
                        '`3.` Déclare le grade de service et le salon de registre.',
                        '`4.` Installe le Bureau de service avec `!service-panel`.'
                    ].join('\n')
                },
                {
                    name: 'Contrôles utiles',
                    value: [
                        '`/config-voir` affiche les réglages du poste.',
                        '`/dashboard` ouvre la console de gestion.',
                        '`/support` affiche les accès officiels.',
                        '`/diagnostic` vérifie les accès et l’ordre des grades.',
                        '`/ping` vérifie que Sentinel et ses registres répondent.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'install',
            label: 'Arrivée',
            menuDescription: 'Installer Sentinel et préparer les grades.',
            emoji: '🧭',
            title: 'Sentinel | Mise en place',
            description: 'Avant d’ouvrir le poste, vérifie que Sentinel est bien présent et placé correctement.',
            fields: [
                {
                    name: 'Présence Sentinel',
                    value: [
                        'Dans les intégrations du serveur, Sentinel doit avoir le badge `Bot`.',
                        'Si tu vois seulement `Commandes`, retire l’accès et réinvite Sentinel avec le lien officiel.'
                    ].join('\n')
                },
                {
                    name: 'Ordre des grades',
                    value: [
                        'Crée un grade de service, par exemple `En service`, `Patrouille` ou `Agent actif`.',
                        'Place le grade Sentinel au-dessus de ce grade, sinon il ne pourra pas l’ajouter ou le retirer.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'config',
            label: 'Régie',
            menuDescription: 'Langue, grades, registre et accès de régie.',
            emoji: '⚙️',
            title: 'Sentinel | Poste serveur',
            description: 'Ces commandes préparent le poste Sentinel de ce serveur uniquement.',
            fields: [
                {
                    name: 'Réglages du poste',
                    value: [
                        '`/config-langue langue:Français` choisit la langue du serveur.',
                        '`/config-role role:@role` choisit le grade donné pendant le service.',
                        '`/config-autorole action:definir role:@role` remet un grade aux nouveaux arrivants.',
                        '`/config-logs salon_id:ID` choisit le salon de registre.',
                        '`/config-statut` sépare le centre de contrôle optionnel du salon obligatoire des bulletins officiels.',
                        '`/config-voir` affiche ce qui est configuré.'
                    ].join('\n')
                },
                {
                    name: 'Accès de régie',
                    value: [
                        'Au départ, propriétaire/admin/Gérer le serveur/Gérer les rôles peuvent ouvrir la régie.',
                        'Ensuite, utilise `/config-permissions action:ajouter role:@role` pour déclarer les grades autorisés.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'service',
            label: 'Service',
            menuDescription: 'Installer et utiliser le Bureau de service.',
            emoji: '🟢',
            title: 'Sentinel | Bureau de service',
            description: 'Le bureau se publie dans le salon de pointage choisi.',
            fields: [
                {
                    name: 'Installer le bureau',
                    value: [
                        'Va dans le salon où les agents doivent pointer.',
                        'Envoie `!service-panel`.',
                        'Sentinel y déposera le Bureau de service.'
                    ].join('\n')
                },
                {
                    name: 'Pointage des agents',
                    value: [
                        '`Prendre poste` ouvre la fiche de présence.',
                        '`Fin de poste` ferme le service et consigne la durée.',
                        '`Ma fiche` affiche la fiche personnelle.',
                        '`Déploiement` affiche les agents actifs.'
                    ].join('\n')
                }
            ]
        },
            {
                id: 'dashboard',
                label: 'Console',
                menuDescription: 'Ouvrir la console et gérer un serveur.',
            emoji: '🖥️',
            title: 'Sentinel | Console',
            description: 'La console permet aux responsables autorisés de gérer Sentinel depuis le site.',
            fields: [
                {
                    name: 'Ouvrir la console',
                    value: [
                        'Utilise `/dashboard`, puis clique sur le bouton.',
                        'Tu peux aussi ouvrir le site public et choisir la console.'
                    ].join('\n')
                },
                {
                    name: 'Ce que la console donne',
                    value: [
                        'Choisir un serveur lié à ton compte.',
                        'Préparer la langue, le grade de service, le grade d’arrivée, le registre, le Bureau de service, les annonces, la sécurité et l’historique.',
                        'Si un serveur demande une autorisation, ouvre d’abord l’accès Sentinel avec le lien officiel.'
                    ].join('\n')
                    }
                ]
            },
            {
                id: 'dossiers',
                label: 'Dossiers',
                menuDescription: 'Accueil, demandes, signalements et suivi réservé.',
                emoji: '📁',
                title: 'Sentinel | Dossiers',
                description: 'Le Bureau d’accueil reçoit les demandes et les confie aux équipes autorisées.',
                fields: [
                    {
                        name: 'Accueil Sentinel',
                        value: [
                            '`/dossier-panel` publie le bureau d’accueil Sentinel.',
                            'Les membres choisissent un type : assistance, signalement, candidature, alliance ou requête.',
                            'Sentinel demande un sujet et une description, puis prépare l’espace réservé.'
                        ].join('\n')
                    },
                    {
                        name: 'Suivi du dossier',
                        value: [
                            'L’équipe peut répondre, ajouter des intervenants, préparer un compte rendu et clôturer le dossier.',
                            '`/dossier-roles action:ajouter role:@rôle` donne accès à la gestion des dossiers.',
                            '`/dossier-prendre` te marque comme référent du dossier.',
                            '`/dossier-statut statut:...` corrige le statut visible si le demandeur s’est trompé ou si la situation change.',
                            '`/dossier-fermer` demande le motif et la résolution, archive tout le dossier puis le scelle.',
                            '`/dossier-ajouter membre:@membre` ajoute un intervenant.',
                            '`/dossier-retirer membre:@membre` retire un intervenant.',
                            '`/dossier-compte-rendu` envoie le compte rendu dans le salon de logs quand c’est possible.'
                        ].join('\n')
                    },
                    {
                        name: 'Capacité',
                        value: [
                            'Panneaux, dossiers ouverts et historique complet sans quota de formule.'
                        ].join('\n')
                    }
                ]
            },
            {
                id: 'commands',
                label: 'Répertoire',
            menuDescription: 'Les commandes ouvertes à tous les serveurs.',
            emoji: '📋',
            title: 'Sentinel | Répertoire',
            description: 'Le répertoire garde les actions essentielles, sans noyer les équipes.',
            fields: [
                {
                    name: 'Agents',
                    value: [
                        '`/mes-heures` affiche ta fiche agent.',
                        '`/historique-service` affiche tes derniers services.',
                        '`/en-service` affiche le déploiement actif.',
                        '`/top-service` affiche le registre général du serveur.'
                    ].join('\n')
                },
                {
                    name: 'Régie',
                    value: [
                        '`/dashboard` donne le lien de la console.',
                        '`/support` donne les accès officiels.',
                        '`/reset-heures membre:@membre` ou `utilisateur_id:ID` remet une personne à zéro, même si elle a quitté.',
                        '`/config-paie` règle le montant horaire RP.',
                        '`/paie-semaine` affiche qui est payé ou encore à payer cette semaine.',
                        '`/paie-historique` retrouve les anciennes archives de paie.',
                        '`/paie-marquer paye:true membre:@membre` marque une ligne comme payée ou non payée.',
                        '`/config-autorole` gère le rôle donné automatiquement aux nouveaux membres.',
                        '`/embed creer` publie une annonce sous l’identité de Sentinel.',
                        'Les créations et modifications d’embeds Sentinel sont disponibles sans quota de formule.'
                    ].join('\n')
                }
            ]
        },
        {
            id: 'moderation',
            label: 'Sécurité',
            menuDescription: 'Avertissement, silence, expulsion, bannissement et purge.',
            emoji: '🛡️',
            title: 'Sentinel | Centre de sécurité',
            description: 'Sentinel vérifie les accès et l’ordre des grades avant chaque mesure.',
            fields: [
                {
                    name: 'Mesures disponibles',
                    value: [
                        '`/avertir`, `/timeout`, `/fin-timeout`, `/expulser`, `/bannir`, `/purge`.',
                        '`/config-autorole` peut donner un grade automatiquement quand un membre rejoint.',
                        '`/bannir` peut utiliser un ID si la personne n’est plus sur le serveur.',
                        '`/sanctions` affiche une vue simple des derniers dossiers disciplinaires.'
                    ].join('\n')
                },
                {
                    name: 'À contrôler',
                    value: 'Si une mesure est refusée, vérifie la position du grade Sentinel et les accès du salon.'
                }
            ]
        },
        {
            id: 'limits',
            label: 'Accès complet',
            menuDescription: 'Toutes les fonctions Sentinel disponibles ici.',
            emoji: '⭐',
            title: 'Sentinel | Accès complet',
            description: 'Chaque serveur Sentinel dispose de l’ensemble des fonctions.',
            fields: [
                    {
                        name: 'Disponible pour tous',
                        value: [
                            `Historique jusqu’à ${REFERENCE_HISTORY_LIMIT} services par demande.`,
                            `Classements jusqu’à ${REFERENCE_TOP_LIMIT} agents.`,
                            '`/reset-heures-all`, `/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service`, `/sync-sentinel` sont disponibles.',
                            'Embeds Sentinel : création illimitée et modifications illimitées.'
                        ].join('\n')
                    }
                ]
        },
        {
            id: 'troubleshooting',
            label: 'Contrôle',
            menuDescription: 'Les vérifications rapides quand ça bloque.',
            emoji: '🧰',
            title: 'Sentinel | Contrôle rapide',
            description: 'La plupart des blocages viennent de l’accès initial, de l’ordre des grades ou des accès salon.',
            fields: [
                {
                    name: 'Points à vérifier',
                    value: [
                        'Sentinel ne donne pas le grade ? Remonte son grade au-dessus du grade de service.',
                        'Le registre ne reçoit rien ? Vérifie que Sentinel peut voir et écrire dans le salon.',
                        'Commande refusée ? Vérifie `/config-permissions action:voir`.',
                        'Sentinel n’apparaît pas dans les membres ? Rouvre l’accès avec le lien officiel.'
                    ].join('\n')
                }
            ]
        }
    ];

    if (isReferenceServer) {
        pages.push({
            id: 'advanced',
            label: 'Outils avancés',
            menuDescription: 'Commandes complètes de service et de sécurité.',
            emoji: '🧰',
            title: 'Sentinel | Outils avancés',
            description: 'Ces outils sont disponibles sur chaque serveur Sentinel pour les responsables autorisés.',
            fields: [
                {
                    name: 'Registre de service',
                    value: [
                        '`/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-heures-all`.',
                        '`/embed creer` est illimité ici. `/embed modifier` reste illimité partout.'
                    ].join('\n')
                },
                {
                    name: 'Sécurité complète',
                    value: [
                        '`/cas`, `/modifier-cas`, `/supprimer-cas`, `/unwarn`, `/profil-mod`.',
                        '`/tempban`, `/unban`, `/lock`, `/unlock`, `/slowmode`.',
                        'Les règles automatiques avancées peuvent être pilotées depuis la console.'
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
                .setCustomId('start_service')
                .setLabel(t(language, 'startServiceLabel'))
                .setStyle(ButtonStyle.Success)
                .setEmoji('🟢'),
            new ButtonBuilder()
                .setCustomId('end_service')
                .setLabel(t(language, 'endServiceLabel'))
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔴'),
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

function buildServicePanelEmbed(language = 'fr') {
    const brandIcon = client.user?.displayAvatarURL();
    const embed = new EmbedBuilder()
        .setColor(SENTINEL_COLORS.service)
        .setTitle(t(language, 'servicePanelTitle'))
        .setDescription(t(language, 'servicePanelDescription'))
        .addFields(
            {
                name: t(language, 'servicePanelStartName'),
                value: t(language, 'servicePanelStartValue'),
                inline: true
            },
            {
                name: t(language, 'servicePanelEndName'),
                value: t(language, 'servicePanelEndValue'),
                inline: true
            },
            {
                name: t(language, 'servicePanelRegistryName'),
                value: t(language, 'servicePanelRegistryValue'),
                inline: false
            }
        )
        .setFooter({ text: t(language, 'servicePanelFooter') })
        .setTimestamp();

    if (brandIcon) {
        embed.setAuthor({
            name: t(language, 'brand'),
            iconURL: brandIcon
        });
        embed.setThumbnail(brandIcon);
    }

    return embed;
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
        if (['toggle_service', 'start_service', 'end_service'].includes(interaction.customId)) {
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

    if (commandName === 'config-statut') {
        const action = interaction.options.getString('action');

        if (action === 'desactiver' || action === 'disable') {
            return 'disable-status-channel';
        }

        if (action === 'maj-on' || action === 'updates-on') {
            return 'enable-status-updates';
        }

        if (action === 'maj-off' || action === 'updates-off') {
            return 'disable-status-updates';
        }

        if (action === 'maj-salon' || action === 'updates-channel') {
            return 'set-updates-channel';
        }

        if (action === 'maj-test' || action === 'updates-test') {
            return 'test-status-updates';
        }

        if (action === 'maj-role' || action === 'updates-role') {
            return 'set-updates-role';
        }

        if (action === 'maj-role-off' || action === 'updates-role-off') {
            return 'clear-updates-role';
        }

        return action === 'voir' || action === 'view' ? null : 'set-status-channel';
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

    if (commandName === 'paie-historique') {
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
        'maj-sentinel': 'official-status-update',
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
        'dossier-reouvrir': 'dossier-reopen',
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

        if (
            action === 'set-language'
            || action === 'reset-guild'
            || action === 'disable-status-channel'
            || action === 'enable-status-updates'
            || action === 'disable-status-updates'
        ) {
            return { targetType: 'guild', targetId: interaction.guild?.id || null };
        }
    }

    const roleActions = new Set(['set-service-role', 'add-command-role', 'remove-command-role', 'configure-dossier-roles']);
    const channelActions = new Set(['set-log-channel', 'set-status-channel', 'set-updates-channel', 'test-status-updates', 'publish-service-panel', 'publish-dossier-panel', 'dossier-claim', 'dossier-status', 'dossier-close', 'dossier-transcript', 'purge', 'lock', 'unlock', 'slowmode']);
    const messageActions = new Set(['custom-embed-edit', 'custom-embed-delete']);
    const caseActions = new Set(['edit-case', 'delete-case', 'unwarn']);
    const guildActions = new Set(['disable-status-channel', 'enable-status-updates', 'disable-status-updates', 'official-status-update']);

    if (guildActions.has(action)) {
        return { targetType: 'guild', targetId: interaction.guild?.id || null };
    }

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

const SENTINEL_STATUS_CHANNELS = [
    { name: '📌｜statut-sentinel', language: 'fr' },
    { name: '📌｜sentinel-status', language: 'en' }
];
const SENTINEL_OFFICIAL_UPDATE_CHANNELS = [
    { name: '📡｜annonces', language: 'fr' },
    { name: '📡｜announcements', language: 'en' }
];
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

function buildTicketOverwrites(guild, member, dossierType = 'support') {
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

    if (client.user?.id && client.user.id !== member.id) {
        overwrites.push({
            id: client.user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ]
        });
    }

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

    const typeRoleIds = getDossierTypeRoleIds(guild.id, dossierType);

    if (typeRoleIds.length > 0) {
        for (const roleId of typeRoleIds) {
            pushAllowedRole(guild.roles.cache.get(roleId));
        }
    } else {
        for (const roleId of getCommandRoleIds(guild.id)) {
            pushAllowedRole(guild.roles.cache.get(roleId));
        }

        for (const roleId of getDossierRoleIds(guild.id)) {
            pushAllowedRole(guild.roles.cache.get(roleId));
        }

        for (const roleName of SENTINEL_STAFF_ROLES) {
            pushAllowedRole(findRoleByName(guild, roleName));
        }
    }

    return overwrites;
}

async function syncDossierTypePermissions(guild, dossierType, extraRoleIds = []) {
    const type = normalizeDossierType(dossierType);
    const configuredTypeRoleIds = getDossierTypeRoleIds(guild.id, type);
    const fallbackRoleIds = new Set([
        ...getCommandRoleIds(guild.id),
        ...getDossierRoleIds(guild.id),
        ...SENTINEL_STAFF_ROLES.map(name => findRoleByName(guild, name)?.id).filter(Boolean)
    ]);
    const managedRoleIds = new Set([
        ...fallbackRoleIds,
        ...getAllDossierTypeRoles(guild.id).map(item => item.roleId),
        ...extraRoleIds
    ]);
    const allowedRoleIds = new Set(configuredTypeRoleIds.length > 0
        ? configuredTypeRoleIds
        : fallbackRoleIds);
    const dossiers = db.prepare(`
        SELECT channel_id FROM sentinel_dossiers
        WHERE guild_id = ? AND type = ? AND status != 'closed'
    `).all(guild.id, type);
    let updated = 0;

    for (const dossier of dossiers) {
        const channel = await guild.channels.fetch(dossier.channel_id).catch(() => null);

        if (!channel?.isTextBased?.()) {
            continue;
        }

        for (const roleId of managedRoleIds) {
            if (!guild.roles.cache.has(roleId)) {
                continue;
            }

            if (allowedRoleIds.has(roleId)) {
                await channel.permissionOverwrites.edit(roleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    ManageMessages: true,
                    AttachFiles: true,
                    EmbedLinks: true
                }, { reason: `Responsables dossiers Sentinel ${type}` });
            } else {
                await channel.permissionOverwrites.delete(roleId, `Cloisonnement dossiers Sentinel ${type}`).catch(() => {});
            }
        }

        updated += 1;
    }

    return updated;
}

function buildDossierPanelEmbed(guild, requester, language = 'fr') {
    return createSentinelEmbed({
        color: SENTINEL_COLORS.primary,
        title: t(language, 'dossierPanelTitle'),
        description: t(language, 'dossierPanelDescription'),
        requester,
        thumbnail: guild.iconURL(),
        language
    })
        .addFields(
            {
                name: t(language, 'dossierPanelAccessName'),
                value: t(language, 'dossierPanelAccessValue'),
                inline: false
            },
            {
                name: t(language, 'dossierPanelFollowName'),
                value: t(language, 'dossierPanelFollowValue'),
                inline: false
            },
            {
                name: t(language, 'dossierPanelBeforeName'),
                value: t(language, 'dossierPanelBeforeValue'),
                inline: false
            }
        )
        .setFooter({ text: t(language, 'dossierPanelFooter') });
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

function buildDossierPanelPayload(guild, requester, language = 'fr') {
    return {
        embeds: [buildDossierPanelEmbed(guild, requester, language)],
        components: buildDossierPanelComponents(language)
    };
}

function hasDossierPanelButtons(message) {
    return Boolean(message?.components?.some(row => (
        row.components?.some(component => String(component.customId || '').startsWith('sentinel_dossier:'))
    )));
}

function hasDossierPanelEmbed(message) {
    return Boolean(message?.embeds?.some(embed => (
        embed?.title === 'Sentinel | Bureau d’accueil'
        || embed?.title === 'Sentinel | Reception desk'
    )));
}

function isDossierPanelMessage(message) {
    return Boolean(
        message?.author?.id === client.user?.id
        && (
            hasDossierPanelButtons(message)
            || hasDossierPanelEmbed(message)
        )
    );
}

async function publishOrUpdateDossierPanel(channel, requester, language = 'fr', member = null) {
    const payload = buildDossierPanelPayload(channel.guild, requester, language);
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const existingPanel = messages?.find(message => isDossierPanelMessage(message));

    if (existingPanel) {
        const editedPanel = await existingPanel.edit(payload).catch(() => null);

        if (editedPanel) {
            recordDossierPanel(channel.guild.id, channel.id, editedPanel.id, requester?.id || null);
            return editedPanel;
        }
    }

    await reconcileDossierPanels(channel.guild);
    assertDossierPanelQuota(channel.guild.id, language, member);

    const message = await channel.send(payload);
    recordDossierPanel(channel.guild.id, channel.id, message.id, requester?.id || null);
    return message;
}

function buildServicePanelPayload(language = 'fr') {
    return {
        content: '',
        embeds: [buildServicePanelEmbed(language)],
        components: buildServicePanelComponents(language)
    };
}

async function publishOrUpdateServicePanel(channel, language = 'fr') {
    const payload = buildServicePanelPayload(language);
    const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const existingPanel = messages?.find(message => isServicePanelMessage(message));

    if (existingPanel) {
        const editedPanel = await existingPanel.edit(payload).catch(() => null);

        if (editedPanel) {
            return editedPanel;
        }
    }

    return channel.send(payload);
}

function buildSentinelStatusPayload(guild, language = 'fr') {
    return {
        content: '',
        embeds: [buildSentinelStatusEmbed(guild, client.user, language)],
        components: []
    };
}

function hasSentinelStatusEmbed(message) {
    return Boolean(message?.embeds?.some(embed => (
        embed?.title === 'Sentinel | Statut'
        || embed?.title === 'Sentinel | Status'
        || embed?.title === 'Sentinel | État opérationnel'
        || embed?.title === 'Sentinel | Operations'
    )));
}

function hasServicePanelButtons(message) {
    const serviceButtonIds = new Set([
        'start_service',
        'end_service',
        'show_my_hours',
        'show_active_services'
    ]);

    return Boolean(message?.components?.some(row => (
        row.components?.some(component => serviceButtonIds.has(component.customId))
    )));
}

function isServicePanelMessage(message) {
    return Boolean(
        message?.author?.id === client.user?.id
        && (
            hasServicePanelButtons(message)
            || hasServicePanelEmbed(message)
            || /^\*\*Sentinel \| (Panneau de service|Bureau de service|Duty desk)\*\*/.test(String(message.content || ''))
        )
    );
}

function hasServicePanelEmbed(message) {
    return Boolean(message?.embeds?.some(embed => (
        embed?.title === 'Sentinel | Bureau de service'
        || embed?.title === 'Sentinel | Duty desk'
    )));
}

function isMixedServiceStatusPanelMessage(message) {
    return isServicePanelMessage(message) && hasSentinelStatusEmbed(message);
}

function isSentinelStatusPanelMessage(message) {
    return Boolean(
        message?.author?.id === client.user?.id
        && hasSentinelStatusEmbed(message)
        && !isServicePanelMessage(message)
    );
}

async function publishDossierPanel(channel, requester, language = 'fr', member = null) {
    return publishOrUpdateDossierPanel(channel, requester, language, member);
}

function buildDossierOpenModal(dossierType, language = 'fr', questions = []) {
    const meta = getDossierTypeMeta(dossierType, language);
    const modal = new ModalBuilder()
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

    for (const [index, question] of questions.slice(0, 3).entries()) {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`question_${index}`)
                    .setLabel(String(question.label || `Question ${index + 1}`).slice(0, 45))
                    .setStyle(question.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
                    .setMaxLength(clampNumber(question.maxLength || 500, 20, 1000))
                    .setRequired(question.required !== false)
            )
        );
    }

    return modal;
}

function buildDossierCloseModal(channelId, language = 'fr') {
    return new ModalBuilder()
        .setCustomId(`sentinel_dossier_close:${channelId}`)
        .setTitle(language === 'en' ? 'Close the dossier' : 'Clôturer le dossier')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('close_reason')
                    .setLabel(language === 'en' ? 'Closing reason' : 'Motif de clôture')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(500)
                    .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('resolution_summary')
                    .setLabel(language === 'en' ? 'Resolution summary' : 'Résumé de la résolution')
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
                .setLabel(language === 'en' ? 'Written record' : 'Compte rendu')
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

function memberCanManageDossier(member, dossierType = null) {
    if (!member) {
        return false;
    }

    if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)
        || member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return true;
    }

    const typeRoleIds = dossierType
        ? getDossierTypeRoleIds(member.guild.id, dossierType)
        : [];

    if (typeRoleIds.length > 0) {
        return typeRoleIds.some(roleId => member.roles.cache.has(roleId));
    }

    return hasDossierRoleAccess(member) || hasCommandRoleAccess(member);
}

function getDossierChannelFromInteraction(interaction) {
    if (!interaction.channel || !isDossierChannel(interaction.channel)) {
        return null;
    }

    return interaction.channel;
}

async function fetchAllDossierMessages(channel) {
    const collected = [];
    let before;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });

        if (batch.size === 0) {
            break;
        }

        collected.push(...batch.values());
        before = batch.last()?.id;

        if (batch.size < 100 || !before) {
            break;
        }
    }

    return collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function safeArchiveFileName(value, fallback = 'piece-jointe') {
    return String(value || fallback)
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64) || fallback;
}

async function downloadDossierAttachment(attachment, currentTotalBytes) {
    const declaredSize = Number(attachment.size || 0);

    if (declaredSize > DOSSIER_ARCHIVE_MAX_ATTACHMENT_BYTES) {
        throw new Error(`La pièce jointe ${attachment.name || attachment.id} dépasse la limite d'archivage.`);
    }

    if (currentTotalBytes + declaredSize > DOSSIER_ARCHIVE_MAX_TOTAL_BYTES) {
        throw new Error('Les pièces jointes du dossier dépassent la capacité d’archivage autorisée.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOSSIER_ARCHIVE_FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(attachment.url, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(`Téléchargement refusé (${response.status}).`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length > DOSSIER_ARCHIVE_MAX_ATTACHMENT_BYTES
            || currentTotalBytes + buffer.length > DOSSIER_ARCHIVE_MAX_TOTAL_BYTES) {
            throw new Error('La pièce jointe dépasse la capacité d’archivage autorisée.');
        }

        return {
            bytes: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
            buffer
        };
    } finally {
        clearTimeout(timeout);
    }
}

function writeTarText(buffer, offset, length, value) {
    Buffer.from(String(value || ''), 'utf8').copy(buffer, offset, 0, length);
}

function writeTarOctal(buffer, offset, length, value) {
    const octal = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, '0');
    writeTarText(buffer, offset, length, `${octal}\0`);
}

function createTarBuffer(files) {
    const parts = [];

    for (const file of files) {
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
        const header = Buffer.alloc(512, 0);
        writeTarText(header, 0, 100, file.name);
        writeTarOctal(header, 100, 8, 0o644);
        writeTarOctal(header, 108, 8, 0);
        writeTarOctal(header, 116, 8, 0);
        writeTarOctal(header, 124, 12, data.length);
        writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
        header.fill(0x20, 148, 156);
        header[156] = '0'.charCodeAt(0);
        writeTarText(header, 257, 6, 'ustar');
        writeTarText(header, 263, 2, '00');
        const checksum = header.reduce((sum, byte) => sum + byte, 0);
        const checksumText = checksum.toString(8).padStart(6, '0');
        writeTarText(header, 148, 8, `${checksumText}\0 `);
        parts.push(header, data);

        const padding = (512 - (data.length % 512)) % 512;
        if (padding) {
            parts.push(Buffer.alloc(padding, 0));
        }
    }

    parts.push(Buffer.alloc(1024, 0));
    return Buffer.concat(parts);
}

function readTarEntry(tarBuffer, requestedName) {
    let offset = 0;

    while (offset + 512 <= tarBuffer.length) {
        const header = tarBuffer.subarray(offset, offset + 512);
        const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');

        if (!name) {
            break;
        }

        const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
        const size = Number.parseInt(sizeText || '0', 8);
        const dataStart = offset + 512;

        if (name === requestedName) {
            return tarBuffer.subarray(dataStart, dataStart + size);
        }

        offset = dataStart + Math.ceil(size / 512) * 512;
    }

    return null;
}

function dossierMessageToArchive(message) {
    return {
        id: message.id,
        createdAt: new Date(message.createdTimestamp).toISOString(),
        editedAt: message.editedTimestamp ? new Date(message.editedTimestamp).toISOString() : null,
        author: {
            id: message.author?.id || null,
            username: message.author?.username || null,
            tag: message.author?.tag || null,
            bot: Boolean(message.author?.bot)
        },
        content: message.content || '',
        reference: message.reference ? {
            messageId: message.reference.messageId || null,
            channelId: message.reference.channelId || null,
            guildId: message.reference.guildId || null
        } : null,
        mentions: {
            users: Array.from(message.mentions.users.keys()),
            roles: Array.from(message.mentions.roles.keys()),
            channels: Array.from(message.mentions.channels.keys())
        },
        embeds: message.embeds.map(embed => embed.toJSON()),
        components: message.components.map(component => component.toJSON()),
        stickers: Array.from(message.stickers.values()).map(sticker => ({
            id: sticker.id,
            name: sticker.name,
            description: sticker.description || null,
            format: sticker.format
        })),
        attachments: Array.from(message.attachments.values()).map(attachment => ({
            id: attachment.id,
            name: attachment.name,
            description: attachment.description || null,
            contentType: attachment.contentType || null,
            size: attachment.size,
            width: attachment.width || null,
            height: attachment.height || null,
            url: attachment.url,
            proxyUrl: attachment.proxyURL || null
        })),
        reactions: Array.from(message.reactions.cache.values()).map(reaction => ({
            emoji: reaction.emoji?.toString() || null,
            count: reaction.count
        }))
    };
}

function buildDossierTranscriptFromMessages(channel, dossier, messages, language = 'fr') {
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
            `Closing reason: ${dossier?.closeReason || 'none'}`,
            `Resolution: ${dossier?.resolutionSummary || 'none'}`,
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
            `Motif de clôture : ${dossier?.closeReason || 'aucun'}`,
            `Résolution : ${dossier?.resolutionSummary || 'aucune'}`,
            `Durée : ${duration || 'inconnue'}`,
            `Généré : ${new Date().toISOString()}`
        ];
    const lines = messages.map(message => {
        const additions = [
            ...(message.attachments || []).map(file => `[pièce jointe: ${file.name || file.id}]`),
            ...((message.embeds || []).length ? [`[${message.embeds.length} contenu(s) intégré(s)]`] : [])
        ];
        const content = [message.content, ...additions].filter(Boolean).join(' ') || '[message sans texte]';
        return `[${message.createdAt}] ${message.author?.tag || message.author?.id || 'inconnu'}: ${content.replace(/\s+/g, ' ')}`;
    });

    return [...header, '', ...lines].join('\n');
}

async function archiveDossierChannel(channel, dossier, language = 'fr') {
    const discordMessages = await fetchAllDossierMessages(channel);
    const messages = discordMessages.map(dossierMessageToArchive);
    const archivedAt = new Date().toISOString();
    const archiveId = `${String(dossier?.id || channel.id)}-${Date.now()}`;
    const relativeDirectory = path.join(String(channel.guild.id), archiveId);
    const finalDirectory = path.resolve(DOSSIER_ARCHIVE_DIR, relativeDirectory);
    const stagingDirectory = `${finalDirectory}.staging-${crypto.randomBytes(6).toString('hex')}`;
    const tarFiles = [];
    let totalAttachmentBytes = 0;
    let attachmentCount = 0;

    await fs.promises.mkdir(stagingDirectory, { recursive: true });

    try {
        for (const message of messages) {
            for (const attachment of message.attachments) {
                const fileName = `${attachment.id}-${safeArchiveFileName(attachment.name)}`;
                const result = await downloadDossierAttachment(attachment, totalAttachmentBytes);
                totalAttachmentBytes += result.bytes;
                attachmentCount += 1;
                attachment.archiveFile = path.posix.join('pieces-jointes', fileName);
                attachment.sha256 = result.sha256;
                attachment.archivedSize = result.bytes;
                tarFiles.push({ name: attachment.archiveFile, data: result.buffer });
            }
        }

        const manifest = {
            version: 1,
            archivedAt,
            guild: { id: channel.guild.id, name: channel.guild.name },
            channel: { id: channel.id, name: channel.name, topic: channel.topic || null },
            dossier: {
                ...dossier,
                archivePath: undefined,
                archiveSha256: undefined
            },
            counts: {
                messages: messages.length,
                attachments: attachmentCount,
                embeds: messages.reduce((sum, message) => sum + message.embeds.length, 0)
            },
            messages
        };
        const transcript = buildDossierTranscriptFromMessages(channel, dossier, messages, language);
        const archiveName = 'dossier.tar.gz';
        const tarBuffer = createTarBuffer([
            { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
            { name: 'compte-rendu.txt', data: Buffer.from(transcript, 'utf8') },
            ...tarFiles
        ]);
        const compressedArchive = zlib.gzipSync(tarBuffer, { level: 9 });
        const searchable = [
            JSON.stringify(manifest.dossier),
            ...messages.map(message => `${message.author?.tag || ''} ${message.content || ''} ${JSON.stringify(message.embeds || [])} ${(message.attachments || []).map(file => file.name || '').join(' ')}`)
        ].join('\n');

        await fs.promises.writeFile(path.join(stagingDirectory, archiveName), compressedArchive, { flag: 'wx' });
        await fs.promises.writeFile(
            path.join(stagingDirectory, 'recherche.txt.gz'),
            zlib.gzipSync(Buffer.from(searchable, 'utf8'), { level: 9 }),
            { flag: 'wx' }
        );
        await fs.promises.mkdir(path.dirname(finalDirectory), { recursive: true });
        await fs.promises.rename(stagingDirectory, finalDirectory);

        const archivePath = path.join(finalDirectory, archiveName);
        const savedArchive = await fs.promises.readFile(archivePath);
        const sha256 = crypto.createHash('sha256').update(savedArchive).digest('hex');
        const verifiedTar = zlib.gunzipSync(savedArchive);
        const verifiedManifest = readTarEntry(verifiedTar, 'manifest.json');

        if (!verifiedManifest) {
            throw new Error('L’archive créée ne contient pas son manifeste.');
        }

        JSON.parse(verifiedManifest.toString('utf8'));
        const relativePath = path.relative(DOSSIER_ARCHIVE_DIR, archivePath);
        const result = {
            relativePath,
            sha256,
            size: savedArchive.length,
            archivedAt,
            messageCount: messages.length,
            attachmentCount,
            embedCount: manifest.counts.embeds,
            transcript
        };

        saveDossierArchiveMetadata(channel.guild.id, channel.id, result);
        return result;
    } catch (error) {
        await fs.promises.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
        throw error;
    }
}

async function sendDossierTranscript(channel, dossier, actor, language = 'fr') {
    const archive = await archiveDossierChannel(channel, dossier, language);
    const transcriptBuffer = Buffer.from(archive.transcript, 'utf8');
    const compressed = transcriptBuffer.length > 7 * 1024 * 1024;
    const fileName = `dossier-sentinel-${dossier?.id || channel.id}.txt${compressed ? '.gz' : ''}`;
    const attachment = new AttachmentBuilder(
        compressed ? zlib.gzipSync(transcriptBuffer, { level: 9 }) : transcriptBuffer,
        { name: fileName }
    );
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
        .setTitle(language === 'en' ? 'Sentinel | Dossier archive' : 'Sentinel | Archive de dossier')
        .setDescription(language === 'en'
            ? `Written record prepared for ${channel}.`
            : `Compte rendu préparé pour ${channel}.`
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
            archived: true,
            ...archive,
            sentToLogChannel: Boolean(sent),
            logChannelId: logChannel.id
        };
    }

    const sent = await channel.send({
        embeds: [archiveEmbed],
        files: [attachment]
    }).catch(() => null);

    return {
        archived: true,
        ...archive,
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
        'toggle_service',
        'start_service',
        'end_service',
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

    const questions = hasAdvancedAccess(interaction.member)
        ? (getDossierTypeSetting(interaction.guild.id, dossierType)?.questions || [])
        : [];

    return interaction.showModal(buildDossierOpenModal(dossierType, language, questions));
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
        permissionOverwrites: buildTicketOverwrites(interaction.guild, interaction.member, dossierType),
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
            priority: details.priority || 'normal',
            formAnswers: details.formAnswers || []
        }
    );
    await ticketChannel.setTopic(`sentinel-dossier:${interaction.user.id}:${dossierType}:${dossier.id}`).catch(() => {});

    const description = [
        language === 'en'
            ? `${interaction.user}, this reserved space is your Sentinel dossier.`
            : `${interaction.user}, cet espace réservé est ton dossier Sentinel.`,
        subject
            ? (language === 'en' ? `**Subject:** ${subject}` : `**Sujet :** ${subject}`)
            : null,
        descriptionText
            ? (language === 'en' ? `**Description:** ${descriptionText}` : `**Description :** ${descriptionText}`)
            : null,
        ...(details.formAnswers || []).map(answer => `**${answer.label} :** ${answer.value}`),
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
    const questions = hasAdvancedAccess(interaction.member)
        ? (getDossierTypeSetting(interaction.guild.id, dossierType)?.questions || [])
        : [];
    const formAnswers = questions.slice(0, 3).map((question, index) => ({
        label: question.label,
        value: interaction.fields.getTextInputValue(`question_${index}`)
    })).filter(answer => String(answer.value || '').trim());

    try {
        await createDossierFromInteraction(interaction, dossierType, { subject, description, formAnswers });
    } catch (error) {
        await interaction.reply({
            content: error.message || t(language, 'serviceError'),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    return true;
}

async function handleDossierCloseModal(interaction) {
    const match = /^sentinel_dossier_close:(\d{17,20})$/.exec(interaction.customId);

    if (!match) {
        return false;
    }

    const language = getGuildLanguage(interaction.guild.id);
    const channel = await interaction.guild.channels.fetch(match[1]).catch(() => null);
    const topic = parseDossierChannelTopic(channel?.topic);

    if (!channel?.isTextBased?.() || !topic) {
        await interaction.reply({ content: t(language, 'dossierNotInDossier'), flags: MessageFlags.Ephemeral });
        return true;
    }

    if (!memberCanManageDossier(interaction.member, topic.type) && topic.ownerUserId !== interaction.user.id) {
        await interaction.reply({ content: t(language, 'dossierCloseDenied'), flags: MessageFlags.Ephemeral });
        return true;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        await closeDossierChannelFromInteraction(interaction, channel, language, {
            reason: interaction.fields.getTextInputValue('close_reason'),
            resolution: interaction.fields.getTextInputValue('resolution_summary'),
            advanced: hasAdvancedAccess(interaction.member)
        });
        await interaction.editReply(t(language, 'dossierClosed'));
    } catch (error) {
        console.error('Erreur clôture dossier :', error);
        await interaction.editReply(error.message || t(language, 'serviceError'));
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

    const topic = parseDossierChannelTopic(channel.topic);

    if (!memberCanManageDossier(interaction.member, topic?.type)) {
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

    const dossierTopic = parseDossierChannelTopic(channel.topic);

    if (!memberCanManageDossier(interaction.member, dossierTopic?.type)) {
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

    const topic = parseDossierChannelTopic(channel.topic);

    if (!memberCanManageDossier(interaction.member, topic?.type)) {
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
        'dossier-reouvrir',
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

    const dossierTopic = parseDossierChannelTopic(channel.topic);

    if (!memberCanManageDossier(interaction.member, dossierTopic?.type)) {
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
        await interaction.showModal(buildDossierCloseModal(channel.id, language));
        return true;
    }

    if (commandName === 'dossier-reouvrir') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            await reopenDossierChannel(interaction.guild, channel, interaction.user, language, {
                advanced: hasAdvancedAccess(interaction.member)
            });
            await interaction.editReply(language === 'en' ? 'The dossier is open again.' : 'Le dossier est de nouveau ouvert.');
        } catch (error) {
            await interaction.editReply(error.message || t(language, 'serviceError'));
        }
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
        !memberCanManageDossier(interaction.member, topic.type)
        && topic.ownerUserId !== interaction.user.id
    ) {
        return interaction.reply({
            content: t(language, 'dossierCloseDenied'),
            flags: MessageFlags.Ephemeral
        });
    }

    return interaction.showModal(buildDossierCloseModal(channel.id, language));
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
            content: getModerationAccessDeniedMessage(requiredPermission, language),
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    if (['timeout', 'fin-timeout', 'expulser', 'bannir', 'purge', 'tempban', 'unban', 'lock', 'unlock', 'slowmode'].includes(commandName)
        && !botHasPermission(interaction.guild, requiredPermission)) {
        await interaction.reply({
            content: getModerationBotPermissionMissingMessage(requiredPermission, language),
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
            console.error('Erreur modération approfondie :', error);
            await interaction.reply({
                content: getModerationActionFailureMessage(
                    error,
                    interaction.guild,
                    PermissionsBitField.Flags.ManageChannels,
                    null,
                    language
                ),
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
                content: getModerationActionFailureMessage(
                    error,
                    interaction.guild,
                    PermissionsBitField.Flags.BanMembers,
                    target.member,
                    language
                ),
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
                content: getModerationActionFailureMessage(
                    error,
                    interaction.guild,
                    PermissionsBitField.Flags.BanMembers,
                    null,
                    language
                ),
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
        const { caseData, escalation } = await addWarningWithEscalation(
            interaction.guild,
            interaction.user,
            member,
            member.id,
            reason,
            language
        );

        await interaction.reply({
            content: `${t(language, 'moderationWarned', { member, caseId: caseData.id })}${warningEscalationSummary(escalation, language)}`,
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
                content: getModerationActionFailureMessage(
                    error,
                    interaction.guild,
                    PermissionsBitField.Flags.ModerateMembers,
                    member,
                    language
                ),
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
                content: getModerationActionFailureMessage(
                    error,
                    interaction.guild,
                    PermissionsBitField.Flags.ModerateMembers,
                    member,
                    language
                ),
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
    const guild = fallbackChannel?.guild || client.guilds.cache.get(guildId);
    const existingRecord = getCustomEmbedRecord(guildId, messageId);
    const channelId = existingRecord?.channel_id || fallbackChannel?.id || null;
    const channel = channelId
        ? guild?.channels.cache.get(channelId) || await guild?.channels.fetch(channelId).catch(() => null)
        : null;

    if (!channel || !channel.isTextBased()) {
        return { record: null, message: null, channel: null };
    }

    const message = await channel.messages.fetch(messageId).catch(() => null);

    if (!message || message.author.id !== client.user.id) {
        if (existingRecord) {
            deleteCustomEmbedRecord(guildId, messageId);
        }
        return { record: null, message: null, channel: null };
    }

    if (existingRecord) {
        return { record: existingRecord, message, channel };
    }

    const data = mapCustomEmbedMessageData(message);

    if (!data) {
        return { record: null, message: null, channel: null };
    }

    addCustomEmbedRecord(guildId, channel.id, message.id, client.user.id, data);
    await syncCustomEmbedMedia(message);
    const record = getCustomEmbedRecord(guildId, message.id);

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

        let sentMessage;

        try {
            sentMessage = await channel.send(buildCustomEmbedPayload(data, roleToPing, language));
        } catch (error) {
            console.error('Erreur creation embed Sentinel :', error);
            await interaction.reply({
                content: t(language, 'customEmbedChannelSendMissing', { channel }),
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        addCustomEmbedRecord(guildId, channel.id, sentMessage.id, interaction.user.id, data);
        await syncCustomEmbedMedia(sentMessage);

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

        const editedMessage = await message.edit({
            content: message.content || null,
            embeds: [buildCustomAnnouncementEmbed(nextData, language)],
            allowedMentions: { parse: [] }
        });
        updateCustomEmbedRecord(guildId, messageId, nextData);
        await syncCustomEmbedMedia(editedMessage);

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
        await message.reply(getModerationAccessDeniedMessage(requiredPermission, language));
        return true;
    }

    if (['timeout', 'fin-timeout', 'expulser', 'bannir', 'purge'].includes(commandName)
        && !botHasPermission(message.guild, requiredPermission)) {
        await message.reply(getModerationBotPermissionMissingMessage(requiredPermission, language));
        return true;
    }

    const args = content.split(/\s+/);

    if (commandName === 'purge') {
        if (!message.channel?.isTextBased() || typeof message.channel.bulkDelete !== 'function') {
            await message.reply(t(language, 'moderationNoChannel'));
            return true;
        }

        const amount = clampNumber(args[1], 1, 100);
        let deleted;

        try {
            deleted = await message.channel.bulkDelete(amount, true);
        } catch (error) {
            console.error('Erreur purge texte :', error);
            await message.reply(getModerationActionFailureMessage(
                error,
                message.guild,
                PermissionsBitField.Flags.ManageMessages,
                null,
                language
            ));
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
            await message.reply(getModerationActionFailureMessage(
                error,
                message.guild,
                PermissionsBitField.Flags.BanMembers,
                member,
                language
            ));
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
        const { caseData, escalation } = await addWarningWithEscalation(
            message.guild,
            message.author,
            member,
            member.id,
            reason,
            language
        );
        await message.reply(`${t(language, 'moderationWarned', { member, caseId: caseData.id })}${warningEscalationSummary(escalation, language)}`);
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
            await message.reply(getModerationActionFailureMessage(
                error,
                message.guild,
                PermissionsBitField.Flags.ModerateMembers,
                member,
                language
            ));
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
            await message.reply(getModerationActionFailureMessage(
                error,
                message.guild,
                PermissionsBitField.Flags.ModerateMembers,
                member,
                language
            ));
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
            await message.reply(getModerationActionFailureMessage(
                error,
                message.guild,
                PermissionsBitField.Flags.KickMembers,
                member,
                language
            ));
            return true;
        }

        const caseData = addModerationCase(message.guild.id, member.id, message.author.id, 'kick', reason, null);
        await sendModerationLog(message.guild, message.author, caseData, `${member.user.tag}`, language);
        await message.reply(t(language, 'moderationKick', { member: member.user.tag, caseId: caseData.id }));
        return true;
    }

    return true;
}

function reportMemberLabel(guild, userId) {
    const member = guild.members.cache.get(String(userId));
    return member?.displayName || member?.user?.globalName || member?.user?.username || String(userId);
}

function getGuildReportDataset(guild, kind) {
    const language = getGuildLanguage(guild.id);

    if (kind === 'service') {
        return {
            title: `Sentinel - Services - ${guild.name}`,
            columns: ['Utilisateur', 'ID Discord', 'Temps total', 'En service'],
            rows: getTopService(guild.id).map(item => ({
                Utilisateur: reportMemberLabel(guild, item.userId),
                'ID Discord': item.userId,
                'Temps total': formatDuration(item.totalTime),
                'En service': getUserData(guild.id, item.userId)?.startTime ? 'Oui' : 'Non'
            }))
        };
    }

    if (kind === 'payroll') {
        const payroll = getWeeklyPayroll(guild.id, { guild, language });
        return {
            title: `Sentinel - Paie ${payroll.weekStart} - ${guild.name}`,
            columns: ['Utilisateur', 'ID Discord', 'Temps', 'Taux', 'Ajustements', 'Montant', 'Paiement'],
            rows: payroll.items.map(item => ({
                Utilisateur: item.displayName || item.username || item.userId,
                'ID Discord': item.userId,
                Temps: item.totalTimeLabel,
                Taux: item.hourlyRateLabel,
                Ajustements: item.adjustmentAmountLabel,
                Montant: item.amountLabel,
                Paiement: item.paid ? 'Payé' : 'À payer'
            }))
        };
    }

    if (kind === 'dossiers') {
        const rows = db.prepare(`
            SELECT * FROM sentinel_dossiers WHERE guild_id = ? ORDER BY id DESC LIMIT 10000
        `).all(guild.id).map(mapDossier);
        return {
            title: `Sentinel - Dossiers - ${guild.name}`,
            columns: ['Dossier', 'Type', 'Sujet', 'Demandeur', 'Statut', 'Priorité', 'Référent', 'Ouverture', 'Clôture'],
            rows: rows.map(item => ({
                Dossier: `#${item.id}`,
                Type: item.type,
                Sujet: item.subject || '',
                Demandeur: item.ownerUserId,
                Statut: item.status,
                Priorité: item.priority,
                Référent: item.referentUserId || '',
                Ouverture: item.createdAt,
                Clôture: item.closedAt || ''
            }))
        };
    }

    if (kind === 'moderation') {
        const rows = db.prepare(`
            SELECT * FROM moderation_cases WHERE guild_id = ? ORDER BY id DESC LIMIT 10000
        `).all(guild.id);
        return {
            title: `Sentinel - Modération - ${guild.name}`,
            columns: ['Cas', 'Action', 'Cible', 'Modérateur', 'Raison', 'Durée', 'Date'],
            rows: rows.map(item => ({
                Cas: `#${item.id}`,
                Action: item.action,
                Cible: item.target_user_id || '',
                Modérateur: item.moderator_user_id,
                Raison: item.reason || '',
                Durée: item.duration ? formatDuration(item.duration) : '',
                Date: item.created_at
            }))
        };
    }

    throw new Error('Type de rapport inconnu.');
}

function createGuildReport(guild, kind, format) {
    const dataset = getGuildReportDataset(guild, kind);
    return {
        ...operations.createReportDocument({ ...dataset, format }),
        title: dataset.title,
        fileName: `sentinel-${kind}-${new Date().toISOString().slice(0, 10)}.${format === 'xls' ? 'xls' : format}`
    };
}

function buildDashboardNotifications(guildId, userId, snapshot = {}) {
    const notifications = [];
    const payroll = snapshot.payroll || getWeeklyPayroll(guildId, { guild: client.guilds.cache.get(guildId) });
    const unpaidCount = payroll.items.filter(item => !item.paid).length;
    const openDossiers = (snapshot.dossiers || getRecentDossiers(guildId, 100)).filter(item => item.status !== 'closed');
    const staleDossiers = openDossiers.filter(item => Date.now() - new Date(item.lastActivityAt || item.createdAt).getTime() > 48 * 60 * 60 * 1000);
    const automodCount = db.prepare(`
        SELECT COUNT(*) AS count FROM guild_automod_events
        WHERE guild_id = ? AND created_at >= datetime('now', '-24 hours')
    `).get(guildId).count;
    const failedAnnouncements = db.prepare(`
        SELECT COUNT(*) AS count FROM scheduled_announcements
        WHERE guild_id = ? AND status = 'failed'
    `).get(guildId).count;
    const failedDeliveries = db.prepare(`
        SELECT COUNT(*) AS count FROM official_update_deliveries
        WHERE guild_id = ? AND status = 'failed'
    `).get(guildId).count;
    const failedReports = db.prepare(`
        SELECT COUNT(*) AS count FROM guild_report_schedules
        WHERE guild_id = ? AND last_error IS NOT NULL
    `).get(guildId).count;
    const systemAlerts = snapshot.includeSystemAlerts
        ? (getDatabaseBackupStatus().alerts || [])
        : [];

    if (staleDossiers.length) notifications.push({
        key: 'dossiers-stale',
        severity: 'warning',
        title: `${staleDossiers.length} dossier(s) sans activité depuis 48 h`,
        detail: 'La file du personnel contient des demandes à reprendre.',
        tab: 'dossiers'
    });
    if (unpaidCount) notifications.push({
        key: `payroll-unpaid-${payroll.weekStart}`,
        severity: 'info',
        title: `${unpaidCount} paiement(s) à valider`,
        detail: `Paie de la semaine du ${payroll.weekStart}.`,
        tab: 'service'
    });
    if (automodCount) notifications.push({
        key: `automod-${new Date().toISOString().slice(0, 10)}`,
        severity: automodCount >= 10 ? 'danger' : 'info',
        title: `${automodCount} incident(s) de sûreté en 24 h`,
        detail: 'Consulte le Centre de sûreté pour vérifier les déclenchements.',
        tab: 'moderation'
    });
    if (failedAnnouncements + failedDeliveries) notifications.push({
        key: 'announcements-failed',
        severity: 'danger',
        title: `${failedAnnouncements + failedDeliveries} annonce(s) non distribuée(s)`,
        detail: 'Un salon supprimé ou une permission Discord peut bloquer l’envoi.',
        tab: 'embeds'
    });
    if (failedReports) notifications.push({
        key: 'reports-failed',
        severity: 'danger',
        title: `${failedReports} rapport(s) automatique(s) en échec`,
        detail: 'Vérifie le salon de destination et les permissions de Sentinel.',
        tab: 'operations'
    });
    for (const alert of systemAlerts) {
        notifications.push({
            key: `system-${alert.key}`,
            severity: Number(alert.level || 0) >= 90 ? 'danger' : 'warning',
            title: alert.message || 'Alerte de maintenance Sentinel',
            detail: 'La console fondatrice contient le diagnostic et les actions de maintenance.',
            tab: 'founder'
        });
    }

    const states = operations.getNotificationStates(guildId, userId);
    return notifications.map(item => {
        const state = states.get(item.key);
        return {
            ...item,
            read: Boolean(state?.read_at),
            dismissed: Boolean(state?.dismissed_at)
        };
    }).filter(item => !item.dismissed);
}

function getMemberPortalGuild(guild, userId) {
    const language = getGuildLanguage(guild.id);
    const service = getUserData(guild.id, userId);
    const payroll = getWeeklyPayroll(guild.id, { guild, language });
    const payrollLine = payroll.items.find(item => item.userId === userId) || null;
    const warningSettings = operations.getWarningEscalationSettings(guild.id);
    const warnings = getModerationCases(guild.id, userId, 20)
        .filter(item => ['warn', 'warning_timeout', 'warning_kick', 'warning_ban'].includes(item.action));
    const dossiers = db.prepare(`
        SELECT * FROM sentinel_dossiers
        WHERE guild_id = ? AND owner_user_id = ? ORDER BY id DESC LIMIT 25
    `).all(guild.id, userId).map(mapDossier).map(item => ({
        id: item.id,
        type: item.type,
        status: item.status,
        subject: item.subject,
        priority: item.priority,
        createdAt: item.createdAt,
        closedAt: item.closedAt
    }));
    const preferences = operations.getUserNotificationPreferences(guild.id, userId);
    const activeWarningCount = operations.getActiveWarningCount(guild.id, userId, warningSettings.windowDays);
    const memberNotifications = [];

    if (preferences.serviceEnabled && service?.startTime) {
        memberNotifications.push({
            key: 'service-active',
            title: 'Service en cours',
            detail: `Prise de service enregistrée le ${new Date(service.startTime).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`,
            createdAt: new Date(service.startTime).toISOString()
        });
    }
    if (preferences.payrollEnabled && payrollLine) {
        memberNotifications.push({
            key: `payroll-${payroll.weekStart}`,
            title: payrollLine.paid ? 'Paie enregistrée' : 'Paie en attente',
            detail: `${payrollLine.amountLabel} pour la semaine du ${payroll.weekStart}.`,
            createdAt: payrollLine.paidAt || payroll.weekEnd
        });
    }
    const openDossiers = dossiers.filter(item => item.status !== 'closed');
    if (preferences.dossierEnabled && openDossiers.length) {
        memberNotifications.push({
            key: 'dossiers-open',
            title: `${openDossiers.length} dossier(s) en cours`,
            detail: 'Ton registre personnel contient encore des demandes ouvertes.',
            createdAt: openDossiers[0].createdAt
        });
    }
    if (preferences.moderationEnabled && activeWarningCount) {
        memberNotifications.push({
            key: 'warnings-active',
            title: `${activeWarningCount} avertissement(s) actif(s)`,
            detail: `Les avertissements sortent du calcul après ${warningSettings.windowDays} jours.`,
            createdAt: warnings[0]?.created_at || null
        });
    }

    return {
        guild: { id: guild.id, name: guild.name, icon: guild.iconURL() },
        service: {
            totalTime: service?.totalTime || 0,
            totalTimeLabel: formatDuration(service?.totalTime || 0),
            active: Boolean(service?.startTime),
            sessionCount: getUserSessionCount(guild.id, userId),
            sessions: getUserSessions(guild.id, userId, 10).map(item => ({ ...item, durationLabel: formatDuration(item.duration || 0) }))
        },
        payroll: {
            weekStart: payroll.weekStart,
            weekEnd: payroll.weekEnd,
            line: payrollLine ? {
                totalTimeLabel: payrollLine.totalTimeLabel,
                amountLabel: payrollLine.amountLabel,
                paid: payrollLine.paid,
                paidAt: payrollLine.paidAt
            } : null
        },
        warnings: {
            activeCount: activeWarningCount,
            expirationDays: warningSettings.windowDays,
            items: warnings.map(item => ({ id: item.id, action: item.action, reason: item.reason, duration: item.duration, createdAt: item.created_at }))
        },
        dossiers,
        notifications: memberNotifications,
        preferences,
        digestHistory: operations.getMemberDigestHistory(guild.id, userId, 10)
    };
}

async function getMemberPortal(userId) {
    const guilds = [];
    for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (member) guilds.push(getMemberPortalGuild(guild, userId));
    }
    return { guilds };
}

function simulateGuildOperation(guild, actorUserId, kind, input = {}) {
    let result;
    if (kind === 'automod') {
        const content = String(input.content || '').slice(0, 2000);
        const normalized = content.normalize('NFKC').toLowerCase();
        const settings = getDashboardAutomodSettings(guild.id);
        const matchedWord = getAutomodWords(guild.id).find(item => normalized.includes(item.word));
        const invite = /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(content);
        result = matchedWord && settings.forbiddenWordsEnabled
            ? { matched: true, rule: 'forbidden_words', action: settings.forbiddenWordsAction, detail: `Mot détecté : ${matchedWord.word}` }
            : (invite && settings.inviteFilterEnabled
                ? { matched: true, rule: 'discord_invite', action: settings.inviteAction, detail: 'Invitation Discord détectée.' }
                : { matched: false, rule: null, action: 'none', detail: 'Aucune règle active ne bloquerait ce message.' });
    } else if (kind === 'dossier') {
        const type = normalizeDossierType(input.type);
        const setting = getDossierTypeSetting(guild.id, type);
        const roleIds = getDossierTypeRoleIds(guild.id, type);
        result = {
            type,
            categoryId: setting?.categoryId || null,
            categoryName: guild.channels.cache.get(setting?.categoryId)?.name || null,
            roleIds,
            roleNames: roleIds.map(id => guild.roles.cache.get(id)?.name || id),
            questions: setting?.questions || []
        };
    } else if (kind === 'announcement') {
        const { data } = buildCustomEmbedData(input, null, getGuildLanguage(guild.id));
        result = { valid: true, title: data.title, description: data.description, color: data.color, totalCharacters: data.title.length + data.description.length };
    } else if (kind === 'payroll') {
        const userId = normalizeUserId(input.userId);
        const payroll = getWeeklyPayroll(guild.id, { guild });
        const line = payroll.items.find(item => item.userId === userId);
        result = line
            ? { found: true, userId, totalTimeLabel: line.totalTimeLabel, hourlyRateLabel: line.hourlyRateLabel, amountLabel: line.amountLabel, paid: line.paid }
            : { found: false, userId, detail: 'Aucune ligne de paie pour cette semaine.' };
    } else {
        throw new Error('Mode d’essai inconnu.');
    }
    const id = operations.addSimulationRun(guild.id, actorUserId, kind, input, result);
    return { id, kind, result };
}

function runSentinelGuildValidation(guild, trigger = 'manual') {
    const warning = operations.getWarningEscalationSettings(guild.id);
    const commandRoleIds = getCommandRoleIds(guild.id);
    const dossierRoleIds = getDossierRoleIds(guild.id);
    const missing = ids => ids.filter(id => !guild.roles.cache.has(id));
    const checks = [
        { key: 'database', label: 'Intégrité SQLite', ok: db.pragma('quick_check', { simple: true }) === 'ok' },
        { key: 'warning-thresholds', label: 'Paliers d’avertissement', ok: warning.timeoutThreshold > 0 && (!warning.kickThreshold || warning.kickThreshold > warning.timeoutThreshold) && (!warning.banThreshold || warning.banThreshold > Math.max(warning.kickThreshold, warning.timeoutThreshold)) },
        { key: 'command-roles', label: 'Rôles staff existants', ok: missing(commandRoleIds).length === 0, detail: missing(commandRoleIds).join(', ') },
        { key: 'dossier-roles', label: 'Rôles dossiers existants', ok: missing(dossierRoleIds).length === 0, detail: missing(dossierRoleIds).join(', ') },
        { key: 'bot-member', label: 'Sentinel présent comme membre', ok: Boolean(guild.members.me) }
    ];
    return operations.addValidationRun(guild.id, trigger, checks);
}

let operationsCycleRunning = false;

async function processMemberNotificationDigests() {
    for (const item of operations.getDueMemberDigests(50)) {
        const guild = client.guilds.cache.get(item.guildId);
        if (!guild) {
            operations.completeMemberDigest(item, { error: 'Serveur Discord introuvable.' });
            continue;
        }
        const member = guild.members.cache.get(item.userId)
            || await guild.members.fetch(item.userId).catch(() => null);
        if (!member) {
            operations.completeMemberDigest(item, { error: 'Le membre ne fait plus partie du serveur.' });
            continue;
        }
        try {
            const portal = getMemberPortalGuild(guild, item.userId);
            const notifications = portal.notifications.slice(0, 10);
            if (!notifications.length) {
                operations.completeMemberDigest(item, { skipped: true, itemCount: 0 });
                continue;
            }
            const recipient = member.user || await client.users.fetch(item.userId);
            const message = await recipient.send({
                embeds: [new EmbedBuilder()
                    .setColor(SENTINEL_COLORS.accent)
                    .setTitle(`Sentinel | Registre personnel de ${guild.name}`)
                    .setDescription(item.digestFrequency === 'weekly'
                        ? 'Voici ton relevé hebdomadaire demandé depuis ton espace personnel.'
                        : 'Voici ton relevé quotidien demandé depuis ton espace personnel.')
                    .addFields(notifications.map(notification => ({
                        name: String(notification.title || 'Information').slice(0, 256),
                        value: String(notification.detail || 'Consulte ton espace Sentinel.').slice(0, 1024)
                    })))
                    .setFooter({ text: 'Tu peux modifier ou arrêter ces messages depuis ton espace personnel.' })
                    .setTimestamp()],
                allowedMentions: { parse: [] }
            });
            operations.completeMemberDigest(item, { messageId: message.id, itemCount: notifications.length });
        } catch (error) {
            operations.completeMemberDigest(item, { error: error.message || error });
        }
    }
}

async function processScheduledOperations() {
    if (operationsCycleRunning) return;
    operationsCycleRunning = true;
    try {
        for (const item of operations.getDueScheduledAnnouncements()) {
            const guild = client.guilds.cache.get(item.guildId);
            const channel = guild?.channels?.cache?.get(item.channelId);
            if (!guild || !channel?.isTextBased?.()) {
                operations.completeScheduledAnnouncement(item, { error: 'Serveur ou salon Discord introuvable.' });
                continue;
            }
            try {
                const message = await channel.send({
                    embeds: [buildCustomAnnouncementEmbed(item, getGuildLanguage(guild.id))],
                    allowedMentions: { parse: [] }
                });
                addCustomEmbedRecord(guild.id, channel.id, message.id, item.createdByUserId, item);
                operations.completeScheduledAnnouncement(item, { messageId: message.id });
            } catch (error) {
                operations.completeScheduledAnnouncement(item, { error: error.message || error });
            }
        }

        for (const item of operations.getDueReportSchedules()) {
            const guild = client.guilds.cache.get(item.guildId);
            const channel = guild?.channels?.cache?.get(item.channelId);
            if (!guild || !channel?.isTextBased?.()) {
                operations.completeReportSchedule(item, { error: 'Serveur ou salon Discord introuvable.' });
                continue;
            }
            try {
                const report = createGuildReport(guild, item.reportKind, item.format);
                const message = await channel.send({
                    content: `Rapport Sentinel automatique : **${report.title}**`,
                    files: [new AttachmentBuilder(report.buffer, { name: report.fileName })],
                    allowedMentions: { parse: [] }
                });
                operations.completeReportSchedule(item, { messageId: message.id });
            } catch (error) {
                operations.completeReportSchedule(item, { error: error.message || error });
            }
        }

        await processMemberNotificationDigests();
    } finally {
        operationsCycleRunning = false;
    }
}

async function runStartupStagingValidation() {
    const config = stagingValidationConfig();
    try {
        const result = await runDiscordStagingValidation(client);
        const checks = result.skipped
            ? [{ key: 'staging-disabled', label: 'Serveur de préproduction non configuré', ok: true }]
            : result.checks;
        operations.addValidationRun(result.guildId || config.guildId, 'discord-staging', checks);
        console.log(result.skipped
            ? 'Validation Discord de préproduction désactivée.'
            : `Validation Discord de préproduction réussie : ${checks.length} contrôle(s).`);
        return result;
    } catch (error) {
        const checks = Array.isArray(error.checks) && error.checks.length
            ? error.checks
            : [{ key: 'staging-error', label: 'Validation Discord de préproduction', ok: false, detail: error.message }];
        operations.addValidationRun(config.guildId, 'discord-staging', checks);
        console.error('Validation Discord de préproduction échouée :', error);
        if (config.required) throw error;
        return { skipped: false, failed: true, guildId: config.guildId, checks };
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    console.log(`Build Sentinel actif : ${SENTINEL_BUILD}`);

    try {
        await runStartupStagingValidation();
    } catch (error) {
        console.error('Mise en service refusée par la validation de préproduction.');
        await client.destroy();
        process.exitCode = 1;
        return;
    }

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
            addDossierTypeRole,
            addModerationCase,
            addWarningWithEscalation,
            addSession,
            addWeeklyPayAdjustment,
            archiveWeeklyPayroll,
            buildCustomAnnouncementEmbed,
            buildCustomEmbedData,
            buildCustomEmbedPayload,
            buildDossierPanelComponents,
            buildDossierPanelEmbed,
            publishOrUpdateDossierPanel,
            buildServicePanelComponents,
            buildServicePanelPayload,
            publishOrUpdateServicePanel,
            clearLongServiceAlert,
            clearLongServiceAlertsForGuild,
            closeDossierChannel,
            closeDossierRecord,
            createDossierTemplate,
            createUserIfMissing,
            deleteCustomEmbedRecord,
            deleteModerationCase,
            deleteTemporaryBan,
            formatDuration,
            formatCustomEmbedQuota,
            getActiveServices,
            addAutomodWord,
            getCommandRoleIds,
            getCustomEmbeds,
            getCustomEmbedQuota,
            getCustomEmbedRecord,
            getPublicEmbedMedia,
            getPublicOfficialUpdates,
            hasCustomEmbedUpload,
            customEmbedUploadRequiresAttachment,
            getDatabaseBackupStatus,
            buildDashboardNotifications,
            createGuildReport,
            getAllDossierTypeRoles,
            getDossierArchiveFile,
            getDossierRoleIds,
            getDossierStats,
            getDossierTemplate,
            getDossierTemplates,
            getGuildConfig,
            getGuildLanguage,
            getGuildOfficialUpdateHistory,
            getMemberPortal,
            getMemberPortalGuild,
            getGuildPayRoleSettings,
            getAutoRole,
            getAssignableRoleError,
            getDossierByChannel,
            getDossierById,
            getDossierPanelQuota,
            getDossierTypeSettings,
            getDashboardAutomodSettings,
            getLogChannel,
            getOpenDossierCount,
            getFilteredModerationCases,
            getAutomodWords,
            getRecentAutomodEvents,
            getModerationCases,
            getModerationCase,
            getGuildPaySettings,
            getRecentDossiers,
            getRecentModerationCases,
            getModerationTargetError,
            getCustomEmbedChannelError,
            getServiceRoleManageError,
            getReason,
            getServiceRole,
            getServiceSummary,
            getSentinelSyncStatus,
            getSlashCommandStatus,
            getTemporaryBan,
            getWarningEscalationSettings: operations.getWarningEscalationSettings,
            getWarningEscalationEvents: operations.getWarningEscalationEvents,
            updateWarningEscalationSettings: operations.updateWarningEscalationSettings,
            getScheduledAnnouncements: operations.getScheduledAnnouncements,
            saveScheduledAnnouncement: operations.saveScheduledAnnouncement,
            approveScheduledAnnouncement: operations.approveScheduledAnnouncement,
            cancelScheduledAnnouncement: operations.cancelScheduledAnnouncement,
            getReportSchedules: operations.getReportSchedules,
            saveReportSchedule: operations.saveReportSchedule,
            removeReportSchedule: operations.removeReportSchedule,
            setNotificationState: operations.setNotificationState,
            getUserNotificationPreferences: operations.getUserNotificationPreferences,
            updateUserNotificationPreferences: operations.updateUserNotificationPreferences,
            getSimulationRuns: operations.getSimulationRuns,
            getValidationRuns: operations.getValidationRuns,
            getTopService,
            getTopWeek,
            getWeeklyPayrollArchive,
            getWeeklyPayrollArchives,
            getWeeklyPayroll,
            getUserData,
            getUserSessions,
            getUserSessionCount,
            getUserTargetErrorById,
            hasCommandRoleAccess,
            hasAdvancedAccess,
            memberCanManageDossier,
            mapCustomEmbedMessageData,
            hasModerationAccess,
            isAdvancedGuild,
            normalizeUserId,
            parseDurationToMs,
            parseSlowmodeToSeconds,
            prepareCustomEmbedUploads,
            reconcileDossierPanels,
            runSentinelGuildValidation,
            simulateGuildOperation,
            recordDashboardRequestMetric,
            removeAutomodWord,
            removeDossierRole,
            removeDossierTypeRole,
            deleteDossierTemplate,
            removeCommandRole,
            removeGuildPayRoleSettings,
            recordDossierPanel,
            resetGuild,
            resetUser,
            sendModerationLog,
            sendOfficialUpdateTest,
            publishOfficialStatusUpdate,
            sendDossierTranscript,
            sendServiceLog,
            setDossierReferent,
            setGuildLanguage,
            setWeeklyPaymentStatus,
            syncCustomEmbedMedia,
            syncDossierTypePermissions,
            updateGuildPayRoleSettings,
            updateDossierActivity,
            updateDossierStatus,
            updateDossierPriority,
            updateDossierTypeCategory,
            updateDossierTypeSettings,
            reopenDossierChannel,
            syncServiceState,
            updateGuildPaySettings,
            updateAutomodSettings,
            updateGuildConfig,
            updateCustomEmbedRecord,
            updateSentinelStatusPanel,
            updateModerationCaseReason,
            updateUserTime,
            upsertTemporaryBan,
            resolveMaintenanceFile,
            restoreManagedDatabaseBackup,
            runManualDatabaseMaintenance,
            scanCustomEmbedMediaOrphans,
            searchDossierArchives,
            verifyManagedDatabaseBackup
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

        const referenceConfig = await ensureReferenceGuildRuntimeConfig();

        if (referenceConfig.skipped) {
            console.log(`Configuration serveur Sentinel ignoree : ${referenceConfig.reason}`);
        } else {
            console.log([
                'Configuration serveur Sentinel verifiee',
                `role service=${referenceConfig.serviceRole || 'absent'}`,
                `logs=${referenceConfig.logChannel || 'absent'}`,
                `auto-role=${referenceConfig.autoRole || 'absent'}`,
                `roles staff=${referenceConfig.staffRoles.length}`,
                `maj=${referenceConfig.updated.length || 0}`
            ].join(' | '));
        }

        await updateAllSentinelStatusPanels();
        for (const guild of client.guilds.cache.values()) {
            await repairGuildOfficialUpdateReferences(guild, true).catch(error => {
                console.error(`Réparation des salons d'annonces ${guild.id} :`, error);
            });
        }
        const officialDistribution = await distributeLatestPublicOfficialUpdate();
        console.log(`Bulletin public Sentinel vérifié : ${officialDistribution.delivered}/${officialDistribution.queued} nouvelle(s) livraison(s).`);
        await processExpiredTemporaryBans();
        await processScheduledOperations();
        for (const guild of client.guilds.cache.values()) {
            runSentinelGuildValidation(guild, 'startup');
        }
    } catch (error) {
        console.error('Erreur synchronisation serveur Sentinel :', error);
    }

    setInterval(refreshSlashCommandStatus, 6 * 60 * 60 * 1000);
    setInterval(updateAllSentinelStatusPanels, 5 * 60 * 1000);
    setInterval(processExpiredTemporaryBans, 60 * 1000);
    setInterval(() => processScheduledOperations().catch(error => {
        console.error('Traitements programmés Sentinel :', error);
    }), OPERATIONS_INTERVAL_MS);
    setInterval(() => processOfficialUpdateRetries().catch(error => {
        console.error('Nouvelle tentative des annonces officielles Sentinel :', error);
    }), 5 * 60 * 1000);
    setInterval(checkLongServiceAlerts, LONG_SERVICE_ALERT_INTERVAL_MS);
    setInterval(processDossierMaintenance, DOSSIER_MAINTENANCE_INTERVAL_MS);
    setTimeout(checkLongServiceAlerts, 60 * 1000);
    setTimeout(() => processDossierMaintenance().catch(error => {
        console.error('Entretien dossiers Sentinel :', error);
    }), 30 * 1000);
    setTimeout(() => processOfficialUpdateRetries().catch(error => {
        console.error('Première reprise des annonces officielles Sentinel :', error);
    }), 60 * 1000);
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

async function notifyGuildConfigurationRepair(guild, description) {
    const language = getGuildLanguage(guild.id);
    const payload = {
        embeds: [createSentinelEmbed({
            color: SENTINEL_COLORS.warning,
            title: language === 'en' ? 'Sentinel | Configuration repaired' : 'Sentinel | Configuration réparée',
            description,
            requester: client.user,
            language
        })]
    };
    const logChannel = getLogChannel(guild);

    if (logChannel && await logChannel.send(payload).then(() => true).catch(() => false)) {
        return;
    }

    const owner = await guild.fetchOwner().catch(() => null);
    await owner?.send(payload).catch(() => {});
}

async function repairGuildOfficialUpdateReferences(guild, notify = false) {
    await Promise.all([
        guild.channels.fetch().catch(() => null),
        guild.roles.fetch().catch(() => null)
    ]);

    const config = getGuildConfig(guild.id);
    const statusMissing = Boolean(config.statusChannelId && !guild.channels.cache.has(config.statusChannelId));
    const updatesMissing = Boolean(config.updatesChannelId && !guild.channels.cache.has(config.updatesChannelId));
    const pingRoleMissing = Boolean(config.updatesPingRoleId && !guild.roles.cache.has(config.updatesPingRoleId));

    if (!statusMissing && !updatesMissing && !pingRoleMissing) {
        return false;
    }

    updateGuildConfig(guild.id, {
        ...(statusMissing ? { statusChannelId: null } : {}),
        ...(updatesMissing ? { updatesChannelId: null, statusUpdatesEnabled: false } : {}),
        ...(pingRoleMissing ? { updatesPingRoleId: null } : {})
    });

    if (updatesMissing) {
        db.prepare(`
            UPDATE official_update_deliveries
            SET status = 'cancelled', last_error = ?, next_attempt_at = NULL, updated_at = ?
            WHERE guild_id = ? AND status IN ('pending', 'retrying')
        `).run(
            'Le salon des nouveautés est introuvable.',
            new Date().toISOString(),
            guild.id
        );
    }

    if (notify) {
        const repaired = [
            statusMissing ? 'le salon d’état technique' : null,
            updatesMissing ? 'le salon des nouveautés' : null,
            pingRoleMissing ? 'le rôle de mention' : null
        ].filter(Boolean).join(', ');
        const repairedEn = [
            statusMissing ? 'the technical status channel' : null,
            updatesMissing ? 'the updates channel' : null,
            pingRoleMissing ? 'the mention role' : null
        ].filter(Boolean).join(', ');
        await notifyGuildConfigurationRepair(
            guild,
            getGuildLanguage(guild.id) === 'en'
                ? `Sentinel removed an invalid Discord reference: ${repairedEn}. Open the dashboard to choose a new item.`
                : `Sentinel a retiré une référence Discord devenue invalide : ${repaired}. Ouvre la console pour choisir un nouvel élément.`
        );
    }

    return true;
}

client.on(Events.ChannelDelete, async channel => {
    const guild = channel.guild;

    if (!guild) {
        return;
    }

    const config = getGuildConfig(guild.id);
    const removedStatus = config.statusChannelId === channel.id;
    const removedUpdates = config.updatesChannelId === channel.id;

    if (!removedStatus && !removedUpdates) {
        return;
    }

    updateGuildConfig(guild.id, {
        ...(removedStatus ? { statusChannelId: null } : {}),
        ...(removedUpdates ? { updatesChannelId: null, statusUpdatesEnabled: false } : {})
    });

    if (removedUpdates) {
        db.prepare(`
            UPDATE official_update_deliveries
            SET status = 'cancelled', last_error = ?, next_attempt_at = NULL, updated_at = ?
            WHERE guild_id = ? AND channel_id = ? AND status IN ('pending', 'retrying')
        `).run(
            'Le salon des nouveautés a été supprimé.',
            new Date().toISOString(),
            guild.id,
            channel.id
        );
    }

    const english = getGuildLanguage(guild.id) === 'en';
    const description = removedUpdates
        ? (english
            ? 'The updates channel was deleted. Official delivery has been paused to prevent lost announcements. Choose a new channel in the dashboard or with `/status-channel`.'
            : 'Le salon des nouveautés a été supprimé. La diffusion officielle a été suspendue pour éviter des envois perdus. Choisis un nouveau salon dans la console ou avec `/config-statut`.')
        : (english
            ? 'The technical status channel was deleted. Its reference was removed automatically. You can choose a new one in the dashboard or with `/status-channel`.'
            : 'Le salon d’état technique a été supprimé. Sa référence a été retirée automatiquement. Tu peux en choisir un nouveau dans la console ou avec `/config-statut`.');

    await notifyGuildConfigurationRepair(guild, description);
});

client.on(Events.GuildRoleDelete, async role => {
    const config = getGuildConfig(role.guild.id);

    if (config.updatesPingRoleId !== role.id) {
        return;
    }

    updateGuildConfig(role.guild.id, { updatesPingRoleId: null });
    await notifyGuildConfigurationRepair(
        role.guild,
        getGuildLanguage(role.guild.id) === 'en'
            ? 'The role mentioned for updates was deleted. Future announcements will remain visible without a role mention.'
            : 'Le rôle mentionné pour les nouveautés a été supprimé. Les prochaines annonces resteront visibles, sans mention de rôle.'
    );
});

client.on(Events.GuildMemberAdd, async member => {
    await assignConfiguredAutoRole(member);
    await handleAutomodRaid(member).catch(error => {
        console.error('Erreur anti-raid auto-mod :', error);
    });
});

client.on(Events.InteractionCreate, async interaction => {
    const interactionStartedAt = process.hrtime.bigint();
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
        if (await handleDossierCloseModal(interaction)) {
            return;
        }

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

        if (commandName === 'maj-sentinel') {
            if (!canPublishOfficialSentinelUpdate(interaction)) {
                auditStatus = 'failed';
                auditSummary = t(language, 'officialUpdateDenied');

                return interaction.reply({
                    content: auditSummary,
                    flags: MessageFlags.Ephemeral
                });
            }
            auditSummary = language === 'en'
                ? 'Global announcements are now prepared in the founder console, protected by a one-time code, then approved by another authorized person.'
                : 'Les annonces globales se préparent désormais dans la console fondatrice, avec un code à usage unique, puis la validation d’une autre personne autorisée.';
            return interaction.reply({ content: auditSummary, flags: MessageFlags.Ephemeral });
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
            const roleError = getServiceRoleManageError(interaction.guild, role, language);

            if (roleError) {
                return interaction.reply({
                    content: roleError,
                    flags: MessageFlags.Ephemeral
                });
            }

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

        if (commandName === 'config-statut') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const action = interaction.options.getString('action') || 'voir';
            const config = getGuildConfig(guildId);

            if (['voir', 'view'].includes(action)) {
                const currentChannel = config.statusChannelId ? `<#${config.statusChannelId}>` : (language === 'en' ? 'Not configured' : 'Non configuré');
                const updatesChannel = config.updatesChannelId ? `<#${config.updatesChannelId}>` : (language === 'en' ? 'Not configured' : 'Non configuré');
                const updates = config.statusUpdatesEnabled ? (language === 'en' ? 'Enabled' : 'Activées') : (language === 'en' ? 'Disabled' : 'Désactivées');
                const pingRole = config.updatesPingRoleId ? `<@&${config.updatesPingRoleId}>` : (language === 'en' ? 'None' : 'Aucun');

                return interaction.reply({
                    content: t(language, 'statusChannelCurrent', {
                        channel: currentChannel,
                        updatesChannel,
                        updates,
                        pingRole
                    }),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['desactiver', 'disable'].includes(action)) {
                updateGuildConfig(guildId, {
                    statusChannelId: null
                });

                return interaction.reply({
                    content: t(language, 'statusChannelDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['maj-on', 'updates-on'].includes(action)) {
                if (!config.updatesChannelId) {
                    return interaction.reply({
                        content: t(language, 'statusUpdatesChannelRequired'),
                        flags: MessageFlags.Ephemeral
                    });
                }

                updateGuildConfig(guildId, {
                    statusUpdatesEnabled: true
                });

                return interaction.reply({
                    content: t(language, 'statusUpdatesEnabled'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['maj-off', 'updates-off'].includes(action)) {
                updateGuildConfig(guildId, {
                    statusUpdatesEnabled: false
                });

                return interaction.reply({
                    content: t(language, 'statusUpdatesDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['maj-test', 'updates-test'].includes(action)) {
                try {
                    const channel = await sendOfficialUpdateTest(interaction.guild, interaction.user);
                    return interaction.reply({
                        content: t(language, 'statusUpdatesTested', { channel }),
                        flags: MessageFlags.Ephemeral
                    });
                } catch (error) {
                    return interaction.reply({
                        content: `❌ ${officialUpdateErrorMessage(error)}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            if (['maj-role-off', 'updates-role-off'].includes(action)) {
                updateGuildConfig(guildId, { updatesPingRoleId: null });
                return interaction.reply({
                    content: t(language, 'statusUpdatesRoleDisabled'),
                    flags: MessageFlags.Ephemeral
                });
            }

            if (['maj-role', 'updates-role'].includes(action)) {
                const role = interaction.options.getRole('role');

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

                updateGuildConfig(guildId, { updatesPingRoleId: role.id });
                return interaction.reply({
                    content: t(language, 'statusUpdatesRoleSet', { role }),
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = interaction.options.getChannel('salon') || interaction.options.getChannel('channel');

            if (!channel) {
                return interaction.reply({
                    content: t(language, 'statusChannelRequired'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const channelError = getCustomEmbedChannelError(interaction.guild, channel, null, language);

            if (channelError) {
                return interaction.reply({
                    content: channelError,
                    flags: MessageFlags.Ephemeral
                });
            }

            const configPatch = ['maj-salon', 'updates-channel'].includes(action)
                ? { updatesChannelId: channel.id, statusUpdatesEnabled: true }
                : { statusChannelId: channel.id };

            updateGuildConfig(guildId, configPatch);

            if (!['maj-salon', 'updates-channel'].includes(action)) {
                await updateSentinelStatusPanel(interaction.guild);
            }

            return interaction.reply({
                content: t(language, ['maj-salon', 'updates-channel'].includes(action)
                    ? 'statusUpdatesChannelSet'
                    : 'statusChannelSet', { channel }),
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

            if (requestedWeekStart && !isValidDateKey(requestedWeekStart)) {
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

        if (commandName === 'paie-historique') {
            if (!hasCommandRoleAccess(interaction.member)) {
                return interaction.reply({
                    content: getCommandRoleAccessDeniedMessage(language),
                    flags: MessageFlags.Ephemeral
                });
            }

            const requestedWeekStart = interaction.options.getString('semaine')
                || interaction.options.getString('week')
                || null;

            if (requestedWeekStart && !isValidDateKey(requestedWeekStart)) {
                return interaction.reply({
                    content: t(language, 'payrollWeekInvalid'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = buildPayrollArchiveHistoryEmbed(
                interaction.guild,
                interaction.user,
                requestedWeekStart
            );

            if (!embed) {
                return interaction.reply({
                    content: language === 'en'
                        ? 'No payroll archive was found for this period.'
                        : 'Aucune archive de paie n’a été trouvée pour cette période.',
                    flags: MessageFlags.Ephemeral
                });
            }

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
                console.error('Erreur ping données internes :', error);

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
            const member = requestedMember || interaction.member;
            const limit = clampNumber(interaction.options.getInteger('limite') || 10, 1, ADVANCED_HISTORY_LIMIT);

            const userData = getUserData(guildId, member.id);
            const totalSessionCount = getUserSessionCount(guildId, member.id);
            const sessions = getUserSessions(guildId, member.id, limit);
            const embed = buildServiceHistoryEmbed(member, interaction.user, userData, sessions, {
                isAdvancedServer: true,
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

        const request = governance.createCriticalAction({
            scope: 'guild',
            guildId: interaction.guild.id,
            actionType: 'reset-guild',
            payload: {},
            summary: `Réinitialiser toutes les heures de ${interaction.guild.name}`,
            requestedByUserId: interaction.user.id
        });

        return interaction.update({
            content: buttonLanguage === 'en'
                ? `Critical request #${request.id} created. Another authorized manager must approve it from the dashboard.`
                : `Demande critique #${request.id} créée. Un autre responsable autorisé doit l’approuver depuis le dashboard.`,
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

    const serviceButtonActions = new Set(['toggle_service', 'start_service', 'end_service']);

    if (!serviceButtonActions.has(interaction.customId)) return;

    const requestedServiceAction = interaction.customId === 'start_service'
        ? 'start'
        : (interaction.customId === 'end_service' ? 'end' : 'toggle');

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

        const roleManageError = getServiceRoleManageError(interaction.guild, role, buttonLanguage);

        if (roleManageError) {
            auditStatus = 'failed';
            auditSummary = roleManageError;

            return interaction.reply({
                content: roleManageError,
                flags: MessageFlags.Ephemeral
            });
        }

        const member = interaction.member;
        const guildId = interaction.guild.id;
        const userId = member.id;
        const userData = createUserIfMissing(guildId, userId);
        const isOnDuty = member.roles.cache.has(role.id);

        if (requestedServiceAction === 'start' && isOnDuty) {
            return interaction.reply({
                content: t(buttonLanguage, 'serviceAlreadyStarted'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (requestedServiceAction === 'end' && !isOnDuty) {
            return interaction.reply({
                content: t(buttonLanguage, 'serviceNotStarted'),
                flags: MessageFlags.Ephemeral
            });
        }

        if (isOnDuty && requestedServiceAction !== 'start') {
            const startTime = userData.startTime;
            let duration = 0;
            let totalTime = userData.totalTime;

            if (startTime) {
                duration = Date.now() - startTime;
                totalTime += duration;
            }

            await member.roles.remove(role);

            if (duration > 0) {
                addSession(guildId, userId, duration);
            }

            updateUserTime(guildId, userId, totalTime, null);
            clearLongServiceAlert(guildId, userId);

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

        await member.roles.add(role);

        updateUserTime(guildId, userId, userData.totalTime, serviceStartTime);
        clearLongServiceAlert(guildId, userId);

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
        recordDiscordInteractionMetric(
            interaction,
            Number(process.hrtime.bigint() - interactionStartedAt) / 1e6,
            auditStatus === 'failed'
        );
    }
});

client.on(Events.MessageDelete, async message => {
    if (message.guild?.id && message.id && message.author?.id === client.user?.id) {
        deleteCustomEmbedRecord(message.guild.id, message.id);
    }

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

    const dossierTopic = parseDossierChannelTopic(message.channel?.topic);
    if (dossierTopic) {
        updateDossierActivity(
            guildId,
            message.channel.id,
            message.author.id,
            message.author.id !== dossierTopic.ownerUserId
                && memberCanManageDossier(message.member, dossierTopic.type),
            message.createdAt.toISOString()
        );
    }

    try {
    if (await handleAutomodMessage(message)) {
        return;
    }

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
        return publishOrUpdateServicePanel(message.channel, language);
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
            console.error('Erreur ping données internes :', error);

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

    if (/^!(paie-historique|payroll-history)\b/i.test(content)) {
        if (!hasCommandRoleAccess(message.member)) {
            return message.reply(getCommandRoleAccessDeniedMessage(language));
        }

        const requestedWeekStart = content
            .replace(/^!(paie-historique|payroll-history)\s*/i, '')
            .trim() || null;

        if (requestedWeekStart && !isValidDateKey(requestedWeekStart)) {
            return message.reply(t(language, 'payrollWeekInvalid'));
        }

        const embed = buildPayrollArchiveHistoryEmbed(message.guild, message.author, requestedWeekStart);

        if (!embed) {
            return message.reply(language === 'en'
                ? 'No payroll archive was found for this period.'
                : 'Aucune archive de paie n’a été trouvée pour cette période.');
        }

        return message.reply({ embeds: [embed] });
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
        const mentionedMember = message.mentions.members.first();
        const member = mentionedMember || message.member;
        const args = content.split(/\s+/);
        const limitArg = args.find(arg => /^\d+$/.test(arg));
        const limit = clampNumber(limitArg || 10, 1, ADVANCED_HISTORY_LIMIT);

        const userData = getUserData(guildId, member.id);
        const totalSessionCount = getUserSessionCount(guildId, member.id);
        const sessions = getUserSessions(guildId, member.id, limit);
        const embed = buildServiceHistoryEmbed(member, message.author, userData, sessions, {
            isAdvancedServer: true,
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

module.exports = {
    __test: {
        createTarBuffer,
        readTarEntry,
        resolveDossierArchivePath,
        safeArchiveFileName
    }
};

if (require.main === module) {
    client.login(process.env.TOKEN);
}

