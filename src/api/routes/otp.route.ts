import coddyger from 'coddyger';
import { OtpController } from '../../modules/otp';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/otp';
const Controller: OtpController = new OtpController();
const tags: string[] = ['Compte client - OTP'];
const tags2: string[] = ['Compte client - Password'];

const defaultRoute: any = (fastify: any, options, done) => {
	// Générer un OTP
	fastify.route({
		schema: {
			tags: ['Compte client - Certification', 'Certification', ...tags],
			summary: 'Générer un code OTP',
			body: {
				type: 'object',
				properties: {
					login: { type: 'string' },
					messageType: { 
						type: 'string',
						description: 'Type de message à envoyer',
						enum: [
							'ACCOUNT_VERIFICATION',
							'PASSWORD_RESET',
							'LOGIN_VERIFICATION',
							'TWO_FACTOR_AUTH',
							'TRANSACTION_CONFIRMATION',
							'PAYMENT_CONFIRMATION',
							'TRANSFER_NOTIFICATION',
							'ACCOUNT_UPDATED',
							'SECURITY_ALERT',
							'PROFILE_CHANGES',
							'WELCOME_MESSAGE',
							'ACCOUNT_REMINDER',
							'INACTIVITY_ALERT',
							'PROMOTIONAL_OFFER',
							'NEW_FEATURE_ANNOUNCEMENT',
							'SURVEY_INVITATION',
						]
					}
				},
				required: ['login', 'messageType'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/generate`,
		// [App Check] Route d'avant-connexion : l'attestation a remplacé la clé partagée qui la
		// « protégeait » — une chaîne extractible de n'importe quel binaire (C-01).
		preHandler: AppCheckMiddleware.verify,
		handler: (request, reply) => {
			const { login, messageType } = request.body;
			let Q = Controller.generate(login, messageType);
			return coddyger.api(reply, Q);
		}
	});

	// Vérifier un OTP
	// [SÉCURITÉ] Depuis F-03, c'est cette route qui émet le jeton autorisant la réinitialisation d'un
	// mot de passe : elle est donc le dernier obstacle avant une prise de contrôle de compte. Le
	// quota de tentatives est appliqué dans le contrôleur, le plafond de débit ci-dessous ferme le
	// balayage automatisé d'un code à 6 chiffres.
	fastify.route({
		schema: {
			tags: ['Compte client - Certification', ...tags],
			summary: 'Vérifier un code OTP',
			description:
				"Parcours « mot de passe oublié » : `POST /otp/password-reset/request` → `POST /otp/verify` → le `resetToken` renvoyé ici → `PUT /clients/updatePassword`.\n\n" +
				"Le code est invalidé au bout de 3 tentatives infructueuses ; il faut alors en demander un nouveau. La réponse ne contient plus l'identifiant du compte : c'est le `resetToken` qui désigne la cible, et lui seul.",
			body: {
				type: 'object',
				properties: {
					login: { type: 'string' },
					code: { type: 'string' }
				},
				required: ['login', 'code'],
				additionalProperties: false
			},
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						data: {
							type: 'object',
							properties: {
								resetToken: {
									type: 'string',
									nullable: true,
									description:
										"Jeton de réinitialisation, à usage unique et valable 15 minutes. Renseigné uniquement lorsque l'OTP portait le motif `password_reset`. À transmettre tel quel à `PUT /clients/updatePassword`."
								}
							}
						}
					}
				}
			}
		},
		method: 'POST',
		url: `${routePath}/verify`,
		// [App Check] `verifyLimitedUse` : c'est cette route qui émet le `resetToken`. Rejouer une
		// requête capturée en referait émettre un — d'où le jeton d'attestation à usage unique.
		preHandler: AppCheckMiddleware.verifyLimitedUse,
		config: {
			rateLimit: {
				max: 10,
				timeWindow: '1 minute'
			}
		},
		handler: (request, reply) => {
			const { login, code } = request.body;
			let Q = Controller.verify(login, code);
			return coddyger.api(reply, Q);
		}
	});

	// Liste des OTP
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des OTP',
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
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let page: any = request.query.page || 1;
			let pageSize: any = request.query.pageSize;
			let status: any = request.query.status;
			let query: any = request.query.q;
			const sortBy: string = request.query.sortBy;
			const orderBy: string = request.query.orderBy;

			let Q = Controller.select({ page, pageSize, status, query, sortBy, orderBy });
			return coddyger.api(reply, Q);
		}
	});

	// Liste des OTP par status
	fastify.route({
		schema: {
			tags,
			summary: 'Liste des OTP par statut',
			query: {
				type: 'object',
				properties: {
					page: { type: 'number' },
					pageSize: { type: 'number' },
					status: {
						type: 'string',
						default: 'active',
						enum: ['active', 'used', 'expired']
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

	// Détails d'un OTP
	fastify.route({
		schema: {
			tags,
			summary: "Détails d'un OTP par id",
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
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const _id: any = request.params.id;
			let Q = Controller.selectOne(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Réinitialiser un OTP
	fastify.route({
		schema: {
			tags,
			summary: 'Demande de réinitialisation de mot de passe',
			description: 'Demande de réinitialisation de mot de passe',
			body: {
				type: 'object',
				properties: {
					login: { type: 'string' },
				},
				required: ['login'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/password-reset/request`,
		// [App Check] Entrée du parcours « mot de passe oublié », donc atteignable sans compte.
		preHandler: AppCheckMiddleware.verify,
		handler: (request, reply) => {
			const { login } = request.body;
			let Q = Controller.generate(login, 'PASSWORD_RESET');
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
