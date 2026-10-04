(() => {
  const RAILWAY_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
  const STATUS_REFRESH_INTERVAL = 90 * 1000;
  const endpoint = window.location.hostname.endsWith('railway.app')
    ? '/api/status'
    : `${RAILWAY_ORIGIN}/api/status`;
  let refreshTimer = null;
  let statusRequestInFlight = false;
  let lastStatus = null;

  const copy = {
    fr: {
      unavailable: 'Indisponible',
      checking: 'En attente',
      botOnline: 'En ligne',
      botOffline: 'Hors ligne',
      dashboardOnline: 'En ligne',
      dashboardOffline: 'Indisponible',
      discordActive: 'Connexion Discord active.',
      dashboardAccessible: 'Dashboard accessible.',
      statusReadFailed: 'Impossible de lire le statut en direct.',
      dashboardReadFailed: 'La page est ouverte, mais Sentinel ne répond pas au contrôle de statut.',
      noIncidents: 'Aucun incident connu pour le moment.',
      noMaintenance: 'Aucune maintenance annoncée actuellement.'
    },
    en: {
      unavailable: 'Unavailable',
      checking: 'Waiting',
      botOnline: 'Online',
      botOffline: 'Offline',
      dashboardOnline: 'Online',
      dashboardOffline: 'Unavailable',
      discordActive: 'Discord connection active.',
      dashboardAccessible: 'Dashboard accessible.',
      statusReadFailed: 'Unable to read the live status.',
      dashboardReadFailed: 'The page is open, but Sentinel is not responding to the status check.',
      noIncidents: 'No known incident right now.',
      noMaintenance: 'No maintenance announced right now.'
    }
  };

  function currentLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'fr';
  }

  function t(key, ...args) {
    const value = copy[currentLanguage()][key] || copy.fr[key] || key;
    return typeof value === 'function' ? value(...args) : value;
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setDot(name, online) {
    const dot = document.querySelector(`[data-status-dot="${name}"]`);
    const card = document.querySelector(`[data-status-card="${name}"]`);

    if (dot) {
      dot.classList.toggle('is-online', online);
      dot.classList.toggle('is-offline', !online);
    }

    if (card) {
      card.classList.toggle('is-online', online);
      card.classList.toggle('is-offline', !online);
    }
  }

  function renderList(selector, items, emptyText) {
    const host = document.querySelector(selector);
    if (!host) return;

    if (!items || items.length === 0) {
      host.innerHTML = `<p class="muted">${emptyText}</p>`;
      return;
    }

    host.innerHTML = `
      <ul class="status-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    `;
  }

  function renderStatus(status = {}) {
    setDot('bot', Boolean(status.botOnline));
    setDot('dashboard', Boolean(status.dashboardOnline));
    setText('[data-status-bot]', status.botOnline ? t('botOnline') : t('botOffline'));
    setText('[data-status-dashboard]', status.dashboardOnline ? t('dashboardOnline') : t('dashboardOffline'));
    setText('[data-status-bot-detail]', t('discordActive'));
    setText('[data-status-dashboard-detail]', t('dashboardAccessible'));
    setText('[data-status-guilds]', status.guildCount === null || status.guildCount === undefined ? t('unavailable') : String(status.guildCount));
    renderList('[data-status-incidents]', status.incidents, t('noIncidents'));
    renderList('[data-status-maintenance]', status.maintenance ? [status.maintenance] : [], t('noMaintenance'));
  }

  async function loadStatus() {
    if (statusRequestInFlight) {
      return;
    }

    statusRequestInFlight = true;

    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      const status = payload.status || {};
      lastStatus = status;

      renderStatus(status);
    } catch (error) {
      lastStatus = null;
      setDot('bot', false);
      setDot('dashboard', false);
      setText('[data-status-bot]', t('unavailable'));
      setText('[data-status-dashboard]', t('unavailable'));
      setText('[data-status-bot-detail]', t('statusReadFailed'));
      setText('[data-status-dashboard-detail]', t('dashboardReadFailed'));
      setText('[data-status-guilds]', t('unavailable'));
    } finally {
      statusRequestInFlight = false;
    }
  }

  function startStatusPolling() {
    if (refreshTimer || document.hidden) {
      return;
    }

    refreshTimer = setInterval(loadStatus, STATUS_REFRESH_INTERVAL);
  }

  function stopStatusPolling() {
    if (!refreshTimer) {
      return;
    }

    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopStatusPolling();
      return;
    }

    loadStatus();
    startStatusPolling();
  });

  window.addEventListener('sentinel:site-language-change', () => {
    if (lastStatus) {
      renderStatus(lastStatus);
    }
  });

  loadStatus();
  startStatusPolling();
})();
