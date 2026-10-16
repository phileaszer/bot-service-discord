'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function fileSha256(filePath) {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    for await (const chunk of stream) {
        hash.update(chunk);
    }

    return hash.digest('hex');
}

function backupObjectKey(filePath, checkedAt = new Date()) {
    const date = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
    const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
    return [
        String(safeDate.getUTCFullYear()),
        String(safeDate.getUTCMonth() + 1).padStart(2, '0'),
        path.basename(filePath)
    ].join('/');
}

async function uploadVerifiedBackup(storage, filePath, verification, reason = 'auto') {
    if (!storage?.enabled) {
        return { skipped: true, reason: 'offsite_backup_disabled' };
    }
    if (!storage.configured) {
        throw new Error(`Sauvegarde externe incomplete : ${(storage.missing || []).join(', ')}.`);
    }
    if (!verification || verification.status !== 'ok') {
        throw new Error('Une sauvegarde non verifiee ne peut pas etre envoyee hors site.');
    }

    const stat = fs.statSync(filePath);
    const sha256 = await fileSha256(filePath);
    const key = backupObjectKey(filePath, verification.checkedAt || new Date());
    const result = await storage.putIfAbsent({
        key,
        body: fs.createReadStream(filePath),
        contentLength: stat.size,
        sha256,
        metadata: {
            reason,
            checkedAt: verification.checkedAt || new Date().toISOString(),
            integrity: verification.status
        }
    });

    return {
        skipped: false,
        uploaded: Boolean(result.created),
        key: result.key,
        size: stat.size,
        sha256,
        completedAt: new Date().toISOString()
    };
}

module.exports = { backupObjectKey, fileSha256, uploadVerifiedBackup };
