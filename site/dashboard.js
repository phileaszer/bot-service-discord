const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let currentUser = null;
let guilds = [];
let selectedGuildId = null;
let currentState = null;
let currentSettings = null;
let activeDashboardTab = 'overview';
let tooltipHost = null;
let tooltipPinned = false;
let tooltipElement = null;
let auditScope = 'server';
let auditFilters = {};
let moderationFilters = {};
let expandedModerationCaseId = null;
let selectedUserProfile = null;
let dossierFilters = {};
let expandedDossierId = null;
const LAST_GUILD_STORAGE_KEY = 'sentinel-dashboard-last-guild-id';

const publicDashboardHost = window.location.pathname.endsWith('/dashboard.html')
  || window.location.hostname.endsWith('github.io');

function readStoredLastGuildId() {
  try {
    const value = localStorage.getItem(LAST_GUILD_STORAGE_KEY);
    return /^\d{17,20}$/.test(String(value || '')) ? value : null;
  } catch (error) {
    return null;
  }
}

function storeLastGuildId(guildId) {
  if (!/^\d{17,20}$/.test(String(guildId || ''))) {
    return;
  }

  try {
    localStorage.setItem(LAST_GUILD_STORAGE_KEY, guildId);
  } catch (error) {
    // Some browsers block local storage; the backend setting remains the source of truth.
  }

  window.SentinelAuth?.saveSettings?.({ lastGuildId: guildId });
}

function getRestorableGuildId() {
  const candidates = [
    currentSettings?.lastGuildId,
    readStoredLastGuildId()
  ].filter(Boolean);

  return candidates.find((guildId) => (
    guilds.some((guild) => guild.id === guildId && guild.installed)
  )) || null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    const message = payload.error || `Erreur ${response.status}`;
    const error = new Error(message);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }

  return payload;
}

function dashboardErrorMessage(message) {
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (language === 'en') {
    return message || 'Action failed.';
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
    'Invalid Discord user ID.': 'L’ID Discord indiqué n’est pas valide.',
    'Text channel not found.': 'Salon textuel introuvable.',
    'Role not found.': 'Rôle Discord introuvable.',
    'Invalid timeout duration.': 'Durée de timeout invalide. Exemple : 10m, 2h, 7d.',
    'Invalid temporary ban duration.': 'Durée de ban temporaire invalide.',
    'Invalid slowmode duration.': 'Durée de mode lent invalide.',
    'Invalid hourly rate.': 'Montant horaire invalide.',
    'Case not found.': 'Aucun cas trouvé avec cet ID.',
    'Missing dossier type.': 'Type de dossier manquant.',
    'Category not found.': 'Catégorie Discord introuvable.',
    'Sentinel embed not found.': 'Aucun embed Sentinel géré ne correspond à cet ID.',
    'Unknown moderation action.': 'Action de modération inconnue.',
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
    'Invalid hourly rate.': 'Indique un montant horaire positif, par exemple 500 ou 1250.',
    'Case not found.': 'Vérifie l’ID du cas dans le tableau des derniers dossiers.',
    'Sentinel embed not found.': 'Copie l’ID depuis la liste “Embeds gérés”. Si le message a été supprimé sur Discord, son emplacement sera libéré.',
    'This action is reserved for Sentinel Premium.': 'Cette option est visible pour préparer le Premium, mais elle reste bloquée sur les serveurs gratuits.'
  };
  const resolution = resolutionByMessage[message];

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
    .replace(/"/g, '&quot;');
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
  return Object.fromEntries(new FormData(form).entries());
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

  card.innerHTML = `
    ${currentUser.avatar ? `<img src="${currentUser.avatar}" alt="">` : ''}
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
      <button type="button" data-select-guild="${guild.id}">
        ${guild.icon ? `<img src="${guild.icon}" alt="">` : '<span class="guild-fallback">S</span>'}
        <span>
          <strong>${escapeHtml(guild.name)}</strong>
          <small>${guild.installed ? (guild.advanced ? 'Premium / référence' : 'Bot installé') : 'Autorisation requise'}</small>
        </span>
      </button>
      ${guild.installed ? '' : `<a class="button button-small" href="${guild.inviteUrl}" target="_blank" rel="noopener">Autoriser</a>`}
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

function dashboardConfigStatus(state) {
  const serviceRole = resolveRole(state, state.config.serviceRoleId);
  const autoRole = resolveRole(state, state.config.autoRoleId);
  const logChannel = resolveChannel(state, state.config.logChannelId);
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

  if (allowedRoles.length === 0) {
    alerts.push('Ajoute au moins un rôle autorisé pour déléguer la gestion de Sentinel au staff.');
  }

  return {
    serviceRole,
    autoRole,
    logChannel,
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

  const rows = [
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

function configAlerts(state) {
  const status = dashboardConfigStatus(state);

  if (status.ready) {
    return `
      <div class="dashboard-alert is-ready">
        <strong>Configuration prête</strong>
        <p>Sentinel peut gérer les services et publier ses logs sur ce serveur.</p>
      </div>
    `;
  }

  return `
    <div class="dashboard-alert is-warning">
      <strong>À vérifier avant utilisation</strong>
      <ul>
        ${status.alerts.map((alert) => `<li>${escapeHtml(alert)}</li>`).join('')}
      </ul>
      <button class="button button-small" type="button" data-dashboard-tab="setup">Ouvrir l’assistant</button>
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

function permissionStatusOverview(state) {
  const diagnostics = state.diagnostics;

  if (!diagnostics?.checks?.length) {
    return '';
  }

  const priorityIds = ['ban', 'timeout', 'kick', 'purge', 'manageChannels', 'manageRoles', 'roleOrder'];
  const priorityChecks = diagnostics.checks.filter((check) => priorityIds.includes(check.id));
  const firstFixes = (diagnostics.fixes || []).slice(0, 3);

  return `
    <div class="permission-overview">
      <div class="home-block-heading">
        <h3>Diagnostic permissions</h3>
        <button class="button button-small button-ghost" type="button" data-dashboard-tab="moderation">Voir tout</button>
      </div>
      <div class="permission-pill-grid">
        ${priorityChecks.map((check) => `
          <span class="permission-pill ${check.ok ? 'is-ready' : 'is-warning'}">
            <strong>${escapeHtml(check.label)}</strong>
            <small>${escapeHtml(check.value)}</small>
          </span>
        `).join('')}
      </div>
      ${firstFixes.length ? `
        <div class="dashboard-alert is-warning">
          <strong>Correction conseillÃ©e</strong>
          <ul>
            ${firstFixes.map((fix) => `<li>${escapeHtml(fix)}</li>`).join('')}
          </ul>
        </div>
      ` : `
        <div class="dashboard-alert is-ready">
          <strong>Permissions prÃªtes</strong>
          <p>Sentinel peut appliquer les actions prÃ©vues sur ce serveur.</p>
        </div>
      `}
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
      ${metricCards(state)}
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
          ${configAlerts(state)}
          ${dossierPermissionAlert(state)}
          ${permissionStatusOverview(state)}
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
  const rows = [
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

function renderConfigurationHub(state, channelOptions) {
  const status = dashboardConfigStatus(state);

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
          <h3>Panneau de service</h3>
          <p>Publie ou republie le bouton de service dans le salon de ton choix.</p>
          <form data-action-form="publish-service-panel">
            ${labelHelp('Salon de publication', 'Salon dans lequel Sentinel enverra le bouton utilisé pour prendre ou finir son service.')}
            <select name="channelId">${channelOptions}</select>
            <button class="button" type="submit">Publier le panneau</button>
          </form>
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
          <span class="chart-bar"><i style="width: ${ratioPercent(Number(item.totalTime) || 0, max)}%"></i></span>
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
        description: 'Set an hourly RP amount, check the current week, and mark who has already been paid.',
        rateLabel: 'Hourly amount',
        rateHelp: 'Amount used to calculate the estimated RP pay from completed sessions and current duty time.',
        currencyLabel: 'Currency / unit',
        currencyHelp: 'Short label displayed after the amount, for example $, €, credits, or SA$.',
        update: 'Update pay settings',
        summary: 'Weekly summary',
        week: 'Current week',
        agents: 'Agents',
        totalHours: 'Total hours',
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
        note: 'This is an internal RP tracking tool. Sentinel does not process real payments.'
      }
    : {
        eyebrow: 'Paie RP',
        title: 'Suivi hebdomadaire des paiements',
        description: 'Définis un montant horaire RP, consulte la semaine en cours et coche qui a déjà été payé.',
        rateLabel: 'Montant par heure',
        rateHelp: 'Montant utilisé pour calculer la paie RP estimée à partir des sessions terminées et du service en cours.',
        currencyLabel: 'Devise / unité',
        currencyHelp: 'Texte court affiché après le montant, par exemple $, €, crédits ou SA$.',
        update: 'Mettre à jour la paie',
        summary: 'Résumé semaine',
        week: 'Semaine en cours',
        agents: 'Agents',
        totalHours: 'Heures totales',
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
        note: 'Ce suivi reste interne au RP. Sentinel ne traite aucun paiement réel.'
      };
}

function payrollSummaryCards(payroll, copy) {
  const cards = [
    [copy.week, `${payroll.weekStart} → ${payroll.weekEnd}`],
    [copy.agents, payroll.totals?.userCount || 0],
    [copy.totalHours, payroll.totals?.totalTimeLabel || '0h 0min 0s'],
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
                <td><code>${escapeHtml(item.userId)}</code></td>
                <td><strong>${escapeHtml(item.totalTimeLabel)}</strong></td>
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

function renderPayrollPanel(state) {
  const payroll = state.payroll || {
    weekStart: '',
    weekEnd: '',
    settings: { hourlyRate: 0, currency: '$' },
    totals: {},
    items: []
  };
  const copy = payrollCopy();

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
      ${payrollTable(payroll, copy)}
    </section>
  `;
}

function renderServicePanel(state, premiumBadge, premiumTag) {
  return `
    <section class="dashboard-panel service-overview-panel" id="service">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Service</p>
          <h2>Statistiques de service</h2>
          <p class="muted">Vue rapide des agents en service, du top global, des heures de la semaine et de ton historique personnel.</p>
        </div>
        ${premiumBadge}
      </div>
      ${metricCards(state)}
      <div class="service-insights">
        <article class="service-insight service-insight-wide">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Direct</p>
              <h3>Agents actuellement en service</h3>
            </div>
            <strong>${escapeHtml(state.summary.activeCount)}</strong>
          </div>
          ${activeServicesPanel(state)}
        </article>
        <article class="service-insight">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Classement</p>
              <h3>Top service</h3>
            </div>
          </div>
          ${leaderboardChart(state.topService || [], 'Aucun temps total enregistré.')}
        </article>
        <article class="service-insight">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Semaine</p>
              <h3>Heures des 7 derniers jours</h3>
            </div>
          </div>
          ${leaderboardChart(state.topWeek || [], 'Aucune session cette semaine.')}
        </article>
        <article class="service-insight service-insight-wide">
          <div class="service-card-heading">
            <div>
              <p class="eyebrow">Personnel</p>
              <h3>Ton historique</h3>
            </div>
          </div>
          ${personalHistory(state)}
        </article>
      </div>
    </section>

    ${renderPayrollPanel(state)}

    <section class="dashboard-panel">
      <div class="panel-heading">
        <p class="eyebrow">Actions</p>
        <h2>Gestion rapide</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="start-service">
          ${labelHelp('Prendre le service pour un membre', 'Démarre manuellement le service d’un membre avec son ID Discord et applique le rôle de service si possible.')}
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Prendre service</button>
        </form>
        <form data-action-form="end-service">
          ${labelHelp('Finir le service pour un membre', 'Arrête le service en cours d’un membre, calcule la durée et ajoute ce temps à son total.')}
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Fin service</button>
        </form>
        <form data-action-form="reset-user">
          ${labelHelp('Réinitialisation individuelle des heures', 'Remet à zéro les heures d’une seule personne avec son ID Discord, même si elle a quitté le serveur.')}
          <input name="userId" placeholder="ID Discord, même si la personne est partie" required>
          <button class="button" type="submit">Reset</button>
        </form>
        <form data-action-form="sync-service">
          ${labelHelp('Synchronisation service', 'Option Premium : répare les incohérences entre les membres en service, les rôles Discord et les données de service.', ` ${premiumTag}`)}
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Synchroniser</button>
        </form>
      </div>
    </section>

    <section class="dashboard-panel inline-premium-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Premium service</p>
          <h2>Statistiques avancées</h2>
          <p class="muted">Ces options restent prévues pour les serveurs qui auront besoin de bilans complets et d’exports.</p>
        </div>
        ${premiumBadge}
      </div>
      ${premiumServiceRoadmap(state, premiumTag)}
    </section>
  `;
}

function customEmbedQuota(state) {
  const quota = state.customEmbeds?.quota;
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (!quota) {
    return language === 'en' ? 'Quota unavailable' : 'Quota indisponible';
  }

  if (quota.unlimited) {
    return language === 'en'
      ? 'Premium: unlimited access to Sentinel embeds, with unlimited creation and edits.'
      : 'Premium : accès illimité aux embeds Sentinel, créations et modifications illimitées.';
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

function dossierQuotaText(state) {
  const quota = state.dossiers?.panelQuota;
  const language = document.documentElement.lang === 'en' ? 'en' : 'fr';

  if (!quota) {
    return language === 'en' ? 'Quota unavailable' : 'Quota indisponible';
  }

  if (quota.unlimited) {
    return language === 'en'
      ? 'Premium: unlimited panels, longer history, and advanced settings.'
      : 'Premium : panneaux illimités, historique long et réglages avancés.';
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

const AUDIT_ACTION_LABELS = {
  'set-language': 'Langue',
  'set-service-role': 'Rôle de service',
  'set-auto-role': 'Rôle automatique',
  'disable-auto-role': 'Rôle automatique',
  'set-log-channel': 'Salon de logs',
  'publish-service-panel': 'Panneau de service',
  'set-payroll-settings': 'Réglage paie RP',
  'toggle-payroll-paid': 'Paie RP',
  'publish-dossier-panel': 'Bureau d’accueil',
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
  'toggle-service': 'Bouton service',
  'start-service': 'Prise de service',
  'end-service': 'Fin de service',
  'reset-user': 'Reset utilisateur',
  'reset-guild': 'Reset global',
  'sync-service': 'Synchronisation',
  'custom-embed-create': 'Embed créé',
  'custom-embed-edit': 'Embed modifié',
  'custom-embed-delete': 'Embed supprimé',
  warn: 'Avertissement',
  timeout: 'Timeout',
  untimeout: 'Fin timeout',
  kick: 'Expulsion',
  ban: 'Ban',
  tempban: 'Ban temporaire',
  unban: 'Déban',
  clear: 'Purge',
  purge: 'Purge',
  lock: 'Lock',
  unlock: 'Unlock',
  slowmode: 'Mode lent',
  case_edit: 'Cas modifié',
  case_delete: 'Cas supprimé',
  'edit-case': 'Cas modifié',
  'delete-case': 'Cas supprimé',
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
          <p class="muted">Si une action est refusÃ©e, corrige dâ€™abord la ligne indiquÃ©e ici : permission manquante, salon inaccessible ou rÃ´le Sentinel placÃ© trop bas.</p>
        </div>
        ${statusBadge(headline, diagnostics.fixes.length === 0)}
      </div>
      <div class="diagnostic-grid">
        ${diagnostics.checks.map((check) => `
          <div class="diagnostic-check ${check.ok ? 'is-ready' : 'is-warning'}">
            <span>${escapeHtml(check.label)}</span>
            <strong>${escapeHtml(check.value)}</strong>
            ${check.ok ? '' : `<small>${escapeHtml(check.fix)}</small>`}
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

function userProfilePanel(profile) {
  if (!profile) {
    return '<p class="muted">Entre un ID Discord pour voir les heures, sanctions et actions liées à cette personne.</p>';
  }

  const sessions = profile.service?.sessions || [];
  const cases = profile.moderationCases?.items || [];
  const actions = profile.actions || [];
  const tag = profile.user.tag || profile.user.username || profile.user.id;

  return `
    <div class="user-profile-card">
      <div class="user-profile-head">
        ${profile.user.avatar ? `<img src="${escapeHtml(profile.user.avatar)}" alt="">` : '<span class="user-avatar-placeholder"></span>'}
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

function renderAuditPanel(state) {
  const auditLogs = state.auditLogs || {};
  const canViewGlobal = Boolean(auditLogs.canViewGlobal);
  const currentScope = canViewGlobal ? auditScope : 'server';

  return `
    <section class="dashboard-panel" id="audit">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Historique</p>
          <h2>Ce qui a été fait</h2>
          <p class="muted">Retrouve l’auteur, la cible, la date et le résultat d’une action.</p>
        </div>
        <span class="premium-badge">Premium sécurité</span>
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
        <span>${currentScope === 'global' ? 'Vue privée créatrice' : 'Ce serveur uniquement'}</span>
        <small>${escapeHtml((state.auditLogs?.items || []).length)} entrée(s) affichée(s)</small>
      </div>
      ${auditLogList(state)}
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
    eyebrow: 'Vue',
    title: 'Accueil serveur'
  },
  {
    id: 'configuration',
    label: 'Configuration',
    eyebrow: 'Réglages',
    title: 'Paramètres'
  },
  {
    id: 'service',
    label: 'Service',
    eyebrow: 'Equipe',
    title: 'Prises de service'
  },
  {
    id: 'moderation',
    label: 'Modération',
    eyebrow: 'Sécurité',
    title: 'Actions rapides'
  },
  {
    id: 'embeds',
    label: 'Annonces',
    eyebrow: 'Embeds',
    title: 'Messages Sentinel'
  },
  {
    id: 'dossiers',
    label: 'Dossiers',
    eyebrow: 'Support',
    title: 'Dossiers Sentinel'
  },
  {
    id: 'audit',
    label: 'Historique',
    eyebrow: 'Suivi',
    title: 'Ce qui a été fait'
  },
  {
    id: 'setup',
    label: 'Assistant',
    eyebrow: 'Guide',
    title: 'Configuration guidée'
  }
];

function renderDashboardTabs(state, premiumBadge) {
  const activeTab = DASHBOARD_TABS.find((tab) => tab.id === activeDashboardTab) || DASHBOARD_TABS[0];

  return `
    <section class="dashboard-control-panel">
      <div class="control-summary">
        <p class="eyebrow">Serveur sélectionné</p>
        <h2>${escapeHtml(activeTab.title)}</h2>
        <p>${escapeHtml(state.guild.name)}</p>
      </div>
      <div class="control-status">
        ${premiumBadge}
        <button class="button button-small button-ghost" type="button" data-open-guild-drawer aria-controls="guild-drawer" aria-expanded="false">Changer de serveur</button>
      </div>
      <nav class="dashboard-tabs" aria-label="Sections du dashboard">
        ${DASHBOARD_TABS.map((tab) => `
          <button
            type="button"
            class="dashboard-tab${tab.id === activeDashboardTab ? ' is-active' : ''}"
            data-dashboard-tab="${tab.id}"
            aria-pressed="${tab.id === activeDashboardTab ? 'true' : 'false'}"
          >
            <span>${escapeHtml(tab.eyebrow)}</span>
            <strong>${escapeHtml(tab.label)}</strong>
          </button>
        `).join('')}
      </nav>
    </section>
  `;
}

function tabPanel(id, content) {
  return `
    <section class="dashboard-tab-panel${id === activeDashboardTab ? ' is-active' : ''}" data-dashboard-tab-panel="${id}" ${id === activeDashboardTab ? '' : 'hidden'}>
      ${content}
    </section>
  `;
}

function renderDashboard() {
  const main = $('[data-dashboard-main]');

  if (!currentState) {
    main.innerHTML = `
      <div class="empty-state">
        <img src="assets/sentinel-mark.png" alt="">
        <h2>Sélectionne un serveur</h2>
        <p>Choisis un serveur pour voir les réglages et les actions disponibles.</p>
      </div>
    `;
    return;
  }

  const state = currentState;
  const roleOptions = optionList(state.roles, state.config.serviceRoleId, 'Choisir un rôle');
  const autoRoleOptions = optionList(state.roles, state.config.autoRoleId, 'Choisir un rôle automatique');
  const commandRoleOptions = optionList(state.roles, null, 'Choisir un rôle autorisé');
  const dossierRoleOptions = optionList(state.roles, null, 'Choisir un rôle responsable');
  const pingRoleOptions = optionList(state.roles, null, 'Aucun ping de rôle');
  const channelOptions = optionList(state.channels, state.config.logChannelId, 'Choisir un salon');
  const premiumBadge = state.advanced ? '<span class="premium-badge">Premium actif</span>' : '<span class="free-badge">Gratuit</span>';
  const premiumTag = '<span class="premium-tag">Option Premium</span>';

  main.innerHTML = `
    ${renderDashboardTabs(state, premiumBadge)}
    <div class="dashboard-tab-stage">
      ${tabPanel('overview', renderServerHome(state, premiumBadge))}

      ${tabPanel('setup', renderSetupAssistant(state, roleOptions, commandRoleOptions, channelOptions))}

      ${tabPanel('configuration', renderConfigurationHub(state, channelOptions))}

      ${tabPanel('service', renderServicePanel(state, premiumBadge, premiumTag))}

      ${tabPanel('embeds', `
    <section class="dashboard-panel module-panel announcements-panel" id="embeds">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Annonces</p>
          <h2>Embeds Sentinel</h2>
          <p class="muted">${escapeHtml(customEmbedQuota(state))}</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid module-form-grid">
        <form data-action-form="custom-embed-create">
          ${labelHelp('Créer un embed Sentinel', 'Publie une annonce propre sous l’identité de Sentinel dans le salon choisi. Le gratuit garde un nombre limité d’embeds actifs.')}
          <select name="channelId">${channelOptions}</select>
          <input name="title" placeholder="Titre" maxlength="256" required>
          <textarea name="description" placeholder="Message de l'annonce" maxlength="4000" required></textarea>
          <input name="color" placeholder="Couleur : rose, cyan, #ff2d9a">
          <select name="roleId">${pingRoleOptions}</select>
          <input name="imageUrl" placeholder="Image URL optionnelle">
          <input name="thumbnailUrl" placeholder="Miniature URL optionnelle">
          <input name="footer" placeholder="Footer optionnel">
          <button class="button" type="submit">Envoyer l’embed</button>
        </form>
        <form data-action-form="custom-embed-edit">
          ${labelHelp('Modifier un embed existant', 'Modifie un embed Sentinel déjà envoyé avec son ID de message. Les modifications ne consomment pas de quota et Sentinel retrouve le salon automatiquement.')}
          <input name="messageId" placeholder="ID du message embed" required>
          <input name="title" placeholder="Nouveau titre">
          <textarea name="description" placeholder="Nouveau message"></textarea>
          <input name="color" placeholder="Nouvelle couleur">
          <input name="imageUrl" placeholder="Nouvelle image URL, ou retirer">
          <input name="thumbnailUrl" placeholder="Nouvelle miniature URL, ou retirer">
          <input name="footer" placeholder="Nouveau footer, ou retirer">
          <button class="button" type="submit">Modifier sans quota</button>
        </form>
        <form data-action-form="custom-embed-delete">
          ${labelHelp('Supprimer un embed Sentinel', 'Supprime un embed géré par Sentinel avec son ID de message et libère son emplacement gratuit si le serveur n’est pas Premium.')}
          <input name="messageId" placeholder="ID du message embed" required>
          <button class="button button-ghost" type="submit">Supprimer</button>
        </form>
        <article class="inline-form">
          ${labelHelp('Embeds gérés', 'Liste les embeds que Sentinel peut encore modifier ou supprimer depuis le dashboard. Copie leur ID pour les gérer.')}
          ${customEmbedList(state)}
        </article>
      </div>
    </section>
      `)}

      ${tabPanel('dossiers', `
    <section class="dashboard-panel module-panel dossiers-panel" id="dossiers">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Dossiers Sentinel</p>
          <h2>Bureau d’accueil et suivi</h2>
          <p class="muted">Dans Sentinel, un dossier est un ticket privé : un membre choisit un type de demande, explique le sujet, puis Sentinel crée un salon réservé avec l’équipe autorisée.</p>
        </div>
        <span class="status-badge">${escapeHtml(state.dossiers?.openCount || 0)} ouvert(s)</span>
      </div>
      ${dossierPermissionAlert(state)}
      <div class="dashboard-alert is-ready dossier-quota-alert">
        <strong>Limites dossiers</strong>
        <p>${escapeHtml(dossierQuotaText(state))}</p>
      </div>
      <div class="form-grid module-form-grid">
        <form data-action-form="publish-dossier-panel">
          ${labelHelp('Publier le bureau d’accueil', 'Envoie le panneau de tickets. En gratuit, un serveur garde un seul panneau actif ; en Premium, les panneaux seront illimités.')}
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">Publier le bureau</button>
        </form>
        <article class="inline-form dossier-explain-card">
          ${labelHelp('À quoi ça sert ?', 'Un dossier Sentinel est un ticket privé pour le support, un signalement, un recrutement, un partenariat ou une autre demande.')}
          <p>En gratuit, les responsables peuvent répondre, ajouter des intervenants, prendre le ticket en charge, corriger son statut, générer un compte rendu et le clôturer.</p>
        </article>
        <article class="inline-form dossier-explain-card">
          ${labelHelp('Rôles responsables', 'Ces rôles peuvent voir les tickets, les prendre en charge, changer leur statut, générer l’archive et clôturer le salon.')}
          <form data-action-form="add-dossier-role">
            <select name="roleId">${dossierRoleOptions}</select>
            <button class="button" type="submit">Ajouter le rôle</button>
          </form>
          ${dossierRoleList(state)}
        </article>
        <article class="inline-form dossier-explain-card premium-roadmap">
          ${labelHelp('Premium dossiers', 'Le Premium ajoutera les panneaux illimités, catégories personnalisées, formulaires avancés, priorités, templates, historique complet, statistiques et automatisations.')}
          <p>Le gratuit reste simple : ouvrir, suivre, clôturer et retrouver les 10 derniers dossiers. Le Premium servira aux gros staffs qui ont besoin de trier et automatiser beaucoup de demandes.</p>
        </article>
        ${dossierPremiumSettings(state, premiumTag)}
        <article class="inline-form dossier-list-card">
          ${labelHelp('Dossiers récents', 'Retrouve les dossiers ouverts ou clôturés sur ce serveur. Un dossier ouvert peut être clôturé depuis le dashboard.')}
          ${dossierFiltersPanel(state)}
          ${dossierList(state)}
        </article>
      </div>
    </section>
      `)}

      ${tabPanel('audit', renderAuditPanel(state))}

      ${tabPanel('moderation', `
    <section class="dashboard-panel module-panel moderation-panel" id="moderation">
      <div class="panel-heading">
        <p class="eyebrow">Modération</p>
        <h2>Commandes de modération</h2>
        <p class="muted">Le gratuit garde les actions essentielles : avertissements, timeout, kick, ban par ID et purge. Le Premium ajoutera des outils plus poussés pour les gros staffs.</p>
      </div>
      ${permissionDiagnosticsPanel(state)}
      <div class="form-grid module-form-grid">
        <article class="inline-form moderation-note">
          ${labelHelp('Rôle automatique d’arrivée', 'Donne automatiquement un rôle aux nouveaux membres qui rejoignent le serveur. Sentinel doit avoir Gérer les rôles et être placé au-dessus du rôle choisi.')}
          <p class="muted">Actuel : ${state.config.autoRoleId ? escapeHtml(resolveRole(state, state.config.autoRoleId)?.name || 'rôle supprimé sur Discord') : 'désactivé'}</p>
          <form data-action-form="set-auto-role">
            <select name="roleId">${autoRoleOptions}</select>
            <button class="button" type="submit">Configurer l’auto-rôle</button>
          </form>
          <form data-action-form="disable-auto-role">
            <button class="button button-ghost" type="submit">Désactiver l’auto-rôle</button>
          </form>
        </article>
        <form data-action-form="warn">
          ${labelHelp('Avertir par ID', 'Ajoute un avertissement au dossier de modération d’un utilisateur et l’enregistre dans les logs.')}
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Avertir</button>
        </form>
        <form data-action-form="timeout">
          ${labelHelp('Timeout', 'Rend temporairement muet un membre présent sur le serveur pendant la durée indiquée.')}
          <input name="userId" placeholder="ID Discord du membre présent" required>
          <input name="duration" placeholder="10m, 2h, 7d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Timeout</button>
        </form>
        <form data-action-form="untimeout">
          ${labelHelp('Fin timeout', 'Retire un timeout actif sur un membre présent et garde une trace de l’action.')}
          <input name="userId" placeholder="ID Discord du membre présent" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Retirer</button>
        </form>
        <form data-action-form="kick">
          ${labelHelp('Expulser', 'Retire un membre du serveur sans le bannir. Il pourra revenir avec une nouvelle invitation.')}
          <input name="userId" placeholder="ID Discord du membre présent" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Expulser</button>
        </form>
        <form data-action-form="ban">
          ${labelHelp('Bannir par ID', 'Bannit un utilisateur avec son ID Discord, même s’il n’est plus présent sur le serveur.')}
          <input name="userId" placeholder="ID Discord, même hors serveur" required>
          <input name="reason" placeholder="Raison">
          <input name="deleteDays" type="number" min="0" max="7" placeholder="Jours messages">
          <button class="button" type="submit">Bannir</button>
        </form>
        <form data-action-form="purge">
          ${labelHelp('Purge messages', 'Supprime rapidement un nombre defini de messages recents dans le salon choisi.')}
          <select name="channelId">${channelOptions}</select>
          <input name="count" type="number" min="1" max="100" value="10">
          <button class="button" type="submit">Purger</button>
        </form>
        <article class="inline-form moderation-cases-note">
          ${labelHelp('Derniers dossiers', 'Affiche les dernières sanctions enregistrées sur ce serveur. Les ID restent visibles même si la personne a quitté le Discord.')}
          ${moderationCaseFilters(state)}
          ${moderationCaseList(state)}
        </article>
        <article class="inline-form user-lookup-note">
          ${labelHelp('Historique utilisateur', 'Entre un ID Discord pour consulter les heures, les sanctions et les actions liées à une personne.')}
          <form class="inline-lookup-form" data-user-lookup>
            <input name="userId" placeholder="ID Discord" required>
            <button class="button" type="submit">Chercher</button>
          </form>
          ${userProfilePanel(selectedUserProfile)}
        </article>
        <article class="inline-form moderation-note">
          <h3>Inclus en gratuit</h3>
          <p>Avertissements, timeout, fin de timeout, expulsion, ban par ID, purge et consultation simple des 10 derniers cas avec <code>/sanctions</code>.</p>
        </article>
      </div>
    </section>

    <section class="dashboard-panel premium-panel inline-premium-panel module-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Options premium</p>
          <h2>Modération avancée</h2>
          <p class="muted">Ces actions sont pensées pour les staffs qui gèrent beaucoup de salons, de sanctions et de cas de modération. Les sanctions automatiques après X avertissements seront ajoutées plus tard.</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid module-form-grid">
        <form data-action-form="tempban">
          ${labelHelp('Ban temporaire par ID', 'Option Premium : bannit un utilisateur pour une durée précise, puis Sentinel le débannit automatiquement.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID Discord" required>
          <input name="duration" placeholder="1h, 7d, 30d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Tempban</button>
        </form>
        <form data-action-form="unban">
          ${labelHelp('Débannir par ID', 'Option Premium : retire le bannissement d’un utilisateur avec son ID Discord, même s’il n’est plus dans le serveur.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unban</button>
        </form>
        <form data-action-form="lock">
          ${labelHelp('Verrouiller salon', 'Option Premium : bloque l’envoi de messages dans un salon pour calmer une situation ou préparer une annonce.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Lock</button>
        </form>
        <form data-action-form="unlock">
          ${labelHelp('Déverrouiller salon', 'Option Premium : remet un salon verrouillé en mode normal pour permettre aux membres de reparler.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unlock</button>
        </form>
        <form data-action-form="slowmode">
          ${labelHelp('Mode lent', 'Option Premium : impose un délai entre deux messages pour ralentir un salon trop actif.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="duration" placeholder="10s, 5m, 0">
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Slowmode</button>
        </form>
        <form data-action-form="edit-case">
          ${labelHelp('Modifier un cas', 'Option Premium : corrige ou précise la raison d’un dossier de modération déjà enregistré.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Nouvelle raison" required>
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Modifier</button>
        </form>
        <form data-action-form="delete-case">
          ${labelHelp('Supprimer un cas', 'Option Premium : retire un dossier de modération créé par erreur ou devenu invalide.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Supprimer</button>
        </form>
        <form data-action-form="unwarn">
          ${labelHelp('Retirer un avertissement', 'Option Premium : annule un avertissement précis sans effacer toute l’histoire de modération du membre.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas avertissement" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unwarn</button>
        </form>
        <article class="inline-form moderation-note premium-roadmap">
          <h3>Automatisation Premium ${premiumTag}</h3>
          <p>Prévu plus tard : déclencher automatiquement une sanction après X avertissements, par exemple timeout, kick ou ban selon les règles du serveur.</p>
        </article>
        <form data-action-form="reset-guild">
          ${labelHelp('Reset global serveur', 'Option Premium : remet à zéro toutes les heures de service du serveur avec une action globale réservée aux grands nettoyages.', ` ${premiumTag}`)}
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Reset global</button>
        </form>
      </div>
    </section>
      `)}
    </div>
  `;

  attachDashboardHandlers();
}

async function refreshGuildState() {
  if (!selectedGuildId) return;
  const payload = await api(`/api/guilds/${selectedGuildId}/state`);
  currentState = payload.state;
  renderDashboard();
}

async function runAction(action, data, button = null) {
  if (!selectedGuildId) return;
  setLoading(button, true);

  try {
    const payload = await api(`/api/guilds/${selectedGuildId}/action`, {
      method: 'POST',
      body: JSON.stringify({ action, ...data })
    });
    currentState = payload.state;
    renderDashboard();
    renderGuilds();
    toast(payload.message || 'Action terminée.');
  } catch (error) {
    toast(dashboardErrorMessage(error.message), 'error');
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
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error.message), 'error');
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
    renderDashboard();
  } catch (error) {
    toast(dashboardErrorMessage(error.message), 'error');
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
    toast(dashboardErrorMessage(error.message), 'error');
  } finally {
    setLoading(button, false);
  }
}

function attachDashboardHandlers() {
  $$('[data-dashboard-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.dashboardTab;

      if (!DASHBOARD_TABS.some((tab) => tab.id === nextTab)) {
        return;
      }

      activeDashboardTab = nextTab;
      renderDashboard();
    });
  });

  $$('[data-action-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const action = form.dataset.actionForm;
      const button = $('button[type="submit"]', form);
      runAction(action, formData(form), button);
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
  renderGuilds();
}

async function selectGuild(guildId) {
  selectedGuildId = guildId;
  auditScope = 'server';
  auditFilters = {};
  moderationFilters = {};
  expandedModerationCaseId = null;
  selectedUserProfile = null;
  dossierFilters = {};
  expandedDossierId = null;
  renderGuilds();

  const guild = guilds.find((item) => item.id === guildId);
  if (guild && !guild.installed) {
    currentState = null;
    renderDashboard();
    toast(dashboardErrorMessage('Sentinel is not installed on this server.'), 'error');
    return;
  }

  window.SentinelAuth?.saveSettings?.({ lastGuildId: guildId });

  try {
    await refreshGuildState();
  } catch (error) {
    if (error.payload?.inviteUrl) {
      toast('Sentinel doit être autorisé sur ce serveur.', 'error');
      window.open(error.payload.inviteUrl, '_blank', 'noopener');
      return;
    }
    toast(error.message, 'error');
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

  try {
    const session = await api('/api/session');
    currentUser = session.user;
    currentSettings = session.settings || null;
    renderUser();
    await loadGuilds();

    const restorableGuildId = getRestorableGuildId();

    if (restorableGuildId) {
      await selectGuild(restorableGuildId);
    }
  } catch (error) {
    currentUser = null;
    currentSettings = null;
    renderUser();
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
  await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
  currentUser = null;
  guilds = [];
  selectedGuildId = null;
  currentState = null;
  currentSettings = null;
  dossierFilters = {};
  expandedDossierId = null;
  localStorage.removeItem('sentinel-discord-profile');
  localStorage.removeItem(LAST_GUILD_STORAGE_KEY);
  renderUser();
  renderGuilds();
  renderDashboard();
});

bootstrap();
