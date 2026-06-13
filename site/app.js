const translations = {
  fr: {
    navFeatures: 'Fonctions',
    navWorkflow: 'Démarrage',
    navCommands: 'Commandes',
    navSecurity: 'Sécurité',
    invite: 'Inviter',
    heroEyebrow: 'Performance · Sécurité · Fiabilité',
    heroCopy: 'Le bot Discord qui centralise les prises de service, les heures, les classements, les logs et la modération de ton serveur.',
    inviteSentinel: 'Inviter Sentinel',
    seeSetup: 'Voir le démarrage',
    metricLanguage: 'Langues',
    metricStorage: 'Stockage',
    metricAccess: 'Accès',
    metricAccessValue: 'Par rôles',
    featuresEyebrow: 'Gestion gratuite',
    featuresTitle: 'Tout ce qu’il faut pour gérer un serveur actif.',
    featuresCopy: 'Sentinel reste simple pour les membres, mais solide pour l’équipe qui configure et modère.',
    featureServiceTitle: 'Service',
    featureServiceCopy: 'Prise et fin de service par bouton, rôle automatique, durée de session et total individuel.',
    featureStatsTitle: 'Statistiques',
    featureStatsCopy: 'Heures personnelles, historique limité gratuit, agents actifs et classement top 10.',
    featureModerationTitle: 'Modération',
    featureModerationCopy: 'Avertissements, timeout, fin de timeout, expulsion, bannissement, purge et sanctions.',
    featureLogsTitle: 'Logs',
    featureLogsCopy: 'Journalisation des services et actions de modération dans le salon choisi par ID.',
    posterEyebrow: 'Identité Sentinel',
    posterTitle: 'Un univers cyber, lisible et immédiatement reconnaissable.',
    posterCopy: 'La page reprend le contraste noir, les éclats magenta, les lignes cyan et les panneaux techniques de la DA officielle.',
    workflowEyebrow: 'Installation',
    workflowTitle: 'Démarrer Sentinel en quelques minutes.',
    workflowCopy: 'Le bot guide les bases : langue du serveur, rôle de service, salon de logs et rôles autorisés.',
    stepInviteTitle: 'Inviter le bot',
    stepInviteCopy: 'Utilise le lien officiel avec les scopes bot et applications.commands.',
    stepLanguageTitle: 'Choisir la langue',
    stepLanguageCopy: 'Sélectionne Français ou English. Le choix reste propre au serveur.',
    stepRoleTitle: 'Configurer le service',
    stepRoleCopy: 'Définis le rôle de service, le salon de logs et les rôles qui peuvent gérer Sentinel.',
    stepPanelTitle: 'Publier le panneau',
    stepPanelCopy: 'Envoie !service-panel dans le salon où les membres doivent pointer.',
    commandsEyebrow: 'Commandes',
    commandsTitle: 'Les commandes essentielles.',
    serviceCommandsTitle: 'Service',
    configCommandsTitle: 'Configuration',
    moderationCommandsTitle: 'Modération',
    cmdMyHours: 'Voir ses heures',
    cmdHistory: 'Voir ses 5 dernières sessions',
    cmdOnDuty: 'Voir les agents actifs',
    cmdTop: 'Voir le top 10',
    cmdLanguage: 'Choisir la langue',
    cmdRole: 'Définir le rôle de service',
    cmdLogs: 'Définir le salon de logs',
    cmdPermissions: 'Gérer les accès',
    cmdWarn: 'Ajouter un avertissement',
    cmdTimeout: 'Muter temporairement',
    cmdBan: 'Bannir un utilisateur',
    cmdCases: 'Voir les sanctions',
    securityEyebrow: 'Sécurité',
    securityTitle: 'Des garde-fous avant chaque action.',
    securityOne: 'Accès de gestion par rôles configurés.',
    securityTwo: 'Vérification des permissions Discord natives.',
    securityThree: 'Respect de la hiérarchie des rôles avant modération.',
    securityFour: 'Données stockées serveur par serveur avec SQLite.',
    finalTitle: 'Prêt à installer Sentinel ?',
    finalCopy: 'Ajoute le bot, choisis la langue de ton serveur et publie ton premier panneau de service.',
    readDocs: 'Lire la documentation',
    terms: 'Conditions',
    privacy: 'Confidentialité'
  },
  en: {
    navFeatures: 'Features',
    navWorkflow: 'Setup',
    navCommands: 'Commands',
    navSecurity: 'Security',
    invite: 'Invite',
    heroEyebrow: 'Performance · Security · Reliability',
    heroCopy: 'The Discord bot that centralizes duty tracking, hours, leaderboards, logs, and moderation for your server.',
    inviteSentinel: 'Invite Sentinel',
    seeSetup: 'View setup',
    metricLanguage: 'Languages',
    metricStorage: 'Storage',
    metricAccess: 'Access',
    metricAccessValue: 'By roles',
    featuresEyebrow: 'Free management',
    featuresTitle: 'Everything you need to run an active server.',
    featuresCopy: 'Sentinel stays simple for members and strong for the team configuring and moderating.',
    featureServiceTitle: 'Duty tracking',
    featureServiceCopy: 'Start and end duty with buttons, automatic role handling, session duration, and personal totals.',
    featureStatsTitle: 'Statistics',
    featureStatsCopy: 'Personal hours, free limited history, active members, and top 10 leaderboard.',
    featureModerationTitle: 'Moderation',
    featureModerationCopy: 'Warnings, timeout, timeout removal, kick, ban, purge, and moderation cases.',
    featureLogsTitle: 'Logs',
    featureLogsCopy: 'Service and moderation logs sent to the configured channel ID.',
    posterEyebrow: 'Sentinel identity',
    posterTitle: 'A cyber universe that stays clear and instantly recognizable.',
    posterCopy: 'The page follows the official art direction: black contrast, magenta impact, cyan lines, and technical panels.',
    workflowEyebrow: 'Installation',
    workflowTitle: 'Start Sentinel in a few minutes.',
    workflowCopy: 'The bot covers the basics: server language, duty role, log channel, and allowed management roles.',
    stepInviteTitle: 'Invite the bot',
    stepInviteCopy: 'Use the official invite link with the bot and applications.commands scopes.',
    stepLanguageTitle: 'Choose the language',
    stepLanguageCopy: 'Select Français or English. The setting stays specific to this server.',
    stepRoleTitle: 'Configure duty tracking',
    stepRoleCopy: 'Set the duty role, log channel, and roles allowed to manage Sentinel.',
    stepPanelTitle: 'Publish the panel',
    stepPanelCopy: 'Send !service-panel in the channel where members should clock in.',
    commandsEyebrow: 'Commands',
    commandsTitle: 'Essential commands.',
    serviceCommandsTitle: 'Duty',
    configCommandsTitle: 'Configuration',
    moderationCommandsTitle: 'Moderation',
    cmdMyHours: 'View your hours',
    cmdHistory: 'View your last 5 sessions',
    cmdOnDuty: 'View active members',
    cmdTop: 'View the top 10',
    cmdLanguage: 'Choose the language',
    cmdRole: 'Set the duty role',
    cmdLogs: 'Set the log channel',
    cmdPermissions: 'Manage access',
    cmdWarn: 'Add a warning',
    cmdTimeout: 'Temporarily mute',
    cmdBan: 'Ban a user',
    cmdCases: 'View cases',
    securityEyebrow: 'Security',
    securityTitle: 'Guardrails before every action.',
    securityOne: 'Management access through configured roles.',
    securityTwo: 'Checks for native Discord permissions.',
    securityThree: 'Role hierarchy respected before moderation.',
    securityFour: 'Server-specific data stored with SQLite.',
    finalTitle: 'Ready to install Sentinel?',
    finalCopy: 'Add the bot, choose your server language, and publish your first duty panel.',
    readDocs: 'Read docs',
    terms: 'Terms',
    privacy: 'Privacy'
  }
};

const toggle = document.querySelector('[data-language-toggle]');
const translatableNodes = document.querySelectorAll('[data-i18n]');

function applyLanguage(language) {
  const dictionary = translations[language] || translations.fr;
  document.documentElement.lang = language;

  translatableNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (dictionary[key]) {
      node.textContent = dictionary[key];
    }
  });

  if (toggle) {
    toggle.textContent = language === 'fr' ? 'EN' : 'FR';
    toggle.setAttribute('aria-label', language === 'fr' ? 'Switch to English' : 'Passer en français');
  }

  localStorage.setItem('sentinel-site-language', language);
}

const savedLanguage = localStorage.getItem('sentinel-site-language');
const browserLanguage = navigator.language && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
let currentLanguage = savedLanguage || browserLanguage;

applyLanguage(currentLanguage);

if (toggle) {
  toggle.addEventListener('click', () => {
    currentLanguage = currentLanguage === 'fr' ? 'en' : 'fr';
    applyLanguage(currentLanguage);
  });
}
