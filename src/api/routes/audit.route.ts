import coddyger from 'coddyger';
import { AuditController } from '../../modules/audit/audit.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/audit';
const Controller: AuditController = new AuditController();
const tags: string[] = ['Journal d\'audit (admin)'];

/**
 * Journal d'audit centralisé — LECTURE seule, réservée aux administrateurs.
 * Les entrées sont écrites automatiquement par le hook global `onResponse` (cf. `router.ts`).
 */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Lister le journal d\'audit',
			description: 'Historique des actions sensibles du back-office. Filtres : domaine, méthode, succès, recherche, période.',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					subject: { type: 'string' },
					method: { type: 'string' },
					success: { type: 'string' },
					q: { type: 'string' },
					from: { type: 'string' },
					to: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const q: any = request.query;
			return coddyger.api(
				reply,
				Controller.list({
					page: q.page || 1,
					pageSize: q.pageSize || 50,
					subject: q.subject,
					method: q.method,
					success: q.success,
					q: q.q,
					from: q.from,
					to: q.to
				})
			);
		}
	});

	fastify.route({
		schema: { tags, summary: 'Domaines distincts du journal (pour le filtre)' },
		method: 'GET',
		url: `${routePath}/subjects`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => coddyger.api(reply, Controller.subjects())
	});

	done();
};

export default defaultRoute;
