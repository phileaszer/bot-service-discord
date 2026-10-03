'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-validation-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'validation.db');
process.env.DATABASE_BACKUP_ENABLED = 'false';

const db = require('../database/database');
const operations = require('../operations');
const { SITE_ACCESS_ROLES, siteCapabilities } = require('../access-policy');

const guildId = '100000000000000001';
const userId = '100000000000000002';

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('warning escalation keeps ordered thresholds and selects exact milestones', () => {
    const settings = operations.updateWarningEscalationSettings(guildId, {
        enabled: true,
        windowDays: 45,
        timeoutThreshold: 3,
        timeoutSeconds: 7200,
        kickThreshold: 5,
        banThreshold: 7,
        ignoredRoleIds: ['100000000000000003']
    }, userId);

    assert.equal(settings.enabled, true);
    assert.equal(operations.getWarningEscalationAction(settings, 2), null);
    assert.equal(operations.getWarningEscalationAction(settings, 3), 'timeout');
    assert.equal(operations.getWarningEscalationAction(settings, 5), 'kick');
    assert.equal(operations.getWarningEscalationAction(settings, 7), 'ban');
    assert.throws(() => operations.updateWarningEscalationSettings(guildId, {
        timeoutThreshold: 5,
        kickThreshold: 4,
        banThreshold: 7
    }), /strictement croissants/);
});

test('active warning count is scoped by server and user', () => {
    const insert = db.prepare(`
        INSERT INTO moderation_cases (guild_id, target_user_id, moderator_user_id, action, reason, created_at)
        VALUES (?, ?, ?, 'warn', 'test', ?)
    `);
    insert.run(guildId, userId, userId, new Date().toISOString());
    insert.run(guildId, userId, userId, new Date().toISOString());
    insert.run('100000000000000009', userId, userId, new Date().toISOString());
    assert.equal(operations.getActiveWarningCount(guildId, userId, 30), 2);
});

test('scheduled announcements remain isolated by server', () => {
    const item = operations.saveScheduledAnnouncement(guildId, userId, {
        channelId: '100000000000000004',
        title: 'Contrôle Sentinel',
        description: 'Annonce de validation.',
        color: '#2dd4bf',
        status: 'draft',
        recurrence: 'weekly'
    });
    assert.equal(item.status, 'draft');
    assert.equal(operations.getScheduledAnnouncements(guildId).length, 1);
    assert.equal(operations.getScheduledAnnouncements('100000000000000009').length, 0);
});

test('scheduled announcement approval requires a second responsible user', () => {
    const reviewerId = '100000000000000008';
    const item = operations.saveScheduledAnnouncement(guildId, userId, {
        channelId: '100000000000000004',
        title: 'Annonce contrôlée',
        description: 'Cette annonce exige une seconde validation.',
        color: '#2dd4bf',
        status: 'pending_approval',
        recurrence: 'none',
        nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
    assert.equal(item.status, 'pending_approval');
    assert.throws(
        () => operations.approveScheduledAnnouncement(guildId, item.id, userId),
        /autre responsable/
    );
    const approved = operations.approveScheduledAnnouncement(guildId, item.id, reviewerId);
    assert.equal(approved.status, 'scheduled');
    assert.equal(approved.approvedByUserId, reviewerId);
    assert.ok(approved.approvedAt);
});

test('report generators produce recognizable CSV, Excel and PDF files', () => {
    const input = { title: 'Rapport Sentinel', columns: ['Nom', 'Valeur'], rows: [{ Nom: 'Test', Valeur: '42' }] };
    const csv = operations.createReportDocument({ ...input, format: 'csv' });
    const xls = operations.createReportDocument({ ...input, format: 'xls' });
    const pdf = operations.createReportDocument({ ...input, format: 'pdf' });
    assert.match(csv.buffer.toString('utf8'), /Nom;Valeur/);
    assert.match(xls.buffer.toString('utf8'), /<Workbook/);
    assert.equal(pdf.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
    const longPdf = operations.createReportDocument({
        ...input,
        rows: Array.from({ length: 100 }, (_, index) => ({ Nom: `Ligne ${index + 1}`, Valeur: index })),
        format: 'pdf'
    });
    assert.match(longPdf.buffer.toString('latin1'), /\/Count 2/);
});

test('member preferences cannot affect another guild record', () => {
    operations.updateUserNotificationPreferences(guildId, userId, { payrollEnabled: false });
    assert.equal(operations.getUserNotificationPreferences(guildId, userId).payrollEnabled, false);
    assert.equal(operations.getUserNotificationPreferences('100000000000000009', userId).payrollEnabled, true);
});

test('site access capabilities keep founder, staff and member boundaries distinct', () => {
    const founder = siteCapabilities(SITE_ACCESS_ROLES.FOUNDER);
    const staff = siteCapabilities(SITE_ACCESS_ROLES.STAFF);
    const member = siteCapabilities(SITE_ACCESS_ROLES.USER);
    assert.equal(founder.canManagePremium, true);
    assert.equal(founder.canManageSiteStaff, true);
    assert.equal(staff.canViewSitePanel, true);
    assert.equal(staff.canManagePremium, false);
    assert.equal(staff.canManageSiteStaff, false);
    assert.equal(member.canViewSitePanel, false);
    assert.equal(member.canManagePremium, false);
});
