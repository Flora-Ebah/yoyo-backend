import mongoose from 'mongoose';
import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { FraudAlertSet, FraudAlertAction, FraudAlertType, FRAUD_ALERT_TYPES, IFraudAlert } from './fraud-alert.model';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';

type Result = { status: number; message: any; data: any };

const serviceLabel = 'FraudAlertService';
const DAY_MS = 24 * 3600 * 1000;

const TYPE_LABEL: Record<FraudAlertType, string> = {
	'multi-account-device': 'Plusieurs comptes sur un même appareil',
	'flagged-scan': 'Réduction au montant inhabituel',
	'scan-velocity': 'Trop de réductions en 24 h',
	'boutique-spike': 'Pic de réductions dans une boutique'
};

const ACTION_LABEL: Record<FraudAlertAction, string> = {
	dismiss: 'Alerte ignorée.',
	blocked: 'Alerte close : compte bloqué.',
	'invalidate-ticket': 'Ticket invalidé, alerte close.'
};

// Modèles résolus à l'appel : ce service est importé par l'inscription et par `redeem`, on évite
// d'importer leurs modules en retour.
const model = (name: string): any => mongoose.model(name);

/**
 * File d'alertes fraude (Excel CMS n°3). Les détections sont « au mieux » : une erreur est
 * journalisée et n'interrompt jamais l'inscription ou la validation d'une réduction.
 */
export class FraudAlertService {
	private readonly dao = new FraudAlertSet();
	private readonly config = new PlatformConfigService();

	private get alerts(): any {
		return this.dao.defaultModel;
	}

	/**
	 * Ouvre l'alerte, ou met à jour l'alerte déjà ouverte pour la même clé. Les admins `clients`
	 * ne sont prévenus qu'à l'ouverture.
	 */
	async raise(entry: Omit<IFraudAlert, '_id' | 'status' | 'occurrences' | 'lastSeenAt'>, message: string): Promise<void> {
		try {
			const now = new Date();
			const before = await this.alerts.findOneAndUpdate(
				{ type: entry.type, subjectKey: entry.subjectKey, status: 'open' },
				{
					$set: { details: entry.details, clients: entry.clients ?? [], boutique: entry.boutique, payment: entry.payment, lastSeenAt: now },
					$inc: { occurrences: 1 },
					$setOnInsert: { _id: coddyger.string.generateObjectId(), subjectType: entry.subjectType }
				},
				{ upsert: true, new: false }
			);
			if (before) return;
			await NotificationHelper.notifyAdminsWithPermission('clients', {
				title: `Alerte fraude : ${TYPE_LABEL[entry.type]}`,
				message,
				category: NotificationCategory.WARNING,
				metadata: { type: 'fraud-alert', alertType: entry.type }
			});
		} catch (error: any) {
			// Deux détections simultanées : la seconde bute sur l'index unique, l'alerte existe déjà.
			if (error?.code === 11000) return;
			LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'raise' });
		}
	}

	/** Inscription : alerte si l'appareil a déjà servi à créer trop de comptes. */
	async checkDevice(deviceId?: string | null): Promise<void> {
		try {
			const id = String(deviceId ?? '').trim();
			if (!id) return;
			const { accountsPerDevice } = await this.config.getFraudRules();
			const accounts: any[] = await model('Client')
				.find({ signupDeviceId: id, status: { $nin: ['anonymized'] } }, '_id')
				.sort({ createdAt: -1 })
				.limit(50)
				.lean();
			if (accounts.length < accountsPerDevice) return;
			await this.raise(
				{
					type: 'multi-account-device',
					subjectType: 'device',
					subjectKey: id,
					clients: accounts.map((a) => a._id),
					details: { deviceId: id, accounts: accounts.length, threshold: accountsPerDevice }
				},
				`${accounts.length} comptes ont été créés depuis le même appareil.`
			);
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'checkDevice' });
		}
	}

	/** `redeem` : ticket au montant inhabituel pour la boutique. */
	async flaggedScan(ticket: { _id: any; from: any; to: any; amount: number; boutiqueName?: string }): Promise<void> {
		await this.raise(
			{
				type: 'flagged-scan',
				subjectType: 'payment',
				subjectKey: String(ticket._id),
				clients: [ticket.from],
				boutique: ticket.to,
				payment: ticket._id,
				details: { amount: ticket.amount }
			},
			`Achat de ${Number(ticket.amount).toLocaleString('fr-FR')} F chez ${ticket.boutiqueName ?? 'une boutique'}, bien au-dessus de ses montants habituels.`
		);
	}

	/**
	 * Contrôle quotidien des volumes (cron) : clients qui valident trop de réductions sur 24 h,
	 * boutiques dont le volume du jour dépasse nettement leur moyenne sur 30 jours.
	 */
	async scanVolumes(now = new Date()): Promise<{ clients: number; boutiques: number }> {
		const rules = await this.config.getFraudRules();
		const payments = model('Payment');
		const since = new Date(now.getTime() - DAY_MS);
		const monthAgo = new Date(now.getTime() - 31 * DAY_MS);

		const heavy: any[] = await payments.aggregate([
			{ $match: { status: 'success', completedAt: { $gte: since, $lte: now } } },
			{ $group: { _id: '$from', n: { $sum: 1 }, boutiques: { $addToSet: '$to' }, amount: { $sum: '$amount' } } },
			{ $match: { n: { $gte: rules.scansPerDay } } },
			{ $limit: 200 }
		]);
		for (const c of heavy) {
			await this.raise(
				{
					type: 'scan-velocity',
					subjectType: 'client',
					subjectKey: String(c._id),
					clients: [c._id],
					details: { scans: c.n, boutiques: c.boutiques.length, amount: c.amount, threshold: rules.scansPerDay }
				},
				`Un client a validé ${c.n} réductions en 24 h dans ${c.boutiques.length} boutique(s).`
			);
		}

		const spikes: any[] = await payments.aggregate([
			{ $match: { status: 'success', completedAt: { $gte: monthAgo, $lte: now } } },
			{
				$group: {
					_id: '$to',
					today: { $sum: { $cond: [{ $gte: ['$completedAt', since] }, 1, 0] } },
					before: { $sum: { $cond: [{ $lt: ['$completedAt', since] }, 1, 0] } }
				}
			},
			{ $match: { today: { $gte: rules.boutiqueSpikeMin } } }
		]);
		let boutiques = 0;
		for (const b of spikes) {
			const average = b.before / 30;
			if (b.today < rules.boutiqueSpikeFactor * Math.max(average, 1)) continue;
			boutiques++;
			const partner: any = await model('Partner').findOne({ _id: b._id }, 'name').lean();
			await this.raise(
				{
					type: 'boutique-spike',
					subjectType: 'boutique',
					subjectKey: String(b._id),
					boutique: b._id,
					details: { today: b.today, dailyAverage: Math.round(average * 10) / 10, factor: rules.boutiqueSpikeFactor }
				},
				`« ${partner?.name ?? 'Boutique'} » : ${b.today} réductions en 24 h pour ${Math.round(average * 10) / 10} par jour en moyenne.`
			);
		}

		return { clients: heavy.length, boutiques };
	}

	/** Liste admin, comptes et boutique peuplés. */
	async list(payloads: { status?: string; type?: string; page?: number; pageSize?: number }): Promise<Result> {
		const page = Math.max(1, Number(payloads.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(payloads.pageSize) || 20));
		const status = ['open', 'actioned', 'dismissed'].includes(String(payloads.status)) ? String(payloads.status) : 'open';
		const params: any = { status };
		if (FRAUD_ALERT_TYPES.includes(payloads.type as FraudAlertType)) params.type = payloads.type;

		const [rows, totalRows, counts] = await Promise.all([
			this.alerts
				.find(params, '-__v')
				.sort(status === 'open' ? { lastSeenAt: -1 } : { handledAt: -1 })
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.populate('clients', '_id firstname lastname email contact status createdAt')
				.populate('boutique', '_id name status user')
				.populate('payment', '_id amount status completedAt discountPercentage')
				.populate('handledBy', 'firstname lastname email')
				.lean(),
			this.alerts.countDocuments(params),
			this.counts()
		]);

		return {
			status: defines.status.requestOK,
			message: { totalRows, totalPages: Math.ceil(totalRows / pageSize), page, pageSize, counts },
			data: rows
		};
	}

	async counts(): Promise<Record<string, number>> {
		const rows = await this.alerts.aggregate([{ $match: { status: 'open' } }, { $group: { _id: '$type', n: { $sum: 1 } } }]);
		const out: Record<string, number> = { total: 0 };
		for (const t of FRAUD_ALERT_TYPES) out[t] = 0;
		for (const r of rows) {
			out[r._id] = r.n;
			out.total += r.n;
		}
		return out;
	}

	/**
	 * Clôt une alerte. `blocked` : le CMS a bloqué le compte (dialogue du n°2) ;
	 * `invalidate-ticket` : le ticket signalé passe `invalidated`.
	 */
	async resolve(id: string, payload: { action: FraudAlertAction; note?: string }, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const alert: any = await this.alerts.findOne({ _id: id, status: 'open' }).lean();
		if (!alert) return { status: defines.status.conflict, message: 'Cette alerte est déjà traitée.', data: null };

		if (payload.action === 'invalidate-ticket') {
			if (!alert.payment) return { status: defines.status.badRequest, message: 'Aucun ticket lié à cette alerte.', data: null };
			const applied = await model('Payment').findOneAndUpdate(
				{ _id: alert.payment, status: 'success' },
				{ $set: { status: 'invalidated', invalidatedAt: new Date(), invalidatedBy: adminId } }
			);
			if (!applied) return { status: defines.status.conflict, message: 'Ce ticket n’est plus invalidable.', data: null };
		}

		const closed = await this.alerts.findOneAndUpdate(
			{ _id: id, status: 'open' },
			{
				$set: {
					status: payload.action === 'dismiss' ? 'dismissed' : 'actioned',
					action: payload.action,
					note: payload.note?.trim() || undefined,
					handledBy: adminId,
					handledAt: new Date()
				}
			},
			{ new: true }
		);
		if (!closed) return { status: defines.status.conflict, message: 'Cette alerte est déjà traitée.', data: null };
		return { status: defines.status.requestOK, message: ACTION_LABEL[payload.action], data: null };
	}
}

export const fraudAlertService = new FraudAlertService();
