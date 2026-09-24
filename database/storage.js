const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const BACKUP_PATTERN = /^service-.*\.db(?:\.gz)?$/i;
const RAW_BACKUP_PATTERN = /^service-.*\.db$/i;
const TEMP_BACKUP_PATTERN = /^(?:\..*\.(?:tmp|compressing)\.db(?:\.gz)?|service-.*\.db\.gz\.compressing)$/i;

function safeReason(value) {
    return String(value || 'auto')
        .replace(/[^a-z0-9_-]/gi, '-')
        .replace(/-+/g, '-')
        .slice(0, 32) || 'auto';
}

function backupBaseName(reason = 'auto') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `service-${safeReason(reason)}-${stamp}.db`;
}

function fileSize(filePath) {
    try {
        return fs.statSync(filePath).size;
    } catch (error) {
        return 0;
    }
}

function listDatabaseBackups(backupDirectory) {
    if (!fs.existsSync(backupDirectory)) {
        return [];
    }

    return fs.readdirSync(backupDirectory)
        .filter(fileName => BACKUP_PATTERN.test(fileName))
        .map(fileName => {
            const fullPath = path.join(backupDirectory, fileName);
            const stat = fs.statSync(fullPath);

            return {
                fileName,
                fullPath,
                sizeBytes: stat.size,
                compressed: fileName.toLowerCase().endsWith('.gz'),
                createdAt: stat.mtime.toISOString(),
                mtimeMs: stat.mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function isValidGzip(filePath) {
    let descriptor = null;

    try {
        descriptor = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(2);
        const bytesRead = fs.readSync(descriptor, header, 0, 2, 0);
        return bytesRead === 2 && header[0] === 0x1f && header[1] === 0x8b;
    } catch (error) {
        return false;
    } finally {
        if (descriptor !== null) {
            fs.closeSync(descriptor);
        }
    }
}

async function compressFile(sourcePath, destinationPath, compressionLevel = 9) {
    const temporaryPath = `${destinationPath}.compressing`;
    fs.rmSync(temporaryPath, { force: true });

    try {
        await pipeline(
            fs.createReadStream(sourcePath),
            zlib.createGzip({ level: Math.min(Math.max(compressionLevel, 1), 9) }),
            fs.createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 })
        );

        if (!isValidGzip(temporaryPath)) {
            throw new Error('Compressed backup validation failed.');
        }

        fs.renameSync(temporaryPath, destinationPath);
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
}

function cleanupTemporaryBackups(backupDirectory, maxAgeMs = 60 * 60 * 1000) {
    if (!fs.existsSync(backupDirectory)) {
        return 0;
    }

    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const fileName of fs.readdirSync(backupDirectory)) {
        if (!TEMP_BACKUP_PATTERN.test(fileName)) {
            continue;
        }

        const fullPath = path.join(backupDirectory, fileName);
        const stat = fs.statSync(fullPath);

        if (stat.mtimeMs < cutoff) {
            fs.rmSync(fullPath, { force: true });
            removed += 1;
        }
    }

    return removed;
}

async function compressExistingDatabaseBackups(backupDirectory, compressionLevel = 9) {
    if (!fs.existsSync(backupDirectory)) {
        return { compressedCount: 0, reclaimedBytes: 0 };
    }

    cleanupTemporaryBackups(backupDirectory);
    let compressedCount = 0;
    let reclaimedBytes = 0;

    const rawBackups = fs.readdirSync(backupDirectory)
        .filter(fileName => RAW_BACKUP_PATTERN.test(fileName));

    for (const fileName of rawBackups) {
        const sourcePath = path.join(backupDirectory, fileName);
        const destinationPath = `${sourcePath}.gz`;
        const sourceStat = fs.statSync(sourcePath);
        const sourceBytes = sourceStat.size;

        if (fs.existsSync(destinationPath) && isValidGzip(destinationPath)) {
            fs.utimesSync(destinationPath, sourceStat.atime, sourceStat.mtime);
            fs.rmSync(sourcePath, { force: true });
            compressedCount += 1;
            reclaimedBytes += Math.max(0, sourceBytes - fileSize(destinationPath));
            continue;
        }

        fs.rmSync(destinationPath, { force: true });
        await compressFile(sourcePath, destinationPath, compressionLevel);
        fs.utimesSync(destinationPath, sourceStat.atime, sourceStat.mtime);
        const destinationBytes = fileSize(destinationPath);
        fs.rmSync(sourcePath, { force: true });
        compressedCount += 1;
        reclaimedBytes += Math.max(0, sourceBytes - destinationBytes);
    }

    return { compressedCount, reclaimedBytes };
}

function pruneDatabaseBackups(backupDirectory, { keep = 14, maxBytes = 96 * 1024 * 1024 } = {}) {
    const safeKeep = Math.max(Number(keep) || 14, 1);
    const safeMaxBytes = Math.max(Number(maxBytes) || (96 * 1024 * 1024), 1024 * 1024);
    const backups = listDatabaseBackups(backupDirectory);
    let keptCount = 0;
    let keptBytes = 0;
    let removedCount = 0;
    let removedBytes = 0;

    for (const backup of backups) {
        const fitsCount = keptCount < safeKeep;
        const fitsSpace = keptCount === 0 || keptBytes + backup.sizeBytes <= safeMaxBytes;

        if (fitsCount && fitsSpace) {
            keptCount += 1;
            keptBytes += backup.sizeBytes;
            continue;
        }

        fs.rmSync(backup.fullPath, { force: true });
        removedCount += 1;
        removedBytes += backup.sizeBytes;
    }

    return { keptCount, keptBytes, removedCount, removedBytes };
}

async function createCompressedDatabaseBackup(db, {
    backupDirectory,
    reason = 'auto',
    compress = true,
    compressionLevel = 9
}) {
    fs.mkdirSync(backupDirectory, { recursive: true });

    const baseName = backupBaseName(reason);
    const rawPath = path.join(backupDirectory, baseName);

    if (!compress) {
        await db.backup(rawPath);
        return {
            fullPath: rawPath,
            fileName: path.basename(rawPath),
            compressed: false,
            sizeBytes: fileSize(rawPath)
        };
    }

    const temporaryRawPath = path.join(
        backupDirectory,
        `.${baseName}.${process.pid}.${Date.now()}.tmp.db`
    );
    const compressedPath = `${rawPath}.gz`;

    try {
        await db.backup(temporaryRawPath);
        await compressFile(temporaryRawPath, compressedPath, compressionLevel);
    } finally {
        fs.rmSync(temporaryRawPath, { force: true });
    }

    return {
        fullPath: compressedPath,
        fileName: path.basename(compressedPath),
        compressed: true,
        sizeBytes: fileSize(compressedPath)
    };
}

function getDatabaseFileStats(databasePath) {
    const files = [
        { type: 'database', path: databasePath },
        { type: 'wal', path: `${databasePath}-wal` },
        { type: 'sharedMemory', path: `${databasePath}-shm` }
    ].map(item => ({
        type: item.type,
        sizeBytes: fileSize(item.path)
    }));

    return {
        files,
        totalBytes: files.reduce((total, item) => total + item.sizeBytes, 0)
    };
}

function getSqliteStats(db) {
    const pageSize = Number(db.pragma('page_size', { simple: true })) || 0;
    const pageCount = Number(db.pragma('page_count', { simple: true })) || 0;
    const freePages = Number(db.pragma('freelist_count', { simple: true })) || 0;

    return {
        pageSize,
        pageCount,
        freePages,
        usedBytes: Math.max(0, pageCount - freePages) * pageSize,
        reclaimableBytes: freePages * pageSize,
        journalMode: db.pragma('journal_mode', { simple: true }),
        autoVacuum: Number(db.pragma('auto_vacuum', { simple: true })) || 0
    };
}

function runDatabaseMaintenance(db, {
    automodRetentionDays = 180,
    auditRetentionDays = 365,
    incrementalVacuumPages = 2000,
    enableIncrementalVacuum = true
} = {}) {
    const startedAt = Date.now();
    const now = new Date();
    const automodCutoff = new Date(now.getTime() - Math.max(automodRetentionDays, 1) * 86400000).toISOString();
    const auditCutoff = new Date(now.getTime() - Math.max(auditRetentionDays, 1) * 86400000).toISOString();
    const nowMs = now.getTime();

    const cleanup = db.transaction(() => ({
        expiredSessions: db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(nowMs).changes,
        automodEvents: db.prepare('DELETE FROM guild_automod_events WHERE created_at < ?').run(automodCutoff).changes,
        dashboardAuditLogs: db.prepare('DELETE FROM dashboard_audit_logs WHERE created_at < ?').run(auditCutoff).changes
    }))();

    let convertedToIncrementalVacuum = false;
    let autoVacuum = Number(db.pragma('auto_vacuum', { simple: true })) || 0;

    if (enableIncrementalVacuum && autoVacuum === 0) {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.pragma('auto_vacuum = INCREMENTAL');
        db.exec('VACUUM');
        autoVacuum = Number(db.pragma('auto_vacuum', { simple: true })) || 0;
        convertedToIncrementalVacuum = autoVacuum === 2;
    } else if (enableIncrementalVacuum && autoVacuum === 2) {
        db.pragma(`incremental_vacuum(${Math.max(Number(incrementalVacuumPages) || 2000, 1)})`);
    }

    db.pragma('optimize');
    const checkpoint = db.pragma('wal_checkpoint(PASSIVE)')[0] || null;

    return {
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        cleanup,
        convertedToIncrementalVacuum,
        checkpoint,
        sqlite: getSqliteStats(db)
    };
}

function getDatabaseStorageStatus(db, {
    databasePath,
    backupDirectory,
    backupKeep = 14,
    backupMaxBytes = 96 * 1024 * 1024,
    automodRetentionDays = 180,
    auditRetentionDays = 365,
    lastBackup = null,
    lastMaintenance = null,
    backupEnabled = true,
    backupIntervalHours = 24
}) {
    const backups = listDatabaseBackups(backupDirectory);
    const database = getDatabaseFileStats(databasePath);
    const backupBytes = backups.reduce((total, item) => total + item.sizeBytes, 0);
    const latest = backups[0] || null;

    return {
        enabled: backupEnabled,
        databaseBytes: database.totalBytes,
        databaseFiles: database.files,
        sqlite: getSqliteStats(db),
        backupBytes,
        managedBytes: database.totalBytes + backupBytes,
        count: backups.length,
        compressedCount: backups.filter(item => item.compressed).length,
        keep: backupKeep,
        maxBackupBytes: backupMaxBytes,
        intervalHours: backupIntervalHours,
        latestAt: lastBackup?.createdAt || latest?.createdAt || null,
        latestFile: lastBackup?.fileName || latest?.fileName || null,
        latestReason: lastBackup?.reason || null,
        lastMaintenance,
        retention: {
            automodDays: automodRetentionDays,
            auditDays: auditRetentionDays,
            businessArchives: 'unlimited'
        }
    };
}

module.exports = {
    compressExistingDatabaseBackups,
    createCompressedDatabaseBackup,
    getDatabaseStorageStatus,
    listDatabaseBackups,
    pruneDatabaseBackups,
    runDatabaseMaintenance
};
