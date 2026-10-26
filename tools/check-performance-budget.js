'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Database = require('better-sqlite3');

const root = path.resolve(__dirname, '..');
const budget = JSON.parse(fs.readFileSync(path.join(root, 'performance-budget.json'), 'utf8'));
const failures = [];
const report = [];

for (const [relativePath, limits] of Object.entries(budget.assets || {})) {
    const source = fs.readFileSync(path.join(root, relativePath));
    const gzipBytes = zlib.gzipSync(source, { level: 9 }).length;
    const item = { file: relativePath, bytes: source.length, gzipBytes, ...limits };
    report.push(item);
    if (source.length > limits.maxBytes) failures.push(`${relativePath} dépasse ${limits.maxBytes} octets.`);
    if (gzipBytes > limits.maxGzipBytes) failures.push(`${relativePath} dépasse ${limits.maxGzipBytes} octets compressés.`);
}

for (const [relativePath, limits] of Object.entries(budget.source || {})) {
    const lines = fs.readFileSync(path.join(root, relativePath), 'utf8').split(/\r?\n/).length;
    report.push({ file: relativePath, lines, ...limits });
    if (lines > limits.maxLines) failures.push(`${relativePath} dépasse ${limits.maxLines} lignes.`);
}

const benchmarkDatabase = new Database(':memory:');
benchmarkDatabase.exec('CREATE TABLE benchmark (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
const insert = benchmarkDatabase.prepare('INSERT INTO benchmark (value) VALUES (?)');
const benchmarkStartedAt = process.hrtime.bigint();
benchmarkDatabase.transaction(() => {
    for (let index = 0; index < 1000; index += 1) insert.run(`sentinel-${index}`);
})();
const benchmarkCount = benchmarkDatabase.prepare('SELECT COUNT(*) AS total FROM benchmark').get().total;
const databaseBenchmarkMs = Number(process.hrtime.bigint() - benchmarkStartedAt) / 1e6;
benchmarkDatabase.close();
report.push({ benchmark: 'sqlite-memory-1000-writes', durationMs: Math.round(databaseBenchmarkMs * 100) / 100, rows: benchmarkCount, maxDurationMs: 1500 });
if (benchmarkCount !== 1000 || databaseBenchmarkMs > 1500) {
    failures.push(`Le contrôle SQLite dépasse le budget de 1500 ms (${Math.round(databaseBenchmarkMs)} ms).`);
}

console.log(JSON.stringify({ ok: failures.length === 0, report, failures }, null, 2));
if (failures.length) process.exitCode = 1;
