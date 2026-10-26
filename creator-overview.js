function protectStorageOverview(storage, isFounder) {
    if (!storage || isFounder || storage.error) return storage;

    return {
        ...storage,
        latestFile: null,
        lastBackupFailure: storage.lastBackupFailure
            ? { occurredAt: storage.lastBackupFailure.occurredAt }
            : null,
        media: storage.media ? {
            ...storage.media,
            objectStorage: storage.media.objectStorage ? {
                enabled: storage.media.objectStorage.enabled,
                configured: storage.media.objectStorage.configured,
                provider: storage.media.objectStorage.provider
            } : null
        } : null,
        backups: (storage.backups || []).map(({ fileName, ...backup }) => ({
            ...backup,
            verification: backup.verification ? {
                status: backup.verification.status,
                checkedAt: backup.verification.checkedAt,
                integrityResult: backup.verification.integrityResult,
                durationMs: backup.verification.durationMs
            } : null
        })),
        coldArchives: (storage.coldArchives || []).map(({ fileName, ...archive }) => archive),
        lastMaintenance: storage.lastMaintenance ? {
            startedAt: storage.lastMaintenance.startedAt,
            completedAt: storage.lastMaintenance.completedAt,
            durationMs: storage.lastMaintenance.durationMs,
            reason: storage.lastMaintenance.reason,
            cleanup: storage.lastMaintenance.cleanup,
            archived: storage.lastMaintenance.archived ? {
                automodEvents: storage.lastMaintenance.archived.automodEvents,
                dashboardAuditLogs: storage.lastMaintenance.archived.dashboardAuditLogs,
                bytes: storage.lastMaintenance.archived.bytes
            } : null,
            backupVerification: storage.lastMaintenance.backupVerification ? {
                status: storage.lastMaintenance.backupVerification.status,
                checkedAt: storage.lastMaintenance.backupVerification.checkedAt,
                durationMs: storage.lastMaintenance.backupVerification.durationMs
            } : null,
            media: storage.lastMaintenance.media ? {
                checked: storage.lastMaintenance.media.checked,
                orphaned: storage.lastMaintenance.media.orphaned,
                synchronized: storage.lastMaintenance.media.synchronized,
                purged: storage.lastMaintenance.media.purged
            } : null
        } : null,
        alerts: (storage.alerts || []).map(alert => ({
            key: alert.key,
            level: alert.level,
            message: alert.message,
            firstSeenAt: alert.firstSeenAt,
            lastSeenAt: alert.lastSeenAt
        })),
        performance: {
            database: storage.performance?.database ? {
                ...storage.performance.database,
                recentSlowQueries: []
            } : null,
            runtime: storage.performance?.runtime ? {
                ...storage.performance.runtime,
                dashboard: {
                    ...storage.performance.runtime.dashboard,
                    recentSlowRequests: []
                },
                discord: {
                    ...storage.performance.runtime.discord,
                    recentSlowInteractions: []
                }
            } : null
        }
    };
}

async function buildCreatorOverview({ ctx, session, governance, getSiteAccess, getSiteStaffUsers }) {
    const siteAccess = await getSiteAccess(ctx, session?.user?.id);
    const storage = ctx.helpers.getDatabaseBackupStatus?.() || null;

    return {
        generatedAt: new Date().toISOString(),
        canView: true,
        access: siteAccess,
        summary: { guildCount: ctx.client.guilds.cache.size },
        storage: protectStorageOverview(storage, siteAccess.isFounder),
        founderMfa: siteAccess.isFounder
            ? governance.getFounderMfaStatus(session?.user?.id)
            : null,
        criticalActions: governance.listCriticalActions({ scope: 'global', limit: 50 }),
        runtimeHealth: {
            incidents: ctx.helpers.listIncidents?.({ status: 'open', limit: 100 }) || [],
            resolvedIncidents: ctx.helpers.listIncidents?.({ status: 'resolved', limit: 20 }) || [],
            jobs: ctx.helpers.getJobHealth?.(50) || []
        },
        featureFlags: ctx.helpers.getFeatureFlags?.() || [],
        databasePortability: siteAccess.isFounder
            ? (ctx.helpers.getDatabasePortability?.() || null)
            : null,
        stagingValidation: ctx.helpers.getStagingValidationStatus?.() || null,
        privacyRequests: siteAccess.isFounder
            ? (ctx.helpers.listPrivacyRequests?.({ status: 'pending', limit: 100 }) || [])
            : [],
        staff: await getSiteStaffUsers(ctx),
        guilds: []
    };
}

module.exports = {
    buildCreatorOverview,
    protectStorageOverview
};
