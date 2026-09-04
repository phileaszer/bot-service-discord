require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../database/database');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'service.db');
const backupDirectory = process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups');
const backupKeep = Math.max(Number.parseInt(process.env.DATABASE_BACKUP_KEEP || '14', 10), 1);

function backupFileName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `service-manual-${stamp}.db`;
}

function pruneBackups() {
    const backups = fs.readdirSync(backupDirectory)
        .filter(fileName => /^service-.*\.db$/i.test(fileName))
        .map(fileName => {
            const fullPath = path.join(backupDirectory, fileName);
            return {
                fullPath,
                mtimeMs: fs.statSync(fullPath).mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const backup of backups.slice(backupKeep)) {
        fs.unlinkSync(backup.fullPath);
    }
}

(async () => {
    fs.mkdirSync(backupDirectory, { recursive: true });

    const destination = path.join(backupDirectory, backupFileName());
    await db.backup(destination);
    pruneBackups();
    db.close();

    console.log(`Sauvegarde locale créée : ${destination}`);
})().catch(error => {
    console.error('Erreur sauvegarde locale :', error);
    process.exitCode = 1;
});
