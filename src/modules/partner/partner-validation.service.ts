import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { PartnerSet } from './partner.model';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';
import { escapeRegex } from '../../shared/regex';

type Result = { status: number; message: any; data: any };

const serviceLabel = 'PartnerValidationService';

/**
 * Validation des boutiques créées par les marchands eux-mêmes (Excel CMS n°14).
 *
 * Une boutique créée depuis l'appli Pro naît `pending` : invisible dans l'appli Client et sans
 * réduction possible tant que l'équipe YoYo ne l'a pas validée. Un refus garde la boutique
 * `pending` avec le motif ; une modification du marchand la renvoie en validation.
 */
export class PartnerValidationService {
	private get partners(): any {
		return new PartnerSet().defaultModel;
	}

	/** Champs à poser sur une boutique créée par le marchand. */
	static pendingFields(): any {
		return { status: 'pending', validation: { status: 'pending', submittedAt: new Date() } };
	}

	/** Alerte l'équipe Partenaires d'une boutique à valider (nouvelle ou renvoyée après refus). */
	async notifySubmitted(partner: { _id: any; name?: string }, resubmitted = false): Promise<void> {
		await NotificationHelper.notifyAdminsWithPermission('pros', {
			title: resubmitted ? 'Boutique renvoyée en validation' : 'Nouvelle boutique à valider',
			message: `« ${partner.name ?? 'Boutique'} » ${resubmitted ? 'a été modifiée après refus' : 'attend votre validation'}.`,
			category: NotificationCategory.INFO,
			metadata: { type: 'boutique-validation', boutiqueId: String(partner._id) }
		});
	}

	/** File des boutiques à valider (`pending`) ou refusées (`rejected`). */
	async list(payloads: { tab?: string; q?: string; page?: number; pageSize?: number }): Promise<Result> {
		const page = Math.max(1, Number(payloads.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(payloads.pageSize) || 20));
		const rejected = payloads.tab === 'rejected';
		const params: any = rejected
			? { status: 'pending', 'validation.status': 'rejected' }
			: { status: 'pending', 'validation.status': { $ne: 'rejected' } };
		const q = String(payloads.q ?? '').trim();
		if (q) {
			const rx = new RegExp(escapeRegex(q), 'i');
			params.$or = [{ name: rx }, { ville: rx }, { address: rx }, { phone: rx }, { email: rx }];
		}

		const [rows, totalRows, counts] = await Promise.all([
			this.partners
				.find(params, '-__v')
				.sort({ 'validation.submittedAt': 1, createdAt: 1 })
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.populate('user', 'firstname lastname email contact isDocumentVerified documentVerificationStatus')
				.populate('categories', 'name')
				.lean(),
			this.partners.countDocuments(params),
			this.counts()
		]);

		return {
			status: defines.status.requestOK,
			message: { totalRows, totalPages: Math.ceil(totalRows / pageSize), page, pageSize, counts },
			data: rows
		};
	}

	/** Compteurs du menu CMS. */
	async counts(): Promise<{ pending: number; rejected: number }> {
		const [pending, rejected] = await Promise.all([
			this.partners.countDocuments({ status: 'pending', 'validation.status': { $ne: 'rejected' } }),
			this.partners.countDocuments({ status: 'pending', 'validation.status': 'rejected' })
		]);
		return { pending, rejected };
	}

	/** Valide la boutique : elle devient visible et peut accorder des réductions. */
	async validate(id: string, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const partner = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: 'pending' },
				{ $set: { status: 'active', 'validation.status': 'approved', 'validation.by': adminId, 'validation.at': new Date() }, $unset: { 'validation.reason': '' } },
				{ new: true }
			)
			.lean();
		if (!partner) return { status: defines.status.conflict, message: 'Cette boutique n’est plus en attente de validation.', data: null };

		await this.push(partner, 'Boutique validée 🎉', `Votre boutique « ${partner.name} » est en ligne sur YoYo.`, 'boutique_validated');
		return { status: defines.status.requestOK, message: 'Boutique validée et mise en ligne.', data: partner };
	}

	/** Refuse la boutique avec un motif ; elle reste invisible jusqu'à une modification du marchand. */
	async reject(id: string, reason: string, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const motive = String(reason ?? '').trim();
		if (motive.length < 3) return { status: defines.status.badRequest, message: 'Indiquez le motif du refus.', data: null };

		const partner = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: 'pending', 'validation.status': { $ne: 'rejected' } },
				{ $set: { 'validation.status': 'rejected', 'validation.reason': motive, 'validation.by': adminId, 'validation.at': new Date() } },
				{ new: true }
			)
			.lean();
		if (!partner) return { status: defines.status.conflict, message: 'Cette boutique n’est plus en attente de validation.', data: null };

		await this.push(partner, 'Boutique à compléter', `Votre boutique « ${partner.name} » n’a pas été validée : ${motive}`, 'boutique_rejected');
		return { status: defines.status.requestOK, message: 'Boutique refusée, le marchand est prévenu.', data: partner };
	}

	/**
	 * Une modification par le marchand d'une boutique refusée la renvoie en validation.
	 * @returns vrai si la boutique a été renvoyée
	 */
	async resubmitIfRejected(id: string): Promise<boolean> {
		const partner = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: 'pending', 'validation.status': 'rejected' },
				{ $set: { 'validation.status': 'pending', 'validation.submittedAt': new Date() } },
				{ new: true }
			)
			.lean();
		if (!partner) return false;
		await this.notifySubmitted(partner, true);
		return true;
	}

	private async push(partner: any, title: string, body: string, type: string): Promise<void> {
		try {
			await new PushNotificationService().create({
				title,
				body,
				type: type === 'boutique_rejected' ? 'warning' : 'info',
				priority: 'high',
				data: { userId: String(partner.user), type, boutiqueId: String(partner._id), app: 'pro' },
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as IPushNotification);
		} catch (e) {
			LoggerService.log({ type: LogLevel.Error, content: e, location: serviceLabel, method: 'push' });
		}
	}
}

export const partnerValidationService = new PartnerValidationService();
