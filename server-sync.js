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

const LINKS = {
    website: 'https://phileaszer.github.io/bot-service-discord/',
    topgg: 'https://top.gg/bot/1511426423376842922',
    invite: 'https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780156422&integration_type=0&scope=bot+applications.commands',
    github: 'https://github.com/phileaszer/bot-service-discord',
    terms: 'https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md',
    privacy: 'https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md'
};

const ROLES = [
    { name: '✦ Sentinel | Fondateur', color: COLORS.pink, hoist: true },
    { name: '◆ Sentinel | Administrateur', color: 0xd91b7d, hoist: true },
    { name: '◇ Sentinel | Moderateur', color: COLORS.violet, hoist: true },
    { name: '✚ Sentinel | Support', color: COLORS.cyan, hoist: true },
    { name: '⚡ Sentinel | Testeur beta', aliases: ['⚡ Sentinel | Beta Tester'], color: 0x00b8ff, hoist: false },
    { name: '◈ Sentinel | Membre', color: 0x2f3136, hoist: false },
    { name: '◌ Sentinel | Nouveau', color: 0x777777, hoist: false },
    { name: '💎 Sentinel | Partenaire', color: COLORS.pink, hoist: false },
    { name: '⚡ Sentinel | Acces anticipe', aliases: ['⚡ Sentinel | Early Access'], color: 0x00b8ff, hoist: false },
    { name: '📡 Sentinel | Annonces', color: COLORS.cyan, hoist: false },
    { name: '🛠 Sentinel | Maintenance', color: 0xff4fb8, hoist: false },
    { name: '🧬 Sentinel | Journal dev', aliases: ['🧬 Sentinel | Changelog'], color: COLORS.violet, hoist: false },
    { name: '🌐 Sentinel | Français', color: COLORS.pink, hoist: false },
    { name: '🌐 Sentinel | English', color: COLORS.cyan, hoist: false }
];

const CATEGORIES = [
    { key: 'start', name: '✦ SENTINEL // LANGUE', aliases: ['✦ SENTINEL // START'], kind: 'publicReadOnly' },
    { key: 'info', name: '✦ SENTINEL // INFORMATIONS', kind: 'frReadOnly' },
    { key: 'community', name: '✦ SENTINEL // COMMUNAUTE', kind: 'frCommunity' },
    { key: 'support', name: '✦ SENTINEL // SUPPORT', kind: 'frCommunity' },
    { key: 'dev', name: '✦ SENTINEL // DEVELOPPEMENT', kind: 'frCommunity' },
    { key: 'voice', name: '✦ SENTINEL // VOCAL', kind: 'frVoice' },
    { key: 'infoEn', name: '✦ SENTINEL // INFORMATION', kind: 'enReadOnly' },
    { key: 'communityEn', name: '✦ SENTINEL // COMMUNITY', kind: 'enCommunity' },
    { key: 'supportEn', name: '✦ SENTINEL // SUPPORT EN', kind: 'enCommunity' },
    { key: 'devEn', name: '✦ SENTINEL // DEVELOPMENT', kind: 'enCommunity' },
    { key: 'voiceEn', name: '✦ SENTINEL // VOICE', kind: 'enVoice' },
    { key: 'staff', name: '✦ SENTINEL // STAFF', kind: 'staff' }
];

const CHANNELS = [
    { name: '💗｜bienvenue', category: 'start', kind: 'publicReadOnly', topic: 'Choisis ta langue Sentinel', panel: 'welcome' },
    { name: '🛡｜reglement', category: 'info', kind: 'frReadOnly', topic: 'Reglement Sentinel', panel: 'rules' },
    { name: '📡｜annonces', category: 'info', kind: 'frReadOnly', topic: 'Annonces officielles Sentinel', panel: 'announcements' },
    { name: '💠｜presentation-sentinel', category: 'info', kind: 'frReadOnly', topic: 'Presentation du projet Sentinel', panel: 'presentation' },
    { name: '🧬｜journal-dev', aliases: ['🧬｜changelog'], category: 'info', kind: 'frReadOnly', topic: 'Journal technique continu du developpement Sentinel', panel: 'changelog' },
    { name: '📚｜ressources', category: 'info', kind: 'frReadOnly', topic: 'Liens, guides et references Sentinel', panel: 'resources' },
    { name: '❔｜faq', category: 'info', kind: 'frReadOnly', topic: 'Questions frequentes Sentinel', panel: 'faq' },
    { name: '📌｜statut-sentinel', category: 'info', kind: 'frReadOnly', topic: 'Statut, maintenance et incidents Sentinel', panel: 'status' },
    { name: '💬｜general', category: 'community', kind: 'frCommunity', topic: 'Discussion generale Sentinel' },
    { name: '👋｜presentations', category: 'community', kind: 'frCommunity', topic: 'Presente-toi a la communaute Sentinel' },
    { name: '💡｜suggestions', category: 'community', kind: 'frCommunity', topic: 'Idees et ameliorations pour Sentinel', panel: 'suggestions' },
    { name: '🖼｜showcase', category: 'community', kind: 'frCommunity', topic: 'Captures, configurations et creations communautaires' },
    { name: '🌙｜hors-sujet', category: 'community', kind: 'frCommunity', topic: 'Discussion libre' },
    { name: '🗳｜votes-priorites', aliases: ['🗳｜sondages'], category: 'community', kind: 'frCommunity', topic: 'Votes communautaires et priorites Sentinel', panel: 'priorityVotes' },
    { name: '🎭｜roles-sentinel', category: 'community', kind: 'frReadOnly', topic: 'Roles et preferences Sentinel', panel: 'roles' },
    { name: '🔧｜aide-installation', category: 'support', kind: 'frCommunity', topic: 'Aide installation et configuration Sentinel', panel: 'support' },
    { name: '🚨｜bugs', category: 'support', kind: 'frCommunity', topic: 'Signalement de bugs Sentinel', panel: 'bugs' },
    { name: '🤖｜commandes', category: 'support', kind: 'frCommunity', topic: 'Commandes Sentinel', panel: 'commands' },
    { name: '🛰｜demandes-support', category: 'support', kind: 'frCommunity', topic: 'Demandes support Sentinel', panel: 'supportRequests' },
    { name: '🎫｜ouvrir-un-ticket', category: 'support', kind: 'frReadOnly', topic: 'Ouvrir un ticket prive Sentinel', panel: 'tickets' },
    { name: '🧭｜roadmap', category: 'dev', kind: 'frCommunity', topic: 'Direction et priorites Sentinel', panel: 'roadmap' },
    { name: '⚡｜beta-tests', category: 'dev', kind: 'frCommunity', topic: 'Tests des prochaines fonctionnalites Sentinel', panel: 'beta' },
    { name: '🔮｜idees-futures', category: 'dev', kind: 'frCommunity', topic: 'Idees long terme pour Sentinel', panel: 'futureIdeas' },
    { name: '🧾｜notes-de-version', aliases: ['🧾｜patch-notes'], category: 'dev', kind: 'frCommunity', topic: 'Resumes publics des versions Sentinel', panel: 'patchNotes' },
    { name: '🛡｜rules', category: 'infoEn', kind: 'enReadOnly', topic: 'Sentinel rules', panel: 'rulesEn' },
    { name: '📡｜announcements', category: 'infoEn', kind: 'enReadOnly', topic: 'Official Sentinel announcements', panel: 'announcementsEn' },
    { name: '💠｜about-sentinel', category: 'infoEn', kind: 'enReadOnly', topic: 'Sentinel project overview', panel: 'presentationEn' },
    { name: '🧬｜dev-log', category: 'infoEn', kind: 'enReadOnly', topic: 'Continuous Sentinel development log', panel: 'changelogEn' },
    { name: '📚｜resources', category: 'infoEn', kind: 'enReadOnly', topic: 'Sentinel links, guides and references', panel: 'resourcesEn' },
    { name: '❔｜faq-en', category: 'infoEn', kind: 'enReadOnly', topic: 'Sentinel frequently asked questions', panel: 'faqEn' },
    { name: '📌｜sentinel-status', category: 'infoEn', kind: 'enReadOnly', topic: 'Sentinel status, maintenance and incidents', panel: 'statusEn' },
    { name: '💬｜general-en', category: 'communityEn', kind: 'enCommunity', topic: 'Main Sentinel community chat' },
    { name: '👋｜introductions', category: 'communityEn', kind: 'enCommunity', topic: 'Introduce yourself to the Sentinel community' },
    { name: '💡｜suggestions-en', category: 'communityEn', kind: 'enCommunity', topic: 'Ideas and improvements for Sentinel', panel: 'suggestionsEn' },
    { name: '🖼｜showcase-en', category: 'communityEn', kind: 'enCommunity', topic: 'Screenshots, setups and community creations' },
    { name: '🌙｜off-topic', category: 'communityEn', kind: 'enCommunity', topic: 'Free chat' },
    { name: '🗳｜priority-votes', aliases: ['🗳｜polls'], category: 'communityEn', kind: 'enCommunity', topic: 'Community votes and Sentinel priorities', panel: 'priorityVotesEn' },
    { name: '🎭｜sentinel-roles', category: 'communityEn', kind: 'enReadOnly', topic: 'Sentinel roles and notification preferences', panel: 'rolesEn' },
    { name: '🔧｜setup-help', category: 'supportEn', kind: 'enCommunity', topic: 'Sentinel setup and configuration help', panel: 'supportEn' },
    { name: '🚨｜bug-reports', category: 'supportEn', kind: 'enCommunity', topic: 'Sentinel bug reports', panel: 'bugsEn' },
    { name: '🤖｜commands', category: 'supportEn', kind: 'enCommunity', topic: 'Sentinel commands', panel: 'commandsEn' },
    { name: '🛰｜support-requests', category: 'supportEn', kind: 'enCommunity', topic: 'Sentinel support requests', panel: 'supportRequestsEn' },
    { name: '🎫｜open-a-ticket', category: 'supportEn', kind: 'enReadOnly', topic: 'Open a private Sentinel ticket', panel: 'ticketsEn' },
    { name: '🧭｜roadmap-en', category: 'devEn', kind: 'enCommunity', topic: 'Sentinel direction and priorities', panel: 'roadmapEn' },
    { name: '⚡｜beta-tests-en', category: 'devEn', kind: 'enCommunity', topic: 'Testing upcoming Sentinel features', panel: 'betaEn' },
    { name: '🔮｜future-ideas', category: 'devEn', kind: 'enCommunity', topic: 'Long-term Sentinel ideas', panel: 'futureIdeasEn' },
    { name: '🧾｜release-notes', category: 'devEn', kind: 'enCommunity', topic: 'Public Sentinel release summaries', panel: 'patchNotesEn' },
    { name: '🔒｜staff-chat', category: 'staff', kind: 'staff', topic: 'Coordination privee du staff Sentinel', panel: 'staff' },
    { name: '🧪｜tests-bot', category: 'staff', kind: 'staff', topic: 'Salon staff reserve aux tests bot Sentinel', panel: 'botTests' },
    { name: '📂｜logs', category: 'staff', kind: 'staff', topic: 'Traces internes et moderation Sentinel', panel: 'logs' },
    { name: '⚠️｜signalements', category: 'staff', kind: 'staff', topic: 'Suivi prive des signalements Sentinel', panel: 'reports' },
    { name: '📌｜todo-staff', category: 'staff', kind: 'staff', topic: 'Taches internes du staff Sentinel', panel: 'todo' }
];

const VOICE_CHANNELS = [
    { name: '◆ Salon general', aliases: ['◆ General'], category: 'voice', kind: 'frVoice' },
    { name: '◆ Assistance', aliases: ['◆ Support'], category: 'voice', kind: 'frVoice' },
    { name: '◆ Tests beta', aliases: ['◆ Beta Test'], category: 'voice', kind: 'frVoice' },
    { name: '◆ General EN', category: 'voiceEn', kind: 'enVoice' },
    { name: '◆ Support EN', category: 'voiceEn', kind: 'enVoice' },
    { name: '◆ Beta Test EN', category: 'voiceEn', kind: 'enVoice' }
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

function findTextChannel(guild, names) {
    const possibleNames = Array.isArray(names) ? names : [names];

    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText && possibleNames.includes(channel.name)
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

function languageRoleId(guild, language) {
    const roleName = language === 'en'
        ? '🌐 Sentinel | English'
        : '🌐 Sentinel | Français';

    return findRole(guild, roleName)?.id || null;
}

function languageOverwrites(guild, language, options = {}) {
    const languageRole = languageRoleId(guild, language);
    const baseDeny = [
        PermissionsBitField.Flags.MentionEveryone
    ];
    const baseAllow = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory
    ];

    if (options.readOnly) {
        baseDeny.push(
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.CreatePublicThreads,
            PermissionsBitField.Flags.CreatePrivateThreads
        );
    } else {
        baseAllow.push(
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AddReactions,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.EmbedLinks
        );
    }

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        }
    ];

    if (languageRole) {
        overwrites.push({
            id: languageRole,
            allow: baseAllow,
            deny: baseDeny
        });
    }

    for (const id of staffRoleIds(guild)) {
        overwrites.push({
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
        });
    }

    return overwrites;
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

    if (kind === 'frReadOnly') {
        return languageOverwrites(guild, 'fr', { readOnly: true });
    }

    if (kind === 'frCommunity') {
        return languageOverwrites(guild, 'fr');
    }

    if (kind === 'enReadOnly') {
        return languageOverwrites(guild, 'en', { readOnly: true });
    }

    if (kind === 'enCommunity') {
        return languageOverwrites(guild, 'en');
    }

    if (kind === 'voice') {
        return voiceOverwritesFor(guild, ['◈ Sentinel | Membre', '◌ Sentinel | Nouveau']);
    }

    if (kind === 'frVoice') {
        return voiceOverwritesFor(guild, ['🌐 Sentinel | Français']);
    }

    if (kind === 'enVoice') {
        return voiceOverwritesFor(guild, ['🌐 Sentinel | English']);
    }

    if (kind === 'publicReadOnly') {
        return [
            {
                id: guild.roles.everyone.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.ReadMessageHistory
                ],
                deny: [
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.CreatePublicThreads,
                    PermissionsBitField.Flags.CreatePrivateThreads
                ]
            },
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

    if (kind === 'voice') {
        return voiceOverwritesFor(guild, ['◈ Sentinel | Membre', '◌ Sentinel | Nouveau']);
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

function voiceOverwritesFor(guild, roleNames) {
        const allowedRoles = [
            ...roleNames,
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

async function ensureRoles(guild, result) {
    await guild.roles.fetch();

    for (const config of ROLES) {
        const role = findRole(guild, config.name)
            || (config.aliases || []).map(alias => findRole(guild, alias)).find(Boolean);

        if (role) {
            if (role.editable) {
                await role.edit({
                    name: config.name,
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
        let category = findCategory(guild, config.name)
            || (config.aliases || []).map(alias => findCategory(guild, alias)).find(Boolean);

        if (!category) {
            category = await guild.channels.create({
                name: config.name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwritesFor(guild, config.kind),
                reason: 'Sentinel auto sync'
            });
            result.created += 1;
        } else {
            if (category.name !== config.name) {
                await category.edit({
                    name: config.name,
                    reason: 'Sentinel auto sync'
                });
            }

            await category.permissionOverwrites.set(overwritesFor(guild, config.kind), 'Sentinel auto sync');
            result.updated += 1;
        }

        byKey.set(config.key, category);
    }

    return byKey;
}

async function ensureTextChannels(guild, categories, result) {
    for (const config of CHANNELS) {
        let channel = findTextChannel(guild, [config.name, ...(config.aliases || [])]);

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
                name: config.name,
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
        let channel = findVoiceChannel(guild, config.name)
            || (config.aliases || []).map(alias => findVoiceChannel(guild, alias)).find(Boolean);

        if (!channel) {
            channel = await guild.channels.create({
                name: config.name,
                type: ChannelType.GuildVoice,
                parent: categories.get(config.category)?.id || null,
                permissionOverwrites: overwritesFor(guild, config.kind || 'voice'),
                reason: 'Sentinel auto sync'
            });
            result.created += 1;
        } else {
            await channel.edit({
                name: config.name,
                parent: categories.get(config.category)?.id || channel.parentId,
                permissionOverwrites: overwritesFor(guild, config.kind || 'voice'),
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
        .setFooter({ text: 'Sentinel - Performance - Securite - Fiabilite' })
        .setTimestamp();
}

function panelPayload(panel) {
    const panels = {
        welcome: {
            embeds: [embed('Sentinel - Choix de langue', 'Bienvenue sur le serveur officiel Sentinel.\n\nChoisis ta langue pour afficher les salons qui te correspondent.\n\nWelcome to the official Sentinel server.\n\nChoose your language to display the matching channels.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_language:fr').setLabel('Français').setStyle(ButtonStyle.Primary).setEmoji('🇫🇷'),
                    new ButtonBuilder().setCustomId('sentinel_language:en').setLabel('English').setStyle(ButtonStyle.Secondary).setEmoji('🇬🇧')
                )
            ]
        },
        rules: {
            embeds: [embed('Reglement Sentinel', '**Respect**\nChaque membre doit pouvoir discuter sans pression, provocation ou attaque personnelle.\n\n**Lisibilite**\nLes salons restent propres : pas de spam, flood, mentions abusives ou messages volontairement confus.\n\n**Securite**\nLes failles, abus ou comportements suspects autour de Sentinel se signalent au staff en prive.\n\n**Support**\nLes demandes claires passent plus vite : contexte, commande concernee, capture ou erreur si possible.\n\n**Esprit du serveur**\nPerformance, securite, fiabilite. On garde une communaute utile, calme et bien tenue.', COLORS.cyan)]
        },
        presentation: {
            embeds: [embed('Sentinel', `Sentinel est un bot Discord pense pour les serveurs qui veulent rester organises, lisibles et fiables.\n\nIl accompagne la gestion des services, les logs, le support, la moderation, les tickets, la structuration communautaire et le suivi d activite avec une identite cyber-neon : noir profond, rose Sentinel et cyan electrique.\n\nSite officiel : ${LINKS.website}\nPage top.gg : ${LINKS.topgg}\n\nPerformance. Securite. Fiabilite.`, COLORS.pink)]
        },
        announcements: {
            embeds: [embed('Annonces Sentinel', 'Les informations importantes arrivent ici : mises a jour, changements du bot, maintenance, ouvertures de tests et annonces communautaires.\n\nQuand un message apparait dans ce salon, c est qu il merite ton attention.', COLORS.pink)]
        },
        changelog: {
            embeds: [embed('Journal dev Sentinel', 'Ce salon suit le travail continu autour de Sentinel.\n\nDernieres lignes de travail :\n- serveur communautaire complet avec roles, tickets et salons bilingues\n- choix de langue par boutons FR/EN\n- serveur de reference sans limite premium\n- publication du site Sentinel sur top.gg\n- outil staff de publication Discord\n\nLes entrees ici servent a suivre ce qui evolue avant les notes de version officielles.', COLORS.violet)]
        },
        resources: {
            embeds: [embed('Ressources Sentinel', `Tous les liens utiles de Sentinel sont regroupes ici.\n\n**Liens officiels**\nSite : ${LINKS.website}\nTop.gg : ${LINKS.topgg}\nInvitation du bot : ${LINKS.invite}\nGitHub : ${LINKS.github}\nConditions : ${LINKS.terms}\nConfidentialite : ${LINKS.privacy}\n\n**A consulter selon ton besoin**\n- annonces : informations importantes\n- journal dev : suivi technique continu\n- notes de version : changements publics finalises\n- FAQ : installation, permissions, langue, support\n- tickets : aide privee ou signalement de bug`, COLORS.cyan)]
        },
        faq: {
            embeds: [embed('FAQ Sentinel', '**Comment inviter Sentinel ?**\nUtilise le lien officiel fourni par le staff. Le bot doit avoir les scopes `bot` et `applications.commands`.\n\n**Quelles permissions sont importantes ?**\nSentinel doit pouvoir gerer les roles, lire les salons utiles, envoyer des messages, creer des tickets et lire l historique des messages.\n\n**Les boutons de langue ne changent pas ma vue staff, pourquoi ?**\nLes comptes administrateurs ou staff peuvent voir plusieurs versions du serveur car Discord leur donne des permissions plus larges.\n\n**Ou demander de l aide ?**\nUtilise les salons support ou ouvre un ticket si la demande est personnelle, sensible ou technique.\n\n**Ou suivre les mises a jour ?**\nLes annonces donnent les informations importantes. Le journal dev suit le travail continu. Les notes de version resument les sorties officielles.', COLORS.cyan)]
        },
        status: {
            embeds: [embed('Statut Sentinel', `**Etat actuel :** operationnel\n\nSentinel est publie et accessible via ses points officiels :\nSite : ${LINKS.website}\nTop.gg : ${LINKS.topgg}\nGitHub : ${LINKS.github}\n\nCe panneau est ensuite mis a jour automatiquement par le bot avec la latence, SQLite et la derniere synchronisation connue.\n\nLes maintenances, incidents, ralentissements et redemarrages importants seront annonces ici.`, COLORS.cyan)]
        },
        priorityVotes: {
            embeds: [embed('Votes priorites Sentinel', 'Choisis ce qui doit passer en priorite pour Sentinel.\n\nChaque bouton enregistre ton intention dans les logs staff. Les votes servent a sentir la direction de la communaute, pas a verrouiller la roadmap.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_vote:stability').setLabel('Stabilite').setStyle(ButtonStyle.Secondary).setEmoji('🛡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:features').setLabel('Fonctions').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:moderation').setLabel('Moderation').setStyle(ButtonStyle.Secondary).setEmoji('🔎'),
                    new ButtonBuilder().setCustomId('sentinel_vote:ux').setLabel('Ergonomie').setStyle(ButtonStyle.Secondary).setEmoji('💠')
                )
            ]
        },
        suggestions: {
            embeds: [embed('Suggestions Sentinel', 'Les idees pour ameliorer Sentinel passent ici.\n\nTu peux proposer une commande, une option, une integration, une amelioration visuelle ou un changement de fonctionnement. Les meilleures idees sont celles qui rendent le bot plus utile pour toute la communaute.', COLORS.violet)]
        },
        support: {
            embeds: [embed('Aide installation', `Besoin d aide pour inviter Sentinel, regler les permissions, configurer un salon ou comprendre une commande ?\n\n**Avant de demander**\n1. Verifie que Sentinel est installe comme bot, pas seulement comme integration de commandes.\n2. Place le role Sentinel au-dessus des roles qu il doit gerer.\n3. Verifie que les scopes \`bot\` et \`applications.commands\` sont presents.\n4. Utilise le lien officiel : ${LINKS.invite}\n\n**Pour recevoir de l aide rapidement**\nIndique ce que tu voulais faire, la commande ou le bouton concerne, ce qui bloque, et le message d erreur si tu en as un.`, COLORS.dark)]
        },
        bugs: {
            embeds: [embed('Signalement de bugs', 'Si Sentinel ne reagit pas comme prevu, signale-le ici ou ouvre un ticket bug.\n\n**Format conseille**\nCommande ou fonction :\nCe que tu as fait :\nResultat obtenu :\nResultat attendu :\nCapture ou message d erreur :\n\nLes bugs de boutons, permissions, tickets, langues, logs et commandes sont prioritaires sur le serveur de reference.', COLORS.dark)]
        },
        commands: {
            embeds: [embed('Commandes Sentinel', 'Les commandes principales de Sentinel sont disponibles avec `/` et plusieurs alias texte.\n\n**Membres**\n`/aide`, `/mes-heures`, `/historique-service`, `/en-service`, `/top-service`\n\n**Serveur de reference**\n`/heures`, `/top-semaine`, `/resume-service`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-heures`, `/reset-heures-all`\n\n**Moderation**\n`/avertir`, `/timeout`, `/fin-timeout`, `/expulser`, `/bannir`, `/purge`, `/sanctions`\n\n**Configuration**\n`/config-role`, `/config-logs`, `/config-permissions`, `/config-voir`, `/config-langue`', COLORS.cyan)]
        },
        supportRequests: {
            embeds: [embed('Demandes support', 'Les demandes qui demandent un suivi avec le support Sentinel peuvent etre posees ici.\n\nUtilise ce salon pour les questions simples. Pour une demande privee, sensible, longue ou liee a un bug, ouvre un ticket dans le salon dedie.\n\nLe support peut aider sur : installation, permissions, roles, logs, commandes, serveur de reference, top.gg, site officiel et publication Discord.', COLORS.dark)]
        },
        roadmap: {
            embeds: [embed('Roadmap Sentinel', 'Priorites actuelles :\n\n**Court terme**\n- stabiliser les boutons et tickets\n- enrichir les panneaux de ressources et statut\n- publier les annonces depuis les outils staff\n- ameliorer la documentation publique\n\n**Moyen terme**\n- statistiques de service plus detaillees\n- meilleurs rapports de moderation\n- workflow de release notes plus propre\n- verification continue des permissions\n\n**Long terme**\n- integrations externes utiles\n- tableau de bord web\n- automatisations de communaute plus fines', COLORS.violet)]
        },
        beta: {
            embeds: [embed('Beta tests', 'Les tests avances de Sentinel passent ici.\n\nA tester en priorite :\n- boutons de langue et roles\n- ouverture/fermeture de tickets support et bug\n- votes priorites\n- commandes avancees du serveur de reference\n- publication annonce/changelog/release depuis les outils staff\n- panneaux statut et ressources\n\nLes retours precis sont les plus utiles : action faite, resultat obtenu, resultat attendu, capture si possible.', COLORS.cyan)]
        },
        futureIdeas: {
            embeds: [embed('Idees futures', 'Cet espace sert a imaginer la suite de Sentinel.\n\nPistes ouvertes : tableau de bord web, meilleure page top.gg, systeme de templates serveur, analytics de service, assistants de configuration, notifications de maintenance, workflows de publication et outils staff plus pousses.\n\nUne bonne idee explique le probleme, l utilisateur concerne, et ce que Sentinel devrait simplifier.', COLORS.violet)]
        },
        patchNotes: {
            embeds: [embed('Notes de version', 'Version serveur de reference actuelle :\n\n- site officiel publie\n- page top.gg publiee\n- serveur communautaire bilingue FR/EN\n- boutons de langue fonctionnels\n- tickets support et bug\n- votes priorites\n- salon staff de tests bot\n- toutes les commandes actives sur le serveur de reference\n- outil staff de publication Discord\n\nLes prochaines notes reprendront uniquement les changements finalises.', COLORS.pink)]
        },
        rulesEn: {
            embeds: [embed('Sentinel Rules', '**Respect**\nEvery member should be able to talk without pressure, provocation or personal attacks.\n\n**Clarity**\nKeep channels readable: no spam, flood, abusive mentions or intentionally confusing messages.\n\n**Security**\nReport suspicious behavior, abuse or Sentinel security issues privately to the staff.\n\n**Support**\nClear requests are handled faster: context, command involved, screenshot or error when possible.\n\n**Server spirit**\nPerformance, security, reliability. Keep the community useful, calm and clean.', COLORS.cyan)]
        },
        announcementsEn: {
            embeds: [embed('Sentinel Announcements', 'Important information appears here: updates, bot changes, maintenance, testing openings and community announcements.\n\nWhen a message appears in this channel, it is worth your attention.', COLORS.pink)]
        },
        presentationEn: {
            embeds: [embed('Sentinel', `Sentinel is a Discord bot designed for servers that want to stay organized, readable and reliable.\n\nIt supports duty tracking, logs, support, moderation, tickets, community structure and activity tracking with a cyber-neon identity: deep black, Sentinel pink and electric cyan.\n\nOfficial website: ${LINKS.website}\nTop.gg page: ${LINKS.topgg}\n\nPerformance. Security. Reliability.`, COLORS.pink)]
        },
        changelogEn: {
            embeds: [embed('Sentinel Dev Log', 'This channel follows continuous Sentinel work.\n\nRecent work lines:\n- full community server with roles, tickets and bilingual channels\n- FR/EN language button flow\n- reference server without premium restrictions\n- Sentinel website published on top.gg\n- internal Discord publishing tool from the reference chat\n\nEntries here track work before official release notes.', COLORS.violet)]
        },
        resourcesEn: {
            embeds: [embed('Sentinel Resources', `All useful Sentinel links are gathered here.\n\n**Official links**\nWebsite: ${LINKS.website}\nTop.gg: ${LINKS.topgg}\nBot invite: ${LINKS.invite}\nGitHub: ${LINKS.github}\nTerms: ${LINKS.terms}\nPrivacy: ${LINKS.privacy}\n\n**Where to look**\n- announcements: important information\n- dev log: continuous technical tracking\n- release notes: finalized public changes\n- FAQ: setup, permissions, language and support\n- tickets: private help or bug reports`, COLORS.cyan)]
        },
        faqEn: {
            embeds: [embed('Sentinel FAQ', '**How do I invite Sentinel?**\nUse the official invite link shared by the staff. The bot needs the `bot` and `applications.commands` scopes.\n\n**Which permissions matter?**\nSentinel needs to manage roles, read useful channels, send messages, create tickets and read message history.\n\n**Why can staff accounts still see both languages?**\nAdministrator and staff accounts can bypass some channel filters because Discord gives them broader permissions.\n\n**Where do I ask for help?**\nUse support channels or open a ticket for personal, sensitive or technical requests.\n\n**Where do I follow updates?**\nAnnouncements carry important information. The dev log tracks ongoing work. Release notes summarize official releases.', COLORS.cyan)]
        },
        statusEn: {
            embeds: [embed('Sentinel Status', `**Current status:** operational\n\nSentinel is published and available through its official points:\nWebsite: ${LINKS.website}\nTop.gg: ${LINKS.topgg}\nGitHub: ${LINKS.github}\n\nThis panel is then automatically updated by the bot with latency, SQLite status and the latest known sync.\n\nMaintenance, incidents, slowdowns and important restarts will be announced here.`, COLORS.cyan)]
        },
        priorityVotesEn: {
            embeds: [embed('Sentinel Priority Votes', 'Choose what Sentinel should prioritize next.\n\nEach button records your intent in staff logs. Votes help read the community direction; they do not freeze the roadmap.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_vote:stability').setLabel('Stability').setStyle(ButtonStyle.Secondary).setEmoji('🛡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:features').setLabel('Features').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:moderation').setLabel('Moderation').setStyle(ButtonStyle.Secondary).setEmoji('🔎'),
                    new ButtonBuilder().setCustomId('sentinel_vote:ux').setLabel('Usability').setStyle(ButtonStyle.Secondary).setEmoji('💠')
                )
            ]
        },
        suggestionsEn: {
            embeds: [embed('Sentinel Suggestions', 'Ideas to improve Sentinel go here.\n\nYou can suggest a command, option, integration, visual improvement or behavior change. The best ideas make the bot more useful for the whole community.', COLORS.violet)]
        },
        supportEn: {
            embeds: [embed('Setup Help', `Need help inviting Sentinel, setting permissions, configuring a channel or understanding a command?\n\n**Before asking**\n1. Make sure Sentinel is installed as a bot, not only as a command integration.\n2. Place the Sentinel role above the roles it has to manage.\n3. Make sure the \`bot\` and \`applications.commands\` scopes are present.\n4. Use the official invite link: ${LINKS.invite}\n\n**For faster help**\nExplain what you wanted to do, the command or button involved, what is blocking you and the error message if you have one.`, COLORS.dark)]
        },
        bugsEn: {
            embeds: [embed('Bug Reports', 'If Sentinel does not behave as expected, report it here or open a bug ticket.\n\n**Suggested format**\nCommand or feature:\nWhat you did:\nActual result:\nExpected result:\nScreenshot or error message:\n\nButton, permission, ticket, language, log and command bugs are prioritized on the reference server.', COLORS.dark)]
        },
        commandsEn: {
            embeds: [embed('Sentinel Commands', 'Sentinel main commands are available with `/` and several text aliases.\n\n**Members**\n`/help`, `/my-hours`, `/history`, `/on-duty`, `/top-service`\n\n**Reference server**\n`/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-sentinel`, `/reset-hours`, `/reset-hours-all`\n\n**Moderation**\n`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`, `/mod-cases`\n\n**Configuration**\n`/config-role`, `/config-channel`, `/config-permissions`, `/config-view`, `/language`', COLORS.cyan)]
        },
        supportRequestsEn: {
            embeds: [embed('Support Requests', 'Requests that need Sentinel support follow-up can be posted here.\n\nUse this channel for simple questions. For private, sensitive, long or bug-related requests, open a ticket in the dedicated channel.\n\nSupport can help with setup, permissions, roles, logs, commands, the reference server, top.gg, the official website and Discord publishing.', COLORS.dark)]
        },
        roadmapEn: {
            embeds: [embed('Sentinel Roadmap', 'Current priorities:\n\n**Short term**\n- stabilize buttons and tickets\n- enrich resources and status panels\n- publish announcements from the reference chat\n- improve public documentation\n\n**Mid term**\n- deeper duty statistics\n- better moderation reports\n- cleaner release note workflow\n- continuous permission checks\n\n**Long term**\n- useful external integrations\n- web dashboard\n- server template automation\n- sharper staff tools', COLORS.violet)]
        },
        betaEn: {
            embeds: [embed('Beta Tests', 'Advanced Sentinel tests happen here.\n\nPriority checks:\n- language buttons and roles\n- support and bug ticket open/close flow\n- priority votes\n- reference server advanced commands\n- announcement/changelog/release publishing from the reference chat\n- status and resources panels\n\nPrecise feedback is best: action, actual result, expected result, screenshot if possible.', COLORS.cyan)]
        },
        futureIdeasEn: {
            embeds: [embed('Future Ideas', 'This space is for imagining Sentinel future.\n\nOpen directions: web dashboard, stronger top.gg page, server template system, duty analytics, setup assistants, maintenance notifications, publishing workflows and deeper staff tools.\n\nA strong idea explains the problem, the affected user and what Sentinel should simplify.', COLORS.violet)]
        },
        patchNotesEn: {
            embeds: [embed('Release Notes', 'Current reference server version:\n\n- official website published\n- top.gg page published\n- bilingual FR/EN community server\n- working language buttons\n- support and bug tickets\n- priority votes\n- staff bot test channel\n- all commands active on the reference server\n- Discord publishing tool from the reference chat\n\nFuture release notes will only list finalized changes.', COLORS.pink)]
        },
        staff: {
            embeds: [embed('Staff Sentinel', 'Coordination interne du staff Sentinel : moderation, support, annonces, priorites et suivi communautaire.', COLORS.dark)]
        },
        botTests: {
            embeds: [embed('Tests bot Sentinel', 'Salon interne reserve aux essais staff.\n\nTu peux tester ici les commandes, boutons, reponses, permissions, tickets et comportements experimentaux sans polluer les salons publics.', COLORS.violet)]
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
            embeds: [embed('Roles Sentinel', 'Choisis les notifications et statuts que tu veux recevoir.\n\nAnnonces, maintenance, journal dev, acces anticipe ou partenaire : les boutons te permettent d ajuster ton profil Sentinel en un clic.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_selfrole:announcements').setLabel('Annonces').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:maintenance').setLabel('Maintenance').setStyle(ButtonStyle.Secondary).setEmoji('🛠'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:changelog').setLabel('Journal dev').setStyle(ButtonStyle.Secondary).setEmoji('🧬'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:beta').setLabel('Acces anticipe').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:partner').setLabel('Partenaire').setStyle(ButtonStyle.Secondary).setEmoji('💎')
                )
            ]
        },
        rolesEn: {
            embeds: [embed('Sentinel Roles', 'Choose the notifications and status roles you want.\n\nAnnouncements, maintenance, changelog, early access or partner: the buttons let you adjust your Sentinel profile in one click.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_selfrole:announcements').setLabel('Announcements').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:maintenance').setLabel('Maintenance').setStyle(ButtonStyle.Secondary).setEmoji('🛠'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:changelog').setLabel('Changelog').setStyle(ButtonStyle.Secondary).setEmoji('🧬'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:beta').setLabel('Early Access').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:partner').setLabel('Partner').setStyle(ButtonStyle.Secondary).setEmoji('💎')
                )
            ]
        },
        tickets: {
            embeds: [embed('Support prive', 'Pour une demande personnelle, sensible ou qui demande un vrai suivi, ouvre un ticket prive avec le support Sentinel.\n\nUn espace dedie sera cree pour toi et l equipe pourra te repondre proprement.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_ticket:create').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
                    new ButtonBuilder().setCustomId('sentinel_ticket:bug').setLabel('Signaler un bug').setStyle(ButtonStyle.Danger).setEmoji('🚨')
                )
            ]
        }
        ,
        ticketsEn: {
            embeds: [embed('Private Support', 'For a personal, sensitive or follow-up request, open a private ticket with Sentinel support.\n\nA dedicated space will be created for you and the team will answer properly.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_ticket:create').setLabel('Open a ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
                    new ButtonBuilder().setCustomId('sentinel_ticket:bug').setLabel('Report a bug').setStyle(ButtonStyle.Danger).setEmoji('🚨')
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
