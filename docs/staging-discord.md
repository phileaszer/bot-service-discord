# Serveur Discord de préproduction Sentinel

La validation réelle doit utiliser un serveur privé distinct des communautés actives. Les deux comptes de test ne doivent appartenir à aucun membre réel.

## Ressources nécessaires

- Un serveur Discord privé où Sentinel possède les permissions de gestion.
- Un compte de test présent et modérable pour le contrôle du timeout.
- Un second compte de test absent du serveur pour le contrôle bannissement puis débannissement.
- Le rôle Sentinel placé au-dessus du rôle temporaire créé pendant le test.

## Variables Railway

```text
SENTINEL_STAGING_GUILD_ID=<serveur privé>
SENTINEL_STAGING_MEMBER_ID=<compte de timeout>
SENTINEL_STAGING_BAN_TARGET_ID=<compte de bannissement>
SENTINEL_STAGING_REAL_ACTIONS=true
SENTINEL_STAGING_VALIDATION_REQUIRED=true
```

Exécuter `npm run audit:staging` avant tout déploiement. Lorsque la validation bloquante est active, Sentinel refuse sa mise en service si une permission, une création de salon, une recréation, un timeout, un bannissement ou un nettoyage échoue.

Ne jamais renseigner le compte de la fondatrice, d'un membre actif ou du propriétaire du serveur comme compte de test.
