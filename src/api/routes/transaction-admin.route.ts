import coddyger from 'coddyger';
import { transactionAdminService, RECONCILE_MAX_ROWS } from '../../modules/transaction/transaction-admin.service';
import { PAYMENT_PROVIDERS } from '../../modules/transaction/transaction.service';
import { TokenMiddleware } from '../middleware';

const routePath = '/transactions';
const tags: string[] = ['Transactions (admin)'];

const idParams = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: ['id'],
	additionalProperties: false
};

/** Activation manuelle, remboursement et rapprochement des paiements en ligne (Excel CMS n°12). */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Activer un paiement resté en attente',
			description: "Ré-interroge d'abord le prestataire ; sinon force l'activation, tracée dans `manualActivation`.",
			params: idParams,
			body: {
				type: 'object',
				properties: {
					ref: { type: 'string', minLength: 3, maxLength: 120 },
					reason: { type: 'string', maxLength: 500 }
				},
				required: ['ref'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/:id/activate`,
		preHandler: TokenMiddleware.can('update', 'transactions'),
		handler: (request, reply) => {
			const body: any = request.body;
			return coddyger.api(reply, transactionAdminService.activate(request.params.id, body, request.user._id));
		}
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Enregistrer un remboursement',
			description: 'Le remboursement est fait chez le prestataire ; il est consigné ici (statut `refunded`).',
			params: idParams,
			body: {
				type: 'object',
				properties: {
					amount: { type: 'number', minimum: 1 },
					ref: { type: 'string', minLength: 3, maxLength: 120 },
					reason: { type: 'string', minLength: 3, maxLength: 500 },
					cancelSubscription: { type: 'boolean' }
				},
				required: ['amount', 'ref', 'reason'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/:id/refund`,
		preHandler: TokenMiddleware.can('update', 'transactions'),
		handler: (request, reply) => {
			const body: any = request.body;
			return coddyger.api(reply, transactionAdminService.refund(request.params.id, body, request.user._id));
		}
	});

	// Garde en lecture : le rapprochement ne modifie rien, un profil « Lecture seule » peut le lancer.
	fastify.route({
		schema: {
			tags,
			summary: 'Rapprocher un relevé du prestataire',
			body: {
				type: 'object',
				properties: {
					paymentMethod: { type: 'string', enum: [...PAYMENT_PROVIDERS] },
					from: { type: 'string' },
					to: { type: 'string' },
					rows: {
						type: 'array',
						maxItems: RECONCILE_MAX_ROWS,
						items: {
							type: 'object',
							properties: {
								ref: { type: 'string', maxLength: 200 },
								amount: { type: ['number', 'null'] },
								date: { type: ['string', 'null'], maxLength: 40 }
							},
							required: ['ref'],
							additionalProperties: false
						}
					}
				},
				required: ['rows'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/reconcile`,
		bodyLimit: 2 * 1024 * 1024,
		preHandler: TokenMiddleware.can('read', 'transactions'),
		handler: (request, reply) => coddyger.api(reply, transactionAdminService.reconcile(request.body as any))
	});

	done();
};

export default defaultRoute;
