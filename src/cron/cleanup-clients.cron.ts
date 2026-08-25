import { CronJob } from 'cron';
// import { ClientService } from '../modules/client';

// const service = new ClientService();

// Run every day at midnight
const cleanupJob = new CronJob('0 0 * * *', async () => {
    try {
        console.log('[CRON] Starting cleanup of removed inactive clients...');
        // await service.cleanupRemovedClients();
        console.log('[CRON] Cleanup completed successfully');
    } catch (error) {
        console.error('[CRON] Error during cleanup:', error);
    }
});

export const startCleanupCron = () => {
    cleanupJob.start();
    console.log('[CRON] Cleanup job scheduled');
};
