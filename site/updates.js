(() => {
  const RAILWAY_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
  const endpoint = window.location.hostname.endsWith('railway.app')
    || ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? '/api/updates'
    : `${RAILWAY_ORIGIN}/api/updates`;
  const host = document.querySelector('[data-official-updates]');
  const searchInput = document.querySelector('[data-updates-search]');
  const categorySelect = document.querySelector('[data-updates-category]');
  const yearSelect = document.querySelector('[data-updates-year]');
  const results = document.querySelector('[data-updates-results]');
  const filters = { query: '', category: 'all', year: 'all' };
  let updates = [];

  const categories = [
    { key: 'dashboard', fr: 'Dashboard', en: 'Dashboard', terms: ['dashboard', 'site', 'interface', 'mobile', 'banc d’essai', 'test bench'] },
    { key: 'service', fr: 'Service', en: 'Duty', terms: ['service', 'heures', 'paie', 'duty', 'payroll', 'weekly rp pay'] },
    { key: 'tickets', fr: 'Tickets', en: 'Tickets', terms: ['ticket', 'dossier', 'support', 'private case'] },
    { key: 'security', fr: 'Sécurité', en: 'Security', terms: ['sécurité', 'sûreté', 'modération', 'sanction', 'auto-modération', 'security', 'safety', 'moderation', 'punished'] },
    { key: 'announcements', fr: 'Annonces', en: 'Announcements', terms: ['annonce', 'publication', 'salon des nouveautés', 'announcement', 'update channel'] },
    { key: 'sentinel', fr: 'Sentinel', en: 'Sentinel', terms: ['démonstration', 'abonnement', 'premium', 'demonstration', 'subscription', 'paid'] }
  ];

  function currentLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'fr';
  }

  function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function formatDate(value, language) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric'
    }).format(date);
  }

  function updateText(update, language) {
    return {
      title: language === 'en' && update.titleEn ? update.titleEn : update.titleFr,
      body: language === 'en' && update.bodyEn ? update.bodyEn : update.bodyFr
    };
  }

  function detectCategories(update) {
    const haystack = normalizeText([update.titleFr, update.bodyFr, update.titleEn, update.bodyEn].join(' '));
    const matches = categories
      .filter((category) => category.terms.some((term) => haystack.includes(normalizeText(term))))
      .map((category) => category.key);
    return matches.length > 0 ? matches : ['sentinel'];
  }

  function categoryLabel(key, language) {
    const category = categories.find((item) => item.key === key);
    return category?.[language] || category?.fr || key;
  }

  function updateAnchor(update) {
    const key = update.publicKey || `publication-${update.id}`;
    return `nouveaute-${String(key).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
  }

  function renderUpdateBody(target, value, language) {
    const lines = String(value || '').replace(/\r/g, '').split('\n');
    const hasSections = lines.some((line) => /^#{2,3}\s+/.test(line.trim()));
    target.classList.add('official-update-body--sections');

    if (!hasSections) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      const list = document.createElement('ul');
      section.className = 'official-update-section';
      list.className = 'official-update-section-list';
      title.textContent = language === 'en' ? 'Key points' : 'À retenir';
      lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        const entry = document.createElement('li');
        entry.textContent = line;
        list.append(entry);
      });
      section.append(title, list);
      target.append(section);
      return;
    }

    let sectionList = null;
    let lastEntry = null;
    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;
      const heading = line.match(/^#{2,3}\s+(.+)$/);
      if (heading) {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        section.className = 'official-update-section';
        title.textContent = heading[1];
        sectionList = document.createElement('ul');
        sectionList.className = 'official-update-section-list';
        section.append(title, sectionList);
        target.append(section);
        lastEntry = null;
        return;
      }
      const detail = line.match(/^-\s+(.+)$/);
      if (detail && sectionList) {
        let nested = lastEntry?.querySelector('.official-update-sublist');
        if (!nested && lastEntry) {
          nested = document.createElement('ul');
          nested.className = 'official-update-sublist';
          lastEntry.append(nested);
        }
        const entry = document.createElement('li');
        entry.textContent = detail[1];
        (nested || sectionList).append(entry);
        return;
      }
      if (!sectionList) {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        const entry = document.createElement('li');
        section.className = 'official-update-section';
        title.textContent = language === 'en' ? 'Summary' : 'En bref';
        sectionList = document.createElement('ul');
        sectionList.className = 'official-update-section-list';
        entry.textContent = line;
        sectionList.append(entry);
        section.append(title, sectionList);
        target.append(section);
        lastEntry = entry;
      } else {
        lastEntry = document.createElement('li');
        lastEntry.textContent = line;
        sectionList.append(lastEntry);
      }
    });
  }

  function setExpanded(article, body, button, expanded, language) {
    article.classList.toggle('is-open', expanded);
    body.hidden = !expanded;
    if (!button) return;
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded
      ? (language === 'en' ? 'Hide' : 'Masquer')
      : (language === 'en' ? 'View update' : 'Voir la mise à jour');
  }

  async function copyUpdateLink(article, button, language) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = article.id;
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch (error) {
      const field = document.createElement('textarea');
      field.value = url.toString();
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    button.textContent = language === 'en' ? 'Link copied' : 'Lien copié';
    window.setTimeout(() => {
      button.textContent = language === 'en' ? 'Copy link' : 'Copier le lien';
    }, 1800);
  }

  function createUpdate(update, language, index) {
    const latest = index === 0;
    const article = document.createElement('article');
    const meta = document.createElement('div');
    const label = document.createElement('span');
    const number = document.createElement('strong');
    const date = document.createElement('time');
    const main = document.createElement('div');
    const heading = document.createElement('div');
    const title = document.createElement('h2');
    const actions = document.createElement('div');
    const share = document.createElement('button');
    const categoryList = document.createElement('ul');
    const body = document.createElement('div');
    const patchNumber = update.patchNumber || updates.length - index;
    const text = updateText(update, language);

    article.id = updateAnchor(update);
    article.className = `official-update-entry ${latest ? 'is-featured is-open' : 'is-archived'}`;
    meta.className = 'official-update-meta';
    label.textContent = language === 'en' ? 'Sentinel update' : 'Mise à jour Sentinel';
    number.className = 'official-update-number';
    number.textContent = language === 'en' ? `Patch notes #${patchNumber}` : `Patchnote n°${patchNumber}`;
    date.dateTime = update.publishedAt || update.createdAt || '';
    date.textContent = formatDate(date.dateTime, language);
    if (latest) {
      const latestLabel = document.createElement('em');
      latestLabel.className = 'official-update-latest';
      latestLabel.textContent = language === 'en' ? 'Latest update' : 'Dernière mise à jour';
      meta.append(latestLabel);
    }
    meta.append(label, number, date);

    main.className = 'official-update-main';
    heading.className = 'official-update-heading';
    title.textContent = text.title;
    actions.className = 'official-update-actions';
    share.className = 'official-update-action';
    share.type = 'button';
    share.textContent = language === 'en' ? 'Copy link' : 'Copier le lien';
    share.addEventListener('click', () => copyUpdateLink(article, share, language));
    actions.append(share);

    categoryList.className = 'official-update-categories';
    categoryList.setAttribute('aria-label', language === 'en' ? 'Affected categories' : 'Catégories concernées');
    update.categories.forEach((key) => {
      const item = document.createElement('li');
      item.textContent = categoryLabel(key, language);
      categoryList.append(item);
    });

    body.id = `${article.id}-contenu`;
    body.className = 'official-update-body';
    renderUpdateBody(body, text.body, language);

    if (!latest) {
      const toggle = document.createElement('button');
      const shouldOpen = window.location.hash === `#${article.id}` || Boolean(filters.query);
      toggle.className = 'official-update-action official-update-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-controls', body.id);
      toggle.addEventListener('click', () => setExpanded(article, body, toggle, body.hidden, language));
      actions.prepend(toggle);
      setExpanded(article, body, toggle, shouldOpen, language);
    }

    heading.append(title, actions);
    main.append(heading, categoryList, body);
    article.append(meta, main);
    return article;
  }

  function availableYears() {
    return [...new Set(updates.map((update) => String(new Date(update.publishedAt || update.createdAt).getFullYear())))]
      .filter((year) => year !== 'NaN')
      .sort((left, right) => Number(right) - Number(left));
  }

  function renderControls(language) {
    const searchLabel = document.querySelector('[data-updates-search-label]');
    const categoryLabelElement = document.querySelector('[data-updates-category-label]');
    const yearLabel = document.querySelector('[data-updates-year-label]');
    if (searchLabel) searchLabel.textContent = language === 'en' ? 'Search' : 'Rechercher';
    if (categoryLabelElement) categoryLabelElement.textContent = language === 'en' ? 'Category' : 'Catégorie';
    if (yearLabel) yearLabel.textContent = language === 'en' ? 'Year' : 'Année';
    if (searchInput) searchInput.placeholder = language === 'en' ? 'Search updates' : 'Rechercher une nouveauté';

    if (categorySelect) {
      const used = new Set(updates.flatMap((update) => update.categories));
      categorySelect.replaceChildren();
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = language === 'en' ? 'All categories' : 'Toutes les catégories';
      categorySelect.append(all);
      categories.filter((category) => used.has(category.key)).forEach((category) => {
        const option = document.createElement('option');
        option.value = category.key;
        option.textContent = category[language];
        categorySelect.append(option);
      });
      categorySelect.value = filters.category;
    }

    if (yearSelect) {
      yearSelect.replaceChildren();
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = language === 'en' ? 'All years' : 'Toutes les années';
      yearSelect.append(all);
      availableYears().forEach((year) => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.append(option);
      });
      yearSelect.value = filters.year;
    }
  }

  function filteredUpdates(language) {
    const query = normalizeText(filters.query);
    return updates.filter((update) => {
      const text = updateText(update, language);
      const haystack = normalizeText(`${text.title} ${text.body}`);
      const year = String(new Date(update.publishedAt || update.createdAt).getFullYear());
      return (!query || haystack.includes(query))
        && (filters.category === 'all' || update.categories.includes(filters.category))
        && (filters.year === 'all' || year === filters.year);
    });
  }

  function renderList() {
    if (!host) return;
    const language = currentLanguage();
    const visible = filteredUpdates(language);
    host.replaceChildren();
    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'official-updates-empty';
      empty.textContent = language === 'en'
        ? 'No update matches these filters.'
        : 'Aucune nouveauté ne correspond à ces filtres.';
      host.append(empty);
    } else {
      visible.forEach((update) => host.append(createUpdate(update, language, updates.indexOf(update))));
    }
    if (results) {
      results.textContent = language === 'en'
        ? `${visible.length} of ${updates.length} update${updates.length === 1 ? '' : 's'}`
        : `${visible.length} publication${visible.length === 1 ? '' : 's'} sur ${updates.length}`;
    }
    let target = null;
    if (window.location.hash) {
      try {
        target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      } catch (error) {
        target = null;
      }
    }
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  function render() {
    const language = currentLanguage();
    renderControls(language);
    renderList();
  }

  async function loadUpdates() {
    if (!host) return;
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      updates = (Array.isArray(payload.updates) ? payload.updates : []).map((update) => ({
        ...update,
        categories: detectCategories(update)
      }));
      render();
    } catch (error) {
      host.textContent = currentLanguage() === 'en'
        ? 'Updates are temporarily unavailable.'
        : 'Les nouveautés sont momentanément indisponibles.';
    }
  }

  searchInput?.addEventListener('input', () => {
    filters.query = searchInput.value.trim();
    renderList();
  });
  categorySelect?.addEventListener('change', () => {
    filters.category = categorySelect.value;
    renderList();
  });
  yearSelect?.addEventListener('change', () => {
    filters.year = yearSelect.value;
    renderList();
  });
  window.addEventListener('hashchange', renderList);
  window.addEventListener('sentinel:site-language-change', render);
  loadUpdates();
})();
