'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-flags-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'flags.db');

const db = require('../database/database');
const flags = require('../feature-flags');

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('emergency feature flags default to enabled and persist a reason', () => {
    assert.equal(flags.isFeatureEnabled('automod'), true);
    const disabled = flags.updateFeatureFlag('automod', false, '100000000000000001', 'Incident Discord en cours');
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.reason, 'Incident Discord en cours');
    assert.equal(flags.isFeatureEnabled('automod'), false);
    const enabled = flags.updateFeatureFlag('automod', true, '100000000000000001', 'Incident résolu');
    assert.equal(enabled.enabled, true);
    assert.match(flags.disabledMessage('automod'), /Incident résolu/);
});

test('unknown switches cannot be inserted', () => {
    assert.throws(() => flags.updateFeatureFlag('unknown', false, '100000000000000001'), /inconnue/i);
    assert.equal(flags.listFeatureFlags().some(item => item.key === 'message-purge'), true);
});
