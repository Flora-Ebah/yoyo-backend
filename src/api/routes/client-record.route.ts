import coddyger from 'coddyger';
import { clientRecordService } from '../../modules/client/client-record.service';
import { TokenMiddleware } from '../middleware';

const routePath = '/clients';
const tags: string[] = ['Clients'];

const idParams = {
	type: 'object',
	properties: { id: { type: 'string' } },
	required: ['id'],
	additionalProperties: false
};

const pageQuery = {
	type: 'object',
	properties: { page: { type: 'number', minimum: 1 }, pageSize: { type: 'number', minimum: 1, maximum: 100 } },
	additionalProperties: false
};

/** Fiche utilisateur 360 du back-office (Excel CMS n°11). Lecture seule. */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: { tags, summary: "Paiements en ligne d'un compte (admin)", params: idParams, query: pageQuery },
		method: 'GET',
		url: `${routePath}/:id/transactions`,
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: (request, reply) => coddyger.api(reply, clientRecordService.transactions(request.params.id, request.query))
	});

	fastify.route({
		schema: { tags, summary: "Achats en boutique d'un compte (admin)", params: idParams, query: pageQuery },
		method: 'GET',
		url: `${routePath}/:id/payments`,
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: (request, reply) => coddyger.api(reply, clientRecordService.payments(request.params.id, request.query))
	});

	fastify.route({
		schema: { tags, summary: "Tickets de support d'un compte (admin)", params: idParams },
		method: 'GET',
		url: `${routePath}/:id/tickets`,
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: (request, reply) => coddyger.api(reply, clientRecordService.tickets(request.params.id))
	});

	done();
};

export default defaultRoute;
