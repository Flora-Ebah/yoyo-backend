import coddyger, { AxiosService, IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { categoriesFor, ISupportMessage, ISupportTicket, SupportApp } from './support.interface';
import { computeDueDates, isOverdue, overdueFilter } from './support-sla';
import { faqService } from './faq.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { SupportMessageSet, SupportTicketSet } from './support.model';
import { ClientSet } from '../client';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';
import { SubscriptionService } from '../subscription/subscription.service';
import { PaymentService } from '../payment/payment.service';
import { getSocketIO } from '../../main';

/** Room Socket.IO partagée par les agents du support (back-office). */
export const SUPPORT_AGENTS_ROOM = 'support:agents';

// FAQ de départ : désormais en base, modifiable dans le CMS (`faq.service.ts`).
export { SUPPORT_FAQ } from './faq.service';


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

	/** Transférés par l'assistant et pas encore attribués : la file « en attente d'un conseiller ». */
	private awaitingFilter(): any {
		return { escalated: true, status: 'open', $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }] };
	}

	/** Échappe une saisie libre avant de l'utiliser dans une expression régulière Mongo. */
	private escapeRegex(text: string): string {
		return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	/** Tronque un texte pour l'aperçu « dernier message » des listes. */
	private truncate(text: string, max = 120): string {
		const t = (text ?? '').trim();
		return t.length > max ? t.slice(0, max) + '…' : t;
	}

	/**
	 * Émet un événement d'assistance temps réel vers une ou plusieurs rooms Socket.IO.
	 * Best-effort : sans socket (ou en cas d'erreur) on n'interrompt jamais le flux HTTP.
	 * Même mécanisme que `push.service` (room d'identité = `userId`).
	 */
	private emitSupport(rooms: Array<string | undefined>, event: string, payload: any): void {
		try {
			const io = getSocketIO()?.getIo();
			if (!io) return;
			for (const room of rooms) {
				if (room) io.to(String(room)).emit(event, payload);
			}
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Warn,
				content: error,
				location: this.serviceLabel,
				method: 'emitSupport'
			});
		}
	}

	/* -------------------------------------------------------------------------
	 * Côté client
	 * ----------------------------------------------------------------------- */

	/**
	 * Échéances et suivi d'un nouveau ticket (Excel CMS n°5). Les délais sont relus à chaque
	 * création : un changement dans le CMS s'applique aux tickets suivants.
	 */
	private async slaFields(category: string, now = new Date()): Promise<Partial<ISupportTicket>> {
		const sla = await new PlatformConfigService().getSupportSla();
		return { ...computeDueDates(now, category, sla), awaitingSince: now, firstResponseAt: null };
	}

	/**
	 * Un ticket Pro n'est ouvert que par un marchand ou un gérant (Excel CMS n°6) : il arrive dans
	 * la boîte du support avec le badge « Marchand ».
	 */
	private async canUsePro(userId: string): Promise<boolean> {
		const client: any = await new ClientSet().selectOne({ _id: userId }, '_id isPartner isManager');
		return Boolean(client && !client.error && (client.isPartner || client.isManager));
	}

	/** Crée un ticket + le premier message (sender 'client'). */
	async createTicket(payloads: {
		userId: string;
		category: string;
		message: string;
		attachment?: string;
		app?: SupportApp;
	}): Promise<any> {
		try {
			const app: SupportApp = payloads.app === 'pro' ? 'pro' : 'client';
			if (!categoriesFor(app).includes(payloads.category)) {
				return { error: true, data: 'Catégorie invalide.' };
			}
			if (coddyger.string.isEmpty(payloads.message)) {
				return { error: true, data: 'Le message est requis.' };
			}
			if (app === 'pro' && !(await this.canUsePro(payloads.userId))) {
				return { error: true, data: 'Ce compte n’est pas un compte marchand.' };
			}

			const reference = await this.generateReference();

			const ticket: any = await this.tickets.save({
				_id: coddyger.string.generateObjectId(),
				reference,
				userId: payloads.userId,
				category: payloads.category,
				status: 'open',
				source: app,
				...(await this.slaFields(payloads.category))
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

			// Temps réel : nouveau ticket visible immédiatement dans la liste des agents.
			this.emitSupport([SUPPORT_AGENTS_ROOM], 'support:message', {
				ticketId: String(ticket._id),
				message: this.toMessageDto(message),
				newTicket: true
			});

			return { ticket, message };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Tickets d'un client, récents d'abord, avec aperçu du dernier message. Chaque appli ne voit
	 * que ses tickets : un marchand qui utilise aussi l'appli Client y garde ses demandes séparées.
	 * `app` absent : tous les tickets (fiche client du CMS).
	 */
	async listClientTickets(userId: string, app?: SupportApp): Promise<any> {
		try {
			const bySource = app === 'pro' ? { source: 'pro' } : app === 'client' ? { source: { $ne: 'pro' } } : {};
			const data: any = await this.tickets.selectHug({ userId, ...bySource });
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
					source: t.source ?? 'client',
					lastMessage: last ? this.truncate(last.body) : '',
					createdAt: t.createdAt,
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

			// Touche le ticket pour le remonter dans les listes (Mongoose rafraîchit `updatedAt`) et
			// note depuis quand le client attend une réponse, si ce n'est pas déjà le cas.
			await this.tickets.update(
				{ _id: payloads.ticketId },
				ticket.awaitingSince ? { status: ticket.status } : { status: ticket.status, awaitingSince: new Date() }
			);

			const dto = this.toMessageDto(message);
			// Temps réel : vers les agents (liste + conversation côté back-office).
			this.emitSupport([SUPPORT_AGENTS_ROOM], 'support:message', {
				ticketId: String(payloads.ticketId),
				message: dto
			});

			return { message: dto };
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

	/**
	 * Liste paginée pour YOYO ADMIN. Tous les filtres sont appliqués côté serveur, pour que les
	 * onglets et compteurs portent sur l'ensemble des tickets et pas sur la page affichée :
	 *  - `status`, `category`, `source` (`client` | `pro`) ;
	 *  - `view` : `awaiting` (transférés par l'assistant, sans conseiller) ou `overdue` (en retard) ;
	 *  - `q` : référence ou nom du client.
	 */
	async listAdminTickets(payloads: {
		page?: number;
		pageSize?: number;
		status?: string;
		category?: string;
		source?: SupportApp;
		view?: 'awaiting' | 'overdue';
		q?: string;
	}): Promise<any> {
		try {
			const page = payloads.page ?? 1;
			const pageSize = Math.min(payloads.pageSize ?? 20, 100);

			const and: any[] = [];
			if (!coddyger.string.isEmpty(payloads.status)) and.push({ status: payloads.status });
			if (!coddyger.string.isEmpty(payloads.category)) and.push({ category: payloads.category });
			// Les tickets antérieurs au champ `source` sont des tickets Client.
			if (payloads.source === 'pro') and.push({ source: 'pro' });
			if (payloads.source === 'client') and.push({ source: { $ne: 'pro' } });
			if (payloads.view === 'awaiting') and.push(this.awaitingFilter());
			if (payloads.view === 'overdue') and.push(overdueFilter());

			if (!coddyger.string.isEmpty(payloads.q)) {
				const q = this.escapeRegex(String(payloads.q).trim());
				// Recherche sur la référence OU sur le nom du client (via lookup des clients).
				const clientDao: any = new ClientSet();
				const clients: any = await clientDao.selectHug({
					$or: [
						{ firstname: { $regex: q, $options: 'i' } },
						{ lastname: { $regex: q, $options: 'i' } }
					]
				});
				const clientIds = Array.isArray(clients) ? clients.map((c: any) => c._id) : [];
				and.push({ $or: [{ reference: { $regex: q, $options: 'i' } }, { userId: { $in: clientIds } }] });
			}
			const params = and.length > 0 ? { $and: and } : {};

			const data: any = await this.tickets.select({ params, page, pageSize });
			if (data.error) throw data;

			const rows: any[] = data.rows;
			delete data.rows;

			// Normalise un userId (peut être un ObjectId, une string, ou un document déjà peuplé)
			// en identifiant 24-hex VALIDE — sinon `null`. Indispensable : un `$in` avec une valeur
			// non castable (« [object Object] ») lève une CastError qui fait tomber le process.
			const toUserId = (u: any): string | null => {
				if (!u) return null;
				if (typeof u === 'object' && u._id) u = u._id;
				const s = String(u);
				return coddyger.string.isValidObjectId(s) ? s : null;
			};

			// Peuplement groupé des clients (nom/prénom/email) — une seule requête pour toute la page,
			// afin que la liste admin affiche le nom de l'auteur (sinon « — »).
			const userMap: Record<string, any> = {};
			try {
				const userIds = Array.from(
					new Set(rows.map((t: any) => toUserId(t.userId)).filter((id: string | null): id is string => !!id))
				);
				if (userIds.length > 0) {
					const clientDao: any = new ClientSet();
					const clients: any = await clientDao.selectHug({ _id: { $in: userIds } });
					if (Array.isArray(clients)) {
						for (const c of clients) {
							userMap[String(c._id)] = {
								_id: c._id,
								firstname: c.firstname,
								lastname: c.lastname,
								email: c.email,
								isPartner: c.isPartner === true,
								isManager: c.isManager === true
							};
						}
					}
				}
			} catch {
				/* best-effort : la liste reste utilisable même sans noms peuplés */
			}

			// Aperçu du dernier message de chaque ticket.
			const enriched: any[] = [];
			for (const t of rows) {
				const uid = toUserId(t.userId);
				const last: any = await (this.messages as any).selectLatestWithParams({ ticketId: t._id });
				enriched.push({
					_id: t._id,
					reference: t.reference,
					userId: uid ?? t.userId,
					user: (uid && userMap[uid]) ?? null,
					category: t.category,
					status: t.status,
					assignedTo: t.assignedTo ?? null,
					escalated: t.escalated ?? false,
					source: t.source ?? 'client',
					awaitingSince: t.awaitingSince ?? null,
					firstResponseAt: t.firstResponseAt ?? null,
					firstResponseDueAt: t.firstResponseDueAt ?? null,
					resolutionDueAt: t.resolutionDueAt ?? null,
					overdue: isOverdue(t),
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

			// Un 'open' devient 'in_progress' dès la première réponse du support ; le client n'attend
			// plus de réponse et la 1re réponse est datée une fois pour toutes (délais, Excel CMS n°5).
			const patch: any = { awaitingSince: null };
			if (ticket.status === 'open') {
				patch.status = 'in_progress';
			}
			if (!ticket.firstResponseAt) {
				patch.firstResponseAt = new Date();
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
						// La push part sur l'appli d'où vient le ticket seulement.
						app: ticket.source === 'pro' ? 'pro' : 'client',
						url: ticket.source === 'pro' ? `/help/${payloads.ticketId}` : `/support/tickets/${payloads.ticketId}`
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

			// Journal d'audit (§07 CDC) : trace de l'action administrateur.
			LoggerService.log({
				type: LogLevel.Info,
				content: `[AUDIT][SUPPORT] Réponse agent — ticket=${ticket.reference} (${payloads.ticketId}) adminId=${payloads.adminId}`,
				location: this.serviceLabel,
				method: 'adminReply'
			});

			const dto = this.toMessageDto(message);
			// Temps réel : au client (sa conversation ouverte) et aux autres agents.
			this.emitSupport([ticket.userId, SUPPORT_AGENTS_ROOM], 'support:message', {
				ticketId: String(payloads.ticketId),
				message: dto
			});

			return { message: dto };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Normalise un message pour le client : expose `attachmentUrl` (URL `/file/<nom>`)
	 * au lieu du nom de fichier brut `attachment`. Même forme que la liste des messages,
	 * pour que l'image s'affiche immédiatement après l'envoi (sans rechargement).
	 */
	private toMessageDto(m: any) {
		return {
			_id: m._id,
			sender: m.sender,
			body: m.body,
			attachmentUrl: m.attachment ? `/file/${m.attachment}` : undefined,
			createdAt: m.createdAt
		};
	}

	/** Met à jour le statut et/ou l'assignation d'un ticket. */
	async adminUpdateTicket(ticketId: string, patch: { status?: string; assignedTo?: string }, adminId?: string): Promise<any> {
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

			// Première attribution (personne → un agent) : on matérialise la prise en charge par un
			// message dans le fil, pour une transition visible côté client (fin de l'attente).
			const firstAssignment =
				patch.assignedTo !== undefined && patch.assignedTo !== null && !ticket.assignedTo;

			const result: any = await this.tickets.update({ _id: ticketId }, update);
			if (result?.error) throw result;

			if (firstAssignment) {
				const takeover: any = await this.messages.save({
					_id: coddyger.string.generateObjectId(),
					ticketId,
					sender: 'support',
					senderId: patch.assignedTo,
					body: 'Un conseiller a pris en charge votre demande.',
					read: false
				} as ISupportMessage);
				if (!takeover?.error) {
					this.emitSupport([ticket.userId, SUPPORT_AGENTS_ROOM], 'support:message', {
						ticketId: String(ticketId),
						message: this.toMessageDto(takeover)
					});
				}
			}

			// Journal d'audit (§07 CDC) : trace de l'action administrateur.
			LoggerService.log({
				type: LogLevel.Info,
				content: `[AUDIT][SUPPORT] MAJ ticket=${ticket.reference} (${ticketId})${patch.status ? ' status=' + patch.status : ''}${patch.assignedTo !== undefined ? ' assignedTo=' + patch.assignedTo : ''} adminId=${adminId ?? '?'}`,
				location: this.serviceLabel,
				method: 'adminUpdateTicket'
			});

			const updated: any = await this.tickets.selectOne({ _id: ticketId });

			// Temps réel : statut/assignation au client et aux agents.
			this.emitSupport([ticket.userId, SUPPORT_AGENTS_ROOM], 'support:status', {
				ticketId: String(ticketId),
				status: updated?.status,
				assignedTo: updated?.assignedTo ? String(updated.assignedTo) : null
			});

			return { ticket: updated };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/** Compteurs basiques pour le back-office (§06 CDC) : total + par statut + par catégorie. */
	async adminStats(): Promise<any> {
		try {
			const model: any = (this.tickets as any).defaultModel;
			const [total, open, inProgress, resolved, awaiting, overdue, pro, byCat] = await Promise.all([
				model.countDocuments({}),
				model.countDocuments({ status: 'open' }),
				model.countDocuments({ status: 'in_progress' }),
				model.countDocuments({ status: 'resolved' }),
				// Basculés par l'assistant et pas encore attribués : la file « en attente d'un conseiller ».
				model.countDocuments(this.awaitingFilter()),
				model.countDocuments(overdueFilter()),
				model.countDocuments({ source: 'pro' }),
				model.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }])
			]);
			const byCategory: Record<string, number> = {};
			for (const c of byCat as Array<{ _id: string; n: number }>) byCategory[c._id] = c.n;
			return {
				stats: {
					total,
					open,
					in_progress: inProgress,
					resolved,
					awaiting,
					overdue,
					bySource: { client: total - pro, pro },
					byCategory
				}
			};
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Contexte client d'un ticket (panneau latéral de l'agent, à côté de la conversation).
	 *
	 * Compose, pour le CLIENT PROPRIÉTAIRE du ticket, un condensé utile à l'agent de support :
	 * identité, abonnement actif, économies cumulées + dernière réduction, et libellé des scans.
	 *
	 * Réutilise les services existants :
	 *  - abonnement : `SubscriptionService.getCurrentSubscriptionWithPlanDetails` (abonnement actif
	 *    non expiré, nom du plan peuplé, `daysRemaining` déjà calculé) ;
	 *  - économies : `PaymentService.getClientSavings` (total des réductions validées) et
	 *    `PaymentService.getClientLastSaving` (dernière réduction validée).
	 *
	 * Robuste : chaque brique manquante retombe sur `null` / valeurs vides sans faire échouer le tout.
	 * `{ notFound: true }` si le ticket n'existe pas.
	 */
	async getTicketContext(ticketId: string): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) {
				return { notFound: true };
			}

			const ticket: any = await this.tickets.selectOne({ _id: ticketId });
			if (!ticket || ticket.error) {
				return { notFound: true };
			}

			const userId = ticket.userId;

			// Identité du client (best-effort : null si introuvable).
			let user: any = null;
			try {
				const clientDao: any = new ClientSet();
				const client: any = await clientDao.selectOne(
					{ _id: userId },
					'_id firstname lastname email contact createdAt status isPartner isManager'
				);
				if (client && !client.error) {
					user = {
						_id: client._id,
						firstname: client.firstname,
						lastname: client.lastname,
						email: client.email,
						contact: client.contact,
						createdAt: client.createdAt,
						status: client.status,
						isPartner: client.isPartner === true,
						isManager: client.isManager === true
					};
				}
			} catch {
				user = null;
			}

			// Abonnement ACTIF du client (null si aucun).
			let subscription: { planName: string; status: string; daysRemaining: number } | null = null;
			try {
				const current: any = await new SubscriptionService().getCurrentSubscriptionWithPlanDetails(String(userId));
				if (current) {
					subscription = {
						planName: current.planId?.name ?? '',
						status: current.status ?? 'active',
						daysRemaining: Number(current.daysRemaining) || 0
					};
				}
			} catch {
				subscription = null;
			}

			// Économies cumulées + dernière réduction validée.
			let savings: { total: number; last: { amount: number; merchant?: string; date?: string } | null } = {
				total: 0,
				last: null
			};
			try {
				const paymentService = new PaymentService();
				const [totals, last] = await Promise.all([
					paymentService.getClientSavings(String(userId)),
					paymentService.getClientLastSaving(String(userId))
				]);
				savings = {
					total: Number(totals?.total) || 0,
					last: last ?? null
				};
			} catch {
				savings = { total: 0, last: null };
			}

			// Scans illimités sous abonnement actif, sinon néant.
			const scans = subscription ? 'Illimités' : '—';

			// Marchand ou gérant (Excel CMS n°6) : ses boutiques, utiles pour un ticket Pro.
			let boutiques: Array<{ _id: string; name: string; status: string; ville?: string; role: 'owner' | 'manager' }> = [];
			if (user?.isPartner || user?.isManager) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-var-requires
					const mongoose = require('mongoose');
					const Partner = mongoose.model('Partner');
					const owned = user.isPartner
						? await Partner.find({ user: userId, status: { $ne: 'removed' } }, '_id name status ville').lean()
						: [];
					const links = user.isManager
						? await mongoose.model('BoutiqueManager').find({ manager: userId, status: { $ne: 'removed' } }, 'boutique').lean()
						: [];
					const managed = links.length
						? await Partner.find({ _id: { $in: links.map((l: any) => l.boutique) } }, '_id name status ville').lean()
						: [];
					boutiques = [
						...owned.map((b: any) => ({ ...b, role: 'owner' as const })),
						...managed.map((b: any) => ({ ...b, role: 'manager' as const }))
					];
				} catch {
					boutiques = [];
				}
			}

			return {
				context: {
					user,
					subscription,
					savings,
					scans,
					boutiques,
					source: ticket.source ?? 'client'
				}
			};
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Historique des scans / transactions du client propriétaire d'un ticket (paginé).
	 * Réutilise `PaymentService.getClientTransactions`. `{ notFound: true }` si le ticket n'existe pas.
	 */
	async adminGetClientTransactions(ticketId: string, page = 1, pageSize = 20): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) return { notFound: true };
			const ticket: any = await this.tickets.selectOne({ _id: ticketId }, '_id userId');
			if (!ticket || ticket.error) return { notFound: true };

			const result: any = await new PaymentService().getClientTransactions(String(ticket.userId), { page, pageSize });
			if (result?.error) throw result;
			const meta: any = result?.data ?? {};
			return {
				rows: result?.rows ?? [],
				totalRows: meta.totalRows,
				totalPages: meta.totalPages,
				page
			};
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Historique des abonnements du client propriétaire d'un ticket (récents d'abord).
	 * Réutilise `SubscriptionService.getUserSubscriptionHistory`.
	 */
	async adminGetClientSubscriptions(ticketId: string): Promise<any> {
		try {
			if (!coddyger.string.isValidObjectId(ticketId)) return { notFound: true };
			const ticket: any = await this.tickets.selectOne({ _id: ticketId }, '_id userId');
			if (!ticket || ticket.error) return { notFound: true };

			const history: any = await new SubscriptionService().getUserSubscriptionHistory(String(ticket.userId));
			const rows: any[] = Array.isArray(history) ? history : history?.rows ?? [];
			return { rows };
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/* -------------------------------------------------------------------------
	 * FAQ + Assistant IA
	 * ----------------------------------------------------------------------- */

	/** FAQ publiée d'une appli (Client par défaut, pour les versions déjà installées). */
	getFaq(app: SupportApp = 'client'): Promise<Array<{ q: string; a: string; theme: string }>> {
		return faqService.listPublished(app);
	}

	/**
	 * Assistant IA (Groq). Clé lue dans `process.env.IA_CLE` (repli `GROQ_API_KEY`).
	 *
	 * Réponse structurée en JSON : `{ reply, escalate, category }`.
	 * - `escalate` passe à `true` quand l'assistant ne peut PAS résoudre (problème compte /
	 *   paiement / marchand nécessitant un conseiller humain) → l'app propose alors de
	 *   transférer toute la conversation à un conseiller (création de ticket pré-rempli).
	 * - `category` : catégorie de ticket suggérée pour ce transfert.
	 *
	 * Renvoie `{ unavailable: true }` si la clé est absente, ou `{ error }` en cas d'échec réseau.
	 */
	async askAssistant(payloads: { message: string; history?: Array<{ role: string; content: string }> }): Promise<any> {
		const apiKey = process.env.IA_CLE || process.env.GROQ_API_KEY;
		if (coddyger.string.isEmpty(apiKey)) {
			return { unavailable: true };
		}

		try {
			const faqResume = (await faqService.listPublished('client')).map((f) => `Q: ${f.q}\nR: ${f.a}`).join('\n');
			const clientCategories = categoriesFor('client');
			const systemPrompt =
				'Tu es l’assistant YoYo La Carte. Réponds en français, brièvement, sur la base de la FAQ.\n' +
				// Ton de la marque : « YO » est le salut YoYo ; tutoiement chaleureux et simple.
				'Ton ton est chaleureux et proche : tu tutoies le client et, quand tu salues, tu dis « YO ». ' +
				'Si le client te salue (bonjour, salut, yo…), réponds en commençant par « YO ! ».\n\n' +
				'Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec exactement ces clés :\n' +
				'- "reply" (string) : ta réponse au client, en français.\n' +
				'- "escalate" (boolean) : true si tu ne peux pas résoudre le problème, ou s’il s’agit d’un ' +
				'problème de compte, de paiement/abonnement non activé, ou de litige avec un marchand qui exige ' +
				'un conseiller humain. Sinon false.\n' +
				`- "category" (string) : l’une de ${clientCategories.map((c) => `"${c}"`).join(', ')} — ` +
				'la catégorie la plus adaptée si le client devait ouvrir une demande.\n\n' +
				'Quand escalate vaut true, dans "reply" invite poliment le client à transférer la conversation ' +
				'à un conseiller (ne lui demande pas de tout retaper).\n\n' +
				'FAQ de référence :\n' +
				faqResume;

			const history = Array.isArray(payloads.history) ? payloads.history : [];

			const axios = AxiosService.connect({ baseURL: 'https://api.groq.com' });
			const response: any = await axios.post(
				'/openai/v1/chat/completions',
				{
					// Modèle Groq actif : `llama-3.3-70b-versatile` a été retiré du catalogue.
					// `gpt-oss-20b` est un modèle à raisonnement — `reasoning_effort: 'low'`
					// garde la réponse finale dans `message.content` (sinon les tokens partent
					// dans `message.reasoning` et `content` revient vide).
					model: process.env.IA_MODELE || 'openai/gpt-oss-20b',
					messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: payloads.message }],
					temperature: 0.3,
					reasoning_effort: 'low',
					response_format: { type: 'json_object' }
				},
				{
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					timeout: 15000
				}
			);

			const raw: string = (response?.data?.choices?.[0]?.message?.content ?? '').trim();
			return this.parseAssistantReply(raw);
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

	/**
	 * Parse la réponse JSON de l'assistant en `{ reply, escalate, category }`, de façon tolérante :
	 * si le modèle renvoie du texte brut (ou un JSON malformé), on retombe sur `reply = texte`,
	 * `escalate = false` — jamais d'échec visible pour le client.
	 */
	private parseAssistantReply(raw: string): { reply: string; escalate: boolean; category: string } {
		const fallback = (reply: string) => ({ reply: reply.trim(), escalate: false, category: 'autre' });
		if (!raw) return fallback('');
		try {
			// Tolère un éventuel bloc ```json … ``` autour de l'objet.
			const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
			const parsed = JSON.parse(cleaned);
			const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
			if (!reply) return fallback(raw);
			const category = categoriesFor('client').includes(parsed.category) ? parsed.category : 'autre';
			return { reply, escalate: parsed.escalate === true, category };
		} catch {
			return fallback(raw);
		}
	}

	/**
	 * Crée un ticket pré-rempli à partir d'une conversation avec l'assistant IA (escalade).
	 * Toute la conversation est reprise dans le fil (messages `client` / `bot`) pour que le
	 * conseiller dispose du contexte complet, sans que le client ait à tout retaper.
	 *
	 * L'ordre d'affichage est garanti par le tri stable `createdAt`+`_id` de `selectHug`
	 * (les messages sont enregistrés en rafale, donc souvent dans la même milliseconde).
	 */
	async createTicketFromAssistant(payloads: {
		userId: string;
		history: Array<{ role: string; content: string }>;
		category?: string;
	}): Promise<any> {
		try {
			const history = Array.isArray(payloads.history)
				? payloads.history.filter((m) => m && typeof m.content === 'string' && m.content.trim())
				: [];
			if (history.length === 0) {
				return { error: true, data: 'Conversation vide.' };
			}

			const category = categoriesFor('client').includes(payloads.category as string) ? (payloads.category as string) : 'autre';
			const reference = await this.generateReference();

			const ticket: any = await this.tickets.save({
				_id: coddyger.string.generateObjectId(),
				reference,
				userId: payloads.userId,
				category,
				status: 'open',
				escalated: true,
				source: 'client',
				...(await this.slaFields(category))
			} as ISupportTicket);
			if (ticket?.error) throw ticket;

			// En-tête de contexte pour le conseiller, puis la conversation telle quelle.
			const header: any = await this.messages.save({
				_id: coddyger.string.generateObjectId(),
				ticketId: ticket._id,
				sender: 'bot',
				body: '— Conversation transférée depuis l’assistant IA —',
				read: false
			} as ISupportMessage);
			if (header?.error) throw header;

			let lastMessage: any = header;
			for (const turn of history) {
				const sender = turn.role === 'assistant' ? 'bot' : 'client';
				const saved: any = await this.messages.save({
					_id: coddyger.string.generateObjectId(),
					ticketId: ticket._id,
					sender,
					senderId: sender === 'client' ? payloads.userId : undefined,
					body: turn.content.trim(),
					read: false
				} as ISupportMessage);
				if (saved?.error) throw saved;
				lastMessage = saved;
			}

			LoggerService.log({
				type: LogLevel.Info,
				content: `[AUDIT][SUPPORT] Ticket créé depuis l’assistant — ticket=${reference} (${ticket._id}) userId=${payloads.userId} messages=${history.length}`,
				location: this.serviceLabel,
				method: 'createTicketFromAssistant'
			});

			const dto = this.toMessageDto(lastMessage);
			// Temps réel : nouveau ticket (issu de l'assistant) visible côté agents.
			this.emitSupport([SUPPORT_AGENTS_ROOM], 'support:message', {
				ticketId: String(ticket._id),
				message: dto,
				newTicket: true
			});

			return { ticket, message: dto };
		} catch (error) {
			return { error: true, data: error };
		}
	}
}
