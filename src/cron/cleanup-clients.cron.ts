import { CronJob } from 'cron';
import { ClientService } from '../modules/client';

const service = new ClientService();

// Tous les jours à minuit : anonymisation (DCP/RGPD) des comptes supprimés dont le délai de
// grâce est écoulé. Le délai (jours) est paramétrable depuis le CMS (module Settings).
const cleanupJob = new CronJob('0 0 * * *', async () => {
    try {
        console.log('[CRON] Anonymisation des comptes supprimés inactifs…');
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
