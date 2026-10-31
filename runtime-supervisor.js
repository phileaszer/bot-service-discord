'use strict';

const DEFAULT_HEALTH_INTERVAL_MS = 60_000;
const DEFAULT_FAILURE_THRESHOLD = 3;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createRuntimeSupervisor(options = {}) {
    const client = options.client;
    const database = options.database;
    const reportIncident = options.reportIncident;
    const resolveIncident = options.resolveIncident;
    const checkDatabase = options.checkDatabase;
    const getStoragePromise = options.getStoragePromise || (() => null);
    const onClearRuntimeTimers = options.onClearRuntimeTimers || (() => {});
    const healthIntervalMs = Math.max(Number(options.healthIntervalMs) || DEFAULT_HEALTH_INTERVAL_MS, 1_000);
    const failureThreshold = Math.max(Number(options.failureThreshold) || DEFAULT_FAILURE_THRESHOLD, 1);
    const timers = new Set();
    const healthFailures = new Map();
    const healthRecoveries = new Map();
    const healthIncidents = new Map();
    let dashboardServer = null;
    let shutdownPromise = null;
    let expectedHealthCheckAt = Date.now() + healthIntervalMs;

    function safeContext(contextFactory, args) {
        try {
            return typeof contextFactory === 'function' ? (contextFactory(...args) || {}) : {};
        } catch (error) {
            return { contextError: String(error?.message || error).slice(0, 200) };
        }
    }

    function guard(source, contextFactory, listener, settings = {}) {
        return (...args) => Promise.resolve()
            .then(() => listener(...args))
            .catch(error => {
                reportIncident(
                    source,
                    error,
                    safeContext(contextFactory, args),
                    settings.fatal ? 'critical' : 'error'
                );
                if (settings.fatal) shutdown(`${source}-failure`, 1);
            });
    }

    function on(event, source, contextFactory, listener) {
        client.on(event, guard(source, contextFactory, listener));
    }

    function once(event, source, contextFactory, listener) {
        client.once(event, guard(source, contextFactory, listener));
    }

    function onceFatal(event, source, contextFactory, listener) {
        client.once(event, guard(source, contextFactory, listener, { fatal: true }));
    }

    function scheduleInterval(handler, intervalMs) {
        const timer = setInterval(handler, intervalMs);
        timer.unref?.();
        timers.add(timer);
        return timer;
    }

    function scheduleTimeout(handler, timeoutMs) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            handler();
        }, timeoutMs);
        timer.unref?.();
        timers.add(timer);
        return timer;
    }

    function clearRuntimeTimers() {
        for (const timer of timers) {
            clearInterval(timer);
            clearTimeout(timer);
        }
        timers.clear();
        onClearRuntimeTimers();
    }

    async function closeDashboardServer() {
        if (!dashboardServer?.listening) return;
        await Promise.race([
            new Promise(resolve => dashboardServer.close(resolve)),
            delay(2_000).then(() => dashboardServer.closeAllConnections?.())
        ]);
    }

    function shutdown(reason = 'shutdown', exitCode = 0) {
        if (shutdownPromise) return shutdownPromise;

        shutdownPromise = (async () => {
            console.log(JSON.stringify({
                level: exitCode ? 'error' : 'info',
                event: 'sentinel_shutdown',
                reason,
                timestamp: new Date().toISOString()
            }));
            clearRuntimeTimers();
            await closeDashboardServer().catch(() => {});
            client?.destroy?.();
            const storagePromise = getStoragePromise();
            if (storagePromise) {
                await Promise.race([Promise.resolve(storagePromise).catch(() => {}), delay(3_000)]);
            }
            try {
                if (database?.open) database.close();
            } catch (error) {
                console.error(JSON.stringify({
                    level: 'error',
                    event: 'sentinel_database_close_failed',
                    message: String(error?.message || error).slice(0, 500),
                    timestamp: new Date().toISOString()
                }));
            }
            process.exitCode = exitCode;
        })();

        const forceExit = setTimeout(() => process.exit(exitCode), 7_000);
        shutdownPromise.then(
            () => clearTimeout(forceExit),
            () => clearTimeout(forceExit)
        );
        return shutdownPromise;
    }

    function attachDashboardServer(server) {
        dashboardServer = server;
        server?.on('error', error => {
            reportIncident('dashboard-server', error, {
                listening: Boolean(server.listening)
            }, 'critical');
            shutdown('dashboard-server-error', 1);
        });
        server?.on('clientError', (error, socket) => {
            if (socket?.writable) {
                socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
            } else {
                socket?.destroy?.();
            }
            if (!['ECONNRESET', 'HPE_INVALID_EOF_STATE'].includes(String(error?.code || ''))) {
                console.warn(JSON.stringify({
                    level: 'warn',
                    event: 'sentinel_http_client_error',
                    code: String(error?.code || 'unknown').slice(0, 80),
                    timestamp: new Date().toISOString()
                }));
            }
        });
        return server;
    }

    function recordHealthCheck(key, ok, message, context = {}) {
        if (ok) {
            healthFailures.set(key, 0);
            const incidentId = healthIncidents.get(key);
            if (incidentId && typeof resolveIncident === 'function') {
                const recoveryCount = (healthRecoveries.get(key) || 0) + 1;
                healthRecoveries.set(key, recoveryCount);
                if (recoveryCount < failureThreshold) return;
                resolveIncident(incidentId, {
                    actorUserId: 'sentinel-watchdog',
                    note: 'Rétablissement automatique confirmé par plusieurs contrôles Noctigarde.'
                });
                healthIncidents.delete(key);
                healthRecoveries.delete(key);
            }
            return;
        }

        healthRecoveries.set(key, 0);
        const failureCount = (healthFailures.get(key) || 0) + 1;
        healthFailures.set(key, failureCount);
        if (failureCount !== failureThreshold) return;
        const incident = reportIncident(`health:${key}`, new Error(message), {
            ...context,
            consecutiveFailures: failureCount
        });
        if (incident?.incidentId) healthIncidents.set(key, incident.incidentId);
    }

    function checkHealth() {
        const now = Date.now();
        const eventLoopLagMs = Math.max(now - expectedHealthCheckAt, 0);
        expectedHealthCheckAt = now + healthIntervalMs;
        recordHealthCheck('event-loop', eventLoopLagMs < 5_000, 'La boucle Node.js reste bloquée plus de cinq secondes.', {
            eventLoopLagMs
        });
        recordHealthCheck('discord', Boolean(client?.isReady?.()), 'La connexion Discord reste indisponible.', {
            gatewayStatus: Number(client?.ws?.status ?? -1),
            gatewayPingMs: Number(client?.ws?.ping || 0)
        });
        recordHealthCheck('dashboard', Boolean(dashboardServer?.listening), 'Le dashboard Noctigarde n’écoute plus les requêtes.');

        try {
            checkDatabase?.();
            recordHealthCheck('sqlite', true, '');
        } catch (error) {
            recordHealthCheck('sqlite', false, 'Le contrôle SQLite échoue de manière répétée.', {
                error: String(error?.message || error).slice(0, 300)
            });
        }

        const memory = process.memoryUsage();
        const heapPressure = memory.heapTotal > 256 * 1024 * 1024
            && memory.heapUsed / memory.heapTotal >= 0.92;
        recordHealthCheck('memory', !heapPressure, 'La mémoire JavaScript reste proche de sa limite.', {
            heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
            rssMb: Math.round(memory.rss / 1024 / 1024)
        });
    }

    function startHealthWatch() {
        expectedHealthCheckAt = Date.now() + healthIntervalMs;
        return scheduleInterval(() => {
            try {
                checkHealth();
            } catch (error) {
                reportIncident('health:watchdog', error);
            }
        }, healthIntervalMs);
    }

    function installProcessHandlers() {
        process.once('SIGTERM', () => shutdown('sigterm', 0));
        process.once('SIGINT', () => shutdown('sigint', 0));
        process.on('unhandledRejection', error => {
            reportIncident('unhandled-rejection', error, {}, 'critical');
            shutdown('unhandled-rejection', 1);
        });
        process.on('uncaughtException', error => {
            reportIncident('uncaught-exception', error, {}, 'critical');
            shutdown('uncaught-exception', 1);
        });
        process.on('warning', warning => {
            if (warning?.name === 'MaxListenersExceededWarning') {
                reportIncident('process-warning', warning, {}, 'warning');
            }
        });
    }

    return {
        attachDashboardServer,
        checkHealth,
        clearRuntimeTimers,
        installProcessHandlers,
        on,
        once,
        onceFatal,
        scheduleInterval,
        scheduleTimeout,
        shutdown,
        startHealthWatch
    };
}

module.exports = {
    DEFAULT_FAILURE_THRESHOLD,
    DEFAULT_HEALTH_INTERVAL_MS,
    createRuntimeSupervisor
};
