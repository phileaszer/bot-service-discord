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

const publicDashboardHost = window.location.pathname.endsWith('/dashboard.html')
  || window.location.hostname.endsWith('github.io');

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

function metricCards(state) {
  return `
    <div class="dashboard-metrics">
      <article><span>Agents</span><strong>${state.summary.registeredUsers}</strong></article>
      <article><span>En service</span><strong>${state.summary.activeCount}</strong></article>
      <article><span>Total</span><strong>${state.summary.totalServiceTime}</strong></article>
      <article><span>Semaine</span><strong>${state.summary.weeklyServiceTime}</strong></article>
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

  const cards = [
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
    <div class="config-status-grid">
      ${cards.map((card) => `
        <article class="config-status-card ${card.ready ? 'is-ready' : 'is-warning'}">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(statusText(card.ready))}</small>
        </article>
      `).join('')}
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

function recentActions(state, limit = 5) {
  const items = (state.recentActions || state.auditLogs?.items || []).slice(0, limit);

  if (items.length === 0) {
    return '<p class="muted">Aucune action récente depuis le dashboard.</p>';
  }

  return `
    <ul class="recent-action-list">
      ${items.map((item) => `
        <li>
          <span>${escapeHtml(formatAuditDate(item.createdAt))}</span>
          <strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong>
          <p>${escapeHtml(item.summary)}</p>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderServerHome(state, premiumBadge) {
  return `
    <section class="dashboard-panel server-home">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Accueil serveur</p>
          <h2>${escapeHtml(state.guild.name)}</h2>
          <p class="muted">Vue rapide de la configuration, des agents et des dernières actions Sentinel.</p>
        </div>
        ${premiumBadge}
      </div>
      ${metricCards(state)}
      ${configStatusCards(state)}
      <div class="server-home-grid">
        <article class="home-block">
          <h3>Alertes</h3>
          ${configAlerts(state)}
        </article>
        <article class="home-block">
          <h3>Actions récentes</h3>
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

function commandRoleList(state) {
  const roles = (state.config.commandRoleIds || [])
    .map((roleId) => state.roles.find((role) => role.id === roleId))
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
  if (state.activeServices.length === 0) {
    return '<p class="muted">Aucun agent en service.</p>';
  }

  return `
    <ul class="compact-list">
      ${state.activeServices.map((service) => `<li><code>${service.userId}</code><span>${service.durationLabel}</span></li>`).join('')}
    </ul>
  `;
}

function topService(state) {
  if (state.topService.length === 0) {
    return '<p class="muted">Aucun temps enregistré.</p>';
  }

  return `
    <ul class="compact-list">
      ${state.topService.map((user, index) => `<li><code>#${index + 1} ${user.userId}</code><span>${user.totalTimeLabel}</span></li>`).join('')}
    </ul>
  `;
}

function customEmbedQuota(state) {
  const quota = state.customEmbeds?.quota;

  if (!quota) {
    return 'Quota indisponible';
  }

  if (quota.unlimited) {
    return 'Premium : création illimitée, modifications illimitées.';
  }

  return `Gratuit : ${quota.used}/${quota.limit} embeds actifs utilisés. Restant : ${quota.remaining}. Modifications illimitées.`;
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

const AUDIT_ACTION_LABELS = {
  'set-language': 'Langue',
  'set-service-role': 'Rôle de service',
  'set-log-channel': 'Salon de logs',
  'publish-service-panel': 'Panneau de service',
  'add-command-role': 'Rôle autorisé ajouté',
  'remove-command-role': 'Rôle autorisé retiré',
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
  purge: 'Purge',
  lock: 'Lock',
  unlock: 'Unlock',
  slowmode: 'Mode lent',
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

function auditLogList(state) {
  const items = state.auditLogs?.items || [];

  if (items.length === 0) {
    return '<p class="muted">Aucune action dashboard trouvée avec ces filtres.</p>';
  }

  return `
    <ul class="audit-list">
      ${items.map((item) => `
        <li class="audit-item audit-${escapeHtml(item.status)}">
          <div>
            <span class="audit-meta">${escapeHtml(formatAuditDate(item.createdAt))} - ${escapeHtml(item.guildName || item.guildId || '')}</span>
            <strong>${escapeHtml(AUDIT_ACTION_LABELS[item.action] || item.action)}</strong>
            <p>${escapeHtml(item.summary)}</p>
          </div>
          <div class="audit-side">
            <span class="audit-status">${escapeHtml(auditStatusLabel(item.status))}</span>
            <code>${escapeHtml(item.actorUsername || item.actorUserId)}</code>
            ${item.targetId ? `<small>${escapeHtml(item.targetType || 'cible')} : ${escapeHtml(item.targetId)}</small>` : ''}
          </div>
        </li>
      `).join('')}
    </ul>
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
          <p class="eyebrow">Journal</p>
          <h2>Audit dashboard</h2>
          <p class="muted">Journal des actions réalisées depuis le dashboard. Ce serveur affiche uniquement ses propres actions, avec date, utilisateur, cible et résultat.</p>
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
          ${labelHelp('Action', 'Filtre par type d’action dashboard : reset, ban, embed, configuration, etc.')}
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
          ${labelHelp('Limite', 'Nombre maximum de lignes affichées. Les serveurs Premium et la créatrice ont une limite plus haute.')}
          <input name="limit" type="number" min="1" max="100" value="${escapeHtml(auditFilters.limit || auditLogs.limit || 25)}">
        </div>
        <div class="audit-actions">
          <button class="button" type="submit">Filtrer le journal</button>
          <button class="button button-ghost" type="button" data-audit-reset>Réinitialiser</button>
          ${canViewGlobal ? `
            <button class="button button-ghost" type="button" data-audit-scope="${currentScope === 'global' ? 'server' : 'global'}">
              ${currentScope === 'global' ? 'Vue serveur' : 'Vue globale créatrice'}
            </button>
          ` : ''}
        </div>
      </form>
      <div class="audit-scope-note">
        <span>${currentScope === 'global' ? 'Vue globale privée créatrice' : 'Vue serveur uniquement'}</span>
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
    eyebrow: 'État',
    title: 'Accueil serveur'
  },
  {
    id: 'setup',
    label: 'Assistant',
    eyebrow: 'Guide',
    title: 'Configuration guidée'
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
    id: 'embeds',
    label: 'Embeds',
    eyebrow: 'Annonces',
    title: 'Messages Sentinel'
  },
  {
    id: 'audit',
    label: 'Journal',
    eyebrow: 'Audit',
    title: 'Traces dashboard'
  },
  {
    id: 'moderation',
    label: 'Modération',
    eyebrow: 'Sécurité',
    title: 'Actions rapides'
  }
];

function renderDashboardTabs(state, premiumBadge) {
  const activeTab = DASHBOARD_TABS.find((tab) => tab.id === activeDashboardTab) || DASHBOARD_TABS[0];

  return `
    <section class="dashboard-control-panel">
      <div class="control-summary">
        <p class="eyebrow">Centre de contrôle</p>
        <h2>${escapeHtml(activeTab.title)}</h2>
        <p>${escapeHtml(state.guild.name)} - ${state.advanced ? 'Premium actif' : 'Mode gratuit'}</p>
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
        <p>Le dashboard affichera les commandes disponibles selon les permissions et le statut Premium du serveur.</p>
      </div>
    `;
    return;
  }

  const state = currentState;
  const roleOptions = optionList(state.roles, state.config.serviceRoleId, 'Choisir un rôle');
  const commandRoleOptions = optionList(state.roles, null, 'Choisir un rôle autorisé');
  const pingRoleOptions = optionList(state.roles, null, 'Aucun ping de rôle');
  const channelOptions = optionList(state.channels, state.config.logChannelId, 'Choisir un salon');
  const premiumBadge = state.advanced ? '<span class="premium-badge">Premium actif</span>' : '<span class="free-badge">Gratuit</span>';
  const premiumTag = '<span class="premium-tag">Option Premium</span>';

  main.innerHTML = `
    ${renderDashboardTabs(state, premiumBadge)}
    <div class="dashboard-tab-stage">
      ${tabPanel('overview', renderServerHome(state, premiumBadge))}

      ${tabPanel('setup', renderSetupAssistant(state, roleOptions, commandRoleOptions, channelOptions))}

      ${tabPanel('configuration', `
    <section class="dashboard-panel" id="configuration">
      <div class="panel-heading">
        <p class="eyebrow">Configuration</p>
        <h2>Réglages serveur</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="set-language">
          ${labelHelp('Langue du serveur', 'Choisit la langue utilisée par Sentinel sur ce serveur uniquement. Les réponses Discord et le dashboard suivront ce choix.')}
          <select name="language">
            <option value="fr"${state.config.language === 'fr' ? ' selected' : ''}>Français</option>
            <option value="en"${state.config.language === 'en' ? ' selected' : ''}>English</option>
          </select>
          <button class="button" type="submit">Mettre à jour</button>
        </form>
        <form data-action-form="set-service-role">
          ${labelHelp('Rôle de service', 'Rôle ajouté automatiquement quand un membre prend son service, puis retiré quand il termine.')}
          <select name="roleId">${roleOptions}</select>
          <button class="button" type="submit">Configurer</button>
        </form>
        <form data-action-form="set-log-channel">
          ${labelHelp('Salon de logs', 'Salon où Sentinel publie les prises de service, fins de service, durées et actions importantes.')}
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">Configurer</button>
        </form>
        <form data-action-form="publish-service-panel">
          ${labelHelp('Publier le panneau de service', 'Envoie dans le salon choisi le bouton que les membres utiliseront pour prendre ou finir leur service.')}
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">Publier</button>
        </form>
      </div>
      <div class="command-roles">
        <h3>Rôles autorisés à gérer Sentinel ${helpTip('Ces rôles peuvent utiliser les commandes de gestion et agir depuis le dashboard, selon les permissions Discord du serveur.')}</h3>
        <div class="role-chip-row">${commandRoleList(state)}</div>
        <form class="inline-form" data-action-form="add-command-role">
          ${labelHelp('Ajouter un rôle autorisé', 'Ajoute un rôle staff à la liste des rôles autorisés à configurer et gérer Sentinel.')}
          <select name="roleId">${commandRoleOptions}</select>
          <button class="button button-small" type="submit">Ajouter</button>
        </form>
      </div>
    </section>
      `)}

      ${tabPanel('service', `
    <section class="dashboard-panel" id="service">
      <div class="panel-heading">
        <p class="eyebrow">Service</p>
        <h2>Actions immédiates</h2>
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
          ${labelHelp('Synchronisation service', 'Option Premium : répare les incohérences entre les membres en service, les rôles Discord et la base de données.', ` ${premiumTag}`)}
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Synchroniser</button>
        </form>
      </div>
      <div class="split-mini">
        <article>
          <h3>En service</h3>
          ${activeServices(state)}
        </article>
        <article>
          <h3>Top service</h3>
          ${topService(state)}
        </article>
      </div>
    </section>
      `)}

      ${tabPanel('embeds', `
    <section class="dashboard-panel" id="embeds">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Annonces</p>
          <h2>Embeds Sentinel</h2>
          <p class="muted">${escapeHtml(customEmbedQuota(state))}</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid">
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
          ${labelHelp('Modifier un embed existant', 'Modifie un embed Sentinel déjà envoyé avec son ID de message. Les modifications ne consomment pas de quota.')}
          <select name="channelId">${channelOptions}</select>
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
          ${labelHelp('Supprimer un embed Sentinel', 'Supprime un embed géré par Sentinel et libère son emplacement gratuit si le serveur n’est pas Premium.')}
          <select name="channelId">${channelOptions}</select>
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

      ${tabPanel('audit', renderAuditPanel(state))}

      ${tabPanel('moderation', `
    <section class="dashboard-panel" id="moderation">
      <div class="panel-heading">
        <p class="eyebrow">Modération</p>
        <h2>Commandes de modération</h2>
        <p class="muted">Les actions Premium restent visibles ici avec un badge dédié, pour comprendre clairement ce qui est inclus dans chaque offre.</p>
      </div>
      <div class="form-grid">
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
      </div>
    </section>

    <section class="dashboard-panel premium-panel inline-premium-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Options premium</p>
          <h2>Modération avancée</h2>
          <p class="muted">Ces actions sont pensées pour les staffs qui gèrent beaucoup de salons, de sanctions et de cas de modération.</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid">
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
    toast(payload.message || 'Action exécutée.');
  } catch (error) {
    toast(error.message, 'error');
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
    toast(error.message, 'error');
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
  renderGuilds();

  const guild = guilds.find((item) => item.id === guildId);
  if (guild && !guild.installed) {
    currentState = null;
    renderDashboard();
    toast('Autorise Sentinel sur ce serveur avant d’ouvrir le dashboard.', 'error');
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

    if (
      currentSettings?.lastGuildId
      && guilds.some((guild) => guild.id === currentSettings.lastGuildId && guild.installed)
    ) {
      await selectGuild(currentSettings.lastGuildId);
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
  localStorage.removeItem('sentinel-discord-profile');
  renderUser();
  renderGuilds();
  renderDashboard();
});

bootstrap();
