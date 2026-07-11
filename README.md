# Sentinel

Sentinel est un bot Discord multi-serveurs pour suivre les temps de service des membres.

## Fonctionnalites

- Prise et fin de service avec bouton Discord
- Temps de service total par membre
- Historique personnel limite aux 5 dernieres sessions
- Classement global limite au top 10
- Liste des agents actuellement en service
- Logs des prises et fins de service
- Configuration du role de service et du salon de logs
- Gestion des roles autorises a administrer le bot
- Moderation simple : avertissements, timeout, expulsion, bannissement, purge et historique des sanctions
- Embeds d'annonce sous l'identite de Sentinel : 2 embeds actifs gratuits, modifications illimitees
- Choix de langue par serveur : francais ou anglais
- Commandes slash localisees avec les localisations natives Discord
- Stockage SQLite avec `better-sqlite3`

## Langues / Languages

Sentinel supporte le francais et l'anglais.

La langue est stockee individuellement pour chaque serveur dans SQLite. Changer la langue d'un serveur ne change pas les autres serveurs.

Commandes :

- `/config-langue langue:Francais`
- `/language language:English`
- `!langue fr`
- `!language en`

Quand Sentinel rejoint un serveur, il essaie d'envoyer un message avec deux boutons : `Francais` et `English`.

Discord ne permet pas de changer les noms des commandes slash selon la langue choisie par le serveur. La solution propre utilisee par Sentinel est :

- les reponses, embeds, boutons et logs suivent la langue du serveur
- les commandes slash utilisent les localisations natives Discord
- un utilisateur avec Discord en francais voit les noms francais
- un utilisateur avec Discord en anglais voit les noms anglais

Sentinel supports French and English.

The language is stored individually for each server in SQLite. Changing one server language does not change any other server.

Commands:

- `/config-langue langue:Francais`
- `/language language:English`
- `!langue fr`
- `!language en`

When Sentinel joins a server, it tries to send a message with two buttons: `Francais` and `English`.

Discord does not allow slash command names to change based on the language selected by a server. Sentinel uses the cleanest available solution:

- replies, embeds, buttons, and logs follow the server language
- slash commands use Discord native localizations
- a user using Discord in French sees French command names
- a user using Discord in English sees English command names

## Ajouter Sentinel a un serveur

Lien d'invitation officiel :

[Inviter Sentinel](https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780156422&integration_type=0&scope=bot+applications.commands)

Le lien doit contenir les deux scopes Discord :

- `bot`
- `applications.commands`

Si Sentinel apparait dans les integrations avec seulement `Commandes` et sans badge `Bot`, retire l'integration puis utilise le lien ci-dessus.

Permissions demandees :

- Gerer les roles
- Exclure des membres
- Bannir des membres
- Moderer les membres
- Gerer les messages
- Voir les salons
- Envoyer des messages
- Integrer des liens
- Lire l'historique des messages

Important : le role Sentinel doit etre place au-dessus du role de service dans la hierarchie des roles Discord.
Pour la moderation, le role Sentinel doit aussi etre au-dessus des roles des membres qu'il doit moderer.

## Commandes slash gratuites

| Francais | English |
| --- | --- |
| `/aide` | `/help` |
| `/config-langue` | `/language` |
| `/config-role` | `/config-role` |
| `/config-logs` | `/config-channel` |
| `/config-voir` | `/config-view` |
| `/config-permissions` | `/config-permissions` |
| `/historique-service` | `/history` |
| `/mes-heures` | `/my-hours` |
| `/en-service` | `/on-duty` |
| `/top-service` | `/top-service` |
| `/reset-heures` | `/reset-hours` |
| `/avertir` | `/warn` |
| `/timeout` | `/timeout` |
| `/fin-timeout` | `/untimeout` |
| `/expulser` | `/kick` |
| `/bannir` | `/ban` |
| `/purge` | `/clear` |
| `/sanctions` | `/mod-cases` |
| `/embed creer` | `/embed create` |
| `/embed modifier` | `/embed edit` |
| `/embed supprimer` | `/embed delete` |

## Commandes texte gratuites

- `!aide`
- `!help`
- `!langue fr`
- `!language en`
- `!service-panel`
- `!config-voir`
- `!config-permissions ajouter|retirer|voir [@role]`
- `!historique-service [limite]`
- `!history [limit]`
- `!mes-heures`
- `!my-hours`
- `!en-service`
- `!on-duty`
- `!top-service`
- `!reset-heures @membre` ou `!reset-heures ID`
- `!reset-hours @member` or `!reset-hours ID`
- `!avertir @membre raison`
- `!warn @member reason`
- `!timeout @membre 10m raison`
- `!timeout @member 10m reason`
- `!fin-timeout @membre raison`
- `!untimeout @member reason`
- `!expulser @membre raison`
- `!kick @member reason`
- `!bannir @membre raison`
- `!ban @member reason`
- `!purge 10`
- `!clear 10`
- `!sanctions @membre`
- `!mod-cases @member`

## Premium prepare

Ces commandes sont preparees pour Sentinel Premium et ne sont pas ouvertes sur les serveurs gratuits.

- `/reset-heures-all`
- `/reset-hours-all`
- `/heures`
- `/hours`
- `/top-semaine`
- `/top-week`
- `/resume-service`
- `/summary`
- `/historique-service membre limite`
- `/history member limit`
- `/diagnostic`
- `/sync-service`
- `/sync-sentinel`
- `/ping`
- `/cas`
- `/case`
- `/modifier-cas`
- `/edit-case`
- `/supprimer-cas`
- `/delete-case`
- `/unwarn`
- `/profil-mod`
- `/mod-profile`
- `/tempban`
- `/unban`
- `/lock`
- `/unlock`
- `/slowmode`
- `!reset-heures-all`
- `!reset-hours-all`
- `!heures @membre`
- `!hours @member`
- `!top-semaine`
- `!top-week`
- `!resume-service`
- `!summary`

En gratuit, la reinitialisation reste disponible personne par personne avec `/reset-heures membre:@membre`, `/reset-heures utilisateur_id:ID`, `/reset-hours member:@member` ou `/reset-hours user_id:ID`.
La moderation gratuite garde les actions essentielles et limite la consultation a `/sanctions`, soit les 10 derniers cas visibles.
Les embeds Sentinel sont limites a 2 embeds actifs en gratuit. Ils peuvent etre modifies autant de fois que necessaire. Le Premium prepare la creation illimitee.

## Moderation / Moderation

Francais :

- `/avertir` enregistre une sanction sans appliquer de punition Discord.
- `/timeout` rend un membre muet temporairement. Durées valides : `10m`, `2h`, `7d`.
- `/fin-timeout` retire un timeout actif.
- `/expulser` retire un membre du serveur.
- `/bannir` bannit un utilisateur du serveur. Si la personne n'est plus sur le serveur, utilise `utilisateur_id`.
- `/purge` supprime jusqu'a 100 messages recents dans le salon.
- `/sanctions` affiche les 10 dernieres sanctions d'un membre ou d'un ID Discord.
- `/embed creer` publie une annonce sous l'identite de Sentinel.
- `/embed modifier` modifie un embed Sentinel existant sans consommer de quota.
- `/embed supprimer` supprime un embed Sentinel et libere un emplacement gratuit.

Sentinel verifie les roles autorises, les permissions Discord et la hierarchie des roles avant d'appliquer une sanction.

Moderation Premium preparee :

- `/cas` affiche le detail d'un cas.
- `/modifier-cas` corrige la raison d'un cas.
- `/supprimer-cas` supprime un cas.
- `/unwarn` retire un avertissement par ID.
- `/profil-mod` affiche un profil moderation complet, meme avec un ID Discord.
- `/tempban` bannit temporairement un utilisateur avec expiration automatique, meme avec un ID Discord.
- `/unban` debannit un utilisateur par ID et annule un tempban actif.
- `/lock`, `/unlock` et `/slowmode` gerent rapidement un salon.
- Creation illimitee d'embeds Sentinel.

English:

- `/warn` records a moderation case without applying a Discord punishment.
- `/timeout` temporarily times out a member. Valid durations: `10m`, `2h`, `7d`.
- `/untimeout` removes an active timeout.
- `/kick` removes a member from the server.
- `/ban` bans a user from the server. If the user is no longer in the server, use `user_id`.
- `/clear` deletes up to 100 recent messages in the channel.
- `/mod-cases` shows the last 10 moderation cases for a member or Discord ID.
- `/embed create` publishes an announcement under Sentinel identity.
- `/embed edit` edits an existing Sentinel embed without using quota.
- `/embed delete` deletes a Sentinel embed and frees a free slot.

Sentinel checks configured roles, Discord permissions, and role hierarchy before applying a moderation action.

Prepared Premium moderation:

- `/case` shows one case details.
- `/edit-case` edits a case reason.
- `/delete-case` deletes a case.
- `/unwarn` removes a warning by ID.
- `/mod-profile` shows a full moderation profile, including by Discord ID.
- `/tempban` temporarily bans a user with automatic expiration, including by Discord ID.
- `/unban` unbans a user by ID and cancels an active tempban.
- `/lock`, `/unlock`, and `/slowmode` quickly manage a channel.
- Unlimited Sentinel embed creation.

## Permissions

Les commandes de gestion du bot sont accessibles uniquement aux roles configures avec `/config-permissions`.
Si aucun role de gestion n'est encore configure, les membres avec `Administrateur`, `Gerer le serveur` ou `Gerer les roles` peuvent demarrer la configuration.
Une fois un role ajoute, ce role devient l'acces normal aux commandes de gestion.
Le proprietaire du serveur garde un acces de secours pour eviter un blocage complet.

