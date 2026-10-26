'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SQLITE_PATTERNS = [
    { key: 'pragma', pattern: /\bpragma\b/gi, detail: 'PRAGMA doit être remplacé par des contrôles PostgreSQL.' },
    { key: 'insert-or-ignore', pattern: /insert\s+or\s+ignore/gi, detail: 'Utiliser INSERT ... ON CONFLICT DO NOTHING.' },
    { key: 'datetime-function', pattern: /datetime\s*\(/gi, detail: 'Adapter les calculs de dates au moteur PostgreSQL.' },
    { key: 'last-insert-rowid', pattern: /lastInsertRowid/g, detail: 'Utiliser RETURNING pour récupérer les identifiants.' },
    { key: 'sqlite-master', pattern: /sqlite_master/gi, detail: 'Interroger information_schema sur PostgreSQL.' }
];

let cachedReport = null;

function databasePortabilityReport(rootDirectory = path.resolve(__dirname, '..'), options = {}) {
    if (cachedReport && !options.refresh) return cachedReport;
    const files = [];
    const queue = [rootDirectory];
    while (queue.length) {
        const current = queue.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (['node_modules', '.git', 'data', 'backups', 'archives', 'test'].includes(entry.name)) continue;
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) queue.push(fullPath);
            else if (entry.name.endsWith('.js')) files.push(fullPath);
        }
    }

    const findings = [];
    for (const filePath of files) {
        if (path.resolve(filePath) === path.resolve(__filename)) continue;
        const source = fs.readFileSync(filePath, 'utf8');
        for (const rule of SQLITE_PATTERNS) {
            const count = [...source.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags))].length;
            if (count) findings.push({
                file: path.relative(rootDirectory, filePath).replace(/\\/g, '/'),
                key: rule.key,
                count,
                detail: rule.detail
            });
        }
    }

    cachedReport = {
        engine: 'sqlite',
        target: 'postgresql',
        readyForAutomaticSwitch: findings.length === 0,
        findingCount: findings.reduce((total, item) => total + item.count, 0),
        findings
    };
    return cachedReport;
}

module.exports = { databasePortabilityReport };

if (require.main === module) {
    console.log(JSON.stringify(databasePortabilityReport(), null, 2));
}
