require('dotenv').config();

const {
    ChannelType,
    SlashCommandBuilder,
    PermissionFlagsBits,
    REST,
    Routes
} = require('discord.js');

function en(value) {
    return {
        'en-US': value,
        'en-GB': value
    };
}

function command(name, englishName, description, englishDescription) {
    return new SlashCommandBuilder()
        .setName(name)
        .setNameLocalizations(en(englishName))
        .setDescription(description)
        .setDescriptionLocalizations(en(englishDescription));
}

function getAdvancedGuildId() {
    const guildId = String(process.env.GUILD_ID || '').trim();

    return /^\d{17,20}$/.test(guildId) ? guildId : null;
}

const publicCommands = [
    command('aide', 'help', 'Affiche le guide de demarrage de Sentinel.', 'Shows the Sentinel getting started guide.'),

    command('config-langue', 'language', 'Configure la langue de ce serveur.', 'Sets this server language.')
        .addStringOption(option =>
            option
                .setName('langue')
                .setNameLocalizations(en('language'))
                .setDescription('Langue du serveur')
                .setDescriptionLocalizations(en('Server language'))
                .setRequired(true)
                .addChoices(
                    { name: 'Francais', value: 'fr' },
                    { name: 'English', value: 'en' }
                )
        ),

    command('mes-heures', 'my-hours', 'Affiche tes heures de service.', 'Shows your service hours.'),

    command('top-service', 'top-service', 'Affiche le classement des heures de service.', 'Shows the service leaderboard.'),

    command('en-service', 'on-duty', 'Affiche les agents actuellement en service.', 'Shows agents currently on duty.'),

    command('historique-service', 'history', 'Affiche tes 5 dernières sessions de service.', 'Shows your last 5 service sessions.')
        .addIntegerOption(option =>
            option
                .setName('limite')
                .setNameLocalizations(en('limit'))
                .setDescription('Nombre de sessions à afficher')
                .setDescriptionLocalizations(en('Number of sessions to show'))
                .setMinValue(1)
                .setMaxValue(5)
                .setRequired(false)
        ),

    command('config-role', 'config-role', 'Definit le role utilise pour la prise de service.', 'Sets the role used while on duty.')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Le role a donner quand un membre prend son service')
                .setDescriptionLocalizations(en('Role to give when a member starts duty'))
                .setRequired(true)
        ),

    command('config-logs', 'config-channel', 'Definit le salon ou envoyer les logs de service.', 'Sets the channel used for service logs.')
        .addStringOption(option =>
            option
                .setName('salon_id')
                .setNameLocalizations(en('channel_id'))
                .setDescription('ID du salon de logs')
                .setDescriptionLocalizations(en('Log channel ID'))
                .setRequired(true)
        ),

    command('config-permissions', 'config-permissions', 'Configure les roles autorises a gerer le bot.', 'Configures roles allowed to manage the bot.')
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Action a effectuer')
                .setDescriptionLocalizations(en('Action to perform'))
                .setRequired(true)
                .addChoices(
                    { name: 'Ajouter un role', name_localizations: en('Add a role'), value: 'ajouter' },
                    { name: 'Retirer un role', name_localizations: en('Remove a role'), value: 'retirer' },
                    { name: 'Voir les roles', name_localizations: en('View roles'), value: 'voir' }
                )
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Role a ajouter ou retirer')
                .setDescriptionLocalizations(en('Role to add or remove'))
                .setRequired(false)
        ),

    command('config-voir', 'config-view', 'Affiche la configuration de service du serveur.', 'Shows this server service configuration.'),

    command('avertir', 'warn', 'Ajoute un avertissement a un membre.', 'Adds a warning to a member.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a avertir')
                .setDescriptionLocalizations(en('Member to warn'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison de l avertissement')
                .setDescriptionLocalizations(en('Warning reason'))
                .setRequired(false)
        ),

    command('timeout', 'timeout', 'Timeout temporairement un membre.', 'Temporarily times out a member.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a timeout')
                .setDescriptionLocalizations(en('Member to time out'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duree')
                .setNameLocalizations(en('duration'))
                .setDescription('Duree du timeout, exemple 10m, 2h ou 7d')
                .setDescriptionLocalizations(en('Timeout duration, for example 10m, 2h, or 7d'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du timeout')
                .setDescriptionLocalizations(en('Timeout reason'))
                .setRequired(false)
        ),

    command('fin-timeout', 'untimeout', 'Retire le timeout d un membre.', 'Removes a member timeout.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a liberer')
                .setDescriptionLocalizations(en('Member to release'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du retrait')
                .setDescriptionLocalizations(en('Removal reason'))
                .setRequired(false)
        ),

    command('expulser', 'kick', 'Expulse un membre du serveur.', 'Kicks a member from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a expulser')
                .setDescriptionLocalizations(en('Member to kick'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison de l expulsion')
                .setDescriptionLocalizations(en('Kick reason'))
                .setRequired(false)
        ),

    command('bannir', 'ban', 'Bannit un utilisateur du serveur.', 'Bans a user from the server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(option =>
            option
                .setName('utilisateur')
                .setNameLocalizations(en('user'))
                .setDescription('Utilisateur a bannir')
                .setDescriptionLocalizations(en('User to ban'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord si l utilisateur n est plus sur le serveur')
                .setDescriptionLocalizations(en('Discord ID if the user is no longer on the server'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du bannissement')
                .setDescriptionLocalizations(en('Ban reason'))
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('jours_messages')
                .setNameLocalizations(en('delete_days'))
                .setDescription('Jours de messages a supprimer, de 0 a 7')
                .setDescriptionLocalizations(en('Message history days to delete, from 0 to 7'))
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        ),

    command('purge', 'clear', 'Supprime des messages recents.', 'Deletes recent messages.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(option =>
            option
                .setName('nombre')
                .setNameLocalizations(en('count'))
                .setDescription('Nombre de messages a supprimer')
                .setDescriptionLocalizations(en('Number of messages to delete'))
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),

    command('sanctions', 'mod-cases', 'Affiche les sanctions d un membre.', 'Shows a member moderation cases.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a consulter')
                .setDescriptionLocalizations(en('Member to check'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord si la personne a quitte le serveur')
                .setDescriptionLocalizations(en('Discord ID if the user left the server'))
                .setRequired(false)
        ),

    command('embed', 'embed', 'Cree ou modifie une annonce embed Sentinel.', 'Creates or edits a Sentinel announcement embed.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('creer')
                .setNameLocalizations(en('create'))
                .setDescription('Cree une annonce embed sous l identite de Sentinel')
                .setDescriptionLocalizations(en('Creates an announcement embed under Sentinel identity'))
                .addChannelOption(option =>
                    option
                        .setName('salon')
                        .setNameLocalizations(en('channel'))
                        .setDescription('Salon ou envoyer l embed')
                        .setDescriptionLocalizations(en('Channel where the embed will be sent'))
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('titre')
                        .setNameLocalizations(en('title'))
                        .setDescription('Titre de l embed')
                        .setDescriptionLocalizations(en('Embed title'))
                        .setMaxLength(256)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Texte principal de l embed')
                        .setDescriptionLocalizations(en('Main embed text'))
                        .setMaxLength(4000)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('couleur')
                        .setNameLocalizations(en('color'))
                        .setDescription('Couleur : rose, cyan, vert, rouge, violet ou #ff2d9a')
                        .setDescriptionLocalizations(en('Color: pink, cyan, green, red, purple, or #ff2d9a'))
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName('role_a_ping')
                        .setNameLocalizations(en('role_to_ping'))
                        .setDescription('Role a mentionner avec l annonce')
                        .setDescriptionLocalizations(en('Role to mention with the announcement'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('image_url')
                        .setDescription('URL d image principale')
                        .setDescriptionLocalizations(en('Main image URL'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('thumbnail_url')
                        .setDescription('URL de miniature')
                        .setDescriptionLocalizations(en('Thumbnail URL'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('footer')
                        .setDescription('Texte de pied de page')
                        .setDescriptionLocalizations(en('Footer text'))
                        .setMaxLength(1800)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('modifier')
                .setNameLocalizations(en('edit'))
                .setDescription('Modifie un embed Sentinel existant sans consommer de quota')
                .setDescriptionLocalizations(en('Edits an existing Sentinel embed without using quota'))
                .addChannelOption(option =>
                    option
                        .setName('salon')
                        .setNameLocalizations(en('channel'))
                        .setDescription('Salon ou se trouve l embed')
                        .setDescriptionLocalizations(en('Channel where the embed is located'))
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('ID du message embed Sentinel')
                        .setDescriptionLocalizations(en('Sentinel embed message ID'))
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('titre')
                        .setNameLocalizations(en('title'))
                        .setDescription('Nouveau titre')
                        .setDescriptionLocalizations(en('New title'))
                        .setMaxLength(256)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Nouveau texte principal')
                        .setDescriptionLocalizations(en('New main text'))
                        .setMaxLength(4000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('couleur')
                        .setNameLocalizations(en('color'))
                        .setDescription('Nouvelle couleur ou defaut')
                        .setDescriptionLocalizations(en('New color or default'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('image_url')
                        .setDescription('Nouvelle image, ou retirer')
                        .setDescriptionLocalizations(en('New image, or remove'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('thumbnail_url')
                        .setDescription('Nouvelle miniature, ou retirer')
                        .setDescriptionLocalizations(en('New thumbnail, or remove'))
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('footer')
                        .setDescription('Nouveau pied de page, ou retirer')
                        .setDescriptionLocalizations(en('New footer, or remove'))
                        .setMaxLength(1800)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('supprimer')
                .setNameLocalizations(en('delete'))
                .setDescription('Supprime un embed Sentinel et libere son emplacement gratuit')
                .setDescriptionLocalizations(en('Deletes a Sentinel embed and frees its free slot'))
                .addChannelOption(option =>
                    option
                        .setName('salon')
                        .setNameLocalizations(en('channel'))
                        .setDescription('Salon ou se trouve l embed')
                        .setDescriptionLocalizations(en('Channel where the embed is located'))
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message_id')
                        .setDescription('ID du message embed Sentinel')
                        .setDescriptionLocalizations(en('Sentinel embed message ID'))
                        .setRequired(true)
                )
        ),

    command('reset-heures', 'reset-hours', 'Reinitialise les heures de service d un membre.', 'Resets a member service hours.')
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre present a reinitialiser')
                .setDescriptionLocalizations(en('Current member to reset'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord si la personne a quitte le serveur')
                .setDescriptionLocalizations(en('Discord ID if the user left the server'))
                .setRequired(false)
        )
];

const advancedCommands = [
    command('heures', 'hours', 'Affiche les heures de service d’un membre.', 'Shows a member service hours.')
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Le membre a consulter')
                .setDescriptionLocalizations(en('Member to check'))
                .setRequired(true)
        ),

    command('top-semaine', 'top-week', 'Affiche le classement des heures de service des 7 derniers jours.', 'Shows the last 7 days service leaderboard.'),

    command('ping', 'ping', 'Verifie que le bot repond.', 'Checks that the bot is responding.'),

    command('diagnostic', 'diagnostic', 'Verifie la configuration et les permissions du bot.', 'Checks bot configuration and permissions.'),

    command('sync-service', 'sync-service', 'Repare les incoherences entre la base et le role de service.', 'Repairs inconsistencies between the database and service role.'),

    command('sync-sentinel', 'sync-sentinel', 'Synchronise les salons, roles et panneaux Sentinel.', 'Synchronizes Sentinel channels, roles and panels.'),

    command('reset-heures-all', 'reset-hours-all', 'Reinitialise toutes les heures de service.', 'Resets all service hours.'),

    command('resume-service', 'summary', 'Affiche un resume du service sur ce serveur.', 'Shows a service summary for this server.'),

    command('historique-service', 'history', 'Affiche les dernieres sessions de service.', 'Shows latest service sessions.')
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Le membre a consulter')
                .setDescriptionLocalizations(en('Member to check'))
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('limite')
                .setNameLocalizations(en('limit'))
                .setDescription('Nombre de sessions a afficher')
                .setDescriptionLocalizations(en('Number of sessions to show'))
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        ),

    command('cas', 'case', 'Affiche le detail d un cas de moderation.', 'Shows a moderation case details.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID du cas')
                .setDescriptionLocalizations(en('Case ID'))
                .setMinValue(1)
                .setRequired(true)
        ),

    command('modifier-cas', 'edit-case', 'Modifie la raison d un cas de moderation.', 'Edits a moderation case reason.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID du cas')
                .setDescriptionLocalizations(en('Case ID'))
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Nouvelle raison')
                .setDescriptionLocalizations(en('New reason'))
                .setRequired(true)
        ),

    command('supprimer-cas', 'delete-case', 'Supprime un cas de moderation.', 'Deletes a moderation case.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID du cas')
                .setDescriptionLocalizations(en('Case ID'))
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison de la suppression')
                .setDescriptionLocalizations(en('Deletion reason'))
                .setRequired(false)
        ),

    command('unwarn', 'unwarn', 'Retire un avertissement par ID de cas.', 'Removes a warning by case ID.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(option =>
            option
                .setName('id')
                .setDescription('ID du cas avertissement')
                .setDescriptionLocalizations(en('Warning case ID'))
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du retrait')
                .setDescriptionLocalizations(en('Removal reason'))
                .setRequired(false)
        ),

    command('profil-mod', 'mod-profile', 'Affiche le profil moderation complet d un membre.', 'Shows a member full moderation profile.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Membre a consulter')
                .setDescriptionLocalizations(en('Member to check'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord si la personne a quitte le serveur')
                .setDescriptionLocalizations(en('Discord ID if the user left the server'))
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('limite')
                .setNameLocalizations(en('limit'))
                .setDescription('Nombre de cas a afficher')
                .setDescriptionLocalizations(en('Number of cases to show'))
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        ),

    command('tempban', 'tempban', 'Bannit temporairement un utilisateur.', 'Temporarily bans a user.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(option =>
            option
                .setName('duree')
                .setNameLocalizations(en('duration'))
                .setDescription('Duree du ban, exemple 1h, 7d ou 30d')
                .setDescriptionLocalizations(en('Ban duration, for example 1h, 7d, or 30d'))
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('utilisateur')
                .setNameLocalizations(en('user'))
                .setDescription('Utilisateur a bannir temporairement')
                .setDescriptionLocalizations(en('User to temporarily ban'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord si l utilisateur n est plus sur le serveur')
                .setDescriptionLocalizations(en('Discord ID if the user is no longer on the server'))
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du ban temporaire')
                .setDescriptionLocalizations(en('Temporary ban reason'))
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('jours_messages')
                .setNameLocalizations(en('delete_days'))
                .setDescription('Jours de messages a supprimer, de 0 a 7')
                .setDescriptionLocalizations(en('Message history days to delete, from 0 to 7'))
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        ),

    command('unban', 'unban', 'Debannit un utilisateur avec son ID Discord.', 'Unbans a user by Discord ID.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(option =>
            option
                .setName('utilisateur_id')
                .setNameLocalizations(en('user_id'))
                .setDescription('ID Discord de l utilisateur a debannir')
                .setDescriptionLocalizations(en('Discord ID of the user to unban'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du debannissement')
                .setDescriptionLocalizations(en('Unban reason'))
                .setRequired(false)
        ),

    command('lock', 'lock', 'Verrouille le salon actuel.', 'Locks the current channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du verrouillage')
                .setDescriptionLocalizations(en('Lock reason'))
                .setRequired(false)
        ),

    command('unlock', 'unlock', 'Deverrouille le salon actuel.', 'Unlocks the current channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du deverrouillage')
                .setDescriptionLocalizations(en('Unlock reason'))
                .setRequired(false)
        ),

    command('slowmode', 'slowmode', 'Configure le mode lent du salon actuel.', 'Configures the current channel slowmode.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(option =>
            option
                .setName('duree')
                .setNameLocalizations(en('duration'))
                .setDescription('Duree, exemple 10s, 5m, 1h ou 0 pour desactiver')
                .setDescriptionLocalizations(en('Duration, for example 10s, 5m, 1h, or 0 to disable'))
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('raison')
                .setNameLocalizations(en('reason'))
                .setDescription('Raison du changement')
                .setDescriptionLocalizations(en('Change reason'))
                .setRequired(false)
        )
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        const advancedGuildId = getAdvancedGuildId();

        console.log('Enregistrement global des commandes publiques localisees...');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: publicCommands.map(item => item.toJSON()) }
        );

        console.log('Commandes publiques localisees enregistrees avec succes.');

        if (advancedGuildId) {
            console.log('Enregistrement des commandes avancees localisees sur le serveur configure...');

            try {
                await rest.put(
                    Routes.applicationGuildCommands(
                        process.env.CLIENT_ID,
                        advancedGuildId
                    ),
                    { body: advancedCommands.map(item => item.toJSON()) }
                );

                console.log('Commandes avancees localisees enregistrees sur le serveur configure.');
            } catch (error) {
                if (error.code === 50001) {
                    console.warn('Impossible de deployer les commandes avancees : Sentinel n a pas acces au serveur GUILD_ID configure.');
                    console.warn('Invite Sentinel comme bot sur ce serveur, puis relance npm run deploy:commands.');
                } else {
                    throw error;
                }
            }
        } else {
            console.log('Aucun GUILD_ID configure. Les commandes avancees ne sont pas deployees.');
        }
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
