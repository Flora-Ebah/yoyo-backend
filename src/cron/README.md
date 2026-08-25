# Système de Cron pour les Abonnements

Ce dossier contient les tâches cron automatisées pour la gestion des abonnements.

## Fichiers

### `subscription-renewal.cron.ts`
Gère l'activation automatique des renouvellements d'abonnements programmés.

**Fonctionnalités :**
- ✅ Vérification toutes les heures des abonnements avec renouvellement en attente
- ✅ Activation automatique des renouvellements à la date d'expiration
- ✅ Nettoyage quotidien des renouvellements expirés (plus de 30 jours)
- ✅ Logging complet des opérations

**Horaires d'exécution :**
- **Vérification des renouvellements :** Toutes les heures (`0 * * * *`)
- **Nettoyage :** Tous les jours à 2h du matin (`0 2 * * *`)

## Scripts de Test

### `test-subscription-cron.js`
Script de test pour vérifier le fonctionnement du système de cron.

```bash
node src/scripts/test-subscription-cron.js
```

### `run-subscription-cron.js`
Script pour exécuter manuellement la vérification des renouvellements.

```bash
node src/scripts/run-subscription-cron.js
```

## Fonctionnement

### 1. Programmation d'un Renouvellement
1. L'utilisateur programme un renouvellement via l'API
2. Les informations sont stockées dans `pendingRenewal`
3. L'abonnement actuel continue jusqu'à sa fin

### 2. Activation Automatique
1. Le cron vérifie toutes les heures
2. Si un abonnement est expiré ET a un renouvellement en attente
3. Le nouveau plan s'active automatiquement
4. L'ancien renouvellement est supprimé

### 3. Nettoyage
1. Le cron nettoie quotidiennement
2. Supprime les renouvellements en attente de plus de 30 jours
3. Évite l'accumulation de données obsolètes

## Logs

Toutes les opérations sont loggées avec :
- Timestamp
- Type d'opération
- ID de l'abonnement
- Résultat (succès/erreur)

## Configuration

Le cron est automatiquement démarré avec l'application dans `main.ts` :

```typescript
import { startSubscriptionRenewalCron } from './cron/subscription-renewal.cron';

// Dans initPayloads()
startSubscriptionRenewalCron();
```

## Monitoring

Pour surveiller le fonctionnement :
1. Vérifiez les logs de l'application
2. Utilisez les scripts de test
3. Surveillez la base de données pour les `pendingRenewal`

## Dépannage

### Le cron ne s'exécute pas
- Vérifiez que l'application est démarrée
- Vérifiez les logs d'erreur
- Testez avec le script manuel

### Les renouvellements ne s'activent pas
- Vérifiez que les abonnements sont expirés
- Vérifiez que `pendingRenewal` existe
- Vérifiez les logs d'erreur

### Performance
- Le cron traite les abonnements un par un
- Les erreurs n'arrêtent pas le traitement des autres
- Les logs permettent de tracer les problèmes
