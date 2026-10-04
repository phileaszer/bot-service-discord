'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-governance-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'governance.db');
process.env.DATABASE_BACKUP_ENABLED = 'false';
process.env.DASHBOARD_SESSION_SECRET = 'sentinel-test-secret-that-is-long-enough-2026';

const db = require('../database/database');
const governance = require('../governance');

const founderId = '100000000000000001';
const reviewerId = '100000000000000002';

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('founder MFA encrypts setup, blocks TOTP replay, and consumes recovery codes', () => {
    const at = 1791028800000;
    const setup = governance.beginFounderMfaSetup(founderId, 'Fondatrice');
    const stored = db.prepare('SELECT * FROM founder_mfa WHERE user_id = ?').get(founderId);
    assert.match(stored.pending_secret_encrypted, /^enc:v1:/);
    assert.equal(stored.pending_secret_encrypted.includes(setup.secret), false);

    const code = governance.totpCode(setup.secret, Math.floor(at / 30000));
    const enabled = governance.enableFounderMfa(founderId, code, at);
    assert.equal(enabled.enabled, true);
    assert.throws(() => governance.verifyFounderMfa(founderId, code, at), /invalide|utilisé/);

    const recovered = governance.verifyFounderMfa(founderId, setup.recoveryCodes[0], at);
    assert.equal(recovered.method, 'recovery');
    assert.equal(recovered.recoveryCodesRemaining, 7);
    assert.throws(() => governance.verifyFounderMfa(founderId, setup.recoveryCodes[0], at), /invalide|utilisé/);
});

test('critical actions require a different authorized decision maker', () => {
    const request = governance.createCriticalAction({
        scope: 'global',
        actionType: 'premium-access',
        payload: { action: 'add', target: 'server', guildId: '100000000000000003' },
        summary: 'Accorder le Premium',
        requestedByUserId: founderId
    });
    assert.equal(request.status, 'pending');
    assert.throws(() => governance.beginCriticalActionDecision(request.id, founderId), /autre personne/);
    const approved = governance.beginCriticalActionDecision(request.id, reviewerId);
    assert.equal(approved.status, 'executing');
    assert.equal(approved.approvedByUserId, reviewerId);
    assert.equal(governance.completeCriticalAction(request.id).status, 'executed');
});
