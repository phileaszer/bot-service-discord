(() => {
  const AUTH_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
  const PROFILE_STORAGE_KEY = 'sentinel-discord-profile';
  const LANGUAGE_STORAGE_KEY = 'sentinel-site-language';
  const PUBLIC_SITE_BASE_PATH = '/bot-service-discord';

  function backendOrigin() {
    if (
      window.location.origin === AUTH_ORIGIN
      || window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1'
    ) {
      return window.location.origin;
    }

    return AUTH_ORIGIN;
  }

  function isBackendPage() {
    return window.location.origin === backendOrigin();
  }

  function pagePath() {
    let pathname = window.location.pathname || '/';

    if (window.location.hostname.endsWith('github.io')) {
      if (pathname === PUBLIC_SITE_BASE_PATH) {
        pathname = '/';
      } else if (pathname.startsWith(`${PUBLIC_SITE_BASE_PATH}/`)) {
        pathname = pathname.slice(PUBLIC_SITE_BASE_PATH.length);
      }
    }

    if (!pathname.startsWith('/')) {
      pathname = '/dashboard';
    }

    return `${pathname}${window.location.search}${window.location.hash}`;
  }

  function returnUrl() {
    if (isBackendPage()) {
      return window.location.href;
    }

    return `${backendOrigin()}${pagePath()}`;
  }

  function logoutUrl() {
    const url = new URL('/auth/logout', backendOrigin());
    url.searchParams.set('return_to', returnUrl());
    return url.toString();
  }

  function decorateLoginLinks() {
    document
      .querySelectorAll('[data-discord-login], a[href*="/auth/login"]')
      .forEach((link) => {
        link.dataset.discordLogin = 'true';
        const url = new URL('/auth/login', backendOrigin());
        url.searchParams.set('return_to', returnUrl());
        link.href = url.toString();
      });
  }

  function displayName(user) {
    return user?.globalName || user?.username || 'Discord';
  }

  function renderProfile(user) {
    document.querySelectorAll('[data-discord-login]').forEach((link) => {
      if (link.hasAttribute('data-login')) {
        return;
      }

      link.href = `${backendOrigin()}/dashboard`;
      link.classList.add('discord-profile-button');
      link.setAttribute('aria-label', `Profil Discord : ${displayName(user)}`);
      link.innerHTML = `
        ${user.avatar ? `<img src="${user.avatar}" alt="">` : '<span class="discord-profile-fallback">D</span>'}
        <span>${displayName(user)}</span>
      `;

      const host = link.closest('.header-actions');
      if (!host || host.querySelector('[data-discord-logout]')) {
        return;
      }

      const logout = document.createElement('a');
      logout.className = 'button button-ghost button-small discord-logout-button';
      logout.href = logoutUrl();
      logout.dataset.discordLogout = 'true';
      logout.textContent = 'Déconnexion';
      host.insertBefore(logout, link.nextSibling);
    });

    document.querySelectorAll('[data-discord-logout]').forEach((link) => {
      link.href = logoutUrl();
    });
  }

  function storeProfile(user) {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
        user,
        savedAt: Date.now()
      }));
    } catch (error) {
      // Storage can be blocked by browser settings.
    }
  }

  async function saveSettings(patch) {
    if (!isBackendPage()) {
      return null;
    }

    try {
      const response = await fetch('/api/me/settings', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(patch)
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    } catch (error) {
      return null;
    }
  }

  function applyStoredLanguage(settings) {
    const language = settings?.siteLanguage;

    if (!language || localStorage.getItem(LANGUAGE_STORAGE_KEY) || !window.SentinelI18n) {
      return;
    }

    window.SentinelI18n.setLanguage(language);
  }

  async function loadSession() {
    if (!isBackendPage()) {
      return null;
    }

    try {
      const response = await fetch('/api/session', {
        credentials: 'include',
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();

      if (payload.user) {
        storeProfile(payload.user);
        renderProfile(payload.user);
        applyStoredLanguage(payload.settings);
        saveSettings({
          siteLanguage: localStorage.getItem(LANGUAGE_STORAGE_KEY) || payload.settings?.siteLanguage || 'fr',
          lastReturnUrl: window.location.href
        });
      }

      return payload;
    } catch (error) {
      return null;
    }
  }

  function attachCopyCommands() {
    document.querySelectorAll('[data-copy-command]').forEach((button) => {
      if (button.dataset.copyReady === 'true') {
        return;
      }

      button.dataset.copyReady = 'true';
      button.addEventListener('click', async () => {
        const value = button.dataset.copyCommand || '';
        const original = button.textContent;

        try {
          await navigator.clipboard.writeText(value);
          button.textContent = 'Copié';
        } catch (error) {
          button.textContent = value;
        }

        setTimeout(() => {
          button.textContent = original;
        }, 1800);
      });
    });
  }

  function initHeaderMenu() {
    const header = document.querySelector('.site-header');
    const nav = header?.querySelector('.nav-links');
    const actions = header?.querySelector('.header-actions');

    if (!header || !nav || !actions || header.querySelector('[data-nav-toggle]')) {
      return;
    }

    if (!nav.id) {
      nav.id = 'site-navigation';
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'button button-small button-ghost nav-toggle';
    toggle.dataset.navToggle = 'true';
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Menu';
    actions.prepend(toggle);

    function setOpen(isOpen) {
      header.classList.toggle('is-nav-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    }

    toggle.addEventListener('click', () => {
      setOpen(!header.classList.contains('is-nav-open'));
    });

    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });
  }

  function init() {
    initHeaderMenu();
    decorateLoginLinks();
    attachCopyCommands();
    loadSession();
  }

  window.SentinelAuth = {
    refresh: loadSession,
    saveSettings,
    decorateLoginLinks,
    logoutUrl
  };

  window.addEventListener('sentinel:site-language-change', (event) => {
    saveSettings({ siteLanguage: event.detail?.language || 'fr' });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
