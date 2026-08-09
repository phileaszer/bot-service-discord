# Sauvegarde et restauration SQLite

Sentinel crée des sauvegardes SQLite automatiques au démarrage, puis selon l’intervalle configuré par l’hébergeur.

## Voir les sauvegardes disponibles

```bash
npm run restore:db
```

La commande affiche les sauvegardes présentes dans le dossier configuré.

## Restaurer une sauvegarde

1. Coupe temporairement le bot sur l’hébergeur.
2. Choisis une sauvegarde dans la liste.
3. Lance la restauration avec le nom exact du fichier :

```bash
npm run restore:db -- service-auto-YYYY-MM-DDTHH-MM-SS-000Z.db
```

L’outil crée d’abord une copie de sécurité de la base actuelle, puis remplace `service.db` par la sauvegarde choisie.

## Après restauration

Redémarre Sentinel, puis vérifie :

```bash
npm run check
```

Sur Discord, lance aussi `/ping`, `/config-voir` et `/diagnostic` sur le serveur concerné.
