(() => {
  const STORAGE_KEY = 'sentinel-site-theme';
  const DEFAULT_THEME = 'sentinel';
  const WESTERN_THEME = 'western';

  const labels = {
    fr: {
      actionWestern: 'Style Western',
      actionSentinel: 'Style Sentinel',
      currentSentinel: 'Style actuel : Sentinel futuriste. Cliquer pour passer au style Western.',
      currentWestern: 'Style actuel : Western RP. Cliquer pour revenir au style Sentinel.',
      releaseTitle: 'Version de démonstration publique',
      releaseMessage: 'Sentinel est actuellement accessible gratuitement afin que les communautés puissent l’essayer. Cette version a vocation à devenir payante plus tard. Aucun abonnement ni prélèvement n’est actif aujourd’hui ; les conditions seront annoncées clairement avant tout changement.'
    },
    en: {
      actionWestern: 'Western style',
      actionSentinel: 'Sentinel style',
      currentSentinel: 'Current style: futuristic Sentinel. Click to switch to Western style.',
      currentWestern: 'Current style: Western RP. Click to switch back to Sentinel style.',
      releaseTitle: 'Public demonstration version',
      releaseMessage: 'Sentinel is currently available at no cost so communities can try it. This version is intended to become a paid service later. No subscription or charge is active today; the terms will be announced clearly before any change.'
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

  function writeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // The style choice is only a local preference; the site still works without storage.
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

  function updateButtons(theme = readTheme()) {
    const language = pageLanguage();
    const text = labels[language];
    const isWestern = theme === WESTERN_THEME;

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.textContent = isWestern ? text.actionSentinel : text.actionWestern;
      button.dataset.currentTheme = theme;
      button.classList.toggle('is-western', isWestern);
      button.setAttribute('aria-pressed', String(isWestern));
      button.setAttribute('aria-label', isWestern ? text.currentWestern : text.currentSentinel);
      button.title = isWestern ? text.currentWestern : text.currentSentinel;
    });
  }

  function saveTheme(theme) {
    const nextTheme = applyRootTheme(theme);
    writeTheme(nextTheme);
    updateButtons(nextTheme);
    window.dispatchEvent(new CustomEvent('sentinel:site-theme-change', {
      detail: { theme: nextTheme }
    }));
  }

  function toggleTheme() {
    saveTheme(readTheme() === WESTERN_THEME ? DEFAULT_THEME : WESTERN_THEME);
  }

  function ensureButton() {
    const host = document.querySelector('.header-actions') || document.querySelector('.not-found');

    if (!host || host.querySelector('[data-theme-toggle]')) {
      updateButtons();
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle button button-small button-ghost';
    button.dataset.themeToggle = 'true';
    button.dataset.i18nIgnore = 'true';

    const languageSwitch = host.querySelector('.language-switch');
    if (languageSwitch) {
      languageSwitch.after(button);
    } else {
      host.prepend(button);
    }

    updateButtons();
  }

  function updateReleaseNotice() {
    const notice = document.querySelector('[data-release-notice]');
    if (!notice) return;

    const text = labels[pageLanguage()];
    const title = notice.querySelector('[data-release-title]');
    const message = notice.querySelector('[data-release-message]');

    notice.setAttribute('aria-label', text.releaseTitle);
    if (title) title.textContent = text.releaseTitle;
    if (message) message.textContent = text.releaseMessage;
  }

  function ensureReleaseNotice() {
    const header = document.querySelector('.site-header');
    if (!header || document.querySelector('[data-release-notice]')) {
      updateReleaseNotice();
      return;
    }

    const notice = document.createElement('aside');
    notice.className = 'release-notice';
    notice.dataset.releaseNotice = 'true';
    notice.innerHTML = `
      <div class="release-notice-inner">
        <strong data-release-title></strong>
        <p data-release-message></p>
      </div>
    `;
    header.after(notice);
    updateReleaseNotice();
  }

  function initializePageChrome() {
    ensureButton();
    ensureReleaseNotice();
  }

  applyRootTheme(readTheme());

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-theme-toggle]')) {
      return;
    }

    toggleTheme();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePageChrome);
  } else {
    initializePageChrome();
  }

  window.addEventListener('sentinel:site-language-change', () => {
    updateButtons();
    updateReleaseNotice();
  });

  window.SentinelTheme = {
    set: saveTheme,
    toggle: toggleTheme,
    current: readTheme
  };
})();
