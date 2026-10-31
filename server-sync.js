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
    website: 'https://noctigarde.fr/',
    topgg: 'https://top.gg/bot/1511426423376842922',
    invite: 'https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands',
    github: 'https://github.com/phileaszer/bot-service-discord',
    terms: 'https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md',
    privacy: 'https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md'
};

const ROLES = [
    { name: '✦ Noctigarde | Fondateur', aliases: ['✦ Sentinel | Fondateur'], color: COLORS.pink, hoist: true },
    { name: '◆ Noctigarde | Administrateur', aliases: ['◆ Sentinel | Administrateur'], color: 0xd91b7d, hoist: true },
    { name: '◇ Noctigarde | Moderateur', aliases: ['◇ Sentinel | Moderateur'], color: COLORS.violet, hoist: true },
    { name: '✚ Noctigarde | Support', aliases: ['✚ Sentinel | Support'], color: COLORS.cyan, hoist: true },
    { name: '🟢 Noctigarde | En service', aliases: ['🟢 Sentinel | En service'], color: 0x2ecc71, hoist: true },
    { name: '⚡ Noctigarde | Testeur beta', aliases: ['⚡ Noctigarde | Beta Tester', '⚡ Sentinel | Testeur beta', '⚡ Sentinel | Beta Tester'], color: 0x00b8ff, hoist: false },
    { name: '◈ Noctigarde | Membre', aliases: ['◈ Sentinel | Membre'], color: 0x2f3136, hoist: false },
    { name: '◌ Noctigarde | Nouveau', aliases: ['◌ Sentinel | Nouveau'], color: 0x777777, hoist: false },
    { name: '💎 Noctigarde | Partenaire', aliases: ['💎 Sentinel | Partenaire'], color: COLORS.pink, hoist: false },
    { name: '⚡ Noctigarde | Acces anticipe', aliases: ['⚡ Noctigarde | Early Access', '⚡ Sentinel | Acces anticipe', '⚡ Sentinel | Early Access'], color: 0x00b8ff, hoist: false },
    { name: '📡 Noctigarde | Annonces', aliases: ['📡 Sentinel | Annonces'], color: COLORS.cyan, hoist: false },
    { name: '🛠 Noctigarde | Maintenance', aliases: ['🛠 Sentinel | Maintenance'], color: 0xff4fb8, hoist: false },
    { name: '🧬 Noctigarde | Journal dev', aliases: ['🧬 Noctigarde | Changelog', '🧬 Sentinel | Journal dev', '🧬 Sentinel | Changelog'], color: COLORS.violet, hoist: false },
    { name: '🌐 Noctigarde | Français', aliases: ['🌐 Sentinel | Français'], color: COLORS.pink, hoist: false },
    { name: '🌐 Noctigarde | English', aliases: ['🌐 Sentinel | English'], color: COLORS.cyan, hoist: false }
];

const CATEGORIES = [
    { key: 'start', name: '✦ NOCTIGARDE // LANGUE', aliases: ['✦ NOCTIGARDE // START', '✦ SENTINEL // LANGUE', '✦ SENTINEL // START'], kind: 'publicReadOnly' },
    { key: 'info', name: '✦ NOCTIGARDE // INFORMATIONS', aliases: ['✦ SENTINEL // INFORMATIONS'], kind: 'frReadOnly' },
    { key: 'community', name: '✦ NOCTIGARDE // COMMUNAUTE', aliases: ['✦ SENTINEL // COMMUNAUTE'], kind: 'frCommunity' },
    { key: 'support', name: '✦ NOCTIGARDE // SUPPORT', aliases: ['✦ SENTINEL // SUPPORT'], kind: 'frCommunity' },
    { key: 'dev', name: '✦ NOCTIGARDE // DEVELOPPEMENT', aliases: ['✦ SENTINEL // DEVELOPPEMENT'], kind: 'frCommunity' },
    { key: 'voice', name: '✦ NOCTIGARDE // VOCAL', aliases: ['✦ SENTINEL // VOCAL'], kind: 'frVoice' },
    { key: 'infoEn', name: '✦ NOCTIGARDE // INFORMATION', aliases: ['✦ SENTINEL // INFORMATION'], kind: 'enReadOnly' },
    { key: 'communityEn', name: '✦ NOCTIGARDE // COMMUNITY', aliases: ['✦ SENTINEL // COMMUNITY'], kind: 'enCommunity' },
    { key: 'supportEn', name: '✦ NOCTIGARDE // SUPPORT EN', aliases: ['✦ SENTINEL // SUPPORT EN'], kind: 'enCommunity' },
    { key: 'devEn', name: '✦ NOCTIGARDE // DEVELOPMENT', aliases: ['✦ SENTINEL // DEVELOPMENT'], kind: 'enCommunity' },
    { key: 'voiceEn', name: '✦ NOCTIGARDE // VOICE', aliases: ['✦ SENTINEL // VOICE'], kind: 'enVoice' },
    { key: 'staff', name: '✦ NOCTIGARDE // STAFF', aliases: ['✦ SENTINEL // STAFF'], kind: 'staff' }
];

const CHANNELS = [
    { name: '💗｜bienvenue', category: 'start', kind: 'publicReadOnly', topic: 'Choisis ta langue Noctigarde', panel: 'welcome' },
    { name: '🛡｜reglement', category: 'info', kind: 'frReadOnly', topic: 'Reglement Noctigarde', panel: 'rules' },
    { name: '📡｜annonces', category: 'info', kind: 'frReadOnly', topic: 'Annonces officielles Noctigarde', panel: 'announcements' },
    { name: '💠｜presentation-noctigarde', aliases: ['💠｜presentation-sentinel'], category: 'info', kind: 'frReadOnly', topic: 'Presentation du projet Noctigarde', panel: 'presentation' },
    { name: '🧬｜journal-dev', aliases: ['🧬｜changelog'], category: 'info', kind: 'frReadOnly', topic: 'Journal technique continu du developpement Noctigarde', panel: 'changelog' },
    { name: '📚｜ressources', category: 'info', kind: 'frReadOnly', topic: 'Liens, guides et references Noctigarde', panel: 'resources' },
    { name: '❔｜faq', category: 'info', kind: 'frReadOnly', topic: 'Questions frequentes Noctigarde', panel: 'faq' },
    { name: '📌｜statut-noctigarde', aliases: ['📌｜statut-sentinel'], category: 'info', kind: 'frReadOnly', topic: 'Statut, maintenance et incidents Noctigarde', panel: 'status' },
    { name: '💬｜general', category: 'community', kind: 'frCommunity', topic: 'Discussion generale Noctigarde' },
    { name: '👋｜presentations', category: 'community', kind: 'frCommunity', topic: 'Presente-toi a la communaute Noctigarde' },
    { name: '💡｜suggestions', category: 'community', kind: 'frCommunity', topic: 'Idees et ameliorations pour Noctigarde', panel: 'suggestions' },
    { name: '🖼｜showcase', category: 'community', kind: 'frCommunity', topic: 'Captures, configurations et creations communautaires' },
    { name: '🌙｜hors-sujet', category: 'community', kind: 'frCommunity', topic: 'Discussion libre' },
    { name: '🗳｜votes-priorites', aliases: ['🗳｜sondages'], category: 'community', kind: 'frCommunity', topic: 'Votes communautaires et priorites Noctigarde', panel: 'priorityVotes' },
    { name: '🎭｜roles-noctigarde', aliases: ['🎭｜roles-sentinel'], category: 'community', kind: 'frReadOnly', topic: 'Roles et preferences Noctigarde', panel: 'roles' },
    { name: '🔧｜aide-installation', category: 'support', kind: 'frCommunity', topic: 'Aide installation et configuration Noctigarde', panel: 'support' },
    { name: '🚨｜bugs', category: 'support', kind: 'frCommunity', topic: 'Signalement de bugs Noctigarde', panel: 'bugs' },
    { name: '🤖｜commandes', category: 'support', kind: 'frCommunity', topic: 'Commandes Noctigarde', panel: 'commands' },
    { name: '🛰｜demandes-support', category: 'support', kind: 'frCommunity', topic: 'Demandes support Noctigarde', panel: 'supportRequests' },
    { name: '📁｜ouvrir-un-dossier', aliases: ['🎫｜ouvrir-un-ticket'], category: 'support', kind: 'frReadOnly', topic: 'Ouvrir un dossier prive Noctigarde', panel: 'tickets' },
    { name: '🧭｜roadmap', category: 'dev', kind: 'frCommunity', topic: 'Direction et priorites Noctigarde', panel: 'roadmap' },
    { name: '⚡｜beta-tests', category: 'dev', kind: 'frCommunity', topic: 'Tests des prochaines fonctionnalites Noctigarde', panel: 'beta' },
    { name: '🔮｜idees-futures', category: 'dev', kind: 'frCommunity', topic: 'Idees long terme pour Noctigarde', panel: 'futureIdeas' },
    { name: '🧾｜notes-de-version', aliases: ['🧾｜patch-notes'], category: 'dev', kind: 'frCommunity', topic: 'Resumes publics des versions Noctigarde', panel: 'patchNotes' },
    { name: '🛡｜rules', category: 'infoEn', kind: 'enReadOnly', topic: 'Noctigarde rules', panel: 'rulesEn' },
    { name: '📡｜announcements', category: 'infoEn', kind: 'enReadOnly', topic: 'Official Noctigarde announcements', panel: 'announcementsEn' },
    { name: '💠｜about-noctigarde', aliases: ['💠｜about-sentinel'], category: 'infoEn', kind: 'enReadOnly', topic: 'Noctigarde project overview', panel: 'presentationEn' },
    { name: '🧬｜dev-log', category: 'infoEn', kind: 'enReadOnly', topic: 'Continuous Noctigarde development log', panel: 'changelogEn' },
    { name: '📚｜resources', category: 'infoEn', kind: 'enReadOnly', topic: 'Noctigarde links, guides and references', panel: 'resourcesEn' },
    { name: '❔｜faq-en', category: 'infoEn', kind: 'enReadOnly', topic: 'Noctigarde frequently asked questions', panel: 'faqEn' },
    { name: '📌｜noctigarde-status', aliases: ['📌｜sentinel-status'], category: 'infoEn', kind: 'enReadOnly', topic: 'Noctigarde status, maintenance and incidents', panel: 'statusEn' },
    { name: '💬｜general-en', category: 'communityEn', kind: 'enCommunity', topic: 'Main Noctigarde community chat' },
    { name: '👋｜introductions', category: 'communityEn', kind: 'enCommunity', topic: 'Introduce yourself to the Noctigarde community' },
    { name: '💡｜suggestions-en', category: 'communityEn', kind: 'enCommunity', topic: 'Ideas and improvements for Noctigarde', panel: 'suggestionsEn' },
    { name: '🖼｜showcase-en', category: 'communityEn', kind: 'enCommunity', topic: 'Screenshots, setups and community creations' },
    { name: '🌙｜off-topic', category: 'communityEn', kind: 'enCommunity', topic: 'Free chat' },
    { name: '🗳｜priority-votes', aliases: ['🗳｜polls'], category: 'communityEn', kind: 'enCommunity', topic: 'Community votes and Noctigarde priorities', panel: 'priorityVotesEn' },
    { name: '🎭｜noctigarde-roles', aliases: ['🎭｜sentinel-roles'], category: 'communityEn', kind: 'enReadOnly', topic: 'Noctigarde roles and notification preferences', panel: 'rolesEn' },
    { name: '🔧｜setup-help', category: 'supportEn', kind: 'enCommunity', topic: 'Noctigarde setup and configuration help', panel: 'supportEn' },
    { name: '🚨｜bug-reports', category: 'supportEn', kind: 'enCommunity', topic: 'Noctigarde bug reports', panel: 'bugsEn' },
    { name: '🤖｜commands', category: 'supportEn', kind: 'enCommunity', topic: 'Noctigarde commands', panel: 'commandsEn' },
    { name: '🛰｜support-requests', category: 'supportEn', kind: 'enCommunity', topic: 'Noctigarde support requests', panel: 'supportRequestsEn' },
    { name: '📁｜open-a-dossier', aliases: ['🎫｜open-a-ticket'], category: 'supportEn', kind: 'enReadOnly', topic: 'Open a private Noctigarde dossier', panel: 'ticketsEn' },
    { name: '🧭｜roadmap-en', category: 'devEn', kind: 'enCommunity', topic: 'Noctigarde direction and priorities', panel: 'roadmapEn' },
    { name: '⚡｜beta-tests-en', category: 'devEn', kind: 'enCommunity', topic: 'Testing upcoming Noctigarde features', panel: 'betaEn' },
    { name: '🔮｜future-ideas', category: 'devEn', kind: 'enCommunity', topic: 'Long-term Noctigarde ideas', panel: 'futureIdeasEn' },
    { name: '🧾｜release-notes', category: 'devEn', kind: 'enCommunity', topic: 'Public Noctigarde release summaries', panel: 'patchNotesEn' },
    { name: '🔒｜staff-chat', category: 'staff', kind: 'staff', topic: 'Coordination privee du staff Noctigarde', panel: 'staff' },
    { name: '🧪｜tests-bot', category: 'staff', kind: 'staff', topic: 'Salon staff reserve aux tests bot Noctigarde', panel: 'botTests' },
    { name: '📂｜logs', category: 'staff', kind: 'staff', topic: 'Traces internes et moderation Noctigarde', panel: 'logs' },
    { name: '⚠️｜signalements', category: 'staff', kind: 'staff', topic: 'Suivi prive des signalements Noctigarde', panel: 'reports' },
    { name: '📌｜todo-staff', category: 'staff', kind: 'staff', topic: 'Taches internes du staff Noctigarde', panel: 'todo' }
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
    '✦ Noctigarde | Fondateur',
    '◆ Noctigarde | Administrateur',
    '◇ Noctigarde | Moderateur',
    '✚ Noctigarde | Support'
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
        ? '🌐 Noctigarde | English'
        : '🌐 Noctigarde | Français';

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
        return voiceOverwritesFor(guild, ['◈ Noctigarde | Membre', '◌ Noctigarde | Nouveau']);
    }

    if (kind === 'frVoice') {
        return voiceOverwritesFor(guild, ['🌐 Noctigarde | Français']);
    }

    if (kind === 'enVoice') {
        return voiceOverwritesFor(guild, ['🌐 Noctigarde | English']);
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
        return voiceOverwritesFor(guild, ['◈ Noctigarde | Membre', '◌ Noctigarde | Nouveau']);
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
                    reason: 'Noctigarde auto sync'
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
            reason: 'Noctigarde auto sync'
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
                reason: 'Noctigarde auto sync'
            });
            result.created += 1;
        } else {
            if (category.name !== config.name) {
                await category.edit({
                    name: config.name,
                    reason: 'Noctigarde auto sync'
                });
            }

            await category.permissionOverwrites.set(overwritesFor(guild, config.kind), 'Noctigarde auto sync');
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
                reason: 'Noctigarde auto sync'
            });
            result.created += 1;
        } else {
            await channel.edit({
                name: config.name,
                parent: categories.get(config.category)?.id || channel.parentId,
                topic: config.topic,
                permissionOverwrites: overwritesFor(guild, config.kind),
                reason: 'Noctigarde auto sync'
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
                reason: 'Noctigarde auto sync'
            });
            result.created += 1;
        } else {
            await channel.edit({
                name: config.name,
                parent: categories.get(config.category)?.id || channel.parentId,
                permissionOverwrites: overwritesFor(guild, config.kind || 'voice'),
                reason: 'Noctigarde auto sync'
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
        .setFooter({ text: 'Noctigarde - Performance - Sécurité - Fiabilité' })
        .setTimestamp();
}

function panelPayload(panel) {
    const panels = {
        welcome: {
            embeds: [embed('Noctigarde - Choix de langue', 'Bienvenue sur le serveur officiel Noctigarde.\n\nChoisis ta langue pour afficher les salons qui te correspondent.\n\nWelcome to the official Noctigarde server.\n\nChoose your language to display the matching channels.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_language:fr').setLabel('Français').setStyle(ButtonStyle.Primary).setEmoji('🇫🇷'),
                    new ButtonBuilder().setCustomId('sentinel_language:en').setLabel('English').setStyle(ButtonStyle.Secondary).setEmoji('🇬🇧')
                )
            ]
        },
        rules: {
            embeds: [embed('Règlement Noctigarde', '**Respect**\nChaque membre doit pouvoir discuter sans pression, provocation ou attaque personnelle.\n\n**Lisibilité**\nLes salons restent propres : pas de spam, flood, mentions abusives ou messages volontairement confus.\n\n**Sécurité**\nLes failles, abus ou comportements suspects autour de Noctigarde se signalent au staff en privé.\n\n**Support**\nLes demandes claires passent plus vite : contexte, commande concernée, capture ou erreur si possible.\n\n**Esprit du serveur**\nPerformance, sécurité, fiabilité. On garde une communauté utile, calme et bien tenue.', COLORS.cyan)]
        },
        presentation: {
            embeds: [embed('Noctigarde', `Noctigarde est pensé pour les serveurs Discord qui veulent rester organisés, lisibles et fiables.\n\nIl aide à gérer les prises de service, la modération, les logs, les dossiers/tickets, le support et le suivi d’activité, avec une identité futuriste propre à Noctigarde.\n\nSite officiel : ${LINKS.website}\nPage top.gg : ${LINKS.topgg}\n\nPerformance. Sécurité. Fiabilité.`, COLORS.pink)]
        },
        announcements: {
            embeds: [embed('Annonces Noctigarde', 'Les informations importantes arrivent ici : mises à jour, changements du bot, maintenance, ouvertures de tests et annonces communautaires.\n\nQuand un message apparaît dans ce salon, c’est qu’il mérite ton attention.', COLORS.pink)]
        },
        changelog: {
            embeds: [embed('Journal dev Noctigarde', 'Ce salon suit le travail continu autour de Noctigarde.\n\nDernières lignes de travail :\n- serveur communautaire bilingue avec rôles, dossiers et salons dédiés\n- choix de langue par boutons FR/EN\n- dashboard web plus complet\n- tickets/dossiers avec statuts, responsables et comptes rendus\n- protections plus propres sur les permissions Discord\n\nLes entrées ici servent à suivre ce qui évolue avant les notes de version officielles.', COLORS.violet)]
        },
        resources: {
            embeds: [embed('Ressources Noctigarde', `Tous les liens utiles de Noctigarde sont regroupés ici.\n\n**Liens officiels**\nSite : ${LINKS.website}\nTop.gg : ${LINKS.topgg}\nInvitation du bot : ${LINKS.invite}\nGitHub : ${LINKS.github}\nConditions : ${LINKS.terms}\nConfidentialité : ${LINKS.privacy}\n\n**À consulter selon ton besoin**\n- annonces : informations importantes\n- journal dev : suivi continu du projet\n- notes de version : changements publics finalisés\n- FAQ : installation, permissions, langue, support\n- dossiers : aide privée ou signalement de bug`, COLORS.cyan)]
        },
        faq: {
            embeds: [embed('FAQ Noctigarde', '**Comment inviter Noctigarde ?**\nUtilise le lien officiel fourni par le staff. Le bot doit avoir les scopes `bot` et `applications.commands`.\n\n**Quelles permissions sont importantes ?**\nNoctigarde doit pouvoir gérer les rôles, lire les salons utiles, envoyer des messages, créer des dossiers et lire l’historique des messages.\n\n**Les boutons de langue ne changent pas ma vue staff, pourquoi ?**\nLes comptes administrateurs ou staff peuvent voir plusieurs versions du serveur, car Discord leur donne des accès plus larges.\n\n**Où demander de l’aide ?**\nUtilise les salons support ou ouvre un dossier si la demande est personnelle, sensible ou technique.\n\n**Où suivre les mises à jour ?**\nLes annonces donnent les informations importantes. Le journal dev suit le travail continu. Les notes de version résument les sorties officielles.', COLORS.cyan)]
        },
        status: {
            embeds: [embed('Statut Noctigarde', `**État actuel :** opérationnel\n\nNoctigarde est publié et accessible via ses points officiels :\nSite : ${LINKS.website}\nTop.gg : ${LINKS.topgg}\nGitHub : ${LINKS.github}\n\nCe panneau est ensuite mis à jour automatiquement par le bot avec la latence et la dernière synchronisation connue.\n\nLes maintenances, incidents, ralentissements et redémarrages importants seront annoncés ici.`, COLORS.cyan)]
        },
        priorityVotes: {
            embeds: [embed('Votes priorités Noctigarde', 'Choisis ce qui doit passer en priorité pour Noctigarde.\n\nChaque bouton enregistre ton intention dans les logs staff. Les votes servent à sentir la direction de la communauté, pas à verrouiller la roadmap.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_vote:stability').setLabel('Stabilité').setStyle(ButtonStyle.Secondary).setEmoji('🛡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:features').setLabel('Fonctions').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_vote:moderation').setLabel('Modération').setStyle(ButtonStyle.Secondary).setEmoji('🔎'),
                    new ButtonBuilder().setCustomId('sentinel_vote:ux').setLabel('Ergonomie').setStyle(ButtonStyle.Secondary).setEmoji('💠')
                )
            ]
        },
        suggestions: {
            embeds: [embed('Suggestions Noctigarde', 'Les idées pour améliorer Noctigarde passent ici.\n\nTu peux proposer une commande, une option, une intégration, une amélioration visuelle ou un changement de fonctionnement. Les meilleures idées sont celles qui rendent le bot plus utile pour toute la communauté.', COLORS.violet)]
        },
        support: {
            embeds: [embed('Aide installation', `Besoin d’aide pour inviter Noctigarde, régler les permissions, configurer un salon ou comprendre une commande ?\n\n**Avant de demander**\n1. Vérifie que Noctigarde est installé comme bot, pas seulement comme intégration de commandes.\n2. Place le rôle Noctigarde au-dessus des rôles qu’il doit gérer.\n3. Vérifie que les scopes \`bot\` et \`applications.commands\` sont présents.\n4. Utilise le lien officiel : ${LINKS.invite}\n\n**Pour recevoir de l’aide rapidement**\nIndique ce que tu voulais faire, la commande ou le bouton concerné, ce qui bloque, et le message d’erreur si tu en as un.`, COLORS.dark)]
        },
        bugs: {
            embeds: [embed('Signalement de bugs', 'Si Noctigarde ne réagit pas comme prévu, signale-le ici ou ouvre un dossier de signalement.\n\n**Format conseillé**\nCommande ou fonction :\nCe que tu as fait :\nRésultat obtenu :\nRésultat attendu :\nCapture ou message d’erreur :\n\nLes bugs de boutons, permissions, dossiers, langues, logs et commandes sont prioritaires sur le serveur de référence.', COLORS.dark)]
        },
        commands: {
            embeds: [embed('Commandes Noctigarde', 'Les commandes principales de Noctigarde sont disponibles avec `/`.\n\n**Membres**\n`/aide`, `/mes-heures`, `/historique-service`, `/en-service`, `/top-service`\n\n**Service et salaires**\n`/config-role`, `/config-logs`, `/config-paie`, `/paie-semaine`, `/paie-marquer`, `/paie-archive`\n\n**Dossiers = tickets**\n`/dossier-panel`, `/dossier-prendre`, `/dossier-statut`, `/dossier-ajouter`, `/dossier-retirer`, `/dossier-compte-rendu`, `/dossier-fermer`\n\n**Modération**\n`/avertir`, `/timeout`, `/fin-timeout`, `/expulser`, `/bannir`, `/purge`, `/sanctions`\n\n**Réglages**\n`/config-langue`, `/config-permissions`, `/config-voir`, `/diagnostic`', COLORS.cyan)]
        },
        supportRequests: {
            embeds: [embed('Demandes support', 'Les demandes qui demandent un suivi avec le support Noctigarde peuvent être posées ici.\n\nUtilise ce salon pour les questions simples. Pour une demande privée, sensible, longue ou liée à un bug, ouvre un dossier dans le salon dédié.\n\nLe support peut aider sur : installation, permissions, rôles, logs, commandes, serveur de référence, top.gg, site officiel et publication Discord.', COLORS.dark)]
        },
        roadmap: {
            embeds: [embed('Roadmap Noctigarde', 'Priorités actuelles :\n\n**Court terme**\n- stabiliser les boutons, les dossiers et les permissions\n- améliorer les panneaux de ressources et de statut\n- rendre le dashboard plus clair pour les nouveaux serveurs\n- garder une documentation publique simple à suivre\n\n**Moyen terme**\n- statistiques de service plus détaillées\n- meilleurs rapports de modération\n- workflow de notes de version plus propre\n- vérification continue des permissions\n\n**Long terme**\n- intégrations externes utiles\n- automatisations de communauté plus fines\n- outils staff plus poussés pour les gros serveurs', COLORS.violet)]
        },
        beta: {
            embeds: [embed('Beta tests', 'Les tests avancés de Noctigarde passent ici.\n\nÀ tester en priorité :\n- boutons de langue et rôles\n- ouverture/fermeture de dossiers support, signalement, recrutement, partenariat et autre\n- votes prioritaires\n- commandes avancées du serveur de référence\n- publication d’annonces et de notes depuis les outils staff\n- panneaux statut et ressources\n\nLes retours précis sont les plus utiles : action faite, résultat obtenu, résultat attendu, capture si possible.', COLORS.cyan)]
        },
        futureIdeas: {
            embeds: [embed('Idées futures', 'Cet espace sert à imaginer la suite de Noctigarde.\n\nPistes ouvertes : dashboard plus guidé, meilleure page top.gg, templates serveur, statistiques de service, assistants de configuration, notifications de maintenance, workflows de publication et outils staff plus poussés.\n\nUne bonne idée explique le problème, l’utilisateur concerné, et ce que Noctigarde devrait simplifier.', COLORS.violet)]
        },
        patchNotes: {
            embeds: [embed('Notes de version', 'Version serveur de référence actuelle :\n\n- site officiel et dashboard actifs\n- serveur communautaire bilingue FR/EN\n- boutons de langue fonctionnels\n- dossiers/tickets avec types, statuts et prise en charge\n- salaires, heures de service et suivi staff\n- modération par ID, sanctions et logs\n- panneaux synchronisés sans supprimer les annonces publiées\n\nLes prochaines notes reprendront uniquement les changements finalisés.', COLORS.pink)]
        },
        rulesEn: {
            embeds: [embed('Noctigarde Rules', '**Respect**\nEvery member should be able to talk without pressure, provocation or personal attacks.\n\n**Clarity**\nKeep channels readable: no spam, flood, abusive mentions or intentionally confusing messages.\n\n**Security**\nReport suspicious behavior, abuse or Noctigarde security issues privately to the staff.\n\n**Support**\nClear requests are handled faster: context, command involved, screenshot or error when possible.\n\n**Server spirit**\nPerformance, security, reliability. Keep the community useful, calm and clean.', COLORS.cyan)]
        },
        announcementsEn: {
            embeds: [embed('Noctigarde Announcements', 'Important information appears here: updates, bot changes, maintenance, testing openings and community announcements.\n\nWhen a message appears in this channel, it is worth your attention.', COLORS.pink)]
        },
        presentationEn: {
            embeds: [embed('Noctigarde', `Noctigarde is a Discord bot designed for servers that want to stay organized, readable and reliable.\n\nIt supports duty tracking, logs, support, moderation, dossiers, community structure and activity tracking with a cyber-neon identity: deep black, Noctigarde pink and electric cyan.\n\nOfficial website: ${LINKS.website}\nTop.gg page: ${LINKS.topgg}\n\nPerformance. Security. Reliability.`, COLORS.pink)]
        },
        changelogEn: {
            embeds: [embed('Noctigarde Dev Log', 'This channel follows continuous Noctigarde work.\n\nRecent work lines:\n- full community server with roles, dossiers and bilingual channels\n- FR/EN language button flow\n- reference server without premium restrictions\n- Noctigarde website published on top.gg\n- internal Discord publishing tool from the reference chat\n\nEntries here track work before official release notes.', COLORS.violet)]
        },
        resourcesEn: {
            embeds: [embed('Noctigarde Resources', `All useful Noctigarde links are gathered here.\n\n**Official links**\nWebsite: ${LINKS.website}\nTop.gg: ${LINKS.topgg}\nBot invite: ${LINKS.invite}\nGitHub: ${LINKS.github}\nTerms: ${LINKS.terms}\nPrivacy: ${LINKS.privacy}\n\n**Where to look**\n- announcements: important information\n- dev log: continuous technical tracking\n- release notes: finalized public changes\n- FAQ: setup, permissions, language and support\n- dossiers: private help or bug reports`, COLORS.cyan)]
        },
        faqEn: {
            embeds: [embed('Noctigarde FAQ', '**How do I invite Noctigarde?**\nUse the official invite link shared by the staff. The bot needs the `bot` and `applications.commands` scopes.\n\n**Which permissions matter?**\nNoctigarde needs to manage roles, read useful channels, send messages, create dossiers and read message history.\n\n**Where do I ask for help?**\nUse support channels or open a dossier for personal, sensitive or technical requests.\n\n**Where do I follow updates?**\nAnnouncements carry important information. The dev log tracks ongoing work. Release notes summarize official releases.', COLORS.cyan)]
        },
        statusEn: {
            embeds: [embed('Noctigarde Status', `**Current status:** operational\n\nNoctigarde is published and available through its official points:\nWebsite: ${LINKS.website}\nTop.gg: ${LINKS.topgg}\nGitHub: ${LINKS.github}\n\nThis panel is then automatically updated by the bot with latency, SQLite status and the latest known sync.\n\nMaintenance, incidents, slowdowns and important restarts will be announced here.`, COLORS.cyan)]
        },
        priorityVotesEn: {
            embeds: [embed('Noctigarde Priority Votes', 'Choose what Noctigarde should prioritize next.\n\nEach button records your intent in staff logs. Votes help read the community direction; they do not freeze the roadmap.', COLORS.violet)],
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
            embeds: [embed('Noctigarde Suggestions', 'Ideas to improve Noctigarde go here.\n\nYou can suggest a command, option, integration, visual improvement or behavior change. The best ideas make the bot more useful for the whole community.', COLORS.violet)]
        },
        supportEn: {
            embeds: [embed('Setup Help', `Need help inviting Noctigarde, setting permissions, configuring a channel or understanding a command?\n\n**Before asking**\n1. Make sure Noctigarde is installed as a bot, not only as a command integration.\n2. Place the Noctigarde role above the roles it has to manage.\n3. Make sure the \`bot\` and \`applications.commands\` scopes are present.\n4. Use the official invite link: ${LINKS.invite}\n\n**For faster help**\nExplain what you wanted to do, the command or button involved, what is blocking you and the error message if you have one.`, COLORS.dark)]
        },
        bugsEn: {
            embeds: [embed('Bug Reports', 'If Noctigarde does not behave as expected, report it here or open a report dossier.\n\n**Suggested format**\nCommand or feature:\nWhat you did:\nActual result:\nExpected result:\nScreenshot or error message:\n\nButton, permission, dossier, language, log and command bugs are prioritized on the reference server.', COLORS.dark)]
        },
        commandsEn: {
            embeds: [embed('Noctigarde Commands', 'Noctigarde main commands are available with `/` and several text aliases.\n\n**Members**\n`/help`, `/my-hours`, `/history`, `/on-duty`, `/top-service`\n\n**Reference server**\n`/hours`, `/top-week`, `/summary`, `/diagnostic`, `/sync-service`, `/sync-noctigarde`, `/reset-hours`, `/reset-hours-all`\n\n**Moderation**\n`/warn`, `/timeout`, `/untimeout`, `/kick`, `/ban`, `/clear`, `/mod-cases`\n\n**Configuration**\n`/config-role`, `/config-channel`, `/config-permissions`, `/config-view`, `/language`', COLORS.cyan)]
        },
        supportRequestsEn: {
            embeds: [embed('Support Requests', 'Requests that need Noctigarde support follow-up can be posted here.\n\nUse this channel for simple questions. For private, sensitive, long or bug-related requests, open a dossier in the dedicated channel.\n\nSupport can help with setup, permissions, roles, logs, commands, the reference server, top.gg, the official website and Discord publishing.', COLORS.dark)]
        },
        roadmapEn: {
            embeds: [embed('Noctigarde Roadmap', 'Current priorities:\n\n**Short term**\n- stabilize buttons and dossiers\n- enrich resources and status panels\n- publish announcements from the reference chat\n- improve public documentation\n\n**Mid term**\n- deeper duty statistics\n- better moderation reports\n- cleaner release note workflow\n- continuous permission checks\n\n**Long term**\n- useful external integrations\n- web dashboard\n- server template automation\n- sharper staff tools', COLORS.violet)]
        },
        betaEn: {
            embeds: [embed('Beta Tests', 'Advanced Noctigarde tests happen here.\n\nPriority checks:\n- language buttons and roles\n- support, report, recruitment, partnership and other dossier open/close flow\n- priority votes\n- reference server advanced commands\n- announcement/changelog/release publishing from the reference chat\n- status and resources panels\n\nPrecise feedback is best: action, actual result, expected result, screenshot if possible.', COLORS.cyan)]
        },
        futureIdeasEn: {
            embeds: [embed('Future Ideas', 'This space is for imagining Noctigarde future.\n\nOpen directions: web dashboard, stronger top.gg page, server template system, duty analytics, setup assistants, maintenance notifications, publishing workflows and deeper staff tools.\n\nA strong idea explains the problem, the affected user and what Noctigarde should simplify.', COLORS.violet)]
        },
        patchNotesEn: {
            embeds: [embed('Release Notes', 'Current reference server version:\n\n- official website published\n- top.gg page published\n- bilingual FR/EN community server\n- working language buttons\n- support, report, recruitment, partnership and other dossiers\n- priority votes\n- staff bot test channel\n- all commands active on the reference server\n- Discord publishing tool from the reference chat\n\nFuture release notes will only list finalized changes.', COLORS.pink)]
        },
        staff: {
            embeds: [embed('Staff Noctigarde', 'Coordination interne du staff Noctigarde : modération, support, annonces, priorités et suivi communautaire.', COLORS.dark)]
        },
        botTests: {
            embeds: [embed('Tests bot Noctigarde', 'Salon interne réservé aux essais staff.\n\nTu peux tester ici les commandes, boutons, réponses, permissions, dossiers et comportements expérimentaux sans polluer les salons publics.', COLORS.violet)]
        },
        todo: {
            embeds: [embed('Todo staff', '- Bugs à vérifier\n- Suggestions à trier\n- Annonces à préparer\n- Dossiers sensibles à suivre\n- Roadmap à mettre à jour', COLORS.dark)]
        },
        logs: {
            embeds: [embed('Logs staff', 'Les traces importantes du serveur et du bot se retrouvent ici pour aider le staff à suivre ce qui se passe.', COLORS.dark)]
        },
        reports: {
            embeds: [embed('Signalements staff', 'Les signalements importants sont centralisés ici avec leur contexte, les preuves disponibles et le suivi effectué.', COLORS.dark)]
        },
        roles: {
            embeds: [embed('Rôles Noctigarde', 'Choisis les notifications et statuts que tu veux recevoir.\n\nAnnonces, maintenance, journal dev, accès anticipé ou partenaire : les boutons te permettent d’ajuster ton profil Noctigarde en un clic.', COLORS.violet)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_selfrole:announcements').setLabel('Annonces').setStyle(ButtonStyle.Secondary).setEmoji('📡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:maintenance').setLabel('Maintenance').setStyle(ButtonStyle.Secondary).setEmoji('🛠'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:changelog').setLabel('Journal dev').setStyle(ButtonStyle.Secondary).setEmoji('🧬'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:beta').setLabel('Accès anticipé').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('sentinel_selfrole:partner').setLabel('Partenaire').setStyle(ButtonStyle.Secondary).setEmoji('💎')
                )
            ]
        },
        rolesEn: {
            embeds: [embed('Noctigarde Roles', 'Choose the notifications and status roles you want.\n\nAnnouncements, maintenance, changelog, early access or partner: the buttons let you adjust your Noctigarde profile in one click.', COLORS.violet)],
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
            embeds: [embed('Bureau d’accueil Noctigarde', 'Dans Noctigarde, un dossier est un ticket privé : chaque demande ouvre un salon dédié avec le membre et l’équipe autorisée.\n\nChoisis le type de dossier à ouvrir. Noctigarde te demandera ensuite le sujet et la description avant de créer le salon.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_dossier:support').setLabel('Support').setStyle(ButtonStyle.Primary).setEmoji('📁'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:report').setLabel('Signalement').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:recruitment').setLabel('Recrutement').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:partnership').setLabel('Partenariat').setStyle(ButtonStyle.Secondary).setEmoji('🤝'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:other').setLabel('Autre').setStyle(ButtonStyle.Secondary).setEmoji('💬')
                )
            ]
        }
        ,
        ticketsEn: {
            embeds: [embed('Noctigarde Reception Desk', 'In Noctigarde, a dossier is a private ticket: each request opens a dedicated channel with the member and the authorized team.\n\nChoose the dossier type to open. Noctigarde will then ask for the subject and description before creating the channel.', COLORS.pink)],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('sentinel_dossier:support').setLabel('Support').setStyle(ButtonStyle.Primary).setEmoji('📁'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:report').setLabel('Report').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:recruitment').setLabel('Recruitment').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:partnership').setLabel('Partnership').setStyle(ButtonStyle.Secondary).setEmoji('🤝'),
                    new ButtonBuilder().setCustomId('sentinel_dossier:other').setLabel('Other').setStyle(ButtonStyle.Secondary).setEmoji('💬')
                )
            ]
        }
    };

    return panels[panel] || null;
}

const PANEL_TITLE_ALIASES = {
    rules: ['Reglement Noctigarde'],
    priorityVotes: ['Votes priorites Noctigarde'],
    roles: ['Roles Noctigarde'],
    tickets: ['Bureau d accueil Noctigarde'],
    futureIdeas: ['Idees futures'],
    botTests: ['Tests bot Noctigarde'],
    reports: ['Signalements staff']
};

async function ensurePanel(channel, panel, clientUserId, result) {
    const payload = panelPayload(panel);

    if (!payload) {
        return;
    }

    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    const expectedTitles = new Set(
        [
            ...(payload.embeds || [])
            .map(panelEmbed => panelEmbed?.data?.title || panelEmbed?.title)
            .filter(Boolean),
            ...(PANEL_TITLE_ALIASES[panel] || [])
        ]
    );
    const botMessages = messages
        ? messages.filter(message =>
            message.author.id === clientUserId
            && message.embeds.some(messageEmbed => expectedTitles.has(messageEmbed.title))
        )
        : null;

    if (botMessages?.size) {
        const first = botMessages.first();
        await first.edit(payload).catch(async () => {
            await channel.send(payload);
            result.created += 1;
        });

        result.updated += 1;
        return;
    }

    await channel.send(payload);
    result.created += 1;
}

async function syncNoctigardeServer(client, options = {}) {
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
    syncNoctigardeServer
};
