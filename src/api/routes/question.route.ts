import coddyger from 'coddyger';
import { QuestionController } from '../../modules/question';
import { TokenMiddleware } from '../middleware';
import { QuestionConstants } from '../../modules/question/question.constants';

const routePath = '/question';
const Controller: QuestionController = new QuestionController();
const tags: string[] = ['Gestion des questions secrètes'];
const authTags: string[] = ['Gestion des connexions & création de compte'];

const defaultRoute: any = (fastify: any, options, done) => {
	// Create document
	fastify.route({
		schema: {
			tags,
			summary: 'Créer un document',
			body: {
				type: 'object',
				properties: {
					questionText: { type: 'string' },
					languageCode: { type: 'string', maxLength: 50 },
					category: {
						type: 'string',
						enum: Object.values(QuestionConstants.CATEGORIES)
					},
					isCustomizable: { type: 'boolean' },
					minAnswerLength: { type: 'number' },
					maxAnswerLength: { type: 'number' }
				},
				required: ['questionText'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let body: any = request.body;

			let user: any = request.user;
			body.user = user._id;

			let Q = Controller.save(body);
			return coddyger.api(reply, Q);
		}
	});

	// Create multiple documents
	fastify.route({
		schema: {
			tags,
			summary: 'Créer plusieurs questions en une seule requête',
			description: 'Permet d\'enregistrer un tableau de questions en une seule opération',
			body: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						questionText: { type: 'string' },
						languageCode: { type: 'string', maxLength: 50 },
						category: {
							type: 'string',
							enum: Object.values(QuestionConstants.CATEGORIES)
						},
						isCustomizable: { type: 'boolean' },
						minAnswerLength: { type: 'number' },
						maxAnswerLength: { type: 'number' }
					},
					required: ['questionText', 'category'],
					additionalProperties: false
				},
				minItems: 1
			}
		},
		method: 'POST',
		url: `${routePath}/batch`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let items: any[] = request.body;
			let user: any = request.user;
			
			// Ajouter l'ID utilisateur à chaque question
			items = items.map(item => ({
				...item,
				user: user._id
			}));
			
			let Q = Controller.saveMany(items);
			return coddyger.api(reply, Q);
		}
	});

	// Edit document
	fastify.route({
		schema: {
			tags,
			summary: 'Modifier un document existant',
			body: {
				type: 'object',
				properties: {
					_id: { type: 'string' },
					questionText: { type: 'string' },
					languageCode: { type: 'string', maxLength: 5 },
					category: {
						type: 'string',
						enum: Object.values(QuestionConstants.CATEGORIES)
					},
					status: {
						type: 'string',
						enum: Object.values(QuestionConstants.STATUS)
					},
					isCustomizable: { type: 'boolean' },
					minAnswerLength: { type: 'number' },
					maxAnswerLength: { type: 'number' }
				},
				required: ['_id', 'questionText'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let body: any = request.body;

			let user: any = request.user;
			body.user = user._id;

			let Q = Controller.update(body);
			return coddyger.api(reply, Q);
		}
	});

	// Document list
	fastify.route({
		schema: {
			tags: [...authTags, ...tags],
			summary: 'Liste des questions secrètes',
			description: 'Liste des questions secrètes avec pagination, filtre, tri et recherche',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					status: { type: 'string' },
					q: { type: 'string' },
					from: { type: 'string' },
					to: { type: 'string' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let page: any = request.query.page || 1;
			let pageSize: any = request.query.pageSize;
			let status: any = request.query.status;
			let query: any = request.query.q;
			const from: string = request.query.from;
			const to: string = request.query.to;
			const sortBy: string = request.query.sortBy;
			const orderBy: string = request.query.orderBy;

			let Q = Controller.select({ page, pageSize, status, query, from, to, sortBy, orderBy });
			return coddyger.api(reply, Q);
		}
	});

	// Document list by status
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des documents par statut',

			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					status: {
						type: 'string',
						default: 'active',
						enum: ['active', 'archived', 'removed']
					}
				},
				required: ['status'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/findByStatus`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const page: any = request.query.page || 1;
			const pageSize: any = request.query.pageSize;
			const status: any = request.query.status;

			let Q = Controller.selectByStatus({ status, page, pageSize });
			return coddyger.api(reply, Q);
		}
	});

	// Document details
	fastify.route({
		schema: {
			tags,
			summary: "Détails d'un document par id",

			params: {
				type: 'object',
				properties: {
					id: { type: 'string' }
				},
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/details/:id`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const _id: any = request.params.id;

			let Q = Controller.selectOne(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Remove document
	fastify.route({
		schema: {
			tags,
			summary: 'Supprimer un document',
			params: {
				type: 'object',
				properties: {
					id: { type: 'string' }
				},
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'DELETE',
		url: `${routePath}/remove/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let _id: any = request.params.id;

			let Q = Controller.remove(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Erase document
	fastify.route({
		schema: {
			tags,
			summary: 'Détruire un document',
			description: "Suppression défénitive d'un document",
			params: {
				type: 'object',
				properties: {
					id: { type: 'string' }
				},
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'DELETE',
		url: `${routePath}/erase/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let _id: any = request.params.id;

			let Q = Controller.remove(_id, true);
			return coddyger.api(reply, Q);
		}
	});

	// Restore document
	fastify.route({
		schema: {
			tags,
			summary: 'Restorer un document',
			description: 'Réactiver un document supprimé'
		},
		method: 'PUT',
		url: `${routePath}/restore/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let _id: any = request.params.id;

			let Q = Controller.restore(_id);
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
