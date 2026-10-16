'use strict';

require('dotenv').config();

const { stagingValidationConfig } = require('../staging-validation');

const config = stagingValidationConfig();
const publicStatus = {
    enabled: config.enabled,
    required: config.required,
    realActions: config.realActions,
    ready: config.ready,
    testAccountsConfigured: Boolean(config.moderationMemberId && config.banTargetId),
    issues: config.issues
};

console.log(JSON.stringify(publicStatus, null, 2));

if (config.required && !config.ready) {
    process.exitCode = 1;
}
