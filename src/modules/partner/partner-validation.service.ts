import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { PartnerSet } from './partner.model';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';
import { escapeRegex } from '../../shared/regex';

type Result = { status: number; message: any; data: any };

const serviceLabel = 'PartnerValidationService';

/** Boutiques encore présentes (ni supprimées ni archivées). */
const NOT_REMOVED = { $nin: ['removed', 'archived'] };

/**
 * Validation des boutiques créées par les marchands eux-mêmes (Excel CMS n°14).
 *
 * Contrôle **a posteriori**, non bloquant pour le marchand : une boutique créée depuis l'appli Pro
 * naît `active` (visible dans l'appli Client, réductions possibles) avec `validation.status: 'pending'`.
 * Deux champs distincts : `status` dit si la boutique est en ligne, `validation.status` où en est le
 * contrôle de l'équipe YoYo.
 * - Validation : `approved`, la boutique reste (ou revient) en ligne.
 * - Refus : `rejected` avec le motif, la boutique est masquée (`status: 'pending'`).
 * - Modification après refus : renvoyée en validation mais **toujours masquée** jusqu'à la décision
 *   suivante, pour qu'une retouche anodine ne suffise pas à contourner un refus.
 * Le boost reste réservé aux boutiques validées (voir `isBoostEligible`).
 */
export class PartnerValidationService {
	private get partners(): any {
		return new PartnerSet().defaultModel;
	}

	/** Champs à poser sur une boutique créée par le marchand : en ligne, contrôle à venir. */
	static pendingFields(): any {
		return { status: 'active', validation: { status: 'pending', submittedAt: new Date() } };
	}

	/**
	 * Une boutique peut être boostée si elle a été validée, ou si elle n'est jamais passée par la
	 * validation (boutiques antérieures ou enrôlées par un commercial). Un boost payé puis suivi d'un
	 * refus serait perdu pour le marchand.
	 */
	static isBoostEligible(partner: { validation?: { status?: string } } | null | undefined): boolean {
		const s = partner?.validation?.status;
		return s !== 'pending' && s !== 'rejected';
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

	/**
	 * File des boutiques à valider (`pending`) ou refusées (`rejected`). Une boutique à valider peut
	 * être en ligne (nouvelle) ou masquée (renvoyée après refus) : le CMS l'affiche d'après `status`.
	 */
	async list(payloads: { tab?: string; q?: string; page?: number; pageSize?: number }): Promise<Result> {
		const page = Math.max(1, Number(payloads.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(payloads.pageSize) || 20));
		const rejected = payloads.tab === 'rejected';
		const params: any = { status: NOT_REMOVED, 'validation.status': rejected ? 'rejected' : 'pending' };
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
			this.partners.countDocuments({ status: NOT_REMOVED, 'validation.status': 'pending' }),
			this.partners.countDocuments({ status: NOT_REMOVED, 'validation.status': 'rejected' })
		]);
		return { pending, rejected };
	}

	/**
	 * Valide la boutique (à valider, ou refusée que l'équipe décide finalement d'accepter). Une boutique
	 * masquée par un refus revient en ligne ; une boutique suspendue le reste.
	 */
	async validate(id: string, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const decided = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: NOT_REMOVED, 'validation.status': { $in: ['pending', 'rejected'] } },
				{ $set: { 'validation.status': 'approved', 'validation.by': adminId, 'validation.at': new Date() }, $unset: { 'validation.reason': '' } },
				{ new: true }
			)
			.lean();
		if (!decided) return { status: defines.status.conflict, message: 'Cette boutique n’est plus en attente de validation.', data: null };

		// Seul le masquage dû au refus est levé : jamais une suspension.
		const partner =
			decided.status === 'pending'
				? (await this.partners.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { status: 'active' } }, { new: true }).lean()) ?? decided
				: decided;

		await this.push(partner, 'Boutique validée 🎉', `Votre boutique « ${partner.name} » a été validée par l’équipe YoYo.`, 'boutique_validated');
		return { status: defines.status.requestOK, message: 'Boutique validée.', data: partner };
	}

	/**
	 * Refuse la boutique avec un motif : elle est retirée de l'appli Client jusqu'à une nouvelle
	 * validation. Une boutique suspendue par l'admin le reste ; une boutique suspendue par le blocage
	 * de son propriétaire est masquée, pour que le déblocage ne la remette pas en ligne.
	 */
	async reject(id: string, reason: string, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const motive = String(reason ?? '').trim();
		if (motive.length < 3) return { status: defines.status.badRequest, message: 'Indiquez le motif du refus.', data: null };

		const decided = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: NOT_REMOVED, 'validation.status': 'pending' },
				{ $set: { 'validation.status': 'rejected', 'validation.reason': motive, 'validation.by': adminId, 'validation.at': new Date() } },
				{ new: true }
			)
			.lean();
		if (!decided) return { status: defines.status.conflict, message: 'Cette boutique n’est plus en attente de validation.', data: null };

		const partner =
			(await this.partners
				.findOneAndUpdate(
					{ _id: id, $or: [{ status: 'active' }, { status: 'suspended', suspendedByBlock: true }] },
					{ $set: { status: 'pending', suspendedByBlock: false } },
					{ new: true }
				)
				.lean()) ?? decided;

		await this.push(partner, 'Boutique à compléter', `Votre boutique « ${partner.name} » n’a pas été validée : ${motive}`, 'boutique_rejected');
		return { status: defines.status.requestOK, message: 'Boutique refusée et retirée de l’appli, le marchand est prévenu.', data: partner };
	}

	/**
	 * Une modification par le marchand d'une boutique refusée la renvoie en validation. Elle reste
	 * masquée jusqu'à la décision de l'équipe.
	 * @returns vrai si la boutique a été renvoyée
	 */
	async resubmitIfRejected(id: string): Promise<boolean> {
		const partner = await this.partners
			.findOneAndUpdate(
				{ _id: id, status: NOT_REMOVED, 'validation.status': 'rejected' },
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
