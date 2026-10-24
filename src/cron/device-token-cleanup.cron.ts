import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { DeviceTokenService, DEVICE_TOKEN_TTL_DAYS } from '../modules/device-token/device-token.service';

/**
 * Purge hebdomadaire (lundi 3 h) des jetons push d'appareils qui ne se sont plus manifestés depuis
 * `DEVICE_TOKEN_TTL_DAYS` jours : l'appli rafraîchit son jeton à chaque ouverture, un jeton
 * aussi ancien appartient à un appareil abandonné. Les jetons rejetés par FCM sont, eux, supprimés
 * dès l'envoi.
 */
const deviceTokenCleanupJob = new CronJob('0 3 * * 1', async () => {
  try {
    const removed = await new DeviceTokenService().purgeStale();
    console.log(`[CRON] ${removed} jeton(s) push inactif(s) depuis ${DEVICE_TOKEN_TTL_DAYS} jours supprimé(s)`);
  } catch (error) {
    LoggerService.log({
      type: LogLevel.Error,
      content: error,
      location: 'DeviceTokenCleanupCron',
      method: 'deviceTokenCleanupJob'
    });
  }
});

export const startDeviceTokenCleanupCron = () => {
  deviceTokenCleanupJob.start();
  console.log('[CRON] Job de purge des jetons push programmé');
};

export const stopDeviceTokenCleanupCron = () => {
  deviceTokenCleanupJob.stop();
};
