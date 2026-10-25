import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { NotificationHelper } from '../helpers/notification.helper';
import { NotificationCategory } from '../services/notification/notification.interface';
import { SupportTicketSet } from '../modules/support/support.model';
import { SUPPORT_AGENTS_ROOM } from '../modules/support/support.service';
import { getSocketIO } from '../main';

const LOCATION = 'SupportSlaCron';

/**
 * Admins qui traitent le support : profil avec la permission `support` (ou super-admin).
 * Destinataires d'une alerte de retard quand le ticket n'est attribué à personne.
 */
async function supportAgentIds(): Promise<string[]> {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const mongoose = require('mongoose');
	const profiles = await mongoose.model('Profile').find(
		{
			status: { $ne: 'removed' },
			$or: [{ 'ability.subject': 'support' }, { 'ability.subject': 'all', 'ability.action': 'manage' }]
		},
		{ _id: 1 }
	);
	if (profiles.length === 0) return [];
	const admins = await mongoose
		.model('Admin')
		.find({ profile: { $in: profiles.map((p: any) => p._id) }, status: 'active' }, { _id: 1 });
	return admins.map((a: any) => String(a._id));
}

/**
 * Alerte une seule fois par échéance dépassée : `field` (date d'alerte) est posé de façon atomique
 * avant l'envoi, donc deux exécutions qui se chevauchent n'alertent pas deux fois.
 */
async function alertOverdue(kind: 'first' | 'resolution', now: Date, agents: () => Promise<string[]>): Promise<number> {
	const model: any = (new SupportTicketSet() as any).defaultModel;
	const field = kind === 'first' ? 'slaAlertedAt' : 'resolutionAlertedAt';
	const due =
		kind === 'first'
			? { firstResponseAt: null, firstResponseDueAt: { $lt: now } }
			: { resolutionDueAt: { $lt: now } };

	let count = 0;
	// Au plus 200 alertes par passage : le reste part au passage suivant.
	for (let i = 0; i < 200; i++) {
		const ticket = await model.findOneAndUpdate(
			{ status: { $ne: 'resolved' }, [field]: null, ...due },
			{ $set: { [field]: now } },
			{ new: true, lean: true }
		);
		if (!ticket) break;
		count++;

		const label = kind === 'first' ? 'sans première réponse' : 'non résolue';
		const recipients = ticket.assignedTo ? [String(ticket.assignedTo)] : await agents();
		for (const to of recipients) {
			await NotificationHelper.notifyAdminInApp({
				to,
				title: `Ticket ${ticket.reference} en retard`,
				message: `Demande ${ticket.source === 'pro' ? 'marchand' : 'client'} ${label} dans le délai prévu.`,
				category: NotificationCategory.WARNING,
				metadata: { type: 'support-sla', ticketId: String(ticket._id), reference: ticket.reference }
			});
		}

		try {
			getSocketIO()
				?.getIo()
				?.to(SUPPORT_AGENTS_ROOM)
				.emit('support:sla', { ticketId: String(ticket._id), reference: ticket.reference, kind });
		} catch {
			/* temps réel au mieux : la cloche et la liste suffisent */
		}
	}
	return count;
}

/**
 * Délais de réponse du support (Excel CMS n°5, décision Support n°8). Toutes les 15 minutes :
 * prévient l'agent assigné (sinon les agents du support) quand un ticket dépasse son échéance
 * de 1re réponse ou de résolution. Les échéances sont fixées à la création du ticket.
 */
const supportSlaJob = new CronJob('*/15 * * * *', async () => {
	try {
		const now = new Date();
		let cached: string[] | null = null;
		const agents = async () => (cached ??= await supportAgentIds());
		const first = await alertOverdue('first', now, agents);
		const resolution = await alertOverdue('resolution', now, agents);
		if (first + resolution > 0) {
			LoggerService.log({
				type: LogLevel.Info,
				content: `Tickets en retard signalés : ${first} sans 1re réponse, ${resolution} non résolus`,
				location: LOCATION,
				method: 'supportSlaJob'
			});
		}
	} catch (error) {
		LoggerService.log({ type: LogLevel.Error, content: error, location: LOCATION, method: 'supportSlaJob' });
	}
});

export const runSupportSlaCheck = () => (supportSlaJob as any).fireOnTick();

export const startSupportSlaCron = () => {
	supportSlaJob.start();
	console.log('[CRON] Job des délais du support programmé');
};

export const stopSupportSlaCron = () => supportSlaJob.stop();

export { alertOverdue as _alertOverdue };
