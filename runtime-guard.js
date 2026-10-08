const crypto = require('crypto');
const db = require('./database/database');

const INSTANCE_ID = String(
    process.env.RAILWAY_REPLICA_ID
    || process.env.RAILWAY_DEPLOYMENT_ID
    || `local-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
).slice(0, 160);

function nowIso() {
    return new Date().toISOString();
}

function cleanText(value, limit = 1000) {
    return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
}

function safeContext(value, depth = 0) {
    if (depth > 4 || value == null) return value == null ? null : '[truncated]';
    if (['string', 'number', 'boolean'].includes(typeof value)) {
        return typeof value === 'string' ? value.slice(0, 1000) : value;
    }
    if (Array.isArray(value)) return value.slice(0, 30).map(item => safeContext(item, depth + 1));
    if (typeof value !== 'object') return String(value).slice(0, 1000);

    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
        if (/token|secret|password|authorization|cookie|recovery/i.test(key)) {
            output[key] = '[redacted]';
        } else {
            output[key] = safeContext(item, depth + 1);
        }
    }
    return output;
}

function incidentFingerprint(source, message) {
    return crypto.createHash('sha256')
        .update(`${cleanText(source, 120)}\n${cleanText(message, 500)}`)
        .digest('hex');
}

function newIncidentId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `INC-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function mapIncident(row) {
    if (!row) return null;
    let context = {};
    try { context = JSON.parse(row.context_json || '{}'); } catch (error) { context = {}; }
    return {
        incidentId: row.incident_id,
        source: row.source,
        severity: row.severity,
        message: row.message,
        context,
        status: row.status,
        occurrenceCount: Number(row.occurrence_count || 0),
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        resolvedAt: row.resolved_at || null
    };
}

function reportIncident(source, error, context = {}, severity = 'error') {
    const message = cleanText(error?.message || error || 'Erreur Sentinel inconnue', 1000);
    const sourcePrefix = String(error?.code || '').startsWith('SQLITE_')
        ? 'sqlite'
        : (error?.rawError || error?.requestBody ? 'discord' : null);
    const baseSource = cleanText(source || 'runtime', 100) || 'runtime';
    const normalizedSource = cleanText(sourcePrefix ? `${sourcePrefix}:${baseSource}` : baseSource, 120);
    const fingerprint = incidentFingerprint(normalizedSource, message);
    const timestamp = nowIso();
    let incidentId = newIncidentId();
    let incident = null;
    const serializedContext = JSON.stringify(safeContext(context));

    try {
        const existing = db.prepare(`
            SELECT incident_id FROM runtime_incidents
            WHERE fingerprint = ? AND status = 'open'
            ORDER BY last_seen_at DESC LIMIT 1
        `).get(fingerprint);
        incidentId = existing?.incident_id || incidentId;

        if (existing) {
            db.prepare(`
                UPDATE runtime_incidents
                SET occurrence_count = occurrence_count + 1, last_seen_at = ?,
                    severity = ?, context_json = ?
                WHERE incident_id = ?
            `).run(timestamp, severity, serializedContext, incidentId);
        } else {
            db.prepare(`
                INSERT INTO runtime_incidents (
                    incident_id, fingerprint, source, severity, message, context_json,
                    status, occurrence_count, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'open', 1, ?, ?)
            `).run(
                incidentId,
                fingerprint,
                normalizedSource,
                severity,
                message,
                serializedContext,
                timestamp,
                timestamp
            );
        }
        incident = mapIncident(db.prepare('SELECT * FROM runtime_incidents WHERE incident_id = ?').get(incidentId));
    } catch (storageError) {
        console.error(JSON.stringify({
            level: 'critical',
            event: 'sentinel_incident_storage_failed',
            incidentId,
            message: cleanText(storageError?.message || storageError, 1000),
            timestamp
        }));
    }

    const event = {
        level: severity,
        event: 'sentinel_runtime_incident',
        incidentId,
        source: normalizedSource,
        message,
        context: safeContext(context),
        timestamp
    };
    console.error(JSON.stringify(event));
    return incident || {
        incidentId,
        source: normalizedSource,
        severity,
        message,
        context: safeContext(context),
        status: 'open',
        occurrenceCount: 1,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        resolvedAt: null
    };
}

function listIncidents({ status = 'open', limit = 50 } = {}) {
    const normalizedStatus = ['open', 'resolved', 'all'].includes(status) ? status : 'open';
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const rows = normalizedStatus === 'all'
        ? db.prepare('SELECT * FROM runtime_incidents ORDER BY last_seen_at DESC LIMIT ?').all(boundedLimit)
        : db.prepare('SELECT * FROM runtime_incidents WHERE status = ? ORDER BY last_seen_at DESC LIMIT ?')
            .all(normalizedStatus, boundedLimit);
    return rows.map(mapIncident);
}

function resolveIncident(incidentId) {
    const timestamp = nowIso();
    return db.prepare(`
        UPDATE runtime_incidents
        SET status = 'resolved', resolved_at = ?, last_seen_at = ?
        WHERE incident_id = ? AND status = 'open'
    `).run(timestamp, timestamp, String(incidentId || '')).changes > 0;
}

const acquireLeaseTransaction = db.transaction((jobKey, ttlMs) => {
    const now = Date.now();
    const timestamp = nowIso();
    const inserted = db.prepare(`
        INSERT OR IGNORE INTO scheduled_job_leases (
            job_key, owner_id, leased_until, last_started_at, last_status, updated_at
        ) VALUES (?, ?, ?, ?, 'running', ?)
    `).run(jobKey, INSTANCE_ID, now + ttlMs, timestamp, timestamp);

    if (inserted.changes > 0) return true;

    const result = db.prepare(`
        UPDATE scheduled_job_leases
        SET owner_id = ?, leased_until = ?, last_started_at = ?,
            last_status = 'running', last_error = NULL, updated_at = ?
        WHERE job_key = ? AND leased_until <= ?
    `).run(INSTANCE_ID, now + ttlMs, timestamp, timestamp, jobKey, now);
    return result.changes > 0;
});

function acquireJobLease(jobKey, ttlMs = 5 * 60 * 1000) {
    return acquireLeaseTransaction(cleanText(jobKey, 160), Math.max(Number(ttlMs) || 0, 30_000));
}

function finishJobLease(jobKey, error = null) {
    const timestamp = nowIso();
    db.prepare(`
        UPDATE scheduled_job_leases
        SET leased_until = ?, last_finished_at = ?, last_status = ?,
            last_error = ?, updated_at = ?
        WHERE job_key = ? AND owner_id = ?
    `).run(
        Date.now(),
        timestamp,
        error ? 'failed' : 'completed',
        error ? cleanText(error.message || error, 1000) : null,
        timestamp,
        cleanText(jobKey, 160),
        INSTANCE_ID
    );
}

async function runLeasedJob(jobKey, options, handler) {
    const settings = typeof options === 'function' ? {} : (options || {});
    const callback = typeof options === 'function' ? options : handler;
    if (!acquireJobLease(jobKey, settings.ttlMs)) return { skipped: true, reason: 'leased' };

    try {
        const value = await callback();
        finishJobLease(jobKey);
        return { skipped: false, value };
    } catch (error) {
        finishJobLease(jobKey, error);
        const reporter = typeof settings.reporter === 'function' ? settings.reporter : reportIncident;
        reporter(settings.source || `job:${jobKey}`, error, settings.context || {});
        throw error;
    }
}

function claimJobExecution(jobType, itemKey, scheduledFor) {
    const result = db.prepare(`
        INSERT OR IGNORE INTO scheduled_job_executions (
            job_type, item_key, scheduled_for, owner_id, status, claimed_at
        ) VALUES (?, ?, ?, ?, 'claimed', ?)
    `).run(
        cleanText(jobType, 120),
        cleanText(itemKey, 200),
        cleanText(scheduledFor || 'once', 100),
        INSTANCE_ID,
        nowIso()
    );
    return result.changes > 0;
}

function completeJobExecution(jobType, itemKey, scheduledFor, result = {}) {
    db.prepare(`
        UPDATE scheduled_job_executions
        SET status = ?, result_json = ?, error_message = ?, completed_at = ?
        WHERE job_type = ? AND item_key = ? AND scheduled_for = ?
    `).run(
        result.error ? 'failed' : 'completed',
        JSON.stringify(safeContext(result)),
        result.error ? cleanText(result.error.message || result.error, 1000) : null,
        nowIso(),
        cleanText(jobType, 120),
        cleanText(itemKey, 200),
        cleanText(scheduledFor || 'once', 100)
    );
}

function getJobHealth(limit = 30) {
    return db.prepare(`
        SELECT job_key, owner_id, leased_until, last_started_at, last_finished_at,
               last_status, last_error, updated_at
        FROM scheduled_job_leases
        ORDER BY updated_at DESC LIMIT ?
    `).all(Math.min(Math.max(Number(limit) || 30, 1), 100)).map(row => ({
        jobKey: row.job_key,
        ownerId: row.owner_id,
        leasedUntil: row.leased_until,
        lastStartedAt: row.last_started_at,
        lastFinishedAt: row.last_finished_at,
        lastStatus: row.last_status,
        lastError: row.last_error,
        updatedAt: row.updated_at
    }));
}

module.exports = {
    INSTANCE_ID,
    acquireJobLease,
    claimJobExecution,
    completeJobExecution,
    finishJobLease,
    getJobHealth,
    listIncidents,
    reportIncident,
    resolveIncident,
    runLeasedJob,
    safeContext
};
