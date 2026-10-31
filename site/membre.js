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
        ...(csrfToken && method !== 'GET' ? { 'X-Noctigarde-CSRF': csrfToken } : {})
      },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    return payload;
  }

  function formatDate(value) {
    if (!value) return '';
    const locale = document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function appealStatusLabel(status) {
    return ({ pending: 'En cours d’examen', accepted: 'Révision acceptée', rejected: 'Révision refusée' })[status] || status;
  }

  function emptyMemberState(message) {
    return `<div class="member-empty"><span aria-hidden="true">—</span><p>${escapeHtml(message)}</p></div>`;
  }

  function warningList(warnings, appeals, guildId) {
    if (!warnings.items.length) return emptyMemberState('Aucun avertissement visible.');
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
    if (!items.length) return emptyMemberState('Aucun ticket ouvert avec Noctigarde.');
    return `<div class="member-list">${items.map(item => `<article><span>Ticket #${escapeHtml(item.id)} · ${escapeHtml(item.type)}</span><strong>${escapeHtml(item.subject || 'Sans sujet')}</strong><small>${escapeHtml(item.status)} · ${escapeHtml(formatDate(item.createdAt))}</small></article>`).join('')}</div>`;
  }

  function notificationList(items) {
    if (!items.length) return emptyMemberState('Aucune notification pour ce serveur.');
    return `<div class="member-list">${items.map(item => `<article><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.detail)}</strong>${item.createdAt ? `<small>${escapeHtml(formatDate(item.createdAt))}</small>` : ''}</article>`).join('')}</div>`;
  }

  function memberCommunityPanel(item) {
    const community = item.community || {};
    const recruitment = community.recruitment || { forms: [], applications: [] };
    const planning = community.planning || { shifts: [], absences: [] };
    const suggestions = community.suggestions || [];
    const appliedFormIds = new Set(recruitment.applications.map(application => Number(application.formId)));
    const statusLabels = {
      submitted: 'Candidature reçue', reviewing: 'En cours de lecture', interview: 'Entretien prévu', accepted: 'Acceptée', rejected: 'Refusée', withdrawn: 'Retirée',
      available: 'Disponible', unavailable: 'Indisponible', maybe: 'Peut-être', reviewingSuggestion: 'En étude', published: 'Publiée'
    };
    const recruitmentForms = recruitment.forms.filter(form => !appliedFormIds.has(Number(form.id))).map(form => `
      <details class="member-community-item">
        <summary><span><strong>${escapeHtml(form.title)}</strong><small>${escapeHtml(form.description || 'Recrutement ouvert')}</small></span><em>${escapeHtml(form.questions.length)} question(s)</em></summary>
        <form data-community-action="apply" data-guild-id="${escapeHtml(item.guild.id)}" data-form-id="${escapeHtml(form.id)}" class="member-community-form">
          ${form.questions.map((question, index) => `<label><span>${escapeHtml(question.label)}</span><textarea data-recruitment-answer="${index}" maxlength="1200" ${question.required ? 'required' : ''}></textarea></label>`).join('')}
          <button class="button button-small" type="submit">Envoyer ma candidature</button>
        </form>
      </details>`).join('');
    const applications = recruitment.applications.map(application => `<article class="member-community-item"><span>${escapeHtml(application.formTitle || 'Recrutement')}</span><strong>${escapeHtml(statusLabels[application.status] || application.status)}</strong>${application.interviewAt ? `<small>Entretien : ${escapeHtml(formatDate(application.interviewAt))}</small>` : ''}${application.staffNote ? `<p>${escapeHtml(application.staffNote)}</p>` : ''}${!['accepted', 'rejected', 'withdrawn'].includes(application.status) ? `<button class="button button-small button-ghost" type="button" data-community-click="withdraw-application" data-guild-id="${escapeHtml(item.guild.id)}" data-application-id="${escapeHtml(application.id)}">Retirer ma candidature</button>` : ''}</article>`).join('');
    const shifts = planning.shifts.map(shift => `<article class="member-community-item"><span>${escapeHtml(formatDate(shift.startsAt))}</span><strong>${escapeHtml(shift.title)}</strong><small>${escapeHtml(shift.description || 'Aucune consigne particulière')} · ${escapeHtml(shift.counts.available)} présent(s)${shift.capacity ? ` sur ${escapeHtml(shift.capacity)}` : ''}</small><div class="member-community-actions">${[['available', 'Disponible'], ['maybe', 'Peut-être'], ['unavailable', 'Indisponible']].map(([value, label]) => `<button class="button button-small ${shift.ownResponse?.status === value ? '' : 'button-ghost'}" type="button" data-community-click="shift-response" data-guild-id="${escapeHtml(item.guild.id)}" data-shift-id="${escapeHtml(shift.id)}" data-status="${value}">${label}</button>`).join('')}</div></article>`).join('');
    const absences = planning.absences.map(absence => `<article class="member-community-item"><span>Absence déclarée</span><strong>${escapeHtml(formatDate(absence.startsAt))} → ${escapeHtml(formatDate(absence.endsAt))}</strong><small>${escapeHtml(absence.reason || 'Aucun motif indiqué')}</small>${absence.status === 'declared' ? `<button class="button button-small button-ghost" type="button" data-community-click="cancel-absence" data-guild-id="${escapeHtml(item.guild.id)}" data-absence-id="${escapeHtml(absence.id)}">Annuler</button>` : ''}</article>`).join('');
    const suggestionItems = suggestions.map(suggestion => `<article class="member-community-item"><span>${escapeHtml(suggestion.status === 'reviewing' ? 'En étude' : (statusLabels[suggestion.status] || suggestion.status))}</span><strong>${escapeHtml(suggestion.title)}</strong><p>${escapeHtml(suggestion.body)}</p>${suggestion.staffResponse ? `<small>Réponse : ${escapeHtml(suggestion.staffResponse)}</small>` : ''}<div class="member-community-actions"><button class="button button-small ${suggestion.viewerVote === 1 ? '' : 'button-ghost'}" type="button" data-community-click="vote-suggestion" data-guild-id="${escapeHtml(item.guild.id)}" data-suggestion-id="${escapeHtml(suggestion.id)}" data-value="1">Utile · ${escapeHtml(suggestion.score)}</button><button class="button button-small button-ghost" type="button" data-community-click="vote-suggestion" data-guild-id="${escapeHtml(item.guild.id)}" data-suggestion-id="${escapeHtml(suggestion.id)}" data-value="-1">Pas prioritaire</button></div></article>`).join('');

    return `<section class="member-community-suite">
      <div class="member-community-heading"><div><span>Vie du serveur</span><h3>Mon équipe et ma communauté</h3></div><small>Actions liées à ${escapeHtml(item.guild.name)}</small></div>
      <div class="member-community-grid">
        <article class="member-card"><header class="member-section-heading"><div><span>Recrutements</span><h3>Mes candidatures</h3></div><strong>${escapeHtml(recruitment.applications.length)}</strong></header><div class="member-community-list">${applications || emptyMemberState('Aucune candidature envoyée.')}${recruitmentForms || (!recruitment.forms.length ? emptyMemberState('Aucun recrutement ouvert.') : '')}</div></article>
        <article class="member-card"><header class="member-section-heading"><div><span>Planning</span><h3>Mes prochains créneaux</h3></div><strong>${escapeHtml(planning.shifts.length)}</strong></header><div class="member-community-list">${shifts || emptyMemberState('Aucun créneau à venir.')}</div><form data-community-action="declare-absence" data-guild-id="${escapeHtml(item.guild.id)}" class="member-community-form member-absence-form"><h4>Déclarer une absence</h4><label><span>Début</span><input type="datetime-local" name="startsAt" required></label><label><span>Fin</span><input type="datetime-local" name="endsAt" required></label><label><span>Motif facultatif</span><input name="reason" maxlength="500"></label><button class="button button-small" type="submit">Enregistrer</button></form><div class="member-community-list">${absences}</div></article>
        <article class="member-card member-suggestions-card"><header class="member-section-heading"><div><span>Boîte à idées</span><h3>Suggestions de la communauté</h3></div><strong>${escapeHtml(suggestions.length)}</strong></header><form data-community-action="create-suggestion" data-guild-id="${escapeHtml(item.guild.id)}" class="member-community-form"><label><span>Titre</span><input name="title" minlength="5" maxlength="120" required></label><label><span>Proposition</span><textarea name="body" minlength="20" maxlength="3000" required></textarea></label><button class="button button-small" type="submit">Proposer cette idée</button></form><div class="member-community-list">${suggestionItems || emptyMemberState('Aucune suggestion publiée.')}</div></article>
      </div>
    </section>`;
  }

  function digestHistory(items) {
    if (!items?.length) return emptyMemberState('Aucun résumé Discord envoyé pour le moment.');
    const labels = { delivered: 'Envoyé', empty: 'Aucune nouveauté', failed: 'Échec' };
    return `<div class="member-list">${items.map(item => `<article><span>${escapeHtml(labels[item.status] || item.status)}</span><strong>${escapeHtml(item.itemCount || 0)} information(s)</strong><small>${escapeHtml(formatDate(item.deliveredAt || item.attemptedAt))}${item.errorMessage ? ` · ${escapeHtml(item.errorMessage)}` : ''}</small></article>`).join('')}</div>`;
  }

  async function showNewBrowserNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !portal?.guilds?.length) return;
    const registration = await navigator.serviceWorker?.ready?.catch(() => null);
    for (const item of portal.guilds) {
      for (const notification of (item.notifications || []).slice(0, 5)) {
        const key = `sentinel-browser-notification:${item.guild.id}:${notification.key}:${notification.createdAt || ''}`;
        if (localStorage.getItem(key)) continue;
        const options = {
          body: `${item.guild.name} · ${notification.detail}`,
          icon: 'assets/noctigarde-mark.png',
          badge: 'assets/noctigarde-mark.png',
          tag: key,
          data: { url: 'membre.html' }
        };
        if (registration) await registration.showNotification(notification.title, options);
        else new Notification(notification.title, options);
        localStorage.setItem(key, new Date().toISOString());
      }
    }
  }

  function attachNotificationControl() {
    const button = document.querySelector('[data-enable-browser-notifications]');
    if (!button || !('Notification' in window)) {
      button?.remove();
      return;
    }
    if (Notification.permission === 'granted') button.textContent = 'Notifications actives';
    if (Notification.permission === 'denied') button.textContent = 'Notifications bloquées';
    button.disabled = Notification.permission === 'denied';
    button.addEventListener('click', async () => {
      const permission = await Notification.requestPermission();
      button.textContent = permission === 'granted' ? 'Notifications actives' : 'Notifications bloquées';
      button.disabled = permission === 'denied';
      if (permission === 'granted') await showNewBrowserNotifications();
    });
  }

  function renderGuild(item) {
    const icon = safeImage(item.guild.icon);
    const line = item.payroll.line;
    const sessions = item.service.sessions || [];
    const dossiers = item.dossiers || [];
    const notifications = item.notifications || [];
    const digests = item.digestHistory || [];
    const preferences = [
      ['serviceEnabled', 'Services', 'Début, fin et rappel de service'],
      ['payrollEnabled', 'Salaire', 'Relevé et versement de la semaine'],
      ['dossierEnabled', 'Tickets', 'Réponse et changement de statut'],
      ['moderationEnabled', 'Modération', 'Avertissement et décision du staff']
    ];
    return `
      <section class="dashboard-panel member-guild-panel">
        <div class="member-guild-heading">
          <div class="member-server-identity">${icon ? `<img src="${escapeHtml(icon)}" alt="">` : '<span class="guild-fallback">S</span>'}<div><p class="eyebrow">Serveur Discord</p><h2>${escapeHtml(item.guild.name)}</h2><p>Ton activité et tes informations personnelles sur ce serveur.</p></div></div>
          <span class="member-sync-state"><i aria-hidden="true"></i>Données à jour</span>
        </div>
        <div class="dashboard-metrics member-metrics">
          <article class="member-metric is-cyan"><span>Temps total</span><strong>${escapeHtml(item.service.totalTimeLabel)}</strong><small>${item.service.active ? 'Service en cours' : 'Hors service'}</small></article>
          <article class="member-metric is-mint"><span>Sessions</span><strong>${escapeHtml(item.service.sessionCount)}</strong><small>${Number(item.service.sessionCount) === 1 ? 'Session enregistrée' : 'Sessions enregistrées'}</small></article>
          <article class="member-metric is-violet"><span>Salaire de la semaine</span><strong>${line ? escapeHtml(line.amountLabel) : 'Aucun'}</strong><small>${line ? (line.paid ? 'Salaire versé' : 'Salaire à verser') : 'Aucun salaire enregistré'}</small></article>
          <article class="member-metric is-pink"><span>Avertissements actifs</span><strong>${escapeHtml(item.warnings.activeCount)}</strong><small>${Number(item.warnings.activeCount) ? `Expiration après ${escapeHtml(item.warnings.expirationDays)} jours` : 'Aucun avertissement actif'}</small></article>
        </div>
        <div class="member-detail-columns">
          <div class="member-detail-column">
            <article class="member-card"><header class="member-section-heading"><div><span>Activité</span><h3>Mes derniers services</h3></div><strong>${escapeHtml(sessions.length)}</strong></header>${sessions.length ? `<div class="member-list">${sessions.map(session => `<article><strong>${escapeHtml(session.durationLabel)}</strong><small>${escapeHtml(formatDate(session.date))}</small></article>`).join('')}</div>` : emptyMemberState('Aucune session enregistrée.')}</article>
            <article class="member-card"><header class="member-section-heading"><div><span>Modération</span><h3>Mon registre disciplinaire</h3></div><strong>${escapeHtml(item.warnings.items.length)}</strong></header>${warningList(item.warnings, item.appeals, item.guild.id)}</article>
            <article class="member-card"><header class="member-section-heading"><div><span>Discord</span><h3>Résumés reçus</h3></div><strong>${escapeHtml(digests.length)}</strong></header>${digestHistory(digests)}</article>
          </div>
          <div class="member-detail-column">
            <article class="member-card"><header class="member-section-heading"><div><span>Support</span><h3>Mes tickets</h3></div><strong>${escapeHtml(dossiers.length)}</strong></header>${dossierList(dossiers)}</article>
            <article class="member-card"><header class="member-section-heading"><div><span>Suivi</span><h3>Mes notifications</h3></div><strong>${escapeHtml(notifications.length)}</strong></header>${notificationList(notifications)}</article>
            <article class="member-card member-preferences-card"><header class="member-section-heading"><div><span>Préférences</span><h3>Mes alertes</h3></div></header><form data-preferences data-guild-id="${escapeHtml(item.guild.id)}" class="member-preferences">
              <div class="member-preference-grid">${preferences.map(([key, label, detail]) => `<label class="member-preference-toggle"><input type="checkbox" name="${key}" ${item.preferences[key] ? 'checked' : ''}><span class="member-switch" aria-hidden="true"></span><span class="member-preference-copy"><strong>${label}</strong><small>${detail}</small></span></label>`).join('')}</div>
              <label class="member-digest-setting"><span><strong>Résumé privé Discord</strong><small>Reçois un récapitulatif directement en message privé.</small></span><select name="digestFrequency"><option value="none" ${item.preferences.digestFrequency === 'none' ? 'selected' : ''}>Désactivé</option><option value="daily" ${item.preferences.digestFrequency === 'daily' ? 'selected' : ''}>Chaque jour</option><option value="weekly" ${item.preferences.digestFrequency === 'weekly' ? 'selected' : ''}>Chaque semaine</option></select></label>
              <button class="button member-preferences-save" type="submit">Enregistrer mes préférences</button>
            </form></article>
          </div>
        </div>
        ${memberCommunityPanel(item)}
      </section>
    `;
  }

  function render() {
    const guilds = portal?.guilds || [];
    const privacyRequests = portal?.privacyRequests || [];
    const privacyPanel = `<section class="dashboard-panel member-guild-panel"><div class="panel-heading"><p class="eyebrow">Tes données Noctigarde</p><h2>Confidentialité</h2><p class="muted">Télécharge une copie lisible de tes données ou demande leur suppression. Une suppression est toujours contrôlée avant exécution.</p></div><div class="member-detail-grid"><article class="inline-form"><h3>Copie de mes données</h3><p class="muted">Le rapport PDF est prêt à lire. Le fichier JSON contient la copie technique complète.</p><div class="split-actions"><a class="button button-small" href="/api/me/privacy/export?format=pdf">Télécharger le rapport PDF</a><a class="button button-small button-ghost" href="/api/me/privacy/export?format=json">Format technique JSON</a></div></article><article class="inline-form"><h3>Demande de suppression</h3><form data-member-delete><label><span>Motif facultatif</span><textarea name="reason" maxlength="1000" placeholder="Précise les éléments concernés si nécessaire."></textarea></label><button class="button button-small button-ghost" type="submit">Envoyer la demande</button></form>${privacyRequests.length ? `<div class="member-list">${privacyRequests.map(item => `<article><span>${escapeHtml(item.requestKey)}</span><strong>${escapeHtml(item.status === 'pending' ? 'En cours de contrôle' : item.status)}</strong><small>${escapeHtml(formatDate(item.createdAt))}</small></article>`).join('')}</div>` : ''}</article></div></section>`;
    content.innerHTML = privacyPanel + (guilds.length
      ? guilds.map(renderGuild).join('')
      : '<div class="empty-state"><img src="assets/noctigarde-mark.png" alt=""><h2>Aucun registre disponible</h2><p>Ton compte Discord n’est membre d’aucun serveur où Noctigarde est installé.</p></div>');
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
    document.querySelectorAll('[data-community-action]').forEach(form => {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        const action = form.dataset.communityAction;
        const body = { action, guildId: form.dataset.guildId };
        if (action === 'apply') {
          body.formId = form.dataset.formId;
          body.answers = Array.from(form.querySelectorAll('[data-recruitment-answer]')).map(input => ({ answer: input.value }));
        } else {
          new FormData(form).forEach((value, key) => { body[key] = value; });
          for (const key of ['startsAt', 'endsAt']) {
            if (body[key]) body[key] = new Date(body[key]).toISOString();
          }
        }
        try {
          const payload = await api('/api/me/community', { method: 'POST', body: JSON.stringify(body) });
          portal = payload.portal;
          render();
          toast('Ton espace a été mis à jour.');
        } catch (error) { toast(error.message, 'error'); }
        finally { button.disabled = false; }
      });
    });
    document.querySelectorAll('[data-community-click]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        const body = {
          action: button.dataset.communityClick,
          guildId: button.dataset.guildId,
          applicationId: button.dataset.applicationId,
          shiftId: button.dataset.shiftId,
          absenceId: button.dataset.absenceId,
          suggestionId: button.dataset.suggestionId,
          status: button.dataset.status,
          value: button.dataset.value
        };
        try {
          const payload = await api('/api/me/community', { method: 'POST', body: JSON.stringify(body) });
          portal = payload.portal;
          render();
          toast('Choix enregistré.');
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
      userCard.innerHTML = `<strong>${escapeHtml(session.user.globalName || session.user.username)}</strong><small>Compte Discord vérifié</small><button class="button button-small button-ghost" type="button" data-enable-browser-notifications>Activer les notifications</button>`;
      portal = (await api('/api/me/portal')).portal;
      render();
      attachNotificationControl();
      showNewBrowserNotifications();
    } catch (error) {
      content.innerHTML = `<div class="empty-state"><img src="assets/noctigarde-mark.png" alt=""><h2>Connexion nécessaire</h2><p>Connecte ton compte Discord pour ouvrir ton registre personnel.</p><a class="button" href="/auth/login" data-discord-login>Connexion Discord</a></div>`;
      window.NoctigardeAuth?.decorateLoginLinks?.();
    }
  }

  init();
})();
