'use strict';

const {
    ChannelType,
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');
const { recreateChannelForPurge } = require('./message-purge');

function boolEnvValue(value, fallback = false) {
    value = String(value || '').trim().toLowerCase();
    if (!value) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value);
}

function stagingValidationConfig(env = process.env) {
    const guildId = String(env.SENTINEL_STAGING_GUILD_ID || '').trim();
    const moderationMemberId = String(env.SENTINEL_STAGING_MEMBER_ID || '').trim();
    const banTargetId = String(env.SENTINEL_STAGING_BAN_TARGET_ID || '').trim();
    const config = {
        guildId: /^\d{17,20}$/.test(guildId) ? guildId : null,
        required: boolEnvValue(env.SENTINEL_STAGING_VALIDATION_REQUIRED, false),
        realActions: boolEnvValue(env.SENTINEL_STAGING_REAL_ACTIONS, false),
        moderationMemberId: /^\d{17,20}$/.test(moderationMemberId) ? moderationMemberId : null,
        banTargetId: /^\d{17,20}$/.test(banTargetId) ? banTargetId : null,
        enabled: Boolean(/^\d{17,20}$/.test(guildId))
    };
    const issues = [];

    if (guildId && !config.guildId) issues.push('SENTINEL_STAGING_GUILD_ID doit être un identifiant Discord valide.');
    if (moderationMemberId && !config.moderationMemberId) issues.push('SENTINEL_STAGING_MEMBER_ID doit être un identifiant Discord valide.');
    if (banTargetId && !config.banTargetId) issues.push('SENTINEL_STAGING_BAN_TARGET_ID doit être un identifiant Discord valide.');
    if (config.required && !config.enabled) issues.push('SENTINEL_STAGING_GUILD_ID est obligatoire pour la validation bloquante.');
    if (config.required && !config.realActions) issues.push('SENTINEL_STAGING_REAL_ACTIONS doit être activé pour une validation bloquante complète.');
    if (config.realActions && !config.moderationMemberId) issues.push('Un compte de test dédié au timeout est obligatoire.');
    if (config.realActions && !config.banTargetId) issues.push('Un compte de test dédié au bannissement est obligatoire.');
    if (config.moderationMemberId && config.moderationMemberId === config.banTargetId) {
        issues.push('Les comptes de test du timeout et du bannissement doivent être différents.');
    }

    return { ...config, issues, ready: config.enabled && issues.length === 0 };
}

async function deleteSafely(resource, reason) {
    if (!resource?.delete) return;
    await resource.delete(reason).catch(() => null);
}

async function runDiscordStagingValidation(client, options = {}) {
    const config = stagingValidationConfig();
    if (config.issues.length && (config.required || config.enabled || config.realActions)) {
        throw new Error(`Configuration de préproduction incomplète : ${config.issues.join(' ')}`);
    }
    if (!config.enabled) {
        return { skipped: true, reason: 'staging_guild_not_configured', checks: [] };
    }

    const guild = client.guilds.cache.get(config.guildId)
        || await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) throw new Error('Le serveur Discord de préproduction est introuvable.');
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember) throw new Error('Noctigarde n’est pas membre du serveur Discord de préproduction.');

    const requiredPermissions = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageRoles,
        PermissionsBitField.Flags.ModerateMembers,
        PermissionsBitField.Flags.KickMembers,
        PermissionsBitField.Flags.BanMembers
    ];
    const missingPermissions = requiredPermissions.filter(permission => !botMember.permissions.has(permission));
    const checks = [{
        key: 'permissions',
        label: 'Permissions de préproduction',
        ok: missingPermissions.length === 0,
        detail: missingPermissions.length ? missingPermissions.map(String).join(', ') : null
    }];
    if (missingPermissions.length) {
        const error = new Error('Permissions Discord insuffisantes sur le serveur de préproduction.');
        error.checks = checks;
        throw error;
    }

    const suffix = Date.now().toString(36);
    let role = null;
    let category = null;
    let validationChannel = null;
    let dossierChannel = null;
    let moderationMember = null;
    let temporaryBanApplied = false;

    try {
        role = await guild.roles.create({
            name: `sentinel-validation-${suffix}`,
            permissions: [],
            reason: 'Validation automatique Noctigarde avant mise en service'
        });
        checks.push({
            key: 'role-create',
            label: 'Création du rôle temporaire',
            ok: Boolean(role?.id)
        });
        checks.push({
            key: 'role-hierarchy',
            label: 'Hiérarchie du rôle Noctigarde',
            ok: botMember.roles.highest.position > role.position,
            detail: botMember.roles.highest.position > role.position ? null : 'Le rôle Noctigarde doit rester au-dessus des rôles gérés.'
        });

        category = await guild.channels.create({
            name: `sentinel-validation-${suffix}`,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                {
                    id: botMember.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.EmbedLinks,
                        PermissionsBitField.Flags.ManageChannels
                    ]
                }
            ],
            reason: 'Validation automatique Noctigarde avant mise en service'
        });
        validationChannel = await guild.channels.create({
            name: `controle-${suffix}`,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: 'Validation automatique Noctigarde avant mise en service'
        });
        dossierChannel = await guild.channels.create({
            name: `dossier-test-${suffix}`,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: botMember.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ],
            reason: 'Validation du routage privé des dossiers Noctigarde'
        });
        const testMessage = await validationChannel.send({
            embeds: [new EmbedBuilder()
                .setColor(0x2dd4bf)
                .setTitle('Noctigarde | Validation de préproduction')
                .setDescription('Canal, permissions, embed et envoi Discord validés.')] ,
            allowedMentions: { parse: [] }
        });
        const dossierMessage = await dossierChannel.send({
            content: 'Dossier privé de validation Noctigarde. Aucun membre réel n’est sanctionné.',
            allowedMentions: { parse: [] }
        });
        checks.push({ key: 'channel-lifecycle', label: 'Création des salons temporaires', ok: Boolean(validationChannel?.id && category?.id) });
        checks.push({ key: 'dossier-private', label: 'Dossier privé et routage de rôle', ok: Boolean(dossierChannel?.id && role?.id) });
        checks.push({ key: 'message-embed', label: 'Envoi message et embed', ok: Boolean(testMessage?.id && dossierMessage?.id) });

        const originalValidationChannelId = validationChannel.id;
        validationChannel = await recreateChannelForPurge(
            validationChannel,
            'Validation de la recréation sécurisée Noctigarde'
        );
        checks.push({
            key: 'channel-recreation',
            label: 'Recréation de salon et permissions exactes',
            ok: Boolean(validationChannel?.id && validationChannel.id !== originalValidationChannelId)
        });

        const freeAccessOk = typeof options.verifyFreeAccess === 'function'
            ? Boolean(await options.verifyFreeAccess(guild))
            : true;
        checks.push({
            key: 'free-access-suspended-premium',
            label: 'Accès complet sans paiement pendant la démonstration',
            ok: freeAccessOk,
            detail: freeAccessOk ? null : 'Une restriction Premium ou de paiement est encore active.'
        });

        if (config.realActions) {
            if (!config.moderationMemberId || !config.banTargetId) {
                throw new Error('Les IDs de membre de timeout et de cible de bannissement sont obligatoires pour les actions réelles de préproduction.');
            }
            moderationMember = await guild.members.fetch(config.moderationMemberId).catch(() => null);
            if (!moderationMember || moderationMember.user.bot || moderationMember.id === guild.ownerId) {
                throw new Error('Le membre de timeout de préproduction est absent, propriétaire ou automatisé.');
            }
            if (!moderationMember.moderatable || moderationMember.communicationDisabledUntilTimestamp > Date.now()) {
                throw new Error('Le membre de timeout doit être modérable et ne pas avoir de timeout actif.');
            }
            await moderationMember.timeout(5000, 'Validation automatique Noctigarde avant mise en service');
            const timedMember = await guild.members.fetch(config.moderationMemberId);
            checks.push({
                key: 'timeout-live',
                label: 'Timeout réel sur le compte de préproduction',
                ok: timedMember.communicationDisabledUntilTimestamp > Date.now()
            });
            await moderationMember.timeout(null, 'Fin de validation automatique Noctigarde');

            const banTargetMember = await guild.members.fetch(config.banTargetId).catch(() => null);
            if (banTargetMember) throw new Error('La cible de bannissement de préproduction doit être un compte de test absent du serveur.');
            await guild.members.ban(config.banTargetId, {
                deleteMessageSeconds: 0,
                reason: 'Validation automatique Noctigarde avant mise en service'
            });
            temporaryBanApplied = true;
            const ban = await guild.bans.fetch(config.banTargetId).catch(() => null);
            checks.push({ key: 'ban-live', label: 'Bannissement réel du compte de préproduction', ok: Boolean(ban) });
            await guild.members.unban(config.banTargetId, 'Fin de validation automatique Noctigarde');
            temporaryBanApplied = false;
        } else {
            checks.push({
                key: 'sanctions-live-skipped',
                label: 'Sanctions réelles de préproduction',
                ok: !config.required,
                detail: 'Active SENTINEL_STAGING_REAL_ACTIONS avec deux comptes de test dédiés pour ce contrôle.'
            });
        }

        await deleteSafely(dossierChannel, 'Fin de validation Noctigarde');
        dossierChannel = null;
        await deleteSafely(validationChannel, 'Fin de validation Noctigarde');
        validationChannel = null;
        await deleteSafely(category, 'Fin de validation Noctigarde');
        category = null;
        const roleId = role.id;
        await deleteSafely(role, 'Fin de validation Noctigarde');
        role = null;
        const deletedRole = await guild.roles.fetch(roleId).catch(() => null);
        checks.push({ key: 'role-delete', label: 'Suppression et réparation du rôle temporaire', ok: !deletedRole });

        const failed = checks.filter(check => !check.ok);
        if (failed.length) {
            const error = new Error(`Validation Discord échouée : ${failed.map(check => check.label).join(', ')}.`);
            error.checks = checks;
            throw error;
        }
        return { skipped: false, guildId: guild.id, checks };
    } finally {
        if (moderationMember?.communicationDisabledUntilTimestamp > Date.now()) {
            await moderationMember.timeout(null, 'Nettoyage de validation Noctigarde').catch(() => null);
        }
        if (temporaryBanApplied && config.banTargetId) {
            await guild.members.unban(config.banTargetId, 'Nettoyage de validation Noctigarde').catch(() => null);
        }
        await deleteSafely(dossierChannel, 'Nettoyage de validation Noctigarde');
        await deleteSafely(validationChannel, 'Nettoyage de validation Noctigarde');
        await deleteSafely(category, 'Nettoyage de validation Noctigarde');
        await deleteSafely(role, 'Nettoyage de validation Noctigarde');
    }
}

module.exports = { runDiscordStagingValidation, stagingValidationConfig };
