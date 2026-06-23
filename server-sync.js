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
            embeds: [embed('Sentinel', 'Sentinel est un bot Discord pense pour les serveurs qui veulent rester organises, lisibles et fiables.\n\nIl accompagne la gestion des services, les logs, le support, la moderation et l activite communautaire avec une identite cyber-neon : noir profond, rose Sentinel et cyan electrique.\n\nPerformance. Securite. Fiabilite.', COLORS.pink)]
        },
        announcements: {
            embeds: [embed('Annonces Sentinel', 'Les informations importantes arrivent ici : mises a jour, changements du bot, maintenance, ouvertures de tests et annonces communautaires.\n\nQuand un message apparait dans ce salon, c est qu il merite ton attention.', COLORS.pink)]
        },
        changelog: {
            embeds: [embed('Journal dev Sentinel', 'Ce salon suit le travail continu autour de Sentinel.\n\nTu y verras les evolutions en cours, les ajustements techniques, les corrections preparees et les changements qui ne sont pas encore forcement une version officielle.', COLORS.violet)]
        },
        resources: {
            embeds: [embed('Ressources Sentinel', 'Les liens utiles de Sentinel sont regroupes ici : invitation du bot, documentation, GitHub, guides, journal dev et informations importantes.\n\nUn point de depart simple pour retrouver ce dont tu as besoin.', COLORS.cyan)]
        },
        faq: {
            embeds: [embed('FAQ Sentinel', '**Comment inviter Sentinel ?**\nUtilise le lien officiel fourni par le staff. Le bot doit avoir les scopes `bot` et `applications.commands`.\n\n**Quelles permissions sont importantes ?**\nSentinel doit pouvoir gerer les roles, lire les salons utiles, envoyer des messages, creer des tickets et lire l historique des messages.\n\n**Les boutons de langue ne changent pas ma vue staff, pourquoi ?**\nLes comptes administrateurs ou staff peuvent voir plusieurs versions du serveur car Discord leur donne des permissions plus larges.\n\n**Ou demander de l aide ?**\nUtilise les salons support ou ouvre un ticket si la demande est personnelle, sensible ou technique.\n\n**Ou suivre les mises a jour ?**\nLes annonces donnent les informations importantes. Le journal dev suit le travail continu. Les notes de version resument les sorties officielles.', COLORS.cyan)]
        },
        status: {
            embeds: [embed('Statut Sentinel', '**Etat actuel :** operationnel\n\nCe panneau est mis a jour automatiquement par Sentinel avec la latence, la base SQLite et la derniere synchronisation connue.\n\nLes maintenances, incidents, ralentissements et redemarrages importants seront annonces ici.', COLORS.cyan)]
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
            embeds: [embed('Notes de version', 'Les notes de version resument ce qui change concretement pour les utilisateurs.\n\nQuand une version sort, tu retrouves ici les ajouts importants, corrections visibles, changements de commandes et informations a retenir.', COLORS.pink)]
        },
        rulesEn: {
            embeds: [embed('Sentinel Rules', '**Respect**\nEvery member should be able to talk without pressure, provocation or personal attacks.\n\n**Clarity**\nKeep channels readable: no spam, flood, abusive mentions or intentionally confusing messages.\n\n**Security**\nReport suspicious behavior, abuse or Sentinel security issues privately to the staff.\n\n**Support**\nClear requests are handled faster: context, command involved, screenshot or error when possible.\n\n**Server spirit**\nPerformance, security, reliability. Keep the community useful, calm and clean.', COLORS.cyan)]
        },
        announcementsEn: {
            embeds: [embed('Sentinel Announcements', 'Important information appears here: updates, bot changes, maintenance, testing openings and community announcements.\n\nWhen a message appears in this channel, it is worth your attention.', COLORS.pink)]
        },
        presentationEn: {
            embeds: [embed('Sentinel', 'Sentinel is a Discord bot designed for servers that want to stay organized, readable and reliable.\n\nIt supports service management, logs, support, moderation and community activity with a cyber-neon identity: deep black, Sentinel pink and electric cyan.\n\nPerformance. Security. Reliability.', COLORS.pink)]
        },
        changelogEn: {
            embeds: [embed('Sentinel Dev Log', 'This channel follows the continuous work around Sentinel.\n\nYou will find ongoing changes, technical adjustments, prepared fixes and updates that are not necessarily an official release yet.', COLORS.violet)]
        },
        resourcesEn: {
            embeds: [embed('Sentinel Resources', 'Useful Sentinel links are gathered here: bot invite, documentation, GitHub, guides, changelog and important information.\n\nA simple starting point whenever you need a reference.', COLORS.cyan)]
        },
        faqEn: {
            embeds: [embed('Sentinel FAQ', '**How do I invite Sentinel?**\nUse the official invite link shared by the staff. The bot needs the `bot` and `applications.commands` scopes.\n\n**Which permissions matter?**\nSentinel needs to manage roles, read useful channels, send messages, create tickets and read message history.\n\n**Why can staff accounts still see both languages?**\nAdministrator and staff accounts can bypass some channel filters because Discord gives them broader permissions.\n\n**Where do I ask for help?**\nUse support channels or open a ticket for personal, sensitive or technical requests.\n\n**Where do I follow updates?**\nAnnouncements carry important information. The dev log tracks ongoing work. Release notes summarize official releases.', COLORS.cyan)]
        },
        statusEn: {
            embeds: [embed('Sentinel Status', '**Current status:** operational\n\nThis panel is automatically updated by Sentinel with latency, SQLite status and the latest known sync.\n\nMaintenance, incidents, slowdowns and important restarts will be announced here.', COLORS.cyan)]
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
            embeds: [embed('Setup Help', 'Need help inviting Sentinel, setting permissions, configuring a channel or understanding a command?\n\nSend your issue with as much context as possible: what you wanted to do, what is blocking you, and the error message if you have one.', COLORS.dark)]
        },
        bugsEn: {
            embeds: [embed('Bug Reports', 'If Sentinel does not behave as expected, report it here.\n\nInclude the command or feature involved, what you did, what happened and a screenshot if possible. Clear reports make fixes faster.', COLORS.dark)]
        },
        commandsEn: {
            embeds: [embed('Sentinel Commands', 'Sentinel main commands are available directly with `/`.\n\nUse `/mes-heures` to check your time, `/top-service` for the leaderboard, `/config-voir` for configuration, and admin commands for roles, logs and resets.', COLORS.cyan)]
        },
        supportRequestsEn: {
            embeds: [embed('Support Requests', 'Requests that need Sentinel support follow-up can be posted here.\n\nFor private or sensitive issues, open a ticket in the dedicated channel.', COLORS.dark)]
        },
        roadmapEn: {
            embeds: [embed('Sentinel Roadmap', 'The roadmap gives a view of Sentinel next directions: new features, stability improvements, moderation tools, usability and integrations.\n\nNothing is frozen, but every step brings the bot closer to a cleaner and stronger experience.', COLORS.violet)]
        },
        betaEn: {
            embeds: [embed('Beta Tests', 'Advanced Sentinel tests happen here.\n\nFeatures shown here may change, be fixed or disappear before public release. Precise feedback is the most useful.', COLORS.cyan)]
        },
        futureIdeasEn: {
            embeds: [embed('Future Ideas', 'This space is for imagining Sentinel future.\n\nConcepts, automations, integrations, interfaces, moderation, premium features: anything that can make the bot stronger can start here.', COLORS.violet)]
        },
        patchNotesEn: {
            embeds: [embed('Release Notes', 'Release notes summarize what changes for users.\n\nWhen a version ships, you will find important additions, visible fixes, command changes and key information here.', COLORS.pink)]
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
