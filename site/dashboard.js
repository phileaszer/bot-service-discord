const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let currentUser = null;
let guilds = [];
let selectedGuildId = null;
let currentState = null;
let currentSettings = null;
let activeDashboardTab = 'overview';
let dashboardPlanMode = 'free';
let tooltipHost = null;
let tooltipPinned = false;
let tooltipElement = null;
let auditScope = 'server';
let auditFilters = {};
let moderationFilters = {};
let expandedModerationCaseId = null;
let payrollHistoryFilters = { query: '', status: 'all' };
let expandedPayrollArchiveWeek = null;
let selectedUserProfile = null;
let dossierFilters = {};
let expandedDossierId = null;
let creatorOverview = null;
let creatorOverviewLoading = false;
let canViewPremiumOverview = false;
let currentSiteAccess = { role: 'user', isFounder: false, isStaff: false, canViewSitePanel: false, canManagePremium: false, canManageSiteStaff: false };
let dashboardHydrating = false;
let selectedGuildPreview = null;
let csrfToken = null;
let activeUploadPreviewUrls = new Set();
const LAST_GUILD_STORAGE_KEY = 'sentinel-dashboard-last-guild-id';
const GUILD_PREVIEW_CACHE_PREFIX = 'sentinel-dashboard-guild-preview';
const PROFILE_STORAGE_KEY = 'sentinel-discord-profile';
const CUSTOM_EMBED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const CUSTOM_EMBED_UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const SERVER_PRESETS = [
  {
    id: 'standard',
    eyebrow: 'Base',
    title: 'Standard',
    summary: 'Une configuration simple pour démarrer Sentinel sans spécialiser le serveur.',
    advice: [
      'Choisis un rôle de service uniquement si ton serveur suit des heures.',
      'Garde un salon de logs lisible pour retrouver les actions importantes.',
      'Ajoute seulement les rôles staff qui doivent vraiment gérer Sentinel.'
    ]
  },
  {
    id: 'rp-modern',
    eyebrow: 'RP moderne',
    title: 'Police / EMS / Staff RP',
    summary: 'Pensé pour les serveurs GTA, RP moderne ou équipes avec prises de service régulières.',
    advice: [
      'Utilise un rôle de service clair, par exemple En service ou Agent actif.',
      'Publie le panneau de service dans un salon visible par les agents.',
      'Garde les tickets pour support, signalement, recrutement et plaintes RP.'
    ]
  },
  {
    id: 'western',
    eyebrow: 'RP western',
    title: 'Époque 1900 / Western',
    summary: 'Adapté aux serveurs Red Dead ou RP plus immersifs, avec un vocabulaire plus sobre.',
    advice: [
      'Prévois des tickets pour plaintes, recrutements, demandes RP et signalements.',
      'Utilise la paie RP si les heures servent à payer les métiers ou services.',
      'Le thème western du site peut être activé séparément selon la préférence de chacun.'
    ]
  },
  {
    id: 'staff',
    eyebrow: 'Équipe',
    title: 'Staff et modération',
    summary: 'Pour un serveur qui veut surtout encadrer les sanctions, les logs et les demandes membres.',
    advice: [
      'Configure les rôles autorisés avant de donner l’accès au dashboard.',
      'Vérifie que Sentinel peut bannir, timeout, expulser et purger.',
      'Utilise les tickets pour centraliser les demandes et les signalements.'
    ]
  },
  {
    id: 'community',
    eyebrow: 'Communauté',
    title: 'Communauté Discord',
    summary: 'Pour un serveur généraliste qui veut rester simple, clair et facile à administrer.',
    advice: [
      'Commence avec les logs, les rôles staff et les tickets de support.',
      'Active l’auto-rôle seulement si tu as un rôle d’arrivée utile.',
      'Garde la modération par ID pour pouvoir agir même si une personne quitte le serveur.'
    ]
  }
];
const SERVER_PRESET_MAP = new Map(SERVER_PRESETS.map((preset) => [preset.id, preset]));

const publicDashboardHost = window.location.pathname.endsWith('/dashboard.html')
  || window.location.hostname.endsWith('github.io');

function lastGuildStorageKeys() {
  const keys = [];

  if (currentUser?.id) {
    keys.push(`${LAST_GUILD_STORAGE_KEY}:${currentUser.id}`);
  }

  keys.push(LAST_GUILD_STORAGE_KEY);
  return keys;
}

function readStoredProfileUser() {
  try {
    const payload = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || 'null');
    const user = payload?.user;

    if (!user || !/^\d{17,20}$/.test(String(user.id || ''))) {
      return null;
    }

    return user;
  } catch (error) {
    return null;
  }
}

function readStoredLastGuildId() {
  try {
    for (const key of lastGuildStorageKeys()) {
      const value = localStorage.getItem(key);

      if (/^\d{17,20}$/.test(String(value || ''))) {
        return value;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

function guildPreviewCacheKey(userId, guildId) {
  if (!/^\d{17,20}$/.test(String(userId || '')) || !/^\d{17,20}$/.test(String(guildId || ''))) {
    return null;
  }

  return `${GUILD_PREVIEW_CACHE_PREFIX}:${userId}:${guildId}`;
}

function readCachedGuildPreview(userId, guildId) {
  const key = guildPreviewCacheKey(userId, guildId);

  if (!key) {
    return null;
  }

  try {
    const preview = JSON.parse(localStorage.getItem(key) || 'null');

    if (!preview || preview.id !== guildId || !preview.name) {
      return null;
    }

    return preview;
  } catch (error) {
    return null;
  }
}

function storeCachedGuildPreview(guild) {
  const key = guildPreviewCacheKey(currentUser?.id, guild?.id);

  if (!key) {
    return;
  }

  try {
    localStorage.setItem(key, JSON.stringify({
      id: guild.id,
      name: guild.name,
      icon: guild.icon || null,
      advanced: Boolean(guild.advanced),
      cachedAt: new Date().toISOString()
    }));
  } catch (error) {
    // Local cache only stores the server identity for instant display.
  }
}

function rememberCurrentGuildPreview() {
  if (!currentState?.guild) {
    return;
  }

  selectedGuildPreview = {
    ...currentState.guild,
    advanced: Boolean(currentState.advanced)
  };
  storeCachedGuildPreview(selectedGuildPreview);
}

function removeCachedGuildPreview(userId, guildId) {
  const key = guildPreviewCacheKey(userId, guildId);

  if (!key) {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Storage can be blocked by browser settings.
  }
}

function showCachedDashboardPreview() {
  const storedUser = readStoredProfileUser();

  if (storedUser && !currentUser) {
    currentUser = storedUser;
    renderUser();
  }

  const guildId = readStoredLastGuildId();

  if (!currentUser?.id || !guildId) {
    return false;
  }

  selectedGuildId = guildId;
  dashboardHydrating = true;
  selectedGuildPreview = readCachedGuildPreview(currentUser.id, guildId);
  currentState = null;
  renderDashboard();
  return true;
}

function storeLastGuildId(guildId) {
  if (!/^\d{17,20}$/.test(String(guildId || ''))) {
    return;
  }

  currentSettings = {
    ...(currentSettings || {}),
    lastGuildId: guildId
  };

  try {
    for (const key of lastGuildStorageKeys()) {
      localStorage.setItem(key, guildId);
    }
  } catch (error) {
    // Some browsers block local storage; the backend setting remains the source of truth.
  }

  window.SentinelAuth?.saveSettings?.({ lastGuildId: guildId });
}

function forgetLastGuildId(guildId = null) {
  const storedGuildId = readStoredLastGuildId();

  if (!guildId || guildId === storedGuildId) {
    try {
      for (const key of lastGuildStorageKeys()) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      // Storage can be blocked by browser settings.
    }
  }

  if (!guildId || currentSettings?.lastGuildId === guildId) {
    currentSettings = {
      ...(currentSettings || {}),
      lastGuildId: null
    };
    window.SentinelAuth?.saveSettings?.({ lastGuildId: null });
  }
}

function getRestorableGuildIds() {
  const candidates = [
    readStoredLastGuildId(),
    currentSettings?.lastGuildId
  ].filter((guildId, index, list) => guildId && list.indexOf(guildId) === index);

  return candidates.filter((guildId) => (
    guilds.some((guild) => guild.id === guildId && guild.installed)
  ));
}

function getRestorableGuildId() {
  return getRestorableGuildIds()[0] || null;
}

function renderDashboardLoadingState(preview = selectedGuildPreview) {
  const serverName = preview?.name || 'ton dernier serveur';
  const previewIcon = safeDiscordImageUrl(preview?.icon);
  const serverIcon = previewIcon
    ? `<img src="${escapeHtml(previewIcon)}" alt="">`
    : '<span class="guild-fallback">S</span>';

  return `
    <div class="empty-state dashboard-loading-state">
      <img src="assets/sentinel-mark.png" alt="">
      <span class="status-badge is-site">Dernier serveur</span>
      <h2>${escapeHtml(serverName)}</h2>
      <div class="dashboard-loading-server">${serverIcon}<strong>Réouverture du dashboard</strong></div>
      <p>Sentinel remet ton dernier serveur en place et vérifie tes accès Discord.</p>
      <div class="dashboard-loading-bar" aria-hidden="true"><span></span></div>
      <button class="button button-small button-ghost" type="button" data-open-guild-drawer aria-controls="guild-drawer" aria-expanded="false">Changer de serveur</button>
    </div>
  `;
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method) ? { 'X-Sentinel-CSRF': csrfToken } : {}),
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (payload.csrfToken) {
    csrfToken = payload.csrfToken;
  }

  if (!response.ok || payload.ok === false) {
    const message = payload.error || `Erreur ${response.status}`;
    const error = new Error(message);
    error.payload = payload;
    error.status = response.status;

    if (payload.code === 'REAUTH_REQUIRED' && typeof payload.reauthUrl === 'string') {
      window.location.assign(payload.reauthUrl);
    }

    throw error;
  }

  return payload;
}

function dashboardErrorMessage(input) {
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';
  const payload = input && typeof input === 'object' ? input.payload || null : null;
  const message = typeof input === 'string' ? input : input?.message;
  const payloadFix = typeof payload?.fix === 'string' && payload.fix.trim()
    ? payload.fix.trim()
    : null;

  if (language === 'en') {
    const firstFix = currentState?.diagnostics?.fixes?.[0] || null;

    if (/^Quota gratuit atteint/.test(message || '')) {
      return `${message}\nFix: delete an existing embed from “Announcements”, or wait for Premium to create unlimited embeds.`;
    }

    if (/^Le gratuit permet/.test(message || '')) {
      return `${message}\nFix: keep the current panel, delete the old one if needed, or wait for Premium to publish several reception panels.`;
    }

    const translated = {
      'Login required.': 'Log in with Discord to use the dashboard.',
      'Sentinel is not installed on this server.': 'Invite Sentinel to this server before using the dashboard.',
      'You do not have access to this server dashboard.': 'You do not have access to this server dashboard.',
      'You do not have permission to manage Sentinel on this server.': 'You do not have an allowed role to manage Sentinel on this server.',
      'You do not have permission to manage Sentinel dossiers on this server.': 'You do not have a responsible role to manage Sentinel tickets on this server.',
      'You do not have permission for this moderation action.': 'Your Discord role cannot perform this moderation action.',
      'Sentinel does not have the required Discord permission.': 'Sentinel does not have the required Discord permission.',
      'This action is reserved for Sentinel Premium.': 'This action is reserved for Sentinel Premium.',
      'Founder access is required.': 'Only the founder can use this command.',
      'Site staff access is required.': 'This panel is reserved for the founder and site staff.',
      'Invalid site staff action.': 'Invalid site staff action.',
      'Founder access cannot be managed as staff.': 'The founder account already has full access.',
      'Recent Discord login is required.': 'Reconnect with Discord before changing protected access.',
      'Discord session verification failed.': 'Your Discord session must be verified again.',
      'Discord user not found.': 'This Discord account could not be found.',
      'Bot accounts cannot receive site staff access.': 'A bot account cannot receive site staff access.',
      'Site staff must be a member of this Discord server to perform actions.': 'Join this Discord server before performing an action.',
      'A Sentinel Discord staff role is required for site staff access.': 'A staff role on the Sentinel Discord server is also required.',
      'The Sentinel Discord server is unavailable.': 'The Sentinel Discord server is unavailable.',
      'No Sentinel Discord staff role is configured.': 'No staff role is configured on the Sentinel Discord server.',
      'The user must join the Sentinel Discord server before receiving site staff access.': 'This person must join the Sentinel Discord server first.',
      'The user must have a Sentinel Discord staff role before receiving site staff access.': 'Give this person a staff role on the Sentinel Discord server first.',
      'Invalid Discord user ID.': 'The Discord ID is not valid.',
      'Text channel not found.': 'Text channel not found.',
      'Role not found.': 'Discord role not found.',
      'Invalid timeout duration.': 'Invalid timeout duration. Example: 10m, 2h, 7d.',
      'Invalid temporary ban duration.': 'Invalid temporary ban duration.',
      'Invalid slowmode duration.': 'Invalid slowmode duration.',
      'Invalid hourly rate.': 'Invalid hourly rate.',
      'Invalid payroll adjustment.': 'Invalid payroll adjustment.',
      'Invalid payroll week.': 'The payroll week is invalid.',
      'Invalid payroll status.': 'The payroll status is invalid.',
      'Payroll line not found.': 'This payroll line no longer exists.',
      'Invalid message ID.': 'Invalid message ID.',
      'No service role is configured.': 'No duty role is configured.',
      'This user must be in the server to start duty.': 'This person must be in the server to start duty from the dashboard.',
      'This user is already on duty.': 'This person is already on duty.',
      'This user is not on duty.': 'This person is not on duty.',
      'Invalid server profile.': 'Invalid server profile.',
      'Case not found.': 'No case was found with this ID.',
      'Missing dossier type.': 'Ticket type is missing.',
      'Category not found.': 'Discord category not found.',
      'Sentinel cannot send this embed in the selected channel.': 'Sentinel cannot send this embed in the selected channel.',
      'Sentinel cannot use the selected channel.': 'Sentinel cannot use the selected channel.',
      'Invalid local image. Use a PNG, JPG, WebP, or GIF image.': 'Invalid local image.',
      'Local image too large. Keep the total under 8 MB per embed.': 'Local image too large.',
      'Payload too large.': 'Uploaded image is too large.',
      'Discord refused the action.': 'Discord refused the action.',
      'Discord ban not found.': 'No Discord ban was found for this ID.',
      'No embed field provided.': 'Choose at least one embed field to update.',
      'Sentinel embed not found.': 'No Sentinel embed was found with this ID in the selected channel.',
      'Unknown moderation action.': 'Unknown moderation action.',
      'Automod word is invalid.': 'Enter a forbidden word with at least 2 characters.',
      'This channel is not a Sentinel dossier.': 'This channel is not a Sentinel ticket.'
    };

    const resolutionByMessage = {
      'You do not have permission for this moderation action.': 'Check that your Discord role has the right permission, or add your role to Sentinel allowed roles.',
      'Sentinel does not have the required Discord permission.': firstFix || 'Open the permissions diagnostic and fix the permission shown there.',
      'Invalid Discord user ID.': 'Copy the full numeric Discord ID, not the username.',
      'Text channel not found.': 'Choose a text channel that Sentinel can access.',
      'Role not found.': 'Choose a Discord role that still exists on the server.',
      'No service role is configured.': 'Open the assistant and choose the role given to members on duty.',
      'This user must be in the server to start duty.': 'Check the Discord ID and make sure this person is still in the server.',
      'This user is already on duty.': 'Use “End duty” if you want to stop the current session.',
      'This user is not on duty.': 'No active duty session was found for this ID on this server.',
      'Invalid server profile.': 'Choose one of the profiles shown in the assistant.',
      'Invalid hourly rate.': 'Enter a positive hourly amount, for example 500 or 1250.',
      'Invalid payroll adjustment.': 'Enter a Discord ID, a type, a positive amount, and a short reason.',
      'Invalid payroll week.': 'Open the archive again and retry from its own payment line.',
      'Invalid payroll status.': 'Refresh the dashboard and use the button on the payroll line.',
      'Payroll line not found.': 'Refresh the dashboard and choose an existing current or archived payroll line.',
      'Invalid message ID.': 'Copy the full numeric ID of the message sent by Sentinel.',
      'Case not found.': 'Check the case ID in the latest cases table.',
      'Category not found.': 'Choose a Discord category that still exists.',
      'Sentinel cannot send this embed in the selected channel.': firstFix || 'Allow Sentinel to view the channel and send messages there.',
      'Sentinel cannot use the selected channel.': 'Fix the permissions of the selected channel, then try again.',
      'Invalid local image. Use a PNG, JPG, WebP, or GIF image.': 'Choose a valid PNG, JPG, WebP, or GIF image.',
      'Local image too large. Keep the total under 8 MB per embed.': 'Use a lighter image, up to 8 MB total per embed.',
      'Payload too large.': 'Use a lighter image, up to 8 MB total per embed.',
      'Discord refused the action.': 'Open the permissions diagnostic, fix the red item, then try again.',
      'Discord ban not found.': 'Check the full Discord ID and make sure this user is still banned.',
      'No embed field provided.': 'Change at least the title, description, color, image, thumbnail, or footer.',
      'Sentinel embed not found.': 'Choose the channel where the embed is posted, then paste the message ID. If the Discord message was deleted, its slot will be freed.',
      'This channel is not a Sentinel dossier.': 'Choose an open Sentinel ticket channel.',
      'This action is reserved for Sentinel Premium.': 'This option is shown to prepare Premium, but it stays locked on free servers.',
      'Founder access is required.': 'Only the founder can change this access.',
      'Site staff access is required.': 'Ask the founder to add your Discord account as site staff.',
      'Invalid site staff action.': 'Choose add or remove.',
      'Founder access cannot be managed as staff.': 'The founder account already has full access.',
      'Recent Discord login is required.': 'Reconnect with Discord, then retry the protected action.',
      'Discord session verification failed.': 'Reconnect with Discord to verify your identity.',
      'A Sentinel Discord staff role is required for site staff access.': 'Ask the founder to assign you a staff role on the Sentinel Discord server.'
    };
    const base = translated[message] || message || 'Action failed.';
    const resolution = payloadFix || resolutionByMessage[message];

    return resolution ? `${base}\nFix: ${resolution}` : base;
  }

  if (/^Quota gratuit atteint/.test(message || '')) {
    return `${message}\nÀ faire : supprime un embed existant depuis “Annonces”, ou attends l’ouverture du Premium pour créer des embeds illimités.`;
  }

  if (/^Le gratuit permet/.test(message || '')) {
    return `${message}\nÀ faire : garde le panneau actuel, supprime l’ancien panneau si besoin, ou attends le Premium pour publier plusieurs bureaux d’accueil.`;
  }

  const translated = {
    'Login required.': 'Connecte-toi avec Discord pour utiliser le dashboard.',
    'Sentinel is not installed on this server.': 'Sentinel doit être invité comme bot sur ce serveur avant d’utiliser le dashboard.',
    'You do not have access to this server dashboard.': 'Tu n’as pas accès au dashboard de ce serveur.',
    'You do not have permission to manage Sentinel on this server.': 'Tu n’as pas de rôle autorisé pour gérer Sentinel sur ce serveur.',
    'You do not have permission to manage Sentinel dossiers on this server.': 'Tu n’as pas de rôle responsable pour gérer les tickets Sentinel sur ce serveur.',
    'You do not have permission for this moderation action.': 'Tu n’as pas la permission Discord nécessaire pour cette sanction.',
    'Sentinel does not have the required Discord permission.': 'Sentinel n’a pas la permission Discord nécessaire pour faire cette action.',
    'This action is reserved for Sentinel Premium.': 'Cette action est réservée à Sentinel Premium.',
    'Founder access is required.': 'Seul le fondateur peut faire cette action.',
    'Site staff access is required.': 'Ce panneau est réservé au fondateur et au staff site.',
    'Invalid site staff action.': 'Action staff site invalide.',
    'Founder access cannot be managed as staff.': 'Le compte fondateur possède déjà l’accès complet.',
    'Recent Discord login is required.': 'Une reconnexion Discord récente est nécessaire.',
    'Discord session verification failed.': 'Ta session Discord doit être vérifiée à nouveau.',
    'Discord user not found.': 'Ce compte Discord est introuvable.',
    'Bot accounts cannot receive site staff access.': 'Un compte bot ne peut pas recevoir le grade staff du site.',
    'Site staff must be a member of this Discord server to perform actions.': 'Tu dois être membre de ce serveur Discord pour y effectuer une action.',
    'A Sentinel Discord staff role is required for site staff access.': 'Un rôle staff sur le Discord Sentinel est aussi obligatoire.',
    'The Sentinel Discord server is unavailable.': 'Le serveur Discord Sentinel est temporairement indisponible.',
    'No Sentinel Discord staff role is configured.': 'Aucun rôle staff n’est configuré sur le Discord Sentinel.',
    'The user must join the Sentinel Discord server before receiving site staff access.': 'Cette personne doit d’abord rejoindre le Discord Sentinel.',
    'The user must have a Sentinel Discord staff role before receiving site staff access.': 'Donne d’abord un rôle staff à cette personne sur le Discord Sentinel.',
    'Invalid Discord user ID.': 'L’ID Discord indiqué n’est pas valide.',
    'Text channel not found.': 'Salon textuel introuvable.',
    'Role not found.': 'Rôle Discord introuvable.',
    'Invalid timeout duration.': 'Durée de timeout invalide. Exemple : 10m, 2h, 7d.',
    'Invalid temporary ban duration.': 'Durée de ban temporaire invalide.',
    'Invalid slowmode duration.': 'Durée de mode lent invalide.',
    'Invalid hourly rate.': 'Montant horaire invalide.',
    'Invalid payroll adjustment.': 'Ajustement de paie invalide.',
    'Invalid payroll week.': 'La semaine de paie indiquée est invalide.',
    'Invalid payroll status.': 'L’état de paie indiqué est invalide.',
    'Payroll line not found.': 'Cette ligne de paie n’existe plus.',
    'Invalid message ID.': 'ID de message invalide.',
    'No service role is configured.': 'Aucun rôle de service n’est configuré.',
    'This user must be in the server to start duty.': 'Cette personne doit être présente sur le serveur pour prendre son service depuis le dashboard.',
    'This user is already on duty.': 'Cette personne est déjà en service.',
    'This user is not on duty.': 'Cette personne n’est pas en service.',
    'Invalid server profile.': 'Profil serveur invalide.',
    'Case not found.': 'Aucun cas trouvé avec cet ID.',
    'Missing dossier type.': 'Type de dossier manquant.',
    'Category not found.': 'Catégorie Discord introuvable.',
    'Sentinel cannot send this embed in the selected channel.': 'Sentinel ne peut pas envoyer cet embed dans le salon choisi.',
    'Sentinel cannot use the selected channel.': 'Sentinel ne peut pas utiliser le salon choisi.',
    'Invalid local image. Use a PNG, JPG, WebP, or GIF image.': 'Image locale invalide.',
    'Local image too large. Keep the total under 8 MB per embed.': 'Image locale trop lourde.',
    'Payload too large.': 'Image envoyée trop lourde.',
    'Discord refused the action.': 'Discord a refusé l’action.',
    'Discord ban not found.': 'Aucun bannissement Discord n’a été trouvé pour cet ID.',
    'No embed field provided.': 'Indique au moins un champ à modifier.',
    'Sentinel embed not found.': 'Aucun embed Sentinel n’a été trouvé avec cet ID dans le salon choisi.',
    'Unknown moderation action.': 'Action de modération inconnue.',
    'Automod word is invalid.': 'Indique un mot interdit d’au moins 2 caractères.',
    'This channel is not a Sentinel dossier.': 'Ce salon n’est pas un dossier Sentinel.'
  };

  const base = translated[message] || message || 'Action impossible pour le moment.';
  const diagnostics = currentState?.diagnostics;
  const firstFix = diagnostics?.fixes?.[0] || null;
  const resolutionByMessage = {
    'You do not have permission for this moderation action.': 'Vérifie que ton rôle Discord a la permission nécessaire, ou ajoute ton rôle dans les rôles autorisés Sentinel.',
    'Sentinel does not have the required Discord permission.': firstFix || 'Ouvre le diagnostic permissions du dashboard et corrige la permission indiquée.',
    'Invalid Discord user ID.': 'Copie l’ID Discord numérique complet de la personne, pas son pseudo.',
    'Text channel not found.': 'Choisis un salon textuel accessible par Sentinel.',
    'Role not found.': 'Choisis un rôle Discord toujours présent sur le serveur.',
    'No service role is configured.': 'Va dans l’assistant et choisis le rôle donné aux membres en service.',
    'This user must be in the server to start duty.': 'Vérifie l’ID Discord et assure-toi que la personne est encore sur ce serveur.',
    'This user is already on duty.': 'Utilise plutôt “Fin de poste” si tu veux arrêter sa session actuelle.',
    'This user is not on duty.': 'Aucune session active n’est trouvée pour cet ID sur ce serveur.',
    'Invalid server profile.': 'Choisis un profil proposé dans l’assistant.',
    'Invalid hourly rate.': 'Indique un montant horaire positif, par exemple 500 ou 1250.',
    'Invalid payroll adjustment.': 'Indique un ID Discord, un type, un montant positif et une raison courte.',
    'Invalid payroll week.': 'Rouvre l’archive puis relance l’action depuis sa ligne de paiement.',
    'Invalid payroll status.': 'Actualise le dashboard et utilise le bouton présent sur la ligne de paie.',
    'Payroll line not found.': 'Actualise le dashboard et choisis une ligne de paie actuelle ou archivée.',
    'Invalid message ID.': 'Copie l’ID numérique complet du message envoyé par Sentinel.',
    'Case not found.': 'Vérifie l’ID du cas dans le tableau des derniers dossiers.',
    'Category not found.': 'Choisis une catégorie Discord encore présente sur le serveur.',
    'Sentinel cannot send this embed in the selected channel.': firstFix || 'Autorise Sentinel à voir le salon et à y envoyer des messages.',
    'Sentinel cannot use the selected channel.': 'Corrige les permissions du salon choisi, puis réessaie.',
    'Invalid local image. Use a PNG, JPG, WebP, or GIF image.': 'Choisis une image PNG, JPG, WebP ou GIF valide.',
    'Local image too large. Keep the total under 8 MB per embed.': 'Utilise une image plus légère, 8 Mo maximum au total par embed.',
    'Payload too large.': 'Utilise une image plus légère, 8 Mo maximum au total par embed.',
    'Discord refused the action.': 'Ouvre le diagnostic permissions, corrige le point rouge, puis réessaie.',
    'Discord ban not found.': 'Vérifie l’ID Discord complet et assure-toi que cette personne est encore bannie.',
    'No embed field provided.': 'Modifie au moins le titre, la description, la couleur, l’image, la miniature ou le footer.',
    'Sentinel embed not found.': 'Choisis le salon où se trouve l’embed, puis colle l’ID du message. Si le message a été supprimé sur Discord, son emplacement sera libéré.',
    'This channel is not a Sentinel dossier.': 'Choisis un salon de ticket Sentinel ouvert.',
    'This action is reserved for Sentinel Premium.': 'Cette option est visible pour préparer le Premium, mais elle reste bloquée sur les serveurs gratuits.',
    'Founder access is required.': 'Connecte-toi avec le compte Discord fondateur pour modifier cet accès.',
    'Site staff access is required.': 'Demande au fondateur d’ajouter ton compte Discord au staff site.',
    'Invalid site staff action.': 'Choisis ajouter ou retirer.',
    'Founder access cannot be managed as staff.': 'Le compte fondateur n’a pas besoin d’être ajouté comme staff.',
    'Recent Discord login is required.': 'Reconnecte-toi avec Discord puis relance l’action protégée.',
    'Discord session verification failed.': 'Reconnecte-toi avec Discord pour confirmer ton identité.',
    'A Sentinel Discord staff role is required for site staff access.': 'Demande au fondateur de t’attribuer un rôle staff sur le Discord Sentinel.'
  };
  const resolution = payloadFix || resolutionByMessage[message];

  return resolution ? `${base}\nÀ faire : ${resolution}` : base;
}

function toast(message, type = 'success') {
  const stack = $('[data-toasts]');
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  stack.appendChild(item);
  setTimeout(() => item.remove(), 5200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeDiscordImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
      ? url.toString()
      : null;
  } catch (error) {
    return null;
  }
}

function safeExternalUrl(value, allowedHosts = []) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname)
      ? url.toString()
      : null;
  } catch (error) {
    return null;
  }
}

function optionList(items, selectedId = null, placeholder = 'Choisir') {
  const options = [`<option value="">${escapeHtml(placeholder)}</option>`];

  for (const item of items) {
    const selected = item.id === selectedId ? ' selected' : '';
    options.push(`<option value="${item.id}"${selected}>${escapeHtml(item.name)}</option>`);
  }

  return options.join('');
}

function formData(form) {
  const data = {};

  for (const [key, value] of new FormData(form).entries()) {
    if (typeof File !== 'undefined' && value instanceof File) {
      continue;
    }

    data[key] = value;
  }

  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lecture de l’image impossible.')));
    reader.readAsDataURL(file);
  });
}

async function customEmbedUploadFromInput(input, label) {
  const file = input?.files?.[0];

  if (!file || !file.name) {
    return null;
  }

  if (!CUSTOM_EMBED_UPLOAD_TYPES.has(file.type)) {
    throw new Error(`${label} : choisis une image PNG, JPG, WebP ou GIF.`);
  }

  if (file.size > CUSTOM_EMBED_UPLOAD_MAX_BYTES) {
    throw new Error(`${label} : image trop lourde. Maximum 8 Mo par embed.`);
  }

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl: await readFileAsDataUrl(file)
  };
}

async function actionFormData(form, action) {
  const data = formData(form);

  if (action === 'custom-embed-create' || action === 'custom-embed-edit') {
    const imageUpload = await customEmbedUploadFromInput(form.elements.imageFile, 'Image principale');
    const thumbnailUpload = await customEmbedUploadFromInput(form.elements.thumbnailFile, 'Miniature');
    const totalUploadSize = (imageUpload?.size || 0) + (thumbnailUpload?.size || 0);

    if (totalUploadSize > CUSTOM_EMBED_UPLOAD_MAX_BYTES) {
      throw new Error('Images trop lourdes. Maximum 8 Mo au total par embed.');
    }

    if (imageUpload) {
      data.imageUpload = imageUpload;
    }

    if (thumbnailUpload) {
      data.thumbnailUpload = thumbnailUpload;
    }
  }

  return data;
}

function fileUploadControl(name, title, emptyText, actionText = 'Choisir') {
  return `
          <label class="file-upload-control">
            <input class="file-upload-input" data-file-upload name="${escapeHtml(name)}" type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="${escapeHtml(title)}">
            <span class="file-upload-visual">
              <span class="file-upload-symbol" aria-hidden="true">
                <img data-file-upload-preview alt="">
              </span>
              <span class="file-upload-text">
                <strong>${escapeHtml(title)}</strong>
                <small data-file-upload-name data-empty-label="${escapeHtml(emptyText)}">${escapeHtml(emptyText)}</small>
              </span>
              <span class="file-upload-action">${escapeHtml(actionText)}</span>
            </span>
          </label>`;
}

function revokeUploadPreviewUrls() {
  for (const url of activeUploadPreviewUrls) {
    URL.revokeObjectURL(url);
  }

  activeUploadPreviewUrls = new Set();
}

function updateFileUploadName(input) {
  const control = input.closest('.file-upload-control');
  const label = control ? $('[data-file-upload-name]', control) : null;
  const preview = control ? $('[data-file-upload-preview]', control) : null;
  const file = input.files?.[0] || null;

  if (!control || !label) {
    return;
  }

  if (control.dataset.previewUrl) {
    URL.revokeObjectURL(control.dataset.previewUrl);
    activeUploadPreviewUrls.delete(control.dataset.previewUrl);
    delete control.dataset.previewUrl;
  }

  if (preview) {
    preview.removeAttribute('src');
  }

  if (file?.type?.startsWith('image/') && preview) {
    const previewUrl = URL.createObjectURL(file);
    control.dataset.previewUrl = previewUrl;
    activeUploadPreviewUrls.add(previewUrl);
    preview.src = previewUrl;
  }

  label.textContent = file?.name || label.dataset.emptyLabel || 'Aucune image sélectionnée';
  control.classList.toggle('has-file', Boolean(file?.name));
}

function setLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.dataset.originalText ||= button.textContent;
  button.textContent = isLoading ? 'Envoi…' : button.dataset.originalText;
}

function showPublicDashboardGuide() {
  const liveDashboard = $('[data-live-dashboard]');
  const publicDashboard = $('[data-public-dashboard]');
  const login = $('[data-login]');
  const logout = $('[data-logout]');
  const publicInvite = $('[data-public-invite]');

  if (liveDashboard) {
    liveDashboard.hidden = true;
  }

  if (publicDashboard) {
    publicDashboard.hidden = false;
  }

  if (login) {
    login.hidden = false;
  }

  if (logout) {
    logout.hidden = true;
  }

  if (publicInvite) {
    publicInvite.hidden = false;
  }

  $$('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const value = button.dataset.copy;

      try {
        await navigator.clipboard.writeText(value);
        toast(`Commande copiee : ${value}`);
      } catch (error) {
        toast(value, 'success');
      }
    });
  });
}

function setGuildDrawerOpen(isOpen) {
  const drawer = $('[data-guild-drawer]');
  const backdrop = $('.guild-drawer-backdrop');

  if (!drawer) return;

  drawer.classList.toggle('is-open', isOpen);
  drawer.setAttribute('aria-hidden', String(!isOpen));

  if (backdrop) {
    backdrop.hidden = true;
  }

  $$('[data-open-guild-drawer]').forEach((button) => {
    button.setAttribute('aria-expanded', String(isOpen));
  });

  document.body.classList.toggle('drawer-open', isOpen);
}

function getTooltipElement() {
  if (!tooltipElement) {
    tooltipElement = document.createElement('div');
    tooltipElement.id = 'sentinel-dashboard-tooltip';
    tooltipElement.className = 'sentinel-tooltip';
    tooltipElement.setAttribute('role', 'tooltip');
    tooltipElement.hidden = true;
    document.body.appendChild(tooltipElement);
  }

  return tooltipElement;
}

function positionTooltip(host) {
  if (!host || !tooltipElement || tooltipElement.hidden) {
    return;
  }

  const margin = 14;
  const gap = 12;
  const hostRect = host.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  let left = hostRect.left + (hostRect.width / 2) - (tooltipRect.width / 2);
  let top = hostRect.bottom + gap;
  let isAbove = false;

  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

  if (top + tooltipRect.height + margin > window.innerHeight) {
    top = hostRect.top - tooltipRect.height - gap;
    isAbove = true;
  }

  if (top < margin) {
    top = margin;
    isAbove = false;
  }

  tooltipElement.style.left = `${left}px`;
  tooltipElement.style.top = `${top}px`;
  tooltipElement.classList.toggle('is-above', isAbove);
}

function showTooltip(host, { pinned = false } = {}) {
  const text = host?.getAttribute('data-tooltip');

  if (!host || !text) {
    return;
  }

  const tooltip = getTooltipElement();
  tooltipHost = host;
  tooltipPinned = pinned;
  tooltip.textContent = text;
  tooltip.hidden = false;
  host.setAttribute('aria-describedby', tooltip.id);
  positionTooltip(host);
  tooltip.classList.add('is-visible');
}

function hideTooltip({ force = false } = {}) {
  if (tooltipPinned && !force) {
    return;
  }

  tooltipPinned = false;

  if (tooltipHost) {
    tooltipHost.removeAttribute('aria-describedby');
  }

  tooltipHost = null;

  if (!tooltipElement) {
    return;
  }

  tooltipElement.classList.remove('is-visible', 'is-above');
  tooltipElement.hidden = true;
}

function renderUser() {
  const card = $('[data-user-card]');
  const login = $('[data-login]');
  const logout = $('[data-logout]');

  if (!currentUser) {
    card.innerHTML = '<span>Non connecté</span>';
    login.hidden = false;
    logout.hidden = true;
    return;
  }

  const avatarUrl = safeDiscordImageUrl(currentUser.avatar);
  card.innerHTML = `
    ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : ''}
    <span>${escapeHtml(currentUser.globalName || currentUser.username)}</span>
  `;
  login.hidden = true;
  logout.hidden = false;
}

function renderGuilds() {
  const list = $('[data-guild-list]');

  if (!currentUser) {
    list.innerHTML = '<p class="muted">Connecte-toi pour afficher tes serveurs.</p>';
    return;
  }

  if (guilds.length === 0) {
    list.innerHTML = '<p class="muted">Aucun serveur gérable trouvé. Vérifie tes permissions Discord.</p>';
    return;
  }

  list.innerHTML = guilds.map((guild) => `
    <article class="guild-card ${guild.id === selectedGuildId ? 'is-active' : ''}">
      <button type="button" data-select-guild="${escapeHtml(guild.id)}">
        ${safeDiscordImageUrl(guild.icon) ? `<img src="${escapeHtml(safeDiscordImageUrl(guild.icon))}" alt="">` : '<span class="guild-fallback">S</span>'}
        <span>
          <strong>${escapeHtml(guild.name)}</strong>
          <small>${guild.installed ? (guild.advanced ? 'Premium / référence' : 'Bot installé') : 'Autorisation requise'}</small>
        </span>
      </button>
      ${guild.installed ? '' : `<a class="button button-small" href="${escapeHtml(safeExternalUrl(guild.inviteUrl, ['discord.com']) || '#')}" target="_blank" rel="noopener">Autoriser</a>`}
    </article>
  `).join('');
}

function statusBadge(label, isReady, tone = '') {
  return `<span class="status-badge ${isReady ? 'is-ready' : 'is-warning'} ${tone}">${escapeHtml(label)}</span>`;
}

function metricCards(state) {
  const metrics = [
    ['Agents', state.summary.registeredUsers, 'Enregistrés'],
    ['En service', state.summary.activeCount, 'Actifs maintenant'],
    ['Total', state.summary.totalServiceTime, 'Cumul serveur'],
    ['Semaine', state.summary.weeklyServiceTime, '7 derniers jours']
  ];

  return `
    <div class="dashboard-metrics dashboard-kpis">
      ${metrics.map(([label, value, detail]) => `
        <article class="dashboard-kpi">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(detail)}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function resolveRole(state, roleId) {
  if (!roleId) return null;
  return (state.roles || []).find((role) => role.id === roleId) || null;
}

function resolveChannel(state, channelId) {
  if (!channelId) return null;
  return (state.channels || []).find((channel) => channel.id === channelId) || null;
}

function commandRoles(state) {
  return (state.config.commandRoleIds || [])
    .map((roleId) => resolveRole(state, roleId))
    .filter(Boolean);
}

function currentServerPreset(state) {
  return SERVER_PRESET_MAP.get(state.config.serverPreset) || SERVER_PRESET_MAP.get('standard');
}

function dashboardConfigStatus(state) {
  const serviceRole = resolveRole(state, state.config.serviceRoleId);
  const autoRole = resolveRole(state, state.config.autoRoleId);
  const logChannel = resolveChannel(state, state.config.logChannelId);
  const statusChannel = resolveChannel(state, state.config.statusChannelId);
  const allowedRoles = commandRoles(state);
  const alerts = [];

  if (!state.config.language) {
    alerts.push('Choisis la langue du serveur pour que Sentinel réponde correctement.');
  }

  if (!state.config.serviceRoleId) {
    alerts.push('Configure le rôle de service avant de publier le panneau.');
  } else if (!serviceRole) {
    alerts.push('Le rôle de service configuré n’existe plus sur Discord.');
  }

  if (!state.config.logChannelId) {
    alerts.push('Configure un salon de logs pour suivre les prises de service et les actions importantes.');
  } else if (!logChannel) {
    alerts.push('Le salon de logs configuré n’existe plus ou n’est plus textuel.');
  }

  if (state.config.statusChannelId && !statusChannel) {
    alerts.push('Le salon statut configuré n’existe plus ou n’est plus textuel.');
  }

  if (state.config.statusUpdatesEnabled && !state.config.statusChannelId) {
    alerts.push('Choisis un salon statut avant d’activer les nouveautés officielles.');
  }

  if (allowedRoles.length === 0) {
    alerts.push('Ajoute au moins un rôle autorisé pour déléguer la gestion de Sentinel au staff.');
  }

  return {
    serviceRole,
    autoRole,
    logChannel,
    statusChannel,
    allowedRoles,
    alerts,
    ready: alerts.length === 0,
    completedSteps: [
      Boolean(state.config.language),
      Boolean(serviceRole),
      Boolean(logChannel),
      allowedRoles.length > 0
    ].filter(Boolean).length
  };
}

function statusText(isReady) {
  return isReady ? 'OK' : 'À faire';
}

function configStatusCards(state) {
  const status = dashboardConfigStatus(state);
  const languageLabel = state.config.language === 'en' ? 'English' : 'Français';
  const preset = currentServerPreset(state);

  const rows = [
    {
      label: 'Profil serveur',
      value: preset.title,
      ready: true
    },
    {
      label: 'Langue du serveur',
      value: languageLabel,
      ready: Boolean(state.config.language)
    },
    {
      label: 'Rôle de service',
      value: status.serviceRole ? `@${status.serviceRole.name}` : 'Non configuré',
      ready: Boolean(status.serviceRole)
    },
    {
      label: 'Rôle automatique',
      value: state.config.autoRoleId
        ? (status.autoRole ? `@${status.autoRole.name}` : 'Rôle supprimé sur Discord')
        : 'Désactivé',
      ready: !state.config.autoRoleId || Boolean(status.autoRole)
    },
    {
      label: 'Salon de logs',
      value: status.logChannel ? `#${status.logChannel.name}` : 'Non configuré',
      ready: Boolean(status.logChannel)
    },
    {
      label: 'Rôles autorisés',
      value: status.allowedRoles.length > 0
        ? status.allowedRoles.map((role) => `@${role.name}`).join(', ')
        : 'Aucun rôle',
      ready: status.allowedRoles.length > 0
    },
    {
      label: 'Agents enregistrés',
      value: `${state.summary.registeredUsers}`,
      ready: true
    },
    {
      label: 'État global',
      value: status.ready ? 'Configuration prête' : `${status.completedSteps}/4 étapes prêtes`,
      ready: status.ready
    }
  ];

  return `
    <div class="table-shell config-table-shell">
      <table class="dashboard-table config-table">
        <thead>
          <tr>
            <th>Élément</th>
            <th>Valeur</th>
            <th>État</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.ready ? 'is-ready' : 'is-warning'}">
              <td>${escapeHtml(row.label)}</td>
              <td>${escapeHtml(row.value)}</td>
              <td>${statusBadge(statusText(row.ready), row.ready)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getPublicInviteUrl() {
  return $('[data-public-invite]')?.href || 'https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands';
}

function dossierPermissionAlert(state) {
  const checks = state.diagnostics?.checks || [];
  const missingDossierChecks = checks.filter((check) => (
    ['manageChannels', 'attachFiles'].includes(check.id)
    && !check.ok
  ));

  if (missingDossierChecks.length === 0) {
    return '';
  }

  return `
    <div class="dashboard-alert is-warning dossier-permission-alert">
      <strong>Dossiers Sentinel à vérifier</strong>
      <p>Sentinel n’a pas encore tous les droits nécessaires pour ouvrir les salons privés ou envoyer les comptes rendus.</p>
      <ul>
        ${missingDossierChecks.map((check) => `<li>${escapeHtml(check.fix || check.label)}</li>`).join('')}
      </ul>
      <p>Si Sentinel a été invité avant l’ajout des dossiers, réinvite-le avec le lien officiel ou ajoute ces permissions au rôle Sentinel.</p>
      <a class="button button-small" href="${escapeHtml(getPublicInviteUrl())}" target="_blank" rel="noopener">Réinviter Sentinel</a>
    </div>
  `;
}

const DIAGNOSTIC_LABELS = {
  ban: 'Sentinel peut bannir',
  timeout: 'Sentinel peut timeout',
  kick: 'Sentinel peut expulser',
  purge: 'Sentinel peut purger',
  manageChannels: 'Sentinel peut créer des salons',
  attachFiles: 'Sentinel peut joindre des fichiers',
  manageRoles: 'Sentinel peut gérer les rôles',
  autoRole: 'Rôle automatique d’arrivée',
  serviceRole: 'Rôle de service configuré',
  roleOrder: 'Rôle Sentinel trop bas',
  autoRoleOrder: 'Auto-rôle trop haut',
  logs: 'Salon de logs accessible'
};

const DIAGNOSTIC_FIXES = {
  ban: 'Ajoute la permission “Bannir des membres” au rôle Sentinel.',
  timeout: 'Ajoute la permission “Modérer les membres” au rôle Sentinel.',
  kick: 'Ajoute la permission “Expulser des membres” au rôle Sentinel.',
  purge: 'Ajoute la permission “Gérer les messages” au rôle Sentinel.',
  manageChannels: 'Ajoute la permission “Gérer les salons” au rôle Sentinel.',
  attachFiles: 'Ajoute la permission “Joindre des fichiers” au rôle Sentinel pour les comptes rendus.',
  manageRoles: 'Ajoute la permission “Gérer les rôles” au rôle Sentinel.',
  autoRole: 'Choisis un rôle automatique valide, ou désactive cette option.',
  serviceRole: 'Choisis le rôle de service dans l’assistant de configuration.',
  roleOrder: 'Place le rôle Sentinel au-dessus du rôle de service dans les paramètres Discord.',
  autoRoleOrder: 'Place le rôle Sentinel au-dessus du rôle automatique d’arrivée dans les paramètres Discord.',
  logs: 'Autorise Sentinel à voir et écrire dans le salon de logs.'
};

const DIAGNOSTIC_TAB_TARGETS = {
  ban: 'moderation',
  timeout: 'moderation',
  kick: 'moderation',
  purge: 'moderation',
  manageChannels: 'dossiers',
  attachFiles: 'dossiers',
  manageRoles: 'configuration',
  autoRole: 'moderation',
  serviceRole: 'setup',
  roleOrder: 'configuration',
  autoRoleOrder: 'moderation',
  logs: 'setup'
};

const DIAGNOSTIC_AREAS = {
  ban: 'Permissions',
  timeout: 'Permissions',
  kick: 'Permissions',
  purge: 'Permissions',
  manageChannels: 'Tickets',
  attachFiles: 'Tickets',
  manageRoles: 'Configuration',
  autoRole: 'Modération',
  serviceRole: 'Service',
  roleOrder: 'Configuration',
  autoRoleOrder: 'Modération',
  logs: 'Configuration'
};

function diagnosticLabelText(check) {
  return DIAGNOSTIC_LABELS[check.id] || check.label || 'Diagnostic';
}

function diagnosticFixText(check) {
  return DIAGNOSTIC_FIXES[check.id] || check.fix || 'Ouvre le diagnostic complet pour voir quoi corriger.';
}

function addResolutionItem(items, item) {
  if (!item?.title || !item?.detail) {
    return;
  }

  items.push({
    area: item.area || 'Configuration',
    title: item.title,
    detail: item.detail,
    tab: item.tab || 'configuration'
  });
}

function dedupeResolutionItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.area}|${item.title}|${item.detail}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dashboardResolutionItems(state) {
  const status = dashboardConfigStatus(state);
  const items = [];
  const coveredChecks = new Set();

  if (!state.config.language) {
    addResolutionItem(items, {
      area: 'Configuration',
      title: 'Choisir la langue',
      detail: 'Ouvre l’assistant et valide la langue utilisée par ce serveur.',
      tab: 'setup'
    });
  }

  if (!state.config.serviceRoleId) {
    coveredChecks.add('serviceRole');
    addResolutionItem(items, {
      area: 'Service',
      title: 'Configurer le rôle de service',
      detail: 'Choisis le rôle ajouté quand un membre prend son service.',
      tab: 'setup'
    });
  } else if (!status.serviceRole) {
    coveredChecks.add('serviceRole');
    addResolutionItem(items, {
      area: 'Service',
      title: 'Remplacer le rôle de service',
      detail: 'Le rôle enregistré n’existe plus sur Discord. Choisis un rôle valide.',
      tab: 'setup'
    });
  }

  if (state.config.autoRoleId && !status.autoRole) {
    coveredChecks.add('autoRole');
    addResolutionItem(items, {
      area: 'Modération',
      title: 'Corriger l’auto-rôle',
      detail: 'Le rôle automatique d’arrivée enregistré n’existe plus. Choisis un rôle valide ou désactive l’option.',
      tab: 'moderation'
    });
  }

  if (!state.config.logChannelId) {
    coveredChecks.add('logs');
    addResolutionItem(items, {
      area: 'Configuration',
      title: 'Configurer le salon de logs',
      detail: 'Choisis le salon où Sentinel publie les services, sanctions et actions importantes.',
      tab: 'setup'
    });
  } else if (!status.logChannel) {
    coveredChecks.add('logs');
    addResolutionItem(items, {
      area: 'Configuration',
      title: 'Remplacer le salon de logs',
      detail: 'Le salon enregistré n’est plus accessible. Choisis un salon textuel valide.',
      tab: 'setup'
    });
  }

  if (status.allowedRoles.length === 0) {
    addResolutionItem(items, {
      area: 'Configuration',
      title: 'Ajouter les rôles autorisés',
      detail: 'Ajoute les rôles staff qui peuvent gérer Sentinel sans passer par toi.',
      tab: 'setup'
    });
  }

  (state.diagnostics?.checks || [])
    .filter((check) => !check.ok && !coveredChecks.has(check.id))
    .forEach((check) => addResolutionItem(items, {
      area: DIAGNOSTIC_AREAS[check.id] || 'Permissions',
      title: diagnosticLabelText(check),
      detail: diagnosticFixText(check),
      tab: DIAGNOSTIC_TAB_TARGETS[check.id] || 'moderation'
    }));

  return dedupeResolutionItems(items);
}

function resolutionAssistant(state) {
  const items = dashboardResolutionItems(state);

  if (items.length === 0) {
    return `
      <div class="dashboard-alert is-ready resolution-assistant">
        <div class="resolution-heading">
          <div>
            <strong>Tout est prêt</strong>
            <p>Sentinel peut gérer ce serveur. Garde le diagnostic sous la main si Discord refuse une action.</p>
          </div>
          ${statusBadge('Prêt', true)}
        </div>
        <button class="button button-small button-ghost" type="button" data-dashboard-tab="moderation">Voir le diagnostic</button>
      </div>
    `;
  }

  const visibleItems = items.slice(0, 5);
  const hiddenCount = items.length - visibleItems.length;

  return `
    <div class="dashboard-alert is-warning resolution-assistant">
      <div class="resolution-heading">
        <div>
          <strong>À faire maintenant</strong>
          <p>Voici les points qui peuvent bloquer Sentinel. Chaque bouton t’emmène à l’endroit où les régler.</p>
        </div>
        ${statusBadge('À vérifier', false)}
      </div>
      <div class="resolution-list">
        ${visibleItems.map((item) => `
          <div class="resolution-item">
            <div class="resolution-copy">
              <span>${escapeHtml(item.area)}</span>
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.detail)}</p>
            </div>
            <button class="button button-small button-ghost" type="button" data-dashboard-tab="${escapeHtml(item.tab)}">Corriger</button>
          </div>
        `).join('')}
      </div>
      ${hiddenCount > 0 ? '<p class="resolution-more">D’autres points sont visibles dans le diagnostic complet.</p>' : ''}
    </div>
  `;
}

function recentActions(state, limit = 5) {
  const items = (state.recentActions || state.auditLogs?.items || []).slice(0, limit);

  if (items.length === 0) {
    return '<p class="muted">Aucune action récente depuis le dashboard.</p>';
  }

  return `
    <div class="table-shell">
      <table class="dashboard-table recent-action-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Résumé</th>
          </tr>
        </thead>
        <tbody>
      ${items.map((item) => `
          <tr>
            <td>${escapeHtml(formatAuditDate(item.createdAt))}</td>
            <td><strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong></td>
            <td>${escapeHtml(item.summary)}</td>
          </tr>
      `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function todayOverviewCards(state) {
  const status = dashboardConfigStatus(state);
  const alerts = dashboardResolutionItems(state);
  const lastAction = (state.recentActions || state.auditLogs?.items || [])[0] || null;
  const payroll = state.payroll || {};
  const cards = [
    {
      eyebrow: 'Configuration',
      value: status.ready ? 'Prête' : `${status.completedSteps}/4`,
      detail: status.ready ? 'Les bases sont en place.' : 'L’assistant indique ce qui manque.',
      ready: status.ready
    },
    {
      eyebrow: 'Service',
      value: state.summary.activeCount,
      detail: 'agent(s) actuellement en service.',
      ready: true
    },
    {
      eyebrow: 'Tickets',
      value: state.dossiers?.openCount || 0,
      detail: 'dossier(s) ouverts à traiter.',
      ready: true
    },
    {
      eyebrow: 'Paie RP',
      value: payroll.totals?.unpaidCount || 0,
      detail: 'ligne(s) encore à payer cette semaine.',
      ready: true
    },
    {
      eyebrow: 'Alertes',
      value: alerts.length,
      detail: alerts.length ? 'point(s) à corriger.' : 'Aucun blocage visible.',
      ready: alerts.length === 0
    },
    {
      eyebrow: 'Dernière action',
      value: lastAction ? formatAuditDate(lastAction.createdAt) : 'Aucune',
      detail: lastAction ? (AUDIT_ACTION_LABELS[lastAction.action] || lastAction.action) : 'Pas encore d’action récente.',
      ready: true
    }
  ];

  return `
    <div class="today-grid">
      ${cards.map((card) => `
        <article class="today-card ${card.ready ? 'is-ready' : 'is-warning'}">
          <span>${escapeHtml(card.eyebrow)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function planScopeCards(state) {
  return `
    <div class="plan-scope-grid">
      <article class="plan-scope-card is-free">
        <span>Gratuit actif</span>
        <strong>Les bases utiles restent accessibles</strong>
        <p>Service, paie simple, modération par ID, tickets, logs, dashboard et embeds limités.</p>
      </article>
    </div>
  `;
}

function globalLookupPanel(state) {
  const value = selectedUserProfile?.user?.id || '';

  return `
    <article class="global-lookup-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Recherche par ID</p>
          <h2>Retrouver une personne dans l’historique</h2>
          <p class="muted">Entre un ID Discord pour ouvrir la fiche liée à cette personne : heures, sanctions, tickets, paie et dernières actions.</p>
        </div>
        <span class="status-badge is-site">Historique serveur</span>
      </div>
      <form class="global-lookup-form" data-user-lookup>
        <input name="userId" placeholder="ID Discord" value="${escapeHtml(value)}" required>
        <button class="button" type="submit">Rechercher</button>
      </form>
      ${selectedUserProfile ? userProfilePanel(selectedUserProfile) : '<p class="muted">La recherche reste limitée au serveur sélectionné. Rien n’est affiché publiquement.</p>'}
    </article>
  `;
}

function renderServerHome(state, premiumBadge) {
  const status = dashboardConfigStatus(state);

  return `
    <section class="dashboard-panel server-home pro-dashboard-home">
      <div class="dashboard-command-bar">
        <div>
          <p class="eyebrow">Accueil serveur</p>
          <h2>${escapeHtml(state.guild.name)}</h2>
        </div>
        <div class="command-bar-status">
          ${statusBadge(status.ready ? 'Opérationnel' : `${status.completedSteps}/4 à finaliser`, status.ready)}
          ${premiumBadge}
        </div>
      </div>
      ${todayOverviewCards(state)}
      ${dashboardPath(state)}
      ${planScopeCards(state)}
      <div class="server-home-grid pro-home-grid">
        <article class="home-block home-block-config">
          <div class="home-block-heading">
            <h3>Configuration</h3>
            <button class="button button-small button-ghost" type="button" data-dashboard-tab="configuration">Ouvrir</button>
          </div>
          ${configStatusCards(state)}
        </article>
        <article class="home-block">
          <h3>Alertes</h3>
          ${resolutionAssistant(state)}
        </article>
        <article class="home-block">
          <div class="home-block-heading">
            <h3>Dernières actions</h3>
            <button class="button button-small button-ghost" type="button" data-dashboard-tab="audit">Historique</button>
          </div>
          ${recentActions(state)}
        </article>
      </div>
    </section>
  `;
}

function premiumNavigationCards() {
  const modules = [
    ['service', 'Service et paie', 'Taux par grade, ajustements, archives longues et synchronisation.'],
    ['dossiers', 'Dossiers', 'Panneaux illimités, catégories dédiées et suivi étendu.'],
    ['moderation', 'Sécurité', 'Veille renforcée, sanctions avancées et protection automatique.'],
    ['embeds', 'Annonces', 'Créations illimitées et gestion complète des médias.'],
    ['audit', 'Historique', 'Filtres avancés, recherche individuelle et journal étendu.']
  ];

  return `
    <div class="premium-module-grid">
      ${modules.map(([tab, title, description]) => `
        <article class="premium-module-card">
          <span>Module Premium</span>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(description)}</p>
          <button class="button button-small" type="button" data-dashboard-tab="${escapeHtml(tab)}">Ouvrir</button>
        </article>
      `).join('')}
    </div>
  `;
}

function renderPremiumHome(state, premiumBadge) {
  const payrollArchives = state.payrollArchives?.totalCount || 0;
  const managedEmbeds = state.customEmbeds?.items?.length || 0;
  const openDossiers = state.dossiers?.openCount || 0;

  return `
    <section class="dashboard-panel premium-view-panel premium-home-panel">
      <div class="dashboard-command-bar">
        <div>
          <p class="eyebrow">Espace Premium</p>
          <h2>${escapeHtml(state.guild.name)}</h2>
          <p class="muted">Seuls les outils réservés au Premium sont affichés dans cette vue.</p>
        </div>
        <div class="command-bar-status">${premiumBadge}</div>
      </div>
      <div class="dashboard-metrics premium-view-metrics">
        <article><span>Archives de paie</span><strong>${escapeHtml(payrollArchives)}</strong></article>
        <article><span>Annonces gérées</span><strong>${escapeHtml(managedEmbeds)}</strong></article>
        <article><span>Dossiers ouverts</span><strong>${escapeHtml(openDossiers)}</strong></article>
        <article><span>Protection</span><strong>Renforcée</strong></article>
      </div>
      ${premiumNavigationCards()}
    </section>
  `;
}

function renderPremiumSetupPanel(state, premiumBadge) {
  return `
    <section class="dashboard-panel premium-view-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Mise en place Premium</p>
          <h2>Préparer les modules avancés</h2>
          <p class="muted">Cette page ne présente que les espaces réservés au Premium. Les réglages généraux restent dans leur espace dédié.</p>
        </div>
        ${premiumBadge}
      </div>
      ${premiumNavigationCards()}
    </section>
  `;
}

function renderPremiumConfigurationPanel(state, premiumBadge) {
  const premiumStatus = [
    ['Accès Premium', state.advanced ? 'Actif' : 'Inactif'],
    ['Panneaux dossiers', state.dossiers?.panelQuota?.unlimited ? 'Illimités' : 'Non disponible'],
    ['Annonces Sentinel', state.customEmbeds?.quota?.unlimited ? 'Illimitées' : 'Non disponible'],
    ['Historique avancé', state.advanced ? 'Disponible' : 'Non disponible']
  ];

  return `
    <section class="dashboard-panel premium-view-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Réglages Premium</p>
          <h2>Modules avancés</h2>
          <p class="muted">Les configurations Premium sont rangées dans leur module afin de ne pas se mélanger aux réglages gratuits.</p>
        </div>
        ${premiumBadge}
      </div>
      <dl class="config-summary-list premium-config-summary">
        ${premiumStatus.map(([label, value]) => `
          <div class="config-summary-row is-ready"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
        `).join('')}
      </dl>
      ${premiumNavigationCards()}
    </section>
  `;
}

function dashboardPath(state) {
  const status = dashboardConfigStatus(state);
  const preset = currentServerPreset(state);
  const items = [
    {
      step: '01',
      title: status.ready ? 'Configuration prête' : 'Finaliser les bases',
      detail: status.ready
        ? 'Langue, service, logs et accès staff sont en place.'
        : 'Commence par l’assistant pour régler la langue, le rôle de service, les logs et les accès staff.',
      tab: status.ready ? 'configuration' : 'setup',
      label: status.ready ? 'Relire' : 'Commencer'
    },
    {
      step: '02',
      title: 'Gérer les services',
      detail: 'Suis les agents en service, les heures, la paie RP et les paiements de la semaine.',
      tab: 'service',
      label: 'Ouvrir'
    },
    {
      step: '03',
      title: 'Traiter les tickets',
      detail: 'Publie le bureau d’accueil et garde les demandes privées au même endroit.',
      tab: 'dossiers',
      label: 'Ouvrir'
    },
    {
      step: '04',
      title: 'Contrôler le serveur',
      detail: 'Modère par ID, vérifie les permissions et retrouve les actions dans l’historique.',
      tab: 'moderation',
      label: 'Ouvrir'
    }
  ];

  return `
    <article class="dashboard-path">
      <div class="home-block-heading">
        <div>
          <p class="eyebrow">Parcours conseillé</p>
          <h3>${escapeHtml(preset.title)}</h3>
        </div>
        <button class="button button-small button-ghost" type="button" data-dashboard-tab="setup">Personnaliser</button>
      </div>
      <div class="dashboard-path-grid">
        ${items.map((item) => `
          <div class="dashboard-path-card">
            <span>${escapeHtml(item.step)}</span>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail)}</p>
            <button class="button button-small button-ghost" type="button" data-dashboard-tab="${escapeHtml(item.tab)}">${escapeHtml(item.label)}</button>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function setupStep({ index, title, description, done, current, content }) {
  return `
    <article class="setup-step ${done ? 'is-done' : 'is-pending'}">
      <div class="setup-step-heading">
        <span class="setup-index">${index}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
          <small>${escapeHtml(current)}</small>
        </div>
        <strong>${done ? 'Prêt' : 'À configurer'}</strong>
      </div>
      ${content}
    </article>
  `;
}

function serverPresetSelector(state) {
  const activePreset = currentServerPreset(state);

  return `
    <article class="server-preset-panel">
      <div class="panel-mini-heading">
        <div>
          <p class="eyebrow">Profil du serveur</p>
          <h3>Personnaliser les conseils</h3>
          <p class="muted">Optionnel : choisis le profil le plus proche de ton Discord pour afficher des conseils adaptés, sans remplacer les réglages de base.</p>
        </div>
        ${statusBadge(activePreset.title, true)}
      </div>
      <div class="server-preset-grid">
        ${SERVER_PRESETS.map((preset) => {
          const active = preset.id === activePreset.id;

          return `
            <form class="server-preset-card ${active ? 'is-active' : ''}" data-action-form="set-server-preset">
              <input type="hidden" name="preset" value="${escapeHtml(preset.id)}">
              <span>${escapeHtml(preset.eyebrow)}</span>
              <strong>${escapeHtml(preset.title)}</strong>
              <p>${escapeHtml(preset.summary)}</p>
              <button class="button button-small ${active ? 'button-ghost' : ''}" type="submit" ${active ? 'disabled' : ''}>${active ? 'Actif' : 'Choisir'}</button>
            </form>
          `;
        }).join('')}
      </div>
      <div class="server-preset-advice">
        <strong>Conseils pour ce profil</strong>
        <ul>
          ${activePreset.advice.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    </article>
  `;
}

function renderSetupAssistant(state, roleOptions, commandRoleOptions, channelOptions) {
  const status = dashboardConfigStatus(state);
  const languageLabel = state.config.language === 'en' ? 'English' : 'Français';
  const serviceRoleLabel = status.serviceRole ? `@${status.serviceRole.name}` : 'Aucun rôle choisi';
  const logChannelLabel = status.logChannel ? `#${status.logChannel.name}` : 'Aucun salon choisi';
  const commandRolesLabel = status.allowedRoles.length > 0
    ? status.allowedRoles.map((role) => `@${role.name}`).join(', ')
    : 'Aucun rôle staff autorisé';

  return `
    <section class="dashboard-panel setup-assistant">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Assistant</p>
          <h2>Configurer Sentinel en 4 étapes</h2>
          <p class="muted">Suis ces étapes dans l’ordre. Chaque validation met directement à jour ce serveur Discord.</p>
        </div>
        <span class="setup-progress">${status.completedSteps}/4</span>
      </div>
      <div class="setup-steps">
        ${setupStep({
          index: '01',
          title: 'Choisir la langue',
          description: 'Définit la langue utilisée par Sentinel sur ce serveur.',
          done: Boolean(state.config.language),
          current: `Actuel : ${languageLabel}`,
          content: `
            <form data-action-form="set-language">
              <select name="language">
                <option value="fr"${state.config.language === 'fr' ? ' selected' : ''}>Français</option>
                <option value="en"${state.config.language === 'en' ? ' selected' : ''}>English</option>
              </select>
              <button class="button" type="submit">Valider la langue</button>
            </form>
          `
        })}
        ${setupStep({
          index: '02',
          title: 'Choisir le rôle de service',
          description: 'Ce rôle sera ajouté quand un membre prend son service, puis retiré à la fin.',
          done: Boolean(status.serviceRole),
          current: `Actuel : ${serviceRoleLabel}`,
          content: `
            <form data-action-form="set-service-role">
              <select name="roleId">${roleOptions}</select>
              <button class="button" type="submit">Configurer le rôle</button>
            </form>
          `
        })}
        ${setupStep({
          index: '03',
          title: 'Choisir le salon de logs',
          description: 'Sentinel y publiera les prises de service, fins de service et actions importantes.',
          done: Boolean(status.logChannel),
          current: `Actuel : ${logChannelLabel}`,
          content: `
            <form data-action-form="set-log-channel">
              <select name="channelId">${channelOptions}</select>
              <button class="button" type="submit">Configurer les logs</button>
            </form>
          `
        })}
        ${setupStep({
          index: '04',
          title: 'Ajouter les rôles autorisés',
          description: 'Ces rôles pourront gérer Sentinel depuis Discord et depuis le dashboard.',
          done: status.allowedRoles.length > 0,
          current: `Actuel : ${commandRolesLabel}`,
          content: `
            <form data-action-form="add-command-role">
              <select name="roleId">${commandRoleOptions}</select>
              <button class="button" type="submit">Autoriser ce rôle</button>
            </form>
          `
        })}
      </div>
      ${serverPresetSelector(state)}
      <div class="setup-footer">
        ${status.ready
          ? '<p>Configuration complète. Tu peux publier le panneau de service ou gérer le serveur depuis les autres onglets.</p>'
          : '<p>Quand les 4 étapes sont prêtes, Sentinel peut être utilisé proprement par le staff et les membres.</p>'}
        <button class="button button-ghost" type="button" data-dashboard-tab="configuration">Voir les réglages avancés</button>
      </div>
    </section>
  `;
}

function configSummaryList(state) {
  const status = dashboardConfigStatus(state);
  const languageLabel = state.config.language === 'en' ? 'English' : 'Français';
  const preset = currentServerPreset(state);
  const rows = [
    {
      label: 'Profil',
      value: preset.title,
      ready: true
    },
    {
      label: 'Langue',
      value: languageLabel,
      ready: Boolean(state.config.language)
    },
    {
      label: 'Rôle de service',
      value: status.serviceRole ? `@${status.serviceRole.name}` : 'Non configuré',
      ready: Boolean(status.serviceRole)
    },
    {
      label: 'Salon de logs',
      value: status.logChannel ? `#${status.logChannel.name}` : 'Non configuré',
      ready: Boolean(status.logChannel)
    },
    {
      label: 'Salon statut',
      value: status.statusChannel ? `#${status.statusChannel.name}` : 'Optionnel',
      ready: !state.config.statusChannelId || Boolean(status.statusChannel)
    },
    {
      label: 'Nouveautés',
      value: state.config.statusUpdatesEnabled ? 'Activées' : 'Désactivées',
      ready: !state.config.statusUpdatesEnabled || Boolean(status.statusChannel)
    },
    {
      label: 'Rôles staff',
      value: status.allowedRoles.length > 0
        ? status.allowedRoles.map((role) => `@${role.name}`).join(', ')
        : 'Aucun rôle staff autorisé',
      ready: status.allowedRoles.length > 0
    }
  ];

  return `
    <dl class="config-summary-list">
      ${rows.map((row) => `
        <div class="config-summary-row ${row.ready ? 'is-ready' : 'is-warning'}">
          <dt>${escapeHtml(row.label)}</dt>
          <dd>${escapeHtml(row.value)}</dd>
        </div>
      `).join('')}
    </dl>
  `;
}

function renderConfigurationHub(state, channelOptions, statusChannelOptions) {
  const status = dashboardConfigStatus(state);
  const statusChannelLabel = status.statusChannel ? `#${status.statusChannel.name}` : 'Aucun salon statut choisi';
  const statusUpdatesLabel = state.config.statusUpdatesEnabled ? 'activées' : 'désactivées';
  const statusUpdatesNextEnabled = state.config.statusUpdatesEnabled ? 'false' : 'true';

  return `
    <section class="dashboard-panel config-hub" id="configuration">
      <div class="panel-heading">
        <p class="eyebrow">Configuration</p>
        <h2>Réglages avancés</h2>
        <p class="muted">Ici, tu retrouves les actions utiles après la première installation. Les réglages de base restent dans l’assistant pour garder un parcours simple.</p>
      </div>
      <div class="config-hub-grid">
        <article class="config-hub-card">
          <h3>Réglages de base</h3>
          <p>Ces réglages se modifient dans l’assistant, pour garder un parcours simple et éviter les erreurs.</p>
          ${configSummaryList(state)}
          <button class="button button-ghost" type="button" data-dashboard-tab="setup">Ouvrir l’assistant de configuration</button>
        </article>
        <article class="config-hub-card">
          <h3>Bureau de service</h3>
          <p>Publie ou republie le bureau où les agents ouvrent leur poste, le clôturent et consultent le déploiement.</p>
          <form data-action-form="publish-service-panel">
            ${labelHelp('Salon de publication', 'Salon dans lequel Sentinel déposera le Bureau de service et ses boutons de présence.')}
            <select name="channelId">${channelOptions}</select>
            <button class="button" type="submit">Publier le bureau</button>
          </form>
        </article>
        <article class="config-hub-card">
          <h3>Salon statut</h3>
          <p>Ce salon affiche l’état automatique de Sentinel. Les nouveautés officielles ne sont envoyées que si tu les actives.</p>
          <p class="muted">Actuel : ${escapeHtml(statusChannelLabel)}. Mises à jour officielles : ${escapeHtml(statusUpdatesLabel)}.</p>
          <form data-action-form="set-status-channel">
            ${labelHelp('Salon statut', 'Sentinel y maintient un panneau d’état : bot en ligne, latence, données internes et dernière synchronisation.')}
            <select name="channelId">${statusChannelOptions}</select>
            <button class="button" type="submit">Publier le statut</button>
          </form>
          <div class="split-actions">
            <form data-action-form="set-status-updates">
              <input type="hidden" name="enabled" value="${statusUpdatesNextEnabled}">
              <button class="button button-ghost" type="submit" ${state.config.statusChannelId ? '' : 'disabled'}>
                ${state.config.statusUpdatesEnabled ? 'Couper les nouveautés' : 'Recevoir les nouveautés'}
              </button>
            </form>
            <form data-action-form="disable-status-channel">
              <button class="button button-ghost" type="submit" ${state.config.statusChannelId ? '' : 'disabled'}>Désactiver</button>
            </form>
          </div>
        </article>
      </div>
      <div class="command-roles">
        <h3>Permissions staff ${helpTip('Liste des rôles qui peuvent gérer Sentinel. Pour ajouter un rôle, utilise l’étape 4 de l’assistant.')}</h3>
        <div class="role-chip-row">${commandRoleList(state)}</div>
        <button class="button button-small" type="button" data-dashboard-tab="setup">Gérer dans l’assistant</button>
      </div>
      ${status.ready
        ? '<div class="dashboard-alert is-ready"><strong>Configuration prête</strong><p>Tu peux publier le panneau ou continuer avec les autres onglets.</p></div>'
        : '<div class="dashboard-alert is-warning"><strong>Configuration incomplète</strong><p>Termine l’assistant avant de publier le panneau pour éviter un bouton inutilisable.</p><button class="button button-small" type="button" data-dashboard-tab="setup">Ouvrir l’assistant</button></div>'}
    </section>
  `;
}

function commandRoleList(state) {
  const roles = (state.config.commandRoleIds || [])
    .map((roleId) => (state.roles || []).find((role) => role.id === roleId))
    .filter(Boolean);

  if (roles.length === 0) {
    return '<p class="muted">Aucun rôle autorisé n’est configuré. Le démarrage sécurisé reste actif.</p>';
  }

  return roles.map((role) => `
    <span class="role-chip">
      ${escapeHtml(role.name)}
      <button type="button" data-action-click="remove-command-role" data-role-id="${role.id}">Retirer</button>
    </span>
  `).join('');
}

function activeServices(state) {
  const services = state.activeServices || [];

  if (services.length === 0) {
    return '<p class="muted">Aucun agent en service.</p>';
  }

  return `
    <ul class="compact-list">
      ${services.map((service) => `<li><code>${escapeHtml(service.userId)}</code><span>${escapeHtml(service.durationLabel)}</span></li>`).join('')}
    </ul>
  `;
}

function topService(state) {
  const users = state.topService || [];

  if (users.length === 0) {
    return '<p class="muted">Aucun temps enregistré.</p>';
  }

  return `
    <ul class="compact-list">
      ${users.map((user, index) => `<li><code>#${index + 1} ${escapeHtml(user.userId)}</code><span>${escapeHtml(user.totalTimeLabel)}</span></li>`).join('')}
    </ul>
  `;
}

function ratioPercent(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return Math.max(4, Math.min(100, Math.round((value / max) * 100)));
}

function applyDeferredStyles(root = document) {
  root.querySelectorAll('[data-chart-width]').forEach((bar) => {
    const width = Math.max(0, Math.min(100, Number(bar.dataset.chartWidth) || 0));
    bar.style.width = `${width}%`;
  });
}

function leaderboardChart(items = [], emptyText = 'Aucune donnée à afficher.') {
  const rows = items.slice(0, 6);

  if (rows.length === 0) {
    return `<p class="muted">${escapeHtml(emptyText)}</p>`;
  }

  const max = Math.max(...rows.map((item) => Number(item.totalTime) || 0), 1);

  return `
    <div class="service-chart">
      ${rows.map((item, index) => `
        <div class="service-chart-row">
          <span class="chart-rank">#${index + 1}</span>
          <span class="chart-user">${escapeHtml(item.userId)}</span>
          <span class="chart-bar"><i data-chart-width="${escapeHtml(ratioPercent(Number(item.totalTime) || 0, max))}"></i></span>
          <strong>${escapeHtml(item.totalTimeLabel || '0h 0min')}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function activeServicesPanel(state) {
  const services = (state.activeServices || []).slice(0, 8);

  if (services.length === 0) {
    return `
      <div class="service-empty">
        <strong>Aucun agent en service</strong>
        <p>Quand un membre prend son service, il apparaît ici avec la durée en cours.</p>
      </div>
    `;
  }

  return `
    <div class="active-service-grid">
      ${services.map((service) => `
        <article>
          <span>Agent</span>
          <strong>${escapeHtml(service.userId)}</strong>
          <small>${escapeHtml(service.durationLabel)}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function formatSessionDate(value) {
  if (!value) {
    return 'Date inconnue';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function personalHistory(state) {
  const personal = state.personalService;

  if (!personal) {
    return '<p class="muted">Connecte-toi avec Discord pour voir ton historique personnel.</p>';
  }

  const sessions = personal.sessions || [];

  return `
    <div class="personal-service">
      <div class="personal-service-head">
        <div>
          <span>Total personnel</span>
          <strong>${escapeHtml(personal.totalTimeLabel)}</strong>
        </div>
        <div>
          <span>Statut</span>
          <strong>${personal.active ? 'En service' : 'Hors service'}</strong>
          ${personal.activeDurationLabel ? `<small>${escapeHtml(personal.activeDurationLabel)}</small>` : ''}
        </div>
        <div>
          <span>Sessions</span>
          <strong>${escapeHtml(personal.sessionCount)}</strong>
        </div>
      </div>
      ${sessions.length === 0
        ? '<p class="muted">Aucune session terminée pour ton compte sur ce serveur.</p>'
        : `<ul class="session-list">
            ${sessions.map((session) => `
              <li>
                <span>${escapeHtml(formatSessionDate(session.date))}</span>
                <strong>${escapeHtml(session.durationLabel)}</strong>
              </li>
            `).join('')}
          </ul>`}
    </div>
  `;
}

function premiumServiceRoadmap(state, premiumTag) {
  const disabled = state.advanced ? '' : ' aria-disabled="true"';
  const items = [
    ['Top mois', 'Classement mensuel pour suivre les agents les plus actifs sur une période longue.'],
    ['Top année', 'Vision annuelle utile pour les grandes communautés et les bilans staff.'],
    ['Exports CSV/PDF', 'Export des heures, sessions et classements pour archivage ou partage externe.'],
    ['Rapports automatiques', 'Résumés hebdomadaires ou mensuels publiés automatiquement dans un salon choisi.']
  ];

  return `
    <div class="service-roadmap">
      ${items.map(([title, text]) => `
        <article${disabled}>
          <span>${premiumTag}</span>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(text)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function payrollCopy() {
  const isEnglish = document.documentElement.lang === 'en';

  return isEnglish
    ? {
        eyebrow: 'RP payroll',
        title: 'Weekly pay tracking',
        description: 'Set the free hourly amount, review role rates, add Premium adjustments, and mark who has been paid.',
        rateLabel: 'Hourly amount',
        rateHelp: 'Amount used to calculate the estimated RP pay from completed sessions and current duty time.',
        currencyLabel: 'Currency / unit',
        currencyHelp: 'Short label displayed after the amount, for example $, €, credits, or SA$.',
        update: 'Update pay settings',
        roleRates: 'Premium role rates',
        roleRatesHelp: 'A member uses the highest configured rate among their current Discord roles. If no role matches, Sentinel uses the global rate.',
        roleLabel: 'Discord role',
        roleRateLabel: 'Role hourly amount',
        setRoleRate: 'Save role rate',
        removeRoleRate: 'Remove',
        roleRatesEmpty: 'No specific role rate yet.',
        adjustments: 'Premium adjustments',
        adjustmentsHelp: 'Add a bonus, deduction, or correction for the current week without changing the recorded hours.',
        userId: 'User ID',
        type: 'Type',
        bonus: 'Bonus',
        deduction: 'Deduction',
        correction: 'Correction',
        amount: 'Amount',
        reason: 'Reason',
        addAdjustment: 'Add adjustment',
        adjustmentsEmpty: 'No adjustment for this week.',
        archive: 'Archive week',
        archiveHelp: 'Saves a snapshot of the current week: hours, amounts, paid status, and adjustments.',
        archiveButton: 'Archive this week',
        updateArchiveButton: 'Refresh this archive',
        currentArchive: 'This week was archived on',
        historyTitle: 'Payroll archives',
        historyEyebrow: 'Ledger',
        historyHelp: 'Review prior periods, find an agent, and continue payment tracking without changing frozen hours or amounts.',
        historySearch: 'Search by period, agent, or Discord ID',
        historyStatus: 'Payment status',
        historyAll: 'All periods',
        historyOpen: 'Payment pending',
        historySettled: 'Fully paid',
        historyCount: 'archived period(s)',
        historyEmpty: 'No payroll period has been archived yet.',
        historyNoMatch: 'No archive matches these filters.',
        archivedOn: 'Archived on',
        archivedBy: 'Archived by',
        lastActivity: 'Last activity',
        paymentProgress: 'Payment progress',
        paymentJournal: 'Payment journal',
        paymentJournalEmpty: 'No status change has been recorded for this period yet.',
        markedPaid: 'marked as paid',
        markedUnpaid: 'returned to pending',
        clearFilters: 'Clear filters',
        filterButton: 'Filter',
        loadMoreArchives: 'Load older periods',
        summary: 'Weekly summary',
        week: 'Current week',
        agents: 'Agents',
        totalHours: 'Total hours',
        hourlyRate: 'Rate',
        basePay: 'Base pay',
        adjustmentTotal: 'Adjustments',
        estimatedPay: 'Estimated pay',
        toPay: 'To pay',
        alreadyPaid: 'Already paid',
        status: 'Status',
        paid: 'Paid',
        unpaid: 'To pay',
        markPaid: 'Mark paid',
        markUnpaid: 'Mark unpaid',
        paidBy: 'Paid by',
        empty: 'No service time recorded for the current week.',
        note: 'This is an internal RP tracking tool. Sentinel does not process real payments.',
        premiumOnly: 'Premium option'
      }
    : {
        eyebrow: 'Paie RP',
        title: 'Suivi hebdomadaire des paiements',
        description: 'Règle le montant gratuit, consulte les taux par rôle, ajoute des ajustements Premium et coche qui a été payé.',
        rateLabel: 'Montant par heure',
        rateHelp: 'Montant utilisé pour calculer la paie RP estimée à partir des sessions terminées et du service en cours.',
        currencyLabel: 'Devise / unité',
        currencyHelp: 'Texte court affiché après le montant, par exemple $, €, crédits ou SA$.',
        update: 'Mettre à jour la paie',
        roleRates: 'Taux par rôle Premium',
        roleRatesHelp: 'Un membre utilise le meilleur taux configuré parmi ses rôles Discord actuels. Si aucun rôle ne correspond, Sentinel utilise le taux global.',
        roleLabel: 'Rôle Discord',
        roleRateLabel: 'Montant par heure du rôle',
        setRoleRate: 'Enregistrer le taux',
        removeRoleRate: 'Retirer',
        roleRatesEmpty: 'Aucun taux spécifique configuré pour le moment.',
        adjustments: 'Ajustements Premium',
        adjustmentsHelp: 'Ajoute une prime, une retenue ou une correction sur la semaine en cours sans modifier les heures enregistrées.',
        userId: 'ID utilisateur',
        type: 'Type',
        bonus: 'Prime',
        deduction: 'Retenue',
        correction: 'Correction',
        amount: 'Montant',
        reason: 'Raison',
        addAdjustment: 'Ajouter l’ajustement',
        adjustmentsEmpty: 'Aucun ajustement sur cette semaine.',
        archive: 'Archiver la semaine',
        archiveHelp: 'Enregistre une capture de la semaine : heures, montants, état payé/non payé et ajustements.',
        archiveButton: 'Archiver cette semaine',
        updateArchiveButton: 'Actualiser cette archive',
        currentArchive: 'Cette semaine a été archivée le',
        historyTitle: 'Archives de paie',
        historyEyebrow: 'Registre',
        historyHelp: 'Retrouve les périodes précédentes, cherche un agent et poursuis le suivi des règlements sans modifier les heures ni les montants figés.',
        historySearch: 'Rechercher une période, un agent ou un ID Discord',
        historyStatus: 'État des règlements',
        historyAll: 'Toutes les périodes',
        historyOpen: 'Paiements en attente',
        historySettled: 'Entièrement réglées',
        historyCount: 'période(s) archivée(s)',
        historyEmpty: 'Aucune période de paie n’a encore été archivée.',
        historyNoMatch: 'Aucune archive ne correspond à ces filtres.',
        archivedOn: 'Archivée le',
        archivedBy: 'Archivée par',
        lastActivity: 'Dernière activité',
        paymentProgress: 'Avancement des règlements',
        paymentJournal: 'Journal des règlements',
        paymentJournalEmpty: 'Aucun changement d’état n’a encore été enregistré pour cette période.',
        markedPaid: 'a marqué la paie comme réglée',
        markedUnpaid: 'a remis la paie en attente',
        clearFilters: 'Effacer les filtres',
        filterButton: 'Filtrer',
        loadMoreArchives: 'Charger les périodes plus anciennes',
        summary: 'Résumé semaine',
        week: 'Semaine en cours',
        agents: 'Agents',
        totalHours: 'Heures totales',
        hourlyRate: 'Taux',
        basePay: 'Base',
        adjustmentTotal: 'Ajustements',
        estimatedPay: 'Paie estimée',
        toPay: 'À payer',
        alreadyPaid: 'Déjà payé',
        status: 'État',
        paid: 'Payé',
        unpaid: 'À payer',
        markPaid: 'Marquer payé',
        markUnpaid: 'Remettre à payer',
        paidBy: 'Payé par',
        empty: 'Aucune heure de service enregistrée sur la semaine en cours.',
        note: 'Ce suivi reste interne au RP. Sentinel ne traite aucun paiement réel.',
        premiumOnly: 'Option Premium'
      };
}

function payrollSummaryCards(payroll, copy) {
  const cards = [
    [copy.week, `${payroll.weekStart} → ${payroll.weekEnd}`],
    [copy.agents, payroll.totals?.userCount || 0],
    [copy.totalHours, payroll.totals?.totalTimeLabel || '0h 0min 0s'],
    [copy.estimatedPay, payroll.totals?.totalAmountLabel || `0 ${payroll.settings?.currency || '$'}`],
    [copy.adjustmentTotal, payroll.totals?.adjustmentAmountLabel || `0 ${payroll.settings?.currency || '$'}`],
    [copy.toPay, payroll.totals?.unpaidAmountLabel || `0 ${payroll.settings?.currency || '$'}`],
    [copy.alreadyPaid, payroll.totals?.paidAmountLabel || `0 ${payroll.settings?.currency || '$'}`]
  ];

  return `
    <div class="payroll-summary">
      ${cards.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function payrollTable(payroll, copy) {
  const items = payroll.items || [];

  if (items.length === 0) {
    return `<p class="muted">${escapeHtml(copy.empty)}</p>`;
  }

  return `
    <div class="table-shell payroll-table-shell">
      <table class="dashboard-table payroll-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>${escapeHtml(copy.totalHours)}</th>
            <th>${escapeHtml(copy.hourlyRate)}</th>
            <th>${escapeHtml(copy.basePay)}</th>
            <th>${escapeHtml(copy.adjustmentTotal)}</th>
            <th>${escapeHtml(copy.estimatedPay)}</th>
            <th>${escapeHtml(copy.status)}</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const nextPaid = item.paid ? 'false' : 'true';
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(item.displayName || item.username || item.userId)}</strong>
                  <small><code>${escapeHtml(item.userId)}</code></small>
                </td>
                <td><strong>${escapeHtml(item.totalTimeLabel)}</strong></td>
                <td>
                  <strong>${escapeHtml(item.hourlyRateLabel || '')}</strong>
                  ${item.payrollRoleName ? `<small>${escapeHtml(item.payrollRoleName)}</small>` : ''}
                </td>
                <td>${escapeHtml(item.baseAmountLabel || item.amountLabel)}</td>
                <td>
                  <strong>${escapeHtml(item.adjustmentAmountLabel || `0 ${payroll.settings?.currency || '$'}`)}</strong>
                  ${item.adjustments?.length ? `<small>${escapeHtml(item.adjustments.length)} ligne(s)</small>` : ''}
                </td>
                <td><strong>${escapeHtml(item.amountLabel)}</strong></td>
                <td>
                  ${statusBadge(item.paid ? copy.paid : copy.unpaid, item.paid)}
                  ${item.paidAt ? `<small>${escapeHtml(formatSessionDate(item.paidAt))}</small>` : ''}
                  ${item.paidByUserId ? `<small>${escapeHtml(copy.paidBy)} : ${escapeHtml(item.paidByUserId)}</small>` : ''}
                </td>
                <td>
                  <form class="table-action-form payroll-action-form" data-action-form="toggle-payroll-paid">
                    <input type="hidden" name="userId" value="${escapeHtml(item.userId)}">
                    <input type="hidden" name="weekStart" value="${escapeHtml(payroll.weekStart)}">
                    <input type="hidden" name="paid" value="${nextPaid}">
                    <button class="button button-small${item.paid ? ' button-ghost' : ''}" type="submit">${escapeHtml(item.paid ? copy.markUnpaid : copy.markPaid)}</button>
                  </form>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function payrollRoleRatesList(payroll, copy) {
  const items = payroll.roleSettings || [];

  if (!items.length) {
    return `<p class="muted">${escapeHtml(copy.roleRatesEmpty)}</p>`;
  }

  return `
    <div class="compact-record-list payroll-role-rates">
      ${items.map((item) => `
        <article>
          <div>
            <strong>${escapeHtml(item.roleName || item.roleId)}</strong>
            <small>${escapeHtml(item.hourlyRateLabel || item.hourlyRate)}</small>
          </div>
          <form class="table-action-form" data-action-form="remove-payroll-role-rate">
            <input type="hidden" name="roleId" value="${escapeHtml(item.roleId)}">
            <button class="button button-small button-ghost" type="submit">${escapeHtml(copy.removeRoleRate)}</button>
          </form>
        </article>
      `).join('')}
    </div>
  `;
}

function payrollAdjustmentList(payroll, copy) {
  const adjustments = payroll.adjustments || [];

  if (!adjustments.length) {
    return `<p class="muted">${escapeHtml(copy.adjustmentsEmpty)}</p>`;
  }

  return `
    <div class="compact-record-list payroll-adjustments">
      ${adjustments.slice(0, 8).map((item) => `
        <article>
          <div>
            <strong><code>${escapeHtml(item.userId)}</code> ${escapeHtml(item.amountLabel || item.amount)}</strong>
            <small>${escapeHtml(item.label || item.type)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ''}</small>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function normalizePayrollSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function payrollArchiveTable(archive, copy) {
  const items = archive.items || [];

  if (!items.length) {
    return `<p class="muted">${escapeHtml(copy.empty)}</p>`;
  }

  return `
    <div class="table-shell payroll-table-shell">
      <table class="dashboard-table payroll-table payroll-archive-table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>${escapeHtml(copy.totalHours)}</th>
            <th>${escapeHtml(copy.hourlyRate)}</th>
            <th>${escapeHtml(copy.basePay)}</th>
            <th>${escapeHtml(copy.adjustmentTotal)}</th>
            <th>${escapeHtml(copy.estimatedPay)}</th>
            <th>${escapeHtml(copy.status)}</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const nextPaid = item.paid ? 'false' : 'true';
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(item.displayName || item.username || item.userId)}</strong>
                  <small><code>${escapeHtml(item.userId)}</code></small>
                </td>
                <td><strong>${escapeHtml(item.totalTimeLabel)}</strong></td>
                <td>
                  <strong>${escapeHtml(item.hourlyRateLabel || '')}</strong>
                  ${item.payrollRoleName ? `<small>${escapeHtml(item.payrollRoleName)}</small>` : ''}
                </td>
                <td>${escapeHtml(item.baseAmountLabel || item.amountLabel)}</td>
                <td><strong>${escapeHtml(item.adjustmentAmountLabel || '')}</strong></td>
                <td><strong>${escapeHtml(item.amountLabel)}</strong></td>
                <td>
                  ${statusBadge(item.paid ? copy.paid : copy.unpaid, item.paid)}
                  ${item.updatedAt ? `<small>${escapeHtml(formatSessionDate(item.updatedAt))}</small>` : ''}
                  ${item.statusChangedByUserId ? `<small>${escapeHtml(copy.paidBy)} : ${escapeHtml(item.statusChangedByUserId)}</small>` : ''}
                </td>
                <td>
                  <form class="table-action-form payroll-action-form" data-action-form="toggle-payroll-paid" data-payroll-archive-week="${escapeHtml(archive.weekStart)}">
                    <input type="hidden" name="userId" value="${escapeHtml(item.userId)}">
                    <input type="hidden" name="weekStart" value="${escapeHtml(archive.weekStart)}">
                    <input type="hidden" name="paid" value="${nextPaid}">
                    <button class="button button-small${item.paid ? ' button-ghost' : ''}" type="submit">${escapeHtml(item.paid ? copy.markUnpaid : copy.markPaid)}</button>
                  </form>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function payrollArchiveJournal(archive, copy) {
  const events = archive.events || [];

  if (!events.length) {
    return `<p class="muted">${escapeHtml(copy.paymentJournalEmpty)}</p>`;
  }

  return `
    <ol class="payroll-event-list">
      ${events.map((event) => {
        const actor = event.changedByDisplayName || event.changedByUserId || 'Sentinel';
        const agent = event.userDisplayName || event.userId;
        return `
          <li>
            <span class="payroll-event-marker ${event.paid ? 'is-paid' : 'is-unpaid'}" aria-hidden="true"></span>
            <span>
              <strong>${escapeHtml(actor)}</strong>
              ${escapeHtml(event.paid ? copy.markedPaid : copy.markedUnpaid)}
              <strong>${escapeHtml(agent)}</strong>
              <small>${escapeHtml(formatSessionDate(event.changedAt))} · <code>${escapeHtml(event.userId)}</code></small>
            </span>
          </li>
        `;
      }).join('')}
    </ol>
  `;
}

function payrollArchiveHistory(history, copy) {
  const archives = history?.items || [];

  if (!archives.length) {
    return `
      <section class="payroll-history">
        <div class="panel-heading">
          <p class="eyebrow">${escapeHtml(copy.historyEyebrow)}</p>
          <h3>${escapeHtml(copy.historyTitle)}</h3>
          <p class="muted">${escapeHtml(copy.historyHelp)}</p>
        </div>
        <p class="muted">${escapeHtml(copy.historyEmpty)}</p>
      </section>
    `;
  }

  const query = normalizePayrollSearch(payrollHistoryFilters.query);
  const status = ['open', 'settled'].includes(payrollHistoryFilters.status)
    ? payrollHistoryFilters.status
    : 'all';
  const filtered = archives.filter((archive) => {
    const settled = (archive.totals?.userCount || 0) > 0 && (archive.totals?.unpaidCount || 0) === 0;

    if (status === 'open' && settled) return false;
    if (status === 'settled' && !settled) return false;
    if (!query) return true;

    const haystack = [
      archive.weekStart,
      archive.weekEnd,
      archive.archivedByDisplayName,
      archive.archivedByUserId,
      ...(archive.items || []).flatMap((item) => [item.userId, item.displayName, item.username])
    ].map(normalizePayrollSearch).join(' ');

    return haystack.includes(query);
  });

  return `
    <section class="payroll-history">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">${escapeHtml(copy.historyEyebrow)}</p>
          <h3>${escapeHtml(copy.historyTitle)}</h3>
          <p class="muted">${escapeHtml(copy.historyHelp)}</p>
        </div>
        <span class="status-badge">${escapeHtml(history.totalCount || archives.length)} ${escapeHtml(copy.historyCount)}</span>
      </div>
      <form class="payroll-history-filters" data-payroll-history-filter>
        <label>
          <span>${escapeHtml(copy.historySearch)}</span>
          <input name="query" type="search" value="${escapeHtml(payrollHistoryFilters.query)}" placeholder="${escapeHtml(copy.historySearch)}">
        </label>
        <label>
          <span>${escapeHtml(copy.historyStatus)}</span>
          <select name="status">
            <option value="all"${status === 'all' ? ' selected' : ''}>${escapeHtml(copy.historyAll)}</option>
            <option value="open"${status === 'open' ? ' selected' : ''}>${escapeHtml(copy.historyOpen)}</option>
            <option value="settled"${status === 'settled' ? ' selected' : ''}>${escapeHtml(copy.historySettled)}</option>
          </select>
        </label>
        <button class="button button-small" type="submit">${escapeHtml(copy.filterButton)}</button>
        <button class="button button-small button-ghost" type="button" data-payroll-history-reset>${escapeHtml(copy.clearFilters)}</button>
      </form>
      ${history.hasMore ? `<p class="muted">${escapeHtml(archives.length)} / ${escapeHtml(history.totalCount)} ${escapeHtml(copy.historyCount)}</p>` : ''}
      <div class="payroll-history-list">
        ${filtered.length ? filtered.map((archive) => {
          const totals = archive.totals || {};
          const settled = (totals.userCount || 0) > 0 && (totals.unpaidCount || 0) === 0;
          const isExpanded = expandedPayrollArchiveWeek === archive.weekStart;
          return `
            <details class="payroll-history-period" data-payroll-history-period="${escapeHtml(archive.weekStart)}"${isExpanded ? ' open' : ''}>
              <summary>
                <span>
                  <strong>${escapeHtml(archive.weekStart)} → ${escapeHtml(archive.weekEnd)}</strong>
                  <small>${escapeHtml(copy.archivedOn)} ${escapeHtml(formatSessionDate(archive.archivedAt))}</small>
                </span>
                <span class="payroll-history-period-totals">
                  <strong>${escapeHtml(totals.totalAmountLabel || '')}</strong>
                  <small>${escapeHtml(totals.paidCount || 0)}/${escapeHtml(totals.userCount || 0)} ${escapeHtml(copy.paid.toLowerCase())}</small>
                  ${statusBadge(settled ? copy.historySettled : copy.historyOpen, settled)}
                </span>
              </summary>
              ${isExpanded ? `<div class="payroll-history-period-body">
                <div class="payroll-history-meta">
                  <div><span>${escapeHtml(copy.totalHours)}</span><strong>${escapeHtml(totals.totalTimeLabel || '')}</strong></div>
                  <div><span>${escapeHtml(copy.alreadyPaid)}</span><strong>${escapeHtml(totals.paidAmountLabel || '')}</strong></div>
                  <div><span>${escapeHtml(copy.toPay)}</span><strong>${escapeHtml(totals.unpaidAmountLabel || '')}</strong></div>
                  <div><span>${escapeHtml(copy.paymentProgress)}</span><strong>${escapeHtml(totals.completionPercent || 0)}%</strong></div>
                </div>
                <p class="payroll-history-context">
                  ${archive.archivedByUserId ? `${escapeHtml(copy.archivedBy)} <strong>${escapeHtml(archive.archivedByDisplayName || archive.archivedByUserId)}</strong> · ` : ''}
                  ${escapeHtml(copy.lastActivity)} ${escapeHtml(formatSessionDate(archive.lastActivityAt))}
                </p>
                ${payrollArchiveTable(archive, copy)}
                <div class="payroll-event-log">
                  <h4>${escapeHtml(copy.paymentJournal)}</h4>
                  ${payrollArchiveJournal(archive, copy)}
                </div>
              </div>` : ''}
            </details>
          `;
        }).join('') : `<p class="muted">${escapeHtml(copy.historyNoMatch)}</p>`}
      </div>
      ${history.hasMore ? `<button class="button button-ghost payroll-history-more" type="button" data-payroll-history-more>${escapeHtml(copy.loadMoreArchives)}</button>` : ''}
    </section>
  `;
}

function renderPayrollPanel(state) {
  const payroll = state.payroll || {
    weekStart: '',
    weekEnd: '',
    settings: { hourlyRate: 0, currency: '$' },
    totals: {},
    items: []
  };
  const copy = payrollCopy();
  const payrollArchives = state.payrollArchives || { totalCount: 0, hasMore: false, items: [] };
  const currentArchive = (payrollArchives.items || []).find((archive) => archive.weekStart === payroll.weekStart) || null;

  return `
    <section class="dashboard-panel payroll-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">${escapeHtml(copy.eyebrow)}</p>
          <h2>${escapeHtml(copy.title)}</h2>
          <p class="muted">${escapeHtml(copy.description)}</p>
        </div>
        <span class="status-badge">${escapeHtml(payroll.totals?.unpaidCount || 0)} ${escapeHtml(copy.unpaid)}</span>
      </div>
      <div class="payroll-grid">
        <form data-action-form="set-payroll-settings">
          ${labelHelp(copy.rateLabel, copy.rateHelp)}
          <input name="hourlyRate" type="number" min="0" step="0.01" value="${escapeHtml(payroll.settings?.hourlyRate || 0)}">
          ${labelHelp(copy.currencyLabel, copy.currencyHelp)}
          <input name="currency" maxlength="8" value="${escapeHtml(payroll.settings?.currency || '$')}">
          <button class="button" type="submit">${escapeHtml(copy.update)}</button>
        </form>
        <article class="inline-form payroll-summary-card">
          ${labelHelp(copy.summary, copy.note)}
          ${payrollSummaryCards(payroll, copy)}
        </article>
      </div>
      <form class="payroll-archive-form" data-action-form="archive-payroll">
        <div>
          ${labelHelp(copy.archive, copy.archiveHelp)}
          ${currentArchive ? `<small>${escapeHtml(copy.currentArchive)} ${escapeHtml(formatSessionDate(currentArchive.archivedAt))}</small>` : ''}
        </div>
        <button class="button button-ghost" type="submit">${escapeHtml(currentArchive ? copy.updateArchiveButton : copy.archiveButton)}</button>
      </form>
      ${payrollTable(payroll, copy)}
      ${payrollArchiveHistory(payrollArchives, copy)}
    </section>
  `;
}

function renderPremiumPayrollPanel(state, premiumBadge, premiumTag) {
  const payroll = state.payroll || {
    weekStart: '',
    weekEnd: '',
    settings: { hourlyRate: 0, currency: '$' },
    totals: {},
    items: []
  };
  const copy = payrollCopy();
  const roleOptions = optionList(state.roles || [], null, copy.roleLabel);
  const payrollArchives = state.payrollArchives || { totalCount: 0, hasMore: false, items: [] };

  return `
    <section class="dashboard-panel payroll-panel premium-view-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Paie Premium</p>
          <h2>Règles avancées et archives</h2>
          <p class="muted">Taux propres à chaque grade, corrections individuelles et historique étendu des règlements.</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="payroll-grid payroll-premium-grid">
        <article class="inline-form">
          ${labelHelp(copy.roleRates, copy.roleRatesHelp, ` ${premiumTag}`)}
          <form data-action-form="set-payroll-role-rate">
            <select name="roleId">${roleOptions}</select>
            <input name="hourlyRate" type="number" min="0" step="0.01" placeholder="${escapeHtml(copy.roleRateLabel)}">
            <button class="button" type="submit">${escapeHtml(copy.setRoleRate)}</button>
          </form>
          ${payrollRoleRatesList(payroll, copy)}
        </article>
        <article class="inline-form">
          ${labelHelp(copy.adjustments, copy.adjustmentsHelp, ` ${premiumTag}`)}
          <form data-action-form="add-payroll-adjustment">
            <input name="userId" placeholder="${escapeHtml(copy.userId)}">
            <select name="adjustmentType">
              <option value="bonus">${escapeHtml(copy.bonus)}</option>
              <option value="deduction">${escapeHtml(copy.deduction)}</option>
              <option value="correction">${escapeHtml(copy.correction)}</option>
            </select>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="${escapeHtml(copy.amount)}">
            <input name="reason" maxlength="240" placeholder="${escapeHtml(copy.reason)}">
            <button class="button" type="submit">${escapeHtml(copy.addAdjustment)}</button>
          </form>
          ${payrollAdjustmentList(payroll, copy)}
        </article>
      </div>
      ${payrollArchiveHistory(payrollArchives, copy)}
    </section>
  `;
}

function renderFreeServicePanel(state) {
  return `
    <section class="dashboard-panel service-overview-panel" id="service">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Registre</p>
          <h2>Registre de service</h2>
          <p class="muted">Suivi des fiches agent, déploiements actifs, cycles hebdomadaires et paie.</p>
        </div>
        <span class="free-badge">Vue Gratuit</span>
      </div>
      ${metricCards(state)}
      <div class="service-insights">
        <article class="service-insight service-insight-wide">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Déploiement</p>
              <h3>Agents en service</h3>
            </div>
            <strong>${escapeHtml(state.summary.activeCount)}</strong>
          </div>
          ${activeServicesPanel(state)}
        </article>
        <article class="service-insight">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Registre général</p>
              <h3>Présence cumulée</h3>
            </div>
          </div>
          ${leaderboardChart(state.topService || [], 'Aucun temps total enregistré.')}
        </article>
        <article class="service-insight">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Cycle courant</p>
              <h3>Sept derniers jours</h3>
            </div>
          </div>
          ${leaderboardChart(state.topWeek || [], 'Aucune session cette semaine.')}
        </article>
        <article class="service-insight service-insight-wide">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Fiche personnelle</p>
              <h3>Ton registre</h3>
            </div>
          </div>
          ${personalHistory(state)}
        </article>
      </div>
    </section>

    ${renderPayrollPanel(state)}

    <section class="dashboard-panel">
      <div class="panel-heading">
        <p class="eyebrow">Régie</p>
        <h2>Actions de service</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="start-service">
          ${labelHelp('Ouvrir le service d’un agent', 'Démarre manuellement le service d’un membre avec son ID et applique le grade de service si possible.')}
          <input name="userId" placeholder="ID du membre" required>
          <button class="button" type="submit">Prendre poste</button>
        </form>
        <form data-action-form="end-service">
          ${labelHelp('Fermer le service d’un agent', 'Arrête le service en cours d’un membre, calcule la durée et ajoute ce temps à son registre.')}
          <input name="userId" placeholder="ID du membre" required>
          <button class="button" type="submit">Fin de poste</button>
        </form>
        <form data-action-form="reset-user">
          ${labelHelp('Remise à zéro individuelle', 'Remet à zéro les heures d’une seule personne avec son ID, même si elle a quitté le serveur.')}
          <input name="userId" placeholder="ID, même si la personne est partie" required>
          <button class="button" type="submit">Réinitialiser</button>
        </form>
      </div>
    </section>
  `;
}

function renderPremiumServicePanel(state, premiumBadge, premiumTag) {
  return `
    <section class="dashboard-panel inline-premium-panel premium-view-panel" id="service">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Registre Premium</p>
          <h2>Registres avancés</h2>
          <p class="muted">Ces options servent aux équipes qui ont besoin de bilans complets et d’exports.</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid premium-service-actions">
        <form data-action-form="sync-service">
          ${labelHelp('Synchronisation du registre', 'Répare les écarts entre agents en service, grades et registre de service.', ` ${premiumTag}`)}
          <button class="button" type="submit">Synchroniser</button>
        </form>
      </div>
      ${premiumServiceRoadmap(state, premiumTag)}
    </section>

    ${renderPremiumPayrollPanel(state, premiumBadge, premiumTag)}
  `;
}

function renderServicePanel(state, premiumBadge, premiumTag) {
  return isPremiumPlanVisible(state)
    ? renderPremiumServicePanel(state, premiumBadge, premiumTag)
    : renderFreeServicePanel(state);
}

function customEmbedQuota(state, mode = 'free') {
  const quota = state.customEmbeds?.quota;
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (mode === 'premium') {
    return language === 'en'
      ? 'Premium: unlimited Sentinel embeds, creations, edits, and media.'
      : 'Premium : embeds Sentinel, créations, modifications et médias sans limite.';
  }

  if (!quota) {
    return language === 'en' ? 'Quota unavailable' : 'Quota indisponible';
  }

  if (quota.unlimited) {
    return language === 'en'
      ? 'Free view: standard creation, editing, and deletion tools.'
      : 'Vue Gratuit : outils standards de création, modification et suppression.';
  }

  return language === 'en'
    ? `Free: ${quota.used}/${quota.limit} active embeds used. Remaining: ${quota.remaining}. Edits are unlimited; Premium will unlock unlimited embeds.`
    : `Gratuit : ${quota.used}/${quota.limit} embeds actifs utilisés. Restant : ${quota.remaining}. Les modifications sont illimitées ; le Premium donnera un accès illimité aux embeds.`;
}

function customEmbedList(state) {
  const items = state.customEmbeds?.items || [];

  if (items.length === 0) {
    return '<p class="muted">Aucun embed Sentinel créé depuis ce dashboard ou Discord.</p>';
  }

  return `
    <ul class="compact-list embed-list">
      ${items.map((item) => {
        const channel = state.channels.find((candidate) => candidate.id === item.channelId);
        return `
          <li>
            <code>${escapeHtml(item.messageId)}</code>
            <span>${escapeHtml(item.title)} - ${channel ? `#${escapeHtml(channel.name)}` : escapeHtml(item.channelId)}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderEmbedsPanel(state, channelOptions, pingRoleOptions, premiumBadge) {
  const premiumMode = isPremiumPlanVisible(state);
  const freeEmbedLimit = 2;
  const displayState = premiumMode ? state : {
    ...state,
    customEmbeds: {
      ...(state.customEmbeds || {}),
      items: (state.customEmbeds?.items || []).slice(0, freeEmbedLimit),
      quota: {
        unlimited: false,
        limit: freeEmbedLimit,
        used: Math.min(state.customEmbeds?.items?.length || 0, freeEmbedLimit),
        remaining: Math.max(freeEmbedLimit - (state.customEmbeds?.items?.length || 0), 0)
      }
    }
  };
  const modeLabel = premiumMode ? 'Studio Premium' : 'Annonces gratuites';
  const title = premiumMode ? 'Embeds Sentinel illimités' : 'Embeds Sentinel';
  const createHelp = premiumMode
    ? 'Publie une annonce Premium sous l’identité de Sentinel, sans limite d’embeds actifs.'
    : 'Publie une annonce sous l’identité de Sentinel dans la limite gratuite du serveur.';
  const deleteHelp = premiumMode
    ? 'Supprime un embed Premium géré par Sentinel avec son ID de message.'
    : 'Supprime un embed géré par Sentinel et libère un emplacement gratuit.';

  return `
    <section class="dashboard-panel module-panel announcements-panel${premiumMode ? ' premium-view-panel' : ''}" id="embeds">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">${escapeHtml(modeLabel)}</p>
          <h2>${escapeHtml(title)}</h2>
          <p class="muted">${escapeHtml(customEmbedQuota(displayState, premiumMode ? 'premium' : 'free'))}</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid module-form-grid">
        <form data-action-form="custom-embed-create">
          ${labelHelp(premiumMode ? 'Créer une annonce Premium' : 'Créer un embed Sentinel', createHelp)}
          <select name="channelId">${channelOptions}</select>
          <input name="title" placeholder="Titre" maxlength="256" required>
          <textarea name="description" placeholder="Message de l'annonce" maxlength="4000" required></textarea>
          <input name="color" placeholder="Couleur : rose, cyan, #ff2d9a">
          <select name="roleId">${pingRoleOptions}</select>
          <input name="imageUrl" placeholder="Image URL optionnelle">
          ${fileUploadControl('imageFile', 'Photo principale', 'Aucune photo sélectionnée', 'Importer')}
          <input name="thumbnailUrl" placeholder="Miniature URL optionnelle">
          ${fileUploadControl('thumbnailFile', 'Miniature', 'Aucune miniature sélectionnée', 'Importer')}
          <p class="form-hint">PNG, JPG, WebP ou GIF, 8 Mo maximum au total. Sentinel optimise automatiquement les images en WebP.</p>
          <input name="footer" placeholder="Footer optionnel">
          <button class="button" type="submit">${premiumMode ? 'Publier sans limite' : 'Envoyer l’embed'}</button>
        </form>
        <form data-action-form="custom-embed-edit">
          ${labelHelp(premiumMode ? 'Modifier une annonce Premium' : 'Modifier un embed existant', 'Modifie un embed Sentinel déjà envoyé avec son ID de message.')}
          <select name="channelId">${channelOptions}</select>
          <input name="messageId" placeholder="ID du message embed" required>
          <input name="title" placeholder="Nouveau titre">
          <textarea name="description" placeholder="Nouveau message"></textarea>
          <input name="color" placeholder="Nouvelle couleur">
          <input name="imageUrl" placeholder="Nouvelle image URL, ou retirer">
          ${fileUploadControl('imageFile', 'Nouvelle photo principale', 'Aucune nouvelle photo', 'Remplacer')}
          <input name="thumbnailUrl" placeholder="Nouvelle miniature URL, ou retirer">
          ${fileUploadControl('thumbnailFile', 'Nouvelle miniature', 'Aucune nouvelle miniature', 'Remplacer')}
          <p class="form-hint">Un fichier choisi ici remplace l’URL indiquée pour l’image ou la miniature.</p>
          <input name="footer" placeholder="Nouveau footer, ou retirer">
          <button class="button" type="submit">Modifier</button>
        </form>
        <form data-action-form="custom-embed-delete">
          ${labelHelp('Supprimer un embed Sentinel', deleteHelp)}
          <select name="channelId">${channelOptions}</select>
          <input name="messageId" placeholder="ID du message embed" required>
          <button class="button button-ghost" type="submit">Supprimer</button>
        </form>
        <article class="inline-form">
          ${labelHelp(premiumMode ? 'Embeds Premium gérés' : 'Embeds gratuits gérés', 'Liste les embeds que Sentinel peut encore modifier ou supprimer depuis le dashboard.')}
          ${customEmbedList(displayState)}
        </article>
      </div>
    </section>
  `;
}

function dossierTypeLabel(type) {
  const labels = {
    support: 'Support',
    report: 'Signalement',
    recruitment: 'Recrutement',
    partnership: 'Partenariat',
    other: 'Autre',
    complaint: 'Signalement',
    admin: 'Autre',
    bug: 'Autre'
  };

  return labels[type] || 'Support';
}

function dossierStatusLabel(status) {
  const labels = {
    open: 'Ouvert',
    in_progress: 'En cours',
    waiting: 'En attente',
    resolved: 'Résolu',
    closed: 'Fermé'
  };

  return labels[status] || 'Ouvert';
}

function dossierPriorityLabel(priority) {
  const labels = {
    normal: 'Normal',
    important: 'Important',
    urgent: 'Urgent'
  };

  return labels[priority] || 'Normal';
}

function dossierQuotaText(state, mode = 'free') {
  const quota = state.dossiers?.panelQuota;
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (mode === 'premium') {
    return language === 'en'
      ? 'Premium: unlimited panels, longer history, and advanced settings.'
      : 'Premium : panneaux illimités, historique long et réglages avancés.';
  }

  if (!quota) {
    return language === 'en' ? 'Quota unavailable' : 'Quota indisponible';
  }

  if (quota.unlimited) {
    return language === 'en'
      ? 'Free view: one standard reception panel and essential ticket tracking.'
      : 'Vue Gratuit : un bureau d’accueil standard et le suivi essentiel des dossiers.';
  }

  return language === 'en'
    ? `Free: ${quota.used}/${quota.limit} published panel. ${quota.remaining} remaining. Visible history: ${state.dossiers?.historyLimit || 10} tickets.`
    : `Gratuit : ${quota.used}/${quota.limit} panneau publié. ${quota.remaining} restant. Historique visible : ${state.dossiers?.historyLimit || 10} dossiers.`;
}

function categoryOptionList(categories = [], selectedId = null) {
  const options = [`<option value="">Même catégorie que le panneau</option>`];

  for (const category of categories) {
    const selected = category.id === selectedId ? ' selected' : '';
    options.push(`<option value="${escapeHtml(category.id)}"${selected}>${escapeHtml(category.name)}</option>`);
  }

  return options.join('');
}

function dossierSettingForType(state, type) {
  return (state.dossiers?.settings || []).find((setting) => setting.type === type) || null;
}

function dossierPremiumSettings(state, premiumTag) {
  const types = [
    ['support', 'Support'],
    ['report', 'Signalement'],
    ['recruitment', 'Recrutement'],
    ['partnership', 'Partenariat'],
    ['other', 'Autre']
  ];
  const disabled = state.advanced ? '' : ' disabled';

  return `
    <article class="inline-form dossier-premium-settings">
      ${labelHelp('Catégories par type', 'Option Premium : envoie chaque type de dossier dans une catégorie Discord différente, par exemple recrutement dans une catégorie staff dédiée.', ` ${premiumTag}`)}
      <div class="dossier-category-grid">
        ${types.map(([type, label]) => {
          const setting = dossierSettingForType(state, type);

          return `
            <form data-action-form="set-dossier-category">
              <input type="hidden" name="dossierType" value="${escapeHtml(type)}">
              <strong>${escapeHtml(label)}</strong>
              <select name="categoryId"${disabled}>${categoryOptionList(state.categories || [], setting?.categoryId || '')}</select>
              <button class="button button-small" type="submit"${disabled}>Enregistrer</button>
            </form>
          `;
        }).join('')}
      </div>
      <p class="muted">Plus tard, ce même espace accueillera les formulaires personnalisés, les priorités, les templates, le branding et les automatisations.</p>
    </article>
  `;
}

function dossierRoles(state) {
  return (state.dossiers?.roleIds || [])
    .map((roleId) => resolveRole(state, roleId))
    .filter(Boolean);
}

function dossierRoleList(state) {
  const roles = dossierRoles(state);

  if (roles.length === 0) {
    return '<p class="muted">Aucun rôle responsable n’est configuré. Les rôles autorisés, le propriétaire et les membres avec les permissions Discord nécessaires peuvent encore gérer les tickets.</p>';
  }

  return `
    <div class="role-chip-row">
      ${roles.map((role) => `
        <span class="role-chip">
          @${escapeHtml(role.name)}
          <button type="button" data-action-click="remove-dossier-role" data-role-id="${escapeHtml(role.id)}">Retirer</button>
        </span>
      `).join('')}
    </div>
  `;
}

function dossierStatusOptions(selectedStatus = '') {
  const options = [
    ['', 'Tous les statuts'],
    ['open', 'Ouvert'],
    ['in_progress', 'En cours'],
    ['waiting', 'En attente'],
    ['resolved', 'Résolu'],
    ['closed', 'Fermé']
  ];

  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selectedStatus ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function dossierStatusActionOptions(selectedStatus = 'in_progress') {
  const options = [
    ['open', 'Ouvert'],
    ['in_progress', 'En cours'],
    ['waiting', 'En attente'],
    ['resolved', 'Résolu']
  ];

  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selectedStatus ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function dossierMatchesFilters(item) {
  const userId = String(dossierFilters.userId || '').trim();
  const referentId = String(dossierFilters.referentId || '').trim();
  const status = String(dossierFilters.status || '').trim();

  if (userId && ![item.ownerUserId, item.openerUserId].includes(userId)) {
    return false;
  }

  if (referentId && item.referentUserId !== referentId) {
    return false;
  }

  if (status && item.status !== status) {
    return false;
  }

  return true;
}

function dossierFiltersPanel() {
  return `
    <form class="audit-filters dossier-filters" data-dossier-filter>
      <div class="audit-field">
        ${labelHelp('Demandeur', 'Filtre les dossiers ouverts par un ID Discord précis.')}
        <input name="userId" placeholder="ID Discord" value="${escapeHtml(dossierFilters.userId || '')}">
      </div>
      <div class="audit-field">
        ${labelHelp('Référent', 'Filtre les dossiers pris en charge par un membre du staff.')}
        <input name="referentId" placeholder="ID Discord référent" value="${escapeHtml(dossierFilters.referentId || '')}">
      </div>
      <div class="audit-field">
        ${labelHelp('Statut', 'Affiche seulement les dossiers ouverts, en cours, en attente, résolus ou fermés.')}
        <select name="status">${dossierStatusOptions(dossierFilters.status || '')}</select>
      </div>
      <div class="audit-actions">
        <button class="button" type="submit">Filtrer les dossiers</button>
        <button class="button button-ghost" type="button" data-dossier-reset>Réinitialiser</button>
      </div>
    </form>
  `;
}

function dossierDetailRow(item) {
  if (String(expandedDossierId) !== String(item.id)) {
    return '';
  }

  return `
    <tr class="case-detail-row dossier-detail-row">
      <td colspan="7">
        <div class="case-detail-card">
          <div>
            <span>Dossier</span>
            <strong>#${escapeHtml(item.id)}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>${escapeHtml(dossierTypeLabel(item.type))}</strong>
          </div>
          <div>
            <span>Priorité</span>
            <strong>${escapeHtml(dossierPriorityLabel(item.priority))}</strong>
          </div>
          <div>
            <span>Ouvert le</span>
            <strong>${escapeHtml(formatAuditDate(item.createdAt))}</strong>
          </div>
          <div>
            <span>Fermé le</span>
            <strong>${escapeHtml(item.closedAt ? formatAuditDate(item.closedAt) : 'Encore ouvert')}</strong>
          </div>
          <div class="case-detail-wide">
            <span>Sujet</span>
            <p>${escapeHtml(item.subject || 'Aucun sujet enregistré.')}</p>
          </div>
          <div class="case-detail-wide">
            <span>Description</span>
            <p>${escapeHtml(item.description || 'Aucune description enregistrée.')}</p>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function dossierList(state) {
  const items = (state.dossiers?.items || []).filter(dossierMatchesFilters);

  if (items.length === 0) {
    return '<p class="muted">Aucun dossier Sentinel trouvé avec ces filtres.</p>';
  }

  return `
    <div class="table-shell dossier-table-shell">
      <table class="dashboard-table dossier-table">
        <thead>
          <tr>
            <th>Dossier</th>
            <th>Type</th>
            <th>Demandeur</th>
            <th>Référent</th>
            <th>Statut</th>
            <th>Détail</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item) => {
            const channel = resolveChannel(state, item.channelId);
            const isOpen = item.status !== 'closed';

            return `
              <tr>
                <td>
                  <strong>#${escapeHtml(item.id)}</strong>
                  ${item.subject ? `<small>${escapeHtml(item.subject)}</small>` : ''}
                  <small>${channel ? `#${escapeHtml(channel.name)}` : escapeHtml(item.channelId)}</small>
                </td>
                <td>${escapeHtml(dossierTypeLabel(item.type))}</td>
                <td><code>${escapeHtml(item.ownerUserId)}</code></td>
                <td>${item.referentUserId ? `<code>${escapeHtml(item.referentUserId)}</code>` : '<span class="muted">Aucun</span>'}</td>
                <td>${statusBadge(dossierStatusLabel(item.status), isOpen)}</td>
                <td><button class="button button-small button-ghost" type="button" data-dossier-detail="${escapeHtml(item.id)}">Voir</button></td>
                <td>
                  ${isOpen ? `
                    <form class="table-action-form dossier-table-actions" data-action-form="dossier-status">
                      <input type="hidden" name="channelId" value="${escapeHtml(item.channelId)}">
                      <select name="dossierStatus">${dossierStatusActionOptions(item.status)}</select>
                      <button class="button button-small button-ghost" type="submit">Statut</button>
                    </form>
                    <form class="table-action-form dossier-table-actions" data-action-form="dossier-claim">
                      <input type="hidden" name="channelId" value="${escapeHtml(item.channelId)}">
                      <button class="button button-small button-ghost" type="submit">Prendre</button>
                    </form>
                    <form class="table-action-form dossier-table-actions" data-action-form="dossier-close">
                      <input type="hidden" name="channelId" value="${escapeHtml(item.channelId)}">
                      <button class="button button-small button-ghost" type="submit">Clôturer</button>
                    </form>
                  ` : '<span class="muted">Archivé</span>'}
                </td>
              </tr>
              ${dossierDetailRow(item)}
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted case-limit-note">Affichage limité aux ${escapeHtml(state.dossiers?.historyLimit || 10)} derniers dossiers visibles pour ce serveur.</p>
  `;
}

function renderDossiersPanel(state, channelOptions, dossierRoleOptions, premiumBadge, premiumTag) {
  const premiumMode = isPremiumPlanVisible(state);
  const displayState = premiumMode ? state : {
    ...state,
    dossiers: {
      ...(state.dossiers || {}),
      historyLimit: 10,
      items: (state.dossiers?.items || []).slice(0, 10)
    }
  };

  return `
    <section class="dashboard-panel module-panel dossiers-panel${premiumMode ? ' premium-view-panel' : ''}" id="dossiers">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">${premiumMode ? 'Dossiers Premium' : 'Dossiers Sentinel'}</p>
          <h2>${premiumMode ? 'Bureau avancé et suivi étendu' : 'Bureau d’accueil et suivi'}</h2>
          <p class="muted">${premiumMode
            ? 'Panneaux illimités, catégories par demande et historique étendu pour les équipes organisées.'
            : 'Un membre ouvre une demande privée, puis l’équipe autorisée la suit depuis son salon réservé.'}</p>
        </div>
        ${premiumMode ? premiumBadge : `<span class="status-badge">${escapeHtml(state.dossiers?.openCount || 0)} ouvert(s)</span>`}
      </div>
      ${dossierPermissionAlert(state)}
      <div class="dashboard-alert is-ready dossier-quota-alert">
        <strong>${premiumMode ? 'Capacité Premium' : 'Capacité gratuite'}</strong>
        <p>${escapeHtml(dossierQuotaText(state, premiumMode ? 'premium' : 'free'))}</p>
      </div>
      <div class="form-grid module-form-grid">
        <form data-action-form="publish-dossier-panel">
          ${labelHelp(
            premiumMode ? 'Publier un bureau Premium' : 'Publier le bureau d’accueil',
            premiumMode ? 'Publie un nouveau panneau de dossiers sans limite de panneaux actifs.' : 'Publie le panneau gratuit de demandes privées.'
          )}
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">${premiumMode ? 'Publier sans limite' : 'Publier le bureau'}</button>
        </form>
        ${premiumMode ? '' : `
          <article class="inline-form dossier-explain-card">
            ${labelHelp('À quoi ça sert ?', 'Un dossier Sentinel est une demande privée pour le support, un signalement, un recrutement, un partenariat ou un autre sujet.')}
            <p>Les responsables peuvent répondre, ajouter des intervenants, prendre le dossier en charge, corriger son statut, générer un compte rendu et le clôturer.</p>
          </article>
        `}
        <article class="inline-form dossier-explain-card">
          ${labelHelp(premiumMode ? 'Équipe des dossiers Premium' : 'Rôles responsables', 'Ces rôles peuvent voir et administrer les dossiers privés.')}
          <form data-action-form="add-dossier-role">
            <select name="roleId">${dossierRoleOptions}</select>
            <button class="button" type="submit">Ajouter le rôle</button>
          </form>
          ${dossierRoleList(state)}
        </article>
        ${premiumMode ? dossierPremiumSettings(state, premiumTag) : ''}
        <article class="inline-form dossier-list-card">
          ${labelHelp(premiumMode ? 'Historique Premium' : 'Dossiers récents', premiumMode
            ? 'Retrouve l’historique étendu des dossiers et affine la liste avec les filtres avancés.'
            : 'Retrouve les dossiers récents de ce serveur et clôture ceux qui sont encore ouverts.')}
          ${dossierFiltersPanel(displayState)}
          ${dossierList(displayState)}
        </article>
      </div>
    </section>
  `;
}

const AUDIT_ACTION_LABELS = {
  'set-language': 'Langue',
  'set-server-preset': 'Profil serveur',
  'set-service-role': 'Rôle de service',
  'set-auto-role': 'Rôle automatique',
  'disable-auto-role': 'Rôle automatique',
  'set-log-channel': 'Salon de logs',
  'set-status-channel': 'Salon statut',
  'disable-status-channel': 'Salon statut',
  'set-status-updates': 'Nouveautés statut',
  'enable-status-updates': 'Nouveautés statut',
  'disable-status-updates': 'Nouveautés statut',
  'publish-service-panel': 'Bureau de service',
  'set-payroll-settings': 'Réglage paie RP',
  'set-payroll-role-rate': 'Taux paie par rôle',
  'remove-payroll-role-rate': 'Taux paie retiré',
  'add-payroll-adjustment': 'Ajustement paie',
  'mark-payroll-status': 'Statut paie',
  'archive-payroll': 'Archive paie',
  'toggle-payroll-paid': 'Paie RP',
  'publish-dossier-panel': 'Bureau d’accueil',
  'configure-dossier-roles': 'Rôles dossiers',
  'dossier-close': 'Dossier clôturé',
  'dossier-status': 'Statut dossier',
  'dossier-claim': 'Dossier pris en charge',
  'set-dossier-category': 'Catégorie dossier',
  'add-dossier-role': 'Rôle ticket ajouté',
  'remove-dossier-role': 'Rôle ticket retiré',
  'dossier-add': 'Intervenant ajouté',
  'dossier-remove': 'Intervenant retiré',
  'dossier-transcript': 'Compte rendu dossier',
  'add-command-role': 'Rôle autorisé ajouté',
  'remove-command-role': 'Rôle autorisé retiré',
  'set-automod-settings': 'Garde réglée',
  'add-automod-word': 'Mot surveillé ajouté',
  'remove-automod-word': 'Mot surveillé retiré',
  'toggle-service': 'Bouton service',
  'start-service': 'Prise de service',
  'end-service': 'Fin de service',
  'reset-user': 'Fiche réinitialisée',
  'reset-guild': 'Registre réinitialisé',
  'sync-service': 'Synchronisation',
  'custom-embed-create': 'Embed créé',
  'custom-embed-edit': 'Embed modifié',
  'custom-embed-delete': 'Embed supprimé',
  warn: 'Avertissement',
  timeout: 'Mise au silence',
  untimeout: 'Silence levé',
  kick: 'Expulsion',
  ban: 'Bannissement',
  tempban: 'Bannissement temporaire',
  unban: 'Bannissement levé',
  clear: 'Purge',
  purge: 'Purge',
  lock: 'Salon verrouillé',
  unlock: 'Salon rouvert',
  slowmode: 'Salon ralenti',
  case_edit: 'Dossier corrigé',
  case_delete: 'Dossier retiré',
  'edit-case': 'Dossier corrigé',
  'delete-case': 'Dossier retiré',
  unwarn: 'Avertissement retiré'
};

function auditActionOptions(selectedAction = '') {
  const options = ['<option value="">Toutes les actions</option>'];

  for (const [value, label] of Object.entries(AUDIT_ACTION_LABELS)) {
    options.push(`<option value="${escapeHtml(value)}"${value === selectedAction ? ' selected' : ''}>${escapeHtml(label)}</option>`);
  }

  return options.join('');
}

function auditSourceOptions(selectedSource = '') {
  const options = [
    ['', 'Toutes les origines'],
    ['dashboard', 'Site'],
    ['discord', 'Discord']
  ];

  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selectedSource ? ' selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');
}

function formatAuditDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function auditStatusLabel(status) {
  return status === 'failed' ? 'Échec' : 'Succès';
}

function auditSourceLabel(source) {
  if (source === 'discord') {
    return 'Discord';
  }

  return 'Site';
}

function auditTargetTypeLabel(type) {
  const labels = {
    user: 'Membre',
    channel: 'Salon',
    category: 'Catégorie',
    role: 'Rôle',
    message: 'Message',
    case: 'Cas',
    guild: 'Serveur'
  };

  return labels[type] || 'Cible';
}

function auditTargetLabel(item, state) {
  if (!item.targetId) {
    return 'Aucune cible';
  }

  if (item.targetType === 'role') {
    const role = resolveRole(state, item.targetId);
    return role ? `@${role.name}` : `Rôle ${item.targetId}`;
  }

  if (item.targetType === 'channel') {
    const channel = resolveChannel(state, item.targetId);
    return channel ? `#${channel.name}` : `Salon ${item.targetId}`;
  }

  if (item.targetType === 'category') {
    const category = (state.categories || []).find((candidate) => candidate.id === item.targetId);
    return category ? `Catégorie ${category.name}` : `Catégorie ${item.targetId}`;
  }

  if (item.targetType === 'guild') {
    return item.guildName || item.guildId || item.targetId;
  }

  return item.targetId;
}

function auditActorLabel(item) {
  if (item.actorUsername && item.actorUserId) {
    return `${item.actorUsername} (${item.actorUserId})`;
  }

  return item.actorUsername || item.actorUserId || 'Inconnu';
}

function moderationFilterActionOptions(selectedAction = '') {
  const actions = [
    '',
    'warn',
    'timeout',
    'untimeout',
    'kick',
    'ban',
    'clear',
    'tempban',
    'unban',
    'lock',
    'unlock',
    'slowmode',
    'case_delete',
    'unwarn'
  ];

  return actions.map((action) => {
    const label = action ? (AUDIT_ACTION_LABELS[action] || action) : 'Toutes les sanctions';
    return `<option value="${escapeHtml(action)}"${action === selectedAction ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function permissionDiagnosticsPanel(state) {
  const diagnostics = state.diagnostics;

  if (!diagnostics?.checks?.length) {
    return '';
  }

  const headline = diagnostics.fixes?.length
    ? `${diagnostics.fixes.length} point(s) à corriger`
    : 'Tout est prêt';

  return `
    <article class="inline-form diagnostics-panel">
      <div class="panel-mini-heading">
        <div>
          <p class="eyebrow">Diagnostic permissions</p>
          <h3>Ce que Sentinel peut faire</h3>
          <p class="muted">Si une action est refusée, corrige d’abord la ligne indiquée ici : permission manquante, salon inaccessible ou rôle Sentinel placé trop bas.</p>
        </div>
        ${statusBadge(headline, diagnostics.fixes.length === 0)}
      </div>
      <div class="diagnostic-grid">
        ${diagnostics.checks.map((check) => `
          <div class="diagnostic-check ${check.ok ? 'is-ready' : 'is-warning'}">
            <span>${escapeHtml(diagnosticLabelText(check))}</span>
            <strong>${escapeHtml(check.value)}</strong>
            ${check.ok ? '' : `<small>${escapeHtml(diagnosticFixText(check))}</small>`}
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function moderationCaseTargetLabel(item) {
  if (item.targetUserId) {
    return item.targetUserId;
  }

  if (item.action === 'clear' || item.action === 'purge') {
    return 'Salon';
  }

  if (['lock', 'unlock', 'slowmode'].includes(item.action)) {
    return 'Salon';
  }

  return 'Aucune cible';
}

function moderationCaseDetails(item) {
  if (String(expandedModerationCaseId) !== String(item.id)) {
    return '';
  }

  return `
    <tr class="case-detail-row">
      <td colspan="7">
        <div class="case-detail-card">
          <div>
            <span>Cas</span>
            <strong>#${escapeHtml(item.id)}</strong>
          </div>
          <div>
            <span>Action</span>
            <strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong>
          </div>
          <div>
            <span>Cible</span>
            <code>${escapeHtml(moderationCaseTargetLabel(item))}</code>
          </div>
          <div>
            <span>Staff</span>
            <code>${escapeHtml(item.moderatorUserId || 'Inconnu')}</code>
          </div>
          <div>
            <span>Durée</span>
            <strong>${escapeHtml(item.durationLabel || 'Sans durée')}</strong>
          </div>
          <div class="case-detail-wide">
            <span>Raison</span>
            <p>${escapeHtml(item.reason || 'Aucune raison indiquée')}</p>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function moderationCaseFilters(state) {
  const limit = state.advanced ? 25 : 10;

  return `
    <form class="audit-filters moderation-filters" data-moderation-filter>
      <div class="audit-field">
        ${labelHelp('Utilisateur', 'Filtre les sanctions liées à un ID Discord précis.')}
        <input name="userId" placeholder="ID Discord" value="${escapeHtml(moderationFilters.userId || '')}">
      </div>
      <div class="audit-field">
        ${labelHelp('Type', 'Affiche seulement un type de sanction : avertissement, timeout, ban, purge, etc.')}
        <select name="action">${moderationFilterActionOptions(moderationFilters.action || '')}</select>
      </div>
      <div class="audit-field">
        ${labelHelp('Cas', 'Ouvre rapidement un dossier précis avec son numéro.')}
        <input name="caseId" placeholder="Exemple : 12" value="${escapeHtml(moderationFilters.caseId || '')}">
      </div>
      <div class="audit-field">
        ${labelHelp('Limite', 'Nombre maximum de dossiers affichés. Le gratuit reste limité aux derniers cas.')}
        <input name="limit" type="number" min="1" max="${state.advanced ? 100 : 10}" value="${escapeHtml(moderationFilters.limit || limit)}">
      </div>
      <div class="audit-actions">
        <button class="button" type="submit">Filtrer les sanctions</button>
        <button class="button button-ghost" type="button" data-moderation-reset>Réinitialiser</button>
      </div>
    </form>
  `;
}

function moderationCaseList(state) {
  const cases = state.moderationCases?.items || [];
  const limit = state.moderationCases?.limit || 10;

  if (cases.length === 0) {
    return '<p class="muted">Aucun dossier de modération enregistré pour le moment.</p>';
  }

  return `
    <div class="table-shell moderation-case-shell">
      <table class="dashboard-table moderation-case-table">
        <thead>
          <tr>
            <th>Cas</th>
            <th>Action</th>
            <th>Cible</th>
            <th>Staff</th>
            <th>Raison</th>
            <th>Date</th>
            <th>Détails</th>
          </tr>
        </thead>
        <tbody>
          ${cases.map((item) => `
            <tr>
              <td><strong>#${escapeHtml(item.id)}</strong></td>
              <td>
                <strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong>
                ${item.durationLabel ? `<small>${escapeHtml(item.durationLabel)}</small>` : ''}
              </td>
              <td><code>${escapeHtml(moderationCaseTargetLabel(item))}</code></td>
              <td><code>${escapeHtml(item.moderatorUserId || 'Inconnu')}</code></td>
              <td>${escapeHtml(item.reason || 'Aucune raison indiquée')}</td>
              <td>${escapeHtml(formatAuditDate(item.createdAt))}</td>
              <td><button class="button button-small button-ghost" type="button" data-case-detail="${escapeHtml(item.id)}">Voir</button></td>
            </tr>
            ${moderationCaseDetails(item)}
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted case-limit-note">Affichage limité aux ${escapeHtml(limit)} derniers dossiers sur ce serveur.</p>
  `;
}

const AUTOMOD_ACTION_LABELS = {
  log: 'Log seulement',
  delete: 'Supprimer',
  warn: 'Avertir',
  timeout: 'Timeout',
  kick: 'Expulser',
  ban: 'Bannir'
};

const AUTOMOD_RULE_LABELS = {
  forbidden_words: 'Mots interdits',
  discord_invite: 'Invitations Discord',
  spam: 'Spam',
  premium_caps: 'Majuscules',
  premium_mentions: 'Mentions',
  premium_raid: 'Anti-raid'
};

function automodSettings(state) {
  return {
    enabled: false,
    forbiddenWordsEnabled: true,
    forbiddenWordsAction: 'delete',
    inviteFilterEnabled: false,
    inviteAction: 'delete',
    spamFilterEnabled: false,
    spamAction: 'timeout',
    spamMaxMessages: 5,
    spamWindowSeconds: 8,
    spamTimeoutSeconds: 600,
    premiumCapsEnabled: false,
    premiumCapsAction: 'delete',
    premiumMentionsEnabled: false,
    premiumMentionsAction: 'timeout',
    premiumMentionLimit: 6,
    premiumProgressiveEnabled: false,
    premiumProgressiveWindowMinutes: 60,
    premiumProgressiveTimeoutThreshold: 3,
    premiumProgressiveKickThreshold: 5,
    premiumProgressiveBanThreshold: 7,
    premiumRaidEnabled: false,
    premiumRaidJoinCount: 6,
    premiumRaidWindowSeconds: 30,
    premiumIgnoredRoleIds: [],
    premiumIgnoredChannelIds: [],
    freeWordLimit: 25,
    premiumWordLimit: 200,
    ...(state.automod?.settings || {})
  };
}

function automodActionOptions(selectedAction = 'delete', premium = false) {
  const actions = premium
    ? ['log', 'delete', 'warn', 'timeout', 'kick', 'ban']
    : ['log', 'delete', 'warn', 'timeout'];

  return actions.map((action) => `
    <option value="${escapeHtml(action)}"${action === selectedAction ? ' selected' : ''}>${escapeHtml(AUTOMOD_ACTION_LABELS[action] || action)}</option>
  `).join('');
}

function automodCheckbox(name, checked) {
  return `
    <input type="hidden" name="${escapeHtml(name)}" value="false">
    <input type="checkbox" name="${escapeHtml(name)}" value="true" ${checked ? 'checked' : ''}>
  `;
}

function automodToggle(name, checked, label, help) {
  return `
    <div class="automod-toggle">
      ${labelHelp(label, help)}
      ${automodCheckbox(name, checked)}
    </div>
  `;
}

function automodWordList(state) {
  const words = state.automod?.words || [];

  if (!words.length) {
    return '<p class="muted">Aucun mot interdit configuré.</p>';
  }

  return `
    <div class="automod-word-list">
      ${words.map((item) => `
        <form class="automod-word-chip" data-action-form="remove-automod-word">
          <input type="hidden" name="word" value="${escapeHtml(item.word)}">
          <code>${escapeHtml(item.word)}</code>
          <button class="button button-small button-ghost" type="submit">Retirer</button>
        </form>
      `).join('')}
    </div>
  `;
}

function automodEventList(state) {
  const events = state.automod?.events || [];

  if (!events.length) {
    return '<p class="muted">Aucun signal de sécurité pour le moment.</p>';
  }

  return `
    <div class="automod-event-list">
      ${events.map((item) => {
        const channel = resolveChannel(state, item.channelId);
        return `
          <article>
            <div>
              <strong>${escapeHtml(AUTOMOD_RULE_LABELS[item.rule] || item.rule)}</strong>
              <span>${escapeHtml(AUTOMOD_ACTION_LABELS[item.action] || item.action)} - ${escapeHtml(formatAuditDate(item.createdAt))}</span>
            </div>
            <code>${escapeHtml(item.userId)}</code>
            <small>${channel ? `#${escapeHtml(channel.name)}` : escapeHtml(item.channelId || 'sans salon')}</small>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function automodSecurityOverview(state, settings, words) {
  const events = state.automod?.events || [];
  const activeSignals = [
    settings.forbiddenWordsEnabled,
    settings.inviteFilterEnabled,
    settings.spamFilterEnabled
  ].filter(Boolean).length;
  const latestEvent = events[0]?.createdAt ? formatAuditDate(events[0].createdAt) : 'Aucun signal';

  return `
    <div class="automod-security-grid">
      <article class="automod-security-card">
        <span>Garde</span>
        <strong>${settings.enabled ? 'En service' : 'En pause'}</strong>
        <small>${settings.enabled ? 'Les règles actives surveillent les salons autorisés.' : 'Aucune règle automatique ne se déclenche.'}</small>
      </article>
      <article class="automod-security-card">
        <span>Signaux actifs</span>
        <strong>${activeSignals}/3</strong>
        <small>Mots surveillés, invitations et rafales de messages.</small>
      </article>
      <article class="automod-security-card">
        <span>Lexique</span>
        <strong>${escapeHtml(words.length)}</strong>
        <small>mot(s) ou expression(s) consignés.</small>
      </article>
      <article class="automod-security-card">
        <span>Dernière alerte</span>
        <strong>${escapeHtml(latestEvent)}</strong>
        <small>${escapeHtml(events.length)} signalement(s) dans le registre récent.</small>
      </article>
      <article class="automod-security-card">
        <span>Accès</span>
        <strong>Gratuit</strong>
        <small>Garde essentielle disponible.</small>
      </article>
    </div>
  `;
}

function automodFreePanel(state) {
  const settings = automodSettings(state);
  const words = (state.automod?.words || []).slice(0, settings.freeWordLimit);
  const wordLimit = settings.freeWordLimit;
  const freeState = {
    ...state,
    automod: {
      ...(state.automod || {}),
      words
    }
  };

  return `
    <article class="inline-form automod-card automod-card-wide">
      <div class="panel-mini-heading">
        <div>
          <p class="eyebrow">Centre de sécurité</p>
          <h3>Garde gratuite</h3>
          <p class="muted">Lexique surveillé, invitations et rythme de messages.</p>
        </div>
        ${statusBadge(settings.enabled ? 'En service' : 'Pause', settings.enabled)}
      </div>
      ${automodSecurityOverview(state, settings, words)}
      <form class="automod-settings-form" data-action-form="set-automod-settings">
        <div class="automod-toggle-grid">
          ${automodToggle('enabled', settings.enabled, 'Mettre la garde en service', 'Allume ou met en pause toutes les règles automatiques du serveur.')}
          ${automodToggle('forbiddenWordsEnabled', settings.forbiddenWordsEnabled, 'Lexique interdit', 'Détecte les mots ajoutés dans le registre du serveur.')}
          ${automodToggle('inviteFilterEnabled', settings.inviteFilterEnabled, 'Invitations externes', 'Repère les liens discord.gg et les liens d’invitation.')}
          ${automodToggle('spamFilterEnabled', settings.spamFilterEnabled, 'Rafales de messages', 'Détecte les messages envoyés trop vite par la même personne.')}
        </div>
        <div class="automod-control-grid">
          <div>
            ${labelHelp('Réponse lexique', 'Mesure appliquée quand un mot surveillé est détecté.')}
            <select name="forbiddenWordsAction">${automodActionOptions(settings.forbiddenWordsAction, false)}</select>
          </div>
          <div>
            ${labelHelp('Réponse invitations', 'Mesure appliquée quand une invitation est détectée.')}
            <select name="inviteAction">${automodActionOptions(settings.inviteAction, false)}</select>
          </div>
          <div>
            ${labelHelp('Réponse rafale', 'Mesure appliquée quand le seuil de rafale est dépassé.')}
            <select name="spamAction">${automodActionOptions(settings.spamAction, false)}</select>
          </div>
          <div>
            ${labelHelp('Seuil de rafale', 'Nombre de messages tolérés dans la fenêtre de surveillance.')}
            <input name="spamMaxMessages" type="number" min="2" max="12" value="${escapeHtml(settings.spamMaxMessages)}">
          </div>
          <div>
            ${labelHelp('Fenêtre de surveillance', 'Durée en secondes utilisée pour compter les messages rapides.')}
            <input name="spamWindowSeconds" type="number" min="3" max="60" value="${escapeHtml(settings.spamWindowSeconds)}">
          </div>
          <div>
            ${labelHelp('Durée de silence', 'Durée du silence automatique en secondes.')}
            <input name="spamTimeoutSeconds" type="number" min="30" max="3600" value="${escapeHtml(Math.min(Number(settings.spamTimeoutSeconds) || 600, 3600))}">
          </div>
        </div>
        <button class="button" type="submit">Enregistrer la garde</button>
      </form>
    </article>
    <article class="inline-form automod-card">
      <div class="panel-mini-heading">
        <div>
          <h3>Lexique surveillé</h3>
          <p class="muted">${escapeHtml(words.length)}/${escapeHtml(wordLimit)} mot(s) configurés.</p>
        </div>
      </div>
      <form class="automod-add-word" data-action-form="add-automod-word">
        <input name="word" maxlength="80" placeholder="Mot ou expression à surveiller" required>
        <button class="button" type="submit">Consigner</button>
      </form>
      ${automodWordList(freeState)}
    </article>
    <article class="inline-form automod-card">
      <h3>Registre des alertes</h3>
      ${automodEventList(state)}
    </article>
  `;
}

function automodPremiumPanel(state, premiumTag) {
  const settings = automodSettings(state);

  return `
    <article class="inline-form automod-card automod-card-wide premium-roadmap">
      <div class="panel-mini-heading">
        <div>
          <p class="eyebrow">Garde Premium</p>
          <h3>Veille renforcée ${premiumTag}</h3>
          <p class="muted">Majuscules abusives, mentions massives, récidives et arrivée groupée.</p>
        </div>
      </div>
      <form class="automod-settings-form" data-action-form="set-automod-settings">
        <div class="automod-toggle-grid">
          ${automodToggle('premiumCapsEnabled', settings.premiumCapsEnabled, 'Surveillance majuscules', 'Repère les messages presque entièrement en majuscules.')}
          ${automodToggle('premiumMentionsEnabled', settings.premiumMentionsEnabled, 'Mentions massives', 'Repère les messages avec trop de mentions.')}
          ${automodToggle('premiumProgressiveEnabled', settings.premiumProgressiveEnabled, 'Escalade récidive', 'Renforce la mesure quand la même personne récidive dans la période choisie.')}
          ${automodToggle('premiumRaidEnabled', settings.premiumRaidEnabled, 'Veille anti-raid', 'Signale une arrivée massive de membres dans un court délai.')}
        </div>
        <div class="automod-control-grid">
          <div>
            ${labelHelp('Réponse majuscules', 'Mesure appliquée aux messages abusant des majuscules.', ` ${premiumTag}`)}
            <select name="premiumCapsAction">${automodActionOptions(settings.premiumCapsAction, true)}</select>
          </div>
          <div>
            ${labelHelp('Réponse mentions', 'Mesure appliquée quand le seuil de mentions est dépassé.', ` ${premiumTag}`)}
            <select name="premiumMentionsAction">${automodActionOptions(settings.premiumMentionsAction, true)}</select>
          </div>
          <div>
            ${labelHelp('Limite de mentions', 'Nombre de mentions à partir duquel la règle se déclenche.', ` ${premiumTag}`)}
            <input name="premiumMentionLimit" type="number" min="3" max="30" value="${escapeHtml(settings.premiumMentionLimit)}">
          </div>
          <div>
            ${labelHelp('Fenêtre récidive', 'Durée en minutes utilisée pour compter les déclenchements répétés.', ` ${premiumTag}`)}
            <input name="premiumProgressiveWindowMinutes" type="number" min="5" max="10080" value="${escapeHtml(settings.premiumProgressiveWindowMinutes)}">
          </div>
          <div>
            ${labelHelp('Palier silence', 'Nombre de signaux avant silence automatique.', ` ${premiumTag}`)}
            <input name="premiumProgressiveTimeoutThreshold" type="number" min="2" max="30" value="${escapeHtml(settings.premiumProgressiveTimeoutThreshold)}">
          </div>
          <div>
            ${labelHelp('Palier expulsion', 'Nombre de signaux avant expulsion automatique.', ` ${premiumTag}`)}
            <input name="premiumProgressiveKickThreshold" type="number" min="3" max="40" value="${escapeHtml(settings.premiumProgressiveKickThreshold)}">
          </div>
          <div>
            ${labelHelp('Palier bannissement', 'Nombre de signaux avant bannissement automatique.', ` ${premiumTag}`)}
            <input name="premiumProgressiveBanThreshold" type="number" min="4" max="50" value="${escapeHtml(settings.premiumProgressiveBanThreshold)}">
          </div>
          <div>
            ${labelHelp('Arrivées groupées', 'Nombre d’arrivées à partir duquel Sentinel alerte l’équipe.', ` ${premiumTag}`)}
            <input name="premiumRaidJoinCount" type="number" min="3" max="30" value="${escapeHtml(settings.premiumRaidJoinCount)}">
          </div>
          <div>
            ${labelHelp('Fenêtre d’arrivée', 'Durée en secondes utilisée pour détecter une vague d’arrivées.', ` ${premiumTag}`)}
            <input name="premiumRaidWindowSeconds" type="number" min="10" max="300" value="${escapeHtml(settings.premiumRaidWindowSeconds)}">
          </div>
          <div>
            ${labelHelp('Grades ignorés', 'IDs de grades ignorés par la garde automatique, séparés par des espaces.', ` ${premiumTag}`)}
            <input name="premiumIgnoredRoleIds" value="${escapeHtml((settings.premiumIgnoredRoleIds || []).join(' '))}" placeholder="ID rôle ID rôle">
          </div>
          <div>
            ${labelHelp('Salons ignorés', 'IDs de salons ou catégories ignorés par la garde automatique, séparés par des espaces.', ` ${premiumTag}`)}
            <input name="premiumIgnoredChannelIds" value="${escapeHtml((settings.premiumIgnoredChannelIds || []).join(' '))}" placeholder="ID salon ID catégorie">
          </div>
        </div>
        <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Enregistrer la veille</button>
      </form>
    </article>
  `;
}

function renderFreeModerationPanel(state, channelOptions, autoRoleOptions) {
  const freeModerationState = {
    ...state,
    advanced: false,
    moderationCases: {
      ...(state.moderationCases || {}),
      limit: 10,
      items: (state.moderationCases?.items || []).slice(0, 10)
    }
  };

  return `
    <section class="dashboard-panel module-panel moderation-panel" id="moderation">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Sécurité gratuite</p>
          <h2>Centre de sécurité</h2>
          <p class="muted">Sanctions essentielles, garde automatique et registre récent du serveur.</p>
        </div>
        <span class="free-badge">Vue Gratuit</span>
      </div>
      ${permissionDiagnosticsPanel(state)}
      <div class="form-grid module-form-grid">
        <article class="inline-form moderation-note">
          ${labelHelp('Grade automatique d’arrivée', 'Donne automatiquement un grade aux nouveaux membres. Sentinel doit être placé au-dessus du grade choisi.')}
          <p class="muted">Actuel : ${state.config.autoRoleId ? escapeHtml(resolveRole(state, state.config.autoRoleId)?.name || 'rôle supprimé sur Discord') : 'désactivé'}</p>
          <form data-action-form="set-auto-role">
            <select name="roleId">${autoRoleOptions}</select>
            <button class="button" type="submit">Configurer le grade</button>
          </form>
          <form data-action-form="disable-auto-role">
            <button class="button button-ghost" type="submit">Désactiver le grade</button>
          </form>
        </article>
        ${automodFreePanel(state)}
        <form data-action-form="warn">
          ${labelHelp('Consigner un avertissement', 'Ajoute un avertissement au dossier disciplinaire d’un utilisateur.')}
          <input name="userId" placeholder="ID utilisateur" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Avertir</button>
        </form>
        <form data-action-form="timeout">
          ${labelHelp('Mise au silence', 'Rend temporairement muet un membre présent pendant la durée indiquée.')}
          <input name="userId" placeholder="ID du membre présent" required>
          <input name="duration" placeholder="10m, 2h, 7d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Mettre au silence</button>
        </form>
        <form data-action-form="untimeout">
          ${labelHelp('Lever le silence', 'Retire un silence actif et conserve une trace de l’action.')}
          <input name="userId" placeholder="ID du membre présent" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Retirer</button>
        </form>
        <form data-action-form="kick">
          ${labelHelp('Expulser', 'Retire un membre du serveur sans le bannir.')}
          <input name="userId" placeholder="ID du membre présent" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Expulser</button>
        </form>
        <form data-action-form="ban">
          ${labelHelp('Bannir par ID', 'Bannit un utilisateur avec son ID, même s’il n’est plus présent.')}
          <input name="userId" placeholder="ID, même hors serveur" required>
          <input name="reason" placeholder="Raison">
          <input name="deleteDays" type="number" min="0" max="7" placeholder="Jours messages">
          <button class="button" type="submit">Bannir</button>
        </form>
        <form data-action-form="purge">
          ${labelHelp('Nettoyer un salon', 'Supprime un nombre défini de messages récents dans le salon choisi.')}
          <select name="channelId">${channelOptions}</select>
          <input name="count" type="number" min="1" max="100" value="10">
          <button class="button" type="submit">Purger</button>
        </form>
        <article class="inline-form moderation-cases-note">
          ${labelHelp('Registre disciplinaire', 'Affiche les dernières mesures enregistrées sur ce serveur.')}
          ${moderationCaseFilters(freeModerationState)}
          ${moderationCaseList(freeModerationState)}
        </article>
      </div>
    </section>
  `;
}

function renderPremiumModerationPanel(state, channelOptions, premiumBadge, premiumTag) {
  return `
    <section class="dashboard-panel premium-panel module-panel premium-view-panel" id="moderation">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Sécurité Premium</p>
          <h2>Veille renforcée</h2>
          <p class="muted">Sanctions avancées, protection automatique renforcée et actions de crise.</p>
        </div>
        ${premiumBadge}
      </div>
      ${permissionDiagnosticsPanel(state)}
      <div class="form-grid module-form-grid">
        <form data-action-form="tempban">
          ${labelHelp('Bannissement temporaire', 'Bannit un utilisateur pour une durée précise, puis Sentinel lève automatiquement le bannissement.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID utilisateur" required>
          <input name="duration" placeholder="1h, 7d, 30d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Bannir temporairement</button>
        </form>
        <form data-action-form="unban">
          ${labelHelp('Lever un bannissement', 'Retire le bannissement d’un utilisateur avec son ID.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID utilisateur" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Débannir</button>
        </form>
        <form data-action-form="lock">
          ${labelHelp('Verrouiller un salon', 'Bloque l’envoi de messages dans un salon.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Verrouiller</button>
        </form>
        <form data-action-form="unlock">
          ${labelHelp('Rouvrir un salon', 'Rétablit l’envoi de messages dans un salon verrouillé.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Rouvrir</button>
        </form>
        <form data-action-form="slowmode">
          ${labelHelp('Ralentir un salon', 'Impose un délai entre deux messages.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="duration" placeholder="10s, 5m, 0">
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Ralentir</button>
        </form>
        <form data-action-form="edit-case">
          ${labelHelp('Corriger un dossier', 'Corrige la raison d’un dossier disciplinaire.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Nouvelle raison" required>
          <button class="button" type="submit">Modifier</button>
        </form>
        <form data-action-form="delete-case">
          ${labelHelp('Retirer un dossier', 'Retire un dossier disciplinaire invalide.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Supprimer</button>
        </form>
        <form data-action-form="unwarn">
          ${labelHelp('Retirer un avertissement', 'Annule un avertissement précis sans effacer l’historique.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas avertissement" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Annuler</button>
        </form>
        ${automodPremiumPanel(state, premiumTag)}
        <form data-action-form="reset-guild">
          ${labelHelp('Remise à zéro générale', 'Remet à zéro toutes les heures de service du serveur.', ` ${premiumTag}`)}
          <button class="button" type="submit">Réinitialiser</button>
        </form>
      </div>
    </section>
  `;
}

function renderModerationPanel(state, channelOptions, autoRoleOptions, premiumBadge, premiumTag) {
  return isPremiumPlanVisible(state)
    ? renderPremiumModerationPanel(state, channelOptions, premiumBadge, premiumTag)
    : renderFreeModerationPanel(state, channelOptions, autoRoleOptions);
}

function profileDossierList(dossiers) {
  if (!dossiers.length) {
    return '<p class="muted">Aucun ticket lié à cet ID.</p>';
  }

  return `
    <ul class="compact-list">
      ${dossiers.slice(0, 6).map((item) => `
        <li>
          <span>#${escapeHtml(item.id)} ${escapeHtml(dossierTypeLabel(item.type))}</span>
          <small>${escapeHtml(dossierStatusLabel(item.status))} - ${escapeHtml(item.subject || 'Sans sujet')}</small>
        </li>
      `).join('')}
    </ul>
  `;
}

function profilePayrollSummary(payroll) {
  if (!payroll) {
    return '<p class="muted">La paie RP n’est pas disponible sur ce serveur.</p>';
  }

  const history = payroll.history || [];

  if (!payroll.line && !history.length) {
    return '<p class="muted">Aucune ligne de paie actuelle ou archivée pour cette personne.</p>';
  }

  return `
    ${payroll.line ? `<div class="profile-payroll-card">
      <div>
        <span>Semaine</span>
        <strong>${escapeHtml(payroll.weekStart)} → ${escapeHtml(payroll.weekEnd)}</strong>
      </div>
      <div>
        <span>Montant estimé</span>
        <strong>${escapeHtml(payroll.line.amountLabel)}</strong>
      </div>
      <div>
        <span>Statut</span>
        <strong>${payroll.line.paid ? 'Payé' : 'À payer'}</strong>
        ${payroll.line.paidAt ? `<small>${escapeHtml(formatSessionDate(payroll.line.paidAt))}</small>` : ''}
      </div>
    </div>` : '<p class="muted">Aucune ligne sur la semaine en cours.</p>'}
    ${history.length ? `
      <div class="profile-payroll-history">
        <h5>Historique de paie</h5>
        <ul class="compact-list">
          ${history.map((item) => `
            <li>
              <span>${escapeHtml(item.weekStart)} → ${escapeHtml(item.weekEnd)}</span>
              <strong>${escapeHtml(item.amountLabel)} · ${item.paid ? 'Payé' : 'À payer'}</strong>
            </li>
          `).join('')}
        </ul>
      </div>
    ` : ''}
  `;
}

function userProfilePanel(profile) {
  if (!profile) {
    return '<p class="muted">Entre un ID Discord pour voir les heures, sanctions, tickets, paie et actions liées à cette personne.</p>';
  }

  const sessions = profile.service?.sessions || [];
  const cases = profile.moderationCases?.items || [];
  const dossiers = profile.dossiers?.items || [];
  const actions = profile.actions || [];
  const payrollLine = profile.payroll?.line || null;
  const tag = profile.user.tag || profile.user.username || profile.user.id;
  const avatarUrl = safeDiscordImageUrl(profile.user.avatar);

  return `
    <div class="user-profile-card">
      <div class="user-profile-head">
        ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="">` : '<span class="user-avatar-placeholder"></span>'}
        <div>
          <h3>${escapeHtml(tag)}</h3>
          <code>${escapeHtml(profile.user.id)}</code>
          <small>${profile.user.inGuild ? 'Présent sur le serveur' : 'Hors du serveur ou introuvable'}</small>
        </div>
      </div>
      <div class="user-profile-stats">
        <article>
          <span>Heures totales</span>
          <strong>${escapeHtml(profile.service.totalTimeLabel)}</strong>
        </article>
        <article>
          <span>Statut service</span>
          <strong>${profile.service.active ? 'En service' : 'Hors service'}</strong>
          ${profile.service.activeDurationLabel ? `<small>${escapeHtml(profile.service.activeDurationLabel)}</small>` : ''}
        </article>
        <article>
          <span>Sessions</span>
          <strong>${escapeHtml(profile.service.sessionCount)}</strong>
        </article>
        <article>
          <span>Sanctions</span>
          <strong>${escapeHtml(cases.length)}</strong>
        </article>
        <article>
          <span>Tickets</span>
          <strong>${escapeHtml(dossiers.length)}</strong>
        </article>
        <article>
          <span>Paie semaine</span>
          <strong>${payrollLine ? escapeHtml(payrollLine.amountLabel) : 'Aucune'}</strong>
          ${payrollLine ? `<small>${payrollLine.paid ? 'Payé' : 'À payer'}</small>` : ''}
        </article>
      </div>
      <div class="user-profile-columns">
        <div>
          <h4>Dernières sessions</h4>
          ${sessions.length
            ? `<ul class="compact-list">${sessions.map((session) => `<li><span>${escapeHtml(formatSessionDate(session.date))}</span><strong>${escapeHtml(session.durationLabel)}</strong></li>`).join('')}</ul>`
            : '<p class="muted">Aucune session terminée.</p>'}
        </div>
        <div>
          <h4>Sanctions</h4>
          ${cases.length
            ? `<ul class="compact-list">${cases.map((item) => `<li><span>#${escapeHtml(item.id)} ${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</span><small>${escapeHtml(item.reason || 'Aucune raison')}</small></li>`).join('')}</ul>`
            : '<p class="muted">Aucune sanction enregistrée.</p>'}
        </div>
        <div>
          <h4>Tickets liés</h4>
          ${profileDossierList(dossiers)}
        </div>
        <div>
          <h4>Paie de la semaine</h4>
          ${profilePayrollSummary(profile.payroll)}
        </div>
        <div class="user-profile-wide">
          <h4>Dernières actions liées</h4>
          ${actions.length
            ? `<ul class="compact-list">${actions.map((item) => `<li><span>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</span><small>${escapeHtml(formatAuditDate(item.createdAt))} - ${escapeHtml(item.summary)}</small></li>`).join('')}</ul>`
            : '<p class="muted">Aucune action récente liée à cet ID.</p>'}
        </div>
      </div>
    </div>
  `;
}

function auditLogList(state) {
  const items = state.auditLogs?.items || [];

  if (items.length === 0) {
    return '<p class="muted">Aucune action trouvée avec ces filtres.</p>';
  }

  return `
    <div class="table-shell audit-table-shell">
      <table class="dashboard-table audit-table">
        <thead>
          <tr>
            <th>Origine</th>
            <th>Action</th>
            <th>Auteur</th>
            <th>Cible</th>
            <th>Serveur</th>
            <th>Date</th>
            <th>Résultat</th>
          </tr>
        </thead>
        <tbody>
      ${items.map((item) => `
          <tr class="audit-${escapeHtml(item.status)}">
            <td>${statusBadge(auditSourceLabel(item.source), true, item.source === 'discord' ? 'is-discord' : 'is-site')}</td>
            <td>
              <strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong>
              <small>${escapeHtml(item.summary)}</small>
            </td>
            <td>${escapeHtml(auditActorLabel(item))}</td>
            <td>
              <span>${escapeHtml(auditTargetTypeLabel(item.targetType))}</span>
              <small>${escapeHtml(auditTargetLabel(item, state))}</small>
            </td>
            <td>${escapeHtml(item.guildName || item.guildId || '-')}</td>
            <td>${escapeHtml(formatAuditDate(item.createdAt))}</td>
            <td>${statusBadge(auditStatusLabel(item.status), item.status !== 'failed')}</td>
          </tr>
      `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderFreeAuditPanel(state) {
  const items = (state.auditLogs?.items || []).slice(0, 10);
  const freeState = {
    ...state,
    auditLogs: {
      ...(state.auditLogs || {}),
      items
    }
  };

  return `
    <section class="dashboard-panel" id="audit">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Historique gratuit</p>
          <h2>Dernières actions</h2>
          <p class="muted">Les dix dernières actions du serveur, sans les filtres et recherches Premium.</p>
        </div>
        <span class="free-badge">Vue Gratuit</span>
      </div>
      <div class="audit-scope-note">
        <span>Journal récent du serveur sélectionné</span>
        <small>${escapeHtml(items.length)} entrée(s) affichée(s)</small>
      </div>
      ${auditLogList(freeState)}
    </section>
  `;
}

function renderAuditPanel(state) {
  if (!isPremiumPlanVisible(state)) {
    return renderFreeAuditPanel(state);
  }

  const auditLogs = state.auditLogs || {};
  const canViewGlobal = Boolean(auditLogs.canViewGlobal);
  const currentScope = canViewGlobal ? auditScope : 'server';
  const auditItems = auditLogs.items || [];
  const successCount = auditItems.filter((item) => item.status !== 'failed').length;
  const failedCount = auditItems.filter((item) => item.status === 'failed').length;
  const siteCount = auditItems.filter((item) => item.source === 'site').length;
  const discordCount = auditItems.filter((item) => item.source === 'discord').length;

  return `
    <section class="dashboard-panel" id="audit">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Historique</p>
          <h2>Journal des actions</h2>
          <p class="muted">Chaque ligne indique qui a agi, depuis où, sur quoi, et si l’action a réussi.</p>
        </div>
        <span class="premium-badge">Premium sécurité</span>
      </div>
      ${globalLookupPanel(state)}
      <div class="audit-overview">
        <article><span>Actions affichées</span><strong>${escapeHtml(auditItems.length)}</strong></article>
        <article><span>Réussites</span><strong>${escapeHtml(successCount)}</strong></article>
        <article><span>Échecs</span><strong>${escapeHtml(failedCount)}</strong></article>
        <article><span>Site / Discord</span><strong>${escapeHtml(siteCount)} / ${escapeHtml(discordCount)}</strong></article>
      </div>
      <form class="audit-filters" data-audit-filter>
        <div class="audit-field">
          ${labelHelp('Auteur', 'Filtre les actions faites par un utilisateur précis avec son ID Discord.')}
          <input name="actorUserId" placeholder="ID Discord auteur" value="${escapeHtml(auditFilters.actorUserId || '')}">
        </div>
        <div class="audit-field">
          ${labelHelp('Cible', 'Filtre les actions qui concernent un membre, un rôle, un salon, un message ou un cas précis.')}
          <input name="targetId" placeholder="ID cible" value="${escapeHtml(auditFilters.targetId || '')}">
        </div>
        <div class="audit-field">
          ${labelHelp('Action', 'Filtre par type d’action : reset, ban, embed, configuration, etc.')}
          <select name="action">${auditActionOptions(auditFilters.action || '')}</select>
        </div>
        <div class="audit-field">
          ${labelHelp('Statut', 'Affiche seulement les actions réussies, échouées, ou les deux.')}
          <select name="status">
            <option value=""${!auditFilters.status ? ' selected' : ''}>Tous les statuts</option>
            <option value="success"${auditFilters.status === 'success' ? ' selected' : ''}>Succès</option>
            <option value="failed"${auditFilters.status === 'failed' ? ' selected' : ''}>Échec</option>
          </select>
        </div>
        <div class="audit-field">
          ${labelHelp('Origine', 'Filtre les actions selon leur provenance : site ou Discord.')}
          <select name="source">${auditSourceOptions(auditFilters.source || '')}</select>
        </div>
        <div class="audit-field">
          ${labelHelp('Limite', 'Nombre maximum de lignes affichées. Les serveurs Premium et la créatrice ont une limite plus haute.')}
          <input name="limit" type="number" min="1" max="100" value="${escapeHtml(auditFilters.limit || auditLogs.limit || 25)}">
        </div>
        <div class="audit-actions">
          <button class="button" type="submit">Filtrer l’historique</button>
          <button class="button button-ghost" type="button" data-audit-reset>Réinitialiser</button>
          ${canViewGlobal ? `
            <button class="button button-ghost" type="button" data-audit-scope="${currentScope === 'global' ? 'server' : 'global'}">
              ${currentScope === 'global' ? 'Vue serveur' : 'Vue globale créatrice'}
            </button>
          ` : ''}
        </div>
      </form>
      <div class="audit-scope-note">
        <span>${currentScope === 'global' ? 'Vue créatrice, tous les serveurs' : 'Journal limité au serveur sélectionné'}</span>
        <small>${escapeHtml((state.auditLogs?.items || []).length)} entrée(s) affichée(s)</small>
      </div>
      ${auditLogList(state)}
    </section>
  `;
}

function premiumScopeLabel(scope) {
  if (scope === 'server') return 'Premium serveur';
  if (scope === 'partial') return 'Premium partiel';
  return 'Gratuit';
}

function premiumScopeReady(scope) {
  return scope === 'server' || scope === 'partial';
}

function premiumNameList(items = [], emptyText = 'Aucun', options = {}) {
  if (!items.length) {
    return `<span class="muted">${escapeHtml(emptyText)}</span>`;
  }

  const target = options.target || null;
  const guildId = options.guildId || null;
  const canManage = canManageFounderPanel();

  return `
    <ul class="compact-list founder-premium-list">
      ${items.map((item) => `
        <li class="${item.exists === false || item.inGuild === false ? 'is-warning' : ''}">
          <span>
            <strong>${escapeHtml(item.name || item.tag || item.username || item.id)}</strong>
            <small><code>${escapeHtml(item.id)}</code>${item.inGuild === false ? ' - hors serveur' : ''}${item.exists === false ? ' - supprimé sur Discord' : ''}</small>
          </span>
          ${target && canManage ? `
            <button
              class="button button-small button-ghost"
              type="button"
              data-creator-premium-click
              data-action="remove"
              data-target="${escapeHtml(target)}"
              ${target === 'role' ? `data-guild-id="${escapeHtml(guildId)}" data-role-id="${escapeHtml(item.id)}"` : `data-user-id="${escapeHtml(item.id)}"`}
            >Retirer</button>
          ` : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

function siteStaffList(overview) {
  const staff = overview?.staff || [];

  if (!staff.length) {
    return '<p class="muted">Aucun accès staff site actif.</p>';
  }

  return `
    <ul class="compact-list founder-premium-list site-staff-list">
      ${staff.map((item) => `
        <li class="${item.discordRoleVerified ? '' : 'is-warning'}">
          <span>
            <strong>${escapeHtml(item.globalName || item.tag || item.username || item.id)}</strong>
            <small><code>${escapeHtml(item.id)}</code>${item.createdAt ? ` - depuis ${escapeHtml(formatAuditDate(item.createdAt))}` : ''}</small>
            <small>${item.discordRoleVerified ? 'Rôle Discord vérifié' : (item.inReferenceGuild ? 'Rôle staff Discord manquant' : 'Hors du Discord Sentinel')}</small>
          </span>
          ${canManageFounderPanel() ? `
            <button
              class="button button-small button-ghost"
              type="button"
              data-creator-staff-click
              data-action="remove"
              data-user-id="${escapeHtml(item.id)}"
            >Retirer</button>
          ` : ''}
        </li>
      `).join('')}
    </ul>
  `;
}

function formatStorageBytes(value) {
  const bytes = Math.max(Number(value) || 0, 0);

  if (bytes < 1024) return `${Math.round(bytes)} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

function backupGenerationLabel(generations = []) {
  const labels = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle', latest: 'Récente' };
  return generations.map(value => labels[value] || value).join(' · ') || 'Copie supplémentaire';
}

function founderBackupHistory(storage, canManage) {
  const backups = storage.backups || [];

  if (!backups.length) {
    return '<p class="muted">Aucune copie protégée disponible.</p>';
  }

  return `
    <div class="maintenance-file-list">
      ${backups.slice(0, 12).map((backup) => {
        const verified = backup.verification?.status === 'ok';
        return `
          <div class="maintenance-file-row">
            <span>
              <strong>${escapeHtml(backupGenerationLabel(backup.generations))}</strong>
              <small>${escapeHtml(formatAuditDate(backup.createdAt))} · ${escapeHtml(formatStorageBytes(backup.sizeBytes))}</small>
              <small>${verified ? `Intégrité vérifiée ${escapeHtml(formatAuditDate(backup.verification.checkedAt))}` : 'Contrôle d’intégrité à effectuer'}</small>
            </span>
            ${canManage ? `
              <span class="maintenance-file-actions">
                <button class="button button-small button-ghost" type="button" data-maintenance-download data-kind="backup" data-file="${escapeHtml(backup.fileName)}">Télécharger</button>
                <button class="button button-small button-ghost" type="button" data-maintenance-action="verify-backup" data-file="${escapeHtml(backup.fileName)}">Vérifier</button>
              </span>
            ` : statusBadge(verified ? 'Vérifiée' : 'En attente', verified)}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function founderColdArchiveHistory(storage, canManage) {
  const archives = storage.coldArchives || [];

  if (!archives.length) {
    return '<p class="muted">Aucun journal n’a encore rejoint l’historique froid.</p>';
  }

  return `
    <div class="maintenance-file-list">
      ${archives.slice(0, 10).map((archive) => `
        <div class="maintenance-file-row">
          <span>
            <strong>${archive.table === 'guild_automod_events' ? 'Registre de sûreté' : 'Journal de régie'}</strong>
            <small>${escapeHtml(archive.rowCount)} entrée(s) · ${escapeHtml(formatStorageBytes(archive.sizeBytes))}</small>
            <small>${archive.fromAt ? `${escapeHtml(formatAuditDate(archive.fromAt))} → ${escapeHtml(formatAuditDate(archive.toAt))}` : escapeHtml(formatAuditDate(archive.createdAt))}</small>
          </span>
          ${canManage ? `<button class="button button-small button-ghost" type="button" data-maintenance-download data-kind="archive" data-file="${escapeHtml(archive.fileName)}">Télécharger</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function founderStoragePanel(overview) {
  const storage = overview?.storage;

  if (!storage) return '';

  if (storage.error) {
    return `<section class="founder-storage-panel" aria-label="Stockage Sentinel"><div class="founder-console-note"><strong>Stockage Sentinel</strong><span>Le relevé est momentanément indisponible.</span></div></section>`;
  }

  const canManage = canManageFounderPanel();
  const maintenance = storage.lastMaintenance || null;
  const cleanup = maintenance?.cleanup || {};
  const volume = storage.volume || {};
  const media = storage.media || {};
  const objectStorage = media.objectStorage || {};
  const objectStorageLabel = objectStorage.configured
    ? `${String(objectStorage.provider || 'S3').toUpperCase()} actif`
    : (objectStorage.enabled ? 'Configuration incomplète' : 'Repli local');
  const performance = storage.performance || {};
  const databasePerformance = performance.database || {};
  const runtime = performance.runtime || {};
  const generations = storage.generations || {};
  const alerts = storage.alerts || [];
  const allCompressed = storage.count > 0 && storage.compressedCount === storage.count;
  const usagePercent = Math.max(Math.min(Number(volume.usagePercent) || 0, 100), 0);

  return `
    <section class="founder-storage-panel" aria-label="Centre de maintenance Sentinel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Conservation</p>
          <h3>Centre de maintenance</h3>
          <p class="muted">Les dossiers, services, sanctions et archives de paie restent dans le registre actif. Les anciens journaux techniques sont conservés sous forme compressée.</p>
        </div>
        ${statusBadge(alerts.length ? `${alerts.length} alerte(s)` : (allCompressed ? 'Sous contrôle' : 'Entretien en cours'), !alerts.length)}
      </div>
      ${alerts.length ? `<div class="maintenance-alerts">${alerts.map(alert => `<p><strong>Seuil ${escapeHtml(alert.level)} :</strong> ${escapeHtml(alert.message)}</p>`).join('')}</div>` : ''}
      <div class="storage-capacity">
        <span><strong>Volume utilisé</strong><small>${escapeHtml(formatStorageBytes(volume.usedBytes))} / ${escapeHtml(formatStorageBytes(volume.totalBytes))}</small></span>
        <div class="storage-capacity-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(usagePercent)}"><span style="width:${escapeHtml(usagePercent)}%"></span></div>
        <strong>${escapeHtml(usagePercent)} %</strong>
      </div>
      <div class="dashboard-metrics dashboard-kpis founder-storage-kpis">
        <article class="dashboard-kpi"><span>Base active</span><strong>${escapeHtml(formatStorageBytes(storage.databaseBytes))}</strong><small>données opérationnelles</small></article>
        <article class="dashboard-kpi"><span>Copies protégées</span><strong>${escapeHtml(formatStorageBytes(storage.backupBytes))}</strong><small>${escapeHtml(storage.count)} copie(s)</small></article>
        <article class="dashboard-kpi"><span>Historique froid</span><strong>${escapeHtml(formatStorageBytes(storage.archiveBytes))}</strong><small>${escapeHtml(storage.coldArchives?.length || 0)} lot(s) consultable(s)</small></article>
        <article class="dashboard-kpi"><span>Médias locaux</span><strong>${escapeHtml(formatStorageBytes(media.objectBytes))}</strong><small>${escapeHtml(media.localObjectCount || 0)} objet(s) · plafond ${escapeHtml(formatStorageBytes(media.maxBytes))}</small></article>
        <article class="dashboard-kpi"><span>Stockage objet</span><strong>${escapeHtml(formatStorageBytes(media.externalObjectBytes))}</strong><small>${escapeHtml(media.externalObjectCount || 0)} objet(s) · ${escapeHtml(objectStorageLabel)}</small></article>
      </div>
      <div class="maintenance-grid">
        <section class="maintenance-section">
          <div class="panel-heading row-heading"><div><h4>Répartition de la base</h4><p class="muted">Occupation estimée par registre.</p></div></div>
          <div class="storage-distribution">
            ${(storage.distribution || []).map(item => `<div><span>${escapeHtml(item.name)}</span><strong>${escapeHtml(formatStorageBytes(item.sizeBytes))}</strong></div>`).join('') || '<p class="muted">Répartition indisponible.</p>'}
          </div>
        </section>
        <section class="maintenance-section">
          <div class="panel-heading row-heading"><div><h4>Surveillance</h4><p class="muted">Relevé depuis le dernier démarrage.</p></div></div>
          <div class="storage-distribution">
            <div><span>Requêtes SQLite</span><strong>${escapeHtml(databasePerformance.queryCount || 0)}</strong></div>
            <div><span>Requêtes lentes</span><strong>${escapeHtml(databasePerformance.slowQueryCount || 0)}</strong></div>
            <div><span>Erreurs SQLite</span><strong>${escapeHtml(databasePerformance.errorCount || 0)}</strong></div>
            <div><span>Site, réponse p95</span><strong>${escapeHtml(runtime.dashboard?.p95Ms || 0)} ms</strong></div>
            <div><span>Erreurs du site</span><strong>${escapeHtml(runtime.dashboard?.errorCount || 0)}</strong></div>
            <div><span>Discord, réponse p95</span><strong>${escapeHtml(runtime.discord?.p95Ms || 0)} ms</strong></div>
            <div><span>Signal Discord</span><strong>${escapeHtml(runtime.discord?.gatewayPingMs || 0)} ms</strong></div>
          </div>
        </section>
        <section class="maintenance-section">
          <div class="panel-heading row-heading"><div><h4>Médias d’embeds</h4><p class="muted">Conversion WebP, détection des doublons et corbeille de 30 jours.</p></div></div>
          <div class="storage-distribution">
            <div><span>Destination</span><strong>${escapeHtml(objectStorageLabel)}</strong></div>
            <div><span>Liens actifs</span><strong>${escapeHtml(media.activeCount || 0)}</strong></div>
            <div><span>En corbeille</span><strong>${escapeHtml((media.trashCount || 0) + (media.orphanObjectCount || 0))}</strong></div>
            <div><span>Hébergés uniquement par Discord</span><strong>${escapeHtml(media.remoteOnlyCount || 0)}</strong></div>
            <div><span>Quota gratuit</span><strong>${escapeHtml(formatStorageBytes(media.freeQuotaBytes))}</strong></div>
            <div><span>Quota Premium</span><strong>${escapeHtml(formatStorageBytes(media.premiumQuotaBytes))}</strong></div>
          </div>
        </section>
        <section class="maintenance-section">
          <div class="panel-heading row-heading"><div><h4>Plan de reprise</h4><p class="muted">${escapeHtml(generations.daily || 0)} quotidiennes · ${escapeHtml(generations.weekly || 0)} hebdomadaires · ${escapeHtml(generations.monthly || 0)} mensuelles</p></div></div>
          <div class="storage-distribution">
            <div><span>Dernière copie</span><strong>${storage.latestAt ? escapeHtml(formatAuditDate(storage.latestAt)) : 'Absente'}</strong></div>
            <div><span>Dernier contrôle</span><strong>${storage.latestVerifiedAt ? escapeHtml(formatAuditDate(storage.latestVerifiedAt)) : 'À effectuer'}</strong></div>
            <div><span>Copies compressées</span><strong>${escapeHtml(storage.compressedCount)} / ${escapeHtml(storage.count)}</strong></div>
          </div>
        </section>
      </div>
      ${canManage ? `
        <div class="maintenance-toolbar">
          <button class="button button-small" type="button" data-maintenance-action="run-maintenance">Lancer l’entretien</button>
          <button class="button button-small button-ghost" type="button" data-maintenance-action="scan-media">Contrôler les médias</button>
        </div>
      ` : ''}
      <details class="maintenance-history" open>
        <summary>Copies protégées</summary>
        ${founderBackupHistory(storage, canManage)}
      </details>
      <details class="maintenance-history">
        <summary>Historique froid</summary>
        ${founderColdArchiveHistory(storage, canManage)}
      </details>
      ${canManage && storage.backups?.length ? `
        <details class="maintenance-history maintenance-restore">
          <summary>Restauration fondatrice</summary>
          <form data-maintenance-restore-form>
            <label><span>Copie à restaurer</span><select name="fileName" required>${storage.backups.map(item => `<option value="${escapeHtml(item.fileName)}">${escapeHtml(formatAuditDate(item.createdAt))} · ${escapeHtml(backupGenerationLabel(item.generations))}</option>`).join('')}</select></label>
            <label><span>Confirmation</span><input name="confirmation" autocomplete="off" placeholder="RESTAURER SENTINEL" required></label>
            <button class="button button-small" type="submit">Préparer la restauration</button>
          </form>
        </details>
      ` : ''}
      <div class="founder-console-note">
        <strong>Dernier entretien</strong>
        <span>${maintenance?.completedAt
          ? `${escapeHtml(formatAuditDate(maintenance.completedAt))} · ${escapeHtml((cleanup.expiredSessions || 0))} session(s) expirée(s) · ${escapeHtml((cleanup.automodEvents || 0) + (cleanup.dashboardAuditLogs || 0))} entrée(s) archivée(s).`
          : 'Le premier entretien sera lancé automatiquement au démarrage.'}</span>
      </div>
    </section>
  `;
}

function creatorStaffManagePanel(overview) {
  return `
    <div class="founder-console-note">
      <strong>Accès de régie</strong>
      <span>L’accès exige les deux validations : ajout par le fondateur dans la Régie et rôle staff sur le Discord Sentinel. Seul le fondateur peut accorder Premium ou modifier ces accès.</span>
    </div>
    ${canManageFounderPanel() ? `
      <form class="creator-premium-form creator-staff-form" data-creator-staff-form>
        <input type="hidden" name="action" value="add">
        ${labelHelp('Ajouter un staff site', 'La personne doit déjà être sur le Discord Sentinel et y posséder un rôle staff configuré. Utilise son ID Discord numérique complet.')}
        <div class="creator-premium-row">
          <input name="userId" placeholder="ID utilisateur Discord" required>
          <button class="button button-small" type="submit">Ajouter staff</button>
        </div>
      </form>
    ` : ''}
    ${siteStaffList(overview)}
  `;
}

function creatorPremiumGuildOptions(overview) {
  return (overview?.guilds || [])
    .map((guild) => `<option value="${escapeHtml(guild.id)}">${escapeHtml(guild.name)}</option>`)
    .join('');
}

function creatorPremiumManagePanel(overview) {
  const guildOptions = creatorPremiumGuildOptions(overview);
  const canManage = canManageFounderPanel();

  return `
    <datalist id="creator-premium-guilds">
      ${guildOptions}
    </datalist>
    <div class="founder-console-note">
      <strong>Attribution rapide</strong>
      <span>${canManage
        ? 'Accorde ou retire un accès Premium à un serveur entier, à un grade d’un serveur, ou à une personne précise.'
        : 'Vue lecture seule : les attributions Premium restent réservées au fondateur.'}</span>
    </div>
    ${canManage ? `
    <div class="creator-premium-actions">
      <form class="creator-premium-form" data-creator-premium-form>
        <input type="hidden" name="target" value="server">
        ${labelHelp('Accès serveur', 'Accorde ou retire le Premium complet sur un serveur Sentinel avec son ID.')}
        <div class="creator-premium-row">
          <select name="action">
            <option value="add">Ajouter</option>
            <option value="remove">Retirer</option>
          </select>
          <input name="guildId" list="creator-premium-guilds" placeholder="ID serveur" required>
          <button class="button button-small" type="submit">Appliquer</button>
        </div>
      </form>
      <form class="creator-premium-form" data-creator-premium-form>
        <input type="hidden" name="target" value="role">
        ${labelHelp('Accès par grade', 'Accorde ou retire un grade Premium sur un serveur où Sentinel est installé.')}
        <div class="creator-premium-row">
          <select name="action">
            <option value="add">Ajouter</option>
            <option value="remove">Retirer</option>
          </select>
          <input name="guildId" list="creator-premium-guilds" placeholder="ID serveur" required>
          <input name="roleId" placeholder="ID rôle" required>
          <button class="button button-small" type="submit">Appliquer</button>
        </div>
      </form>
      <form class="creator-premium-form" data-creator-premium-form>
        <input type="hidden" name="target" value="user">
        ${labelHelp('Accès personnel', 'Accorde un accès Premium global à un ID, ou retire son Premium partout.')}
        <div class="creator-premium-row">
          <select name="action">
            <option value="add">Ajouter</option>
            <option value="remove">Retirer partout</option>
          </select>
          <input name="userId" placeholder="ID utilisateur" required>
          <input name="guildId" list="creator-premium-guilds" placeholder="Serveur rattachement optionnel">
          <button class="button button-small" type="submit">Appliquer</button>
        </div>
      </form>
    </div>
    ` : ''}
  `;
}

function founderPremiumGuildRows(overview) {
  const guildItems = overview?.guilds || [];

  if (!guildItems.length) {
    return '<p class="muted">Aucun serveur Sentinel trouvé pour le moment.</p>';
  }

  return `
    <div class="table-shell founder-premium-table-shell">
      <table class="dashboard-table founder-premium-table">
        <thead>
          <tr>
            <th>Poste</th>
            <th>Accès</th>
            <th>Motif</th>
            <th>Grades Premium</th>
            <th>Personnes Premium</th>
            <th>Contrôle</th>
          </tr>
        </thead>
        <tbody>
          ${guildItems.map((guild) => `
            <tr class="premium-row-${escapeHtml(guild.premiumScope || 'none')}">
              <td>
                <strong>${escapeHtml(guild.name)}</strong>
                <small><code>${escapeHtml(guild.id)}</code>${guild.memberCount ? ` - ${escapeHtml(guild.memberCount)} membres` : ''}</small>
              </td>
              <td>${statusBadge(premiumScopeLabel(guild.premiumScope), premiumScopeReady(guild.premiumScope), guild.premiumScope === 'server' ? 'is-site' : '')}</td>
              <td>
                ${guild.reasons?.length
                  ? `<ul class="compact-list founder-reason-list">${guild.reasons.map((reason) => `<li><span>${escapeHtml(reason)}</span></li>`).join('')}</ul>`
                  : '<span class="muted">Aucun accès Premium actif.</span>'}
                ${guild.referenceStaffRoles?.length
                  ? `<small>Grades de régie auto : ${guild.referenceStaffRoles.map((role) => escapeHtml(role.name || role.id)).join(', ')}</small>`
                  : ''}
              </td>
              <td>${premiumNameList(guild.premiumRoles, 'Aucun grade Premium', { target: 'role', guildId: guild.id })}</td>
              <td>${premiumNameList(guild.premiumUsers, 'Aucune personne Premium', { target: 'user' })}</td>
              <td>
                ${!canManageFounderPanel()
                  ? '<span class="muted">Lecture seule</span>'
                  : guild.configuredPremium && !guild.manualPremium
                  ? '<span class="muted">Accès fixe</span>'
                  : `<button
                      class="button button-small ${guild.manualPremium ? 'button-ghost' : ''}"
                      type="button"
                      data-creator-premium-click
                      data-action="${guild.manualPremium ? 'remove' : 'add'}"
                      data-target="server"
                      data-guild-id="${escapeHtml(guild.id)}"
                    >${guild.manualPremium ? 'Retirer accès' : 'Accorder accès'}</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderFounderPremiumPanel() {
  if (!canShowFounderTab()) {
    return '';
  }

  const overview = creatorOverview;
  const access = overview?.access || currentSiteAccess || currentState?.siteAccess || {};
  const summary = overview?.summary || {
    guildCount: 0,
    serverPremiumCount: 0,
    partialPremiumCount: 0,
    freeCount: 0,
    premiumRoleCount: 0,
    premiumUserCount: 0
  };

  return `
    <section class="dashboard-panel module-panel founder-premium-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Régie Sentinel</p>
          <h2>${access?.canManageSiteStaff ? 'Console fondateur' : 'Console staff'}</h2>
          <p class="muted">${access?.canManageSiteStaff
            ? 'Vue privée des accès site, des staffs autorisés et des accès Premium.'
            : 'Vue privée de régie : lecture des accès et suivi global sans commandes fondatrices.'}</p>
        </div>
        <span class="status-badge is-site">${escapeHtml(siteAccessLabel(access))}</span>
        <button class="button button-small button-ghost" type="button" data-refresh-creator-premium ${creatorOverviewLoading ? 'disabled' : ''}>
          ${creatorOverviewLoading ? 'Lecture...' : 'Relire'}
        </button>
      </div>
      <div class="dashboard-metrics dashboard-kpis founder-premium-kpis">
        <article class="dashboard-kpi">
          <span>Postes suivis</span>
          <strong>${escapeHtml(summary.guildCount)}</strong>
          <small>où Sentinel est installé</small>
        </article>
        <article class="dashboard-kpi">
          <span>Accès complet</span>
          <strong>${escapeHtml(summary.serverPremiumCount)}</strong>
          <small>serveur entier</small>
        </article>
        <article class="dashboard-kpi">
          <span>Accès ciblés</span>
          <strong>${escapeHtml(summary.partialPremiumCount)}</strong>
          <small>grade ou personne</small>
        </article>
        <article class="dashboard-kpi">
          <span>Sans accès</span>
          <strong>${escapeHtml(summary.freeCount)}</strong>
          <small>aucun accès Premium</small>
        </article>
        <article class="dashboard-kpi">
          <span>Grades</span>
          <strong>${escapeHtml(summary.premiumRoleCount)}</strong>
          <small>accès Premium manuels</small>
        </article>
        <article class="dashboard-kpi">
          <span>Personnes</span>
          <strong>${escapeHtml(summary.premiumUserCount)}</strong>
          <small>accès Premium manuel</small>
        </article>
      </div>
      ${founderStoragePanel(overview)}
      ${creatorStaffManagePanel(overview)}
      ${creatorPremiumManagePanel(overview)}
      ${creatorOverviewLoading && !overview
        ? '<p class="muted">Lecture de la régie Sentinel...</p>'
        : founderPremiumGuildRows(overview)}
      ${overview?.generatedAt ? `<p class="muted">Dernière lecture : ${escapeHtml(formatAuditDate(overview.generatedAt))}</p>` : ''}
    </section>
  `;
}

function helpTip(text) {
  const safeText = escapeHtml(text);

  return `<button class="field-help" type="button" data-tooltip="${safeText}" aria-label="${safeText}">?</button>`;
}

function labelHelp(label, help, addon = '') {
  return `<label><span>${escapeHtml(label)}</span>${addon} ${helpTip(help)}</label>`;
}

const DASHBOARD_TABS = [
  {
    id: 'overview',
    label: 'Accueil',
    eyebrow: 'Vue claire',
    title: 'Accueil serveur',
    description: 'État, alertes et actions récentes'
  },
  {
    id: 'setup',
    label: 'Premiers pas',
    eyebrow: 'Guide',
    title: 'Configuration guidée',
    description: 'Installer dans le bon ordre'
  },
  {
    id: 'configuration',
    label: 'Réglages',
    eyebrow: 'Base',
    title: 'Configuration',
    description: 'Langue, rôles et logs'
  },
  {
    id: 'service',
    label: 'Service & paie',
    eyebrow: 'Heures',
    title: 'Service et paie',
    description: 'Présences, salaires et paiements'
  },
  {
    id: 'dossiers',
    label: 'Tickets',
    eyebrow: 'Support',
    title: 'Tickets et dossiers',
    description: 'Demandes privées et suivi staff'
  },
  {
    id: 'moderation',
    label: 'Modération',
    eyebrow: 'Sécurité',
    title: 'Sanctions',
    description: 'Sanctions, auto-rôle et permissions'
  },
  {
    id: 'embeds',
    label: 'Annonces',
    eyebrow: 'Messages',
    title: 'Embeds et annonces',
    description: 'Messages propres sous Sentinel'
  },
  {
    id: 'audit',
    label: 'Historique',
    eyebrow: 'Traces',
    title: 'Journal des actions',
    description: 'Retrouver qui a fait quoi'
  },
  {
    id: 'founder',
    label: 'Régie',
    eyebrow: 'Accès site',
    title: 'Régie Sentinel',
    description: 'Fonda, staff et accès Premium'
  }
];

const DASHBOARD_TAB_GROUPS = [
  {
    label: 'Démarrer',
    tabs: ['overview', 'setup', 'configuration']
  },
  {
    label: 'Gérer',
    tabs: ['service', 'dossiers', 'moderation', 'embeds']
  },
  {
    label: 'Contrôler',
    tabs: ['audit']
  },
  {
    label: 'Régie',
    tabs: ['founder']
  }
];

function canShowFounderTab(state = currentState) {
  return Boolean(
    canViewPremiumOverview
    || currentSiteAccess?.canViewSitePanel
    || state?.creator?.canViewPremiumOverview
    || state?.siteAccess?.canViewSitePanel
    || creatorOverview?.canView
  );
}

function canManageFounderPanel() {
  return Boolean(
    currentSiteAccess?.canManagePremium
    || currentSiteAccess?.canManageSiteStaff
    || creatorOverview?.access?.canManagePremium
    || creatorOverview?.access?.canManageSiteStaff
    || currentState?.siteAccess?.canManagePremium
    || currentState?.siteAccess?.canManageSiteStaff
  );
}

function siteAccessLabel(access = currentSiteAccess) {
  if (access?.isFounder || access?.role === 'founder') return 'Fondateur';
  if (access?.isStaff || access?.role === 'staff') return 'Régie staff';
  return 'Utilisateur';
}

function availableDashboardTabs(state = currentState) {
  return DASHBOARD_TABS.filter((tab) => tab.id !== 'founder' || canShowFounderTab(state));
}

function canUsePremiumPlan(state = currentState) {
  return Boolean(state?.advanced);
}

function isPremiumPlanVisible(state = currentState) {
  return canUsePremiumPlan(state) && dashboardPlanMode === 'premium';
}

function ensureDashboardPlanMode(state = currentState) {
  if (!canUsePremiumPlan(state)) {
    dashboardPlanMode = 'free';
  }
}

function renderDashboardPlanToggle(state) {
  const premiumUnlocked = canUsePremiumPlan(state);
  const premiumActive = isPremiumPlanVisible(state);
  const premiumLabel = premiumUnlocked ? 'Premium' : 'Premium verrouillé';

  return `
    <div class="dashboard-plan-switch" aria-label="Mode du dashboard">
      <span>Mode</span>
      <div class="dashboard-plan-buttons">
        <button
          type="button"
          class="dashboard-plan-button${dashboardPlanMode === 'free' ? ' is-active' : ''}"
          data-dashboard-plan="free"
          aria-pressed="${dashboardPlanMode === 'free' ? 'true' : 'false'}"
        >Gratuit</button>
        <button
          type="button"
          class="dashboard-plan-button${premiumActive ? ' is-active' : ''}${premiumUnlocked ? '' : ' is-locked'}"
          data-dashboard-plan="premium"
          aria-pressed="${premiumActive ? 'true' : 'false'}"
          ${premiumUnlocked ? '' : 'disabled'}
        >${escapeHtml(premiumLabel)}</button>
      </div>
    </div>
  `;
}

function renderDashboardTabs(state, premiumBadge) {
  const tabs = availableDashboardTabs(state);
  const activeTab = tabs.find((tab) => tab.id === activeDashboardTab) || tabs[0] || DASHBOARD_TABS[0];
  const syncBadge = dashboardHydrating
    ? '<span class="status-badge is-syncing">Actualisation</span>'
    : '';

  return `
    <section class="dashboard-control-panel">
      <div class="control-summary">
        <p class="eyebrow">Serveur sélectionné</p>
        <h2>${escapeHtml(activeTab.title)}</h2>
        <p>${escapeHtml(state.guild.name)}</p>
      </div>
      <div class="control-status">
        ${syncBadge}
        ${premiumBadge}
        ${renderDashboardPlanToggle(state)}
        <button class="button button-small button-ghost" type="button" data-open-guild-drawer aria-controls="guild-drawer" aria-expanded="false">Changer de serveur</button>
      </div>
      <nav class="dashboard-tab-groups" aria-label="Sections du dashboard">
        ${DASHBOARD_TAB_GROUPS.map((group) => `
          <section class="dashboard-tab-group">
            <span class="dashboard-tab-group-label">${escapeHtml(group.label)}</span>
            <div class="dashboard-tabs">
              ${group.tabs.map((tabId) => tabs.find((tab) => tab.id === tabId)).filter(Boolean).map((tab) => `
                <button
                  type="button"
                  class="dashboard-tab${tab.id === activeDashboardTab ? ' is-active' : ''}"
                  data-dashboard-tab="${tab.id}"
                  aria-pressed="${tab.id === activeDashboardTab ? 'true' : 'false'}"
                >
                  <span>${escapeHtml(tab.eyebrow)}</span>
                  <strong>${escapeHtml(tab.label)}</strong>
                  <small>${escapeHtml(tab.description)}</small>
                </button>
              `).join('')}
            </div>
          </section>
        `).filter((markup) => markup.includes('data-dashboard-tab')).join('')}
      </nav>
    </section>
  `;
}

function tabPanel(id, renderContent) {
  const isActive = id === activeDashboardTab;
  const content = isActive
    ? (typeof renderContent === 'function' ? renderContent() : renderContent)
    : '';

  return `
    <section class="dashboard-tab-panel${isActive ? ' is-active' : ''}" data-dashboard-tab-panel="${id}" ${isActive ? '' : 'hidden'}>
      ${content}
    </section>
  `;
}

function renderDashboard() {
  const main = $('[data-dashboard-main]');
  revokeUploadPreviewUrls();

  if (!currentState) {
    main.innerHTML = dashboardHydrating || selectedGuildId
      ? renderDashboardLoadingState()
      : `
        <div class="empty-state">
          <img src="assets/sentinel-mark.png" alt="">
          <h2>Sélectionne un serveur</h2>
          <p>Choisis un serveur pour voir les réglages et les actions disponibles.</p>
        </div>
      `;
    return;
  }

  const state = currentState;
  ensureDashboardPlanMode(state);
  const tabs = availableDashboardTabs(state);

  if (!tabs.some((tab) => tab.id === activeDashboardTab)) {
    activeDashboardTab = tabs[0]?.id || 'overview';
  }

  const optionMarkup = {};
  const getRoleOptions = () => (optionMarkup.roles ??= optionList(state.roles, state.config.serviceRoleId, 'Choisir un rôle'));
  const getAutoRoleOptions = () => (optionMarkup.autoRoles ??= optionList(state.roles, state.config.autoRoleId, 'Choisir un rôle automatique'));
  const getCommandRoleOptions = () => (optionMarkup.commandRoles ??= optionList(state.roles, null, 'Choisir un rôle autorisé'));
  const getDossierRoleOptions = () => (optionMarkup.dossierRoles ??= optionList(state.roles, null, 'Choisir un rôle responsable'));
  const getPingRoleOptions = () => (optionMarkup.pingRoles ??= optionList(state.roles, null, 'Aucun ping de rôle'));
  const getChannelOptions = () => (optionMarkup.channels ??= optionList(state.channels, state.config.logChannelId, 'Choisir un salon'));
  const getStatusChannelOptions = () => (optionMarkup.statusChannels ??= optionList(state.channels, state.config.statusChannelId, 'Choisir un salon statut'));
  const premiumMode = isPremiumPlanVisible(state);
  const premiumBadge = premiumMode ? '<span class="premium-badge">Vue Premium</span>' : '<span class="free-badge">Vue Gratuit</span>';
  const premiumTag = '<span class="premium-tag">Option Premium</span>';

  main.innerHTML = `
    ${renderDashboardTabs(state, premiumBadge)}
    <div class="dashboard-tab-stage ${premiumMode ? 'is-plan-premium' : 'is-plan-free'}">
      ${tabPanel('overview', () => premiumMode ? renderPremiumHome(state, premiumBadge) : renderServerHome(state, premiumBadge))}

      ${tabPanel('setup', () => premiumMode
        ? renderPremiumSetupPanel(state, premiumBadge)
        : renderSetupAssistant(state, getRoleOptions(), getCommandRoleOptions(), getChannelOptions()))}

      ${tabPanel('configuration', () => premiumMode
        ? renderPremiumConfigurationPanel(state, premiumBadge)
        : renderConfigurationHub(state, getChannelOptions(), getStatusChannelOptions()))}

      ${tabPanel('service', () => renderServicePanel(state, premiumBadge, premiumTag))}

      ${tabPanel('embeds', () => renderEmbedsPanel(
        state,
        getChannelOptions(),
        getPingRoleOptions(),
        premiumBadge
      ))}

      ${tabPanel('dossiers', () => renderDossiersPanel(
        state,
        getChannelOptions(),
        getDossierRoleOptions(),
        premiumBadge,
        premiumTag
      ))}

      ${tabPanel('audit', () => renderAuditPanel(state))}

      ${canShowFounderTab(state) ? tabPanel('founder', () => renderFounderPremiumPanel()) : ''}

      ${tabPanel('moderation', () => renderModerationPanel(
        state,
        getChannelOptions(),
        getAutoRoleOptions(),
        premiumBadge,
        premiumTag
      ))}
    </div>
  `;

  attachDashboardHandlers();
  applyDeferredStyles(main);
}

async function refreshGuildState() {
  if (!selectedGuildId) return;
  const payload = await api(`/api/guilds/${selectedGuildId}/state`);
  currentState = payload.state;
  currentSiteAccess = currentState.siteAccess || currentSiteAccess;
  canViewPremiumOverview = Boolean(canViewPremiumOverview || currentState.creator?.canViewPremiumOverview);
  dashboardHydrating = false;
  rememberCurrentGuildPreview();
  renderDashboard();
}

async function loadCreatorPremiumOverview(button = null, { silent = false } = {}) {
  if (!canViewPremiumOverview) return;

  setLoading(button, true);
  creatorOverviewLoading = true;
  renderDashboard();

  try {
    const payload = await api('/api/creator/premium-overview');
    creatorOverview = payload.overview || null;
    currentSiteAccess = creatorOverview?.access || currentSiteAccess;
    canViewPremiumOverview = Boolean(creatorOverview?.canView);

    if (!silent) {
      toast('Vue Premium actualisée.');
    }
  } catch (error) {
    if (error.status === 403) {
      canViewPremiumOverview = false;
      creatorOverview = null;
      currentSiteAccess = { role: 'user', isFounder: false, isStaff: false, canViewSitePanel: false, canManagePremium: false, canManageSiteStaff: false };
    }

    if (!silent) {
      toast(dashboardErrorMessage(error), 'error');
    }
  } finally {
    creatorOverviewLoading = false;
    setLoading(button, false);
    renderDashboard();
  }
}

async function manageCreatorPremiumAccess(data, button = null) {
  if (!canViewPremiumOverview) return;

  setLoading(button, true);

  try {
    const payload = await api('/api/creator/premium-access', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    creatorOverview = payload.overview || creatorOverview;
    currentSiteAccess = creatorOverview?.access || currentSiteAccess;
    canViewPremiumOverview = Boolean(creatorOverview?.canView);

    await loadGuilds().catch(() => {});

    if (selectedGuildId) {
      await refreshGuildState().catch(() => {
        renderDashboard();
      });
    } else {
      renderDashboard();
    }

    toast(payload.message || 'Accès Premium mis à jour.');
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function manageCreatorSiteStaffAccess(data, button = null) {
  if (!currentSiteAccess?.canManageSiteStaff) return;

  setLoading(button, true);

  try {
    const payload = await api('/api/creator/site-staff', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    creatorOverview = payload.overview || creatorOverview;
    currentSiteAccess = creatorOverview?.access || currentSiteAccess;
    canViewPremiumOverview = Boolean(creatorOverview?.canView);
    renderDashboard();
    toast(payload.message || 'Accès staff site mis à jour.');
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function manageCreatorMaintenance(data, button = null) {
  if (!currentSiteAccess?.isFounder) return;

  setLoading(button, true);

  try {
    const payload = await api('/api/creator/maintenance', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    creatorOverview = payload.overview || creatorOverview;
    currentSiteAccess = creatorOverview?.access || currentSiteAccess;
    renderDashboard();
    toast(payload.message || 'Centre de maintenance actualisé.');
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function downloadMaintenanceFile(kind, fileName, button = null) {
  if (!currentSiteAccess?.isFounder || !['backup', 'archive'].includes(kind) || !fileName) return;
  setLoading(button, true);
  const url = new URL('/api/creator/maintenance/download', window.location.origin);
  url.searchParams.set('kind', kind);
  url.searchParams.set('file', fileName);

  try {
    const response = await fetch(url, { credentials: 'include', headers: { Accept: 'application/gzip, application/json' } });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));

      if (payload.code === 'REAUTH_REQUIRED' && payload.reauthUrl) {
        window.location.assign(payload.reauthUrl);
        return;
      }

      throw new Error(payload.error || `Erreur ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    toast('Archive téléchargée.');
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function runAction(action, data, button = null) {
  if (!selectedGuildId) return;
  setLoading(button, true);

  try {
    const previousArchives = currentState?.payrollArchives || null;
    const payload = await api(`/api/guilds/${selectedGuildId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, ...data })
    });
    currentState = payload.state;

    if (previousArchives?.items?.length && currentState?.payrollArchives) {
      const merged = new Map(previousArchives.items.map((archive) => [archive.weekStart, archive]));

      for (const archive of currentState.payrollArchives.items || []) {
        merged.set(archive.weekStart, archive);
      }

      if (payload.payrollArchive?.weekStart) {
        merged.set(payload.payrollArchive.weekStart, payload.payrollArchive);
      }

      const items = Array.from(merged.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      const totalCount = currentState.payrollArchives.totalCount || previousArchives.totalCount || items.length;
      currentState.payrollArchives = {
        ...currentState.payrollArchives,
        offset: 0,
        totalCount,
        hasMore: totalCount > items.length,
        items
      };
    }

    dashboardHydrating = false;
    rememberCurrentGuildPreview();
    renderDashboard();
    renderGuilds();
    toast(payload.message || 'Action terminée.');
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadMorePayrollArchives(button = null) {
  if (!selectedGuildId || !currentState?.payrollArchives?.hasMore) return;
  setLoading(button, true);

  try {
    const currentItems = currentState.payrollArchives.items || [];
    const params = new URLSearchParams({
      limit: '24',
      offset: String(currentItems.length)
    });
    const payload = await api(`/api/guilds/${selectedGuildId}/payroll-archives?${params}`);
    const next = payload.payrollArchives || { items: [], hasMore: false };
    const merged = new Map(currentItems.map((archive) => [archive.weekStart, archive]));

    for (const archive of next.items || []) {
      merged.set(archive.weekStart, archive);
    }

    currentState.payrollArchives = {
      ...next,
      offset: 0,
      items: Array.from(merged.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    };
    rememberCurrentGuildPreview();
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadAuditLogs(filters = auditFilters, scope = auditScope, button = null) {
  if (!currentState) return;

  setLoading(button, true);

  try {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters || {})) {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value).trim());
      }
    }

    const endpoint = scope === 'global' && currentState.auditLogs?.canViewGlobal
      ? `/api/audit/global?${params}`
      : `/api/guilds/${selectedGuildId}/audit?${params}`;
    const payload = await api(endpoint);
    auditScope = scope === 'global' && payload.auditLogs?.canViewGlobal ? 'global' : 'server';
    auditFilters = { ...filters };
    currentState.auditLogs = payload.auditLogs;
    rememberCurrentGuildPreview();
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadModerationCases(filters = moderationFilters, button = null) {
  if (!selectedGuildId || !currentState) return;

  setLoading(button, true);

  try {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters || {})) {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value).trim());
      }
    }

    const payload = await api(`/api/guilds/${selectedGuildId}/moderation-cases?${params}`);
    moderationFilters = { ...filters };
    expandedModerationCaseId = null;
    currentState.moderationCases = payload.moderationCases;
    rememberCurrentGuildPreview();
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

async function loadUserProfile(userId, button = null) {
  if (!selectedGuildId || !currentState) return;

  setLoading(button, true);

  try {
    const payload = await api(`/api/guilds/${selectedGuildId}/users/${encodeURIComponent(userId)}`);
    selectedUserProfile = payload.profile;
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error), 'error');
  } finally {
    setLoading(button, false);
  }
}

function attachDashboardHandlers() {
  $$('[data-dashboard-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.dashboardTab;

      if (!availableDashboardTabs().some((tab) => tab.id === nextTab)) {
        return;
      }

      activeDashboardTab = nextTab;
      renderDashboard();

      if (nextTab === 'founder' && canViewPremiumOverview && !creatorOverview && !creatorOverviewLoading) {
        loadCreatorPremiumOverview(null, { silent: true });
      }
    });
  });

  $$('[data-refresh-creator-premium]').forEach((button) => {
    button.addEventListener('click', () => {
      loadCreatorPremiumOverview(button);
    });
  });

  $$('[data-creator-premium-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      manageCreatorPremiumAccess(formData(form), button);
    });
  });

  $$('[data-creator-premium-click]').forEach((button) => {
    button.addEventListener('click', () => {
      manageCreatorPremiumAccess({
        action: button.dataset.action,
        target: button.dataset.target,
        guildId: button.dataset.guildId || '',
        roleId: button.dataset.roleId || '',
        userId: button.dataset.userId || ''
      }, button);
    });
  });

  $$('[data-creator-staff-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      manageCreatorSiteStaffAccess(formData(form), button);
    });
  });

  $$('[data-creator-staff-click]').forEach((button) => {
    button.addEventListener('click', () => {
      manageCreatorSiteStaffAccess({
        action: button.dataset.action,
        userId: button.dataset.userId || ''
      }, button);
    });
  });

  $$('[data-maintenance-action]').forEach((button) => {
    button.addEventListener('click', () => {
      manageCreatorMaintenance({
        action: button.dataset.maintenanceAction,
        fileName: button.dataset.file || ''
      }, button);
    });
  });

  $$('[data-maintenance-download]').forEach((button) => {
    button.addEventListener('click', () => {
      downloadMaintenanceFile(button.dataset.kind, button.dataset.file, button);
    });
  });

  $('[data-maintenance-restore-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    const data = formData(form);
    manageCreatorMaintenance({ action: 'restore-backup', ...data }, button);
  });

  $$('[data-dashboard-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPlan = button.dataset.dashboardPlan === 'premium' ? 'premium' : 'free';

      if (nextPlan === 'premium' && !canUsePremiumPlan()) {
        toast('Le mode Premium est réservé aux serveurs ou comptes Premium.', 'error');
        return;
      }

      dashboardPlanMode = nextPlan;
      renderDashboard();
    });
  });

  $$('[data-file-upload]').forEach((input) => {
    updateFileUploadName(input);
    input.addEventListener('change', () => updateFileUploadName(input));
  });

  $$('[data-action-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const action = form.dataset.actionForm;
      const button = $('button[type="submit"]', form);

      if (form.dataset.payrollArchiveWeek) {
        expandedPayrollArchiveWeek = form.dataset.payrollArchiveWeek;
      }

      try {
        runAction(action, await actionFormData(form, action), button);
      } catch (error) {
        toast(error.message || 'Image impossible à préparer.', 'error');
      }
    });
  });

  $$('[data-payroll-history-filter]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = formData(form);
      payrollHistoryFilters = {
        query: String(data.query || '').trim().slice(0, 120),
        status: ['open', 'settled'].includes(data.status) ? data.status : 'all'
      };
      expandedPayrollArchiveWeek = null;
      renderDashboard();
    });
  });

  $$('[data-payroll-history-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      payrollHistoryFilters = { query: '', status: 'all' };
      expandedPayrollArchiveWeek = null;
      renderDashboard();
    });
  });

  $$('[data-payroll-history-more]').forEach((button) => {
    button.addEventListener('click', () => loadMorePayrollArchives(button));
  });

  $$('[data-payroll-history-period]').forEach((details) => {
    details.addEventListener('toggle', () => {
      const weekStart = details.dataset.payrollHistoryPeriod || null;

      if (details.open && expandedPayrollArchiveWeek !== weekStart) {
        expandedPayrollArchiveWeek = weekStart;
        renderDashboard();
      } else if (!details.open && expandedPayrollArchiveWeek === weekStart) {
        expandedPayrollArchiveWeek = null;
      }
    });
  });

  $$('[data-action-click]').forEach((button) => {
    button.addEventListener('click', () => {
      runAction(button.dataset.actionClick, { roleId: button.dataset.roleId }, button);
    });
  });

  $$('[data-audit-filter]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      loadAuditLogs(formData(form), auditScope, button);
    });
  });

  $$('[data-audit-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      auditFilters = {};
      auditScope = 'server';
      loadAuditLogs({}, 'server', button);
    });
  });

  $$('[data-audit-scope]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextScope = button.dataset.auditScope === 'global' ? 'global' : 'server';
      loadAuditLogs(auditFilters, nextScope, button);
    });
  });

  $$('[data-moderation-filter]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      loadModerationCases(formData(form), button);
    });
  });

  $$('[data-moderation-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      moderationFilters = {};
      loadModerationCases({}, button);
    });
  });

  $$('[data-dossier-filter]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      dossierFilters = formData(form);
      expandedDossierId = null;
      renderDashboard();
    });
  });

  $$('[data-dossier-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      dossierFilters = {};
      expandedDossierId = null;
      renderDashboard();
    });
  });

  $$('[data-dossier-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      expandedDossierId = String(expandedDossierId) === String(button.dataset.dossierDetail)
        ? null
        : button.dataset.dossierDetail;
      renderDashboard();
    });
  });

  $$('[data-case-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      expandedModerationCaseId = String(expandedModerationCaseId) === String(button.dataset.caseDetail)
        ? null
        : button.dataset.caseDetail;
      renderDashboard();
    });
  });

  $$('[data-user-lookup]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      const data = formData(form);
      loadUserProfile(data.userId, button);
    });
  });
}

async function loadGuilds() {
  const payload = await api('/api/guilds');
  guilds = payload.guilds;
  selectedGuildPreview = guilds.find((guild) => guild.id === selectedGuildId) || selectedGuildPreview;
  renderGuilds();
}

async function selectGuild(guildId, { restored = false } = {}) {
  const guild = guilds.find((item) => item.id === guildId);

  if (!guild || !guild.installed) {
    if (restored) {
      forgetLastGuildId(guildId);
    }

    removeCachedGuildPreview(currentUser?.id, guildId);
    selectedGuildId = null;
    currentState = null;
    selectedGuildPreview = null;
    dashboardHydrating = false;
    renderGuilds();
    renderDashboard();

    if (!restored) {
      toast(dashboardErrorMessage('Sentinel is not installed on this server.'), 'error');
    }
    return false;
  }

  selectedGuildId = guildId;
  auditScope = 'server';
  auditFilters = {};
  moderationFilters = {};
  expandedModerationCaseId = null;
  payrollHistoryFilters = { query: '', status: 'all' };
  expandedPayrollArchiveWeek = null;
  selectedUserProfile = null;
  dossierFilters = {};
  expandedDossierId = null;
  dashboardHydrating = true;
  selectedGuildPreview = guild || readCachedGuildPreview(currentUser?.id, guildId);
  currentState = null;
  renderGuilds();
  renderDashboard();

  try {
    await refreshGuildState();
    storeLastGuildId(guildId);
    return true;
  } catch (error) {
    if (restored) {
      forgetLastGuildId(guildId);
      removeCachedGuildPreview(currentUser?.id, guildId);
      selectedGuildId = null;
      currentState = null;
      selectedGuildPreview = null;
      dashboardHydrating = false;
      renderGuilds();
      renderDashboard();
      return false;
    }

    dashboardHydrating = false;

    if (error.payload?.inviteUrl) {
      const inviteUrl = safeExternalUrl(error.payload.inviteUrl, ['discord.com']);
      toast('Sentinel doit être autorisé sur ce serveur.', 'error');
      if (inviteUrl) {
        window.open(inviteUrl, '_blank', 'noopener');
      }
      renderDashboard();
      return false;
    }
    toast(error.message, 'error');
    renderDashboard();
    return false;
  }
}

async function bootstrap() {
  if (publicDashboardHost) {
    showPublicDashboardGuide();
    return;
  }

  $('[data-live-dashboard]')?.removeAttribute('hidden');
  $('[data-public-dashboard]')?.setAttribute('hidden', '');
  $('[data-login]')?.removeAttribute('hidden');
  $('[data-public-invite]')?.setAttribute('hidden', '');
  showCachedDashboardPreview();

  try {
    const session = await api('/api/session');
    currentUser = session.user;
    csrfToken = session.csrfToken || csrfToken;
    currentSettings = session.settings || null;
    currentSiteAccess = session.siteAccess || currentSiteAccess;
    canViewPremiumOverview = Boolean(session.creator?.canViewPremiumOverview);
    renderUser();
    if (canViewPremiumOverview) {
      loadCreatorPremiumOverview(null, { silent: true });
    }
    await loadGuilds();

    let restoredGuild = false;

    for (const guildId of getRestorableGuildIds()) {
      restoredGuild = await selectGuild(guildId, { restored: true });

      if (restoredGuild) {
        break;
      }
    }

    if (!restoredGuild) {
      selectedGuildId = null;
      currentState = null;
      dashboardHydrating = false;
      renderDashboard();
    }
  } catch (error) {
    currentUser = null;
    csrfToken = null;
    guilds = [];
    currentSettings = null;
    selectedGuildId = null;
    currentState = null;
    selectedUserProfile = null;
    selectedGuildPreview = null;
    creatorOverview = null;
    creatorOverviewLoading = false;
    canViewPremiumOverview = false;
    currentSiteAccess = { role: 'user', isFounder: false, isStaff: false, canViewSitePanel: false, canManagePremium: false, canManageSiteStaff: false };
    dashboardHydrating = false;
    renderUser();
    renderGuilds();
    showPublicDashboardGuide();
  }
}

document.addEventListener('click', (event) => {
  const helpButton = event.target.closest('.field-help');

  if (helpButton) {
    event.preventDefault();
    event.stopPropagation();

    if (tooltipHost === helpButton && tooltipPinned) {
      hideTooltip({ force: true });
      return;
    }

    showTooltip(helpButton, { pinned: true });
    return;
  }

  hideTooltip({ force: true });

  if (event.target.closest('[data-open-guild-drawer]')) {
    const drawer = $('[data-guild-drawer]');
    setGuildDrawerOpen(!drawer?.classList.contains('is-open'));
    return;
  }

  if (event.target.closest('[data-close-guild-drawer]')) {
    setGuildDrawerOpen(false);
    return;
  }

  const guildButton = event.target.closest('[data-select-guild]');
  if (guildButton) {
    setGuildDrawerOpen(false);
    selectGuild(guildButton.dataset.selectGuild);
  }
});

document.addEventListener('mouseover', (event) => {
  const helpButton = event.target.closest('.field-help');

  if (helpButton) {
    showTooltip(helpButton);
  }
});

document.addEventListener('mouseout', (event) => {
  const helpButton = event.target.closest('.field-help');

  if (helpButton && !helpButton.contains(event.relatedTarget)) {
    hideTooltip();
  }
});

document.addEventListener('focusin', (event) => {
  const helpButton = event.target.closest('.field-help');

  if (helpButton) {
    showTooltip(helpButton);
  }
});

document.addEventListener('focusout', (event) => {
  const helpButton = event.target.closest('.field-help');

  if (helpButton) {
    hideTooltip();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideTooltip({ force: true });
    setGuildDrawerOpen(false);
  }
});

window.addEventListener('resize', () => {
  if (tooltipHost) {
    positionTooltip(tooltipHost);
  }
});

document.addEventListener('scroll', () => {
  if (tooltipHost) {
    positionTooltip(tooltipHost);
  }
}, true);

$('[data-logout]')?.addEventListener('click', async () => {
  const guildKeysToClear = lastGuildStorageKeys();
  const cachedUserId = currentUser?.id;
  const cachedGuildId = selectedGuildId || readStoredLastGuildId();

  await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
  currentUser = null;
  guilds = [];
  selectedGuildId = null;
  currentState = null;
  currentSettings = null;
  selectedGuildPreview = null;
  creatorOverview = null;
  creatorOverviewLoading = false;
  canViewPremiumOverview = false;
  currentSiteAccess = { role: 'user', isFounder: false, isStaff: false, canViewSitePanel: false, canManagePremium: false, canManageSiteStaff: false };
  csrfToken = null;
  dashboardHydrating = false;
  dossierFilters = {};
  expandedDossierId = null;
  localStorage.removeItem('sentinel-discord-profile');
  removeCachedGuildPreview(cachedUserId, cachedGuildId);
  try {
    guildKeysToClear.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // Storage can be blocked by browser settings.
  }
  renderUser();
  renderGuilds();
  renderDashboard();
});

bootstrap();
