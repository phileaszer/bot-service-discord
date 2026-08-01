# Sentinel

Sentinel est un bot Discord bilingue pensé pour les communautés, les serveurs RP et les équipes staff qui veulent gérer leurs prises de service, leur modération et leurs demandes depuis un même endroit.

## Liens utiles

- Site public : https://phileaszer.github.io/bot-service-discord/
- Dashboard : https://bot-service-discord-production.up.railway.app/dashboard
- Inviter Sentinel : https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands
- Serveur support : https://discord.gg/jzPqcUdVns
- Conditions d'utilisation : https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md
- Politique de confidentialité : https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md

## Ce que fait Sentinel

- Suivi des services : prise et fin de service, temps total, historique personnel, agents en service et classements.
- Modération : avertissements, timeout, expulsion, ban par ID, purge et consultation des sanctions.
- Dossiers Sentinel : système de tickets privés pour le support, les signalements, les recrutements, les partenariats et les autres demandes.
- Annonces : création et modification d'embeds publiés sous l'identité de Sentinel.
- Dashboard : configuration du serveur, actions rapides, audit, suivi des services, sanctions, dossiers et annonces.
- Langues : français et anglais, avec un choix propre à chaque serveur.
- Stockage : base SQLite locale avec `better-sqlite3`.

## Version gratuite

Sentinel Gratuit reste utilisable sans abonnement :

- panneau de service ;
- heures personnelles ;
- historique personnel limité ;
- classement global limité au top 10 ;
- modération essentielle ;
- consultation simple des sanctions ;
- 2 embeds actifs, modifiables sans limite ;
- 1 panneau de dossiers ;
- 5 dossiers ouverts en même temps ;
- 10 derniers dossiers visibles.

## Premium prévu

Sentinel Premium est préparé pour les serveurs qui ont besoin d'une gestion plus avancée :

- statistiques mensuelles et annuelles ;
- exports CSV, Excel ou PDF ;
- rapports automatiques ;
- embeds illimités ;
- panneaux de dossiers illimités ;
- catégories et formulaires personnalisés ;
- statuts avancés, priorités et prise en charge staff ;
- transcriptions complètes ;
- historique complet et recherche avancée ;
- automatisations de modération et de dossiers.

Le gratuit reste volontairement simple. Le Premium apportera surtout du confort, du volume et des outils de gestion pour les grosses communautés.

## Installation rapide

1. Invite Sentinel avec le lien officiel.
2. Vérifie que le badge `Bot` apparaît bien dans les intégrations Discord.
3. Choisis la langue du serveur avec `/config-langue` ou `/language`.
4. Configure le rôle de service avec `/config-role`.
5. Configure le salon de logs avec `/config-logs`.
6. Ajoute les rôles autorisés avec `/config-permissions`.
7. Publie le panneau de service avec `/service-panel`.
8. Publie le panneau de dossiers avec `/dossier-panel` si tu veux utiliser les tickets.

Le rôle Discord de Sentinel doit être placé au-dessus des rôles qu'il doit gérer ou modérer.

## Commandes principales

| Français | English | Utilité |
| --- | --- | --- |
| `/aide` | `/help` | Guide intégré du bot |
| `/config-langue` | `/language` | Choisir la langue du serveur |
| `/config-role` | `/config-role` | Définir le rôle de service |
| `/config-logs` | `/config-channel` | Définir le salon de logs |
| `/config-voir` | `/config-view` | Voir la configuration actuelle |
| `/config-permissions` | `/config-permissions` | Gérer les rôles autorisés |
| `/mes-heures` | `/my-hours` | Voir ses heures |
| `/en-service` | `/on-duty` | Voir les agents en service |
| `/top-service` | `/top-service` | Voir le classement global |
| `/reset-heures` | `/reset-hours` | Remettre les heures d'une personne à zéro |
| `/avertir` | `/warn` | Ajouter un avertissement |
| `/timeout` | `/timeout` | Mettre un membre en timeout |
| `/expulser` | `/kick` | Expulser un membre |
| `/bannir` | `/ban` | Bannir un membre ou un ID Discord |
| `/purge` | `/clear` | Supprimer des messages récents |
| `/sanctions` | `/mod-cases` | Voir les sanctions récentes |
| `/embed` | `/embed` | Gérer les annonces Sentinel |
| `/dossier-panel` | `/ticket-panel` | Publier le panneau de tickets |

La liste complète et les explications détaillées sont disponibles sur le site.

## Configuration locale

Copie `.env.example` vers `.env` en local, ou configure les variables dans ton hébergeur :

```env
TOKEN=
CLIENT_ID=
CLIENT_SECRET=
DASHBOARD_URL=
DATABASE_PATH=./database/service.db
```

Ne publie jamais `.env`.

## Développement

```bash
npm install
npm run check
npm run deploy:commands
npm start
```

Les fichiers de base de données, les logs et les sauvegardes locales sont ignorés par Git.

## Sécurité et données

Sentinel ne lit pas les messages privés, ne collecte pas les mots de passe, ne collecte pas les informations de paiement et ne vend aucune donnée.

Les données nécessaires au fonctionnement sont décrites dans la Politique de confidentialité : identifiants Discord, configuration serveur, temps de service, sanctions, dossiers, annonces, sessions dashboard et journal d'audit.

## English

Sentinel is a bilingual Discord bot for duty tracking, moderation, private tickets and web dashboard management.

Useful links:

- Website: https://phileaszer.github.io/bot-service-discord/
- Dashboard: https://bot-service-discord-production.up.railway.app/dashboard
- Invite Sentinel: https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands
- Support server: https://discord.gg/jzPqcUdVns
- Terms of Service: https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md
- Privacy Policy: https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md

Main features:

- duty panel, personal hours, active staff and leaderboards;
- moderation commands: warn, timeout, kick, ban by ID, clear and cases;
- private tickets, called Sentinel dossiers in the French interface;
- announcement embeds;
- web dashboard;
- per-server language selection;
- SQLite storage with `better-sqlite3`.

For setup, invite Sentinel, choose the server language, configure the duty role, configure the log channel, add authorized roles, then publish the duty panel or the ticket panel.

Never publish `.env` or any Discord token.
