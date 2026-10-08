'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SENTINEL_STAGING_GUILD_ID;
delete process.env.SENTINEL_STAGING_VALIDATION_REQUIRED;
delete process.env.SENTINEL_STAGING_REAL_ACTIONS;

const { runDiscordStagingValidation, stagingValidationConfig } = require('../staging-validation');

test('Discord staging validation stays inert until a private guild is explicitly configured', async () => {
    const config = stagingValidationConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.required, false);
    assert.equal(config.realActions, false);
    const result = await runDiscordStagingValidation({});
    assert.equal(result.skipped, true);
});

test('required Discord staging blocks startup when the private guild is missing', async () => {
    process.env.SENTINEL_STAGING_VALIDATION_REQUIRED = 'true';
    try {
        await assert.rejects(
            runDiscordStagingValidation({}),
            /SENTINEL_STAGING_GUILD_ID est obligatoire/
        );
    } finally {
        delete process.env.SENTINEL_STAGING_VALIDATION_REQUIRED;
    }
});
