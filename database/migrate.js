const fs = require('fs');
const db = require('./database');

const DATA_FILE = './data/service.json';
const CONFIG_FILE = './data/config.json';

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.trim()) {
        return {};
    }

    return JSON.parse(content);
}

const serviceData = readJson(DATA_FILE);
const configData = readJson(CONFIG_FILE);

const insertConfig = db.prepare(`
    INSERT OR REPLACE INTO guild_configs (guild_id, role_id, log_channel_id)
    VALUES (?, ?, ?)
`);

const insertTime = db.prepare(`
    INSERT OR REPLACE INTO service_times (guild_id, user_id, total_time, start_time)
    VALUES (?, ?, ?, ?)
`);

const insertSession = db.prepare(`
    INSERT INTO service_sessions (guild_id, user_id, date, duration)
    VALUES (?, ?, ?, ?)
`);

const migrate = db.transaction(() => {
    for (const [guildId, guildConfig] of Object.entries(configData)) {
        insertConfig.run(
            guildId,
            guildConfig.serviceRoleId || null,
            guildConfig.logChannelId || null
        );
    }

    for (const [guildId, users] of Object.entries(serviceData)) {
        for (const [userId, userData] of Object.entries(users)) {
            insertTime.run(
                guildId,
                userId,
                userData.totalTime || 0,
                userData.startTime || null
            );

            const sessions = userData.sessions || [];

            for (const session of sessions) {
                insertSession.run(
                    guildId,
                    userId,
                    session.date,
                    session.duration || 0
                );
            }
        }
    }
});

migrate();

console.log('✅ Migration JSON vers SQLite terminée.');