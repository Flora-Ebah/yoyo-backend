import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { referralService } from '../modules/referral/referral.service';

/**
 * Relance hebdomadaire (mardi 11 h) des parrains arrêtés à mi-chemin (Excel Parrainage n°12).
 * `ReferralService.nudgeStalled` limite déjà à une relance par semaine et deux au total.
 */
const referralNudgeJob = new CronJob('0 11 * * 2', async () => {
  try {
    const sent = await referralService.nudgeStalled();
    console.log(`[CRON] ${sent} relance(s) de parrainage envoyée(s)`);
  } catch (error) {
    LoggerService.log({ type: LogLevel.Error, content: error, location: 'ReferralNudgeCron', method: 'referralNudgeJob' });
  }
});

export const startReferralNudgeCron = () => {
  referralNudgeJob.start();
  console.log('[CRON] Job de relance du parrainage programmé');
};

export const stopReferralNudgeCron = () => {
  referralNudgeJob.stop();
};
