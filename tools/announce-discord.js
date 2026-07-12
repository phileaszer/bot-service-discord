require('dotenv').config();

const {
    Client,
    EmbedBuilder,
    GatewayIntentBits
} = require('discord.js');

const COLORS = {
    announcement: 0xff2d9a,
    changelog: 0x9b59ff,
    release: 0xff4fb8,
    status: 0x18f7ff
};

const CHANNELS = {
    announcement: {
        fr: '📡｜annonces',
        en: '📡｜announcements'
    },
    changelog: {
        fr: '🧬｜journal-dev',
        en: '🧬｜dev-log'
    },
    release: {
        fr: '🧾｜notes-de-version',
        en: '🧾｜release-notes'
    },
    status: {
        fr: '📌｜statut-sentinel',
        en: '📌｜sentinel-status'
    }
};

const DEFAULT_PING_ROLE_NAME = '📡 Sentinel | Annonces';

function readArgs(argv) {
    const args = {};

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];

        if (!value.startsWith('--')) {
            continue;
        }

        const key = value.slice(2);
        const next = argv[index + 1];

        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }

        args[key] = next;
        index += 1;
    }

    return args;
}

function valueOrEmpty(value) {
    return String(value || '').trim();
}

function normalizeText(value) {
    return valueOrEmpty(value).replace(/\\n/g, '\n');
}

function required(args, key) {
    const value = normalizeText(args[key]);

    if (!value) {
        throw new Error(`Argument manquant : --${key}`);
    }

    return value;
}

async function resolvePingRole(guild, args) {
    if (args['no-ping']) {
        return null;
    }

    await guild.roles.fetch();

    const roleId = valueOrEmpty(args['ping-role-id'] || process.env.ANNOUNCE_ROLE_ID);
    const roleName = valueOrEmpty(args['ping-role'] || process.env.ANNOUNCE_ROLE_NAME || DEFAULT_PING_ROLE_NAME);

    if (roleId) {
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            throw new Error(`Role de ping introuvable avec l ID : ${roleId}`);
        }

        return role;
    }

    const role = guild.roles.cache.find(currentRole => currentRole.name === roleName);

    if (!role) {
        throw new Error(`Role de ping introuvable : ${roleName}`);
    }

    return role;
}

function buildEmbed({ type, title, body, source }) {
    const embed = new EmbedBuilder()
        .setColor(COLORS[type] || COLORS.announcement)
        .setTitle(title)
        .setDescription(body)
        .setFooter({
            text: source
                ? `Sentinel - Performance - Securite - Fiabilite - ${source}`
                : 'Sentinel - Performance - Securite - Fiabilite'
        })
        .setTimestamp();

    return embed;
}

function buildPayload({ type, title, body, source, pingRole }) {
    const payload = {
        embeds: [buildEmbed({
            type,
            title,
            body,
            source
        })],
        allowedMentions: pingRole
            ? { roles: [pingRole.id] }
            : { parse: [] }
    };

    if (pingRole) {
        payload.content = `<@&${pingRole.id}>`;
    }

    return payload;
}

async function main() {
    const args = readArgs(process.argv.slice(2));
    const type = String(args.type || 'announcement').trim();
    const guildId = String(
        args.guild
        || process.env.SENTINEL_REFERENCE_GUILD_ID
        || process.env.AUTO_SYNC_GUILD_ID
        || process.env.GUILD_ID
        || ''
    ).trim();
    const target = CHANNELS[type];

    if (!target) {
        throw new Error(`Type inconnu : ${type}`);
    }

    if (!/^\d{17,20}$/.test(guildId)) {
        throw new Error('Aucun ID serveur valide. Definis GUILD_ID, AUTO_SYNC_GUILD_ID ou --guild.');
    }

    const titleFr = required(args, 'title-fr');
    const bodyFr = required(args, 'body-fr');
    const titleEn = normalizeText(args['title-en']);
    const bodyEn = normalizeText(args['body-en']);
    const source = args.source || 'source staff Sentinel';

    if (args['dry-run']) {
        console.log(JSON.stringify({
            ok: true,
            dryRun: true,
            guildId,
            type,
            channels: target,
            pingRole: args['no-ping']
                ? null
                : (args['ping-role-id'] || args['ping-role'] || process.env.ANNOUNCE_ROLE_ID || process.env.ANNOUNCE_ROLE_NAME || DEFAULT_PING_ROLE_NAME),
            fr: { title: titleFr, body: bodyFr },
            en: titleEn && bodyEn ? { title: titleEn, body: bodyEn } : null,
            source
        }, null, 2));
        return;
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages
        ]
    });

    client.once('clientReady', async () => {
        try {
            const guild = await client.guilds.fetch(guildId);
            await guild.channels.fetch();
            const pingRole = await resolvePingRole(guild, args);

            const posted = [];
            const frChannel = guild.channels.cache.find(channel => channel.name === target.fr);

            if (!frChannel) {
                throw new Error(`Salon FR introuvable : ${target.fr}`);
            }

            await frChannel.send(buildPayload({
                    type,
                    title: titleFr,
                    body: bodyFr,
                    source,
                    pingRole
            }));
            posted.push({ language: 'fr', channel: target.fr, id: frChannel.id, pingedRole: pingRole?.id || null });

            if (titleEn && bodyEn && !args['fr-only']) {
                const enChannel = guild.channels.cache.find(channel => channel.name === target.en);

                if (enChannel) {
                    await enChannel.send(buildPayload({
                            type,
                            title: titleEn,
                            body: bodyEn,
                            source,
                            pingRole
                    }));
                    posted.push({ language: 'en', channel: target.en, id: enChannel.id, pingedRole: pingRole?.id || null });
                }
            }

            console.log(JSON.stringify({ ok: true, type, posted }, null, 2));
        } catch (error) {
            console.error(error);
            process.exitCode = 1;
        } finally {
            client.destroy();
        }
    });

    await client.login(process.env.TOKEN);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
