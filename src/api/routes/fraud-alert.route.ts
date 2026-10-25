import coddyger from 'coddyger';
import { fraudAlertService, FRAUD_ALERT_TYPES } from '../../modules/fraud-alert';
import { TokenMiddleware } from '../middleware';

const tags: string[] = ['Alertes fraude'];

/** File d'alertes fraude du back-office (Excel CMS n°3). */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Lister les alertes fraude',
			query: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['open', 'actioned', 'dismissed'] },
					type: { type: 'string', enum: FRAUD_ALERT_TYPES },
					page: { type: 'integer', minimum: 1 },
					pageSize: { type: 'integer', minimum: 1, maximum: 100 }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: '/fraud-alerts',
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: (request, reply) => coddyger.api(reply, fraudAlertService.list(request.query ?? {}))
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Traiter une alerte fraude',
			params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
			body: {
				type: 'object',
				properties: {
					action: { type: 'string', enum: ['dismiss', 'blocked', 'invalidate-ticket'] },
					note: { type: 'string', maxLength: 500 }
				},
				required: ['action'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: '/fraud-alerts/:id/resolve',
		preHandler: TokenMiddleware.can('update', 'clients'),
		handler: (request, reply) =>
			coddyger.api(reply, fraudAlertService.resolve(request.params.id, request.body, String(request.user._id)))
	});

	done();
};

export default defaultRoute;
