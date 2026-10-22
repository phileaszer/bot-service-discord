'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-community-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'community.db');

const db = require('../database/database');
const suite = require('../community-suite');

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('recruitment forms accept one application per member and support staff review', () => {
    const form = suite.createRecruitmentForm('100000000000000001', '200000000000000001', {
        title: 'Équipe de modération',
        description: 'Renfort du soir',
        questions: ['Pourquoi souhaites-tu rejoindre l’équipe ?', 'Quelles sont tes disponibilités ?'],
        targetRoleId: '300000000000000001'
    });
    assert.equal(form.open, true);
    assert.equal(form.questions.length, 2);

    const application = suite.submitRecruitmentApplication(
        form.guildId,
        form.id,
        '400000000000000001',
        [{ answer: 'Je souhaite aider la communauté.' }, { answer: 'Tous les soirs après 20 heures.' }]
    );
    assert.equal(application.status, 'submitted');
    assert.throws(() => suite.submitRecruitmentApplication(form.guildId, form.id, application.userId, application.answers), /déjà envoyé/i);

    const reviewed = suite.reviewRecruitmentApplication(form.guildId, application.id, '200000000000000001', {
        status: 'interview',
        interviewAt: new Date(Date.now() + 86400000).toISOString(),
        staffNote: 'Entretien prévu avec la responsable.'
    });
    assert.equal(reviewed.status, 'interview');
    assert.match(reviewed.staffNote, /Entretien/);

    const accepted = suite.reviewRecruitmentApplication(form.guildId, application.id, '200000000000000001', {
        status: 'accepted',
        staffNote: 'Candidature retenue.'
    });
    assert.equal(accepted.status, 'accepted');
    assert.throws(() => suite.reviewRecruitmentApplication(form.guildId, application.id, '200000000000000001', {
        status: 'rejected'
    }), /introuvable|retirée/i);
});

test('planning enforces capacity and stores member absences', () => {
    const guildId = '100000000000000002';
    const shift = suite.createTeamShift(guildId, '200000000000000002', {
        title: 'Service du samedi',
        startsAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 86400000 + 7200000).toISOString(),
        capacity: 1,
        reminderMinutes: 60
    });
    const answered = suite.setShiftResponse(guildId, shift.id, '400000000000000002', 'available');
    assert.equal(answered.counts.available, 1);
    assert.throws(() => suite.setShiftResponse(guildId, shift.id, '400000000000000003', 'available'), /complet/i);

    const absence = suite.declareAbsence(guildId, '400000000000000003', {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        reason: 'Indisponibilité personnelle'
    });
    assert.equal(suite.listAbsences(guildId, { userId: absence.userId }).length, 1);
    assert.equal(suite.cancelAbsence(guildId, absence.id, absence.userId).status, 'cancelled');
});

test('suggestions support voting, staff decisions and publication tracking', () => {
    const guildId = '100000000000000003';
    const suggestion = suite.createSuggestion(guildId, '400000000000000004', {
        title: 'Soirée communautaire',
        body: 'Organiser une soirée communautaire tous les derniers vendredis du mois.'
    });
    assert.equal(suite.voteSuggestion(guildId, suggestion.id, '400000000000000005', 1).score, 1);
    assert.equal(suite.voteSuggestion(guildId, suggestion.id, '400000000000000005', 1).score, 0);
    assert.throws(() => suite.voteSuggestion(guildId, suggestion.id, suggestion.userId, 1), /propre suggestion/i);

    const accepted = suite.reviewSuggestion(guildId, suggestion.id, '200000000000000003', {
        status: 'accepted',
        staffResponse: 'Bonne idée, nous la mettons en place.'
    });
    assert.equal(accepted.status, 'accepted');
    const published = suite.markSuggestionPublished(guildId, suggestion.id, '200000000000000003', '500000000000000001', '600000000000000001');
    assert.equal(published.status, 'published');
    assert.throws(() => suite.reviewSuggestion(guildId, suggestion.id, '200000000000000003', {
        status: 'rejected'
    }), /déjà publiée/i);
});

test('panel themes are normalized and community analytics remain bounded', () => {
    const guildId = '100000000000000004';
    const theme = suite.savePanelTheme(guildId, 'service', '200000000000000004', {
        title: 'Bureau des agents',
        description: 'Prends ton service avant de partir en mission.',
        color: '#12aBcD',
        imageUrl: 'https://cdn.discordapp.com/example.png',
        footer: 'Registre territorial',
        buttonStartLabel: 'Prendre mon poste',
        buttonEndLabel: 'Terminer mon poste'
    });
    assert.equal(theme.color, '#12ABCD');
    assert.equal(theme.title, 'Bureau des agents');
    assert.equal(theme.buttonLabels.start, 'Prendre mon poste');
    assert.throws(() => suite.savePanelTheme(guildId, 'service', '200000000000000004', { imageUrl: 'http://example.com/image.png' }), /HTTPS/i);

    const analytics = suite.getCommunityAnalytics(guildId);
    assert.equal(analytics.ticketsOpen, 0);
    assert.ok(Array.isArray(analytics.busiestHours));
    assert.ok(Array.isArray(analytics.staffLoad));
});
