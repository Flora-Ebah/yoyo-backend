import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { fraudAlertService } from '../modules/fraud-alert/fraud-alert.service';

const LOCATION = 'FraudScanCron';

/** Chaque jour à 6 h (Abidjan) : contrôle des volumes de réductions (Excel CMS n°3). */
const fraudScanJob = new CronJob('0 6 * * *', async () => {
	try {
		const result = await fraudAlertService.scanVolumes();
		LoggerService.log({
			type: LogLevel.Info,
			content: `Alertes volumes : ${result.clients} client(s), ${result.boutiques} boutique(s)`,
			location: LOCATION,
			method: 'fraudScanJob'
		});
	} catch (error) {
		LoggerService.log({ type: LogLevel.Error, content: error, location: LOCATION, method: 'fraudScanJob' });
	}
});

export const startFraudScanCron = () => {
	fraudScanJob.start();
	console.log('[CRON] Job de contrôle anti-fraude programmé');
};

export const stopFraudScanCron = () => fraudScanJob.stop();
