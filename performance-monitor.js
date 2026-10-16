'use strict';

function percentile(values, ratio) {
    if (!values.length) {
        return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1);
    return Math.round(sorted[index] * 10) / 10;
}

function createPerformanceMonitor(options = {}) {
    const getGatewayPing = typeof options.getGatewayPing === 'function'
        ? options.getGatewayPing
        : () => 0;
    const state = {
        startedAt: new Date().toISOString(),
        dashboard: {
            requestCount: 0,
            errorCount: 0,
            slowRequestCount: 0,
            maxDurationMs: 0,
            recentDurations: [],
            recentSlowRequests: []
        },
        discord: {
            interactionCount: 0,
            errorCount: 0,
            slowInteractionCount: 0,
            maxDurationMs: 0,
            recentDurations: [],
            recentSlowInteractions: []
        }
    };

    function recordDashboardRequest({ durationMs, status, method, route }) {
        const bucket = state.dashboard;
        const duration = Math.max(Number(durationMs) || 0, 0);
        bucket.requestCount += 1;
        bucket.errorCount += Number(status) >= 500 ? 1 : 0;
        bucket.maxDurationMs = Math.max(bucket.maxDurationMs, duration);
        bucket.recentDurations.push(duration);
        bucket.recentDurations = bucket.recentDurations.slice(-500);

        if (duration >= 1000) {
            bucket.slowRequestCount += 1;
            bucket.recentSlowRequests.unshift({
                method: String(method || 'GET').slice(0, 12),
                route: String(route || '/').replace(/\d{17,20}/g, ':id').slice(0, 160),
                status: Number(status) || 0,
                durationMs: Math.round(duration),
                occurredAt: new Date().toISOString()
            });
            bucket.recentSlowRequests.length = Math.min(bucket.recentSlowRequests.length, 25);
        }
    }

    function recordDiscordInteraction(interaction, durationMs, failed = false) {
        const bucket = state.discord;
        const duration = Math.max(Number(durationMs) || 0, 0);
        bucket.interactionCount += 1;
        bucket.errorCount += failed ? 1 : 0;
        bucket.maxDurationMs = Math.max(bucket.maxDurationMs, duration);
        bucket.recentDurations.push(duration);
        bucket.recentDurations = bucket.recentDurations.slice(-500);

        if (duration >= 1500) {
            bucket.slowInteractionCount += 1;
            bucket.recentSlowInteractions.unshift({
                type: interaction?.isChatInputCommand?.() ? 'command' : (interaction?.isButton?.() ? 'button' : 'interaction'),
                name: String(interaction?.commandName || interaction?.customId || 'unknown').slice(0, 120),
                durationMs: Math.round(duration),
                failed: Boolean(failed),
                occurredAt: new Date().toISOString()
            });
            bucket.recentSlowInteractions.length = Math.min(bucket.recentSlowInteractions.length, 25);
        }
    }

    function status() {
        const dashboard = state.dashboard;
        const discord = state.discord;

        return {
            startedAt: state.startedAt,
            dashboard: {
                requestCount: dashboard.requestCount,
                errorCount: dashboard.errorCount,
                slowRequestCount: dashboard.slowRequestCount,
                p50Ms: percentile(dashboard.recentDurations, 0.5),
                p95Ms: percentile(dashboard.recentDurations, 0.95),
                maxDurationMs: Math.round(dashboard.maxDurationMs * 10) / 10,
                recentSlowRequests: dashboard.recentSlowRequests.map(item => ({ ...item }))
            },
            discord: {
                interactionCount: discord.interactionCount,
                errorCount: discord.errorCount,
                slowInteractionCount: discord.slowInteractionCount,
                p50Ms: percentile(discord.recentDurations, 0.5),
                p95Ms: percentile(discord.recentDurations, 0.95),
                maxDurationMs: Math.round(discord.maxDurationMs * 10) / 10,
                gatewayPingMs: Math.max(Number(getGatewayPing()) || 0, 0),
                recentSlowInteractions: discord.recentSlowInteractions.map(item => ({ ...item }))
            }
        };
    }

    return { recordDashboardRequest, recordDiscordInteraction, status };
}

module.exports = { createPerformanceMonitor, percentile };
