'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createAudit } = require('../tools/audit-i18n');

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
