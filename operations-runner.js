'use strict';

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');

function createOperationsRunner(dependencies) {
    const {
        client,
        operations,
        communitySuite,
        runtimeGuard,
        featureFlags,
        colors,
        getMemberPortalGuild,
        buildCustomAnnouncementEmbed,
        addCustomEmbedRecord,
        getGuildLanguage,
        createGuildReport,
        reportIncident
    } = dependencies;
    let running = false;

    async function processMemberNotificationDigests() {
        if (!featureFlags.isFeatureEnabled('member-digests')) return { skipped: true, reason: 'feature-disabled' };
        let processed = 0;
        for (const item of operations.getDueMemberDigests(50)) {
            const executionKey = `${item.guildId}:${item.userId}`;
            const scheduledFor = item.nextDigestAt || item.periodKey || 'digest';
            if (!runtimeGuard.claimJobExecution('member-digest', executionKey, scheduledFor)) continue;
            const guild = client.guilds.cache.get(item.guildId);
            if (!guild) {
                const error = 'Serveur Discord introuvable.';
                operations.completeMemberDigest(item, { error });
                runtimeGuard.completeJobExecution('member-digest', executionKey, scheduledFor, { error });
                continue;
            }
            const member = guild.members.cache.get(item.userId)
                || await guild.members.fetch(item.userId).catch(() => null);
            if (!member) {
                const error = 'Le membre ne fait plus partie du serveur.';
                operations.completeMemberDigest(item, { error });
                runtimeGuard.completeJobExecution('member-digest', executionKey, scheduledFor, { error });
                continue;
            }
            try {
                const portal = getMemberPortalGuild(guild, item.userId);
                const notifications = portal.notifications.slice(0, 10);
                if (!notifications.length) {
                    operations.completeMemberDigest(item, { skipped: true, itemCount: 0 });
                    runtimeGuard.completeJobExecution('member-digest', executionKey, scheduledFor, { skipped: true, itemCount: 0 });
                    continue;
                }
                const recipient = member.user || await client.users.fetch(item.userId);
                const message = await recipient.send({
                    embeds: [new EmbedBuilder()
                        .setColor(colors.accent)
                        .setTitle(`Noctigarde | Registre personnel de ${guild.name}`)
                        .setDescription(item.digestFrequency === 'weekly'
                            ? 'Voici ton relevé hebdomadaire demandé depuis ton espace personnel.'
                            : 'Voici ton relevé quotidien demandé depuis ton espace personnel.')
                        .addFields(notifications.map(notification => ({
                            name: String(notification.title || 'Information').slice(0, 256),
                            value: String(notification.detail || 'Consulte ton espace Noctigarde.').slice(0, 1024)
                        })))
                        .setFooter({ text: 'Tu peux modifier ou arrêter ces messages depuis ton espace personnel.' })
                        .setTimestamp()],
                    allowedMentions: { parse: [] }
                });
                operations.completeMemberDigest(item, { messageId: message.id, itemCount: notifications.length });
                runtimeGuard.completeJobExecution('member-digest', executionKey, scheduledFor, { messageId: message.id, itemCount: notifications.length });
                processed += 1;
            } catch (error) {
                operations.completeMemberDigest(item, { error: error.message || error });
                runtimeGuard.completeJobExecution('member-digest', executionKey, scheduledFor, { error });
                reportIncident('member-digest', error, { guildId: item.guildId, userId: item.userId });
            }
        }
        return { skipped: false, processed };
    }

    async function processTeamShiftReminders() {
        if (!featureFlags.isFeatureEnabled('planning-reminders')) return { skipped: true, reason: 'feature-disabled' };
        let processed = 0;
        for (const shift of communitySuite.getDueShiftReminders(50)) {
            const guild = client.guilds.cache.get(shift.guildId);
            if (!guild) {
                communitySuite.markShiftReminderSent(shift.guildId, shift.id);
                continue;
            }
            const fullShift = communitySuite.getTeamShift(shift.guildId, shift.id);
            const attendees = fullShift?.responses?.filter(response => response.status === 'available') || [];
            const dateLabel = new Date(shift.startsAt).toLocaleString('fr-FR', {
                dateStyle: 'full',
                timeStyle: 'short',
                timeZone: 'Europe/Paris'
            });
            for (const response of attendees) {
                const user = await client.users.fetch(response.userId).catch(() => null);
                if (!user) continue;
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setColor(colors.accent)
                        .setTitle('Noctigarde | Rappel de service')
                        .setDescription(`Le créneau **${shift.title}** commence ${dateLabel}.`)
                        .addFields({ name: 'Serveur', value: guild.name, inline: true })
                        .setFooter({ text: 'Ta disponibilité est enregistrée dans ton espace Noctigarde.' })
                        .setTimestamp()],
                    allowedMentions: { parse: [] }
                }).catch(() => null);
            }
            const channel = shift.channelId ? guild.channels.cache.get(shift.channelId) : null;
            if (channel?.isTextBased?.()) {
                await channel.send({
                    content: shift.roleId ? `<@&${shift.roleId}>` : '',
                    embeds: [new EmbedBuilder()
                        .setColor(colors.accent)
                        .setTitle(`Rappel | ${shift.title}`)
                        .setDescription(`${dateLabel}\n${attendees.length} membre(s) ont confirmé leur présence.`)
                        .setTimestamp()],
                    allowedMentions: shift.roleId ? { roles: [shift.roleId] } : { parse: [] }
                }).catch(error => reportIncident('planning-reminder-channel', error, { guildId: guild.id, shiftId: shift.id }));
            }
            communitySuite.markShiftReminderSent(shift.guildId, shift.id);
            processed += 1;
        }
        return { skipped: false, processed };
    }

    async function processScheduledAnnouncements() {
        if (!featureFlags.isFeatureEnabled('scheduled-announcements')) return;
        for (const item of operations.getDueScheduledAnnouncements()) {
            const executionKey = String(item.id);
            const scheduledFor = item.nextRunAt || 'once';
            if (!runtimeGuard.claimJobExecution('scheduled-announcement', executionKey, scheduledFor)) continue;
            const guild = client.guilds.cache.get(item.guildId);
            const channel = guild?.channels?.cache?.get(item.channelId);
            if (!guild || !channel?.isTextBased?.()) {
                const error = 'Serveur ou salon Discord introuvable.';
                operations.completeScheduledAnnouncement(item, { error });
                runtimeGuard.completeJobExecution('scheduled-announcement', executionKey, scheduledFor, { error });
                continue;
            }
            try {
                const message = await channel.send({
                    embeds: [buildCustomAnnouncementEmbed(item, getGuildLanguage(guild.id))],
                    allowedMentions: { parse: [] }
                });
                addCustomEmbedRecord(guild.id, channel.id, message.id, item.createdByUserId, item);
                operations.completeScheduledAnnouncement(item, { messageId: message.id });
                runtimeGuard.completeJobExecution('scheduled-announcement', executionKey, scheduledFor, { messageId: message.id });
            } catch (error) {
                operations.completeScheduledAnnouncement(item, { error: error.message || error });
                runtimeGuard.completeJobExecution('scheduled-announcement', executionKey, scheduledFor, { error });
                reportIncident('scheduled-announcement', error, { guildId: item.guildId, announcementId: item.id });
            }
        }
    }

    async function processScheduledReports() {
        if (!featureFlags.isFeatureEnabled('scheduled-reports')) return;
        for (const item of operations.getDueReportSchedules()) {
            const executionKey = String(item.id);
            const scheduledFor = item.nextRunAt || 'once';
            if (!runtimeGuard.claimJobExecution('scheduled-report', executionKey, scheduledFor)) continue;
            const guild = client.guilds.cache.get(item.guildId);
            const channel = guild?.channels?.cache?.get(item.channelId);
            if (!guild || !channel?.isTextBased?.()) {
                const error = 'Serveur ou salon Discord introuvable.';
                operations.completeReportSchedule(item, { error });
                runtimeGuard.completeJobExecution('scheduled-report', executionKey, scheduledFor, { error });
                continue;
            }
            try {
                const report = createGuildReport(guild, item.reportKind, item.format);
                const message = await channel.send({
                    content: `Rapport Noctigarde automatique : **${report.title}**`,
                    files: [new AttachmentBuilder(report.buffer, { name: report.fileName })],
                    allowedMentions: { parse: [] }
                });
                operations.completeReportSchedule(item, { messageId: message.id });
                runtimeGuard.completeJobExecution('scheduled-report', executionKey, scheduledFor, { messageId: message.id });
            } catch (error) {
                operations.completeReportSchedule(item, { error: error.message || error });
                runtimeGuard.completeJobExecution('scheduled-report', executionKey, scheduledFor, { error });
                reportIncident('scheduled-report', error, { guildId: item.guildId, scheduleId: item.id });
            }
        }
    }

    async function run() {
        if (running) return { skipped: true, reason: 'already-running' };
        running = true;
        try {
            await processScheduledAnnouncements();
            await processScheduledReports();
            await processMemberNotificationDigests();
            await processTeamShiftReminders();
            return { skipped: false };
        } finally {
            running = false;
        }
    }

    return { run, processMemberNotificationDigests, processTeamShiftReminders };
}

module.exports = { createOperationsRunner };
