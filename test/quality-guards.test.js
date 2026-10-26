'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { siteCapabilities, SITE_ACCESS_ROLES } = require('../access-policy');
const { backupObjectKey, uploadVerifiedBackup } = require('../database/offsite-backup');
const { createPerformanceMonitor } = require('../performance-monitor');
const { protectStorageOverview } = require('../creator-overview');
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
    assert.equal(founder.canManageSystem, true);
    assert.equal(staff.canViewSitePanel, true);
    assert.equal(staff.canManageSiteStaff, false);
    assert.equal(staff.canManagePremium, false);
    assert.equal(staff.canManageSystem, false);
    assert.equal(member.canViewSitePanel, false);
});

test('creator overview hides private storage paths from staff', () => {
    const storage = {
        latestFile: 'private/latest.db.gz',
        backups: [{ fileName: 'daily.db.gz', sizeBytes: 42 }],
        coldArchives: [{ fileName: 'audit.jsonl.gz', rowCount: 8 }],
        performance: {
            database: { recentSlowQueries: [{ sql: 'SELECT secret' }] },
            runtime: {
                dashboard: { recentSlowRequests: [{ route: '/private' }] },
                discord: { recentSlowInteractions: [{ command: 'secret' }] }
            }
        }
    };
    const protectedStorage = protectStorageOverview(storage, false);
    assert.equal(protectedStorage.latestFile, null);
    assert.equal(Object.hasOwn(protectedStorage.backups[0], 'fileName'), false);
    assert.equal(Object.hasOwn(protectedStorage.coldArchives[0], 'fileName'), false);
    assert.deepEqual(protectedStorage.performance.database.recentSlowQueries, []);
    assert.deepEqual(protectedStorage.performance.runtime.dashboard.recentSlowRequests, []);
    assert.deepEqual(protectedStorage.performance.runtime.discord.recentSlowInteractions, []);
    assert.equal(protectStorageOverview(storage, true), storage);
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
    assert.equal(status.dashboard.budgetMs, 1000);
    assert.equal(status.dashboard.withinBudget, false);
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
    assert.match(source, /\/api\/creator\/feature-flags[\s\S]{0,320}requireFounderAccess[\s\S]{0,320}requireFounderMfa/);
    assert.match(source, /\/api\/creator\/maintenance[\s\S]{0,180}requireFounderAccess/);
    assert.match(source, /\/api\/creator\/official-update[\s\S]{0,180}requireFounderAccess/);
});

test('community workspace and installable mobile experience are wired end to end', () => {
    const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const backend = read('dashboard.js');
    const bot = read('index.js');
    const runner = read('operations-runner.js');
    const dashboard = read('site/dashboard.js');
    const member = read('site/membre.js');
    const theme = read('site/theme.js');
    const manifest = JSON.parse(read('site/manifest.webmanifest'));
    const serviceWorker = read('site/sw.js');
    assert.match(backend, /require\('\.\/community-suite'\)/);
    assert.match(backend, /\/api\/me\/community/);
    assert.match(backend, /community-create-recruitment-form[\s\S]{0,120}requireCommandAccess\(ctx, member\)/);
    assert.match(bot, /createOperationsRunner/);
    assert.match(runner, /processTeamShiftReminders/);
    assert.match(bot, /getPanelTheme\(guild\.id, 'tickets'\)/);
    for (const label of ['Recrutements', 'Planning', 'Suggestions', 'Panneaux', 'Statistiques', 'Aide']) {
        assert.match(dashboard, new RegExp(label));
    }
    assert.match(member, /data-community-action="apply"/);
    assert.match(member, /data-community-click="shift-response"/);
    assert.match(member, /data-community-action="create-suggestion"/);
    assert.match(theme, /beforeinstallprompt/);
    assert.match(theme, /serviceWorker\.register/);
    assert.equal(manifest.display, 'standalone');
    assert.match(serviceWorker, /notificationclick/);
});

test('production startup stays fast while full validation remains in CI', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'validate.yml'), 'utf8');
    assert.match(pkg.scripts.start, /startup:check/);
    assert.doesNotMatch(pkg.scripts.start, /validate/);
    assert.match(pkg.scripts.validate, /audit:performance/);
    assert.match(workflow, /npm run validate/);
});

test('emergency switches guard sensitive and scheduled features', () => {
    const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const bot = read('index.js');
    const runner = read('operations-runner.js');
    const dashboard = read('dashboard.js');
    const controls = read('creator-system-controls.js');
    for (const feature of ['automod', 'message-purge', 'long-service-alerts', 'ticket-maintenance', 'official-updates', 'status-panels', 'repair-scan']) {
        assert.match(bot, new RegExp(feature));
    }
    for (const feature of ['scheduled-announcements', 'scheduled-reports', 'member-digests', 'planning-reminders']) {
        assert.match(runner, new RegExp(feature));
    }
    assert.match(dashboard, /\/api\/creator\/feature-flags/);
    assert.match(controls, /updateFeatureFlag/);
});
