import { CronJob } from 'cron';
import { SubscriptionService } from '../modules/subscription/subscription.service';
import { LoggerService, LogLevel } from 'coddyger';

/**
 * Job de cron pour activer les renouvellements d'abonnements programmés
 * S'exécute toutes les heures pour vérifier les abonnements qui arrivent à expiration
 */
const subscriptionRenewalJob = new CronJob('0 * * * *', async () => {
    try {
        console.log('[CRON] Vérification des renouvellements d\'abonnements...');
        
        // Initialiser le service dans le job pour éviter les problèmes de chargement
        const subscriptionService = new SubscriptionService();
        
        // Récupérer tous les abonnements avec un renouvellement en attente
        const subscriptionsWithPendingRenewal = await subscriptionService.getSubscriptionsWithPendingRenewal();
        
        if (!subscriptionsWithPendingRenewal || subscriptionsWithPendingRenewal.length === 0) {
            console.log('[CRON] Aucun renouvellement en attente trouvé');
            return;
        }

        console.log(`[CRON] ${subscriptionsWithPendingRenewal.length} renouvellement(s) en attente trouvé(s)`);

        // Traiter chaque abonnement
        for (const subscription of subscriptionsWithPendingRenewal) {
            try {
                // Vérifier si l'abonnement actuel est expiré
                const now = new Date();
                const endDate = new Date(subscription.endDate);
                
                if (now >= endDate) {
                    console.log(`[CRON] Activation du renouvellement pour l'abonnement ${subscription._id}`);
                    
                    // Activer le renouvellement
                    const result = await subscriptionService.activatePendingRenewal(subscription._id!);
                    
                    if (result.success) {
                        console.log(`[CRON] Renouvellement activé avec succès pour l'abonnement ${subscription._id}`);
                        
                        // Logger l'activation
                        LoggerService.log({
                            type: LogLevel.Info,
                            content: `Renouvellement automatique activé pour l'abonnement ${subscription._id}`,
                            location: 'SubscriptionRenewalCron',
                            method: 'subscriptionRenewalJob'
                        });
                    } else {
                        console.error(`[CRON] Erreur lors de l'activation du renouvellement pour l'abonnement ${subscription._id}:`, result.message);
                    }
                } else {
                    console.log(`[CRON] L'abonnement ${subscription._id} n'est pas encore expiré (fin: ${endDate.toISOString()})`);
                }
            } catch (error) {
                console.error(`[CRON] Erreur lors du traitement de l'abonnement ${subscription._id}:`, error);
            }
        }

        console.log('[CRON] Vérification des renouvellements terminée');
    } catch (error) {
        console.error('[CRON] Erreur lors de la vérification des renouvellements:', error);
        
        LoggerService.log({
            type: LogLevel.Error,
            content: error,
            location: 'SubscriptionRenewalCron',
            method: 'subscriptionRenewalJob'
        });
    }
});

/**
 * Job de cron pour nettoyer les renouvellements en attente expirés
 * S'exécute une fois par jour à 2h du matin
 */
const cleanupPendingRenewalsJob = new CronJob('0 2 * * *', async () => {
    try {
        console.log('[CRON] Nettoyage des renouvellements en attente expirés...');
        
        // Initialiser le service dans le job pour éviter les problèmes de chargement
        const subscriptionService = new SubscriptionService();
        
        // Récupérer les renouvellements en attente créés il y a plus de 30 jours
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const expiredPendingRenewals = await subscriptionService.getExpiredPendingRenewals(thirtyDaysAgo);
        
        if (expiredPendingRenewals && expiredPendingRenewals.length > 0) {
            console.log(`[CRON] ${expiredPendingRenewals.length} renouvellement(s) expiré(s) trouvé(s)`);
            
            for (const subscription of expiredPendingRenewals) {
                try {
                    // Supprimer le renouvellement en attente
                    await subscriptionService.cancelPendingRenewal(subscription._id!);
                    console.log(`[CRON] Renouvellement en attente supprimé pour l'abonnement ${subscription._id}`);
                } catch (error) {
                    console.error(`[CRON] Erreur lors de la suppression du renouvellement pour l'abonnement ${subscription._id}:`, error);
                }
            }
        } else {
            console.log('[CRON] Aucun renouvellement expiré trouvé');
        }

        console.log('[CRON] Nettoyage des renouvellements terminé');
    } catch (error) {
        console.error('[CRON] Erreur lors du nettoyage des renouvellements:', error);
    }
});

export const startSubscriptionRenewalCron = () => {
    subscriptionRenewalJob.start();
    cleanupPendingRenewalsJob.start();
    console.log('[CRON] Jobs de renouvellement d\'abonnements programmés');
};

export const stopSubscriptionRenewalCron = () => {
    subscriptionRenewalJob.stop();
    cleanupPendingRenewalsJob.stop();
    console.log('[CRON] Jobs de renouvellement d\'abonnements arrêtés');
};
