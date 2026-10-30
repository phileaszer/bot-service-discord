'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createRuntimeSupervisor } = require('../runtime-supervisor');

function createSupervisor(overrides = {}) {
    const client = new EventEmitter();
    client.ready = true;
    client.isReady = () => client.ready;
    client.ws = { status: 0, ping: 20 };
    client.destroy = () => {};
    const incidents = [];
    const resolved = [];
    let databaseHealthy = true;
    const supervisor = createRuntimeSupervisor({
        client,
        database: { open: false },
        reportIncident(source, error, context, severity) {
            const incident = {
                incidentId: `INC-TEST-${incidents.length + 1}`,
                source,
                message: error.message,
                context,
                severity
            };
            incidents.push(incident);
            return incident;
        },
        resolveIncident(incidentId, options) {
            resolved.push({ incidentId, options });
            return true;
        },
        checkDatabase() {
            if (!databaseHealthy) throw new Error('SQLite indisponible');
        },
        healthIntervalMs: 1000,
        failureThreshold: 2,
        ...overrides
    });
    const dashboard = new EventEmitter();
    dashboard.listening = true;
    dashboard.close = callback => {
        dashboard.listening = false;
        callback();
    };
    supervisor.attachDashboardServer(dashboard);

    return {
        client,
        incidents,
        resolved,
        supervisor,
        setDatabaseHealthy(value) {
            databaseHealthy = value;
        }
    };
}

test('guarded Discord listeners preserve event context when they fail', async () => {
    const state = createSupervisor();
    state.supervisor.on('sample', 'discord:sample', value => ({ value }), async () => {
        throw new Error('event failure');
    });

    state.client.emit('sample', 'safe-context');
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(state.incidents.length, 1);
    assert.equal(state.incidents[0].source, 'discord:sample');
    assert.deepEqual(state.incidents[0].context, { value: 'safe-context' });
});

test('persistent health failures create one incident and recovery resolves it', () => {
    const state = createSupervisor();
    state.client.ready = false;
    state.setDatabaseHealthy(false);

    state.supervisor.checkHealth();
    assert.equal(state.incidents.length, 0);
    state.supervisor.checkHealth();

    assert.deepEqual(state.incidents.map(item => item.source).sort(), [
        'health:discord',
        'health:sqlite'
    ]);

    state.client.ready = true;
    state.setDatabaseHealthy(true);
    state.supervisor.checkHealth();

    assert.equal(state.resolved.length, 0);
    state.supervisor.checkHealth();

    assert.equal(state.resolved.length, 2);
    assert.match(state.resolved[0].options.note, /Rétablissement automatique/);
});

test('tracked timeouts are cancelled during cleanup', async () => {
    const state = createSupervisor();
    let called = false;
    state.supervisor.scheduleTimeout(() => {
        called = true;
    }, 20);

    state.supervisor.clearRuntimeTimers();
    await new Promise(resolve => setTimeout(resolve, 35));

    assert.equal(called, false);
});
