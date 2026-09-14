import { CronJob } from 'cron';
import { ClientService } from '../modules/client';

// Tous les jours à minuit : anonymisation (DCP/RGPD) des comptes supprimés dont le délai de
// grâce est écoulé. Le délai (jours) est paramétrable depuis le CMS (module Settings).
const cleanupJob = new CronJob('0 0 * * *', async () => {
    try {
        console.log('[CRON] Anonymisation des comptes supprimés inactifs…');

        // Initialiser le service dans le job pour éviter les problèmes de chargement : ce module
        // est importé par `main.ts`, lui-même au milieu d'un cycle d'imports
        // (main → cron → modules/client → … → services/notification → push.service → main).
        // Instancié au chargement du module, `ClientService` pouvait ne pas être encore défini —
        // ce qui rendait tout import de service impossible hors du point d'entrée `main.ts`.
        // Même patron que `subscription-renewal.cron.ts`.
        const service = new ClientService();

        const { anonymized } = await service.cleanupRemovedClients();
        console.log(`[CRON] Anonymisation terminée : ${anonymized} compte(s) traité(s)`);
    } catch (error) {
        console.error('[CRON] Erreur pendant l’anonymisation :', error);
    }
});

export const startCleanupCron = () => {
    cleanupJob.start();
    console.log('[CRON] Tâche d’anonymisation planifiée (quotidienne)');
};
