const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ChannelType, Collection } = require('discord.js');

const { purgeChannelMessages, recreateChannelForPurge } = require('../message-purge');

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

function overwrite(id, type, allow, deny) {
    return {
        id,
        type,
        allow: { bitfield: BigInt(allow) },
        deny: { bitfield: BigInt(deny) }
    };
}

function overwriteCache(items = []) {
    return new Collection(items.map(item => [item.id, item]));
}

test('limited purge also deletes selected messages older than 14 days', async () => {
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

    assert.equal(result.deleted, 3);
    assert.equal(result.skippedOld, 0);
    assert.equal(old.deleteCalls, 1);
});

test('complete purge recreates the channel and deletes the original once', async () => {
    const calls = [];
    const permissions = [
        overwrite('guild', 0, 1024, 2048),
        overwrite('staff-role', 0, 3072, 0),
        overwrite('member', 1, 4096, 8192)
    ];
    const replacement = {
        id: 'replacement',
        rawPosition: 4,
        permissionOverwrites: { cache: overwriteCache(permissions) },
        setPosition: async () => calls.push('position'),
        delete: async () => calls.push('replacement-delete')
    };
    const channel = {
        type: ChannelType.GuildText,
        name: 'general',
        rawPosition: 4,
        defaultAutoArchiveDuration: 1440,
        defaultThreadRateLimitPerUser: 10,
        permissionOverwrites: { cache: overwriteCache(permissions) },
        clone: async options => {
            calls.push(['clone', options]);
            return replacement;
        },
        delete: async () => calls.push('original-delete')
    };

    const result = await recreateChannelForPurge(channel, 'test purge');

    assert.equal(result, replacement);
    assert.equal(calls[0][0], 'clone');
    assert.equal(calls[0][1].position, 4);
    assert.deepEqual(calls[0][1].permissionOverwrites, [
        { id: 'guild', type: 0, allow: 1024n, deny: 2048n },
        { id: 'staff-role', type: 0, allow: 3072n, deny: 0n },
        { id: 'member', type: 1, allow: 4096n, deny: 8192n }
    ]);
    assert.equal(calls.at(-1), 'original-delete');
    assert.equal(calls.filter(call => call === 'original-delete').length, 1);
    assert.equal(calls.includes('replacement-delete'), false);
});

test('complete purge cleans up its clone when Discord keeps the original channel', async () => {
    let replacementDeleted = 0;
    const channel = {
        type: ChannelType.GuildText,
        name: 'general',
        rawPosition: 4,
        permissionOverwrites: { cache: overwriteCache() },
        clone: async () => ({
            rawPosition: 4,
            permissionOverwrites: { cache: overwriteCache() },
            delete: async () => {
                replacementDeleted += 1;
            }
        }),
        delete: async () => {
            throw new Error('Discord refused deletion');
        }
    };

    await assert.rejects(
        recreateChannelForPurge(channel),
        error => error.channelReplacementFailed === true
    );
    assert.equal(replacementDeleted, 1);
});

test('complete purge keeps the original when one permission differs', async () => {
    let originalDeleted = 0;
    let replacementDeleted = 0;
    const sourcePermissions = [overwrite('staff-role', 0, 3072, 0)];
    const channel = {
        type: ChannelType.GuildText,
        name: 'general',
        rawPosition: 4,
        permissionOverwrites: { cache: overwriteCache(sourcePermissions) },
        clone: async () => ({
            rawPosition: 4,
            permissionOverwrites: {
                cache: overwriteCache([overwrite('staff-role', 0, 1024, 0)])
            },
            delete: async () => {
                replacementDeleted += 1;
            }
        }),
        delete: async () => {
            originalDeleted += 1;
        }
    };

    await assert.rejects(
        recreateChannelForPurge(channel),
        error => error.channelPermissionRestoreFailed === true
            && error.channelReplacementFailed === true
    );
    assert.equal(originalDeleted, 0);
    assert.equal(replacementDeleted, 1);
});

test('the low-level purge helper cannot bypass the verified archive workflow', async () => {
    const channel = {
        isTextBased: () => true,
        messages: { fetch: async () => collection([]) },
        bulkDelete: async messages => messages
    };

    await assert.rejects(
        purgeChannelMessages(channel, { mode: 'all' }),
        error => error.completePurgeArchiveRequired === true
    );
});

test('Sentinel verifies an archive before deleting dashboard or Discord messages', () => {
    const root = path.resolve(__dirname, '..');
    const botSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const dashboardSource = fs.readFileSync(path.join(root, 'dashboard.js'), 'utf8');
    const dashboardClientSource = fs.readFileSync(path.join(root, 'site', 'dashboard.js'), 'utf8');
    const databaseSource = fs.readFileSync(path.join(root, 'database', 'database.js'), 'utf8');
    const commandSource = fs.readFileSync(path.join(root, 'deploy-commands.js'), 'utf8');
    const purgeCommandSource = commandSource.slice(
        commandSource.indexOf("command('purge'"),
        commandSource.indexOf("command('sanctions'")
    );
    const workflow = botSource.slice(
        botSource.indexOf('async function archiveAndPurgeChannelMessages'),
        botSource.indexOf('async function archiveDossierChannel')
    );
    const archiveCall = workflow.indexOf('archive = await archiveMessagePurgeSnapshot');
    const recreateCall = workflow.indexOf('replacement = await recreateChannelForPurge');

    assert.ok(archiveCall >= 0 && recreateCall > archiveCall);
    assert.match(workflow, /if \(snapshot\.mode === 'all'\)[\s\S]*recreateChannelForPurge/);
    assert.match(workflow, /migrateSentinelChannelReferences\(channel\.guild\.id, channel\.id, replacement\.id\)/);
    assert.match(workflow, /'channel_recreated'/);
    assert.match(workflow, /error\.archiveFailed = true/);
    assert.match(workflow, /activeMessagePurges\.has\(operationKey\)/);
    assert.match(workflow, /finally\s*{\s*activeMessagePurges\.delete\(operationKey\)/);
    assert.match(dashboardSource, /toLocaleUpperCase\('fr'\) !== 'VIDER'/);
    assert.match(botSource, /getLogChannel\(guild\)\?\.id !== resultChannel\.id/);
    assert.match(dashboardSource, /getLogChannel\(guild\)\?\.id !== channel\.id/);
    assert.match(dashboardClientSource, /data-purge-all-field/);
    assert.match(purgeCommandSource, /\.setName\('messages'\)[\s\S]*\.setName\('nombre'\)[\s\S]*\.setRequired\(true\)/);
    assert.match(purgeCommandSource, /\.addSubcommand\(subcommand =>[\s\S]*\.setName\('tout'\)/);
    assert.doesNotMatch(purgeCommandSource, /\.addBooleanOption/);
    assert.match(botSource, /writePurgeAttachmentEntry\(gzip, attachment, totalAttachmentBytes\)/);
    assert.match(botSource, /readTarEntryFromGzipFile\(stagingArchivePath, 'manifest\.json'\)/);
    assert.match(botSource, /createTarHeader\(attachment\.archiveFile, archivedSize\)/);
    assert.doesNotMatch(botSource, /responseSize !== declaredSize/);
    assert.match(databaseSource, /CREATE TABLE IF NOT EXISTS message_purge_archives/);
});
