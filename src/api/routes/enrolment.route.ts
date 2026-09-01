import coddyger from 'coddyger';
import { EnrolmentController } from '../../modules/enrolment/enrolment.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/partners/enrolments';
const Controller: EnrolmentController = new EnrolmentController();
const tags: string[] = ['Activité commerciale (enrôlements)'];

/**
 * Garde de la liste des enrôlements.
 *
 * L'URL est unique (le front persiste ses filtres dedans), mais elle sert deux publics :
 *  - `?scope=me` : n'importe quel admin consulte **ses** enrôlements — aucune permission spéciale,
 *    puisque le périmètre est imposé côté serveur ;
 *  - sans `scope` : vue globale sur l'activité de tous les commerciaux, donc `enrolments:read`.
 *
 * `canStrict` et non `can` : un profil resté à `ability: []` obtiendrait sinon la vue globale, par
 * le repli de compatibilité. Sur une route neuve, ce repli n'a aucune dette à honorer.
 */
const listGuard = async (request: any, reply: any) => {
	await TokenMiddleware.verifyAdmin(request, reply, () => {});

	if (reply.sent) {
		return;
	}

	if (request.query?.scope !== 'me') {
		return TokenMiddleware.canStrict('read', 'enrolments')(request, reply);
	}
};

const defaultRoute: any = (fastify: any, options, done) => {
	// Liste des enrôlements — vue commerciale (`scope=me`) ou vue admin globale
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des enrôlements de marchands',
			description:
				"Avec `scope=me`, le serveur restreint la liste aux enrôlements de l'appelant et ignore tout `commercialId` fourni. Sans `scope`, la permission `enrolments:read` est exigée.",
			query: {
				type: 'object',
				properties: {
					scope: { type: 'string', enum: ['me'] },
					commercialId: { type: 'string' },
					status: { type: 'string', enum: ['pending', 'activated'] },
					from: { type: 'string' },
					to: { type: 'string' },
					q: { type: 'string' },
					page: { type: 'number' },
					pageSize: { type: 'number' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: listGuard,
		handler: (request, reply) => {
			const user: any = request.user;
			const scope: any = request.query.scope;

			// Cloisonnement : sur `scope=me`, l'identité vient du jeton et écrase ce que le client
			// a pu envoyer. Ne jamais faire confiance à un `commercialId` de requête ici.
			const commercialId: any = scope === 'me' ? user?._id : request.query.commercialId;

			let Q = Controller.list({
				commercialId,
				status: request.query.status,
				from: request.query.from,
				to: request.query.to,
				q: request.query.q,
				page: request.query.page || 1,
				pageSize: request.query.pageSize
			});
			return coddyger.api(reply, Q);
		}
	});

	// Récapitulatif par commercial — base de calcul des commissions
	fastify.route({
		schema: {
			tags,
			summary: 'Récapitulatif des enrôlements par commercial',
			description: 'Nombre total, activés et en attente, par commercial, sur la période demandée.',
			query: {
				type: 'object',
				properties: {
					from: { type: 'string' },
					to: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/summary`,
		preHandler: TokenMiddleware.canStrict('read', 'enrolments'),
		handler: (request, reply) => {
			let Q = Controller.summary({
				from: request.query.from,
				to: request.query.to
			});
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
