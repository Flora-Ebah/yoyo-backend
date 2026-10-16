import coddyger from 'coddyger';
import { SupportController } from '../../modules/support/support.controller';
import { TokenMiddleware } from '../middleware';

/**
 * Routes « Assistance & messagerie intégrée » (support).
 *
 * Système de TICKETS de support asynchrones (pas de chat temps réel) : le client ouvre une demande
 * depuis l'app (catégorie + message), échange en fil, le support répond depuis YOYO ADMIN.
 *
 * - Routes CLIENT : `TokenMiddleware.verify`. L'appelant est TOUJOURS lu dans `request.user._id`,
 *   jamais dans le corps — un client ne peut ouvrir ou lire que ses propres tickets.
 * - Routes ADMIN : `TokenMiddleware.verifyAdmin` (back-office).
 */

const routePath = '/support';
const Controller: SupportController = new SupportController();
const tags: string[] = ['Assistance & messagerie (support)'];
const adminTags: string[] = ['Admin — Assistance (support)'];

const CATEGORIES = ['scan', 'abonnement_paiement', 'marchand', 'compte', 'autre'];
const STATUSES = ['open', 'in_progress', 'resolved'];

const defaultRoute: any = (fastify: any, options, done) => {
	/* ====================================================================== */
	/* CLIENT                                                                 */
	/* ====================================================================== */

	// Créer un ticket (+ premier message)
	fastify.route({
		schema: {
			tags,
			summary: 'Créer une demande d’assistance',
			description:
				'Ouvre un ticket (status `open`, `reference` générée) et enregistre le premier message ' +
				'(sender `client`). Le propriétaire est déduit du jeton, jamais du corps.',
			body: {
				type: 'object',
				properties: {
					category: { type: 'string', enum: CATEGORIES },
					message: { type: 'string', minLength: 1 },
					attachment: { type: 'string' }
				},
				required: ['category', 'message'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/tickets`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const body: any = request.body;
			const user: any = request.user;
			const Q = Controller.createTicket({
				userId: user._id,
				category: body.category,
				message: body.message,
				attachment: body.attachment
			});
			return coddyger.api(reply, Q);
		}
	});

	// Liste des tickets du client
	fastify.route({
		schema: {
			tags,
			summary: 'Mes demandes d’assistance',
			description: 'Tickets du client, récents d’abord, avec aperçu du dernier message.'
		},
		method: 'GET',
		url: `${routePath}/tickets`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			return coddyger.api(reply, Controller.listClientTickets(user._id));
		}
	});

	// FAQ (10 Q/R en dur) — déclarée avant `/tickets/:id` pour ne pas être capturée par le param.
	fastify.route({
		schema: {
			tags,
			summary: 'FAQ (questions fréquentes)',
			description: 'Les 10 questions/réponses du centre d’aide, servies en dur.'
		},
		method: 'GET',
		url: `${routePath}/faq`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => coddyger.api(reply, Controller.getFaq())
	});

	// Assistant IA (Groq)
	fastify.route({
		schema: {
			tags,
			summary: 'Assistant IA',
			description:
				'Appelle l’assistant IA (Groq) sur la base de la FAQ. Renvoie `{ reply }`. ' +
				'503 si la clé IA n’est pas configurée.',
			body: {
				type: 'object',
				properties: {
					message: { type: 'string', minLength: 1 },
					history: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								role: { type: 'string' },
								content: { type: 'string' }
							},
							required: ['role', 'content'],
							additionalProperties: false
						}
					}
				},
				required: ['message'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/assistant`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const body: any = request.body;
			return coddyger.api(reply, Controller.askAssistant({ message: body.message, history: body.history }));
		}
	});

	// Détail d'un ticket du client
	fastify.route({
		schema: {
			tags,
			summary: 'Détail d’un de mes tickets',
			description: '403 si le ticket n’appartient pas au client. Messages en ordre chronologique.',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/tickets/:id`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			return coddyger.api(reply, Controller.getClientTicket(String(request.params.id), user._id));
		}
	});

	// Ajouter un message client à un ticket
	fastify.route({
		schema: {
			tags,
			summary: 'Répondre dans un de mes tickets',
			description: '403 si le ticket n’appartient pas au client.',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			},
			body: {
				type: 'object',
				properties: {
					body: { type: 'string', minLength: 1 },
					attachment: { type: 'string' }
				},
				required: ['body'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/tickets/:id/messages`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			const body: any = request.body;
			return coddyger.api(
				reply,
				Controller.addClientMessage({
					ticketId: String(request.params.id),
					userId: user._id,
					body: body.body,
					attachment: body.attachment
				})
			);
		}
	});

	// Marquer lus les messages support/bot
	fastify.route({
		schema: {
			tags,
			summary: 'Marquer mes messages comme lus',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/tickets/:id/read`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			return coddyger.api(reply, Controller.markRead(String(request.params.id), user._id));
		}
	});

	/* ====================================================================== */
	/* ADMIN                                                                  */
	/* ====================================================================== */

	// Liste paginée des tickets
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Liste des tickets (admin)',
			description: 'Filtre `status` + recherche `q` (référence ou nom du client). Paginé.',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					status: { type: 'string', enum: STATUSES },
					q: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/admin/tickets`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const q: any = request.query;
			return coddyger.api(
				reply,
				Controller.adminList({
					page: q.page || 1,
					pageSize: q.pageSize || 20,
					status: q.status,
					q: q.q
				})
			);
		}
	});

	// Compteurs basiques (§06)
	fastify.route({
		schema: { tags: adminTags, summary: 'Compteurs des demandes (admin)' },
		method: 'GET',
		url: `${routePath}/admin/stats`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => coddyger.api(reply, Controller.adminStats())
	});

	// Détail d'un ticket (client peuplé)
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Détail d’un ticket (admin)',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/admin/tickets/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => coddyger.api(reply, Controller.adminGetTicket(String(request.params.id)))
	});

	// Réponse du support (+ notification client)
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Répondre à un ticket (admin)',
			description:
				'Ajoute un message `support`, notifie le client (push ciblé par userId) et passe un ticket ' +
				'`open` en `in_progress`.',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			},
			body: {
				type: 'object',
				properties: { body: { type: 'string', minLength: 1 } },
				required: ['body'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/admin/tickets/:id/reply`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const user: any = request.user;
			const body: any = request.body;
			return coddyger.api(
				reply,
				Controller.adminReply({ ticketId: String(request.params.id), adminId: user._id, body: body.body })
			);
		}
	});

	// Mise à jour statut / assignation
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Mettre à jour un ticket (admin)',
			params: {
				type: 'object',
				properties: { id: { type: 'string' } },
				required: ['id'],
				additionalProperties: false
			},
			body: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: STATUSES },
					assignedTo: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'PATCH',
		url: `${routePath}/admin/tickets/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const body: any = request.body;
			return coddyger.api(
				reply,
				Controller.adminUpdate(String(request.params.id), { status: body.status, assignedTo: body.assignedTo === 'me' ? (request.user as any)._id : body.assignedTo }, (request.user as any)._id)
			);
		}
	});

	done();
};

export default defaultRoute;
