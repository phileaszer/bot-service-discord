const { ChannelType, Collection, PermissionsBitField } = require('discord.js');

const BULK_DELETE_LIMIT = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BULK_DELETE_SAFETY_MS = 60 * 1000;
const OLD_MESSAGE_DELETE_CONCURRENCY = 5;
const RECREATABLE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement
]);
const PURGE_FREEZE_PERMISSIONS = [
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.AddReactions,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.CreatePublicThreads,
    PermissionsBitField.Flags.CreatePrivateThreads,
    PermissionsBitField.Flags.SendMessagesInThreads,
    PermissionsBitField.Flags.SendVoiceMessages,
    PermissionsBitField.Flags.UseApplicationCommands
];
const PURGE_FREEZE_BITS = PURGE_FREEZE_PERMISSIONS.reduce((bits, permission) => bits | permission, 0n);

function isUnknownMessageError(error) {
    return Number(error?.code || error?.rawError?.code || 0) === 10008;
}

function canBulkDelete(message, now = Date.now()) {
    const createdAt = Number(message?.createdTimestamp || 0);
    return createdAt > 0
        && createdAt >= now - BULK_DELETE_MAX_AGE_MS + BULK_DELETE_SAFETY_MS;
}

function toCollection(messages) {
    return new Collection(messages.map(message => [message.id, message]));
}

async function deleteOneMessage(message) {
    if (!message || message.deletable === false || typeof message.delete !== 'function') {
        return { deleted: 0, failed: 1, alreadyGone: 0 };
    }

    try {
        await message.delete();
        return { deleted: 1, failed: 0, alreadyGone: 0 };
    } catch (error) {
        if (isUnknownMessageError(error)) {
            return { deleted: 0, failed: 0, alreadyGone: 1 };
        }

        return { deleted: 0, failed: 1, alreadyGone: 0 };
    }
}

async function deleteMessagesIndividually(messages, concurrency = OLD_MESSAGE_DELETE_CONCURRENCY) {
    const result = { deleted: 0, failed: 0, alreadyGone: 0 };
    const batchSize = Math.max(1, Math.min(Number(concurrency) || 1, OLD_MESSAGE_DELETE_CONCURRENCY));

    for (let offset = 0; offset < messages.length; offset += batchSize) {
        const outcomes = await Promise.all(
            messages.slice(offset, offset + batchSize).map(deleteOneMessage)
        );

        for (const outcome of outcomes) {
            result.deleted += outcome.deleted;
            result.failed += outcome.failed;
            result.alreadyGone += outcome.alreadyGone;
        }
    }

    return result;
}

async function deleteMessageBatch(channel, messages, { includeOld = false } = {}) {
    const now = Date.now();
    const recent = messages.filter(message => canBulkDelete(message, now));
    const old = messages.filter(message => !canBulkDelete(message, now));
    const result = {
        deleted: 0,
        failed: 0,
        alreadyGone: 0,
        skippedOld: includeOld ? 0 : old.length
    };

    if (recent.length === 1) {
        const single = await deleteOneMessage(recent[0]);
        result.deleted += single.deleted;
        result.failed += single.failed;
        result.alreadyGone += single.alreadyGone;
    } else if (recent.length > 1) {
        const recentCollection = toCollection(recent);
        const deleted = await channel.bulkDelete(recentCollection, true);
        result.deleted += deleted.size;

        for (const message of recent) {
            if (!deleted.has(message.id)) {
                const single = await deleteOneMessage(message);
                result.deleted += single.deleted;
                result.failed += single.failed;
                result.alreadyGone += single.alreadyGone;
            }
        }
    }

    if (includeOld) {
        const individual = await deleteMessagesIndividually(old);
        result.deleted += individual.deleted;
        result.failed += individual.failed;
        result.alreadyGone += individual.alreadyGone;
    }

    return result;
}

async function fetchMessageBatch(channel, options) {
    return channel.messages.fetch({
        ...options,
        cache: false
    });
}

async function fetchMessagesForPurge(channel, options = {}) {
    const mode = options.mode === 'all' ? 'all' : 'count';

    if (mode === 'count') {
        const requested = Math.min(Math.max(Number(options.count) || 1, 1), BULK_DELETE_LIMIT);
        const batch = await fetchMessageBatch(channel, { limit: requested });
        const fetched = Array.from(batch.values());

        return {
            mode,
            requested,
            scanned: fetched.length,
            skippedOld: 0,
            messages: fetched
        };
    }

    const messages = [];
    let before;

    while (true) {
        const batch = await fetchMessageBatch(channel, {
            limit: BULK_DELETE_LIMIT,
            ...(before ? { before } : {})
        });

        if (batch.size === 0) {
            break;
        }

        const fetched = Array.from(batch.values());
        messages.push(...fetched);
        before = fetched[fetched.length - 1]?.id;

        if (batch.size < BULK_DELETE_LIMIT || !before) {
            break;
        }
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    return {
        mode,
        requested: null,
        scanned: messages.length,
        skippedOld: 0,
        messages
    };
}

function canRecreateChannelForPurge(channel) {
    return Boolean(
        channel
        && RECREATABLE_CHANNEL_TYPES.has(channel.type)
        && typeof channel.clone === 'function'
        && typeof channel.delete === 'function'
    );
}

function snapshotPermissionOverwrites(channel) {
    const cache = channel?.permissionOverwrites?.cache;
    if (!cache || typeof cache.values !== 'function') {
        const error = new TypeError('Discord permission overwrites are unavailable for this channel.');
        error.channelPermissionSnapshotFailed = true;
        throw error;
    }

    return Array.from(cache.values()).map(overwrite => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: BigInt(overwrite.allow?.bitfield ?? overwrite.allow ?? 0),
        deny: BigInt(overwrite.deny?.bitfield ?? overwrite.deny ?? 0)
    }));
}

function hasExactPermissionOverwrites(channel, expected) {
    const cache = channel?.permissionOverwrites?.cache;
    if (!cache || cache.size !== expected.length) {
        return false;
    }

    return expected.every(overwrite => {
        const restored = cache.get(overwrite.id);
        return restored
            && restored.type === overwrite.type
            && BigInt(restored.allow?.bitfield ?? restored.allow ?? 0) === overwrite.allow
            && BigInt(restored.deny?.bitfield ?? restored.deny ?? 0) === overwrite.deny;
    });
}

function buildFrozenPermissionOverwrites(channel, original) {
    const overwrites = original.map(overwrite => ({
        ...overwrite,
        allow: overwrite.allow & ~PURGE_FREEZE_BITS,
        deny: overwrite.deny | PURGE_FREEZE_BITS
    }));
    const everyoneId = channel?.guild?.roles?.everyone?.id || channel?.guild?.id;
    if (everyoneId && !overwrites.some(overwrite => overwrite.id === everyoneId)) {
        overwrites.push({
            id: everyoneId,
            type: 0,
            allow: 0n,
            deny: PURGE_FREEZE_BITS
        });
    }
    return overwrites;
}

async function freezeChannelForPurge(channel, original, reason = 'Gel temporaire avant archivage Sentinel') {
    if (!channel?.permissionOverwrites?.set) {
        const error = new TypeError('Discord permission overwrites cannot be frozen for this channel.');
        error.channelFreezeFailed = true;
        throw error;
    }
    const frozen = buildFrozenPermissionOverwrites(channel, original);
    await channel.permissionOverwrites.set(frozen, reason);
    return frozen;
}

async function restoreChannelPermissions(channel, original, reason = 'Restauration après archivage Sentinel interrompu') {
    if (!channel?.permissionOverwrites?.set) return false;
    await channel.permissionOverwrites.set(original, reason);
    return true;
}

function hasSameMessageIds(first, second) {
    const firstIds = Array.isArray(first?.messages) ? first.messages.map(message => String(message.id)).sort() : [];
    const secondIds = Array.isArray(second?.messages) ? second.messages.map(message => String(message.id)).sort() : [];
    return firstIds.length === secondIds.length && firstIds.every((id, index) => id === secondIds[index]);
}

async function recreateChannelForPurge(
    channel,
    reason = 'Vidage complet Sentinel après archive vérifiée',
    originalPermissionOverwrites = null,
    verifyBeforeDelete = null
) {
    if (!canRecreateChannelForPurge(channel)) {
        const error = new TypeError('This Discord channel cannot be recreated for a complete purge.');
        error.channelReplacementUnsupported = true;
        throw error;
    }

    let replacement = null;
    const permissionOverwrites = originalPermissionOverwrites || snapshotPermissionOverwrites(channel);

    try {
        replacement = await channel.clone({
            name: channel.name,
            position: channel.rawPosition,
            permissionOverwrites,
            defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration,
            defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser,
            reason
        });

        if (!hasExactPermissionOverwrites(replacement, permissionOverwrites)) {
            const error = new Error('Discord did not restore every channel permission overwrite.');
            error.channelPermissionRestoreFailed = true;
            throw error;
        }

        if (typeof replacement.setPosition === 'function'
            && Number.isFinite(channel.rawPosition)
            && replacement.rawPosition !== channel.rawPosition) {
            await replacement.setPosition(channel.rawPosition, { reason });
        }

        if (typeof verifyBeforeDelete === 'function' && !await verifyBeforeDelete()) {
            const error = new Error('Le contenu du salon a changé juste avant sa suppression.');
            error.archiveSnapshotChanged = true;
            throw error;
        }

        await channel.delete(reason);
        return replacement;
    } catch (error) {
        if (replacement && typeof replacement.delete === 'function') {
            await replacement.delete('Annulation du vidage complet Sentinel').catch(() => {});
        }

        error.channelReplacementFailed = true;
        throw error;
    }
}

async function purgeFetchedChannelMessages(channel, snapshot) {
    const mode = snapshot?.mode === 'all' ? 'all' : 'count';
    const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
    const result = {
        mode,
        requested: snapshot?.requested ?? null,
        scanned: Number(snapshot?.scanned || messages.length),
        deleted: 0,
        failed: 0,
        alreadyGone: 0,
        skippedOld: Number(snapshot?.skippedOld || 0),
        passes: messages.length > 0 ? 1 : 0,
        hasRemaining: false
    };

    for (let offset = 0; offset < messages.length; offset += BULK_DELETE_LIMIT) {
        let outcome;

        try {
            outcome = await deleteMessageBatch(
                channel,
                messages.slice(offset, offset + BULK_DELETE_LIMIT),
                { includeOld: true }
            );
        } catch (error) {
            error.purgeResult = { ...result };
            throw error;
        }
        result.deleted += outcome.deleted;
        result.failed += outcome.failed;
        result.alreadyGone += outcome.alreadyGone;
    }

    if (mode === 'all') {
        const remaining = await fetchMessageBatch(channel, { limit: 1 });
        result.hasRemaining = remaining.size > 0;
    }

    return result;
}

async function purgeChannelMessages(channel, options = {}) {
    if (!channel?.isTextBased?.() || !channel.messages?.fetch || typeof channel.bulkDelete !== 'function') {
        throw new TypeError('A Discord text channel with message history is required.');
    }

    if (options.mode === 'all') {
        const error = new Error('Complete purge must use the verified archive and channel recreation workflow.');
        error.completePurgeArchiveRequired = true;
        throw error;
    }

    const snapshot = await fetchMessagesForPurge(channel, options);
    return purgeFetchedChannelMessages(channel, snapshot);
}

module.exports = {
    BULK_DELETE_LIMIT,
    BULK_DELETE_MAX_AGE_MS,
    OLD_MESSAGE_DELETE_CONCURRENCY,
    canBulkDelete,
    canRecreateChannelForPurge,
    freezeChannelForPurge,
    fetchMessagesForPurge,
    hasExactPermissionOverwrites,
    hasSameMessageIds,
    purgeFetchedChannelMessages,
    purgeChannelMessages,
    recreateChannelForPurge,
    restoreChannelPermissions,
    snapshotPermissionOverwrites
};
