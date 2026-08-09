require('dotenv').config();

const fs = require('fs');
const path = require('path');

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'service.db'));
const backupDirectory = path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups'));

function listBackups() {
    if (!fs.existsSync(backupDirectory)) {
        return [];
    }

    return fs.readdirSync(backupDirectory)
        .filter(fileName => /^service-.*\.db$/i.test(fileName))
        .map(fileName => {
            const fullPath = path.join(backupDirectory, fileName);
            const stat = fs.statSync(fullPath);
            return {
                fileName,
                fullPath,
                size: stat.size,
                mtimeMs: stat.mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function printBackups() {
    const backups = listBackups();

    if (backups.length === 0) {
        console.log(`Aucune sauvegarde trouvee dans ${backupDirectory}`);
        return;
    }

    console.log(`Sauvegardes disponibles dans ${backupDirectory}`);
    backups.forEach((backup, index) => {
        const date = new Date(backup.mtimeMs).toISOString();
        console.log(`${index + 1}. ${backup.fileName} - ${date} - ${backup.size} octets`);
    });
}

function resolveBackup(fileName) {
    const safeName = path.basename(String(fileName || '').trim());

    if (!safeName || safeName !== fileName || !/^service-.*\.db$/i.test(safeName)) {
        throw new Error('Indique uniquement le nom du fichier de sauvegarde, par exemple service-auto-2026-08-09T10-00-00-000Z.db');
    }

    const backupPath = path.resolve(backupDirectory, safeName);
    const relative = path.relative(backupDirectory, backupPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('Le fichier doit rester dans le dossier des sauvegardes.');
    }

    if (!fs.existsSync(backupPath)) {
        throw new Error(`Sauvegarde introuvable : ${safeName}`);
    }

    return backupPath;
}

function restoreDatabase(fileName) {
    const backupPath = resolveBackup(fileName);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    if (fs.existsSync(databasePath)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const beforeRestorePath = path.join(backupDirectory, `service-before-restore-${stamp}.db`);
        fs.mkdirSync(backupDirectory, { recursive: true });
        fs.copyFileSync(databasePath, beforeRestorePath, fs.constants.COPYFILE_EXCL);
        console.log(`Copie de securite avant restauration : ${beforeRestorePath}`);
    }

    fs.copyFileSync(backupPath, databasePath);
    console.log(`Base restauree depuis : ${backupPath}`);
    console.log('Redemarre Sentinel pour utiliser la base restauree.');
}

const backupFileName = process.argv[2];

try {
    if (!backupFileName) {
        printBackups();
        console.log('');
        console.log('Utilisation : npm run restore:db -- <nom-du-fichier.db>');
        process.exit(0);
    }

    restoreDatabase(backupFileName);
} catch (error) {
    console.error(`Restauration impossible : ${error.message}`);
    process.exitCode = 1;
}
