(() => {
  const RAILWAY_ORIGIN = 'https://bot-service-discord-production.up.railway.app';
  const endpoint = window.location.hostname.endsWith('railway.app')
    || ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    ? '/api/updates'
    : `${RAILWAY_ORIGIN}/api/updates`;
  const host = document.querySelector('[data-official-updates]');
  let updates = [];

  function currentLanguage() {
    return document.documentElement.lang === 'en' ? 'en' : 'fr';
  }

  function formatDate(value, language) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function renderUpdateBody(host, value) {
    const lines = String(value || '').replace(/\r/g, '').split('\n');
    const hasSections = lines.some((line) => /^#{2,3}\s+/.test(line.trim()));

    if (!hasSections) {
      lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) return;
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        host.append(paragraph);
      });
      return false;
    }

    host.classList.add('official-update-body--sections');
    const updateList = document.createElement('ul');
    updateList.className = 'official-update-list';
    let item = null;
    let inlineDetails = [];

    function flushInlineDetails() {
      if (!item || inlineDetails.length === 0) return;
      const details = document.createElement('p');
      details.className = 'official-update-details';
      details.textContent = `${inlineDetails.join(', ')}.`;
      item.append(details);
      inlineDetails = [];
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trim();

      if (!line) return;

      const heading = line.match(/^#{2,3}\s+(.+)$/);
      if (heading) {
        flushInlineDetails();
        item = document.createElement('li');
        item.className = 'official-update-item';
        const title = document.createElement('h3');
        title.textContent = heading[1];
        item.append(title);
        updateList.append(item);
        return;
      }

      const detail = line.match(/^-\s+(.+)$/);
      if (detail && item) {
        inlineDetails.push(detail[1].replace(/[.;]\s*$/, ''));
        return;
      }

      flushInlineDetails();
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      if (!item) {
        paragraph.className = 'official-update-lead';
        host.append(paragraph);
      } else {
        item.append(paragraph);
      }
    });

    flushInlineDetails();
    host.append(updateList);
    return true;
  }

  function createUpdate(update, language) {
    const article = document.createElement('article');
    const meta = document.createElement('div');
    const label = document.createElement('span');
    const date = document.createElement('time');
    const title = document.createElement('h2');
    const body = document.createElement('div');

    article.className = 'official-update-entry';
    meta.className = 'official-update-meta';
    label.textContent = language === 'en' ? 'Sentinel update' : 'Mise à jour Sentinel';
    date.dateTime = update.publishedAt || update.createdAt || '';
    date.textContent = formatDate(date.dateTime, language);
    title.textContent = language === 'en' && update.titleEn ? update.titleEn : update.titleFr;
    body.className = 'official-update-body';
    const structured = renderUpdateBody(body, language === 'en' && update.bodyEn ? update.bodyEn : update.bodyFr);
    if (structured) {
      article.classList.add('official-update-entry--structured');
    }

    meta.append(label, date);
    article.append(meta, title, body);
    return article;
  }

  function render() {
    if (!host) return;
    const language = currentLanguage();
    host.replaceChildren();

    if (updates.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = language === 'en'
        ? 'No public update has been published yet.'
        : 'Aucune nouveauté publique n’a encore été publiée.';
      host.append(empty);
      return;
    }

    updates.forEach((update) => host.append(createUpdate(update, language)));
  }

  async function loadUpdates() {
    if (!host) return;

    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      updates = Array.isArray(payload.updates) ? payload.updates : [];
      render();
    } catch (error) {
      host.textContent = currentLanguage() === 'en'
        ? 'Updates are temporarily unavailable.'
        : 'Les nouveautés sont momentanément indisponibles.';
    }
  }

  window.addEventListener('sentinel:site-language-change', render);
  loadUpdates();
})();
