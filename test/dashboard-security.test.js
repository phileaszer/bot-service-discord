'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('privacy, repair, appeal and incident routes enforce server-side identity checks', () => {
    const source = read('dashboard.js');
    assert.match(source, /\/api\/me\/privacy\/export[\s\S]*createMemberDataExport\(session\.user\.id\)/);
    assert.match(source, /guildPrivacyExportMatch[\s\S]*guild\.ownerId === session\.user\.id[\s\S]*siteAccess\.isFounder/);
    assert.match(source, /request-guild-data-deletion[\s\S]*guild\.ownerId !== session\?\.user\?\.id[\s\S]*!siteAccess\.isFounder/);
    assert.match(source, /\/api\/me\/appeals[\s\S]*guild\.members\.fetch\(session\.user\.id\)[\s\S]*createAppeal\(guild\.id[\s\S]*session\.user\.id/);
    assert.match(source, /decide-appeal[\s\S]*requireModerationAccess\(ctx, member, PermissionsBitField\.Flags\.ManageMessages/);
    assert.match(source, /\/api\/creator\/incidents[\s\S]*requireFounderAccess\(session, \{ recentLogin: true \}\)/);
    assert.match(source, /scan-repairs[\s\S]*requireCommandAccess\(ctx, member\)/);
    assert.match(source, /apply-safe-repairs[\s\S]*requireCommandAccess\(ctx, member\)/);
});

test('public status exposes incident identifiers without private incident messages', () => {
    const source = read('dashboard.js');
    const routeStart = source.indexOf("if (req.method === 'GET' && url.pathname === '/api/status')");
    const statusRoute = source.slice(
        routeStart,
        source.indexOf("if (req.method === 'GET' && url.pathname === '/api/updates')", routeStart)
    );
    assert.match(statusRoute, /Incident technique \$\{item\.incidentId\}/);
    assert.doesNotMatch(statusRoute, /item\.message|item\.context/);
});

test('obsolete reset copy is removed and the new modules are syntax-checked', () => {
    assert.doesNotMatch(read('site/securite.html'), /remise à zéro générale est indisponible/i);
    const packageSource = read('package.json');
    for (const file of ['runtime-guard.js', 'appeals.js', 'privacy-center.js', 'repair-center.js']) {
        assert.match(packageSource, new RegExp(`node --check ${file.replace('.', '\\.')}`));
    }
});

test('founder console exposes staging readiness without Discord identifiers', () => {
    const backend = read('dashboard.js');
    const frontend = read('site/dashboard.js');
    assert.match(backend, /stagingValidation: ctx\.helpers\.getStagingValidationStatus/);
    assert.match(frontend, /function founderStagingPanel\(overview\)/);
    assert.match(frontend, /Aucun identifiant sensible n’est affiché ici/);
    assert.doesNotMatch(frontend, /staging\.guildId|staging\.moderationMemberId|staging\.banTargetId/);
});

test('dashboard sections use persistent internal summaries instead of one long page', () => {
    const frontend = read('site/dashboard.js');
    const styles = read('site/styles.css');
    assert.match(frontend, /const DASHBOARD_SUBTABS = \{/);
    for (const tab of ['overview', 'setup', 'configuration', 'service', 'dossiers', 'moderation', 'embeds', 'audit', 'operations', 'founder']) {
        assert.match(frontend, new RegExp(`\\n  ${tab}: \\[`));
    }
    assert.match(frontend, /function applyDashboardSubtabs\(root = document\)/);
    assert.match(frontend, /activeDashboardSubtabs\[parent\] = button\.dataset\.dashboardSubtab/);
    assert.match(frontend, /class="dashboard-primary-nav"/);
    assert.match(frontend, /class="dashboard-nav-item/);
    assert.match(frontend, /eyebrow: 'Synthèse'/);
    assert.doesNotMatch(frontend, /DASHBOARD_TAB_GROUPS|dashboard-nav-section/);
    assert.match(styles, /\.dashboard-subtabs[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(150px, 1fr\)\)/);
    assert.match(styles, /\.dashboard-primary-nav[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
    assert.doesNotMatch(styles, /\.dashboard-nav-section|\.dashboard-nav-heading/);
    assert.doesNotMatch(styles, /\.dashboard-nav-item\.is-active::after/);
    assert.match(styles, /:root\[data-theme="western"\] \.dashboard-subnav/);
});
