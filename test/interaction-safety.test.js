'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getDiscordErrorContext,
    getInteractionAction,
    installInteractionDeadlineGuard,
    isUnknownInteractionError,
    stripInitialResponseOptions
} = require('../interaction-safety');

function createInteraction({ component = false } = {}) {
    const calls = [];
    const interaction = {
        type: component ? 3 : 2,
        commandName: component ? null : 'diagnostic',
        customId: component ? 'sentinel_dossier:claim:123456789012345678' : null,
        deferred: false,
        replied: false,
        isRepliable: () => true,
        isChatInputCommand: () => !component,
        isModalSubmit: () => false,
        isStringSelectMenu: () => false,
        isButton: () => component,
        isMessageComponent: () => component,
        async deferReply(options) {
            calls.push(['deferReply', options]);
            this.deferred = true;
        },
        async deferUpdate(options) {
            calls.push(['deferUpdate', options]);
            this.deferred = true;
        },
        async reply(options) {
            calls.push(['reply', options]);
            this.replied = true;
        },
        async update(options) {
            calls.push(['update', options]);
            this.replied = true;
        },
        async showModal(modal) {
            calls.push(['showModal', modal]);
            this.replied = true;
        },
        async editReply(options) {
            calls.push(['editReply', options]);
        },
        async followUp(options) {
            calls.push(['followUp', options]);
        }
    };

    return { calls, interaction };
}

test('unknown Discord interactions are recognized and described safely', () => {
    const error = Object.assign(new Error('Unknown interaction'), {
        code: 10062,
        status: 404,
        method: 'POST'
    });
    const interaction = createInteraction({ component: true }).interaction;

    assert.equal(isUnknownInteractionError(error), true);
    assert.deepEqual(getDiscordErrorContext(error), {
        discordCode: 10062,
        httpStatus: 404,
        method: 'POST',
        interactionExpired: true
    });
    assert.equal(getInteractionAction(interaction), 'sentinel_dossier:claim');
    assert.deepEqual(stripInitialResponseOptions({ content: 'ok', flags: 64, ephemeral: true }), { content: 'ok' });
});

test('slow slash commands are acknowledged before Discord expires them', async () => {
    const { calls, interaction } = createInteraction();
    const guard = installInteractionDeadlineGuard(interaction, { timeoutMs: 20 });

    await new Promise(resolve => setTimeout(resolve, 35));
    await interaction.reply({ content: 'Terminé', flags: 64 });
    guard.dispose();

    assert.equal(calls[0][0], 'deferReply');
    assert.deepEqual(calls[1], ['editReply', { content: 'Terminé' }]);
});

test('slow buttons keep their original message and send the requested response', async () => {
    const { calls, interaction } = createInteraction({ component: true });
    const guard = installInteractionDeadlineGuard(interaction, { timeoutMs: 20 });

    await new Promise(resolve => setTimeout(resolve, 35));
    await interaction.reply({ content: 'Action terminée', flags: 64 });
    guard.dispose();

    assert.equal(calls[0][0], 'deferUpdate');
    assert.deepEqual(calls[1], ['followUp', { content: 'Action terminée', flags: 64 }]);
});

test('fast interactions keep the normal Discord response path', async () => {
    const { calls, interaction } = createInteraction();
    const guard = installInteractionDeadlineGuard(interaction, { timeoutMs: 100 });

    await interaction.reply({ content: 'Rapide', flags: 64 });
    guard.dispose();

    assert.deepEqual(calls, [['reply', { content: 'Rapide', flags: 64 }]]);
});
