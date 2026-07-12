const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let currentUser = null;
let guilds = [];
let selectedGuildId = null;
let currentState = null;

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
  button.textContent = isLoading ? 'Envoi...' : button.dataset.originalText;
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
    login.hidden = true;
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

  if (!drawer || !backdrop) return;

  drawer.classList.toggle('is-open', isOpen);
  backdrop.hidden = !isOpen;
  document.body.classList.toggle('drawer-open', isOpen);
}

function renderUser() {
  const card = $('[data-user-card]');
  const login = $('[data-login]');
  const logout = $('[data-logout]');

  if (!currentUser) {
    card.innerHTML = '<span>Non connecte</span>';
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
    list.innerHTML = '<p class="muted">Aucun serveur gerable trouve. Verifie tes permissions Discord.</p>';
    return;
  }

  list.innerHTML = guilds.map((guild) => `
    <article class="guild-card ${guild.id === selectedGuildId ? 'is-active' : ''}">
      <button type="button" data-select-guild="${guild.id}">
        ${guild.icon ? `<img src="${guild.icon}" alt="">` : '<span class="guild-fallback">S</span>'}
        <span>
          <strong>${escapeHtml(guild.name)}</strong>
          <small>${guild.installed ? (guild.advanced ? 'Premium / reference' : 'Bot installe') : 'Autorisation requise'}</small>
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

function commandRoleList(state) {
  const roles = state.config.commandRoleIds
    .map((roleId) => state.roles.find((role) => role.id === roleId))
    .filter(Boolean);

  if (roles.length === 0) {
    return '<p class="muted">Aucun role autorise configure. Le mode amorcage Discord reste actif.</p>';
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
    return '<p class="muted">Aucun temps enregistre.</p>';
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
    return 'Premium : creation illimitee, modifications illimitees';
  }

  return `Gratuit : ${quota.used}/${quota.limit} embeds actifs utilises. Restant : ${quota.remaining}. Modifications illimitees.`;
}

function customEmbedList(state) {
  const items = state.customEmbeds?.items || [];

  if (items.length === 0) {
    return '<p class="muted">Aucun embed Sentinel cree depuis ce dashboard ou Discord.</p>';
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

function renderDashboard() {
  const main = $('[data-dashboard-main]');

  if (!currentState) {
    main.innerHTML = `
      <div class="empty-state">
        <img src="assets/sentinel-mark.png" alt="">
        <h2>Selectionne un serveur</h2>
        <p>Le dashboard affichera les commandes disponibles selon les permissions et le statut Premium du serveur.</p>
      </div>
    `;
    return;
  }

  const state = currentState;
  const roleOptions = optionList(state.roles, state.config.serviceRoleId, 'Choisir un role');
  const commandRoleOptions = optionList(state.roles, null, 'Choisir un role autorise');
  const pingRoleOptions = optionList(state.roles, null, 'Aucun ping de role');
  const channelOptions = optionList(state.channels, state.config.logChannelId, 'Choisir un salon');
  const premiumBadge = state.advanced ? '<span class="premium-badge">Premium actif</span>' : '<span class="free-badge">Gratuit</span>';

  main.innerHTML = `
    <section class="dashboard-panel server-overview">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Serveur selectionne</p>
          <h2>${escapeHtml(state.guild.name)}</h2>
        </div>
        ${premiumBadge}
      </div>
      ${metricCards(state)}
    </section>

    <section class="dashboard-panel" id="configuration">
      <div class="panel-heading">
        <p class="eyebrow">Configuration</p>
        <h2>Reglages serveur</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="set-language">
          <label>Langue du serveur</label>
          <select name="language">
            <option value="fr"${state.config.language === 'fr' ? ' selected' : ''}>Francais</option>
            <option value="en"${state.config.language === 'en' ? ' selected' : ''}>English</option>
          </select>
          <button class="button" type="submit">Mettre a jour</button>
        </form>
        <form data-action-form="set-service-role">
          <label>Role de service</label>
          <select name="roleId">${roleOptions}</select>
          <button class="button" type="submit">Configurer</button>
        </form>
        <form data-action-form="set-log-channel">
          <label>Salon de logs</label>
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">Configurer</button>
        </form>
        <form data-action-form="publish-service-panel">
          <label>Publier le panneau de service</label>
          <select name="channelId">${channelOptions}</select>
          <button class="button" type="submit">Publier</button>
        </form>
      </div>
      <div class="command-roles">
        <h3>Roles autorises a gerer Sentinel</h3>
        <div class="role-chip-row">${commandRoleList(state)}</div>
        <form class="inline-form" data-action-form="add-command-role">
          <select name="roleId">${commandRoleOptions}</select>
          <button class="button button-small" type="submit">Ajouter</button>
        </form>
      </div>
    </section>

    <section class="dashboard-panel" id="service">
      <div class="panel-heading">
        <p class="eyebrow">Service</p>
        <h2>Actions immediates</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="start-service">
          <label>Prendre le service pour un membre</label>
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Prendre service</button>
        </form>
        <form data-action-form="end-service">
          <label>Finir le service pour un membre</label>
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Fin service</button>
        </form>
        <form data-action-form="reset-user">
          <label>Reset heures individuel</label>
          <input name="userId" placeholder="ID Discord, meme si la personne est partie" required>
          <button class="button" type="submit">Reset</button>
        </form>
        <form data-action-form="sync-service">
          <label>Synchronisation service ${state.advanced ? '' : '(Premium)'}</label>
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
          <label>Creer un embed Sentinel</label>
          <select name="channelId">${channelOptions}</select>
          <input name="title" placeholder="Titre" maxlength="256" required>
          <textarea name="description" placeholder="Message de l'annonce" maxlength="4000" required></textarea>
          <input name="color" placeholder="Couleur : rose, cyan, #ff2d9a">
          <select name="roleId">${pingRoleOptions}</select>
          <input name="imageUrl" placeholder="Image URL optionnelle">
          <input name="thumbnailUrl" placeholder="Miniature URL optionnelle">
          <input name="footer" placeholder="Footer optionnel">
          <button class="button" type="submit">Envoyer l'embed</button>
        </form>
        <form data-action-form="custom-embed-edit">
          <label>Modifier un embed existant</label>
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
          <label>Supprimer un embed Sentinel</label>
          <select name="channelId">${channelOptions}</select>
          <input name="messageId" placeholder="ID du message embed" required>
          <button class="button button-ghost" type="submit">Supprimer</button>
        </form>
        <article class="inline-form">
          <label>Embeds geres</label>
          ${customEmbedList(state)}
        </article>
      </div>
    </section>

    <section class="dashboard-panel" id="moderation">
      <div class="panel-heading">
        <p class="eyebrow">Moderation</p>
        <h2>Commandes gratuites et Premium</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="warn">
          <label>Avertir par ID</label>
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Avertir</button>
        </form>
        <form data-action-form="timeout">
          <label>Timeout</label>
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="duration" placeholder="10m, 2h, 7d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Timeout</button>
        </form>
        <form data-action-form="untimeout">
          <label>Fin timeout</label>
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Retirer</button>
        </form>
        <form data-action-form="kick">
          <label>Expulser</label>
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Expulser</button>
        </form>
        <form data-action-form="ban">
          <label>Bannir par ID</label>
          <input name="userId" placeholder="ID Discord, meme hors serveur" required>
          <input name="reason" placeholder="Raison">
          <input name="deleteDays" type="number" min="0" max="7" placeholder="Jours messages">
          <button class="button" type="submit">Bannir</button>
        </form>
        <form data-action-form="purge">
          <label>Purge messages</label>
          <select name="channelId">${channelOptions}</select>
          <input name="count" type="number" min="1" max="100" value="10">
          <button class="button" type="submit">Purger</button>
        </form>
      </div>
    </section>

    <section class="dashboard-panel premium-panel">
      <div class="panel-heading row-heading">
        <div>
          <p class="eyebrow">Premium</p>
          <h2>Moderation avancee</h2>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid">
        <form data-action-form="tempban">
          <label>Ban temporaire par ID</label>
          <input name="userId" placeholder="ID Discord" required>
          <input name="duration" placeholder="1h, 7d, 30d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Tempban</button>
        </form>
        <form data-action-form="unban">
          <label>Debannir par ID</label>
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unban</button>
        </form>
        <form data-action-form="lock">
          <label>Verrouiller salon</label>
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Lock</button>
        </form>
        <form data-action-form="unlock">
          <label>Deverrouiller salon</label>
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unlock</button>
        </form>
        <form data-action-form="slowmode">
          <label>Mode lent</label>
          <select name="channelId">${channelOptions}</select>
          <input name="duration" placeholder="10s, 5m, 0">
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Slowmode</button>
        </form>
        <form data-action-form="edit-case">
          <label>Modifier un cas</label>
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Nouvelle raison" required>
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Modifier</button>
        </form>
        <form data-action-form="delete-case">
          <label>Supprimer un cas</label>
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Supprimer</button>
        </form>
        <form data-action-form="unwarn">
          <label>Retirer un avertissement</label>
          <input name="caseId" placeholder="ID du cas avertissement" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unwarn</button>
        </form>
        <form data-action-form="reset-guild">
          <label>Reset global serveur</label>
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Reset global</button>
        </form>
      </div>
    </section>
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
    toast(payload.message || 'Action executee.');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

function attachDashboardHandlers() {
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
}

async function loadGuilds() {
  const payload = await api('/api/guilds');
  guilds = payload.guilds;
  renderGuilds();
}

async function selectGuild(guildId) {
  selectedGuildId = guildId;
  renderGuilds();

  const guild = guilds.find((item) => item.id === guildId);
  if (guild && !guild.installed) {
    currentState = null;
    renderDashboard();
    toast('Autorise Sentinel sur ce serveur avant d ouvrir le dashboard.', 'error');
    return;
  }

  try {
    await refreshGuildState();
  } catch (error) {
    if (error.payload?.inviteUrl) {
      toast('Sentinel doit etre autorise sur ce serveur.', 'error');
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
    renderUser();
    await loadGuilds();
  } catch (error) {
    currentUser = null;
    renderUser();
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-open-guild-drawer]')) {
    setGuildDrawerOpen(true);
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setGuildDrawerOpen(false);
  }
});

$('[data-logout]')?.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
  currentUser = null;
  guilds = [];
  selectedGuildId = null;
  currentState = null;
  renderUser();
  renderGuilds();
  renderDashboard();
});

bootstrap();
