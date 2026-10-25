import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { SupportService } from './support.service';
import { SupportApp } from './support.interface';
import { faqService } from './faq.service';
import { IFaq } from './faq.model';

const controllerLabel: string = 'SupportController';

export class SupportController {
	private readonly service: SupportService;

	constructor() {
		this.service = new SupportService();
	}

	/* ---------------------------------------------------------------------- */
	/* Côté client                                                            */
	/* ---------------------------------------------------------------------- */

	/** Crée un ticket + le premier message. */
	createTicket(payloads: { userId: string; category: string; message: string; attachment?: string; app?: SupportApp }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.createTicket(payloads);
				if (result.error) {
					return resolve({
						status: defines.status.badRequest,
						message: typeof result.data === 'string' ? result.data : locale.controller.notValidStatus,
						data: null
					});
				}
				resolve({
					status: defines.status.created,
					message: locale.controller.successSave,
					data: { ticket: result.ticket, message: result.message }
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'createTicket'));
	}

	/** Liste des tickets du client. */
	listClientTickets(userId: string, app: SupportApp = 'client') {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.listClientTickets(userId, app);
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: result });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listClientTickets'));
	}

	/** Détail d'un ticket côté client (contrôle de propriété). */
	getClientTicket(ticketId: string, userId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.getTicketDetail(ticketId, userId, false);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.forbidden) {
					return resolve({ status: defines.status.forbidden, message: locale.controller.notAuthorized, data: null });
				}
				if (result.error) throw result;
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: { ticket: result.ticket, messages: result.messages }
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getClientTicket'));
	}

	/** Ajoute un message client à un ticket. */
	addClientMessage(payloads: { ticketId: string; userId: string; body: string; attachment?: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.addClientMessage(payloads);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.forbidden) {
					return resolve({ status: defines.status.forbidden, message: locale.controller.notAuthorized, data: null });
				}
				if (result.error) {
					return resolve({
						status: defines.status.badRequest,
						message: typeof result.data === 'string' ? result.data : locale.controller.notValidStatus,
						data: null
					});
				}
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: { message: result.message } });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'addClientMessage'));
	}

	/** Marque les messages support/bot comme lus pour le client. */
	markRead(ticketId: string, userId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.markReadByClient(ticketId, userId);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.forbidden) {
					return resolve({ status: defines.status.forbidden, message: locale.controller.notAuthorized, data: null });
				}
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: { ok: true } });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'markRead'));
	}

	/** FAQ en dur (10 Q/R). */
	getFaq(app: SupportApp = 'client') {
		return new Promise(async (resolve, reject) => {
			try {
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: await this.service.getFaq(app) });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getFaq'));
	}

	/** Assistant IA (Groq). */
	askAssistant(payloads: { message: string; history?: Array<{ role: string; content: string }> }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.askAssistant(payloads);
				if (result.unavailable) {
					return resolve({
						status: defines.status.unavailable,
						message: 'Assistant indisponible pour le moment',
						data: null
					});
				}
				if (result.error) {
					return resolve({
						status: defines.status.unavailable,
						message: 'Assistant indisponible pour le moment',
						data: null
					});
				}
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: { reply: result.reply, escalate: result.escalate === true, category: result.category || 'autre' }
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'askAssistant'));
	}

	/** Crée un ticket pré-rempli à partir d'une conversation avec l'assistant (escalade). */
	createFromAssistant(payloads: { userId: string; history: Array<{ role: string; content: string }>; category?: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.createTicketFromAssistant(payloads);
				if (result.error) {
					return resolve({
						status: defines.status.badRequest,
						message: typeof result.data === 'string' ? result.data : locale.controller.notValidStatus,
						data: null
					});
				}
				resolve({
					status: defines.status.created,
					message: locale.controller.successSave,
					data: { ticket: result.ticket, message: result.message }
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'createFromAssistant'));
	}

	/* ---------------------------------------------------------------------- */
	/* Côté admin                                                             */
	/* ---------------------------------------------------------------------- */

	/** Liste paginée pour YOYO ADMIN. */
	adminList(payloads: {
		page?: number;
		pageSize?: number;
		status?: string;
		category?: string;
		source?: SupportApp;
		view?: 'awaiting' | 'overdue';
		q?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.listAdminTickets(payloads);
				if (result.error) throw result;
				// Métadonnées de pagination dans `message`, lignes dans `data` (convention du projet).
				resolve({ status: defines.status.requestOK, message: result.data, data: result.rows });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminList'));
	}

	/** Détail d'un ticket côté admin (client peuplé). */
	adminGetTicket(ticketId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.getTicketDetail(ticketId, undefined, true);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) throw result;
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: { ticket: result.ticket, messages: result.messages }
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminGetTicket'));
	}

	/** Contexte client d'un ticket (abonnement, économies, ancienneté) pour le panneau agent. */
	adminGetTicketContext(ticketId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.getTicketContext(ticketId);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: result.context });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminGetTicketContext'));
	}

	/** Historique scans/transactions du client d'un ticket (panneau agent). */
	adminGetClientTransactions(ticketId: string, page?: number, pageSize?: number) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.adminGetClientTransactions(ticketId, page || 1, pageSize || 20);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: result });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminGetClientTransactions'));
	}

	/** Historique des abonnements du client d'un ticket (panneau agent). */
	adminGetClientSubscriptions(ticketId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.adminGetClientSubscriptions(ticketId);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: result.rows });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminGetClientSubscriptions'));
	}

	/** Réponse du support + notification client. */
	adminReply(payloads: { ticketId: string; adminId: string; body: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.adminReply(payloads);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) {
					return resolve({
						status: defines.status.badRequest,
						message: typeof result.data === 'string' ? result.data : locale.controller.notValidStatus,
						data: null
					});
				}
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: { message: result.message } });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminReply'));
	}

	/** Compteurs basiques (§06) pour le back-office. */
	adminStats() {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.adminStats();
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: result.stats });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminStats'));
	}

	/** Met à jour le statut / l'assignation d'un ticket. */
	adminUpdate(ticketId: string, patch: { status?: string; assignedTo?: string }, adminId?: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.adminUpdateTicket(ticketId, patch, adminId);
				if (result.notFound) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Ticket'), data: null });
				}
				if (result.error) throw result;
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: { ticket: result.ticket } });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminUpdate'));
	}

	/* ---------------------------------------------------------------------- */
	/* FAQ (CMS › Paramètres › FAQ)                                           */
	/* ---------------------------------------------------------------------- */

	adminListFaq(app?: SupportApp) {
		return new Promise(async (resolve, reject) => {
			try {
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data: await faqService.adminList(app) });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminListFaq'));
	}

	adminCreateFaq(body: Pick<IFaq, 'app' | 'theme' | 'question' | 'answer'> & Partial<Pick<IFaq, 'order' | 'status'>>) {
		return new Promise(async (resolve, reject) => {
			try {
				resolve({ status: defines.status.created, message: 'Question ajoutée.', data: await faqService.create(body) });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminCreateFaq'));
	}

	adminUpdateFaq(id: string, body: Partial<IFaq>) {
		return new Promise(async (resolve, reject) => {
			try {
				const faq = await faqService.update(id, body);
				if (!faq) return resolve({ status: defines.status.notFound, message: locale.notfound('Question'), data: null });
				resolve({ status: defines.status.requestOK, message: 'Question enregistrée.', data: faq });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminUpdateFaq'));
	}

	adminRemoveFaq(id: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!(await faqService.remove(id))) {
					return resolve({ status: defines.status.notFound, message: locale.notfound('Question'), data: null });
				}
				resolve({ status: defines.status.requestOK, message: 'Question supprimée.', data: null });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminRemoveFaq'));
	}
}
