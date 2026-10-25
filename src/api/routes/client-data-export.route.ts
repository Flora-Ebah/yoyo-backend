import coddyger, { defines } from 'coddyger';
import { clientDataExportService } from '../../modules/client/client-data-export.service';
import { AuditService } from '../../modules/audit/audit.service';
import { TokenMiddleware } from '../middleware';

const tags: string[] = ['Clients'];
const AUDIT = new AuditService();

/** Export des données personnelles d'un compte (Excel CMS n°16). */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.route({
		schema: { tags, summary: 'Télécharger mes données personnelles (1 fois par 24 h)' },
		method: 'GET',
		url: '/clients/me/data-export',
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			if (!user?._id || user.isAdmin) {
				return coddyger.api(reply, Promise.resolve({ status: defines.status.forbidden, message: 'Réservé aux utilisateurs de l’appli.', data: null }));
			}
			return coddyger.api(reply, clientDataExportService.exportForSelf(String(user._id)));
		}
	});

	fastify.route({
		schema: { tags, summary: 'Recevoir mes données personnelles par e-mail (1 fois par 24 h)' },
		method: 'POST',
		url: '/clients/me/data-export/email',
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;
			if (!user?._id || user.isAdmin) {
				return coddyger.api(reply, Promise.resolve({ status: defines.status.forbidden, message: 'Réservé aux utilisateurs de l’appli.', data: null }));
			}
			return coddyger.api(reply, clientDataExportService.emailForSelf(String(user._id)));
		}
	});

	fastify.route({
		schema: {
			tags,
			summary: "Exporter les données personnelles d'un compte (demande reçue par le support)",
			params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
		},
		method: 'GET',
		url: '/clients/:id/data-export',
		preHandler: TokenMiddleware.can('read', 'clients'),
		handler: async (request, reply) => {
			const res: any = await clientDataExportService.exportForAdmin(request.params.id);
			if (res.status === defines.status.requestOK) {
				// Lecture de données personnelles complètes : tracée comme un export.
				request.auditHandled = true;
				const path = String(request.url || '').split('?')[0];
				await AUDIT.recordExport(
					request.user,
					{ entity: 'donnees-personnelles', filters: { clientId: request.params.id }, count: 1, format: 'json' },
					{ ip: request.ip, userAgent: request.headers?.['user-agent'], path }
				);
			}
			return coddyger.api(reply, Promise.resolve(res));
		}
	});

	done();
};

export default defaultRoute;
