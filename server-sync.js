const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    PermissionsBitField
} = require('discord.js');

const COLORS = {
    pink: 0xff2f9f,
    cyan: 0x18f7ff,
    violet: 0x9b59ff,
    dark: 0x101018
};

const ROLES = [
    { name: '✦ Sentinel | Fondateur', color: COLORS.pink, hoist: true },
    { name: '◆ Sentinel | Administrateur', color: 0xd91b7d, hoist: true },
    { name: '◇ Sentinel | Moderateur', color: COLORS.violet, hoist: true },
    { name: '✚ Sentinel | Support', color: COLORS.cyan, hoist: true },
    { name: '⚡ Sentinel | Beta Tester', color: 0x00b8ff, hoist: false },
    { name: '◈ Sentinel | Membre', color: 0x2f3136, hoist: false },
    { name: '◌ Sentinel | Nouveau', color: 0x777777, hoist: false },
    { name: '💎 Sentinel | Partenaire', color: COLORS.pink, hoist: false },
    { name: '⚡ Sentinel | Early Access', color: 0x00b8ff, hoist: false },
    { name: '📡 Sentinel | Annonces', color: COLORS.cyan, hoist: false },
    { name: '🧬 Sentinel | Changelog', color: COLORS.violet, hoist: false }
];

const CATEGORIES = [
    { key: 'info', name: '✦ SENTINEL // INFORMATIONS', kind: 'readOnly' },
    { key: 'community', name: '✦ SENTINEL // COMMUNAUTE', kind: 'community' },
    { key: 'support', name: '✦ SENTINEL // SUPPORT', kind: 'community' },
    { key: 'dev', name: '✦ SENTINEL // DEVELOPPEMENT', kind: 'community' },
    { key: 'voice', name: '✦ SENTINEL // VOCAL', kind: 'voice' },
    { key: 'staff', name: '✦ SENTINEL // STAFF', kind: 'staff' }
];

const CHANNELS = [
    { name: '💗｜bienvenue', category: 'info', kind: 'readOnly', topic: 'Sentinel welcome hub // Performance - Security - Reliability', panel: 'welcome' },
    { name: '🛡｜reglement', category: 'info', kind: 'readOnly', topic: 'Rules, safety and community standards // Reglement Sentinel', panel: 'rules' },
    { name: '📡｜annonces', category: 'info', kind: 'readOnly', topic: 'Official Sentinel announcements // Updates and important notices', panel: 'announcements' },
    { name: '💠｜presentation-sentinel', category: 'info', kind: 'readOnly', topic: 'What Sentinel is, what it does, and where the project is going', panel: 'presentation' },
    { name: '🧬｜changelog', category: 'info', kind: 'readOnly', topic: 'Technical update history // Fixes, changes, releases', panel: 'changelog' },
    { name: '📚｜ressources', category: 'info', kind: 'readOnly', topic: 'Useful Sentinel links, docs and references', panel: 'resources' },
    { name: '📌｜statut-sentinel', category: 'info', kind: 'readOnly', topic: 'Sentinel status, maintenance and incidents', panel: 'status' },
    { name: '💬｜general', category: 'community', kind: 'community', topic: 'Main community chat // Discussion generale Sentinel' },
    { name: '👋｜presentations', category: 'community', kind: 'community', topic: 'Introduce yourself to the Sentinel community' },
    { name: '💡｜suggestions', category: 'community', kind: 'community', topic: 'Ideas, improvements and feedback for Sentinel', panel: 'suggestions' },
    { name: '🖼｜showcase', category: 'community', kind: 'community', topic: 'Share screenshots, setups and community creations' },
    { name: '🌙｜hors-sujet', category: 'community', kind: 'community', topic: 'Off-topic chat while keeping the Sentinel vibe clean' },
    { name: '🗳｜sondages', category: 'community', kind: 'community', topic: 'Community polls and feature priority votes', panel: 'polls' },
    { name: '🎭｜roles-sentinel', category: 'community', kind: 'readOnly', topic: 'Self roles and notification preferences', panel: 'roles' },
    { name: '🔧｜aide-installation', category: 'support', kind: 'community', topic: 'Install, invite, permissions and first setup help', panel: 'support' },
    { name: '🚨｜bugs', category: 'support', kind: 'community', topic: 'Bug reports with reproduction steps and useful details', panel: 'bugs' },
    { name: '🤖｜commandes', category: 'support', kind: 'community', topic: 'Sentinel command reference and usage notes', panel: 'commands' },
    { name: '🛰｜demandes-support', category: 'support', kind: 'community', topic: 'Support requests that need staff or Sentinel assistance', panel: 'supportRequests' },
    { name: '🎫｜ouvrir-un-ticket', category: 'support', kind: 'readOnly', topic: 'Open private Sentinel support tickets', panel: 'tickets' },
    { name: '🧭｜roadmap', category: 'dev', kind: 'community', topic: 'Sentinel direction, priorities and future milestones', panel: 'roadmap' },
    { name: '⚡｜beta-tests', category: 'dev', kind: 'community', topic: 'Testing zone for upcoming Sentinel features', panel: 'beta' },
    { name: '🔮｜idees-futures', category: 'dev', kind: 'community', topic: 'Long-term concepts and future Sentinel ideas', panel: 'futureIdeas' },
    { name: '🧾｜patch-notes', category: 'dev', kind: 'community', topic: 'Readable release notes for the community', panel: 'patchNotes' },
    { name: '🔒｜staff-chat', category: 'staff', kind: 'staff', topic: 'Private staff coordination // Sentinel operations', panel: 'staff' },
    { name: '📂｜logs', category: 'staff', kind: 'staff', topic: 'Internal logs and moderation traces', panel: 'logs' },
    { name: '⚠️｜signalements', category: 'staff', kind: 'staff', topic: 'Private report tracking and staff follow-up', panel: 'reports' },
    { name: '📌｜todo-staff', category: 'staff', kind: 'staff', topic: 'Internal Sentinel staff tasks and follow-ups', panel: 'todo' }
];

const VOICE_CHANNELS = [
    { name: '◆ General', category: 'voice' },
    { name: '◆ Support', category: 'voice' },
    { name: '◆ Beta Test', category: 'voice' }
];

const STAFF_ROLES = [
    '✦ Sentinel | Fondateur',
    '◆ Sentinel | Administrateur',
    '◇ Sentinel | Moderateur',
    '✚ Sentinel | Support'
];

function enabled(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function findRole(guild, name) {
    return guild.roles.cache.find(role => role.name === name) || null;
}

function findCategory(guild, name) {
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildCategory && channel.name === name
    ) || null;
}

function findTextChannel(guild, name) {
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText && channel.name === name
    ) || null;
}

function findVoiceChannel(guild, name) {
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildVoice && channel.name === name
    ) || null;
}

function staffRoleIds(guild) {
    return STAFF_ROLES
        .map(name => findRole(guild, name)?.id)
        .filter(Boolean);
}

function overwritesFor(guild, kind) {
    if (kind === 'staff') {
        return [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            ...staffRoleIds(guild).map(id => ({
                id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.ManageMessages,
                    PermissionsBitField.Flags.AttachFiles,
                    PermissionsBitField.Flags.EmbedLinks
                ]
            }))
        ];
    }

    if (kind === 'voice') {
        const allowedRoles = [
            '◈ Sentinel | Membre',
            '◌ Sentinel | Nouveau',
            ...STAFF_ROLES
        ]
            .map(name => findRole(guild, name))
            .filter(Boolean);

        return [
            { id: guild.roles.everyone.id, allow: [PermissionsBitField.Flags.ViewChannel], deny: [PermissionsBitField.Flags.Connect] },
            ...allowedRoles.map(role => ({
                id: role.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.Connect,
                    PermissionsBitField.Flags.Speak,
                    PermissionsBitField.Flags.UseVAD
                ]
            }))
        ];
    }

    const base = {
        id: guild.roles.everyone.id,
        allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.ReadMessageHistory
        ],
        deny: [
            PermissionsBitField.Flags.MentionEveryone
        ]
    };

    if (kind === 'readOnly') {
        base.deny.push(
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.CreatePrivateThreads
        );
    } else {
        base.allow.push(
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
        );
    }

    return [
        base,
        ...staffRoleIds(guild).map(id => ({
            id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.AddReactions
            ]
        }))
    ];
}

async function ensureRoles(guild, result) {
    await guild.roles.fetch();

    for (const config of ROLES) {
        const role = findRole(guild, config.name);

        if (role) {
            if (role.editable) {
                await role.edit({
                    colors: {
                        primaryColor: config.color
                    },
                    hoist: config.hoist,
                    mentionable: false,
                    reason: 'Sentinel auto sync'
                });
                result.updated += 1;
            }
            continue;
        }

        await guild.roles.create({
            name: config.name,
            colors: {
                primaryColor: config.color
            },
            hoist: config.hoist,
            mentionable: false,
            reason: 'Sentinel auto sync'
        });
        result.created += 1;
    }
}

async function ensureCategories(guild, result) {
    const byKey = new Map();

    for (const config of CATEGORIES) {
        let category = findCategory(guild, config.name);

        if (!category) {
            category = await guild.channels.create({
                name: config.name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwritesFor(guild, config.kind),
                reason: 'Sentinel auto sync'
            });
            result.created += 1;
        } else {
            await category.permissionOverwrites.set(overwritesFor(guild, config.kind), 'Sentinel auto sync');
            result.updated += 1;
        }

        byKey.set(config.key, category);
    }

    return byKey;
}

async function ensureTextChannels(guild, categories, result) {
    for (const config of CHANNELS) {
        let channel = findTextChannel(guild, config.name);

        if (!channel) {
            channel = await guild.channels.create({
                name: config.name,
                type: ChannelType.GuildText,
                parent: categories.get(config.category)?.id || null,
                topic: config.topic,
                permissionOverwrites: overwritesFor(guild, config.kind),
                reason: 'Sentinel auto sync'
            });
            result.created += 1;
        } else {
            await channel.edit({
                parent: categories.get(config.category)?.id || channel.parentId,
                topic: config.topic,
                permissionOverwrites: overwritesFor(guild, config.kind),
                reason: 'Sentinel auto sync'
            });
            result.updated += 1;
        }

        if (config.panel) {
            await ensurePanel(channel, config.panel, guild.client.user.id, result);
        }
    }
}

async function ensureVoiceChannels(guild, categories, result) {
    for (const config of VOICE_CHANNELS) {
        let channel = findVoiceChannel(guild, config.name);

        if (!channel) {
            channel = await guild.channels.create({
                name: config.name,
                type: ChannelType.GuildVoice,
                parent: categories.get(config.category)?.id || null,
                permissionOverwrites: overwritesFor(guild, 'voice'),
                reason: 'Sentinel auto sync'
            });
            result.created += 1;
        } else {
            await channel.edit({
                parent: categories.get(config.category)?.id || channel.parentId,
                permissionOverwrites: overwritesFor(guild, 'voice'),
                reason: 'Sentinel auto sync'
            });
            result.updated += 1;
        }
    }
}

function embed(title, description, color = COLORS.pink) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'Sentinel Community // Performance - Securite - Fiabilite' })
        .setTimestamp();
}

function panelPayload(panel) {
    const panels = {
        welcome: {
            embeds: [embed('Bienvenue sur Sentinel', 'Bienvenue dans la communaute officielle de Sentinel.\n\nIci, tu retrouves les annonces du projet, le support, les idees de la communaute, les tests et les nouvelles versions du bot.\n\nInstalle-toi, lis les informations importantes, puis rejoins la discussion quand tu veux.', COLORS.pink)]
        },
        rules: {
            embeds: [embed('Reglement Sentinel', '**Respect**\nChaque membre doit pouvoir discuter sans pression, provocation ou attaque personnelle.\n\n**Lisibilite**\nLes salons restent propres : pas de spam, flood, mentions abusives ou messages volontairement confus.\n\n**Securite**\nLes failles, abus ou comportements suspects autour de Sentinel se signalent au staff en prive.\n\n**Support**\nLes demandes claires passent plus vite : contexte, commande concernee, capture ou erreur si possible.\n\n**Esprit du serveur**\nPerformance, securite, fiabilite. On garde une communaute utile, calme et bien tenue.', COLORS.cyan)]
        },
        presentation: {
            embeds: [embed('Sentinel', 'Sentinel est un bot Discord pense pour les serveurs qui veulent rester organises, lisibles et fiables.\n\nIl accompagne la gestion des services, les logs, le support, la moderation et l activite communautaire avec une identite cyber-neon : noir profond, rose Sentinel et cyan electrique.\n\nPerformance. Securite. Fiabilite.', COLORS.pink)]
        },
        announcements: {
            embeds: [embed('Annonces Sentinel', 'Les informations importantes arrivent ici : mises a jour, changements du bot, maintenance, ouvertures de tests et annonces communautaires.\n\nQuand un message apparait dans ce salon, c est qu il merite ton attention.', COLORS.pink)]
        },
        changelog: {
            embeds: [embed('Changelog Sentinel', 'Toutes les evolutions de Sentinel sont rassemblees ici.\n\nNouvelles commandes, corrections, ajustements, ameliorations de confort ou changements techniques : ce salon garde la trace de ce qui avance dans le projet.', COLORS.violet)]
        },
        resources: {
            embeds: [embed('Ressources Sentinel', 'Les liens utiles de Sentinel sont regroupes ici : invitation du bot, documentation, GitHub, guides, changelog et informations importantes.\n\nUn point de depart simple pour retrouver ce dont tu as besoin.', COLORS.cyan)]
        },
        status: {
            embeds: [embed('Statut Sentinel', '**Etat actuel :** operationnel\n\nLes maintenances, incidents, ralentissements et redemarrages importants seront annonces ici.', COLORS.cyan)]
        },
        polls: {
            embeds: [embed('Sondages Sentinel', 'La communaute peut voter ici sur les prochaines priorites : nouvelles commandes, ameliorations, integrations, ergonomie ou idees de serveur.\n\nTon avis aide Sentinel a avancer dans la bonne direction.', COLORS.violet)]
        },
        suggestions: {
            embeds: [embed('Suggestions Sentinel', 'Les idees pour ameliorer Sentinel passent ici.\n\nTu peux proposer une commande, une option, une integration, une amelioration visuelle ou un changement de fonctionnement. Les meilleures idees sont celles qui rendent le bot plus utile pour toute la communaute.', COLORS.violet)]
        },
        support: {
            embeds: [embed('Aide installation', 'Besoin d aide pour inviter Sentinel, regler les permissions, configurer un salon ou comprendre une commande ?\n\nEnvoie ton probleme avec le plus de contexte possible : ce que tu voulais faire, ce qui bloque, et le message d erreur si tu en as un.', COLORS.dark)]
        },
        bugs: {
            embeds: [embed('Signalement de bugs', 'Si Sentinel ne reagit pas comme prevu, tu peux le signaler ici.\n\nAjoute la commande ou la fonction concernee, ce que tu as fait, le resultat obtenu et une capture si possible. Plus le signalement est clair, plus la correction est rapide.', COLORS.dark)]
        },
        commands: {
            embeds: [embed('Commandes Sentinel', 'Les commandes principales de Sentinel sont disponibles directement avec `/`.\n\n`/mes-heures` pour consulter ton temps, `/top-service` pour le classement, `/config-voir` pour la configuration, et les commandes admin pour regler les roles, logs et resets.', COLORS.cyan)]
        },
        supportRequests: {
            embeds: [embed('Demandes support', 'Les demandes qui demandent un suivi avec le support Sentinel peuvent etre posees ici.\n\nPour une question privee ou sensible, ouvre plutot un ticket dans le salon dedie.', COLORS.dark)]
        },
        roadmap: {
            embeds: [embed('Roadmap Sentinel', 'La roadmap donne une vision des prochaines directions de Sentinel : nouvelles fonctions, ameliorations de stabilite, outils de moderation, ergonomie et integrations.\n\nRien n est fige, mais chaque avancee rapproche le bot d une experience plus propre et plus solide.', COLORS.violet)]
        },
        beta: {
            embeds: [embed('Beta tests', 'Les tests avances de Sentinel passent ici.\n\nLes fonctionnalites presentees peuvent changer, etre corrigees ou disparaitre avant leur sortie officielle. Les retours precis sont les plus utiles.', COLORS.cyan)]
        },
        futureIdeas: {
            embeds: [embed('Idees futures', 'Cet espace sert a imaginer la suite de Sentinel.\n\nConcepts, envies, automatisations, integrations, interfaces, moderation, premium : tout ce qui peut rendre le bot plus fort peut commencer ici.', COLORS.violet)]
        },
        patchNotes: {
            embeds: [embed('Patch notes', 'Les notes de patch presentent les changements importants dans une version lisible.\n\nAjouts, corrections, retraits, ajustements : chaque patch raconte ce qui vient de changer pour les utilisateurs.', COLORS.pink)]
        },
        staff: {
            embeds: [embed('Staff Sentinel', 'Coordination interne du staff Sentinel : moderation, support, annonces, priorites et suivi communautaire.', COLORS.dark)]
        },
        todo: {
            embeds: [embed('Todo staff', '- Bugs a verifier\n- Suggestions a trier\n- Annonces a preparer\n- Tickets sensibles a suivre\n- Roadmap a mettre a jour', COLORS.dark)]
        },
        logs: {
            embeds: [embed('Logs staff', 'Les traces importantes du serveur et du bot se retrouvent ici pour aider le staff a suivre ce qui se passe.', COLORS.dark)]
        },
        reports: {
            embeds: [embed('Signalements staff', 'Les signalements importants sont centralises ici avec leur contexte, les preuves disponibles et le suivi effectue.', COLORS.dark)]
        },
        roles: {
            embeds: [embed('Roles Sentinel', 'Choisis les notifications et statuts que tu veux recevoir.\n\nAnnonces, changelog, early access ou partenaire : les boutons te permettent d ajuster ton profil Sentinel en un clic.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_selfrole:announcements').setLabel('Annonces').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:changelog').setLabel('Changelog').setStyle(ButtonStyle.Secondary).setEmoji('🧬'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:beta').setLabel('Early Access').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:partner').setLabel('Partenaire').setStyle(ButtonStyle.Secondary).setEmoji('💎')
                )
            ]
        },
        tickets: {
            embeds: [embed('Support prive', 'Pour une demande personnelle, sensible ou qui demande un vrai suivi, ouvre un ticket prive avec le support Sentinel.\n\nUn espace dedie sera cree pour toi et l equipe pourra te repondre proprement.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_ticket:create').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
                )
            ]
        }
    };

    return panels[panel] || null;
}

async function ensurePanel(channel, panel, clientUserId, result) {
    const payload = panelPayload(panel);

    if (!payload) {
        return;
    }

    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const botMessages = messages
        ? messages.filter(message => message.author.id === clientUserId)
        : null;

    if (botMessages?.size) {
        const first = botMessages.first();
        await first.edit(payload).catch(async () => {
            await channel.send(payload);
            result.created += 1;
        });

        for (const message of botMessages.filter(message => message.id !== first.id).values()) {
            await message.delete().catch(() => {});
        }

        result.updated += 1;
        return;
    }

    await channel.send(payload);
    result.created += 1;
}

async function syncSentinelServer(client, options = {}) {
    if (!enabled(options.enabled ?? process.env.AUTO_SYNC_SERVER)) {
        return { skipped: true, reason: 'AUTO_SYNC_SERVER disabled' };
    }

    const guildId = String(options.guildId || process.env.AUTO_SYNC_GUILD_ID || process.env.GUILD_ID || '').trim();

    if (!/^\d{17,20}$/.test(guildId)) {
        return { skipped: true, reason: 'missing guild id' };
    }

    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    await guild.roles.fetch();

    const me = await guild.members.fetchMe();

    if (!me.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return { skipped: true, reason: 'bot is not administrator' };
    }

    const result = {
        skipped: false,
        created: 0,
        updated: 0
    };

    await ensureRoles(guild, result);
    const categories = await ensureCategories(guild, result);
    await ensureTextChannels(guild, categories, result);
    await ensureVoiceChannels(guild, categories, result);

    return result;
}

module.exports = {
    syncSentinelServer
};
