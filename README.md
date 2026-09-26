# Sentinel

Sentinel est un bot Discord bilingue pensé pour les communautés, les serveurs RP et les équipes staff qui veulent gérer leurs prises de service, leur modération et leurs demandes depuis un même endroit.

## Liens utiles

- Site public : https://phileaszer.github.io/bot-service-discord/
- Statut Sentinel : https://phileaszer.github.io/bot-service-discord/statut.html
- Dashboard : https://bot-service-discord-production.up.railway.app/dashboard
- Inviter Sentinel : https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands
- Serveur support : https://discord.gg/jzPqcUdVns
- Conditions d'utilisation : https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md
- Politique de confidentialité : https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md

## Ce que fait Sentinel

- Suivi des services : prise et fin de service, temps total, historique personnel, agents en service et classements.
- Paie RP hebdomadaire : montant par heure, calcul estimé, suivi payé/non payé, archives consultables et journal des règlements depuis le dashboard.
- Modération : rôle automatique à l'arrivée, avertissements, timeout, expulsion, ban par ID, purge et consultation des sanctions.
- Dossiers Sentinel : système de tickets privés pour le support, les signalements, les recrutements, les partenariats et les autres demandes.
- Annonces : création et modification d'embeds publiés sous l'identité de Sentinel.
- Dashboard : configuration du serveur, actions rapides, audit, suivi des services, sanctions, dossiers et annonces.
- Langues : français et anglais, avec un choix propre à chaque serveur.

## Version gratuite

Sentinel Gratuit reste utilisable sans abonnement :

- panneau de service ;
- heures personnelles ;
- historique personnel limité ;
- classement global limité au top 10 ;
- paie RP hebdomadaire avec suivi payé/non payé ;
- modération essentielle ;
- rôle automatique à l'arrivée des membres ;
- consultation simple des sanctions ;
- 2 embeds actifs, modifiables sans limite ;
- 1 panneau de dossiers ;
- 5 dossiers ouverts en même temps ;
- 10 derniers dossiers visibles ;
- rôles responsables capables de prendre en charge, corriger le statut, archiver et clôturer un ticket.

## Premium prévu

Sentinel Premium est préparé pour les serveurs qui ont besoin d'une gestion plus avancée :

- statistiques mensuelles et annuelles ;
- rapports et exports de paie RP ;
- taux de paie par rôle, primes, retenues et corrections ;
- exports CSV, Excel ou PDF ;
- rapports automatiques ;
- accès illimité aux embeds ;
- panneaux de dossiers illimités ;
- catégories et formulaires personnalisés ;
- priorités, templates et branding des dossiers ;
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
6. Ajoute un salon statut optionnel avec `/config-statut`.
7. Ajoute les rôles autorisés avec `/config-permissions`.
8. Publie le panneau de service avec `!service-panel`.
9. Publie le panneau de dossiers avec `/dossier-panel` si tu veux utiliser les tickets.

Le rôle Discord de Sentinel doit être placé au-dessus des rôles qu'il doit gérer ou modérer.

## Commandes principales

| Français | English | Utilité |
| --- | --- | --- |
| `/aide` | `/help` | Guide intégré du bot |
| `/config-langue` | `/language` | Choisir la langue du serveur |
| `/config-role` | `/config-role` | Définir le rôle de service |
| `/config-autorole` | `/autorole-config` | Définir le rôle automatique d'arrivée |
| `/config-logs` | `/config-channel` | Définir le salon de logs |
| `/config-statut` | `/status-channel` | Publier le statut du bot et activer les nouveautés officielles |
| `/config-paie` | `/payroll-config` | Définir le montant horaire global de la paie RP |
| `/config-voir` | `/config-view` | Voir la configuration actuelle |
| `/config-permissions` | `/config-permissions` | Gérer les rôles autorisés |
| `/dashboard` | `/dashboard` | Ouvrir le dashboard web |
| `/premium` | `/premium` | Voir l'objectif avant l'ouverture Premium |
| `/support` | `/support` | Obtenir les liens officiels et le serveur support |
| `/mes-heures` | `/my-hours` | Voir ses heures |
| `/en-service` | `/on-duty` | Voir les agents en service |
| `/top-service` | `/top-service` | Voir le classement global |
| `/paie-semaine` | `/weekly-payroll` | Voir la paie RP de la semaine |
| `/paie-historique` | `/payroll-history` | Retrouver les archives et le suivi des anciennes paies RP |
| `/paie-archive` | `/payroll-archive` | Archiver la paie RP de la semaine |
| `/reset-heures` | `/reset-hours` | Remettre les heures d'une personne à zéro |
| `/avertir` | `/warn` | Ajouter un avertissement |
| `/timeout` | `/timeout` | Mettre un membre en timeout |
| `/expulser` | `/kick` | Expulser un membre |
| `/bannir` | `/ban` | Bannir un membre ou un ID Discord |
| `/purge` | `/clear` | Supprimer des messages récents |
| `/sanctions` | `/mod-cases` | Voir les sanctions récentes |
| `/embed` | `/embed` | Gérer les annonces Sentinel |
| `/dossier-panel` | `/ticket-panel` | Publier le panneau de tickets |
| `/paie-ajustement` | `/payroll-adjustment` | Premium : ajouter une prime, une retenue ou une correction |

La liste complète et les explications détaillées sont disponibles sur le site.

## Stockage et sauvegardes

Sentinel conserve sans expiration les archives de paie, les heures de service, les dossiers et les sanctions. Les sessions web expirées sont nettoyées automatiquement. Avant de quitter la base active, les anciens journaux d'auto-modération et de régie sont écrits dans des archives `jsonl.gz`, validés puis restent téléchargeables par le fondateur.

La base SQLite utilise WAL, des checkpoints et un entretien progressif. Les sauvegardes sont compressées en `.db.gz` et suivent trois générations par défaut : 7 quotidiennes, 8 hebdomadaires et 12 mensuelles, dans une enveloppe de 96 Mo. Chaque nouvelle copie est restaurée dans une base temporaire et soumise à `PRAGMA integrity_check`. Un redéploiement rapproché ne crée pas de copie identique supplémentaire et les anciennes sauvegardes `.db` sont converties automatiquement.

La Console fondateur contient le Centre de maintenance : capacité du volume, répartition de la base, alertes à 60 %, 75 % et 90 %, croissance anormale, suivi SQLite/site/Discord, copies protégées, archives froides et registre des médias d'embeds. Les images importées sont validées, redimensionnées et converties en WebP, puis dédupliquées par SHA-256. Une référence orpheline passe 30 jours en corbeille avant suppression locale ou distante. Les téléchargements, contrôles manuels et restaurations sont autorisés côté serveur uniquement au fondateur avec une session Discord récente. Une restauration crée d'abord une copie de sécurité vérifiée puis est appliquée au redémarrage.

Le stockage des images accepte tout service compatible S3, notamment Cloudflare R2. Active `SENTINEL_OBJECT_STORAGE_ENABLED`, renseigne le bucket, les identifiants, l'endpoint et une URL publique HTTPS dans les variables d'environnement. Le jeton doit être limité à la lecture, l'écriture et la suppression des objets du bucket média, idéalement sous le préfixe `sentinel/embeds/`, sans droit d'administration du compte. Les clés sont uniquement lues côté serveur. Si le service distant est absent, lent ou temporairement indisponible, Sentinel conserve le chemin Discord/local existant pour que l'envoi reste possible. Les quotas par serveur sont de 32 Mo en gratuit et 512 Mo en Premium par défaut, réglables avec `EMBED_MEDIA_FREE_QUOTA_MB` et `EMBED_MEDIA_PREMIUM_QUOTA_MB`.

- `npm run backup:db` crée une sauvegarde manuelle compressée et vérifie la politique de rétention.
- `npm run restore:db` liste les sauvegardes `.db` et `.db.gz` disponibles.
- `npm run restore:db -- <fichier.db.gz>` vérifie l'intégrité SQLite avant de restaurer la base et crée d'abord une copie de sécurité compressée.

Les limites et durées sont configurables avec les variables `DATABASE_BACKUP_*`, `DATABASE_AUTOMOD_RETENTION_DAYS`, `DATABASE_AUDIT_RETENTION_DAYS`, `DATABASE_SLOW_QUERY_MS`, `EMBED_MEDIA_*`, `SENTINEL_OBJECT_STORAGE_*` et `DATABASE_INCREMENTAL_VACUUM_ENABLED` décrites dans `.env.example`.

## Sécurité et données

Sentinel ne lit pas les messages privés, ne collecte pas les mots de passe, ne collecte pas les informations de paiement et ne vend aucune donnée.

Les données nécessaires au fonctionnement sont décrites dans la Politique de confidentialité : identifiants Discord, configuration serveur, temps de service, sanctions, dossiers, annonces, sessions dashboard et journal d'audit.

Les informations d'exploitation du bot restent privées. Les fichiers de configuration, données internes, logs et sauvegardes locales ne doivent jamais être publiés.

Le dashboard applique une autorisation côté serveur à chaque requête. L'accès staff exige à la fois une autorisation donnée par le fondateur dans la Régie et un rôle staff configuré sur le serveur Discord Sentinel. Il donne une vue de régie, mais ne donne ni le rôle fondateur ni les permissions d'administration d'un serveur Discord. Toute action sur un serveur exige aussi que la personne soit membre du serveur concerné et possède les permissions Discord ou le rôle Sentinel attendu.

Les changements de grade staff et d'accès Premium sont réservés au compte fondateur, exigent une connexion Discord récente et sont inscrits dans le journal d'audit. Retirer le grade staff révoque immédiatement toutes les sessions dashboard de la personne.

## Licence

Sentinel est un projet propriétaire. Le dépôt est consultable publiquement pour présenter le bot et suivre son évolution, mais le code ne peut pas être copié, redistribué ou réutilisé sans autorisation préalable.

## English

Sentinel is a bilingual Discord bot for duty tracking, moderation, private tickets and web dashboard management.

Useful links:

- Website: https://phileaszer.github.io/bot-service-discord/
- Sentinel status: https://phileaszer.github.io/bot-service-discord/statut.html
- Dashboard: https://bot-service-discord-production.up.railway.app/dashboard
- Invite Sentinel: https://discord.com/oauth2/authorize?client_id=1511426423376842922&permissions=1099780189206&integration_type=0&scope=bot+applications.commands
- Support server: https://discord.gg/jzPqcUdVns
- Terms of Service: https://github.com/phileaszer/bot-service-discord/blob/master/TERMS_OF_SERVICE.md
- Privacy Policy: https://github.com/phileaszer/bot-service-discord/blob/master/PRIVACY_POLICY.md

Main features:

- duty panel, personal hours, active staff and leaderboards;
- weekly RP payroll with estimated amounts and paid/unpaid tracking;
- moderation commands: join auto-role, warn, timeout, kick, ban by ID, clear and cases;
- private tickets, called Sentinel dossiers in the French interface;
- announcement embeds, with unlimited access planned for Premium;
- web dashboard;
- per-server language selection;

For setup, invite Sentinel, choose the server language, configure the duty role, configure the log channel, add authorized roles, then publish the duty panel or the ticket panel. Ticket responsible roles can be configured from the dashboard.

This repository is public for presentation and project tracking. The code is not released under an open-source license: copying, redistributing or reusing the bot requires prior permission.

Never publish `.env` or any Discord token.
