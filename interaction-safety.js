'use strict';

const DEFAULT_ACKNOWLEDGEMENT_DEADLINE_MS = 2200;

function isUnknownInteractionError(error) {
    return Number(error?.code) === 10062
        || /unknown interaction/i.test(String(error?.message || ''));
}

function getInteractionAction(interaction) {
    if (interaction?.isChatInputCommand?.()) {
        return `/${String(interaction.commandName || 'unknown').slice(0, 100)}`;
    }

    if (interaction?.isModalSubmit?.()) {
        return getSafeComponentAction(interaction.customId, 'modal');
    }

    if (interaction?.isStringSelectMenu?.()) {
        return getSafeComponentAction(interaction.customId, 'select');
    }

    if (interaction?.isButton?.()) {
        return getSafeComponentAction(interaction.customId, 'button');
    }

    return 'unknown';
}

function getSafeComponentAction(customId, fallback) {
    const parts = String(customId || '').split(':').filter(Boolean);

    if (!parts.length) {
        return fallback;
    }

    const safeParts = parts
        .filter(part => !/^\d{12,20}$/.test(part) && !/^\d{10,}$/.test(part))
        .slice(0, 2);

    return safeParts.length ? safeParts.join(':').slice(0, 120) : fallback;
}

function getInteractionIncidentContext(interaction, startedAt = null, extra = {}) {
    const elapsedMs = typeof startedAt === 'bigint'
        ? Number(process.hrtime.bigint() - startedAt) / 1e6
        : null;

    return {
        action: getInteractionAction(interaction),
        interactionType: Number.isFinite(Number(interaction?.type)) ? Number(interaction.type) : null,
        acknowledged: Boolean(interaction?.deferred || interaction?.replied),
        deferred: Boolean(interaction?.deferred),
        replied: Boolean(interaction?.replied),
        elapsedMs: elapsedMs === null ? null : Math.round(elapsedMs),
        ...extra
    };
}

function getDiscordErrorContext(error) {
    return {
        discordCode: Number.isFinite(Number(error?.code)) ? Number(error.code) : null,
        httpStatus: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
        method: String(error?.method || error?.request?.method || '').slice(0, 12) || null,
        interactionExpired: isUnknownInteractionError(error)
    };
}

function stripInitialResponseOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        return options;
    }

    const normalized = { ...options };
    delete normalized.ephemeral;
    delete normalized.fetchReply;
    delete normalized.flags;
    delete normalized.withResponse;
    return normalized;
}

function installInteractionDeadlineGuard(interaction, {
    timeoutMs = DEFAULT_ACKNOWLEDGEMENT_DEADLINE_MS,
    onError = null
} = {}) {
    if (!interaction?.isRepliable?.()) {
        return { dispose() {} };
    }

    const original = {
        reply: interaction.reply.bind(interaction),
        update: typeof interaction.update === 'function' ? interaction.update.bind(interaction) : null,
        showModal: typeof interaction.showModal === 'function' ? interaction.showModal.bind(interaction) : null,
        deferReply: interaction.deferReply.bind(interaction),
        deferUpdate: typeof interaction.deferUpdate === 'function' ? interaction.deferUpdate.bind(interaction) : null,
        editReply: interaction.editReply.bind(interaction),
        followUp: interaction.followUp.bind(interaction)
    };
    let acknowledgementMode = null;
    let pendingAcknowledgement = null;
    let disposed = false;

    const clearDeadline = () => {
        if (deadline) {
            clearTimeout(deadline);
            deadline = null;
        }
    };
    const waitForPendingAcknowledgement = async () => {
        if (pendingAcknowledgement) {
            await pendingAcknowledgement;
        }
    };

    let deadline = setTimeout(() => {
        if (disposed || interaction.deferred || interaction.replied) {
            return;
        }

        acknowledgementMode = interaction.isMessageComponent?.() && original.deferUpdate
            ? 'update'
            : 'reply';
        pendingAcknowledgement = (acknowledgementMode === 'update'
            ? original.deferUpdate()
            : original.deferReply({ flags: 64 }))
            .catch(error => {
                acknowledgementMode = null;
                if (typeof onError === 'function') {
                    onError(error);
                }
            })
            .finally(() => {
                pendingAcknowledgement = null;
            });
    }, Math.max(10, Number(timeoutMs) || DEFAULT_ACKNOWLEDGEMENT_DEADLINE_MS));
    deadline.unref?.();

    interaction.deferReply = async options => {
        clearDeadline();
        acknowledgementMode = 'reply';
        return original.deferReply(options);
    };

    if (original.deferUpdate) {
        interaction.deferUpdate = async options => {
            clearDeadline();
            acknowledgementMode = 'update';
            return original.deferUpdate(options);
        };
    }

    interaction.reply = async options => {
        clearDeadline();
        await waitForPendingAcknowledgement();

        if (interaction.deferred) {
            if (acknowledgementMode === 'update') {
                return original.followUp(options);
            }

            return original.editReply(stripInitialResponseOptions(options));
        }

        if (interaction.replied) {
            return original.followUp(options);
        }

        return original.reply(options);
    };

    if (original.update) {
        interaction.update = async options => {
            clearDeadline();
            await waitForPendingAcknowledgement();

            if (interaction.deferred || interaction.replied) {
                return original.editReply(stripInitialResponseOptions(options));
            }

            return original.update(options);
        };
    }

    if (original.showModal) {
        interaction.showModal = async modal => {
            clearDeadline();
            await waitForPendingAcknowledgement();
            return original.showModal(modal);
        };
    }

    return {
        dispose() {
            disposed = true;
            clearDeadline();
        }
    };
}

module.exports = {
    DEFAULT_ACKNOWLEDGEMENT_DEADLINE_MS,
    getDiscordErrorContext,
    getInteractionAction,
    getInteractionIncidentContext,
    installInteractionDeadlineGuard,
    isUnknownInteractionError,
    stripInitialResponseOptions
};
