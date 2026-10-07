const { ChannelType, Collection } = require('discord.js');

const BULK_DELETE_LIMIT = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BULK_DELETE_SAFETY_MS = 60 * 1000;
const OLD_MESSAGE_DELETE_CONCURRENCY = 5;
const RECREATABLE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement
]);

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

async function recreateChannelForPurge(channel, reason = 'Vidage complet Sentinel après archive vérifiée') {
    if (!canRecreateChannelForPurge(channel)) {
        const error = new TypeError('This Discord channel cannot be recreated for a complete purge.');
        error.channelReplacementUnsupported = true;
        throw error;
    }

    let replacement = null;

    try {
        replacement = await channel.clone({
            name: channel.name,
            position: channel.rawPosition,
            defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration,
            defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser,
            reason
        });

        if (typeof replacement.setPosition === 'function'
            && Number.isFinite(channel.rawPosition)
            && replacement.rawPosition !== channel.rawPosition) {
            await replacement.setPosition(channel.rawPosition, { reason });
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
    fetchMessagesForPurge,
    purgeFetchedChannelMessages,
    purgeChannelMessages,
    recreateChannelForPurge
};
