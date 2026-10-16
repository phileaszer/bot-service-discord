'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { siteCapabilities, SITE_ACCESS_ROLES } = require('../access-policy');
const { backupObjectKey, uploadVerifiedBackup } = require('../database/offsite-backup');
const { createPerformanceMonitor } = require('../performance-monitor');
const { stagingValidationConfig } = require('../staging-validation');
const { auditBotI18n } = require('../tools/audit-bot-i18n');
const { validateStatusPayload } = require('../tools/check-uptime');

test('bot translations keep French and English keys aligned', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const result = auditBotI18n(source);
    assert.deepEqual(result.errors, []);
    assert.equal(result.counts.fr, result.counts.en);
});

test('site access matrix isolates founder, staff and member privileges', () => {
    const founder = siteCapabilities(SITE_ACCESS_ROLES.FOUNDER);
    const staff = siteCapabilities(SITE_ACCESS_ROLES.STAFF);
    const member = siteCapabilities(SITE_ACCESS_ROLES.USER);
    assert.equal(founder.canManageSiteStaff, true);
    assert.equal(founder.canManagePremium, true);
    assert.equal(staff.canViewSitePanel, true);
    assert.equal(staff.canManageSiteStaff, false);
    assert.equal(staff.canManagePremium, false);
    assert.equal(member.canViewSitePanel, false);
});

test('staging configuration requires two distinct dedicated accounts for real actions', () => {
    const incomplete = stagingValidationConfig({
        SENTINEL_STAGING_GUILD_ID: '123456789012345678',
        SENTINEL_STAGING_VALIDATION_REQUIRED: 'true',
        SENTINEL_STAGING_REAL_ACTIONS: 'true'
    });
    assert.equal(incomplete.ready, false);
    assert.equal(incomplete.issues.length, 2);

    const ready = stagingValidationConfig({
        SENTINEL_STAGING_GUILD_ID: '123456789012345678',
        SENTINEL_STAGING_VALIDATION_REQUIRED: 'true',
        SENTINEL_STAGING_REAL_ACTIONS: 'true',
        SENTINEL_STAGING_MEMBER_ID: '223456789012345678',
        SENTINEL_STAGING_BAN_TARGET_ID: '323456789012345678'
    });
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.issues, []);
});

test('performance monitor redacts Discord ids in slow dashboard routes', () => {
    const monitor = createPerformanceMonitor({ getGatewayPing: () => 42 });
    monitor.recordDashboardRequest({
        durationMs: 1250,
        status: 503,
        method: 'GET',
        route: '/api/guilds/123456789012345678/private'
    });
    const status = monitor.status();
    assert.equal(status.dashboard.errorCount, 1);
    assert.equal(status.dashboard.recentSlowRequests[0].route, '/api/guilds/:id/private');
    assert.equal(status.discord.gatewayPingMs, 42);
});

test('only verified backups are copied to private object storage', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-offsite-'));
    const filePath = path.join(directory, 'sentinel-2026-10-16.db.gz');
    fs.writeFileSync(filePath, 'verified backup');
    const uploads = [];
    const storage = {
        enabled: true,
        configured: true,
        async putIfAbsent(payload) {
            for await (const chunk of payload.body) void chunk;
            uploads.push(payload);
            return { created: true, key: `sentinel/backups/${payload.key}` };
        }
    };

    await assert.rejects(
        uploadVerifiedBackup(storage, filePath, { status: 'failed' }),
        /non verifiee/
    );
    const result = await uploadVerifiedBackup(storage, filePath, {
        status: 'ok',
        checkedAt: '2026-10-16T08:00:00.000Z'
    });
    assert.equal(result.uploaded, true);
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].key, backupObjectKey(filePath, '2026-10-16T08:00:00.000Z'));
    fs.rmSync(directory, { recursive: true, force: true });
});

test('external uptime check fails when Discord is offline', () => {
    assert.throws(
        () => validateStatusPayload({ ok: true, status: { dashboardOnline: true, botOnline: false } }),
        /bot Discord est hors ligne/
    );
    assert.deepEqual(validateStatusPayload({
        ok: true,
        status: { dashboardOnline: true, botOnline: true, guildCount: 4, incidents: [] }
    }), {
        botOnline: true,
        dashboardOnline: true,
        guildCount: 4,
        incidents: 0
    });
});

test('critical dashboard routes keep founder and CSRF checks server-side', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard.js'), 'utf8');
    assert.match(source, /if \(!SAFE_METHODS\.has\(req\.method\)\) \{\s*requireTrustedMutationOrigin\(req\)/);
    assert.match(source, /\/api\/creator\/site-staff[\s\S]{0,160}requireFounderAccess/);
    assert.match(source, /\/api\/creator\/incidents[\s\S]*requireFounderAccess/);
    assert.match(source, /\/api\/creator\/maintenance[\s\S]{0,180}requireFounderAccess/);
    assert.match(source, /\/api\/creator\/official-update[\s\S]{0,180}requireFounderAccess/);
});
