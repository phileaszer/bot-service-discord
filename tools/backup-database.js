require('dotenv').config();

const path = require('path');
const db = require('../database/database');
const {
    compressExistingDatabaseBackups,
    createCompressedDatabaseBackup,
    pruneDatabaseBackupGenerations,
    saveBackupVerification,
    verifyDatabaseBackup
} = require('../database/storage');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'service.db');
const backupDirectory = process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups');
const backupDaily = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_DAILY || '7', 10), 1);
const backupWeekly = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_WEEKLY || '8', 10), 1);
const backupMonthly = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_MONTHLY || '12', 10), 1);
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
    const verification = await verifyDatabaseBackup(backup.fullPath);
    saveBackupVerification(db, verification);

    if (verification.status !== 'ok') {
        throw new Error(verification.errorMessage || 'La verification de la sauvegarde a echoue.');
    }

    pruneDatabaseBackupGenerations(backupDirectory, {
        daily: backupDaily,
        weekly: backupWeekly,
        monthly: backupMonthly,
        maxBytes: backupMaxBytes
    });
    db.close();

    console.log(`Sauvegarde locale creee et verifiee : ${backup.fullPath}`);
})().catch(error => {
    console.error('Erreur sauvegarde locale :', error);
    process.exitCode = 1;
});
