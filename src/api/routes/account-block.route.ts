import coddyger from 'coddyger';
import { accountBlockService, MAX_BLOCK_DAYS } from '../../modules/account-block';
import { TokenMiddleware } from '../middleware';

const routePath = '/clients';
const tags: string[] = ['Clients'];

const idParams = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: ['id'],
	additionalProperties: false
};

/** Blocage / déblocage d'un compte utilisateur ou marchand (Excel CMS n°2). */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Bloquer un compte',
			description: '`days` absent ou null : blocage définitif, levé seulement à la main.',
			params: idParams,
			body: {
				type: 'object',
				properties: {
					reason: { type: 'string', minLength: 3, maxLength: 500 },
					days: { type: ['integer', 'null'], minimum: 1, maximum: MAX_BLOCK_DAYS }
				},
				required: ['reason'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/:id/block`,
		preHandler: TokenMiddleware.can('update', 'clients'),
		handler: (request, reply) => {
			const body: any = request.body;
			const Q = accountBlockService.block(request.params.id, { reason: body.reason, days: body.days ?? null }, request.user._id);
			return coddyger.api(reply, Q);
		}
	});

	fastify.route({
		schema: { tags, summary: 'Débloquer un compte', params: idParams },
		method: 'POST',
		url: `${routePath}/:id/unblock`,
		preHandler: TokenMiddleware.can('update', 'clients'),
		handler: (request, reply) => {
			const Q = accountBlockService.unblock(request.params.id, request.user._id);
			return coddyger.api(reply, Q);
		}
	});

	fastify.route({
		schema: { tags, summary: "Historique des blocages d'un compte", params: idParams },
		method: 'GET',
		url: `${routePath}/:id/blocks`,
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: (request, reply) => {
			const Q = accountBlockService.list(request.params.id);
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
