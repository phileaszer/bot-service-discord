'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const startedAt = process.hrtime.bigint();
const root = path.resolve(__dirname, '..');
const requiredFiles = [
    'index.js',
    'dashboard.js',
    'database/database.js',
    'feature-flags.js',
    'operations-runner.js'
];

for (const relativePath of requiredFiles) {
    if (!fs.existsSync(path.join(root, relativePath))) {
        throw new Error(`Fichier Noctigarde obligatoire manquant : ${relativePath}`);
    }
}

if (!String(process.env.TOKEN || '').trim()) {
    throw new Error('TOKEN Discord manquant. Noctigarde ne peut pas démarrer.');
}

const db = require('../database/database');
const integrity = db.pragma('quick_check', { simple: true });
if (integrity !== 'ok') throw new Error(`Intégrité SQLite invalide : ${integrity}`);

const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
console.log(`Contrôle de démarrage Noctigarde réussi en ${Math.round(elapsedMs)} ms.`);
db.close();
