(() => {
  const STORAGE_KEY = 'sentinel-site-language';
  const textOriginals = new WeakMap();
  const titleOriginal = document.title;
  let isTranslating = false;

  const en = {
    'Sentinel | Bot Discord de service et de moderation': 'Sentinel | Discord duty and moderation bot',
    'Fonctionnalites | Sentinel': 'Features | Sentinel',
    'Commandes | Sentinel': 'Commands | Sentinel',
    'Premium | Sentinel': 'Premium | Sentinel',
    'Securite | Sentinel': 'Security | Sentinel',
    'Installation | Sentinel': 'Setup | Sentinel',
    'Sentinel | Dashboard': 'Sentinel | Dashboard',
    'Sentinel | Page introuvable': 'Sentinel | Page not found',
    'Sentinel centralise les prises de service, les heures, les classements, les logs et la moderation Discord.': 'Sentinel centralizes duty tracking, hours, leaderboards, logs, and Discord moderation.',
    'Sentinel centralise la moderation Discord et les prises de service realistes pour RP, staff, communautes ou toute autre organisation.': 'Sentinel centralizes Discord moderation and realistic duty tracking for RP, staff teams, communities, or any other organization.',
    'Service, statistiques, logs, moderation et dashboard web pour communautes Discord.': 'Duty tracking, statistics, logs, moderation, and web dashboard for Discord communities.',
    'Moderation, prises de service realistes, statistiques, logs et dashboard web pour RP, staff, communautes ou toute autre utilisation.': 'Moderation, realistic duty tracking, statistics, logs, and a web dashboard for RP, staff teams, communities, or any other use.',
    'Fonctionnalites de Sentinel pour le service, les statistiques, les logs et la moderation Discord.': 'Sentinel features for duty tracking, statistics, logs, and Discord moderation.',
    'Commandes gratuites et premium de Sentinel pour Discord.': 'Free and premium Sentinel commands for Discord.',
    'Fonctionnalites premium preparees pour Sentinel.': 'Prepared premium features for Sentinel.',
    'Securite, permissions et confidentialite de Sentinel.': 'Security, permissions, and privacy for Sentinel.',
    'Installer et configurer Sentinel sur un serveur Discord.': 'Install and configure Sentinel on a Discord server.',

    'Navigation principale': 'Main navigation',
    'Navigation dashboard': 'Dashboard navigation',
    'Site public': 'Public site',
    'Fonctionnalites': 'Features',
    'Commandes': 'Commands',
    'Securite': 'Security',
    'Installation': 'Setup',
    'Inviter': 'Invite',
    'Inviter Sentinel': 'Invite Sentinel',
    'Menu': 'Menu',
    'Fermer': 'Close',
    'Dashboard': 'Dashboard',
    'Conditions': 'Terms',
    'Confidentialite': 'Privacy',
    'Serveur support': 'Support server',
    'Retour au site': 'Back to site',
    'Cette page n\'existe pas ou a ete deplacee.': 'This page does not exist or has been moved.',

    'Performance - Securite - Fiabilite': 'Performance - Security - Reliability',
    'Un bot Discord bilingue pour suivre les services, controler les heures, garder des logs propres et moderer un serveur sans perdre de temps.': 'A bilingual Discord bot for duty tracking, hour control, clean logs, and moderation without wasting time.',
    'Un bot Discord bilingue aussi utile pour moderer un serveur que pour organiser des prises de service realistes, adaptees au RP, aux equipes staff, aux communautes et a tout autre usage.': 'A bilingual Discord bot built both for server moderation and realistic duty tracking, suited for RP, staff teams, communities, and any other use.',
    'Demarrer Sentinel': 'Start Sentinel',
    'Ouvrir le dashboard': 'Open dashboard',
    'Langues': 'Languages',
    'Base': 'Database',
    'Acces': 'Access',
    'Par roles': 'By roles',
    'Sanctions': 'Cases',
    'Service RP': 'RP duty',
    'Heures': 'Hours',
    'Pilotage': 'Control',
    'Web': 'Web',
    'Identite visuelle Sentinel': 'Sentinel visual identity',
    'Vue d\'ensemble': 'Overview',
    'Un vrai centre de controle pour ton Discord.': 'A real control center for your Discord.',
    'Sentinel garde la partie gratuite utile pour les petites communautes, et reserve les outils avances aux serveurs qui ont besoin de plus de controle.': 'Sentinel keeps the free tier useful for smaller communities and reserves advanced tools for servers that need deeper control.',
    'Sentinel reunit deux besoins importants : moderer proprement un Discord et gerer des prises de service credibles pour du RP, une equipe staff, une communaute ou toute autre organisation.': 'Sentinel brings together two important needs: clean Discord moderation and credible duty tracking for RP, a staff team, a community, or any other organization.',
    'Service': 'Duty',
    'Prise de service, fin de service, role automatique, historique et temps total.': 'Clock in, clock out, automatic role, history, and total time.',
    'Prise de service, fin de service, role automatique, historique et temps total pour des suivis realistes.': 'Clock in, clock out, automatic role, history, and total time for realistic tracking.',
    'Statistiques': 'Statistics',
    'Heures personnelles, agents actifs, classement top service et vues avancees premium.': 'Personal hours, active members, service leaderboard, and premium advanced views.',
    'Moderation': 'Moderation',
    'Avertissements, timeout, ban par ID, sanctions, logs et cas premium.': 'Warnings, timeout, ID bans, cases, logs, and premium case tools.',
    'Guide web clair aujourd\'hui, puis actions directes quand le dashboard connecte sera actif.': 'A clear web guide today, then direct actions when the connected dashboard is active.',
    'Structure': 'Structure',
    'Un site clair, pas une page fourre-tout.': 'A clear site, not one overloaded page.',
    'Chaque partie de Sentinel a maintenant sa page dediee : presentation, commandes, premium, securite et installation.': 'Each Sentinel area now has its own page: overview, commands, premium, security, and setup.',
    'Comprendre ce que Sentinel fait au quotidien.': 'Understand what Sentinel does day to day.',
    'Voir le detail gratuit, premium et les commandes texte.': 'See free, premium, and text commands in detail.',
    'Voir ce qui sera reserve aux grandes communautes.': 'See what will be reserved for larger communities.',
    'Permissions, roles, logs, hierarchie Discord.': 'Permissions, roles, logs, Discord hierarchy.',
    'Installe Sentinel sur ton serveur.': 'Install Sentinel on your server.',
    'Invite le bot, choisis la langue, configure les roles, puis gere le reste depuis Discord ou depuis le dashboard.': 'Invite the bot, choose the language, configure roles, then manage the rest from Discord or the dashboard.',
    'Voir l\'installation': 'View setup',

    'Tout ce qu\'il faut pour encadrer un serveur actif.': 'Everything needed to manage an active server.',
    'Sentinel combine suivi de service, statistiques, logs et moderation dans une experience claire pour les membres comme pour le staff.': 'Sentinel combines duty tracking, statistics, logs, and moderation in a clear experience for members and staff.',
    'Prise et fin de service sans friction.': 'Clock in and out without friction.',
    'Les membres pointent avec un bouton. Sentinel ajoute ou retire le role de service, calcule la session, conserve le total et envoie les logs.': 'Members clock in with a button. Sentinel adds or removes the duty role, calculates the session, stores the total, and sends logs.',
    'Bouton de service': 'Duty button',
    'Role automatique': 'Automatic role',
    'Total personnel': 'Personal total',
    'Historique de sessions': 'Session history',
    'Des donnees utiles, sans noyer les utilisateurs.': 'Useful data without overwhelming users.',
    'La version gratuite garde l\'essentiel : heures personnelles, agents actifs, top 10 et historique personnel limite.': 'The free version keeps the essentials: personal hours, active members, top 10, and limited personal history.',
    'Des actions rapides avec garde-fous.': 'Fast actions with guardrails.',
    'Sentinel verifie les permissions Discord, la hierarchie des roles et journalise les sanctions. Les bans et sanctions peuvent utiliser un ID Discord, et les staffs peuvent publier des annonces embed sous l\'identite Sentinel.': 'Sentinel checks Discord permissions, role hierarchy, and logs moderation actions. Bans and cases can use a Discord ID, and staff can publish announcement embeds under Sentinel identity.',
    'Avertir': 'Warn',
    'Ban par ID': 'Ban by ID',
    'Historique des sanctions': 'Case history',
    'Embeds d\'annonce modifiables': 'Editable announcement embeds',
    'Le web pour piloter le bot.': 'The web dashboard for controlling the bot.',
    'Le dashboard permet de configurer Sentinel, agir sur les services, moderer et gerer les embeds d\'annonce sans taper de slash command.': 'The dashboard lets you configure Sentinel, manage duty tracking, moderate, and handle announcement embeds without typing slash commands.',
    'Guide sans jargon': 'Plain-language guide',
    'Commandes a copier': 'Copy-ready commands',
    'Connexion Discord preparee': 'Discord login ready',
    'Actions web immediates': 'Immediate web actions',

    'Les commandes Sentinel, classees par usage.': 'Sentinel commands, sorted by use.',
    'Le gratuit reste volontairement lisible. Le premium ajoute les controles avances utiles aux grandes communautes.': 'The free tier stays intentionally readable. Premium adds advanced controls useful for large communities.',
    'Panneau d\'aide Discord': 'Discord help panel',
    'Le mode d\'emploi integre au bot.': 'The built-in bot guide.',
    'Sur Discord, la commande': 'On Discord, the command',
    'affiche le tutoriel complet de Sentinel. Depuis le site, tu peux suivre ce deroule pour installer, configurer et utiliser le bot sans connaitre Discord.': 'shows Sentinel full tutorial. From the website, you can follow this flow to install, configure, and use the bot without knowing Discord.',
    'Copier /aide': 'Copy /help',
    'Copier /config-voir': 'Copy /config-view',
    'Copie': 'Copied',
    'Installer': 'Install',
    'Invite Sentinel sur ton serveur, puis lance': 'Invite Sentinel to your server, then run',
    'pour choisir Francais ou English.': 'to choose French or English.',
    'Configurer': 'Configure',
    'Definis le role de service avec': 'Set the duty role with',
    'le salon de logs avec': 'the log channel with',
    'puis les roles autorises avec': 'then the authorized roles with',
    'Utiliser': 'Use',
    'Publie le panneau avec': 'Publish the panel with',
    'Les membres pourront prendre service, voir leurs heures et suivre les agents actifs.': 'Members will be able to clock in, view their hours, and follow active agents.',
    'Verifier': 'Check',
    'Utilise': 'Use',
    'pour relire la configuration et': 'to review the configuration and',
    'pour remettre a zero une personne, meme par ID.': 'to reset one person, including by ID.',
    'Service gratuit': 'Free duty tools',
    'Voir ses heures': 'View your hours',
    'Voir ses 5 dernieres sessions': 'View your last 5 sessions',
    'Voir les agents actifs': 'View active agents',
    'Voir le top 10': 'View the top 10',
    'Reset une personne, meme par ID': 'Reset one person, including by ID',
    'Configuration': 'Configuration',
    'Choisir FR ou EN': 'Choose FR or EN',
    'Definir le role de service': 'Set the duty role',
    'Definir le salon de logs par ID': 'Set the log channel by ID',
    'Definir les roles autorises': 'Set allowed roles',
    'Verifier la configuration': 'Check configuration',
    'Afficher le tutoriel dans Discord': 'Show the Discord tutorial',
    'Moderation gratuite': 'Free moderation',
    'Ajouter un avertissement': 'Add a warning',
    'Timeout temporaire': 'Temporary timeout',
    'Retirer un timeout': 'Remove a timeout',
    'Expulser un membre present': 'Kick a current member',
    'Bannir par membre ou ID': 'Ban by member or ID',
    'Supprimer des messages recents': 'Delete recent messages',
    'Voir les 10 derniers cas': 'View the last 10 cases',
    'Creer, modifier ou supprimer une annonce Sentinel': 'Create, edit, or delete a Sentinel announcement',
    'Premium prepare': 'Prepared premium',
    'Consulter un autre membre': 'Check another member',
    'Classement semaine': 'Weekly leaderboard',
    'Resume complet serveur': 'Full server summary',
    'Reset global': 'Global reset',
    'Detail d\'un cas': 'Case details',
    'Profil moderation complet': 'Full moderation profile',
    'Ban temporaire persistant': 'Persistent temporary ban',
    'Deban par ID': 'Unban by ID',
    'Verrouiller un salon': 'Lock a channel',
    'Mode lent': 'Slowmode',
    'Creation illimitee d\'annonces Sentinel': 'Unlimited Sentinel announcement creation',

    'Le gratuit reste utile. Le premium devient un outil de staff.': 'Free stays useful. Premium becomes a staff tool.',
    'Sentinel Premium est pense pour les serveurs qui ont beaucoup de membres, beaucoup d\'actions et besoin de garder un controle plus fin.': 'Sentinel Premium is designed for servers with many members, many actions, and a need for finer control.',
    'Gratuit': 'Free',
    'Pour demarrer': 'To get started',
    'Prise et fin de service': 'Clock in and out',
    'Historique personnel limite': 'Limited personal history',
    'Top 10 global': 'Global top 10',
    'Logs de service': 'Duty logs',
    'Moderation essentielle': 'Essential moderation',
    'Sanctions limitees aux 10 derniers cas': 'Cases limited to the last 10 visible entries',
    '2 embeds Sentinel actifs, modifiables sans limite': '2 active Sentinel embeds, editable without limit',
    'Pour grandes communautes': 'For large communities',
    'Reset global des heures': 'Global hours reset',
    'Historique avance et profils complets': 'Advanced history and full profiles',
    'Top semaine et resume serveur': 'Weekly top and server summary',
    'Gestion avancee des cas': 'Advanced case management',
    'Tempban persistant avec expiration automatique': 'Persistent tempban with automatic expiration',
    'Lock, unlock et slowmode depuis Discord ou dashboard': 'Lock, unlock, and slowmode from Discord or dashboard',
    'Creation illimitee d\'embeds d\'annonce Sentinel': 'Unlimited Sentinel announcement embed creation',
    'Vision': 'Vision',
    'Premium doit apporter du controle, pas juste retirer du gratuit.': 'Premium should add control, not just remove free features.',
    'La strategie est simple : le gratuit doit faire fonctionner un serveur. Le premium doit faire gagner du temps aux staffs exigeants.': 'The strategy is simple: free should run a server. Premium should save time for demanding staff teams.',
    'Moderation avancee': 'Advanced moderation',
    'Cas modifiables, profils complets, sanctions par ID et tempban persistant.': 'Editable cases, full profiles, ID-based sanctions, and persistent tempban.',
    'Rapports': 'Reports',
    'Base preparee pour rapports hebdomadaires, mensuels et exports.': 'Foundation prepared for weekly/monthly reports and exports.',
    'Acces web connecte pour gerer Sentinel, les services, la moderation et les embeds d\'annonce.': 'Connected web access to manage Sentinel, duty tracking, moderation, and announcement embeds.',
    'Scalabilite': 'Scalability',
    'SQLite, serveur par serveur, permissions par roles et logs centralises.': 'SQLite, server-specific settings, role-based permissions, and centralized logs.',

    'Des garde-fous avant chaque action sensible.': 'Guardrails before every sensitive action.',
    'Sentinel respecte les permissions Discord, les roles autorises et la hierarchie du serveur.': 'Sentinel respects Discord permissions, allowed roles, and server hierarchy.',
    'Acces': 'Access',
    'Gestion par roles autorises.': 'Management through allowed roles.',
    'Les commandes de gestion passent par les roles definis avec Sentinel. Le proprietaire garde un acces de secours pour eviter un blocage complet.': 'Management commands go through roles configured in Sentinel. The owner keeps fallback access to avoid a complete lockout.',
    'Roles dedies staff': 'Dedicated staff roles',
    'Amorcage securise': 'Safe bootstrap',
    'Discord garde le dernier mot.': 'Discord keeps the final say.',
    'Sentinel ne contourne pas Discord : si la permission ou la hierarchie manque, l\'action est refusee.': 'Sentinel does not bypass Discord: if a permission or hierarchy check fails, the action is refused.',
    'Permission native verifiee': 'Native permission checked',
    'Hierarchie des roles respectee': 'Role hierarchy respected',
    'Logs de moderation': 'Moderation logs',
    'Donnees': 'Data',
    'Stockage limite au fonctionnement du bot.': 'Storage limited to what the bot needs.',
    'Sentinel stocke les IDs Discord, les temps de service, les sessions et la configuration serveur necessaires a son fonctionnement.': 'Sentinel stores Discord IDs, duty time, sessions, and server configuration required for operation.',
    'SQLite serveur par serveur': 'Server-by-server SQLite',
    'Pas de vente de donnees': 'No data selling',
    'Politique de confidentialite disponible': 'Privacy policy available',

    'Installer Sentinel proprement.': 'Install Sentinel cleanly.',
    'Le bot doit etre ajoute comme bot Discord, pas seulement comme integration de commandes.': 'The bot must be added as a Discord bot, not only as a command integration.',
    'Aide installation': 'Setup help',
    'Etapes': 'Steps',
    'Demarrage recommande.': 'Recommended start.',
    'Suis ces etapes dans l\'ordre pour eviter les problemes de permissions et de roles.': 'Follow these steps in order to avoid permission and role issues.',
    'Inviter Sentinel': 'Invite Sentinel',
    'Utilise le lien officiel avec les scopes bot et applications.commands.': 'Use the official invite link with the bot and applications.commands scopes.',
    'Verifier l\'integration': 'Check the integration',
    'Dans les integrations Discord, Sentinel doit avoir le badge Bot.': 'In Discord integrations, Sentinel must have the Bot badge.',
    'Placer le role Sentinel': 'Place the Sentinel role',
    'Le role du bot doit etre au-dessus du role de service et des roles a moderer.': 'The bot role must be above the duty role and the roles it should moderate.',
    'Choisir la langue': 'Choose the language',
    'Utilise /config-langue ou le dashboard pour choisir FR ou EN.': 'Use /language or the dashboard to choose FR or EN.',
    'Configurer le service': 'Configure duty tracking',
    'Definis le role de service, le salon de logs et les roles autorises.': 'Set the duty role, log channel, and allowed roles.',
    'Publier le panneau': 'Publish the panel',
    'Envoie !service-panel ou utilise le dashboard.': 'Send !service-panel or use the dashboard.',
    'Depannage / Troubleshooting': 'Troubleshooting',
    'Si Discord bloque l\'invitation.': 'If Discord blocks the invite.',
    'Ces points reglent la plupart des soucis quand Sentinel ne rejoint pas le serveur, n\'apparait pas comme bot, ou quand le dashboard ne semble pas agir sur le bon serveur.': 'These checks solve most issues when Sentinel does not join, does not appear as a bot, or the dashboard seems to act on the wrong server.',
    'Verifier les droits Discord': 'Check Discord permissions',
    'La personne qui invite Sentinel doit avoir la permission': 'The person inviting Sentinel must have',
    'Gerer le serveur': 'Manage Server',
    'ou': 'or',
    'Administrateur': 'Administrator',
    'sur le serveur choisi.': 'on the selected server.',
    'EN: the installer needs Manage Server or Administrator permission on the selected guild.': 'EN: the installer needs Manage Server or Administrator permission on the selected guild.',
    'Choisir le bon serveur': 'Choose the right server',
    'Si Discord ouvre directement un serveur qui n\'est pas le bon, ferme la fenetre et relance le lien officiel depuis cette page sans lien personnalise.': 'If Discord opens the wrong server directly, close the window and restart from the official invite button on this page.',
    'EN: if Discord locks the wrong guild, restart from the official invite button on this page.': 'EN: if Discord locks the wrong guild, restart from the official invite button on this page.',
    'Confirmer que le bot est bien membre': 'Confirm the bot is actually a member',
    'Dans les integrations Discord, Sentinel doit apparaitre avec le badge': 'In Discord integrations, Sentinel must appear with the',
    'Bot': 'Bot',
    'Si tu vois seulement Commandes, retire l\'integration et reinvite-le.': 'If you only see Commands, remove the integration and invite it again.',
    'EN: Sentinel must show as a Bot integration, not only as slash commands.': 'EN: Sentinel must show as a Bot integration, not only as slash commands.',
    'Tester apres l\'installation': 'Test after setup',
    'Une fois Sentinel arrive sur le serveur, utilise': 'Once Sentinel is on the server, use',
    'puis': 'then',
    'pour verifier la base, les roles et les permissions.': 'to check the database, roles, and permissions.',
    'EN: after inviting, run /ping and /diagnostic to confirm that everything is ready.': 'EN: after inviting, run /ping and /diagnostic to confirm that everything is ready.',
    'Important': 'Important',
    'Le lien officiel contient deux autorisations.': 'The official link contains two permissions.',
    'Sentinel a besoin de': 'Sentinel needs',
    'et': 'and',
    'Sans les deux, les commandes peuvent apparaitre sans que le bot soit vraiment present sur le serveur.': 'Without both, commands may appear even though the bot is not truly present on the server.',
    'Relancer l\'invitation': 'Restart the invite',
    'Action': 'Action',
    'Tu peux commencer maintenant.': 'You can start now.',
    'Invite Sentinel, puis ouvre le dashboard pour configurer ton serveur visuellement.': 'Invite Sentinel, then open the dashboard to configure your server visually.',

    'Dashboard Sentinel': 'Sentinel Dashboard',
    'Pas besoin de s\'y connaitre.': 'No technical knowledge needed.',
    'Le dashboard web sera active quand l\'hebergement sera disponible. En attendant, tout ce qui est important peut se faire directement dans Discord avec les commandes ci-dessous.': 'The web dashboard will be active when hosting is available. For now, everything important can still be done directly in Discord with the commands below.',
    'Guide actif': 'Guide active',
    'Connexion web indisponible': 'Web login unavailable',
    'Tu peux quand meme installer, configurer et utiliser Sentinel sans quitter Discord.': 'You can still install, configure, and use Sentinel without leaving Discord.',
    'Demarrage rapide': 'Quick start',
    'Configurer Sentinel dans Discord': 'Configure Sentinel in Discord',
    'Ajoute le bot sur ton Discord avec le bouton ci-dessous.': 'Add the bot to your Discord with the button below.',
    'Tape': 'Type',
    'puis selectionne Francais ou English.': 'then select Francais or English.',
    'et choisis le role qui sera donne aux agents en service.': 'and choose the role given to agents on duty.',
    'avec l\'ID du salon de logs.': 'with the log channel ID.',
    'pour definir qui peut gerer Sentinel.': 'to define who can manage Sentinel.',
    'dans le salon ou les membres doivent pointer.': 'in the channel where members should clock in.',
    'Voir les commandes': 'View commands',
    'A copier': 'Copy',
    'Commandes utiles': 'Useful commands',
    'Voir le tutoriel du bot': 'View the bot tutorial',
    'Choisir FR ou EN': 'Choose FR or EN',
    'Donner les droits au staff': 'Give staff permissions',
    'Afficher le panneau de service': 'Show the duty panel',
    'Pourquoi cette page ?': 'Why this page?',
    'Le dashboard web depend de l\'hebergement.': 'The web dashboard depends on hosting.',
    'Si l\'hebergement du dashboard est coupe, Sentinel continue quand meme de fonctionner dans Discord. Cette page evite les erreurs techniques et donne les actions a faire tout de suite.': 'If dashboard hosting is down, Sentinel still works in Discord. This page avoids technical errors and gives the actions to take right now.',
    'Guide d\'installation': 'Setup guide',
    'Comprendre les permissions': 'Understand permissions',
    'Controle ton bot depuis le web.': 'Control your bot from the web.',
    'Connecte-toi avec Discord, choisis un serveur, autorise Sentinel si besoin, puis execute les actions directement sur le Discord selectionne.': 'Log in with Discord, choose a server, authorize Sentinel if needed, then run actions directly on the selected Discord server.',
    'Choisir un serveur': 'Choose a server',
    'Centre de controle': 'Control center',
    'Vue d ensemble': 'Overview',
    'Etat': 'Status',
    'Resume serveur': 'Server summary',
    'Mode gratuit': 'Free mode',
    'Reglages': 'Settings',
    'Parametres': 'Parameters',
    'Equipe': 'Team',
    'Prises de service': 'Duty tracking',
    'Embeds': 'Embeds',
    'Messages Sentinel': 'Sentinel messages',
    'Journal': 'Log',
    'Audit': 'Audit',
    'Traces dashboard': 'Dashboard traces',
    'Securite': 'Security',
    'Actions rapides': 'Quick actions',
    'Avance': 'Advanced',
    'Outils premium': 'Premium tools',
    'Changer de serveur': 'Change server',
    'Non connecte': 'Not connected',
    'Serveurs': 'Servers',
    'Choix du Discord': 'Discord choice',
    'Fermer le volet': 'Close drawer',
    'Connecte-toi pour afficher tes serveurs.': 'Log in to show your servers.',
    'Selectionne un serveur': 'Select a server',
    'Ouvre le volet des serveurs pour choisir le Discord a piloter.': 'Open the server drawer to choose the Discord server to control.',
    'Ouvrir le volet': 'Open drawer',
    'Deconnexion': 'Log out',
    'Connexion Discord': 'Discord login',
    'Autorisation requise': 'Authorization required',
    'Bot installe': 'Bot installed',
    'Autoriser': 'Authorize',
    'Serveur selectionne': 'Selected server',
    'Premium actif': 'Premium active',
    'Reglages serveur': 'Server settings',
    'Langue du serveur': 'Server language',
    'Mettre a jour': 'Update',
    'Role de service': 'Duty role',
    'Configurer': 'Configure',
    'Salon de logs': 'Log channel',
    'Publier le panneau de service': 'Publish the duty panel',
    'Publier': 'Publish',
    'Roles autorises a gerer Sentinel': 'Roles allowed to manage Sentinel',
    'Aucun role autorise configure. Le mode amorcage Discord reste actif.': 'No allowed role configured. Discord bootstrap mode remains active.',
    'Retirer': 'Remove',
    'Ajouter': 'Add',
    'Actions immediates': 'Immediate actions',
    'Prendre le service pour un membre': 'Start duty for a member',
    'Prendre service': 'Start duty',
    'Finir le service pour un membre': 'End duty for a member',
    'Fin service': 'End duty',
    'Reset heures individuel': 'Individual hours reset',
    'Synchronisation service (Premium)': 'Duty sync (Premium)',
    'Synchronisation service': 'Duty sync',
    'Synchroniser': 'Sync',
    'En service': 'On duty',
    'Aucun agent en service.': 'No agent on duty.',
    'Top service': 'Service top',
    'Aucun temps enregistre.': 'No time recorded.',
    'Annonces': 'Announcements',
    'Embeds Sentinel': 'Sentinel embeds',
    'Creer un embed Sentinel': 'Create a Sentinel embed',
    'Envoyer l\'embed': 'Send embed',
    'Modifier un embed existant': 'Edit an existing embed',
    'Modifier sans quota': 'Edit without quota',
    'Supprimer un embed Sentinel': 'Delete a Sentinel embed',
    'Supprimer': 'Delete',
    'Embeds geres': 'Managed embeds',
    'Aucun embed Sentinel cree depuis ce dashboard ou Discord.': 'No Sentinel embed created from this dashboard or Discord.',
    'Audit dashboard': 'Dashboard audit',
    'Historique des actions faites depuis le site. Chaque serveur voit son propre journal, et la vue globale reste reservee a la creatrice.': 'History of actions made from the website. Each server sees its own log, and the global view stays reserved for the creator.',
    'Premium securite': 'Premium security',
    'Auteur': 'Author',
    'Filtre les actions faites par un utilisateur precis avec son ID Discord.': 'Filters actions made by one specific user with their Discord ID.',
    'Cible': 'Target',
    'Filtre les actions qui concernent un membre, role, salon, message ou cas precis.': 'Filters actions involving a specific member, role, channel, message, or case.',
    'Action': 'Action',
    'Filtre par type d action dashboard : reset, ban, embed, configuration, etc.': 'Filters by dashboard action type: reset, ban, embed, configuration, and more.',
    'Statut': 'Status',
    'Affiche seulement les actions reussies, echouees, ou les deux.': 'Shows only successful actions, failed actions, or both.',
    'Limite': 'Limit',
    'Nombre maximum de lignes affichees. Les serveurs Premium et la creatrice ont une limite plus haute.': 'Maximum number of lines shown. Premium servers and the creator have a higher limit.',
    'Toutes les actions': 'All actions',
    'Tous les statuts': 'All statuses',
    'Succes': 'Success',
    'Echec': 'Failed',
    'Filtrer le journal': 'Filter log',
    'Reinitialiser': 'Reset',
    'Vue serveur': 'Server view',
    'Vue globale creatrice': 'Creator global view',
    'Vue globale privee creatrice': 'Private creator global view',
    'Vue serveur uniquement': 'Server view only',
    'Aucune action dashboard trouvee pour ces filtres.': 'No dashboard action found for these filters.',
    'Role autorise ajoute': 'Allowed role added',
    'Role autorise retire': 'Allowed role removed',
    'Panneau de service': 'Duty panel',
    'Embed cree': 'Embed created',
    'Embed modifie': 'Embed edited',
    'Embed supprime': 'Embed deleted',
    'Avertissement': 'Warning',
    'Expulsion': 'Kick',
    'Ban': 'Ban',
    'Deban': 'Unban',
    'Purge': 'Purge',
    'Cas modifie': 'Case edited',
    'Cas supprime': 'Case deleted',
    'Avertissement retire': 'Warning removed',
    'Commandes gratuites et Premium': 'Free and premium commands',
    'Commandes de moderation': 'Moderation commands',
    'Les actions Premium restent visibles ici, avec un badge dedie, pour comprendre ce qui est inclus dans chaque offre.': 'Premium actions stay visible here with a dedicated badge, so users understand what each plan includes.',
    'Options premium': 'Premium options',
    'Option Premium': 'Premium option',
    'Ces actions servent aux staffs qui gerent beaucoup de salons, de sanctions et de cas moderateur.': 'These actions are made for staff teams managing many channels, sanctions, and moderation cases.',
    'Ajouter un role autorise': 'Add an authorized role',
    'Choisit la langue utilisee par Sentinel sur ce serveur uniquement. Les reponses Discord et le dashboard suivront ce choix.': 'Chooses the language used by Sentinel on this server only. Discord replies and the dashboard will follow this setting.',
    'Role ajoute automatiquement quand un membre prend son service, puis retire quand il termine.': 'Role automatically added when a member starts duty, then removed when they end duty.',
    'Salon ou Sentinel publie les prises de service, fins de service, durees et actions importantes.': 'Channel where Sentinel posts duty starts, duty ends, durations, and important actions.',
    'Envoie dans le salon choisi le bouton que les membres utiliseront pour prendre ou finir leur service.': 'Sends the button members use to start or end duty in the selected channel.',
    'Ces roles peuvent utiliser les commandes de gestion et agir depuis le dashboard selon les permissions Discord du serveur.': 'These roles can use management commands and act from the dashboard according to the server Discord permissions.',
    'Ajoute un role staff a la liste des roles autorises a configurer et gerer Sentinel.': 'Adds a staff role to the list of roles allowed to configure and manage Sentinel.',
    'Demarre manuellement le service d un membre avec son ID Discord et applique le role de service si possible.': 'Manually starts duty for a member with their Discord ID and applies the duty role when possible.',
    'Arrete le service en cours d un membre, calcule la duree et ajoute ce temps a son total.': 'Ends a member current duty session, calculates the duration, and adds it to their total.',
    'Remet a zero les heures d une seule personne avec son ID Discord, meme si elle a quitte le serveur.': 'Resets one person hours with their Discord ID, even if they left the server.',
    'Option Premium : repare les incoherences entre les membres en service, les roles Discord et la base de donnees.': 'Premium option: fixes inconsistencies between members on duty, Discord roles, and the database.',
    'Publie une annonce propre sous l identite de Sentinel dans le salon choisi. Le gratuit garde un nombre limite d embeds actifs.': 'Publishes a clean announcement as Sentinel in the selected channel. Free servers keep a limited number of active embeds.',
    'Modifie un embed Sentinel deja envoye avec son ID de message. Les modifications ne consomment pas de quota.': 'Edits an existing Sentinel embed using its message ID. Edits do not consume quota.',
    'Supprime un embed gere par Sentinel et libere son emplacement gratuit si le serveur n est pas Premium.': 'Deletes a Sentinel-managed embed and frees its free slot if the server is not Premium.',
    'Liste les embeds que Sentinel peut encore modifier ou supprimer depuis le dashboard. Copie leur ID pour les gerer.': 'Lists embeds Sentinel can still edit or delete from the dashboard. Copy their ID to manage them.',
    'Ajoute un avertissement au dossier de moderation d un utilisateur et l enregistre dans les logs.': 'Adds a warning to a user moderation record and logs it.',
    'Rend temporairement muet un membre present sur le serveur pendant la duree indiquee.': 'Temporarily mutes a member currently on the server for the chosen duration.',
    'Retire un timeout actif sur un membre present et garde une trace de l action.': 'Removes an active timeout from a present member and keeps a record of the action.',
    'Retire un membre du serveur sans le bannir. Il pourra revenir avec une nouvelle invitation.': 'Removes a member from the server without banning them. They can return with a new invite.',
    'Bannit un utilisateur avec son ID Discord, meme s il n est plus present sur le serveur.': 'Bans a user with their Discord ID, even if they are no longer on the server.',
    'Supprime rapidement un nombre defini de messages recents dans le salon choisi.': 'Quickly deletes a chosen number of recent messages in the selected channel.',
    'Option Premium : bannit un utilisateur pour une duree precise, puis Sentinel le debannit automatiquement.': 'Premium option: bans a user for a precise duration, then Sentinel automatically unbans them.',
    'Option Premium : retire le bannissement d un utilisateur avec son ID Discord, meme s il n est plus dans le serveur.': 'Premium option: removes a user ban with their Discord ID, even if they are no longer in the server.',
    'Option Premium : bloque l envoi de messages dans un salon pour calmer une situation ou preparer une annonce.': 'Premium option: blocks message sending in a channel to calm a situation or prepare an announcement.',
    'Option Premium : remet un salon verrouille en mode normal pour permettre aux membres de reparler.': 'Premium option: restores a locked channel to normal so members can speak again.',
    'Option Premium : impose un delai entre deux messages pour ralentir un salon trop actif.': 'Premium option: applies a delay between messages to slow down an overly active channel.',
    'Option Premium : corrige ou precise la raison d un dossier de moderation deja enregistre.': 'Premium option: corrects or clarifies the reason of an existing moderation record.',
    'Option Premium : retire un dossier de moderation cree par erreur ou devenu invalide.': 'Premium option: removes a moderation record created by mistake or no longer valid.',
    'Option Premium : annule un avertissement precis sans effacer toute l histoire de moderation du membre.': 'Premium option: cancels one specific warning without deleting the member full moderation history.',
    'Option Premium : remet a zero toutes les heures de service du serveur avec une action globale reservee aux grands nettoyages.': 'Premium option: resets all server duty hours with a global action reserved for major cleanups.',
    'Avertir par ID': 'Warn by ID',
    'Timeout': 'Timeout',
    'Fin timeout': 'End timeout',
    'Expulser': 'Kick',
    'Bannir par ID': 'Ban by ID',
    'Purge messages': 'Purge messages',
    'Purger': 'Purge',
    'Ban temporaire par ID': 'Temporary ban by ID',
    'Debannir par ID': 'Unban by ID',
    'Unban': 'Unban',
    'Verrouiller salon': 'Lock channel',
    'Lock': 'Lock',
    'Deverrouiller salon': 'Unlock channel',
    'Unlock': 'Unlock',
    'Modifier un cas': 'Edit a case',
    'Modifier': 'Edit',
    'Supprimer un cas': 'Delete a case',
    'Retirer un avertissement': 'Remove a warning',
    'Unwarn': 'Unwarn',
    'Reset global serveur': 'Global server reset',

    '/aide': '/help',
    '/config-langue': '/language',
    '/config-logs': '/config-channel',
    '/config-voir': '/config-view',
    '/mes-heures': '/my-hours',
    '/historique-service': '/history',
    '/en-service': '/on-duty',
    '/reset-heures': '/reset-hours',
    '/avertir': '/warn',
    '/fin-timeout': '/untimeout',
    '/expulser': '/kick',
    '/bannir': '/ban',
    '/purge': '/clear',
    '/sanctions': '/mod-cases',
    '/heures': '/hours',
    '/top-semaine': '/top-week',
    '/resume-service': '/summary',
    '/reset-heures-all': '/reset-hours-all',
    '/cas': '/case',
    '/profil-mod': '/mod-profile',
    '/embed creer': '/embed create',
    '/embed modifier': '/embed edit',
    '/embed supprimer': '/embed delete'
  };

  const placeholderEn = {
    'Choisir': 'Choose',
    'Choisir un role': 'Choose a role',
    'Choisir un role autorise': 'Choose an allowed role',
    'Aucun ping de role': 'No role ping',
    'Choisir un salon': 'Choose a channel',
    'ID Discord du membre': 'Member Discord ID',
    'ID Discord, meme si la personne est partie': 'Discord ID, even if the person left',
    'ID Discord, meme hors serveur': 'Discord ID, even outside the server',
    'ID Discord auteur': 'Author Discord ID',
    'ID cible': 'Target ID',
    'ID Discord': 'Discord ID',
    'ID Discord du membre present': 'Discord ID of a current member',
    'Raison': 'Reason',
    '10m, 2h, 7d': '10m, 2h, 7d',
    '1h, 7d, 30d': '1h, 7d, 30d',
    'Jours messages': 'Message days',
    'Titre': 'Title',
    'Message de l\'annonce': 'Announcement message',
    'Couleur : rose, cyan, #ff2d9a': 'Color: pink, cyan, #ff2d9a',
    'Image URL optionnelle': 'Optional image URL',
    'Miniature URL optionnelle': 'Optional thumbnail URL',
    'Footer optionnel': 'Optional footer',
    'ID du message embed': 'Embed message ID',
    'Nouveau titre': 'New title',
    'Nouveau message': 'New message',
    'Nouvelle couleur': 'New color',
    'Nouvelle image URL, ou retirer': 'New image URL, or remove',
    'Nouvelle miniature URL, ou retirer': 'New thumbnail URL, or remove',
    'Nouveau footer, ou retirer': 'New footer, or remove',
    'ID du cas': 'Case ID',
    'Nouvelle raison': 'New reason',
    'ID du cas avertissement': 'Warning case ID',
    '10s, 5m, 0': '10s, 5m, 0'
  };

  Object.assign(en, {
    'Sentinel | Bot Discord de service et de modération': 'Sentinel | Discord duty and moderation bot',
    'Fonctionnalités | Sentinel': 'Features | Sentinel',
    'Sécurité | Sentinel': 'Security | Sentinel',
    'Sentinel centralise la modération Discord et les prises de service réalistes pour le RP, les équipes staff, les communautés et toute autre organisation.': 'Sentinel centralizes Discord moderation and realistic duty tracking for RP, staff teams, communities, and any other organization.',
    'Modération, prises de service réalistes, statistiques, logs et dashboard web pour le RP, les équipes staff, les communautés et tout autre usage.': 'Moderation, realistic duty tracking, statistics, logs, and a web dashboard for RP, staff teams, communities, and any other use.',
    'Fonctionnalités de Sentinel pour le service, les statistiques, les logs et la modération Discord.': 'Sentinel features for duty tracking, statistics, logs, and Discord moderation.',
    'Fonctionnalités Premium préparées pour Sentinel.': 'Prepared Premium features for Sentinel.',
    'Sécurité, permissions et confidentialité de Sentinel.': 'Security, permissions, and privacy for Sentinel.',
    'Cette page n’existe pas ou a été déplacée.': 'This page does not exist or has been moved.',
    'Performance • Sécurité • Fiabilité': 'Performance • Security • Reliability',
    'Un bot Discord bilingue pensé pour modérer un serveur et organiser des prises de service réalistes, adaptées au RP, aux équipes staff, aux communautés et à tout autre usage.': 'A bilingual Discord bot built for server moderation and realistic duty tracking, suited for RP, staff teams, communities, and any other use.',
    'Sentinel réunit deux besoins essentiels : modérer proprement un Discord et gérer des prises de service crédibles pour du RP, une équipe staff, une communauté ou toute autre organisation.': 'Sentinel brings together two essential needs: clean Discord moderation and credible duty tracking for RP, a staff team, a community, or any other organization.',
    'Prise de service, fin de service, rôle automatique, historique et temps total pour un suivi réaliste.': 'Clock in, clock out, automatic role, history, and total time for realistic tracking.',
    'Heures personnelles, agents actifs, classement de service et vues avancées Premium.': 'Personal hours, active members, service leaderboard, and Premium advanced views.',
    'Avertissements, timeouts, bans par ID, sanctions, logs et cas Premium.': 'Warnings, timeouts, ID bans, cases, logs, and Premium case tools.',
    'Dashboard clair, actions directes et commandes prêtes à utiliser.': 'Clear dashboard, direct actions, and ready-to-use commands.',
    'Un site clair, rangé par besoin.': 'A clear site, organized by need.',
    'Chaque partie de Sentinel a sa page dédiée : présentation, commandes, Premium, sécurité et installation.': 'Each Sentinel area has its own page: overview, commands, Premium, security, and setup.',
    'Voir le détail des commandes gratuites, Premium et texte.': 'See the free, Premium, and text commands in detail.',
    'Voir ce qui sera réservé aux grandes communautés.': 'See what will be reserved for larger communities.',
    'Permissions, rôles, logs et hiérarchie Discord.': 'Permissions, roles, logs, and Discord hierarchy.',
    'Invite le bot, choisis la langue, configure les rôles, puis gère le reste depuis Discord ou le dashboard.': 'Invite the bot, choose the language, configure roles, then manage the rest from Discord or the dashboard.',
    'Prise et fin de service sans prise de tête.': 'Clock in and out without friction.',
    'Sentinel vérifie les permissions Discord, respecte la hiérarchie des rôles et garde une trace des sanctions. Les bans peuvent se faire par ID, et le staff peut publier des annonces embed sous l’identité de Sentinel.': 'Sentinel checks Discord permissions, respects role hierarchy, and keeps a record of sanctions. Bans can use a Discord ID, and staff can publish embed announcements under Sentinel identity.',
    'Le dashboard permet de configurer Sentinel, gérer les services, modérer et publier des embeds d’annonce sans taper de slash command.': 'The dashboard lets you configure Sentinel, manage duty tracking, moderate, and publish announcement embeds without typing slash commands.',
    'Connexion Discord prête': 'Discord login ready',
    'Pas besoin de s’y connaître.': 'No technical knowledge needed.',
    'Si le dashboard web n’est pas disponible, tu peux quand même tout faire depuis Discord avec les commandes ci-dessous.': 'If the web dashboard is unavailable, you can still do everything from Discord with the commands below.',
    'Tu peux quand même installer, configurer et utiliser Sentinel sans quitter Discord.': 'You can still install, configure, and use Sentinel without leaving Discord.',
    'Connecte-toi avec Discord, choisis un serveur, autorise Sentinel si besoin, puis exécute les actions directement sur le Discord sélectionné.': 'Log in with Discord, choose a server, authorize Sentinel if needed, then run actions directly on the selected Discord server.',
    'Journal des actions réalisées depuis le dashboard. Ce serveur affiche uniquement ses propres actions, avec date, utilisateur, cible et résultat.': 'Dashboard action log. This server only shows its own actions, with date, user, target, and result.',
    'Premium : création illimitée, modifications illimitées.': 'Premium: unlimited creation, unlimited edits.',
    'Gratuit :': 'Free:',
    'embeds actifs utilisés. Restant :': 'active embeds used. Remaining:',
    'Modifications illimitées.': 'Unlimited edits.',
    'Aucun embed Sentinel créé depuis ce dashboard ou Discord.': 'No Sentinel embed created from this dashboard or Discord.',
    'Rôle de service': 'Duty role',
    'Rôle autorisé ajouté': 'Allowed role added',
    'Rôle autorisé retiré': 'Allowed role removed',
    'Embed créé': 'Embed created',
    'Embed modifié': 'Embed edited',
    'Embed supprimé': 'Embed deleted',
    'Déban': 'Unban',
    'Cas modifié': 'Case edited',
    'Cas supprimé': 'Case deleted',
    'Langue du serveur': 'Server language',
    'Choisit la langue utilisée par Sentinel sur ce serveur uniquement. Les réponses Discord et le dashboard suivront ce choix.': 'Choose the language Sentinel uses on this server only. Discord replies and the dashboard will follow this choice.',
    'Rôle ajouté automatiquement quand un membre prend son service, puis retiré quand il termine.': 'Role automatically added when a member clocks in, then removed when they clock out.',
    'Salon où Sentinel publie les prises de service, fins de service, durées et actions importantes.': 'Channel where Sentinel posts clock-ins, clock-outs, durations, and important actions.',
    'Ces rôles peuvent utiliser les commandes de gestion et agir depuis le dashboard, selon les permissions Discord du serveur.': 'These roles can use management commands and act from the dashboard, depending on the server Discord permissions.',
    'Ajouter un rôle autorisé': 'Add an allowed role',
    'Ajoute un rôle staff à la liste des rôles autorisés à configurer et gérer Sentinel.': 'Adds a staff role to the roles allowed to configure and manage Sentinel.',
    'Actions immédiates': 'Immediate actions',
    'Démarre manuellement le service d’un membre avec son ID Discord et applique le rôle de service si possible.': 'Manually starts duty for a member with their Discord ID and applies the duty role when possible.',
    'Arrête le service en cours d’un membre, calcule la durée et ajoute ce temps à son total.': 'Stops a member current duty session, calculates the duration, and adds it to their total.',
    'Remet à zéro les heures d’une seule personne avec son ID Discord, même si elle a quitté le serveur.': 'Resets one person hours with their Discord ID, even if they left the server.',
    'Option Premium : répare les incohérences entre les membres en service, les rôles Discord et la base de données.': 'Premium option: repairs inconsistencies between on-duty members, Discord roles, and the database.',
    'Publie une annonce propre sous l’identité de Sentinel dans le salon choisi. Le gratuit garde un nombre limité d’embeds actifs.': 'Publishes a clean announcement under Sentinel identity in the selected channel. Free servers keep a limited number of active embeds.',
    'Modifie un embed Sentinel déjà envoyé avec son ID de message. Les modifications ne consomment pas de quota.': 'Edits an already sent Sentinel embed with its message ID. Edits do not consume quota.',
    'Supprime un embed géré par Sentinel et libère son emplacement gratuit si le serveur n’est pas Premium.': 'Deletes an embed managed by Sentinel and frees its free slot if the server is not Premium.',
    'Liste les embeds que Sentinel peut encore modifier ou supprimer depuis le dashboard. Copie leur ID pour les gérer.': 'Lists embeds Sentinel can still edit or delete from the dashboard. Copy their ID to manage them.',
    'Ajoute un avertissement au dossier de modération d’un utilisateur et l’enregistre dans les logs.': 'Adds a warning to a user moderation file and records it in the logs.',
    'Rend temporairement muet un membre présent sur le serveur pendant la durée indiquée.': 'Temporarily mutes a member currently on the server for the chosen duration.',
    'Retire un timeout actif sur un membre présent et garde une trace de l’action.': 'Removes an active timeout from a current member and keeps an action record.',
    'Bannit un utilisateur avec son ID Discord, même s’il n’est plus présent sur le serveur.': 'Bans a user with their Discord ID, even if they are no longer on the server.',
    'Option Premium : bannit un utilisateur pour une durée précise, puis Sentinel le débannit automatiquement.': 'Premium option: bans a user for a precise duration, then Sentinel automatically unbans them.',
    'Débannir par ID': 'Unban by ID',
    'Option Premium : retire le bannissement d’un utilisateur avec son ID Discord, même s’il n’est plus dans le serveur.': 'Premium option: removes a user ban with their Discord ID, even if they are no longer in the server.',
    'Option Premium : bloque l’envoi de messages dans un salon pour calmer une situation ou préparer une annonce.': 'Premium option: blocks sending messages in a channel to calm a situation or prepare an announcement.',
    'Déverrouiller salon': 'Unlock channel',
    'Option Premium : remet un salon verrouillé en mode normal pour permettre aux membres de reparler.': 'Premium option: returns a locked channel to normal so members can talk again.',
    'Option Premium : impose un délai entre deux messages pour ralentir un salon trop actif.': 'Premium option: adds a delay between messages to slow down an overly active channel.',
    'Option Premium : corrige ou précise la raison d’un dossier de modération déjà enregistré.': 'Premium option: corrects or clarifies the reason of an already recorded moderation case.',
    'Option Premium : retire un dossier de modération créé par erreur ou devenu invalide.': 'Premium option: removes a moderation case created by mistake or no longer valid.',
    'Option Premium : annule un avertissement précis sans effacer toute l’histoire de modération du membre.': 'Premium option: cancels one precise warning without erasing the member full moderation history.',
    'Option Premium : remet à zéro toutes les heures de service du serveur avec une action globale réservée aux grands nettoyages.': 'Premium option: resets every duty hour on the server with a global action reserved for major cleanups.'
  });

  Object.assign(en, {
    'Sentinel | Bot Discord': 'Sentinel | Discord Bot',
    'Invite Sentinel': 'Invite Sentinel',
    'Choisis la langue': 'Choose the language',
    ', puis sélectionne Français ou English.': ', then select Français or English.',
    'Choisis le rôle de service': 'Choose the duty role',
    'Choisis le salon de logs': 'Choose the log channel',
    'Ajoute les rôles autorisés': 'Add the allowed roles',
    'Publie le panneau': 'Publish the panel',
    'Définir le salon de logs': 'Set the log channel',
    'Si l’hébergement du dashboard est coupé, Sentinel continue de fonctionner dans Discord. Cette page évite les erreurs techniques et te donne les actions à faire tout de suite.': 'If dashboard hosting is down, Sentinel still works inside Discord. This page avoids technical errors and gives you the actions to run right away.',
    'La version gratuite garde l’essentiel. Le Premium ajoute les contrôles avancés utiles aux grandes communautés.': 'The free version keeps the essentials. Premium adds advanced controls useful for large communities.',
    'Réinitialiser une personne, même par ID': 'Reset one person, including by ID',
    'Consulter les heures d’un autre membre': 'View another member hours',
    'Classement de la semaine': 'Weekly leaderboard',
    'Résumé complet du serveur': 'Full server summary',
    'Profil de modération complet': 'Full moderation profile',
    'Commandes gratuites et Premium de Sentinel pour Discord.': 'Free and Premium Sentinel commands for Discord.',
    'Sentinel doit être ajouté comme bot Discord, pas seulement comme intégration de commandes.': 'Sentinel must be added as a Discord bot, not only as a command integration.',
    'Dans les intégrations Discord, Sentinel doit afficher le badge Bot.': 'In Discord integrations, Sentinel must show the Bot badge.',
    'affiche le tutoriel complet de Sentinel. Depuis le site, tu peux suivre le même déroulé pour installer, configurer et utiliser le bot sans connaître Discord.': 'shows the full Sentinel tutorial. From the site, you can follow the same flow to install, configure, and use the bot without knowing Discord.',
    ', le salon de logs avec': ', the log channel with',
    ', puis les rôles autorisés avec': ', then the allowed roles with',
    '. Les membres pourront prendre service, voir leurs heures et suivre les agents actifs.': '. Members will be able to clock in, view their hours, and follow active agents.',
    'Ces points règlent la plupart des soucis quand Sentinel ne rejoint pas le serveur, n’apparaît pas comme bot ou quand le dashboard ne semble pas agir sur le bon serveur.': 'These checks solve most issues when Sentinel does not join the server, does not appear as a bot, or when the dashboard does not seem to act on the right server.',
    'Si Discord ouvre directement un serveur qui n\'est pas le bon, ferme la fenêtre et relance le lien officiel depuis cette page, sans lien personnalisé.': 'If Discord directly opens the wrong server, close the window and restart from the official link on this page, without a custom link.',
    '. Si tu vois seulement Commandes, retire l’intégration et réinvite-le.': '. If you only see Commands, remove the integration and invite it again.',
    '. Sans les deux, les commandes peuvent apparaître sans que le bot soit vraiment présent sur le serveur.': '. Without both, commands may appear without the bot truly being present on the server.',
    'Le gratuit reste utile. Le Premium devient un outil de staff.': 'Free stays useful. Premium becomes a staff tool.',
    'Sentinel Premium est pensé pour les serveurs actifs, avec beaucoup de membres, beaucoup d’actions et un besoin de contrôle plus précis.': 'Sentinel Premium is built for active servers with many members, many actions, and a need for more precise control.',
    'Pour les grandes communautés': 'For large communities',
    'Le Premium doit apporter du contrôle, pas seulement retirer du gratuit.': 'Premium should add control, not just remove free features.',
    'La logique est simple : le gratuit doit faire tourner un serveur. Le Premium doit faire gagner du temps aux staffs exigeants.': 'The logic is simple: free should run a server. Premium should save time for demanding staff teams.',
    'Base prête pour les rapports hebdomadaires, mensuels et les exports.': 'Foundation ready for weekly reports, monthly reports, and exports.',
    'Les commandes de gestion passent par les rôles définis dans Sentinel. Le propriétaire garde un accès de secours pour éviter tout blocage.': 'Management commands go through roles defined in Sentinel. The owner keeps fallback access to avoid a full lockout.',
    'Rôles dédiés au staff': 'Staff-only roles',
    'Démarrage sécurisé': 'Secure startup',
    'Sentinel ne contourne pas Discord : si une permission ou la hiérarchie manque, l’action est refusée.': 'Sentinel does not bypass Discord: if a permission or hierarchy is missing, the action is refused.',
    'Permission Discord vérifiée': 'Discord permission checked',
    'Sentinel stocke uniquement les IDs Discord, les temps de service, les sessions et la configuration serveur nécessaires à son fonctionnement.': 'Sentinel only stores Discord IDs, duty times, sessions, and server configuration needed to work.',
    'Accueil': 'Home',
    'État': 'Status',
    'Accueil serveur': 'Server home',
    'Assistant': 'Assistant',
    'Guide': 'Guide',
    'Configuration guidée': 'Guided setup',
    'Vue rapide de la configuration, des agents et des dernières actions Sentinel.': 'Quick view of configuration, agents, and latest Sentinel actions.',
    'Langue du serveur': 'Server language',
    'Salon de logs': 'Log channel',
    'Rôles autorisés': 'Allowed roles',
    'Agents enregistrés': 'Registered agents',
    'État global': 'Overall status',
    'Configuration prête': 'Configuration ready',
    'À faire': 'To do',
    'OK': 'OK',
    'Non configuré': 'Not configured',
    'Aucun rôle': 'No role',
    'À vérifier avant utilisation': 'Check before use',
    'Configure le rôle de service avant de publier le panneau.': 'Configure the duty role before publishing the panel.',
    'Le rôle de service configuré n’existe plus sur Discord.': 'The configured duty role no longer exists on Discord.',
    'Configure un salon de logs pour suivre les prises de service et les actions importantes.': 'Configure a log channel to track duty actions and important actions.',
    'Le salon de logs configuré n’existe plus ou n’est plus textuel.': 'The configured log channel no longer exists or is no longer text-based.',
    'Ajoute au moins un rôle autorisé pour déléguer la gestion de Sentinel au staff.': 'Add at least one allowed role to delegate Sentinel management to staff.',
    'Ouvrir l’assistant': 'Open assistant',
    'Actions récentes': 'Recent actions',
    'Aucune action récente depuis le dashboard.': 'No recent dashboard action.',
    'Configurer Sentinel en 4 étapes': 'Configure Sentinel in 4 steps',
    'Suis ces étapes dans l’ordre. Chaque validation met directement à jour ce serveur Discord.': 'Follow these steps in order. Each validation directly updates this Discord server.',
    'Choisir la langue': 'Choose the language',
    'Définit la langue utilisée par Sentinel sur ce serveur.': 'Sets the language used by Sentinel on this server.',
    'Valider la langue': 'Validate language',
    'Choisir le rôle de service': 'Choose the duty role',
    'Ce rôle sera ajouté quand un membre prend son service, puis retiré à la fin.': 'This role will be added when a member clocks in, then removed at the end.',
    'Configurer le rôle': 'Configure role',
    'Choisir le salon de logs': 'Choose the log channel',
    'Sentinel y publiera les prises de service, fins de service et actions importantes.': 'Sentinel will post duty starts, duty ends, and important actions there.',
    'Configurer les logs': 'Configure logs',
    'Ajouter les rôles autorisés': 'Add allowed roles',
    'Ces rôles pourront gérer Sentinel depuis Discord et depuis le dashboard.': 'These roles will be able to manage Sentinel from Discord and from the dashboard.',
    'Autoriser ce rôle': 'Allow this role',
    'Prêt': 'Ready',
    'À configurer': 'To configure',
    'Aucun rôle choisi': 'No role selected',
    'Aucun salon choisi': 'No channel selected',
    'Aucun rôle staff autorisé': 'No allowed staff role',
    'Configuration complète. Tu peux publier le panneau de service ou gérer le serveur depuis les autres onglets.': 'Configuration complete. You can publish the duty panel or manage the server from the other tabs.',
    'Quand les 4 étapes sont prêtes, Sentinel peut être utilisé proprement par le staff et les membres.': 'When all 4 steps are ready, Sentinel can be used cleanly by staff and members.',
    'Voir les réglages avancés': 'View advanced settings'
  });

  let normalizedTranslations = null;

  function normalizeTranslationKey(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getNormalizedTranslation(value) {
    if (!normalizedTranslations) {
      normalizedTranslations = new Map();

      for (const [key, translated] of [...Object.entries(en), ...Object.entries(placeholderEn)]) {
        normalizedTranslations.set(normalizeTranslationKey(key), translated);
      }
    }

    return normalizedTranslations.get(normalizeTranslationKey(value));
  }

  function currentLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  function translateValue(value, language) {
    if (language === 'fr') return value;
    const exact = en[value] || placeholderEn[value];
    if (exact) return exact;
    const normalized = getNormalizedTranslation(value);
    if (normalized) return normalized;
    const normalizedValue = normalizeTranslationKey(value);

    let match = /^Gratuit : (\d+)\/(\d+) embeds actifs utilises\. Restant : (\d+)\. Modifications illimitees\.$/.exec(normalizedValue);
    if (match) return `Free: ${match[1]}/${match[2]} active embeds used. Remaining: ${match[3]}. Unlimited edits.`;

    match = /^Commande copiee : (.+)$/.exec(normalizedValue);
    if (match) return `Command copied: ${match[1]}`;

    match = /^#(.+) - (.+)$/.exec(normalizedValue);
    if (match) return `#${match[1]} - ${match[2]}`;

    match = /^(\d+) entree\(s\) affichee\(s\)$/.exec(normalizedValue);
    if (match) return `${match[1]} displayed entr${match[1] === '1' ? 'y' : 'ies'}`;

    match = /^Actuel : (.+)$/.exec(normalizedValue);
    if (match) return `Current: ${match[1]}`;

    match = /^(\d+)\/4 etapes pretes$/.exec(normalizedValue);
    if (match) return `${match[1]}/4 steps ready`;

    return value;
  }

  function preserveWhitespace(original, translated) {
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    return `${leading}${translated}${trailing}`;
  }

  function shouldSkip(node) {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!element) return true;
    return Boolean(element.closest('script, style, .language-switch, [data-i18n-ignore]'));
  }

  function translateTextNodes(language) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (!shouldSkip(node)) {
        if (!textOriginals.has(node)) {
          textOriginals.set(node, node.nodeValue);
        }

        const original = textOriginals.get(node);
        const trimmed = original.trim();

        if (trimmed) {
          node.nodeValue = language === 'fr'
            ? original
            : preserveWhitespace(original, translateValue(trimmed, language));
        }
      }

      node = walker.nextNode();
    }
  }

  function translateAttributes(language) {
    const attrs = ['placeholder', 'aria-label', 'alt', 'content', 'data-tooltip'];
    document.querySelectorAll('[placeholder], [aria-label], [alt], meta[content], [data-tooltip]').forEach((element) => {
      attrs.forEach((attr) => {
        if (!element.hasAttribute(attr)) return;
        const key = `i18nOriginal${attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`;

        if (!element.dataset[key]) {
          element.dataset[key] = element.getAttribute(attr) || '';
        }

        const original = element.dataset[key];
        element.setAttribute(attr, language === 'fr' ? original : translateValue(original, language));
      });
    });
  }

  function renderLanguageSwitch(language) {
    let switcher = document.querySelector('.language-switch');
    const host = document.querySelector('.header-actions') || document.querySelector('.not-found');

    if (!host) return;

    if (!switcher) {
      switcher = document.createElement('div');
      switcher.className = 'language-switch';
      switcher.setAttribute('aria-label', 'Language');
      switcher.innerHTML = `
        <button type="button" data-lang-choice="fr">FR</button>
        <button type="button" data-lang-choice="en">EN</button>
      `;
      host.prepend(switcher);
      switcher.addEventListener('click', (event) => {
        const button = event.target.closest('[data-lang-choice]');
        if (!button) return;
        setLanguage(button.dataset.langChoice);
      });
    }

    switcher.querySelectorAll('[data-lang-choice]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.langChoice === language);
      button.setAttribute('aria-pressed', String(button.dataset.langChoice === language));
    });
  }

  function applyLanguage(language) {
    if (isTranslating) return;
    isTranslating = true;

    document.documentElement.lang = language;
    document.title = language === 'fr' ? titleOriginal : translateValue(titleOriginal, language);
    renderLanguageSwitch(language);
    translateAttributes(language);
    translateTextNodes(language);

    isTranslating = false;
  }

  function setLanguage(language) {
    localStorage.setItem(STORAGE_KEY, language);
    applyLanguage(language);
    window.dispatchEvent(new CustomEvent('sentinel:site-language-change', {
      detail: { language }
    }));
  }

  let scheduled = false;
  function scheduleTranslation() {
    if (scheduled || isTranslating) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyLanguage(currentLanguage());
    });
  }

  window.SentinelI18n = {
    apply: () => applyLanguage(currentLanguage()),
    setLanguage,
    translate: (value) => translateValue(value, currentLanguage())
  };

  applyLanguage(currentLanguage());

  const observer = new MutationObserver(scheduleTranslation);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
