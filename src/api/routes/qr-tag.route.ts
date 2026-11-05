import coddyger from 'coddyger';
import { QrTagController, QR_BATCH_MAX } from '../../modules/qr-tag';
import { TokenMiddleware } from '../middleware';

const routePath = '/qr-tags';
const Controller = new QrTagController();
const tags: string[] = ['QR Tags (stickers)'];

// Les stickers relèvent de la gestion des marchands : on réutilise le sujet RBAC `pros` plutôt que
// d'introduire un nouveau sujet (qui exigerait de reconfigurer les rôles existants).
const SUBJECT = 'pros';

const OBJECT_ID = '^[0-9a-fA-F]{24}$';
const idParams = { type: 'object', properties: { id: { type: 'string', pattern: OBJECT_ID } }, required: ['id'] };

const defaultRoute: any = (fastify: any, options: any, done: any) => {
	// ---- Administration / commerciaux -----------------------------------------------------------

	// Générer un lot de stickers vierges
	fastify.route({
		schema: {
			tags,
			summary: 'Générer un lot de QR (stickers vierges)',
			body: {
				type: 'object',
				properties: {
					label: { type: 'string', minLength: 2, maxLength: 160 },
					count: { type: 'integer', minimum: 1, maximum: QR_BATCH_MAX },
					prefix: { type: 'string', maxLength: 6 }
				},
				required: ['label', 'count'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/batch`,
		preHandler: TokenMiddleware.can('create', SUBJECT),
		handler: (request: any, reply: any) =>
			coddyger.api(reply, Controller.generateBatch(request.body, String(request.user?._id)))
	});

	// Liste des lots
	fastify.route({
		schema: { tags, summary: 'Liste des lots de QR' },
		method: 'GET',
		url: `${routePath}/batches`,
		preHandler: TokenMiddleware.can('read', SUBJECT),
		handler: (_request: any, reply: any) => coddyger.api(reply, Controller.listBatches())
	});

	// Liste des stickers (filtrable)
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des QR (stickers)',
			query: {
				type: 'object',
				properties: {
					q: { type: 'string', maxLength: 60 },
					status: { type: 'string', enum: ['vierge', 'affecte', 'desactive'] },
					batch: { type: 'string', pattern: OBJECT_ID },
					page: { type: 'integer', minimum: 1 },
					pageSize: { type: 'integer', minimum: 1, maximum: 2000 }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: TokenMiddleware.can('read', SUBJECT),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.list(request.query ?? {}))
	});

	// Affecter un sticker à une boutique (par code — terrain — ou par id)
	fastify.route({
		schema: {
			tags,
			summary: 'Affecter un QR à une boutique',
			body: {
				type: 'object',
				properties: {
					code: { type: 'string', maxLength: 60 },
					id: { type: 'string', pattern: OBJECT_ID },
					boutiqueId: { type: 'string', pattern: OBJECT_ID },
					reassign: { type: 'boolean' }
				},
				required: ['boutiqueId'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/assign`,
		preHandler: TokenMiddleware.can('create', SUBJECT),
		handler: (request: any, reply: any) =>
			coddyger.api(reply, Controller.assign(request.body, String(request.user?._id)))
	});

	// Détacher un sticker
	fastify.route({
		schema: { tags, summary: 'Détacher un QR de sa boutique', params: idParams },
		method: 'POST',
		url: `${routePath}/:id/unassign`,
		preHandler: TokenMiddleware.can('create', SUBJECT),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.unassign(request.params.id))
	});

	// Désactiver / réactiver
	fastify.route({
		schema: { tags, summary: 'Désactiver un QR', params: idParams },
		method: 'POST',
		url: `${routePath}/:id/deactivate`,
		preHandler: TokenMiddleware.can('update', SUBJECT),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.setActive(request.params.id, false))
	});
	fastify.route({
		schema: { tags, summary: 'Réactiver un QR', params: idParams },
		method: 'POST',
		url: `${routePath}/:id/reactivate`,
		preHandler: TokenMiddleware.can('update', SUBJECT),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.setActive(request.params.id, true))
	});

	// ---- Application cliente ---------------------------------------------------------------------

	// Résolution d'un code scanné → boutique cible (puis flux de scan/redeem habituel).
	fastify.route({
		schema: {
			tags,
			summary: "Résoudre un QR scanné vers sa boutique",
			params: { type: 'object', properties: { code: { type: 'string', maxLength: 60 } }, required: ['code'] }
		},
		method: 'GET',
		url: `${routePath}/resolve/:code`,
		preHandler: TokenMiddleware.verify,
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.resolve(request.params.code))
	});

	done();
};

export default defaultRoute;
