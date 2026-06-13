require('dotenv').config();

const {
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
                .setRequired(true)
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
                .setRequired(true)
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

    command('reset-heures', 'reset-hours', 'Reinitialise les heures de service d’un membre.', 'Resets a member service hours.')
        .addUserOption(option =>
            option
                .setName('membre')
                .setNameLocalizations(en('member'))
                .setDescription('Le membre a reinitialiser')
                .setDescriptionLocalizations(en('Member to reset'))
                .setRequired(true)
        ),

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
                .setMaxValue(25)
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
