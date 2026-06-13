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

## Commandes slash

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
| `/top-semaine` | `/top-week` |
| `/heures` | `/hours` |
| `/reset-heures` | `/reset-hours` |
| `/reset-heures-all` | `/reset-hours-all` |
| `/resume-service` | `/summary` |
| `/avertir` | `/warn` |
| `/timeout` | `/timeout` |
| `/fin-timeout` | `/untimeout` |
| `/expulser` | `/kick` |
| `/bannir` | `/ban` |
| `/purge` | `/clear` |
| `/sanctions` | `/mod-cases` |

## Commandes texte

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
- `!top-semaine`
- `!top-week`
- `!heures @membre`
- `!hours @member`
- `!reset-heures @membre`
- `!reset-hours @member`
- `!reset-heures-all`
- `!reset-hours-all`
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

## Moderation / Moderation

Francais :

- `/avertir` enregistre une sanction sans appliquer de punition Discord.
- `/timeout` rend un membre muet temporairement. Durées valides : `10m`, `2h`, `7d`.
- `/fin-timeout` retire un timeout actif.
- `/expulser` retire un membre du serveur.
- `/bannir` bannit un utilisateur du serveur.
- `/purge` supprime jusqu'a 100 messages recents dans le salon.
- `/sanctions` affiche les 10 dernieres sanctions d'un membre.

Sentinel verifie les roles autorises, les permissions Discord et la hierarchie des roles avant d'appliquer une sanction.

English:

- `/warn` records a moderation case without applying a Discord punishment.
- `/timeout` temporarily times out a member. Valid durations: `10m`, `2h`, `7d`.
- `/untimeout` removes an active timeout.
- `/kick` removes a member from the server.
- `/ban` bans a user from the server.
- `/clear` deletes up to 100 recent messages in the channel.
- `/mod-cases` shows the last 10 moderation cases for a member.

Sentinel checks configured roles, Discord permissions, and role hierarchy before applying a moderation action.

## Site web

Le site vitrine de Sentinel se trouve dans :

```text
site/index.html
```

Il est statique, bilingue francais/anglais et peut etre ouvert directement dans un navigateur.
Il est publie avec GitHub Pages via le workflow `.github/workflows/deploy-site.yml`.

URL publique prevue :

```text
https://phileaszer.github.io/bot-service-discord/
```

## Installation

```bash
npm install
```

## Scripts npm

```bash
npm start
npm run deploy:commands
npm run check
```

## Variables d'environnement

Copier `.env.example` vers `.env` en local, ou configurer les variables dans Railway :

```env
TOKEN=
CLIENT_ID=
DATABASE_PATH=./database/service.db
```

`DATABASE_PATH` est optionnel. Par defaut, la base est creee dans `database/service.db`.

Ne jamais publier `.env`.

## Base de donnees

La base SQLite est creee automatiquement si elle n'existe pas. Les tables sont creees au demarrage dans `database/database.js`.

En local, le chemin par defaut est :

```text
database/service.db
```

Ce fichier est ignore par Git. Les donnees privees ne doivent pas etre commitees.

## Permissions

Les commandes de gestion du bot sont accessibles uniquement aux roles configures avec `/config-permissions`.
Si aucun role de gestion n'est encore configure, les membres avec `Administrateur`, `Gerer le serveur` ou `Gerer les roles` peuvent demarrer la configuration.
Une fois un role ajoute, ce role devient l'acces normal aux commandes de gestion.
Le proprietaire du serveur garde un acces de secours pour eviter un blocage complet.


## Persistance Railway

Pour eviter de perdre la base SQLite apres un redeploiement Railway, configure un volume persistant et definis `DATABASE_PATH` vers ce volume.

Exemple si le volume est monte sur `/data` :

```env
DATABASE_PATH=/data/service.db
```

Sans volume persistant, la base SQLite peut etre recreee vide selon le cycle de vie du conteneur.

## Deploiement des commandes slash

```bash
node deploy-commands.js
```

Les commandes slash sont deployees globalement sur tous les serveurs ou le bot est installe.

Si Node rencontre un probleme de certificat sur Windows :

```bash
node --use-system-ca deploy-commands.js
```

## Lancement

```bash
node index.js
```

## Railway

Configurer les variables d'environnement dans Railway, puis deployer le projet. Pour conserver les donnees, ajoute un volume persistant et configure `DATABASE_PATH` vers le chemin monte.

