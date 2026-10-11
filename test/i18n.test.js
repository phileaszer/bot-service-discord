'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAudit } = require('../tools/audit-i18n');

test('every visible French site string has an English translation', () => {
  const result = createAudit();
  assert.equal(
    result.missing.length,
    0,
    `Missing English translations:\n${result.missing.map((item) => `${item.file}: ${item.value}`).join('\n')}`
  );
});
