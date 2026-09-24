require('dotenv').config();

const path = require('path');
const db = require('../database/database');
const {
    compressExistingDatabaseBackups,
    createCompressedDatabaseBackup,
    pruneDatabaseBackups
} = require('../database/storage');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'service.db');
const backupDirectory = process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups');
const backupKeep = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_KEEP || '14', 10), 1);
const backupCompress = String(process.env.DATABASE_BACKUP_COMPRESS || 'true').toLowerCase() !== 'false';
const compressionLevel = Math.min(Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_COMPRESSION_LEVEL || '9', 10),
    1
), 9);
const backupMaxBytes = Math.max(
    Number.parseInt(process.env.DATABASE_BACKUP_MAX_MB || '96', 10),
    16
) * 1024 * 1024;

(async () => {
    if (backupCompress) {
        await compressExistingDatabaseBackups(backupDirectory, compressionLevel);
    }

    const backup = await createCompressedDatabaseBackup(db, {
        backupDirectory,
        reason: 'manual',
        compress: backupCompress,
        compressionLevel
    });
    pruneDatabaseBackups(backupDirectory, {
        keep: backupKeep,
        maxBytes: backupMaxBytes
    });
    db.close();

    console.log(`Sauvegarde locale creee : ${backup.fullPath}`);
})().catch(error => {
    console.error('Erreur sauvegarde locale :', error);
    process.exitCode = 1;
});
