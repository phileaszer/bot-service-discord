const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const siteDir = path.join(root, 'site');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('public pages do not expose a paid offer', () => {
    const publicFiles = fs.readdirSync(siteDir)
        .filter(fileName => fileName.endsWith('.html'))
        .map(fileName => path.join(siteDir, fileName));

    assert.equal(fs.existsSync(path.join(siteDir, 'premium.html')), false);

    for (const filePath of publicFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.doesNotMatch(content, /premium/i, path.basename(filePath));
    }

    assert.doesNotMatch(read('site/sitemap.xml'), /premium/i);
    assert.doesNotMatch(read('site/status.js'), /premium/i);
});

test('the complete feature set is free and the payment system is absent', () => {
    const botSource = read('index.js');
    const dashboardSource = read('dashboard.js');
    const commandSource = read('deploy-commands.js');
    const packageSource = read('package.json');
    const environmentSource = read('.env.example');

    assert.match(botSource, /const ADVANCED_FEATURES_FREE = true;/);
    assert.match(dashboardSource, /const ADVANCED_FEATURES_FREE = true;/);
    assert.doesNotMatch(botSource, /require\('\.\/billing'\)/);
    assert.doesNotMatch(dashboardSource, /require\('\.\/billing'\)/);
    assert.doesNotMatch(commandSource, /command\('premium'/);
    assert.doesNotMatch(commandSource, /command\('premium-acces'/);
    assert.match(commandSource, /command\('paie-ajustement'/);
    assert.match(commandSource, /command\('dossier-reouvrir'/);
    assert.match(commandSource, /globalCommands\.map\(item => item\.toJSON\(\)\)/);
    assert.match(commandSource, /Routes\.applicationGuildCommands[\s\S]{0,220}\{ body: \[\] \}/);
    assert.doesNotMatch(dashboardSource, /\/api\/billing|\/billing\/(checkout|portal)/);
    assert.doesNotMatch(packageSource, /"stripe"/i);
    assert.doesNotMatch(environmentSource, /STRIPE_/);
    assert.equal(fs.existsSync(path.join(root, 'billing.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'test', 'billing.test.js')), false);
});
