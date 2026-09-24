require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'service.db'));
const backupDirectory = path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(path.dirname(databasePath), 'backups'));

function listBackups() {
    if (!fs.existsSync(backupDirectory)) {
        return [];
    }

    return fs.readdirSync(backupDirectory)
        .filter(fileName => /^service-.*\.db(?:\.gz)?$/i.test(fileName))
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

    if (!safeName || safeName !== fileName || !/^service-.*\.db(?:\.gz)?$/i.test(safeName)) {
        throw new Error('Indique uniquement le nom du fichier de sauvegarde, par exemple service-auto-2026-08-09T10-00-00-000Z.db.gz');
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

function verifyDatabase(filePath) {
    const candidate = new Database(filePath, { readonly: true, fileMustExist: true });

    try {
        const result = candidate.pragma('integrity_check', { simple: true });

        if (result !== 'ok') {
            throw new Error(`La verification SQLite a echoue : ${result}`);
        }
    } finally {
        candidate.close();
    }
}

async function gzipCopy(sourcePath, destinationPath) {
    await pipeline(
        fs.createReadStream(sourcePath),
        zlib.createGzip({ level: 9 }),
        fs.createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 })
    );
}

async function backupCurrentDatabase(destinationPath) {
    const temporaryPath = `${destinationPath}.${process.pid}.tmp.db`;
    const current = new Database(databasePath, { fileMustExist: true });

    try {
        await current.backup(temporaryPath);
    } finally {
        current.close();
    }

    try {
        verifyDatabase(temporaryPath);
        await gzipCopy(temporaryPath, destinationPath);
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
}

async function restoreDatabase(fileName) {
    const backupPath = resolveBackup(fileName);
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    fs.mkdirSync(backupDirectory, { recursive: true });

    const candidatePath = `${databasePath}.${process.pid}.${Date.now()}.restore.tmp`;

    try {
        if (backupPath.toLowerCase().endsWith('.gz')) {
            await pipeline(
                fs.createReadStream(backupPath),
                zlib.createGunzip(),
                fs.createWriteStream(candidatePath, { flags: 'wx', mode: 0o600 })
            );
        } else {
            fs.copyFileSync(backupPath, candidatePath, fs.constants.COPYFILE_EXCL);
        }

        verifyDatabase(candidatePath);

        if (fs.existsSync(databasePath)) {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const beforeRestorePath = path.join(backupDirectory, `service-before-restore-${stamp}.db.gz`);
            await backupCurrentDatabase(beforeRestorePath);
            console.log(`Copie de securite avant restauration : ${beforeRestorePath}`);
        }

        fs.rmSync(`${databasePath}-wal`, { force: true });
        fs.rmSync(`${databasePath}-shm`, { force: true });
        fs.copyFileSync(candidatePath, databasePath);
    } finally {
        fs.rmSync(candidatePath, { force: true });
    }

    console.log(`Base restauree depuis : ${backupPath}`);
    console.log('Redemarre Sentinel pour utiliser la base restauree.');
}

const backupFileName = process.argv[2];

async function main() {
    if (!backupFileName) {
        printBackups();
        console.log('');
        console.log('Utilisation : npm run restore:db -- <nom-du-fichier.db ou .db.gz>');
        return;
    }

    await restoreDatabase(backupFileName);
}

main().catch(error => {
    console.error(`Restauration impossible : ${error.message}`);
    process.exitCode = 1;
});
