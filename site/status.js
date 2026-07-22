(() => {
  const RAILWAY_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
  const STATUS_REFRESH_INTERVAL = 90 * 1000;
  const endpoint = window.location.hostname.endsWith('railway.app')
    ? '/api/status'
    : `${RAILWAY_ORIGIN}/api/status`;
  let refreshTimer = null;
  let statusRequestInFlight = false;

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function formatDate(value) {
    if (!value) {
      return 'Indisponible';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Indisponible';
    }

    return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-US' : 'fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function formatUptime(seconds) {
    const value = Number(seconds);

    if (!Number.isFinite(value) || value < 0) {
      return 'Indisponible';
    }

    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);

    if (days > 0) {
      return `${days}j ${hours}h`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }

    return `${minutes}min`;
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

  async function loadStatus() {
    if (statusRequestInFlight) {
      return;
    }

    statusRequestInFlight = true;

    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      const status = payload.status || {};

      setDot('bot', Boolean(status.botOnline));
      setDot('dashboard', Boolean(status.dashboardOnline));
      setText('[data-status-bot]', status.botOnline ? 'En ligne' : 'Hors ligne');
      setText('[data-status-dashboard]', status.dashboardOnline ? 'En ligne' : 'Indisponible');
      setText('[data-status-bot-detail]', status.botPing === null || status.botPing === undefined
        ? 'Connexion Discord active.'
        : `Connexion Discord active. Ping : ${status.botPing} ms.`);
      setText('[data-status-dashboard-detail]', 'Dashboard accessible.');
      setText('[data-status-updated]', formatDate(status.lastUpdate || status.startedAt));
      setText('[data-status-checked]', formatDate(status.lastCheck));
      setText('[data-status-ping]', status.botPing === null || status.botPing === undefined ? 'Indisponible' : `${status.botPing} ms`);
      setText('[data-status-guilds]', status.guildCount === null || status.guildCount === undefined ? 'Indisponible' : String(status.guildCount));
      setText('[data-status-uptime]', formatUptime(status.uptimeSeconds));
      setText('[data-status-build]', status.build || 'Sentinel');
      renderList('[data-status-incidents]', status.incidents, 'Aucun incident connu pour le moment.');
      renderList('[data-status-maintenance]', status.maintenance ? [status.maintenance] : [], 'Aucune maintenance annoncée actuellement.');
    } catch (error) {
      setDot('bot', false);
      setDot('dashboard', false);
      setText('[data-status-bot]', 'Indisponible');
      setText('[data-status-dashboard]', 'Indisponible');
      setText('[data-status-bot-detail]', 'Impossible de lire le statut en direct.');
      setText('[data-status-dashboard-detail]', 'La page est ouverte, mais Sentinel ne répond pas au contrôle de statut.');
      setText('[data-status-updated]', 'Indisponible');
      setText('[data-status-checked]', 'Indisponible');
      setText('[data-status-ping]', 'Indisponible');
      setText('[data-status-guilds]', 'Indisponible');
      setText('[data-status-uptime]', 'Indisponible');
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

  loadStatus();
  startStatusPolling();
})();
