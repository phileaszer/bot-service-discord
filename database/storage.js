const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Database = require('better-sqlite3');
const { pipeline } = require('stream/promises');

const BACKUP_PATTERN = /^service-.*\.db(?:\.gz)?$/i;
const RAW_BACKUP_PATTERN = /^service-.*\.db$/i;
const COLD_ARCHIVE_PATTERN = /^(?:guild_automod_events|dashboard_audit_logs)-\d+-\d+-\d+\.jsonl\.gz$/i;
const TEMP_BACKUP_PATTERN = /^(?:\..*\.(?:tmp|compressing)\.db(?:\.gz)?|service-.*\.db\.gz\.compressing)$/i;
const COLD_ARCHIVE_TABLES = Object.freeze({
    guild_automod_events: 'created_at',
    dashboard_audit_logs: 'created_at'
});

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

function directorySize(directory) {
    if (!directory || !fs.existsSync(directory)) {
        return 0;
    }

    let total = 0;
    const pending = [directory];

    while (pending.length) {
        const current = pending.pop();

        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);

            if (entry.isDirectory()) {
                pending.push(fullPath);
            } else if (entry.isFile()) {
                total += fileSize(fullPath);
            }
        }
    }

    return total;
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

function listColdArchives(db, archiveDirectory, limit = 50) {
    if (!fs.existsSync(archiveDirectory)) {
        return [];
    }

    const safeLimit = Math.max(Math.min(Number(limit) || 50, 200), 1);
    const manifests = new Map(db.prepare(`
        SELECT file_name, table_name, min_row_id, max_row_id, row_count, size_bytes,
               from_at, to_at, created_at, verified_at
        FROM cold_archive_manifests
        ORDER BY datetime(created_at) DESC
        LIMIT ?
    `).all(safeLimit).map(row => [row.file_name, row]));

    return fs.readdirSync(archiveDirectory)
        .filter(fileName => COLD_ARCHIVE_PATTERN.test(fileName))
        .map(fileName => {
            const fullPath = path.join(archiveDirectory, fileName);
            const stat = fs.statSync(fullPath);
            const manifest = manifests.get(fileName) || {};

            return {
                fileName,
                table: manifest.table_name || fileName.split('-')[0],
                rowCount: manifest.row_count || 0,
                sizeBytes: stat.size,
                fromAt: manifest.from_at || null,
                toAt: manifest.to_at || null,
                createdAt: manifest.created_at || stat.mtime.toISOString(),
                verifiedAt: manifest.verified_at || null
            };
        })
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, safeLimit);
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

function isoWeekKey(date) {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function backupGenerationSelection(backups, { daily = 7, weekly = 8, monthly = 12 } = {}) {
    const selected = new Map();
    const buckets = [
        ['daily', Math.max(Number(daily) || 7, 1), date => date.toISOString().slice(0, 10)],
        ['weekly', Math.max(Number(weekly) || 8, 1), isoWeekKey],
        ['monthly', Math.max(Number(monthly) || 12, 1), date => date.toISOString().slice(0, 7)]
    ];

    for (const [label, limit, keyForDate] of buckets) {
        const seen = new Set();

        for (const backup of backups) {
            const key = keyForDate(new Date(backup.mtimeMs));

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            if (seen.size > limit) {
                break;
            }

            if (!selected.has(backup.fileName)) {
                selected.set(backup.fileName, new Set());
            }

            selected.get(backup.fileName).add(label);
        }
    }

    if (backups[0] && !selected.has(backups[0].fileName)) {
        selected.set(backups[0].fileName, new Set(['latest']));
    }

    return selected;
}

function pruneDatabaseBackupGenerations(backupDirectory, {
    daily = 7,
    weekly = 8,
    monthly = 12,
    maxBytes = 96 * 1024 * 1024
} = {}) {
    const safeMaxBytes = Math.max(Number(maxBytes) || (96 * 1024 * 1024), 1024 * 1024);
    const backups = listDatabaseBackups(backupDirectory);
    const selected = backupGenerationSelection(backups, { daily, weekly, monthly });
    let keptBytes = 0;
    let removedBytes = 0;
    let removedCount = 0;
    const kept = [];

    for (const backup of backups) {
        const generations = selected.get(backup.fileName);
        const fitsSpace = kept.length === 0 || keptBytes + backup.sizeBytes <= safeMaxBytes;

        if (generations && fitsSpace) {
            keptBytes += backup.sizeBytes;
            kept.push({ ...backup, generations: [...generations] });
            continue;
        }

        fs.rmSync(backup.fullPath, { force: true });
        removedBytes += backup.sizeBytes;
        removedCount += 1;
    }

    return { keptCount: kept.length, keptBytes, removedCount, removedBytes, kept };
}

function pruneDatabaseBackups(backupDirectory, { keep = 14, maxBytes = 96 * 1024 * 1024 } = {}) {
    return pruneDatabaseBackupGenerations(backupDirectory, {
        daily: Math.max(Number(keep) || 14, 1),
        weekly: 1,
        monthly: 1,
        maxBytes
    });
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
        return { fullPath: rawPath, fileName: path.basename(rawPath), compressed: false, sizeBytes: fileSize(rawPath) };
    }

    const temporaryRawPath = path.join(backupDirectory, `.${baseName}.${process.pid}.${Date.now()}.tmp.db`);
    const compressedPath = `${rawPath}.gz`;

    try {
        await db.backup(temporaryRawPath);
        await compressFile(temporaryRawPath, compressedPath, compressionLevel);
    } finally {
        fs.rmSync(temporaryRawPath, { force: true });
    }

    return { fullPath: compressedPath, fileName: path.basename(compressedPath), compressed: true, sizeBytes: fileSize(compressedPath) };
}

async function materializeBackup(backupPath, targetPath) {
    fs.rmSync(targetPath, { force: true });

    if (backupPath.toLowerCase().endsWith('.gz')) {
        await pipeline(
            fs.createReadStream(backupPath),
            zlib.createGunzip(),
            fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 })
        );
    } else {
        fs.copyFileSync(backupPath, targetPath, fs.constants.COPYFILE_EXCL);
    }
}

async function verifyDatabaseBackup(backupPath, { workDirectory = path.dirname(backupPath) } = {}) {
    const startedAt = Date.now();
    const fileName = path.basename(backupPath);
    const temporaryPath = path.join(workDirectory, `.${fileName}.${process.pid}.${Date.now()}.verify.db`);
    let integrityResult = null;
    let verificationDb = null;

    try {
        await materializeBackup(backupPath, temporaryPath);
        verificationDb = new Database(temporaryPath, { readonly: true, fileMustExist: true });
        integrityResult = verificationDb.pragma('integrity_check', { simple: true });

        if (String(integrityResult).toLowerCase() !== 'ok') {
            throw new Error(`SQLite integrity check returned: ${integrityResult}`);
        }

        return {
            fileName,
            fullPath: backupPath,
            status: 'ok',
            integrityResult: String(integrityResult),
            sizeBytes: fileSize(backupPath),
            checkedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            errorMessage: null
        };
    } catch (error) {
        return {
            fileName,
            fullPath: backupPath,
            status: 'failed',
            integrityResult: integrityResult ? String(integrityResult) : null,
            sizeBytes: fileSize(backupPath),
            checkedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            errorMessage: String(error.message || error).slice(0, 500)
        };
    } finally {
        verificationDb?.close();
        fs.rmSync(temporaryPath, { force: true });
    }
}

function saveBackupVerification(db, check) {
    db.prepare(`
        INSERT INTO storage_backup_checks (
            file_name, checked_at, status, integrity_result, size_bytes, duration_ms, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_name) DO UPDATE SET
            checked_at = excluded.checked_at,
            status = excluded.status,
            integrity_result = excluded.integrity_result,
            size_bytes = excluded.size_bytes,
            duration_ms = excluded.duration_ms,
            error_message = excluded.error_message
    `).run(
        check.fileName,
        check.checkedAt,
        check.status,
        check.integrityResult,
        check.sizeBytes,
        check.durationMs,
        check.errorMessage
    );
}

async function stageDatabaseRestore(backupPath, databasePath) {
    const verification = await verifyDatabaseBackup(backupPath);

    if (verification.status !== 'ok') {
        throw new Error(verification.errorMessage || 'Backup integrity check failed.');
    }

    const pendingPath = `${databasePath}.restore-pending`;
    const temporaryPath = `${pendingPath}.${process.pid}.${Date.now()}.tmp`;
    const markerPath = `${databasePath}.restore-pending.json`;

    if (fs.existsSync(pendingPath) || fs.existsSync(markerPath)) {
        throw new Error('A database restoration is already pending.');
    }

    try {
        await materializeBackup(backupPath, temporaryPath);
        fs.renameSync(temporaryPath, pendingPath);
        fs.writeFileSync(markerPath, JSON.stringify({
            backupFile: path.basename(backupPath),
            stagedAt: new Date().toISOString(),
            sizeBytes: fileSize(pendingPath)
        }), { flag: 'wx', mode: 0o600 });
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }

    return { pendingPath, markerPath, backupFile: path.basename(backupPath), verification };
}

function validateSqliteFile(filePath) {
    let validationDb = null;

    try {
        validationDb = new Database(filePath, { readonly: true, fileMustExist: true });
        return String(validationDb.pragma('integrity_check', { simple: true })).toLowerCase() === 'ok';
    } catch (error) {
        return false;
    } finally {
        validationDb?.close();
    }
}

function applyPendingDatabaseRestore(databasePath) {
    const pendingPath = `${databasePath}.restore-pending`;
    const markerPath = `${databasePath}.restore-pending.json`;

    if (!fs.existsSync(pendingPath)) {
        fs.rmSync(markerPath, { force: true });
        return null;
    }

    if (!validateSqliteFile(pendingPath)) {
        fs.rmSync(pendingPath, { force: true });
        fs.rmSync(markerPath, { force: true });
        throw new Error('Pending database restoration failed integrity validation.');
    }

    const replacedPath = `${databasePath}.restore-replaced`;
    let currentDb = null;

    try {
        if (fs.existsSync(databasePath)) {
            currentDb = new Database(databasePath, { fileMustExist: true });
            currentDb.pragma('wal_checkpoint(TRUNCATE)');
            currentDb.close();
            currentDb = null;
            fs.rmSync(replacedPath, { force: true });
            fs.renameSync(databasePath, replacedPath);
        }

        fs.rmSync(`${databasePath}-wal`, { force: true });
        fs.rmSync(`${databasePath}-shm`, { force: true });
        fs.renameSync(pendingPath, databasePath);

        if (!validateSqliteFile(databasePath)) {
            throw new Error('Restored database failed final integrity validation.');
        }

        fs.rmSync(replacedPath, { force: true });
        fs.rmSync(markerPath, { force: true });
        return { restored: true, restoredAt: new Date().toISOString() };
    } catch (error) {
        currentDb?.close();

        if (fs.existsSync(replacedPath)) {
            fs.rmSync(databasePath, { force: true });
            fs.renameSync(replacedPath, databasePath);
        }

        throw error;
    }
}

function getDatabaseFileStats(databasePath) {
    const files = [
        { type: 'database', path: databasePath },
        { type: 'wal', path: `${databasePath}-wal` },
        { type: 'sharedMemory', path: `${databasePath}-shm` }
    ].map(item => ({ type: item.type, sizeBytes: fileSize(item.path) }));

    return { files, totalBytes: files.reduce((total, item) => total + item.sizeBytes, 0) };
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

function coldArchiveFileName(tableName, minId, maxId, rowCount) {
    return `${tableName}-${minId}-${maxId}-${rowCount}.jsonl.gz`;
}

function validateColdArchiveBuffer(buffer, expectedRows) {
    try {
        const content = zlib.gunzipSync(buffer).toString('utf8');
        const lines = content.trim() ? content.trim().split('\n') : [];
        return lines.length === expectedRows && lines.every(line => {
            JSON.parse(line);
            return true;
        });
    } catch (error) {
        return false;
    }
}

function archiveColdTable(db, archiveDirectory, tableName, cutoff, maxRows = 5000) {
    const dateColumn = COLD_ARCHIVE_TABLES[tableName];

    if (!dateColumn) {
        throw new Error('Cold archive table is not allowed.');
    }

    const rows = db.prepare(`
        SELECT * FROM ${tableName}
        WHERE ${dateColumn} < ?
        ORDER BY id ASC
        LIMIT ?
    `).all(cutoff, Math.max(Math.min(Number(maxRows) || 5000, 10000), 1));

    if (!rows.length) {
        return { archivedRows: 0, sizeBytes: 0, fileName: null };
    }

    fs.mkdirSync(archiveDirectory, { recursive: true });
    const ids = rows.map(row => Number(row.id));
    const minId = Math.min(...ids);
    const maxId = Math.max(...ids);
    const fileName = coldArchiveFileName(tableName, minId, maxId, rows.length);
    const fullPath = path.join(archiveDirectory, fileName);
    const temporaryPath = `${fullPath}.${process.pid}.tmp`;
    const content = `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
    const compressed = zlib.gzipSync(Buffer.from(content), { level: 9 });

    if (!validateColdArchiveBuffer(compressed, rows.length)) {
        throw new Error('Cold archive validation failed.');
    }

    if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(temporaryPath, compressed, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporaryPath, fullPath);
    } else if (!validateColdArchiveBuffer(fs.readFileSync(fullPath), rows.length)) {
        throw new Error('Existing cold archive failed validation.');
    }

    const now = new Date().toISOString();
    const fromAt = rows[0]?.[dateColumn] || null;
    const toAt = rows[rows.length - 1]?.[dateColumn] || null;
    const removeRows = db.transaction(() => {
        db.prepare(`
            INSERT INTO cold_archive_manifests (
                file_name, table_name, min_row_id, max_row_id, row_count, size_bytes,
                from_at, to_at, created_at, verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(file_name) DO UPDATE SET
                row_count = excluded.row_count,
                size_bytes = excluded.size_bytes,
                verified_at = excluded.verified_at
        `).run(fileName, tableName, minId, maxId, rows.length, fileSize(fullPath), fromAt, toAt, now, now);

        return db.prepare(`
            DELETE FROM ${tableName}
            WHERE id BETWEEN ? AND ? AND ${dateColumn} < ?
        `).run(minId, maxId, cutoff).changes;
    })();

    fs.rmSync(temporaryPath, { force: true });
    return { archivedRows: removeRows, sizeBytes: fileSize(fullPath), fileName };
}

function archiveExpiredTechnicalRows(db, archiveDirectory, {
    automodRetentionDays = 180,
    auditRetentionDays = 365,
    maxChunksPerTable = 4
} = {}) {
    const now = Date.now();
    const definitions = [
        ['guild_automod_events', new Date(now - Math.max(automodRetentionDays, 1) * 86400000).toISOString()],
        ['dashboard_audit_logs', new Date(now - Math.max(auditRetentionDays, 1) * 86400000).toISOString()]
    ];
    const result = { automodEvents: 0, dashboardAuditLogs: 0, files: [], bytes: 0 };

    for (const [tableName, cutoff] of definitions) {
        for (let chunk = 0; chunk < Math.max(Number(maxChunksPerTable) || 1, 1); chunk += 1) {
            const archived = archiveColdTable(db, archiveDirectory, tableName, cutoff);

            if (!archived.archivedRows) {
                break;
            }

            if (tableName === 'guild_automod_events') {
                result.automodEvents += archived.archivedRows;
            } else {
                result.dashboardAuditLogs += archived.archivedRows;
            }

            result.bytes += archived.sizeBytes;
            result.files.push(archived.fileName);
        }
    }

    return result;
}

function runDatabaseMaintenance(db, {
    automodRetentionDays = 180,
    auditRetentionDays = 365,
    archiveDirectory = null,
    incrementalVacuumPages = 2000,
    enableIncrementalVacuum = true
} = {}) {
    const startedAt = Date.now();
    const nowMs = Date.now();
    const archived = archiveDirectory
        ? archiveExpiredTechnicalRows(db, archiveDirectory, { automodRetentionDays, auditRetentionDays })
        : { automodEvents: 0, dashboardAuditLogs: 0, files: [], bytes: 0 };

    const cleanup = db.transaction(() => ({
        expiredSessions: db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(nowMs).changes,
        automodEvents: archived.automodEvents,
        dashboardAuditLogs: archived.dashboardAuditLogs
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
        archived,
        convertedToIncrementalVacuum,
        checkpoint,
        sqlite: getSqliteStats(db)
    };
}

function getVolumeStats(targetPath) {
    try {
        const stats = fs.statfsSync(targetPath);
        const totalBytes = Number(stats.blocks) * Number(stats.bsize);
        const availableBytes = Number(stats.bavail) * Number(stats.bsize);
        const usedBytes = Math.max(totalBytes - availableBytes, 0);

        return {
            totalBytes,
            availableBytes,
            usedBytes,
            usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0
        };
    } catch (error) {
        return { totalBytes: 0, availableBytes: 0, usedBytes: 0, usagePercent: 0 };
    }
}

function storageCategoryForName(name) {
    if (/service_(?:times|sessions)/.test(name)) return 'Services';
    if (/weekly_|guild_pay/.test(name)) return 'Paie RP';
    if (/automod/.test(name)) return 'Auto-modération';
    if (/moderation/.test(name)) return 'Modération';
    if (/dossier/.test(name)) return 'Dossiers';
    if (/custom_embed|embed_media/.test(name)) return 'Embeds et médias';
    if (/dashboard_|user_|site_staff/.test(name)) return 'Site et accès';
    if (/premium|command_roles|guild_configs/.test(name)) return 'Configuration';
    if (/storage_|cold_archive/.test(name)) return 'Entretien';
    return 'Autres données';
}

function getDatabaseDistribution(db) {
    try {
        const rows = db.prepare(`
            SELECT name, SUM(pgsize) AS size_bytes
            FROM dbstat
            WHERE name NOT LIKE 'sqlite_%'
            GROUP BY name
        `).all();
        const categories = new Map();

        for (const row of rows) {
            const category = storageCategoryForName(row.name);
            categories.set(category, (categories.get(category) || 0) + Number(row.size_bytes || 0));
        }

        return [...categories.entries()]
            .map(([name, sizeBytes]) => ({ name, sizeBytes }))
            .sort((a, b) => b.sizeBytes - a.sizeBytes);
    } catch (error) {
        return [];
    }
}

function getMediaStatus(db, mediaDirectory) {
    const counts = db.prepare(`
        SELECT
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
            SUM(CASE WHEN status = 'trash' THEN 1 ELSE 0 END) AS trash_count,
            SUM(CASE WHEN content_hash IS NULL THEN 1 ELSE 0 END) AS remote_only_count
        FROM embed_media_links
    `).get() || {};
    const objects = db.prepare(`
        SELECT
            COUNT(*) AS count,
            COALESCE(SUM(size_bytes), 0) AS bytes,
            SUM(CASE WHEN storage_provider = 'local' THEN 1 ELSE 0 END) AS local_count,
            COALESCE(SUM(CASE WHEN storage_provider = 'local' THEN size_bytes ELSE 0 END), 0) AS local_bytes,
            SUM(CASE WHEN storage_provider != 'local' THEN 1 ELSE 0 END) AS external_count,
            COALESCE(SUM(CASE WHEN storage_provider != 'local' THEN size_bytes ELSE 0 END), 0) AS external_bytes
        FROM embed_media_objects
    `).get();
    const orphanObjects = db.prepare(`
        SELECT COUNT(*) AS count
        FROM embed_media_objects
        WHERE NOT EXISTS (
            SELECT 1 FROM embed_media_links
            WHERE embed_media_links.content_hash = embed_media_objects.content_hash
        )
    `).get();

    return {
        activeCount: Number(counts.active_count || 0),
        trashCount: Number(counts.trash_count || 0),
        orphanObjectCount: Number(orphanObjects?.count || 0),
        remoteOnlyCount: Number(counts.remote_only_count || 0),
        objectCount: Number(objects?.count || 0),
        logicalObjectBytes: Number(objects?.bytes || 0),
        localObjectCount: Number(objects?.local_count || 0),
        objectBytes: Number(objects?.local_bytes || 0),
        externalObjectCount: Number(objects?.external_count || 0),
        externalObjectBytes: Number(objects?.external_bytes || 0),
        directoryBytes: directorySize(mediaDirectory)
    };
}

function currentStorageAlertLevel(usagePercent) {
    if (usagePercent >= 90) return 90;
    if (usagePercent >= 75) return 75;
    if (usagePercent >= 60) return 60;
    return 0;
}

function recordStorageMetric(db, status) {
    const capturedAt = new Date().toISOString();
    const comparisonAt = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const previous = db.prepare(`
        SELECT database_bytes FROM storage_metrics
        WHERE captured_at <= ?
        ORDER BY datetime(captured_at) DESC
        LIMIT 1
    `).get(comparisonAt);
    const previousCategoryTime = db.prepare(`
        SELECT captured_at
        FROM storage_table_metrics
        WHERE captured_at <= ?
        ORDER BY datetime(captured_at) DESC
        LIMIT 1
    `).get(comparisonAt)?.captured_at;
    const previousCategories = new Map(previousCategoryTime
        ? db.prepare('SELECT category, size_bytes FROM storage_table_metrics WHERE captured_at = ?')
            .all(previousCategoryTime)
            .map(row => [row.category, Number(row.size_bytes || 0)])
        : []);
    const growthBytes = status.databaseBytes - Number(previous?.database_bytes || status.databaseBytes);
    const alertLevel = currentStorageAlertLevel(status.volume.usagePercent);

    db.prepare(`
        INSERT INTO storage_metrics (
            captured_at, database_bytes, backup_bytes, archive_bytes, media_bytes,
            volume_used_bytes, volume_total_bytes, usage_percent, database_growth_bytes, alert_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        capturedAt,
        status.databaseBytes,
        status.backupBytes,
        status.archiveBytes,
        status.media.objectBytes,
        status.volume.usedBytes,
        status.volume.totalBytes,
        status.volume.usagePercent,
        growthBytes,
        alertLevel
    );

    const insertCategory = db.prepare(`
        INSERT INTO storage_table_metrics (captured_at, category, size_bytes)
        VALUES (?, ?, ?)
    `);
    const categoryGrowth = [];

    db.transaction(() => {
        for (const item of status.distribution || []) {
            insertCategory.run(capturedAt, item.name, item.sizeBytes);
            const previousSize = previousCategories.get(item.name);

            if (Number.isFinite(previousSize)) {
                categoryGrowth.push({
                    category: item.name,
                    sizeBytes: item.sizeBytes,
                    growthBytes: item.sizeBytes - previousSize,
                    growthPercent: previousSize > 0
                        ? Math.round(((item.sizeBytes - previousSize) / previousSize) * 1000) / 10
                        : 0
                });
            }
        }
    })();

    db.prepare("DELETE FROM storage_metrics WHERE captured_at < datetime('now', '-90 days')").run();
    db.prepare("DELETE FROM storage_table_metrics WHERE captured_at < datetime('now', '-90 days')").run();
    return { growthBytes, alertLevel, categoryGrowth };
}

function updateStorageAlert(db, key, active, level, message, details = {}) {
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT * FROM storage_alerts WHERE alert_key = ?').get(key);

    if (!active) {
        if (existing && !existing.resolved_at) {
            db.prepare('UPDATE storage_alerts SET last_seen_at = ?, resolved_at = ? WHERE alert_key = ?')
                .run(now, now, key);
        }

        return null;
    }

    const lastNotifiedMs = existing?.last_notified_at ? Date.parse(existing.last_notified_at) : 0;
    const shouldNotify = !existing
        || Boolean(existing.resolved_at)
        || Number(level) > Number(existing.level || 0)
        || Date.now() - lastNotifiedMs >= 24 * 60 * 60 * 1000;

    db.prepare(`
        INSERT INTO storage_alerts (
            alert_key, level, first_seen_at, last_seen_at, last_notified_at, resolved_at, details_json
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?)
        ON CONFLICT(alert_key) DO UPDATE SET
            level = excluded.level,
            first_seen_at = CASE WHEN storage_alerts.resolved_at IS NOT NULL THEN excluded.first_seen_at ELSE storage_alerts.first_seen_at END,
            last_seen_at = excluded.last_seen_at,
            resolved_at = NULL,
            details_json = excluded.details_json
    `).run(key, level, now, now, JSON.stringify({ message, ...details }));

    return { key, level, message, shouldNotify, details };
}

function evaluateStorageAlerts(db, status, {
    latestBackupAt = null,
    backupFailure = null,
    backupMaxAgeHours = 36
} = {}) {
    const volumeLevel = currentStorageAlertLevel(status.volume.usagePercent);
    const mediaUsagePercent = status.media?.maxBytes > 0
        ? Math.round((status.media.objectBytes / status.media.maxBytes) * 1000) / 10
        : 0;
    const mediaLevel = currentStorageAlertLevel(mediaUsagePercent);
    const growthLimit = Math.max(Math.round(status.databaseBytes * 0.25), 16 * 1024 * 1024);
    const metric = recordStorageMetric(db, status);
    const fastCategory = metric.categoryGrowth
        .filter(item => item.growthBytes > 8 * 1024 * 1024 && item.growthPercent >= 50)
        .sort((a, b) => b.growthBytes - a.growthBytes)[0] || null;
    const databasePerformance = status.performance?.database || {};
    const runtimePerformance = status.performance?.runtime || {};
    const degradedPerformance = Number(databasePerformance.errorCount || 0) > 0
        || Number(runtimePerformance.dashboard?.p95Ms || 0) >= 2000
        || Number(runtimePerformance.discord?.p95Ms || 0) >= 3000;
    const latestBackupAge = latestBackupAt ? Date.now() - Date.parse(latestBackupAt) : Number.POSITIVE_INFINITY;

    return [
        updateStorageAlert(db, 'volume_usage', volumeLevel > 0, volumeLevel,
            `Le stockage Sentinel atteint ${status.volume.usagePercent} %.`,
            { usagePercent: status.volume.usagePercent }),
        updateStorageAlert(db, 'media_usage', mediaLevel > 0, mediaLevel,
            `Le registre local des médias atteint ${mediaUsagePercent} %.`,
            { usagePercent: mediaUsagePercent }),
        updateStorageAlert(db, 'database_growth', metric.growthBytes > growthLimit, 75,
            'La base Sentinel a grandi anormalement en moins de 24 heures.',
            { growthBytes: metric.growthBytes, growthLimit }),
        updateStorageAlert(db, 'table_growth', Boolean(fastCategory), 75,
            fastCategory ? `Le registre « ${fastCategory.category} » grandit anormalement vite.` : 'Un registre grandit anormalement vite.',
            fastCategory || {}),
        updateStorageAlert(db, 'performance_degraded', degradedPerformance, 60,
            'Sentinel a détecté des erreurs de données ou des réponses anormalement lentes.',
            {
                databaseErrors: Number(databasePerformance.errorCount || 0),
                dashboardP95Ms: Number(runtimePerformance.dashboard?.p95Ms || 0),
                discordP95Ms: Number(runtimePerformance.discord?.p95Ms || 0)
            }),
        updateStorageAlert(db, 'backup_missing', latestBackupAge > Math.max(Number(backupMaxAgeHours) || 36, 1) * 3600000, 90,
            'Aucune sauvegarde récente et vérifiée n’est disponible.',
            { latestBackupAt }),
        updateStorageAlert(db, 'backup_failure', Boolean(backupFailure), 90,
            'La dernière sauvegarde ou vérification a échoué.',
            { error: backupFailure ? String(backupFailure).slice(0, 500) : null })
    ].filter(Boolean);
}

function markStorageAlertsNotified(db, keys) {
    const safeKeys = [...new Set((keys || []).filter(key => /^[a-z0-9_-]{1,64}$/i.test(key)))];
    const statement = db.prepare('UPDATE storage_alerts SET last_notified_at = ? WHERE alert_key = ?');
    const now = new Date().toISOString();

    db.transaction(() => {
        for (const key of safeKeys) {
            statement.run(now, key);
        }
    })();
}

function getActiveStorageAlerts(db) {
    return db.prepare(`
        SELECT alert_key, level, first_seen_at, last_seen_at, last_notified_at, details_json
        FROM storage_alerts
        WHERE resolved_at IS NULL
        ORDER BY level DESC, datetime(last_seen_at) DESC
    `).all().map(row => {
        let details = {};

        try {
            details = JSON.parse(row.details_json || '{}');
        } catch (error) {
            details = {};
        }

        return {
            key: row.alert_key,
            level: row.level,
            firstSeenAt: row.first_seen_at,
            lastSeenAt: row.last_seen_at,
            lastNotifiedAt: row.last_notified_at,
            message: details.message || 'Alerte stockage Sentinel.',
            details
        };
    });
}

function resolveManagedStorageFile(directory, fileName, pattern) {
    const safeName = path.basename(String(fileName || ''));

    if (safeName !== String(fileName || '') || !pattern.test(safeName)) {
        return null;
    }

    const fullPath = path.resolve(directory, safeName);
    const safeDirectory = `${path.resolve(directory)}${path.sep}`;

    if (!fullPath.startsWith(safeDirectory) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        return null;
    }

    return fullPath;
}

function getDatabaseStorageStatus(db, {
    databasePath,
    backupDirectory,
    archiveDirectory = path.join(path.dirname(databasePath), 'cold-archives'),
    mediaDirectory = path.join(path.dirname(databasePath), 'embed-media'),
    mediaMaxBytes = 128 * 1024 * 1024,
    backupKeep = 14,
    backupDaily = 7,
    backupWeekly = 8,
    backupMonthly = 12,
    backupMaxBytes = 96 * 1024 * 1024,
    automodRetentionDays = 180,
    auditRetentionDays = 365,
    lastBackup = null,
    lastMaintenance = null,
    lastBackupFailure = null,
    backupEnabled = true,
    backupIntervalHours = 24,
    runtimePerformance = null
}) {
    const backups = listDatabaseBackups(backupDirectory);
    const generationSelection = backupGenerationSelection(backups, {
        daily: backupDaily,
        weekly: backupWeekly,
        monthly: backupMonthly
    });
    const checks = new Map(db.prepare(`
        SELECT file_name, checked_at, status, integrity_result, duration_ms, error_message
        FROM storage_backup_checks
        ORDER BY datetime(checked_at) DESC
        LIMIT 100
    `).all().map(row => [row.file_name, row]));
    const database = getDatabaseFileStats(databasePath);
    const backupBytes = backups.reduce((total, item) => total + item.sizeBytes, 0);
    const archiveBytes = directorySize(archiveDirectory);
    const media = {
        ...getMediaStatus(db, mediaDirectory),
        maxBytes: mediaMaxBytes
    };
    const latest = backups[0] || null;
    const volume = getVolumeStats(path.dirname(databasePath));
    const backupHistory = backups.slice(0, 40).map(item => {
        const check = checks.get(item.fileName);
        return {
            fileName: item.fileName,
            sizeBytes: item.sizeBytes,
            compressed: item.compressed,
            createdAt: item.createdAt,
            generations: [...(generationSelection.get(item.fileName) || [])],
            verification: check ? {
                status: check.status,
                checkedAt: check.checked_at,
                integrityResult: check.integrity_result,
                durationMs: check.duration_ms,
                errorMessage: check.error_message
            } : null
        };
    });
    const latestVerified = backupHistory.find(item => item.verification?.status === 'ok');

    return {
        enabled: backupEnabled,
        databaseBytes: database.totalBytes,
        databaseFiles: database.files,
        sqlite: getSqliteStats(db),
        distribution: getDatabaseDistribution(db),
        backupBytes,
        archiveBytes,
        media,
        volume,
        managedBytes: database.totalBytes + backupBytes + archiveBytes + media.objectBytes,
        count: backups.length,
        compressedCount: backups.filter(item => item.compressed).length,
        keep: backupKeep,
        generations: { daily: backupDaily, weekly: backupWeekly, monthly: backupMonthly },
        maxBackupBytes: backupMaxBytes,
        intervalHours: backupIntervalHours,
        latestAt: lastBackup?.createdAt || latest?.createdAt || null,
        latestFile: lastBackup?.fileName || latest?.fileName || null,
        latestReason: lastBackup?.reason || null,
        latestVerifiedAt: latestVerified?.verification?.checkedAt || null,
        lastBackupFailure,
        backups: backupHistory,
        coldArchives: listColdArchives(db, archiveDirectory),
        alerts: getActiveStorageAlerts(db),
        performance: {
            database: typeof db.getSentinelPerformance === 'function' ? db.getSentinelPerformance() : null,
            runtime: runtimePerformance
        },
        lastMaintenance,
        retention: {
            automodDays: automodRetentionDays,
            auditDays: auditRetentionDays,
            mediaTrashDays: 30,
            businessArchives: 'unlimited'
        }
    };
}

module.exports = {
    BACKUP_PATTERN,
    COLD_ARCHIVE_PATTERN,
    applyPendingDatabaseRestore,
    archiveExpiredTechnicalRows,
    compressExistingDatabaseBackups,
    createCompressedDatabaseBackup,
    evaluateStorageAlerts,
    getDatabaseStorageStatus,
    listColdArchives,
    listDatabaseBackups,
    markStorageAlertsNotified,
    pruneDatabaseBackupGenerations,
    pruneDatabaseBackups,
    resolveManagedStorageFile,
    runDatabaseMaintenance,
    saveBackupVerification,
    stageDatabaseRestore,
    verifyDatabaseBackup
};
