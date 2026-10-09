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
      creatorRole: 'Créatrice de Sentinel',
      releaseTitle: 'Version de démonstration publique',
      releaseMessage: 'Sentinel est actuellement accessible gratuitement afin que les communautés puissent l’essayer. À l’avenir, seules certaines options avancées pourront devenir payantes ; une partie gratuite restera disponible. Aucun abonnement ni prélèvement n’est actif aujourd’hui, et les détails seront annoncés avant tout changement.'
    },
    en: {
      actionWestern: 'Western style',
      actionSentinel: 'Sentinel style',
      currentSentinel: 'Current style: futuristic Sentinel. Click to switch to Western style.',
      currentWestern: 'Current style: Western RP. Click to switch back to Sentinel style.',
      creatorRole: 'Creator of Sentinel',
      releaseTitle: 'Public demonstration version',
      releaseMessage: 'Sentinel is currently available at no cost so communities can try it. Some advanced features may become paid later, but a free part will remain available. No subscription or charge is active today, and the details will be announced before any change.'
    }
  };

  function pageLanguage() {
    try {
      if (localStorage.getItem('sentinel-site-language') === 'en') return 'en';
    } catch (error) {
      // The HTML language remains the fallback when local storage is unavailable.
    }
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

  function updateCreatorCredit() {
    const credit = document.querySelector('[data-creator-credit]');
    if (!credit) return;

    const text = labels[pageLanguage()];
    const role = credit.querySelector('[data-creator-role]');
    if (role) role.textContent = text.creatorRole;
  }

  function ensureCreatorCredit() {
    let footer = document.querySelector('.site-footer');

    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'site-footer site-footer-minimal';
      document.body.append(footer);
    }

    if (footer.querySelector('[data-creator-credit]')) {
      updateCreatorCredit();
      return;
    }

    let identity = footer.querySelector('.site-footer-identity');
    if (!identity) {
      identity = document.createElement('div');
      identity.className = 'site-footer-identity';
      const brand = Array.from(footer.children).find((child) => child.tagName === 'SPAN');
      if (brand) {
        identity.append(brand);
      } else {
        const brandName = document.createElement('span');
        brandName.textContent = 'Sentinel';
        identity.append(brandName);
      }
      footer.prepend(identity);
    }

    const credit = document.createElement('span');
    credit.className = 'creator-credit';
    credit.dataset.creatorCredit = 'true';
    credit.dataset.i18nIgnore = 'true';
    credit.setAttribute('aria-label', 'Fantomenale, créatrice de Sentinel');
    credit.innerHTML = `
      <strong>Fantomenale</strong>
      <small data-creator-role></small>
    `;
    identity.append(credit);
    updateCreatorCredit();
  }

  function initializePageChrome() {
    ensureButton();
    ensureReleaseNotice();
    ensureCreatorCredit();
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
    updateCreatorCredit();
  });

  window.SentinelTheme = {
    set: saveTheme,
    toggle: toggleTheme,
    current: readTheme
  };
})();
