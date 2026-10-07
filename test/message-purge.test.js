const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { Collection } = require('discord.js');

const { purgeChannelMessages } = require('../message-purge');

function message(id, ageDays = 0) {
    return {
        id,
        createdTimestamp: Date.now() - ageDays * 24 * 60 * 60 * 1000,
        deletable: true,
        deleteCalls: 0,
        async delete() {
            this.deleteCalls += 1;
        }
    };
}

function collection(messages) {
    return new Collection(messages.map(item => [item.id, item]));
}

test('limited purge deletes recent messages and leaves messages older than 14 days', async () => {
    const recentA = message('1', 1);
    const recentB = message('2', 2);
    const old = message('3', 20);
    const channel = {
        isTextBased: () => true,
        messages: {
            fetch: async () => collection([recentA, recentB, old])
        },
        bulkDelete: async messages => messages
    };

    const result = await purgeChannelMessages(channel, { mode: 'count', count: 3 });

    assert.equal(result.deleted, 2);
    assert.equal(result.skippedOld, 1);
    assert.equal(old.deleteCalls, 0);
});

test('complete purge deletes recent and old messages from the archived snapshot', async () => {
    const recent = message('10', 1);
    const old = message('11', 30);
    let fetchCall = 0;
    const channel = {
        isTextBased: () => true,
        messages: {
            fetch: async () => {
                fetchCall += 1;
                return fetchCall === 1 ? collection([recent, old]) : collection([]);
            }
        },
        bulkDelete: async messages => messages
    };

    const result = await purgeChannelMessages(channel, { mode: 'all' });

    assert.equal(result.deleted, 2);
    assert.equal(result.skippedOld, 0);
    assert.equal(result.hasRemaining, false);
    assert.equal(recent.deleteCalls, 1);
    assert.equal(old.deleteCalls, 1);
});

test('Sentinel verifies an archive before deleting dashboard or Discord messages', () => {
    const root = path.resolve(__dirname, '..');
    const botSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const dashboardSource = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');
    const dashboardClientSource = fs.readFileSync(path.join(root, 'site', 'dashboard.js'), 'utf8');
    const databaseSource = fs.readFileSync(path.join(root, 'database', 'database.js'), 'utf8');
    const workflow = botSource.slice(
        botSource.indexOf('async function archiveAndPurgeChannelMessages'),
        botSource.indexOf('async function archiveDossierChannel')
    );
    const archiveCall = workflow.indexOf('archive = await archiveMessagePurgeSnapshot');
    const deleteCall = workflow.indexOf('const result = await purgeFetchedChannelMessages');

    assert.ok(archiveCall >= 0 && deleteCall > archiveCall);
    assert.match(workflow, /error\.archiveFailed = true/);
    assert.match(workflow, /activeMessagePurges\.has\(operationKey\)/);
    assert.match(workflow, /finally\s*{\s*activeMessagePurges\.delete\(operationKey\)/);
    assert.match(dashboardSource, /toLocaleUpperCase\('fr'\) !== 'VIDER'/);
    assert.match(botSource, /getLogChannel\(guild\)\?\.id !== channel\.id/);
    assert.match(dashboardSource, /getLogChannel\(guild\)\?\.id !== channel\.id/);
    assert.match(dashboardClientSource, /data-purge-all-field/);
    assert.match(databaseSource, /CREATE TABLE IF NOT EXISTS message_purge_archives/);
});
