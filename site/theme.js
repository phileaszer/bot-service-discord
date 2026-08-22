(() => {
  const STORAGE_KEY = 'sentinel-site-theme';
  const DEFAULT_THEME = 'sentinel';
  const WESTERN_THEME = 'western';

  const labels = {
    fr: {
      group: 'Style du site',
      sentinel: 'Sentinel',
      western: 'Western',
      sentinelTitle: 'Style Sentinel futuriste',
      westernTitle: 'Style western RP'
    },
    en: {
      group: 'Website style',
      sentinel: 'Sentinel',
      western: 'Western',
      sentinelTitle: 'Futuristic Sentinel style',
      westernTitle: 'Western RP style'
    }
  };

  function pageLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'fr';
  }

  function normalizeTheme(value) {
    return value === WESTERN_THEME ? WESTERN_THEME : DEFAULT_THEME;
  }

  function readTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return normalizeTheme(document.documentElement.dataset.theme);
    }
  }

  function setThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === WESTERN_THEME ? '#17100a' : '#05070c');
    }
  }

  function applyRootTheme(theme) {
    const nextTheme = normalizeTheme(theme);
    document.documentElement.dataset.theme = nextTheme;
    setThemeColor(nextTheme);
    return nextTheme;
  }

  function updateSwitch(theme = readTheme()) {
    const language = pageLanguage();
    const text = labels[language];

    document.querySelectorAll('[data-theme-switch]').forEach((switcher) => {
      switcher.setAttribute('aria-label', text.group);

      switcher.querySelectorAll('[data-theme-choice]').forEach((button) => {
        const choice = normalizeTheme(button.dataset.themeChoice);
        const active = choice === theme;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.title = choice === WESTERN_THEME ? text.westernTitle : text.sentinelTitle;
        button.textContent = choice === WESTERN_THEME ? text.western : text.sentinel;
      });
    });
  }

  function saveTheme(theme) {
    const nextTheme = applyRootTheme(theme);

    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch (error) {
      // The visual theme is only a local preference; failing silently is fine.
    }

    updateSwitch(nextTheme);
    window.dispatchEvent(new CustomEvent('sentinel:site-theme-change', {
      detail: { theme: nextTheme }
    }));
  }

  function renderSwitch() {
    const host = document.querySelector('.header-actions') || document.querySelector('.not-found');

    if (!host || host.querySelector('[data-theme-switch]')) {
      updateSwitch();
      return;
    }

    const switcher = document.createElement('div');
    switcher.className = 'theme-switch';
    switcher.dataset.themeSwitch = 'true';
    switcher.dataset.i18nIgnore = 'true';
    switcher.innerHTML = `
      <button type="button" data-theme-choice="sentinel"></button>
      <button type="button" data-theme-choice="western"></button>
    `;

    const languageSwitch = host.querySelector('.language-switch');
    if (languageSwitch) {
      languageSwitch.after(switcher);
    } else {
      host.prepend(switcher);
    }

    switcher.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-choice]');
      if (!button) return;
      saveTheme(button.dataset.themeChoice);
    });

    updateSwitch();
  }

  applyRootTheme(readTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSwitch);
  } else {
    renderSwitch();
  }

  window.addEventListener('sentinel:site-language-change', () => updateSwitch());

  window.SentinelTheme = {
    set: saveTheme,
    current: readTheme
  };
})();
