import coddyger from 'coddyger';
import { LoginController } from '../../modules/login/login.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/client';
const Controller: LoginController = new LoginController();
const tags: string[] = ['Gestion des connexions & création de compte'];
const passwordTags: string[] = ['Compte client - Mot de passe oublié'];
const recoveringTags: string[] = ['Compte client - Récupération de compte'];

const defaultRoute: any = (fastify: any, options, done) => {
	// Client login
	fastify.route({
		schema: {
			tags,
			summary: 'Connexion client',
			description: 'Permet à un client de se connecter avec son login et son code secret',
			body: {
				type: 'object',
				properties: {
					login: { type: 'string' },
					password: { type: 'string' }
				},
				required: ['login', 'password'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/login`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let payload = {
				login: request.body.login,
				password: request.body.password,
				userAgent: request.headers['user-agent'],
				ip: request.ip
			};

			let Q = Controller.login(payload);
			return coddyger.api(reply, Q);
		}
	});

	// check email
	fastify.route({
		schema: {
			tags,
			summary: 'Vérifier la disponibilité de l\'email',
			description: 'Permet de vérifier si un email est disponible pour la création d\'un compte',
			body: {
				type: 'object',
				properties: {
					email: { type: 'string' }
				},
				required: ['email'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/check-email`,
		handler: (request, reply) => {
			const email = request.body.email;
			let Q = Controller.checkEmail(email);
			return coddyger.api(reply, Q);
		}
	});

	// check phone
	fastify.route({
		schema: {
			tags,
			summary: 'Vérifier la disponibilité du numéro de téléphone',
			description: 'Permet de vérifier si un numéro de téléphone est disponible pour la création d\'un compte',
			body: {
				type: 'object',
				properties: {
					phoneNumber: { type: 'string' }
				},
				required: ['phoneNumber'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/check-phone`,
		handler: (request, reply) => {
			const phoneNumber = request.body.phoneNumber;
			let Q = Controller.checkPhone(phoneNumber);
			return coddyger.api(reply, Q);
		}
	});

	// Client logout
	fastify.route({
		schema: {
			tags,
			summary: 'Déconnexion client',
			description: 'Permet à un client de se déconnecter en invalidant son token',
			body: {
				type: 'object',
				properties: {
					loginId: { type: 'string' }
				},
				required: ['loginId'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/logout`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const loginId = request.body.loginId;
			const userId = request.user._id;

			let Q = Controller.logout(loginId, userId);
			return coddyger.api(reply, Q);
		}
	});

	// Client login history
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des connexions du client connecté',
			description: 'Récupère la liste paginée des connexions du client connecté.',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/logins/me`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const page: any = request.query.page || 1;
			const pageSize: any = request.query.pageSize;
			const sortBy: any = request.query.sortBy;
			const orderBy: any = request.query.orderBy;
			const login: any = request.user._id;

			let Q = Controller.selectByClient({ login, page, pageSize, sortBy, orderBy });
			return coddyger.api(reply, Q);
		}
	});

	// Supprimer une connexion du client connecté
	fastify.route({
		schema: {
			tags,
			summary: 'Supprimer une connexion du client connecté',
			description: 'Permet au client connecté de supprimer une de ses connexions et d\'invalider le token associé.',
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
		url: `${routePath}/logins/me/:id`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const loginId: string = request.params.id;
			const clientId: string = request.user._id;
			
			let Q = Controller.deleteClientLogin(loginId, clientId);
			return coddyger.api(reply, Q);
		}
	});

	fastify.route({
		schema: {
			tags,
			summary: 'Liste des connexions des clients',
			description: 'Récupère la liste paginée des connexions des clients.',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					sortBy: { type: 'string' },
					orderBy: { type: 'string' }
				},
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/logins`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const page: any = request.query.page || 1;
			const pageSize: any = request.query.pageSize;
			const sortBy: any = request.query.sortBy;
			const orderBy: any = request.query.orderBy;

			let Q = Controller.select({ page, pageSize, sortBy, orderBy });
			return coddyger.api(reply, Q);
		}
	});

	// Supprimer une connexion
	fastify.route({
		schema: {
			tags,
			summary: 'Supprimer une connexion - Admin',
			description: 'Supprime une connexion et enregistre son token dans la liste des tokens désactivés.',
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
		url: `${routePath}/logins/:id`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const loginId: string = request.params.id;
			let Q = Controller.deleteLogin(loginId);
			return coddyger.api(reply, Q);
		}
	});

  done();
};

export default defaultRoute;