'use strict';

const crypto = require('crypto');
const db = require('./database/database');

const SECRET_PREFIX = 'enc:v1:';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CRITICAL_ACTION_TTL_MS = 24 * 60 * 60 * 1000;

function encryptionKey() {
    const secret = process.env.DASHBOARD_SESSION_SECRET
        || process.env.CLIENT_SECRET
        || process.env.TOKEN
        || '';
    if (String(secret).length < 24) {
        throw new Error('La clé de chiffrement du dashboard doit contenir au moins 24 caractères.');
    }
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptSecret(value) {
    const key = encryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return `${SECRET_PREFIX}${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
    if (!value || !String(value).startsWith(SECRET_PREFIX)) {
        throw new Error('Secret de sécurité invalide ou non chiffré.');
    }
    const [ivValue, tagValue, encryptedValue] = String(value).slice(SECRET_PREFIX.length).split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('Secret de sécurité corrompu.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

function base32Encode(buffer) {
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
        output += BASE32_ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
    }
    return output;
}

function base32Decode(value) {
    const normalized = String(value || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
    if (!normalized || /[^A-Z2-7]/.test(normalized)) throw new Error('Secret TOTP invalide.');
    let bits = '';
    for (const character of normalized) bits += BASE32_ALPHABET.indexOf(character).toString(2).padStart(5, '0');
    const bytes = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
        bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
}

function totpCode(secret, counter) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return String(value).padStart(6, '0');
}

function currentCounter(at = Date.now()) {
    return Math.floor(Number(at) / 30000);
}

function safeEqual(leftValue, rightValue) {
    const left = Buffer.from(String(leftValue || ''), 'utf8');
    const right = Buffer.from(String(rightValue || ''), 'utf8');
    return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function matchingTotpCounter(secret, code, lastCounter = null, at = Date.now()) {
    const normalized = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) return null;
    const counter = currentCounter(at);
    for (const candidate of [counter - 1, counter, counter + 1]) {
        if ((lastCounter === null || candidate > Number(lastCounter)) && safeEqual(totpCode(secret, candidate), normalized)) {
            return candidate;
        }
    }
    return null;
}

function recoveryCodeHash(code) {
    const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return crypto.createHmac('sha256', encryptionKey()).update(normalized).digest('hex');
}

function parseJsonArray(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (error) {
        return [];
    }
}

function getFounderMfaStatus(userId) {
    const row = db.prepare('SELECT * FROM founder_mfa WHERE user_id = ?').get(String(userId));
    return {
        enabled: Boolean(row?.enabled),
        setupPending: Boolean(row?.pending_secret_encrypted),
        enabledAt: row?.enabled_at || null,
        recoveryCodesRemaining: parseJsonArray(row?.recovery_code_hashes_json).length
    };
}

function beginFounderMfaSetup(userId, accountLabel = null) {
    const secret = base32Encode(crypto.randomBytes(20));
    const recoveryCodes = Array.from({ length: 8 }, () => {
        const value = crypto.randomBytes(8).toString('hex').toUpperCase();
        return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`;
    });
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO founder_mfa (
            user_id, pending_secret_encrypted, recovery_code_hashes_json,
            enabled, created_at, updated_at
        ) VALUES (?, ?, ?, 0, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            pending_secret_encrypted = excluded.pending_secret_encrypted,
            recovery_code_hashes_json = excluded.recovery_code_hashes_json,
            updated_at = excluded.updated_at
    `).run(
        String(userId),
        encryptSecret(secret),
        JSON.stringify(recoveryCodes.map(recoveryCodeHash)),
        now,
        now
    );
    const label = String(accountLabel || userId).slice(0, 80);
    const otpauthUri = `otpauth://totp/${encodeURIComponent(`Sentinel:${label}`)}?secret=${secret}&issuer=Sentinel&algorithm=SHA1&digits=6&period=30`;
    return { secret, recoveryCodes, otpauthUri };
}

function enableFounderMfa(userId, code, at = Date.now()) {
    const row = db.prepare('SELECT * FROM founder_mfa WHERE user_id = ?').get(String(userId));
    if (!row?.pending_secret_encrypted) throw new Error('Commence d’abord la configuration du code à usage unique.');
    const secret = decryptSecret(row.pending_secret_encrypted);
    const counter = matchingTotpCounter(secret, code, null, at);
    if (counter === null) throw new Error('Code de vérification invalide.');
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE founder_mfa
        SET secret_encrypted = pending_secret_encrypted, pending_secret_encrypted = NULL,
            enabled = 1, last_counter = ?, enabled_at = ?, updated_at = ?
        WHERE user_id = ?
    `).run(counter, now, now, String(userId));
    return getFounderMfaStatus(userId);
}

function verifyFounderMfa(userId, code, at = Date.now()) {
    const transaction = db.transaction(() => {
        const row = db.prepare('SELECT * FROM founder_mfa WHERE user_id = ? AND enabled = 1').get(String(userId));
        if (!row?.secret_encrypted) throw new Error('La double sécurité fondatrice doit être activée.');
        const normalized = String(code || '').trim();
        const secret = decryptSecret(row.secret_encrypted);
        const counter = matchingTotpCounter(secret, normalized, row.last_counter, at);
        const now = new Date().toISOString();
        if (counter !== null) {
            const changed = db.prepare(`
                UPDATE founder_mfa
                SET last_counter = ?, updated_at = ?
                WHERE user_id = ? AND enabled = 1
                  AND (last_counter IS NULL OR last_counter < ?)
            `).run(counter, now, String(userId), counter).changes;
            if (!changed) throw new Error('Code de sécurité invalide ou déjà utilisé.');
            return { method: 'totp', recoveryCodesRemaining: parseJsonArray(row.recovery_code_hashes_json).length };
        }
        const hashes = parseJsonArray(row.recovery_code_hashes_json);
        const recoveryHash = recoveryCodeHash(normalized);
        const recoveryIndex = hashes.findIndex(hash => safeEqual(hash, recoveryHash));
        if (recoveryIndex < 0) throw new Error('Code de sécurité invalide ou déjà utilisé.');
        hashes.splice(recoveryIndex, 1);
        const changed = db.prepare(`
            UPDATE founder_mfa
            SET recovery_code_hashes_json = ?, updated_at = ?
            WHERE user_id = ? AND enabled = 1 AND recovery_code_hashes_json = ?
        `).run(JSON.stringify(hashes), now, String(userId), row.recovery_code_hashes_json).changes;
        if (!changed) throw new Error('Code de sécurité invalide ou déjà utilisé.');
        return { method: 'recovery', recoveryCodesRemaining: hashes.length };
    });
    return transaction();
}

function disableFounderMfa(userId, code) {
    verifyFounderMfa(userId, code);
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE founder_mfa
        SET secret_encrypted = NULL, pending_secret_encrypted = NULL,
            recovery_code_hashes_json = '[]', enabled = 0, last_counter = NULL,
            enabled_at = NULL, updated_at = ?
        WHERE user_id = ?
    `).run(now, String(userId));
    return getFounderMfaStatus(userId);
}

function mapCriticalAction(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch (error) { payload = {}; }
    return {
        id: row.id,
        scope: row.scope,
        guildId: row.guild_id || null,
        actionType: row.action_type,
        payload,
        summary: row.summary,
        status: row.status,
        requestedByUserId: row.requested_by_user_id,
        approvedByUserId: row.approved_by_user_id || null,
        rejectedByUserId: row.rejected_by_user_id || null,
        decisionReason: row.decision_reason || null,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        decidedAt: row.decided_at || null,
        executedAt: row.executed_at || null,
        errorMessage: row.error_message || null
    };
}

function expireCriticalActions() {
    const now = new Date().toISOString();
    const staleExecution = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    db.prepare(`
        UPDATE critical_action_requests
        SET status = 'expired', updated_at = ?
        WHERE status = 'pending' AND expires_at <= ?
    `).run(now, now);
    db.prepare(`
        UPDATE critical_action_requests
        SET status = 'failed', error_message = 'Exécution interrompue avant confirmation finale.',
            executed_at = ?, updated_at = ?
        WHERE status = 'executing' AND decided_at <= ?
    `).run(now, now, staleExecution);
}

function createCriticalAction({ scope, guildId = null, actionType, payload = {}, summary, requestedByUserId, ttlMs = CRITICAL_ACTION_TTL_MS }) {
    if (!['global', 'guild'].includes(scope)) throw new Error('Portée de validation invalide.');
    if (scope === 'guild' && !/^\d{17,20}$/.test(String(guildId || ''))) throw new Error('Serveur de validation invalide.');
    if (!/^[a-z0-9_-]{2,64}$/i.test(String(actionType || ''))) throw new Error('Action critique invalide.');
    if (!/^\d{17,20}$/.test(String(requestedByUserId || ''))) throw new Error('Demandeur invalide.');
    const payloadJson = JSON.stringify(payload || {});
    if (Buffer.byteLength(payloadJson, 'utf8') > 32768) throw new Error('Données de validation trop volumineuses.');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(ttlMs) || CRITICAL_ACTION_TTL_MS, 5 * 60 * 1000), 72 * 60 * 60 * 1000)).toISOString();
    const result = db.prepare(`
        INSERT INTO critical_action_requests (
            scope, guild_id, action_type, payload_json, summary, status,
            requested_by_user_id, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(scope, guildId, actionType, payloadJson, String(summary || actionType).slice(0, 500), String(requestedByUserId), expiresAt, now, now);
    return getCriticalAction(Number(result.lastInsertRowid));
}

function getCriticalAction(id) {
    const row = db.prepare('SELECT * FROM critical_action_requests WHERE id = ?').get(Number(id));
    return row ? mapCriticalAction(row) : null;
}

function listCriticalActions({ scope = null, guildId = null, limit = 50 } = {}) {
    expireCriticalActions();
    const where = [];
    const values = [];
    if (scope) { where.push('scope = ?'); values.push(scope); }
    if (guildId) { where.push('guild_id = ?'); values.push(String(guildId)); }
    values.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
    return db.prepare(`
        SELECT * FROM critical_action_requests
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'executing' THEN 1 ELSE 2 END,
                 id DESC LIMIT ?
    `).all(...values).map(mapCriticalAction);
}

function beginCriticalActionDecision(id, actorUserId) {
    expireCriticalActions();
    const transaction = db.transaction(() => {
        const row = db.prepare('SELECT * FROM critical_action_requests WHERE id = ?').get(Number(id));
        if (!row || row.status !== 'pending') throw new Error('Demande critique introuvable ou déjà traitée.');
        if (String(row.requested_by_user_id) === String(actorUserId)) throw new Error('Une autre personne autorisée doit valider cette action.');
        const now = new Date().toISOString();
        const changed = db.prepare(`
            UPDATE critical_action_requests
            SET status = 'executing', approved_by_user_id = ?, decided_at = ?, updated_at = ?
            WHERE id = ? AND status = 'pending'
        `).run(String(actorUserId), now, now, Number(id)).changes;
        if (!changed) throw new Error('Cette demande vient d’être traitée par une autre personne.');
        return getCriticalAction(id);
    });
    return transaction();
}

function rejectCriticalAction(id, actorUserId, reason = null) {
    expireCriticalActions();
    const transaction = db.transaction(() => {
        const row = getCriticalAction(id);
        if (!row || row.status !== 'pending') throw new Error('Demande critique introuvable ou déjà traitée.');
        if (String(row.requestedByUserId) === String(actorUserId)) throw new Error('Une autre personne autorisée doit refuser cette action.');
        const now = new Date().toISOString();
        const changed = db.prepare(`
            UPDATE critical_action_requests
            SET status = 'rejected', rejected_by_user_id = ?, decision_reason = ?, decided_at = ?, updated_at = ?
            WHERE id = ? AND status = 'pending'
        `).run(String(actorUserId), String(reason || '').slice(0, 500) || null, now, now, Number(id)).changes;
        if (!changed) throw new Error('Cette demande vient d’être traitée par une autre personne.');
        return getCriticalAction(id);
    });
    return transaction();
}

function completeCriticalAction(id, error = null) {
    const now = new Date().toISOString();
    db.prepare(`
        UPDATE critical_action_requests
        SET status = ?, executed_at = ?, error_message = ?, updated_at = ?
        WHERE id = ? AND status = 'executing'
    `).run(error ? 'failed' : 'executed', now, error ? String(error).slice(0, 500) : null, now, Number(id));
    return getCriticalAction(id);
}

module.exports = {
    beginCriticalActionDecision,
    beginFounderMfaSetup,
    completeCriticalAction,
    createCriticalAction,
    disableFounderMfa,
    enableFounderMfa,
    getCriticalAction,
    getFounderMfaStatus,
    listCriticalActions,
    matchingTotpCounter,
    rejectCriticalAction,
    totpCode,
    verifyFounderMfa
};
