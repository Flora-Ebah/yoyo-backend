import coddyger, { defines } from 'coddyger';
import { AuditController } from '../../modules/audit/audit.controller';
import { AuditService } from '../../modules/audit/audit.service';
import { TokenMiddleware } from '../middleware';

const routePath = '/audit';
const Controller: AuditController = new AuditController();
const AUDIT = new AuditService();
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
					action: { type: 'string' },
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
		preHandler: TokenMiddleware.can('read', 'audit'),
		handler: (request, reply) => {
			const q: any = request.query;
			return coddyger.api(
				reply,
				Controller.list({
					page: q.page || 1,
					pageSize: q.pageSize || 50,
					subject: q.subject,
					action: q.action,
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
		preHandler: TokenMiddleware.can('read', 'audit'),
		handler: (request, reply) => coddyger.api(reply, Controller.subjects())
	});

	// Trace d'un export (Excel CMS n°9). Tout admin peut tracer ses propres exports, y compris un
	// profil « Lecture seule » ; le droit de lire la liste exportée est vérifié par le CMS et par
	// l'endpoint de liste lui-même. Le hook d'audit global est neutralisé (`auditHandled`) pour ne
	// pas enregistrer la même action deux fois.
	fastify.route({
		schema: {
			tags,
			summary: 'Tracer un export de données',
			body: {
				type: 'object',
				properties: {
					entity: { type: 'string', minLength: 1, maxLength: 60 },
					filters: { type: 'object', maxProperties: 30, additionalProperties: { type: ['string', 'number', 'boolean', 'null'] } },
					count: { type: 'integer', minimum: 0 },
					format: { type: 'string', enum: ['csv'] }
				},
				required: ['entity'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/export`,
		config: { allowReadOnly: true },
		preHandler: TokenMiddleware.verifyAdmin,
		handler: async (request, reply) => {
			request.auditHandled = true;
			const path = String(request.url || '').split('?')[0];
			await AUDIT.recordExport(request.user, request.body as any, { ip: request.ip, userAgent: request.headers?.['user-agent'], path });
			return coddyger.api(reply, Promise.resolve({ status: defines.status.requestOK, message: 'Export tracé', data: null }));
		}
	});

	done();
};

export default defaultRoute;
