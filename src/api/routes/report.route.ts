import coddyger, { defines } from 'coddyger';
import { reportService, REPORT_REASONS, REPORT_TARGETS } from '../../modules/report';
import { TokenMiddleware } from '../middleware';

const tags: string[] = ['Signalements'];

/** Signalements de contenus (Excel CMS n°13) : envoi depuis l'appli Client, traitement dans le CMS. */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: {
			tags,
			summary: 'Signaler une boutique, un média ou un commentaire',
			body: {
				type: 'object',
				properties: {
					targetType: { type: 'string', enum: REPORT_TARGETS },
					targetId: { type: 'string', minLength: 1, maxLength: 300 },
					reason: { type: 'string', enum: REPORT_REASONS.map((r) => r.key) },
					comment: { type: 'string', maxLength: 500 }
				},
				required: ['targetType', 'targetId', 'reason'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: '/reports',
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			if (!user?._id || user.isAdmin) {
				return coddyger.api(reply, Promise.resolve({ status: defines.status.forbidden, message: 'Réservé aux utilisateurs de l’appli.', data: null }));
			}
			return coddyger.api(reply, reportService.create(String(user._id), request.body));
		}
	});

	fastify.route({
		schema: { tags, summary: 'Motifs de signalement' },
		method: 'GET',
		url: '/reports/reasons',
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) =>
			coddyger.api(reply, Promise.resolve({ status: defines.status.requestOK, message: 'Ok', data: REPORT_REASONS }))
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Signalements regroupés par contenu (CMS)',
			query: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['open', 'actioned', 'dismissed'] },
					targetType: { type: 'string', enum: REPORT_TARGETS },
					page: { type: 'integer', minimum: 1 },
					pageSize: { type: 'integer', minimum: 1, maximum: 100 }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: '/admin/reports',
		preHandler: TokenMiddleware.can('read', 'moderation'),
		handler: (request, reply) => coddyger.api(reply, reportService.adminList(request.query ?? {}))
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Traiter les signalements d’un contenu',
			body: {
				type: 'object',
				properties: {
					targetType: { type: 'string', enum: REPORT_TARGETS },
					targetId: { type: 'string', minLength: 1, maxLength: 300 },
					action: { type: 'string', enum: ['dismiss', 'remove-comment', 'remove-media', 'suspend-boutique'] },
					note: { type: 'string', maxLength: 500 }
				},
				required: ['targetType', 'targetId', 'action'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: '/admin/reports/resolve',
		preHandler: TokenMiddleware.can('update', 'moderation'),
		handler: (request, reply) => coddyger.api(reply, reportService.resolve(request.body, String(request.user._id)))
	});

	done();
};

export default defaultRoute;
