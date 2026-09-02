import coddyger from 'coddyger';
import { AdminController } from '../../modules/admin';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/admin';
const Controller: AdminController = new AdminController();
const tags: string[] = ['Comptes administrateurs'];

const defaultRoute: any = (fastify: any, options, done) => {
	// Login
	fastify.route({
		schema: {
			tags,
			summary: 'Connexion',
			body: {
				type: 'object',
				properties: {
					email: { type: 'string' },
					password: { type: 'string' }
				},
				required: ['email', 'password'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/login`,
		// Route d'avant-connexion : attestée par App Check (comme /client/login), pas par un jeton.
		// Auparavant en TokenMiddleware.verify, elle ne « marchait » que grâce au jeton public (faille C-01).
		preHandler: AppCheckMiddleware.verify,
		handler: (request, reply) => {
			const body: any = request.body;
			const Q = Controller.login(body);
			return coddyger.api(reply, Q);
		}
	});

	// Create admin
	fastify.route({
		schema: {
			tags,
			summary: 'Creer un compte administrateur',
			body: {
				type: 'object',
				properties: {
					email: { type: 'string' },
					password: { type: 'string' },
					matricule: { type: 'string' },
					phone: { type: 'string' },
					phoneOffice: { type: 'string' },
					lastname: { type: 'string' },
					firstname: { type: 'string' },
					address: { type: 'string' },
					office: { type: 'string' },
					photo: { type: 'string' },
					type: { type: 'string', enum: ['externe', 'interne'] },
					status: { type: 'string', enum: ['active', 'archived', 'removed'] },
					profile: { type: 'string' }
				},
				required: ['email', 'password', 'profile'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}`,
		preHandler: TokenMiddleware.can('create', 'admins'),
		handler: (request, reply) => {
			const body: any = request.body;
			const user: any = request.user;
			body.user = user._id;

			const Q = Controller.save(body);
			return coddyger.api(reply, Q);
		}
	});

	// Update admin
	fastify.route({
		schema: {
			tags,
			summary: 'Modifier un compte administrateur',
			body: {
				type: 'object',
				properties: {
					_id: { type: 'string' },
					email: { type: 'string' },
					password: { type: 'string' },
					matricule: { type: 'string' },
					phone: { type: 'string' },
					phoneOffice: { type: 'string' },
					lastname: { type: 'string' },
					firstname: { type: 'string' },
					address: { type: 'string' },
					office: { type: 'string' },
					photo: { type: 'string' },
					type: { type: 'string', enum: ['externe', 'interne'] },
					status: { type: 'string', enum: ['active', 'archived', 'removed'] },
					profile: { type: 'string' }
				},
				required: ['_id', 'email', 'profile'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}`,
		preHandler: TokenMiddleware.can('update', 'admins'),
		handler: (request, reply) => {
			const body: any = request.body;
			const user: any = request.user;
			body.user = user._id;

			const Q = Controller.update(body);
			return coddyger.api(reply, Q);
		}
	});

	// Admin list
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des comptes administrateurs',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					status: { type: 'string' },
					q: { type: 'string' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				required: [],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}`,
		preHandler: TokenMiddleware.can('read', 'admins'),
		handler: (request, reply) => {
			const page: any = request.query.page || 1;
			const pageSize: any = request.query.pageSize;
			const status: any = request.query.status;
			const query: any = request.query.q;
			const sortBy: string = request.query.sortBy;
			const orderBy: string = request.query.orderBy;

			const Q = Controller.select({ page, pageSize, status, query, sortBy, orderBy });
			return coddyger.api(reply, Q);
		}
	});

	// Admin list by status
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des comptes administrateurs par statut',
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
		preHandler: TokenMiddleware.can('read', 'admins'),
		handler: (request, reply) => {
			const page: any = request.query.page || 1;
			const pageSize: any = request.query.pageSize;
			const status: any = request.query.status;

			const Q = Controller.selectByStatus({ status, page, pageSize });
			return coddyger.api(reply, Q);
		}
	});

	// Current admin account
	fastify.route({
		schema: {
			tags,
			summary: 'Mon compte administrateur'
		},
		method: 'GET',
		url: `${routePath}/me`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const user: any = request.user;
			const Q = Controller.selectMe({ _id: user?._id, email: user?.email });
			return coddyger.api(reply, Q);
		}
	});

	// Admin details
	fastify.route({
		schema: {
			tags,
			summary: "Details d'un compte administrateur par id",
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
		preHandler: TokenMiddleware.can('read', 'admins'),
		handler: (request, reply) => {
			const _id: any = request.params.id;
			const Q = Controller.selectOne(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Remove admin
	fastify.route({
		schema: {
			tags,
			summary: 'Supprimer un compte administrateur',
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
		preHandler: TokenMiddleware.can('delete', 'admins'),
		handler: (request, reply) => {
			const _id: any = request.params.id;
			const Q = Controller.remove(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Erase admin
	fastify.route({
		schema: {
			tags,
			summary: 'Detruire un compte administrateur',
			description: "Suppression definitive d'un compte administrateur",
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
		preHandler: TokenMiddleware.can('delete', 'admins'),
		handler: (request, reply) => {
			const _id: any = request.params.id;
			const Q = Controller.remove(_id, true);
			return coddyger.api(reply, Q);
		}
	});

	// Restore admin
	fastify.route({
		schema: {
			tags,
			summary: 'Restaurer un compte administrateur',
			description: 'Reactiver un compte admin supprime',
			params: {
				type: 'object',
				properties: {
					id: { type: 'string' }
				},
				required: ['id'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}/restore/:id`,
		preHandler: TokenMiddleware.can('update', 'admins'),
		handler: (request, reply) => {
			const _id: any = request.params.id;
			const Q = Controller.restore(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Admin list by creation date range
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des comptes administrateurs par date de creation',
			query: {
				type: 'object',
				properties: {
					startDate: { type: 'string' },
					endDate: { type: 'string' },
					page: { type: 'number' },
					pageSize: { type: 'number' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				required: ['startDate', 'endDate'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/date-range`,
		preHandler: TokenMiddleware.can('read', 'admins'),
		handler: (request, reply) => {
			const startDate: string = request.query.startDate;
			const endDate: string = request.query.endDate;
			const page: number = request.query.page || 1;
			const pageSize: number = request.query.pageSize;
			const sortBy: string = request.query.sortBy;
			const orderBy: string = request.query.orderBy;

			const Q = Controller.selectByDateRange({
				startDate,
				endDate,
				page,
				pageSize,
				sortBy,
				orderBy
			});
			return coddyger.api(reply, Q);
		}
	});

	// Admin list by last login range
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des comptes administrateurs par date de derniere connexion',
			query: {
				type: 'object',
				properties: {
					startDate: { type: 'string' },
					endDate: { type: 'string' },
					page: { type: 'number' },
					pageSize: { type: 'number' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				required: ['startDate', 'endDate'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/last-login-range`,
		preHandler: TokenMiddleware.can('read', 'admins'),
		handler: (request, reply) => {
			const startDate: string = request.query.startDate;
			const endDate: string = request.query.endDate;
			const page: number = request.query.page || 1;
			const pageSize: number = request.query.pageSize;
			const sortBy: string = request.query.sortBy;
			const orderBy: string = request.query.orderBy;

			const Q = Controller.selectByLastLoginRange({
				startDate,
				endDate,
				page,
				pageSize,
				sortBy,
				orderBy
			});
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
