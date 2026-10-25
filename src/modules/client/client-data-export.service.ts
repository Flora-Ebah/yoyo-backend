import mongoose from 'mongoose';
import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { EmailService, MessageTypes } from '../../services/notification';

type Result = { status: number; message: any; data: any };

/** Délai entre deux exports demandés par l'utilisateur lui-même. */
export const DATA_EXPORT_COOLDOWN_MS = 24 * 3600 * 1000;

// Champs jamais exportés : secrets d'authentification et marqueurs internes.
const CLIENT_HIDDEN = '-password -secretResponse -__v -lastDataExportAt';

const model = (name: string): any => mongoose.model(name);

/**
 * Export des données personnelles d'un compte (Excel CMS n°16, droit d'accès ARTCI) : un JSON
 * lisible regroupant le profil et tout ce que YoYo conserve en lien avec le compte.
 * Les données d'autres personnes (filleuls, auteurs de réponses) ne sont pas incluses.
 */
export class ClientDataExportService {
	async build(userId: string): Promise<any | null> {
		const client: any = await model('Client').findById(userId, CLIENT_HIDDEN).populate('secretQuestion', 'title label question').lean();
		if (!client) return null;

		// Une collection absente ou en erreur donne une liste vide plutôt qu'un export en échec.
		const lean = (q: () => any) => Promise.resolve().then(() => q().lean()).catch(() => []);
		const [
			boutiques,
			subscriptions,
			transactions,
			purchases,
			reviews,
			comments,
			likes,
			favorites,
			devices,
			freeMonths,
			tickets,
			blocks,
			reports,
			referrals
		] = await Promise.all([
			lean(() => model('Partner').find({ user: userId }, '-__v')),
			lean(() => model('Subscription').find({ userId }, '-__v').populate('planId', 'name price duration')),
			lean(() => model('Transaction').find({ user: userId }, '-__v -paymentToken')),
			lean(() => model('Payment').find({ from: userId }, '-__v').populate('to', 'name')),
			lean(() => model('Review').find({ client: userId }, '-__v').populate('partner', 'name')),
			lean(() => model('PartnerComment').find({ userId }, '-__v').populate('partnerId', 'name')),
			lean(() => model('PartnerLike').find({ userId }, '-__v').populate('partnerId', 'name')),
			lean(() => model('PartnerFavorite').find({ userId }, '-__v').populate('partnerId', 'name')),
			lean(() => model('DeviceToken').find({ user: userId }, 'app platform createdAt updatedAt')),
			lean(() => model('FreeMonthGrant').find({ user: userId }, '-__v')),
			lean(() => model('SupportTicket').find({ userId }, '-__v')),
			lean(() => model('AccountBlock').find({ user: userId }, 'action reason until auto createdAt')),
			lean(() => model('Report').find({ reporter: userId }, 'targetType reason comment status createdAt')),
			Promise.resolve().then(() => model('Client').countDocuments({ referredBy: userId })).catch(() => 0)
		]);

		const ticketIds = (tickets as any[]).map((t) => t._id);
		const messages: any[] = ticketIds.length
			? await lean(() => model('SupportMessage').find({ ticketId: { $in: ticketIds } }, 'ticketId sender body attachments createdAt'))
			: [];

		return {
			generatedAt: new Date().toISOString(),
			notice:
				'Données personnelles détenues par YoYo pour ce compte. Pour toute question ou demande de rectification ou de suppression, contactez le support YoYo.',
			profile: client,
			boutiques,
			subscriptions,
			onlinePayments: transactions,
			purchasesInShops: purchases,
			reviews,
			comments,
			likes,
			favorites,
			devices,
			freeMonths,
			referrals: { referredAccounts: referrals },
			supportTickets: (tickets as any[]).map((t) => ({
				...t,
				messages: messages
					.filter((m) => String(m.ticketId) === String(t._id))
					// Les réponses du support sont gardées, sans l'identité de l'agent.
					.map(({ ticketId, ...m }) => m)
			})),
			accountBlocks: blocks,
			reports
		};
	}

	/** GET /clients/me/data-export — un export toutes les 24 h par compte. */
	async exportForSelf(userId: string): Promise<Result> {
		const now = new Date();
		const reserved = await model('Client').findOneAndUpdate(
			{
				_id: userId,
				$or: [{ lastDataExportAt: null }, { lastDataExportAt: { $lt: new Date(now.getTime() - DATA_EXPORT_COOLDOWN_MS) } }]
			},
			{ $set: { lastDataExportAt: now } },
			{ new: false, projection: { _id: 1, lastDataExportAt: 1 } }
		);
		if (!reserved) {
			const exists: any = await model('Client').findById(userId, 'lastDataExportAt').lean();
			if (!exists) return { status: defines.status.notFound, message: 'Compte introuvable', data: null };
			const next = new Date(new Date(exists.lastDataExportAt).getTime() + DATA_EXPORT_COOLDOWN_MS);
			const when = next.toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
			return { status: 429, message: `Vous avez déjà téléchargé vos données. Nouvel export possible le ${when}.`, data: null };
		}

		const data = await this.build(userId);
		if (!data) return { status: defines.status.notFound, message: 'Compte introuvable', data: null };
		return { status: defines.status.requestOK, message: 'Vos données personnelles', data };
	}

	/**
	 * POST /clients/me/data-export/email — même export, envoyé en pièce jointe à l'adresse du
	 * compte. Utilisé par les applis : aucun fichier à enregistrer sur le téléphone.
	 */
	async emailForSelf(userId: string): Promise<Result> {
		const client: any = await model('Client').findById(userId, 'email firstname').lean();
		if (!client) return { status: defines.status.notFound, message: 'Compte introuvable', data: null };
		if (!client.email || String(client.email).endsWith('@yoyo.invalid')) {
			return { status: defines.status.badRequest, message: 'Aucune adresse e-mail sur ce compte. Contactez le support.', data: null };
		}

		const res = await this.exportForSelf(userId);
		if (res.status !== defines.status.requestOK) return res;

		const day = new Date().toISOString().slice(0, 10);
		const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
		try {
			const sent = await new EmailService().send({
				category: 'security',
				type: 'email',
				to: client.email,
				template: MessageTypes.TYPES.DATA_EXPORT,
				data: { userName: escapeHtml(client.firstname || '') || undefined },
				attachments: [{ filename: `yoyo-mes-donnees-${day}.json`, content: JSON.stringify(res.data, null, 2), contentType: 'application/json' }]
			});
			if (!sent?.success) throw sent?.error ?? new Error('envoi');
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: 'ClientDataExportService', method: 'emailForSelf' });
			// L'export n'est pas parti : l'utilisateur peut réessayer tout de suite.
			await model('Client').updateOne({ _id: userId }, { $set: { lastDataExportAt: null } });
			return { status: defines.status.serverError, message: 'L’e-mail n’a pas pu être envoyé. Réessayez plus tard.', data: null };
		}

		const masked = String(client.email).replace(/^(.{2}).*(@.*)$/, '$1•••$2');
		return { status: defines.status.requestOK, message: `Vos données ont été envoyées à ${masked}.`, data: null };
	}

	/** GET /clients/:id/data-export — demande reçue par le support (tracée dans l'audit). */
	async exportForAdmin(userId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		const data = await this.build(userId);
		if (!data) return { status: defines.status.notFound, message: 'Compte introuvable', data: null };
		return { status: defines.status.requestOK, message: 'Données personnelles', data };
	}
}

export const clientDataExportService = new ClientDataExportService();
