import coddyger from 'coddyger';
import { partnerValidationService } from '../../modules/partner/partner-validation.service';
import { TokenMiddleware } from '../middleware';

const tags: string[] = ['Partenaires YoYo'];

const idParams = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: ['id'],
	additionalProperties: false
};

/** Validation des boutiques créées par les marchands (Excel CMS n°14). */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Boutiques à valider ou refusées',
			query: {
				type: 'object',
				properties: {
					tab: { type: 'string', enum: ['pending', 'rejected'] },
					q: { type: 'string', maxLength: 100 },
					page: { type: 'integer', minimum: 1 },
					pageSize: { type: 'integer', minimum: 1, maximum: 100 }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: '/partners/validation',
		preHandler: TokenMiddleware.can('read', 'pros'),
		handler: (request, reply) => coddyger.api(reply, partnerValidationService.list(request.query ?? {}))
	});

	fastify.route({
		schema: { tags, summary: 'Valider une boutique', params: idParams },
		method: 'POST',
		url: '/partners/:id/validate',
		preHandler: TokenMiddleware.can('update', 'pros'),
		handler: (request, reply) =>
			coddyger.api(reply, partnerValidationService.validate(request.params.id, String(request.user._id)))
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Refuser une boutique',
			params: idParams,
			body: {
				type: 'object',
				properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } },
				required: ['reason'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: '/partners/:id/reject',
		preHandler: TokenMiddleware.can('update', 'pros'),
		handler: (request, reply) =>
			coddyger.api(reply, partnerValidationService.reject(request.params.id, request.body.reason, String(request.user._id)))
	});

	done();
};

export default defaultRoute;
