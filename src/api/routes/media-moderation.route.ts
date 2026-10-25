import coddyger from 'coddyger';
import { MediaModerationController } from '../../modules/media-moderation';
import { TokenMiddleware } from '../middleware';

const Controller: MediaModerationController = new MediaModerationController();
const routePath = '/media-moderation';
const tags = ['Modération des médias'];

const idParams = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: ['id'],
	additionalProperties: false
};

const defaultRoute = (fastify: any, options: any, done: any) => {
	// Liste des médias analysés (scores de confiance) + compteurs par statut.
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des médias modérés',
			query: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['approved', 'flagged', 'rejected', 'unchecked'] },
					page: { type: 'number' },
					pageSize: { type: 'number' }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: TokenMiddleware.can('read', 'moderation'),
		handler: (request: any, reply: any) => {
			const { status, page, pageSize } = request.query;
			return coddyger.api(reply, Controller.list({ status, page, pageSize }));
		}
	});

	// Compteurs par statut (badges de l'écran admin).
	fastify.route({
		schema: { tags, summary: 'Compteurs de modération par statut' },
		method: 'GET',
		url: `${routePath}/stats`,
		preHandler: TokenMiddleware.can('read', 'moderation'),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.stats())
	});

	// URL d'aperçu (y compris d'un média bloqué, que `/file/` ne sert plus).
	fastify.route({
		schema: { tags, summary: "Aperçu d'un média modéré", params: idParams },
		method: 'GET',
		url: `${routePath}/:id/preview`,
		preHandler: TokenMiddleware.can('read', 'moderation'),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.preview(request.params.id))
	});

	// Décision admin : approuver (rendre visible) ou rejeter (supprimer).
	fastify.route({
		schema: {
			tags,
			summary: 'Approuver ou rejeter un média',
			params: idParams,
			body: {
				type: 'object',
				properties: { action: { type: 'string', enum: ['approve', 'reject'] } },
				required: ['action'],
				additionalProperties: false
			}
		},
		method: 'PATCH',
		url: `${routePath}/:id`,
		preHandler: TokenMiddleware.can('update', 'moderation'),
		handler: (request: any, reply: any) => {
			const user: any = request.user;
			return coddyger.api(reply, Controller.review(request.params.id, request.body.action, String(user._id)));
		}
	});

	// Relancer l'analyse (ex. média envoyé avant l'activation de Rekognition).
	fastify.route({
		schema: { tags, summary: "Relancer l'analyse d'un média", params: idParams },
		method: 'POST',
		url: `${routePath}/:id/rescan`,
		preHandler: TokenMiddleware.can('update', 'moderation'),
		handler: (request: any, reply: any) => coddyger.api(reply, Controller.rescan(request.params.id))
	});

	done();
};

export default defaultRoute;
