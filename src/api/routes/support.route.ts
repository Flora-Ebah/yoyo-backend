import coddyger from 'coddyger';
import { SupportController } from '../../modules/support/support.controller';
import { SUPPORT_CATEGORY_VALUES } from '../../modules/support/support.interface';
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

const CATEGORIES = SUPPORT_CATEGORY_VALUES;
const STATUSES = ['open', 'in_progress', 'resolved'];
const APPS = ['client', 'pro'];
const appQuery = {
	type: 'object',
	properties: { app: { type: 'string', enum: APPS } },
	additionalProperties: false
};
const faqBody = {
	type: 'object',
	properties: {
		app: { type: 'string', enum: APPS },
		theme: { type: 'string', maxLength: 80 },
		question: { type: 'string', minLength: 3, maxLength: 300 },
		answer: { type: 'string', minLength: 3, maxLength: 3000 },
		order: { type: 'integer', minimum: 0, maximum: 100000 },
		status: { type: 'string', enum: ['published', 'draft'] }
	},
	additionalProperties: false
};
const idParams = {
	type: 'object',
	properties: { id: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
	required: ['id'],
	additionalProperties: false
};

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
				'(sender `client`). Le propriétaire est déduit du jeton, jamais du corps. `app: pro` : ' +
				'ticket marchand, réservé aux comptes marchand ou gérant (catégories Pro).',
			body: {
				type: 'object',
				properties: {
					category: { type: 'string', enum: CATEGORIES },
					message: { type: 'string', minLength: 1 },
					attachment: { type: 'string' },
					app: { type: 'string', enum: APPS }
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
				attachment: body.attachment,
				app: body.app
			});
			return coddyger.api(reply, Q);
		}
	});

	// Liste des tickets du client
	fastify.route({
		schema: {
			tags,
			summary: 'Mes demandes d’assistance',
			description: 'Tickets du client pour l’appli demandée (`app`, Client par défaut), récents d’abord.',
			querystring: appQuery
		},
		method: 'GET',
		url: `${routePath}/tickets`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			return coddyger.api(reply, Controller.listClientTickets(user._id, (request.query as any)?.app));
		}
	});

	// FAQ — déclarée avant `/tickets/:id` pour ne pas être capturée par le param.
	fastify.route({
		schema: {
			tags,
			summary: 'FAQ (questions fréquentes)',
			description: 'FAQ publiée de l’appli demandée (`app`, Client par défaut), modifiable dans le CMS.',
			querystring: appQuery
		},
		method: 'GET',
		url: `${routePath}/faq`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => coddyger.api(reply, Controller.getFaq((request.query as any)?.app))
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

	// Créer un ticket depuis une conversation avec l'assistant (escalade) — déclaré avant
	// `/tickets/:id` pour ne pas être capturé par le param `:id`.
	fastify.route({
		schema: {
			tags,
			summary: 'Créer une demande depuis l’assistant IA',
			description:
				'Crée un ticket pré-rempli reprenant toute la conversation avec l’assistant (messages ' +
				'`client`/`bot`), pour transfert à un conseiller sans ressaisie. Propriétaire déduit du jeton.',
			body: {
				type: 'object',
				properties: {
					category: { type: 'string', enum: CATEGORIES },
					history: {
						type: 'array',
						minItems: 1,
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
				required: ['history'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/tickets/from-assistant`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const body: any = request.body;
			const user: any = request.user;
			return coddyger.api(
				reply,
				Controller.createFromAssistant({ userId: user._id, history: body.history, category: body.category })
			);
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
			description:
				'Filtres `status`, `category`, `source` (appli), `view` (`awaiting` : en attente d’un conseiller, ' +
				'`overdue` : en retard) et recherche `q` (référence ou nom du client). Paginé.',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number', minimum: 1, maximum: 100 },
					status: { type: 'string', enum: STATUSES },
					category: { type: 'string', enum: CATEGORIES },
					source: { type: 'string', enum: APPS },
					view: { type: 'string', enum: ['awaiting', 'overdue'] },
					q: { type: 'string', maxLength: 100 }
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
					category: q.category,
					source: q.source,
					view: q.view,
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

		// Contexte client d'un ticket (panneau latéral agent)
		fastify.route({
			schema: {
				tags: adminTags,
				summary: 'Contexte client d’un ticket (admin)',
				description:
					'Condensé affiché à côté de la conversation : identité du client, abonnement actif ' +
					'(nom du plan, statut, jours restants), économies cumulées + dernière réduction validée, ' +
					'et libellé des scans (« Illimités » sous abonnement actif, sinon « — »).',
				params: {
					type: 'object',
					properties: { id: { type: 'string' } },
					required: ['id'],
					additionalProperties: false
				}
			},
			method: 'GET',
			url: `${routePath}/admin/tickets/:id/context`,
			preHandler: TokenMiddleware.verifyAdmin,
			handler: (request, reply) => coddyger.api(reply, Controller.adminGetTicketContext(String(request.params.id)))
		});

	// Historique scans/transactions du client d'un ticket
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Historique scans/transactions du client (admin)',
			params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
			query: {
				type: 'object',
				properties: { page: { type: 'number' }, pageSize: { type: 'number' } },
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/admin/tickets/:id/transactions`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const q: any = request.query;
			return coddyger.api(reply, Controller.adminGetClientTransactions(String(request.params.id), q.page, q.pageSize));
		}
	});

	// Historique des abonnements du client d'un ticket
	fastify.route({
		schema: {
			tags: adminTags,
			summary: 'Historique des abonnements du client (admin)',
			params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
		},
		method: 'GET',
		url: `${routePath}/admin/tickets/:id/subscriptions`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => coddyger.api(reply, Controller.adminGetClientSubscriptions(String(request.params.id)))
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

	/* ====================================================================== */
	/* ADMIN — FAQ (CMS › Paramètres › FAQ)                                   */
	/* ====================================================================== */

	fastify.route({
		schema: { tags: adminTags, summary: 'FAQ des deux applis, brouillons compris (admin)', querystring: appQuery },
		method: 'GET',
		url: `${routePath}/admin/faq`,
		preHandler: TokenMiddleware.can('read', 'support'),
		handler: (request, reply) => coddyger.api(reply, Controller.adminListFaq((request.query as any)?.app))
	});

	fastify.route({
		schema: { tags: adminTags, summary: 'Ajouter une question à la FAQ (admin)', body: { ...faqBody, required: ['app', 'question', 'answer'] } },
		method: 'POST',
		url: `${routePath}/admin/faq`,
		preHandler: TokenMiddleware.can('update', 'support'),
		handler: (request, reply) => coddyger.api(reply, Controller.adminCreateFaq(request.body))
	});

	fastify.route({
		schema: { tags: adminTags, summary: 'Modifier une question de la FAQ (admin)', params: idParams, body: faqBody },
		method: 'PUT',
		url: `${routePath}/admin/faq/:id`,
		preHandler: TokenMiddleware.can('update', 'support'),
		handler: (request, reply) => coddyger.api(reply, Controller.adminUpdateFaq(request.params.id, request.body))
	});

	fastify.route({
		schema: { tags: adminTags, summary: 'Supprimer une question de la FAQ (admin)', params: idParams },
		method: 'DELETE',
		url: `${routePath}/admin/faq/:id`,
		preHandler: TokenMiddleware.can('update', 'support'),
		handler: (request, reply) => coddyger.api(reply, Controller.adminRemoveFaq(request.params.id))
	});

	done();
};

export default defaultRoute;
