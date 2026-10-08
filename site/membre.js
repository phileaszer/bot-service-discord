(() => {
  const content = document.querySelector('[data-member-content]');
  const userCard = document.querySelector('[data-member-user]');
  const toasts = document.querySelector('[data-toasts]');
  let csrfToken = null;
  let portal = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function safeImage(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com' ? url.toString() : null;
    } catch (error) { return null; }
  }

  function toast(message, tone = '') {
    const item = document.createElement('div');
    item.className = `toast ${tone ? `is-${tone}` : ''}`;
    item.textContent = message;
    toasts.appendChild(item);
    window.setTimeout(() => item.remove(), 3500);
  }

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    const response = await fetch(path, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(csrfToken && method !== 'GET' ? { 'X-Sentinel-CSRF': csrfToken } : {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    return payload;
  }

  function formatDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function appealStatusLabel(status) {
    return ({ pending: 'En cours d’examen', accepted: 'Révision acceptée', rejected: 'Révision refusée' })[status] || status;
  }

  function warningList(warnings, appeals, guildId) {
    if (!warnings.items.length) return '<p class="muted">Aucun avertissement visible.</p>';
    return `<div class="member-list">${warnings.items.map(item => {
      const appeal = (appeals || []).find(candidate => Number(candidate.caseId) === Number(item.id));
      return `<article><span>Cas #${escapeHtml(item.id)}</span><strong>${escapeHtml(item.reason || 'Aucune raison indiquée')}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small>
        ${appeal ? `<small><strong>${escapeHtml(appealStatusLabel(appeal.status))}</strong>${appeal.decision ? ` · ${escapeHtml(appeal.decision)}` : ''}</small>` : `
          <form data-appeal data-guild-id="${escapeHtml(guildId)}" data-case-id="${escapeHtml(item.id)}" class="member-appeal-form">
            <label><span>Demander une révision</span><textarea name="statement" minlength="20" maxlength="2000" placeholder="Explique calmement pourquoi cette sanction devrait être réexaminée." required></textarea></label>
            <button class="button button-small button-ghost" type="submit">Envoyer la demande</button>
          </form>`}
      </article>`;
    }).join('')}</div>`;
  }

  function dossierList(items) {
    if (!items.length) return '<p class="muted">Aucun dossier ouvert avec Sentinel.</p>';
    return `<div class="member-list">${items.map(item => `<article><span>Dossier #${escapeHtml(item.id)} · ${escapeHtml(item.type)}</span><strong>${escapeHtml(item.subject || 'Sans sujet')}</strong><small>${escapeHtml(item.status)} · ${escapeHtml(formatDate(item.createdAt))}</small></article>`).join('')}</div>`;
  }

  function notificationList(items) {
    if (!items.length) return '<p class="muted">Aucune alerte personnelle pour ce serveur.</p>';
    return `<div class="member-list">${items.map(item => `<article><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.detail)}</strong>${item.createdAt ? `<small>${escapeHtml(formatDate(item.createdAt))}</small>` : ''}</article>`).join('')}</div>`;
  }

  function digestHistory(items) {
    if (!items?.length) return '<p class="muted">Aucun résumé Discord envoyé pour le moment.</p>';
    const labels = { delivered: 'Envoyé', empty: 'Aucune nouveauté', failed: 'Échec' };
    return `<div class="member-list">${items.map(item => `<article><span>${escapeHtml(labels[item.status] || item.status)}</span><strong>${escapeHtml(item.itemCount || 0)} information(s)</strong><small>${escapeHtml(formatDate(item.deliveredAt || item.attemptedAt))}${item.errorMessage ? ` · ${escapeHtml(item.errorMessage)}` : ''}</small></article>`).join('')}</div>`;
  }

  function renderGuild(item) {
    const icon = safeImage(item.guild.icon);
    const line = item.payroll.line;
    return `
      <section class="dashboard-panel member-guild-panel">
        <div class="member-guild-heading">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span class="guild-fallback">S</span>'}<div><p class="eyebrow">Serveur Discord</p><h2>${escapeHtml(item.guild.name)}</h2></div></div>
        <div class="dashboard-metrics member-metrics">
          <article><span>Temps total</span><strong>${escapeHtml(item.service.totalTimeLabel)}</strong><small>${item.service.active ? 'En service' : 'Hors service'}</small></article>
          <article><span>Sessions</span><strong>${escapeHtml(item.service.sessionCount)}</strong></article>
          <article><span>Paie semaine</span><strong>${line ? escapeHtml(line.amountLabel) : 'Aucune'}</strong><small>${line ? (line.paid ? 'Payée' : 'À payer') : ''}</small></article>
          <article><span>Avertissements actifs</span><strong>${escapeHtml(item.warnings.activeCount)}</strong><small>Expiration après ${escapeHtml(item.warnings.expirationDays)} jours</small></article>
        </div>
        <div class="member-detail-grid">
          <article class="inline-form"><h3>Mes derniers services</h3>${item.service.sessions.length ? `<div class="member-list">${item.service.sessions.map(session => `<article><strong>${escapeHtml(session.durationLabel)}</strong><small>${escapeHtml(formatDate(session.date))}</small></article>`).join('')}</div>` : '<p class="muted">Aucune session enregistrée.</p>'}</article>
          <article class="inline-form"><h3>Mes dossiers</h3>${dossierList(item.dossiers)}</article>
          <article class="inline-form"><h3>Mon registre disciplinaire</h3>${warningList(item.warnings, item.appeals, item.guild.id)}</article>
          <article class="inline-form"><h3>Mes notifications</h3>${notificationList(item.notifications || [])}</article>
          <article class="inline-form"><h3>Historique des résumés Discord</h3>${digestHistory(item.digestHistory)}</article>
          <article class="inline-form"><h3>Alertes souhaitées</h3><form data-preferences data-guild-id="${escapeHtml(item.guild.id)}" class="member-preferences">
            ${[['serviceEnabled', 'Services'], ['payrollEnabled', 'Paie RP'], ['dossierEnabled', 'Dossiers'], ['moderationEnabled', 'Modération']].map(([key, label]) => `<label><input type="checkbox" name="${key}" ${item.preferences[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')}
            <label><span>Résumé privé Discord</span><select name="digestFrequency"><option value="none" ${item.preferences.digestFrequency === 'none' ? 'selected' : ''}>Désactivé</option><option value="daily" ${item.preferences.digestFrequency === 'daily' ? 'selected' : ''}>Chaque jour</option><option value="weekly" ${item.preferences.digestFrequency === 'weekly' ? 'selected' : ''}>Chaque semaine</option></select></label>
            <button class="button" type="submit">Enregistrer</button>
          </form></article>
        </div>
      </section>
    `;
  }

  function render() {
    const guilds = portal?.guilds || [];
    const privacyRequests = portal?.privacyRequests || [];
    const privacyPanel = `<section class="dashboard-panel member-guild-panel"><div class="panel-heading"><p class="eyebrow">Tes données Sentinel</p><h2>Confidentialité</h2><p class="muted">Télécharge une copie lisible de tes données ou demande leur suppression. Une suppression est toujours contrôlée avant exécution.</p></div><div class="member-detail-grid"><article class="inline-form"><h3>Copie de mes données</h3><a class="button button-small" href="/api/me/privacy/export">Télécharger l’export JSON</a></article><article class="inline-form"><h3>Demande de suppression</h3><form data-member-delete><label><span>Motif facultatif</span><textarea name="reason" maxlength="1000" placeholder="Précise les éléments concernés si nécessaire."></textarea></label><button class="button button-small button-ghost" type="submit">Envoyer la demande</button></form>${privacyRequests.length ? `<div class="member-list">${privacyRequests.map(item => `<article><span>${escapeHtml(item.requestKey)}</span><strong>${escapeHtml(item.status === 'pending' ? 'En cours de contrôle' : item.status)}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></article>`).join('')}</div>` : ''}</article></div></section>`;
    content.innerHTML = privacyPanel + (guilds.length
      ? guilds.map(renderGuild).join('')
      : '<div class="empty-state"><img src="assets/sentinel-mark.png" alt=""><h2>Aucun registre disponible</h2><p>Ton compte Discord n’est membre d’aucun serveur où Sentinel est installé.</p></div>');
    document.querySelectorAll('[data-preferences]').forEach(form => {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        const body = { guildId: form.dataset.guildId };
        form.querySelectorAll('input[type="checkbox"]').forEach(input => { body[input.name] = input.checked; });
        body.digestFrequency = form.elements.digestFrequency?.value || 'none';
        try {
          const payload = await api('/api/me/preferences', { method: 'POST', body: JSON.stringify(body) });
          const guild = portal.guilds.find(candidate => candidate.guild.id === form.dataset.guildId);
          if (guild) guild.preferences = payload.preferences;
          toast('Préférences enregistrées.');
        } catch (error) { toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });
    });
    document.querySelectorAll('[data-appeal]').forEach(form => {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          await api('/api/me/appeals', { method: 'POST', body: JSON.stringify({ guildId: form.dataset.guildId, caseId: form.dataset.caseId, statement: form.elements.statement.value }) });
          portal = (await api('/api/me/portal')).portal;
          render();
          toast('Demande de révision transmise.');
        } catch (error) { toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });
    });
    document.querySelector('[data-member-delete]')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button');
      button.disabled = true;
      try {
        await api('/api/me/privacy/request-delete', { method: 'POST', body: JSON.stringify({ reason: form.elements.reason.value }) });
        portal = (await api('/api/me/portal')).portal;
        render();
        toast('Demande de suppression enregistrée.');
      } catch (error) { toast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
  }

  async function init() {
    try {
      const session = await api('/api/session');
      csrfToken = session.csrfToken;
      userCard.innerHTML = `<strong>${escapeHtml(session.user.globalName || session.user.username)}</strong><small>Compte Discord vérifié</small>`;
      portal = (await api('/api/me/portal')).portal;
      render();
    } catch (error) {
      content.innerHTML = `<div class="empty-state"><img src="assets/sentinel-mark.png" alt=""><h2>Connexion nécessaire</h2><p>Connecte ton compte Discord pour ouvrir ton registre personnel.</p><a class="button" href="/auth/login" data-discord-login>Connexion Discord</a></div>`;
      window.SentinelAuth?.decorateLoginLinks?.();
    }
  }

  init();
})();
