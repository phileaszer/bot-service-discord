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

function required(args, key) {
    const value = String(args[key] || '').trim();

    if (!value) {
        throw new Error(`Argument manquant : --${key}`);
    }

    return value;
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
    const titleEn = args['title-en'];
    const bodyEn = args['body-en'];
    const source = args.source || 'clavardage 019e92a8-2bff-7dc0-9e8e-b4ec8e81b11d';

    if (args['dry-run']) {
        console.log(JSON.stringify({
            ok: true,
            dryRun: true,
            guildId,
            type,
            channels: target,
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

            const posted = [];
            const frChannel = guild.channels.cache.find(channel => channel.name === target.fr);

            if (!frChannel) {
                throw new Error(`Salon FR introuvable : ${target.fr}`);
            }

            await frChannel.send({
                embeds: [buildEmbed({
                    type,
                    title: titleFr,
                    body: bodyFr,
                    source
                })]
            });
            posted.push({ language: 'fr', channel: target.fr, id: frChannel.id });

            if (titleEn && bodyEn && !args['fr-only']) {
                const enChannel = guild.channels.cache.find(channel => channel.name === target.en);

                if (enChannel) {
                    await enChannel.send({
                        embeds: [buildEmbed({
                            type,
                            title: titleEn,
                            body: bodyEn,
                            source
                        })]
                    });
                    posted.push({ language: 'en', channel: target.en, id: enChannel.id });
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
