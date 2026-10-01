import coddyger from 'coddyger';
import { LegalController } from '../../modules/legal/legal.controller';
import { TokenMiddleware, AppCheckMiddleware } from '../middleware';

const routePath = '/legal';
const Controller: LegalController = new LegalController();
const tags: string[] = ['Pages légales'];

/**
 * Pages légales dynamiques (CGU, confidentialité, mentions ARTCI, …), pilotées depuis le
 * backoffice — AUCUN texte légal codé en dur, un document par `slug`.
 *
 * - Lecture publique (App Check, comme `GET /platform-config`) :
 *   `GET {prefix}/legal`        → liste des pages publiées (status 'active').
 *   `GET {prefix}/legal/:slug`  → une page publiée (404 si inconnue ou status != 'active').
 * - Écriture admin (token admin, comme `PUT /platform-config`) :
 *   `PUT {prefix}/legal/:slug`  → upsert (crée si le slug n'existe pas), `updatedAt` posé serveur.
 */
const sectionSchema = {
	type: 'object',
	properties: {
		heading: { type: 'string' },
		body: { type: 'string' }
	},
	required: ['body'],
	additionalProperties: false
};

const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: { tags, summary: 'Lister les pages légales publiées' },
		method: 'GET',
		url: `${routePath}`,
		preHandler: AppCheckMiddleware.verify,
		handler: (request, reply) => coddyger.api(reply, Controller.list())
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Lire une page légale par slug',
			params: {
				type: 'object',
				properties: { slug: { type: 'string' } },
				required: ['slug']
			}
		},
		method: 'GET',
		url: `${routePath}/:slug`,
		preHandler: AppCheckMiddleware.verify,
		handler: (request, reply) => coddyger.api(reply, Controller.get(request.params.slug))
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Créer/mettre à jour une page légale (upsert)',
			params: {
				type: 'object',
				properties: { slug: { type: 'string' } },
				required: ['slug']
			},
			body: {
				type: 'object',
				properties: {
					title: { type: 'string', minLength: 1 },
					contentType: { type: 'string', enum: ['sections', 'text', 'html', 'markdown'] },
					sections: { type: 'array', items: sectionSchema },
					content: { type: 'string' },
					version: { type: 'string' },
					status: { type: 'string', enum: ['active', 'inactive', 'removed'] }
				},
				required: ['title'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}/:slug`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => coddyger.api(reply, Controller.upsert(request.params.slug, request.body))
	});

	done();
};

export default defaultRoute;
