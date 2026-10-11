'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createAudit, loadI18nRuntime } = require('../tools/audit-i18n');

const siteRoot = path.resolve(__dirname, '..', 'site');

test('every visible French site string has an English translation', () => {
  const result = createAudit();
  assert.equal(
    result.missing.length,
    0,
    `Missing English translations:\n${result.missing.map((item) => `${item.file}: ${item.value}`).join('\n')}`
  );
});

test('every public site page loads the translation runtime', () => {
  const missingRuntime = fs.readdirSync(siteRoot)
    .filter((name) => name.endsWith('.html'))
    .filter((name) => !fs.readFileSync(path.join(siteRoot, name), 'utf8').includes('i18n.js?v='));

  assert.deepEqual(missingRuntime, []);
});

test('short dashboard labels and legacy French logs translate at runtime', () => {
  const { translateValue } = loadI18nRuntime();

  assert.equal(translateValue('Sécurité', 'en'), 'Security');
  assert.equal(translateValue('Programmation', 'en'), 'Scheduling');
  assert.equal(translateValue('Recherche membre', 'en'), 'Member search');
  assert.equal(
    translateValue('Panneau de service publié dans #service.', 'en'),
    'Duty desk published in #service.'
  );
  assert.equal(
    translateValue('Paie RP archivée pour Fantomenale.', 'en'),
    'Salary register archived for Fantomenale.'
  );
});
