const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const siteDir = path.join(root, 'site');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('public pages do not expose the suspended paid offer', () => {
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

test('paid access and its public entry points stay disabled', () => {
    const botSource = read('index.js');
    const dashboardSource = read('dashboard.js');
    const commandSource = read('deploy-commands.js');

    assert.match(botSource, /const PREMIUM_ACCESS_ENABLED = false;/);
    assert.match(dashboardSource, /const PREMIUM_ACCESS_ENABLED = false;/);
    assert.doesNotMatch(commandSource, /command\('premium'/);
    assert.doesNotMatch(commandSource, /command\('premium-acces'/);
    assert.match(commandSource, /referenceOperationCommands\.map\(item => item\.toJSON\(\)\)/);
    assert.match(dashboardSource, /url\.pathname === '\/api\/creator\/premium-access'[\s\S]{0,120}createHttpError\(404/);
});
