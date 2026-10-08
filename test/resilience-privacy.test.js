'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-resilience-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'resilience.db');
process.env.DATABASE_BACKUP_ENABLED = 'false';

const db = require('../database/database');
const appeals = require('../appeals');
const privacy = require('../privacy-center');
const repair = require('../repair-center');
const runtime = require('../runtime-guard');

const guildId = '100000000000000101';
const userId = '100000000000000102';
const staffId = '100000000000000103';

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('persistent jobs use leases and idempotent execution claims', () => {
    assert.equal(runtime.acquireJobLease('digest-test', 60000), true);
    assert.equal(runtime.acquireJobLease('digest-test', 60000), false);
    assert.equal(runtime.claimJobExecution('digest', userId, '2026-10-08'), true);
    assert.equal(runtime.claimJobExecution('digest', userId, '2026-10-08'), false);
    runtime.completeJobExecution('digest', userId, '2026-10-08', { delivered: true });
    const row = db.prepare('SELECT status FROM scheduled_job_executions WHERE job_type = ?').get('digest');
    assert.equal(row.status, 'completed');
    assert.equal(runtime.claimJobExecution('digest', `${userId}-retry`, '2026-10-08'), true);
    runtime.completeJobExecution('digest', `${userId}-retry`, '2026-10-08', { error: 'temporary failure' });
    assert.equal(runtime.claimJobExecution('digest', `${userId}-retry`, '2026-10-08'), false);
});

test('runtime incidents receive a stable public identifier and can be resolved', () => {
    const originalError = console.error;
    console.error = () => {};
    let first;
    let second;
    try {
        first = runtime.reportIncident('dashboard-test', new Error('same failure'), { token: 'secret', route: '/test' });
        second = runtime.reportIncident('dashboard-test', new Error('same failure'), { route: '/test' });
    } finally {
        console.error = originalError;
    }
    assert.match(first.incidentId, /^INC-\d{8}-[A-F0-9]{8}$/);
    assert.equal(second.incidentId, first.incidentId);
    assert.equal(second.occurrenceCount, 2);
    assert.equal(first.context.token, '[redacted]');
    assert.equal(runtime.resolveIncident(first.incidentId), true);
    assert.equal(runtime.listIncidents({ status: 'open' }).length, 0);
});

test('a member can appeal only their own case and staff records one decision', () => {
    const caseId = Number(db.prepare(`
        INSERT INTO moderation_cases (guild_id, target_user_id, moderator_user_id, action, reason, created_at)
        VALUES (?, ?, ?, 'warn', 'Test', ?)
    `).run(guildId, userId, staffId, new Date().toISOString()).lastInsertRowid);
    assert.throws(() => appeals.createAppeal(guildId, caseId, staffId, 'Cette demande est suffisamment détaillée.'), /ne peut pas être contestée/);
    const appeal = appeals.createAppeal(guildId, caseId, userId, 'Je souhaite une révision car le contexte est incomplet.');
    assert.equal(appeal.status, 'pending');
    assert.throws(() => appeals.createAppeal(guildId, caseId, userId, 'Une seconde demande détaillée est envoyée.'), /déjà en attente/);
    const decision = appeals.decideAppeal(guildId, appeal.id, staffId, 'accepted', 'La sanction est retirée après vérification.');
    assert.equal(decision.status, 'accepted');
    assert.throws(() => appeals.decideAppeal(guildId, appeal.id, staffId, 'rejected', 'Nouvelle décision impossible.'), /déjà traitée/);
});

test('privacy exports remain scoped and retention settings are bounded', () => {
    db.prepare('INSERT INTO service_times (guild_id, user_id, total_time) VALUES (?, ?, ?)').run(guildId, userId, 1000);
    db.prepare('INSERT INTO service_times (guild_id, user_id, total_time) VALUES (?, ?, ?)').run('100000000000000199', userId, 2000);
    const guildExport = JSON.parse(privacy.createGuildDataExport({ id: guildId, name: 'Validation' }).buffer.toString('utf8'));
    assert.equal(guildExport.tables.service_times.length, 1);
    assert.equal(guildExport.tables.service_times[0].guild_id, guildId);
    const retention = privacy.updateRetentionSettings(guildId, staffId, {
        automodDays: 1,
        auditDays: 99999,
        purgeArchiveDays: 90,
        dossierArchiveDays: 730
    });
    assert.equal(retention.automodDays, 30);
    assert.equal(retention.auditDays, 3650);
    const request = privacy.createPrivacyRequest({
        requestType: 'member_delete',
        subjectUserId: userId,
        requestedByUserId: userId
    });
    assert.equal(request.status, 'pending');
    assert.equal(privacy.createPrivacyRequest({
        requestType: 'member_delete',
        subjectUserId: userId,
        requestedByUserId: userId
    }).id, request.id);
});

test('guild retention removes expired rows and only managed archive directories', () => {
    const expiredAt = '2020-01-01T00:00:00.000Z';
    const purgeRoot = path.join(testDirectory, 'purge-archives');
    const dossierRoot = path.join(testDirectory, 'dossier-archives');
    const purgeRelativePath = path.join(guildId, 'purge-old', 'archive.json.gz');
    const dossierRelativePath = path.join(guildId, 'dossier-old', 'archive.json.gz');
    const purgeFile = path.join(purgeRoot, purgeRelativePath);
    const dossierFile = path.join(dossierRoot, dossierRelativePath);
    fs.mkdirSync(path.dirname(purgeFile), { recursive: true });
    fs.mkdirSync(path.dirname(dossierFile), { recursive: true });
    fs.writeFileSync(purgeFile, 'purge');
    fs.writeFileSync(dossierFile, 'dossier');

    db.prepare(`
        INSERT INTO guild_automod_events (guild_id, user_id, rule, action, created_at)
        VALUES (?, ?, 'spam', 'delete', ?)
    `).run(guildId, userId, expiredAt);
    db.prepare(`
        INSERT INTO dashboard_audit_logs (
            guild_id, actor_user_id, action, status, summary, created_at
        ) VALUES (?, ?, 'test', 'success', 'Ancien journal', ?)
    `).run(guildId, staffId, expiredAt);
    const purgeId = Number(db.prepare(`
        INSERT INTO message_purge_archives (
            guild_id, channel_id, channel_name, actor_user_id, mode,
            archive_path, archive_sha256, created_at
        ) VALUES (?, '100000000000000160', 'archives', ?, 'all', ?, 'hash', ?)
    `).run(guildId, staffId, purgeRelativePath, expiredAt).lastInsertRowid);
    const dossierId = Number(db.prepare(`
        INSERT INTO sentinel_dossiers (
            guild_id, channel_id, owner_user_id, opener_user_id, type,
            archive_path, archive_sha256, archived_at, created_at
        ) VALUES (?, '100000000000000161', ?, ?, 'support', ?, 'hash', ?, ?)
    `).run(guildId, userId, userId, dossierRelativePath, expiredAt, expiredAt).lastInsertRowid);

    privacy.updateRetentionSettings(guildId, staffId, {
        automodDays: 30,
        auditDays: 30,
        purgeArchiveDays: 30,
        dossierArchiveDays: 30
    });
    const resolveWithin = root => relativePath => {
        const resolved = path.resolve(root, String(relativePath || ''));
        return resolved.startsWith(`${path.resolve(root)}${path.sep}`) ? resolved : null;
    };
    const summary = privacy.applyGuildDataRetentionPolicies({
        purgeArchiveDirectory: purgeRoot,
        dossierArchiveDirectory: dossierRoot,
        resolveMessagePurgeArchivePath: resolveWithin(purgeRoot),
        resolveDossierArchivePath: resolveWithin(dossierRoot)
    });

    assert.equal(summary.automodEvents, 1);
    assert.equal(summary.auditLogs, 1);
    assert.equal(summary.purgeArchives, 1);
    assert.equal(summary.dossierArchives, 1);
    assert.equal(fs.existsSync(path.dirname(purgeFile)), false);
    assert.equal(fs.existsSync(path.dirname(dossierFile)), false);
    assert.equal(db.prepare('SELECT id FROM message_purge_archives WHERE id = ?').get(purgeId), undefined);
    const dossier = db.prepare('SELECT archive_path, archive_sha256 FROM sentinel_dossiers WHERE id = ?').get(dossierId);
    assert.equal(dossier.archive_path, null);
    assert.equal(dossier.archive_sha256, null);
});

test('repair center detects and safely clears deleted Discord references', async () => {
    db.prepare(`
        INSERT INTO guild_configs (guild_id, role_id, log_channel_id, language)
        VALUES (?, '100000000000000150', '100000000000000151', 'fr')
    `).run(guildId);
    const guild = {
        id: guildId,
        roles: { cache: new Map() },
        channels: { cache: new Map() }
    };
    const scan = await repair.scanGuildConfiguration(guild, staffId);
    assert.equal(scan.issues.length, 2);
    const result = await repair.applySafeGuildRepairs(guild, staffId);
    assert.equal(result.repairs.length, 2);
    assert.equal(result.issues.length, 0);
    const config = db.prepare('SELECT role_id, log_channel_id FROM guild_configs WHERE guild_id = ?').get(guildId);
    assert.equal(config.role_id, null);
    assert.equal(config.log_channel_id, null);
});
