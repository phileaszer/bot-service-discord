'use strict';

function validateStatusPayload(payload) {
    if (!payload || payload.ok !== true || payload.status?.dashboardOnline !== true) {
        throw new Error('Le dashboard Noctigarde ne confirme pas son état opérationnel.');
    }
    if (payload.status.botOnline !== true) {
        throw new Error('Le dashboard répond, mais le bot Discord est hors ligne.');
    }
    return {
        botOnline: true,
        dashboardOnline: true,
        guildCount: Math.max(Number(payload.status.guildCount) || 0, 0),
        incidents: Array.isArray(payload.status.incidents) ? payload.status.incidents.length : 0
    };
}

async function sendAlert(webhookUrl, message) {
    if (!webhookUrl) return false;
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: 'Noctigarde Surveillance',
            content: `Alerte Noctigarde : ${String(message).slice(0, 1500)}`,
            allowed_mentions: { parse: [] }
        }),
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Le webhook d'alerte a répondu ${response.status}.`);
    return true;
}

async function checkUptime(options = {}) {
    const url = options.url || process.env.SENTINEL_HEALTHCHECK_URL;
    if (!url) throw new Error('SENTINEL_HEALTHCHECK_URL est obligatoire.');
    const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'Noctigarde-Uptime/1.0' },
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Le contrôle Noctigarde a répondu ${response.status}.`);
    return validateStatusPayload(await response.json());
}

if (require.main === module) {
    checkUptime()
        .then(status => console.log(`Noctigarde opérationnel : ${status.guildCount} serveur(s), ${status.incidents} incident(s).`))
        .catch(async error => {
            console.error(`Contrôle externe échoué : ${error.message}`);
            await sendAlert(process.env.SENTINEL_ALERT_WEBHOOK_URL, error.message)
                .catch(alertError => console.error(`Alerte externe échouée : ${alertError.message}`));
            process.exitCode = 1;
        });
}

module.exports = { checkUptime, sendAlert, validateStatusPayload };
