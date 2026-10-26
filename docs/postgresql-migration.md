# Préparation PostgreSQL de Sentinel

Sentinel reste volontairement sur SQLite tant qu'une seule instance écrit dans la base. Le passage à PostgreSQL devient pertinent avant l'activation de plusieurs réplicas Railway ou lorsque les écritures concurrentes deviennent fréquentes.

## Garde-fous déjà prêts

- Toutes les données fonctionnelles possèdent des identifiants de serveur explicites.
- Les tâches planifiées utilisent des baux et des clés d'idempotence.
- `npm run audit:database-portability` inventorie les syntaxes SQLite à convertir.
- La sauvegarde SQLite reste obligatoire jusqu'à la validation complète de la migration.

## Ordre de migration

1. Ajouter un adaptateur PostgreSQL avec des méthodes `run`, `get`, `all` et `transaction` testées.
2. Convertir les migrations de schéma et les expressions de date.
3. Remplacer `lastInsertRowid` par `RETURNING` et `INSERT OR IGNORE` par `ON CONFLICT`.
4. Importer une copie anonymisée dans une base de préproduction.
5. Comparer les comptes, durées, tickets, sanctions et archives entre les deux moteurs.
6. Exécuter un déploiement en lecture double avant la bascule d'écriture.
7. Conserver la base SQLite d'origine en lecture seule pendant la période de retour arrière.

La bascule ne doit jamais être automatique tant que le rapport de portabilité contient des points à traiter.
