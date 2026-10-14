import coddyger, { AxiosService, IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { ISupportMessage, ISupportTicket } from './support.interface';
import { SupportMessageSet, SupportTicketSet } from './support.model';
import { ClientSet } from '../client';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';

/**
 * FAQ — 10 questions/réponses du §04 du cahier des charges, EN DUR.
 * Servie telle quelle par `GET /support/faq` et résumée dans la consigne système de l'assistant IA.
 */
export const SUPPORT_FAQ: Array<{ q: string; a: string }> = [
	{
		q: 'Comment fonctionne YOYO ?',
		a: 'YOYO vous donne accès à des offres et réductions chez les marchands partenaires. Découvrez les offres dans l’application.'
	},
	{
		q: 'Dois-je payer pour découvrir les offres ?',
		a: 'Non. Vous pouvez parcourir les offres gratuitement. Un abonnement actif est requis pour utiliser votre réduction au moment du scan.'
	},
	{
		q: 'Combien coûte l’abonnement ?',
		a: '2 000 FCFA par mois ou 19 900 FCFA par an, selon les formules proposées dans l’application.'
	},
	{
		q: 'Combien de fois puis-je scanner ?',
		a: 'Les scans sont illimités avec un abonnement actif, sous réserve des conditions de chaque offre et des règles d’utilisation de YOYO.'
	},
	{
		q: 'Comment profiter d’une réduction ?',
		a: 'Choisissez un marchand participant et suivez le parcours Scanner. Vérifiez le pourcentage et le montant de réduction affichés avant de finaliser l’opération.'
	},
	{
		q: 'Qui encaisse le paiement ?',
		a: 'Le marchand encaisse directement le montant après réduction selon le fonctionnement de l’offre.'
	},
	{
		q: 'Le marchand refuse la réduction : que faire ?',
		a: 'Ne forcez pas la transaction. Ouvrez Contacter YOYO, choisissez Problème marchand et indiquez le nom du commerce ainsi que les détails.'
	},
	{
		q: 'Mon scan ne fonctionne pas : que faire ?',
		a: 'Vérifiez votre connexion et votre abonnement, relancez l’application, puis contactez l’assistance si le problème persiste.'
	},
	{
		q: 'Comment signaler un paiement ou un abonnement non activé ?',
		a: 'Ouvrez Contacter YOYO → Abonnement / paiement, puis transmettez la date et la référence de paiement si disponible.'
	},
	{
		q: 'Comment joindre YOYO ?',
		a: 'Depuis Profil → Centre d’aide → Contacter YOYO. Vous pouvez suivre et retrouver vos échanges au même endroit.'
	}
];

const CATEGORIES = ['scan', 'abonnement_paiement', 'marchand', 'compte', 'autre'];

export class SupportService {
	private readonly tickets: IData<ISupportTicket>;
	private readonly messages: IData<ISupportMessage>;
	private readonly serviceLabel = 'SupportService';

	constructor() {
		this.tickets = new SupportTicketSet();
		this.messages = new SupportMessageSet();
	}

	/* -------------------------------------------------------------------------
	 * Aides internes
	 * ----------------------------------------------------------------------- */

	/** Génère une référence courte (6 caractères A-Z0-9) unique sur la collection. */
	private async generateReference(): Promise<string> {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		for (let attempt = 0; attempt < 10; attempt++) {
			let ref = '';
			for (let i = 0; i < 6; i++) {
				ref += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
			}
			const existing: any = await this.tickets.selectOne({ reference: ref }, '_id');
			if (!existing) {
				return ref;
			}
		}
		// Repli très improbable : suffixe horodaté.
		return 'T' + Date.now().toString(36).toUpperCase().slice(-5);
	}

	/** Tronque un texte pour l'aperçu « dernier message » des listes. */
	private truncate(text: string, max = 120): string {
		const t = (text ?? '').trim();
		return t.length > max ? t.slice(0, max) + '…' : t;
	}

	/* -------------------------------------------------------------------------
	 * Côté client
	 * ----------------------------------------------------------------------- */

	/** Crée un ticket + le premier message (sender 'client'). */
	async createTicket(payloads: {
		userId: string;
		category: string;
		message: string;
		attachment?: string;
	}): Promise<any> {
		try {
			if (CATEGORIES.indexOf(payloads.category) === -1) {
				return { error: true, data: 'Catégorie invalide.' };
			}
			if (coddyger.string.isEmpty(payloads.message)) {
				return { error: true, data: 'Le message est requis.' };
			}

			const reference = await this.generateReference();

			const ticket: any = await this.tickets.save({
				_id: coddyger.string.generateObjectId(),
				reference,
				userId: payloads.userId,
				category: payloads.category,
				status: 'open'
			} as ISupportTicket);
			if (ticket?.error) throw ticket;

			const message: any = await this.messages.save({
				_id: coddyger.string.generateObjectId(),
				ticketId: ticket._id,
				sender: 'client',
				senderId: payloads.userId,
				body: payloads.message,
				attachment: payloads.attachment,
				read: false
			} as ISupportMessage);
			if (message?.error) throw message;

			return { ticket, message };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Tickets d'un client, récents d'abord, avec aperçu du dernier message. */
	async listClientTickets(userId: string): Promise<any> {
		try {
			const data: any = await this.tickets.selectHug({ userId });
			if (data?.error) throw data;

			const rows = (data as any[]).sort(
				(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
			);

			const result: any[] = [];
			for (const t of rows) {
				const last: any = await (this.messages as any).selectLatestWithParams({ ticketId: t._id });
				result.push({
					_id: t._id,
					reference: t.reference,
					category: t.category,
					status: t.status,
					lastMessage: last ? this.truncate(last.body) : '',
					updatedAt: t.updatedAt
				});
			}
			return result;
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Détail d'un ticket : vérifie la propriété si `ownerId` fourni (côté client). */
	async getTicketDetail(ticketId: string, ownerId?: string, populateUser = false): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) {
				return { notFound: true };
			}

			let ticket: any;
			if (populateUser) {
				ticket = await (this.tickets as any).selectOne({ _id: ticketId });
				if (ticket && !ticket.error) {
					// Peupler le client pour l'affichage admin.
					const clientDao: any = new ClientSet();
					const client: any = await clientDao.selectOne({ _id: ticket.userId }, '_id firstname lastname email');
					ticket.user = client || null;
				}
			} else {
				ticket = await this.tickets.selectOne({ _id: ticketId });
			}

			if (!ticket || ticket.error) {
				return { notFound: true };
			}

			if (ownerId && String(ticket.userId) !== String(ownerId)) {
				return { forbidden: true };
			}

			const msgs: any = await this.messages.selectHug({ ticketId });
			if (msgs?.error) throw msgs;

			const messages = (msgs as any[]).map((m) => ({
				_id: m._id,
				sender: m.sender,
				body: m.body,
				attachmentUrl: m.attachment ? `/file/${m.attachment}` : undefined,
				createdAt: m.createdAt
			}));

			return { ticket, messages };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Ajoute un message client à un ticket (403 si pas propriétaire). */
	async addClientMessage(payloads: {
		ticketId: string;
		userId: string;
		body: string;
		attachment?: string;
	}): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(payloads.ticketId)) {
				return { notFound: true };
			}
			if (coddyger.string.isEmpty(payloads.body)) {
				return { error: true, data: 'Le message est requis.' };
			}

			const ticket: any = await this.tickets.selectOne({ _id: payloads.ticketId });
			if (!ticket || ticket.error) {
				return { notFound: true };
			}
			if (String(ticket.userId) !== String(payloads.userId)) {
				return { forbidden: true };
			}

			const message: any = await this.messages.save({
				_id: coddyger.string.generateObjectId(),
				ticketId: payloads.ticketId,
				sender: 'client',
				senderId: payloads.userId,
				body: payloads.body,
				attachment: payloads.attachment,
				read: false
			} as ISupportMessage);
			if (message?.error) throw message;

			// Touche le ticket pour le remonter dans les listes : on ré-écrit le statut inchangé,
			// ce qui suffit à ce que Mongoose rafraîchisse `updatedAt`.
			await this.tickets.update({ _id: payloads.ticketId }, { status: ticket.status });

			return { message };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Marque lus les messages 'support'/'bot' d'un ticket, pour le client propriétaire. */
	async markReadByClient(ticketId: string, userId: string): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) {
				return { notFound: true };
			}
			const ticket: any = await this.tickets.selectOne({ _id: ticketId });
			if (!ticket || ticket.error) {
				return { notFound: true };
			}
			if (String(ticket.userId) !== String(userId)) {
				return { forbidden: true };
			}

			await (this.messages as any).updateMany(
				{ ticketId, sender: { $in: ['support', 'bot'] }, read: false },
				{ read: true }
			);

			return { ok: true };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/* -------------------------------------------------------------------------
	 * Côté admin
	 * ----------------------------------------------------------------------- */

	/** Liste paginée pour YOYO ADMIN (filtre status + recherche reference/nom). */
	async listAdminTickets(payloads: { page?: number; pageSize?: number; status?: string; q?: string }): Promise<any> {
		try {
			const page = payloads.page ?? 1;
			const pageSize = payloads.pageSize ?? 20;

			const params: any = {};
			if (!coddyger.string.isEmpty(payloads.status)) {
				params.status = payloads.status;
			}

			if (!coddyger.string.isEmpty(payloads.q)) {
				const q = payloads.q as string;
				// Recherche sur la référence OU sur le nom du client (via lookup des clients).
				const clientDao: any = new ClientSet();
				const clients: any = await clientDao.selectHug({
					$or: [
						{ firstname: { $regex: q, $options: 'i' } },
						{ lastname: { $regex: q, $options: 'i' } }
					]
				});
				const clientIds = Array.isArray(clients) ? clients.map((c: any) => c._id) : [];
				params.$or = [{ reference: { $regex: q, $options: 'i' } }, { userId: { $in: clientIds } }];
			}

			const data: any = await this.tickets.select({ params, page, pageSize });
			if (data.error) throw data;

			const rows: any[] = data.rows;
			delete data.rows;

			// Aperçu du dernier message de chaque ticket.
			const enriched: any[] = [];
			for (const t of rows) {
				const last: any = await (this.messages as any).selectLatestWithParams({ ticketId: t._id });
				enriched.push({
					_id: t._id,
					reference: t.reference,
					userId: t.userId,
					category: t.category,
					status: t.status,
					assignedTo: t.assignedTo ?? null,
					lastMessage: last ? this.truncate(last.body) : '',
					createdAt: t.createdAt,
					updatedAt: t.updatedAt
				});
			}

			return { data, rows: enriched };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Réponse du support : crée le message, notifie le client, passe 'open' → 'in_progress'. */
	async adminReply(payloads: { ticketId: string; adminId: string; body: string }): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(payloads.ticketId)) {
				return { notFound: true };
			}
			if (coddyger.string.isEmpty(payloads.body)) {
				return { error: true, data: 'Le message est requis.' };
			}

			const ticket: any = await this.tickets.selectOne({ _id: payloads.ticketId });
			if (!ticket || ticket.error) {
				return { notFound: true };
			}

			const message: any = await this.messages.save({
				_id: coddyger.string.generateObjectId(),
				ticketId: payloads.ticketId,
				sender: 'support',
				senderId: payloads.adminId,
				body: payloads.body,
				read: false
			} as ISupportMessage);
			if (message?.error) throw message;

			// Un 'open' devient 'in_progress' dès la première réponse du support.
			const patch: any = {};
			if (ticket.status === 'open') {
				patch.status = 'in_progress';
			}
			await this.tickets.update({ _id: payloads.ticketId }, patch);

			// Notifie le client via le même mécanisme push ciblé par `data.userId` que les autres
			// notifications (cf. push-notification.service : `data.userId` sert de room Socket.IO).
			try {
				const pushService = new PushNotificationService();
				await pushService.create({
					title: 'Réponse du support YOYO',
					body: this.truncate(payloads.body, 140),
					type: 'info',
					priority: 'high',
					data: {
						userId: ticket.userId,
						ticketId: payloads.ticketId,
						reference: ticket.reference,
						url: `/support/tickets/${payloads.ticketId}`
					},
					target: Events.USER_NOTIFICATION,
					status: 'pending'
				} as IPushNotification);
			} catch (notifyError) {
				// La notification ne doit pas faire échouer la réponse support.
				LoggerService.log({
					type: LogLevel.Warn,
					content: notifyError,
					location: this.serviceLabel,
					method: 'adminReply/notify'
				});
			}

			return { message };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Met à jour le statut et/ou l'assignation d'un ticket. */
	async adminUpdateTicket(ticketId: string, patch: { status?: string; assignedTo?: string }): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) {
				return { notFound: true };
			}
			const ticket: any = await this.tickets.selectOne({ _id: ticketId });
			if (!ticket || ticket.error) {
				return { notFound: true };
			}

			const update: any = {};
			if (patch.status) update.status = patch.status;
			if (patch.assignedTo !== undefined) update.assignedTo = patch.assignedTo;

			const result: any = await this.tickets.update({ _id: ticketId }, update);
			if (result?.error) throw result;

			const updated: any = await this.tickets.selectOne({ _id: ticketId });
			return { ticket: updated };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/* -------------------------------------------------------------------------
	 * FAQ + Assistant IA
	 * ----------------------------------------------------------------------- */

	getFaq(): Array<{ q: string; a: string }> {
		return SUPPORT_FAQ;
	}

	/**
	 * Assistant IA (Groq). Clé lue dans `process.env.IA_CLE` (repli `GROQ_API_KEY`).
	 * Renvoie `{ reply }` ou `{ unavailable: true }` si la clé est absente, ou `{ error }` réseau.
	 */
	async askAssistant(payloads: { message: string; history?: Array<{ role: string; content: string }> }): Promise<any> {
		const apiKey = process.env.IA_CLE || process.env.GROQ_API_KEY;
		if (coddyger.string.isEmpty(apiKey)) {
			return { unavailable: true };
		}

		try {
			const faqResume = SUPPORT_FAQ.map((f) => `Q: ${f.q}\nR: ${f.a}`).join('\n');
			const systemPrompt =
				'Tu es l’assistant YoYo La Carte. Réponds en français, brièvement, sur la base de la FAQ. ' +
				'Si tu ne sais pas ou si c’est un problème de compte/paiement/marchand, invite à Contacter YOYO.\n\n' +
				'FAQ de référence :\n' +
				faqResume;

			const history = Array.isArray(payloads.history) ? payloads.history : [];

			const axios = AxiosService.connect({ baseURL: 'https://api.groq.com' });
			const response: any = await axios.post(
				'/openai/v1/chat/completions',
				{
					model: 'llama-3.3-70b-versatile',
					messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: payloads.message }],
					temperature: 0.3
				},
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					timeout: 15000
				}
			);

			const reply: string = response?.data?.choices?.[0]?.message?.content ?? '';
			return { reply: reply.trim() };
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'askAssistant'
			});
			return { error: true, data: error };
		}
	}
}
