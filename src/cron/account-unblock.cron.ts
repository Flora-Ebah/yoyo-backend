import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { accountBlockService } from '../modules/account-block/account-block.service';

const LOCATION = 'AccountUnblockCron';

/** Toutes les heures : fin automatique des blocages temporaires arrivés à échéance (Excel CMS n°2). */
const accountUnblockJob = new CronJob('5 * * * *', async () => {
	try {
		const count = await accountBlockService.expireBlocks();
		if (count > 0) {
			LoggerService.log({
				type: LogLevel.Info,
				content: `Comptes débloqués automatiquement : ${count}`,
				location: LOCATION,
				method: 'accountUnblockJob'
			});
		}
	} catch (error) {
		LoggerService.log({ type: LogLevel.Error, content: error, location: LOCATION, method: 'accountUnblockJob' });
	}
});

export const startAccountUnblockCron = () => {
	accountUnblockJob.start();
	console.log('[CRON] Job de fin des blocages de comptes programmé');
};

export const stopAccountUnblockCron = () => accountUnblockJob.stop();
