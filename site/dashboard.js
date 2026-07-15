const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let currentUser = null;
let guilds = [];
let selectedGuildId = null;
let currentState = null;
let currentSettings = null;
let activeDashboardTab = 'overview';

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
    label: 'Vue d ensemble',
    eyebrow: 'Etat',
    title: 'Resume serveur'
  },
  {
    id: 'configuration',
    label: 'Configuration',
    eyebrow: 'Reglages',
    title: 'Parametres'
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
    id: 'moderation',
    label: 'Moderation',
    eyebrow: 'Securite',
    title: 'Actions rapides'
  }
];

function renderDashboardTabs(state, premiumBadge) {
  const activeTab = DASHBOARD_TABS.find((tab) => tab.id === activeDashboardTab) || DASHBOARD_TABS[0];

  return `
    <section class="dashboard-control-panel">
      <div class="control-summary">
        <p class="eyebrow">Centre de controle</p>
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
  const premiumTag = '<span class="premium-tag">Option Premium</span>';

  main.innerHTML = `
    ${renderDashboardTabs(state, premiumBadge)}
    <div class="dashboard-tab-stage">
      ${tabPanel('overview', `
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
      `)}

      ${tabPanel('configuration', `
    <section class="dashboard-panel" id="configuration">
      <div class="panel-heading">
        <p class="eyebrow">Configuration</p>
        <h2>Reglages serveur</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="set-language">
          ${labelHelp('Langue du serveur', 'Choisit la langue utilisee par Sentinel sur ce serveur uniquement. Les reponses Discord et le dashboard suivront ce choix.')}
          <select name="language">
            <option value="fr"${state.config.language === 'fr' ? ' selected' : ''}>Francais</option>
            <option value="en"${state.config.language === 'en' ? ' selected' : ''}>English</option>
          </select>
          <button class="button" type="submit">Mettre a jour</button>
        </form>
        <form data-action-form="set-service-role">
          ${labelHelp('Role de service', 'Role ajoute automatiquement quand un membre prend son service, puis retire quand il termine.')}
          <select name="roleId">${roleOptions}</select>
          <button class="button" type="submit">Configurer</button>
        </form>
        <form data-action-form="set-log-channel">
          ${labelHelp('Salon de logs', 'Salon ou Sentinel publie les prises de service, fins de service, durees et actions importantes.')}
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
        <h3>Roles autorises a gerer Sentinel ${helpTip('Ces roles peuvent utiliser les commandes de gestion et agir depuis le dashboard selon les permissions Discord du serveur.')}</h3>
        <div class="role-chip-row">${commandRoleList(state)}</div>
        <form class="inline-form" data-action-form="add-command-role">
          ${labelHelp('Ajouter un role autorise', 'Ajoute un role staff a la liste des roles autorises a configurer et gerer Sentinel.')}
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
        <h2>Actions immediates</h2>
      </div>
      <div class="form-grid">
        <form data-action-form="start-service">
          ${labelHelp('Prendre le service pour un membre', 'Demarre manuellement le service d un membre avec son ID Discord et applique le role de service si possible.')}
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Prendre service</button>
        </form>
        <form data-action-form="end-service">
          ${labelHelp('Finir le service pour un membre', 'Arrete le service en cours d un membre, calcule la duree et ajoute ce temps a son total.')}
          <input name="userId" placeholder="ID Discord du membre" required>
          <button class="button" type="submit">Fin service</button>
        </form>
        <form data-action-form="reset-user">
          ${labelHelp('Reset heures individuel', 'Remet a zero les heures d une seule personne avec son ID Discord, meme si elle a quitte le serveur.')}
          <input name="userId" placeholder="ID Discord, meme si la personne est partie" required>
          <button class="button" type="submit">Reset</button>
        </form>
        <form data-action-form="sync-service">
          ${labelHelp('Synchronisation service', 'Option Premium : repare les incoherences entre les membres en service, les roles Discord et la base de donnees.', ` ${premiumTag}`)}
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
          ${labelHelp('Creer un embed Sentinel', 'Publie une annonce propre sous l identite de Sentinel dans le salon choisi. Le gratuit garde un nombre limite d embeds actifs.')}
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
          ${labelHelp('Modifier un embed existant', 'Modifie un embed Sentinel deja envoye avec son ID de message. Les modifications ne consomment pas de quota.')}
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
          ${labelHelp('Supprimer un embed Sentinel', 'Supprime un embed gere par Sentinel et libere son emplacement gratuit si le serveur n est pas Premium.')}
          <select name="channelId">${channelOptions}</select>
          <input name="messageId" placeholder="ID du message embed" required>
          <button class="button button-ghost" type="submit">Supprimer</button>
        </form>
        <article class="inline-form">
          ${labelHelp('Embeds geres', 'Liste les embeds que Sentinel peut encore modifier ou supprimer depuis le dashboard. Copie leur ID pour les gerer.')}
          ${customEmbedList(state)}
        </article>
      </div>
    </section>
      `)}

      ${tabPanel('moderation', `
    <section class="dashboard-panel" id="moderation">
      <div class="panel-heading">
        <p class="eyebrow">Moderation</p>
        <h2>Commandes de moderation</h2>
        <p class="muted">Les actions Premium restent visibles ici, avec un badge dedie, pour comprendre ce qui est inclus dans chaque offre.</p>
      </div>
      <div class="form-grid">
        <form data-action-form="warn">
          ${labelHelp('Avertir par ID', 'Ajoute un avertissement au dossier de moderation d un utilisateur et l enregistre dans les logs.')}
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Avertir</button>
        </form>
        <form data-action-form="timeout">
          ${labelHelp('Timeout', 'Rend temporairement muet un membre present sur le serveur pendant la duree indiquee.')}
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="duration" placeholder="10m, 2h, 7d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Timeout</button>
        </form>
        <form data-action-form="untimeout">
          ${labelHelp('Fin timeout', 'Retire un timeout actif sur un membre present et garde une trace de l action.')}
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Retirer</button>
        </form>
        <form data-action-form="kick">
          ${labelHelp('Expulser', 'Retire un membre du serveur sans le bannir. Il pourra revenir avec une nouvelle invitation.')}
          <input name="userId" placeholder="ID Discord du membre present" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit">Expulser</button>
        </form>
        <form data-action-form="ban">
          ${labelHelp('Bannir par ID', 'Bannit un utilisateur avec son ID Discord, meme s il n est plus present sur le serveur.')}
          <input name="userId" placeholder="ID Discord, meme hors serveur" required>
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
          <h2>Moderation avancee</h2>
          <p class="muted">Ces actions servent aux staffs qui gerent beaucoup de salons, de sanctions et de cas moderateur.</p>
        </div>
        ${premiumBadge}
      </div>
      <div class="form-grid">
        <form data-action-form="tempban">
          ${labelHelp('Ban temporaire par ID', 'Option Premium : bannit un utilisateur pour une duree precise, puis Sentinel le debannit automatiquement.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID Discord" required>
          <input name="duration" placeholder="1h, 7d, 30d" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Tempban</button>
        </form>
        <form data-action-form="unban">
          ${labelHelp('Debannir par ID', 'Option Premium : retire le bannissement d un utilisateur avec son ID Discord, meme s il n est plus dans le serveur.', ` ${premiumTag}`)}
          <input name="userId" placeholder="ID Discord" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unban</button>
        </form>
        <form data-action-form="lock">
          ${labelHelp('Verrouiller salon', 'Option Premium : bloque l envoi de messages dans un salon pour calmer une situation ou preparer une annonce.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Lock</button>
        </form>
        <form data-action-form="unlock">
          ${labelHelp('Deverrouiller salon', 'Option Premium : remet un salon verrouille en mode normal pour permettre aux membres de reparler.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unlock</button>
        </form>
        <form data-action-form="slowmode">
          ${labelHelp('Mode lent', 'Option Premium : impose un delai entre deux messages pour ralentir un salon trop actif.', ` ${premiumTag}`)}
          <select name="channelId">${channelOptions}</select>
          <input name="duration" placeholder="10s, 5m, 0">
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Slowmode</button>
        </form>
        <form data-action-form="edit-case">
          ${labelHelp('Modifier un cas', 'Option Premium : corrige ou precise la raison d un dossier de moderation deja enregistre.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Nouvelle raison" required>
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Modifier</button>
        </form>
        <form data-action-form="delete-case">
          ${labelHelp('Supprimer un cas', 'Option Premium : retire un dossier de moderation cree par erreur ou devenu invalide.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Supprimer</button>
        </form>
        <form data-action-form="unwarn">
          ${labelHelp('Retirer un avertissement', 'Option Premium : annule un avertissement precis sans effacer toute l histoire de moderation du membre.', ` ${premiumTag}`)}
          <input name="caseId" placeholder="ID du cas avertissement" required>
          <input name="reason" placeholder="Raison">
          <button class="button" type="submit" ${state.advanced ? '' : 'disabled'}>Unwarn</button>
        </form>
        <form data-action-form="reset-guild">
          ${labelHelp('Reset global serveur', 'Option Premium : remet a zero toutes les heures de service du serveur avec une action globale reservee aux grands nettoyages.', ` ${premiumTag}`)}
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
    toast(payload.message || 'Action executee.');
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

  window.SentinelAuth?.saveSettings?.({ lastGuildId: guildId });

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
  currentSettings = null;
  localStorage.removeItem('sentinel-discord-profile');
  renderUser();
  renderGuilds();
  renderDashboard();
});

bootstrap();
