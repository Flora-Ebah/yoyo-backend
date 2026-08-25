import coddyger from 'coddyger';
import { CertificationController } from '../../modules/certification';
import { TokenMiddleware } from '../middleware';

const routePath = '/certification';
const Controller: CertificationController = new CertificationController();
const tags: string[] = ['Certification', 'Compte client - Certification'];

const defaultRoute: any = (fastify: any, options, done) => {
	// Create document
	fastify.route({
		schema: {
			tags,
			summary: 'Soumettre un document pour certification',
			description: 'Permet de soumettre un document pour vérification et certification',
			body: {
				type: 'object',
				properties: {
					documentType: {
						type: 'string',
						description: 'Type de document à certifier'
					},
					documentFile: {
						type: 'array',
						items: {
							type: 'string'
						},
						description: 'Liste des noms de fichiers des documents'
					}
				},
				required: ['documentType', 'documentFile'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let body: any = request.body;
			let user: any = request.user;

			// Ajouter les métadonnées automatiques
			body.user = user._id;
			body.metadata = {
				...body.metadata,
				ipAddress: request.ip,
				userAgent: request.headers['user-agent']
			};

			let Q = Controller.save(body);
			return coddyger.api(reply, Q);
		}
	});

	// Edit document
	fastify.route({
		schema: {
			tags: ['Certification'],
			summary: "Mettre à jour le statut d'un document",
			description: "Permet de mettre à jour le statut de vérification d'un document",
			body: {
				type: 'object',
				properties: {
					_id: { type: 'string' },
					verificationStatus: {
						type: 'string',
						description: 'Nouveau statut de vérification'
					},
					reviewNotes: {
						type: 'string',
						description: 'Notes de vérification'
					},
					rejectionReason: {
						type: 'string',
						description: 'Raison du rejet si applicable'
					}
				},
				required: ['_id', 'verificationStatus'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}`,
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			let body: any = request.body;
			let user: any = request.user;

			// Ajouter l'admin qui fait la révision
			body.reviewedBy = user._id;

			let Q = Controller.update(body);
			return coddyger.api(reply, Q);
		}
	});

	// Vérifier un numéro de téléphone
	fastify.route({
		schema: {
			tags,
			summary: 'Vérifier un numéro de téléphone',
			description: "Permet de vérifier l'authenticité d'un numéro de téléphone",
			body: {
				type: 'object',
				properties: {
					contact: {
						type: 'string',
						description: 'Numéro de téléphone'
					}
				},
				required: ['contact'],
				additionalProperties: false
			}
		},
		method: 'PUT',
		url: `${routePath}/complete-phone-verification`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let body: any = request.body;
			let user: any = request.user;

			// Ajouter l'admin qui fait la révision
			body.client = user._id;

			let Q = Controller.completePhoneVerification(body);
			return coddyger.api(reply, Q);
		}
	});

	// Document list
	fastify.route({
		schema: {
			tags: ['Certification'],
			summary: 'Liste des documents',

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

	// Document list by status
	fastify.route({
		schema: {
			tags: ['Certification'],
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
			tags: ['Certification'],
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
		preHandler: TokenMiddleware.verifyAdmin,
		handler: (request, reply) => {
			const _id: any = request.params.id;

			let Q = Controller.selectOne(_id);
			return coddyger.api(reply, Q);
		}
	});

	// Document by user
	fastify.route({
		schema: {
			tags,
			summary: 'Document par utilisateur',
		},
		method: 'GET',
		url: `${routePath}/me`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const user: any = request.user;

			let Q = Controller.selectByUser(user._id);
			return coddyger.api(reply, Q);
		}
	});

	// Remove document
	fastify.route({
		schema: {
			tags: ['Certification'],
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
			tags: ['Certification'],
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
			tags: ['Certification'],
			summary: 'Restorer un document',
			description: 'Réactiver un document supprimé',
			params: {
				type: 'object',
				properties: {
					id: { type: 'string' }
				},
				required: ['_id'],
				additionalProperties: false
			}
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

	// Get document types
	fastify.route({
		schema: {
			tags: ['Certification', ...tags],
			summary: 'Liste des types de document',
			description: 'Récupérer la liste des types de document acceptés pour la certification',
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						data: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									slug: { type: 'string' },
									title: { type: 'string' },
									description: { type: 'string' }
								}
							}
						}
					}
				}
			}
		},
		method: 'GET',
		url: `${routePath}/document-types`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let Q = Controller.selectDocumentTypes();
			return coddyger.api(reply, Q);
		}
	});

	// Get rejection reasons
	fastify.route({
		schema: {
			description: 'Liste des motifs de rejet',
			tags: ['Certification', ...tags],
			response: {
				200: {
					type: 'object',
					properties: {
						message: { type: 'string' },
						data: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									slug: { type: 'string' },
									title: { type: 'string' },
									description: { type: 'string' }
								}
							}
						}
					}
				}
			}
		},
		method: 'GET',
		url: `${routePath}/rejection-reasons`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let Q = Controller.selectRejectionReasons();
			return coddyger.api(reply, Q);
		}
	});

	// Get verification statuses
	fastify.route({
		schema: {
			description: 'Liste des statuts de vérification',
			tags: ['Certification', ...tags],
		},
		method: 'GET',
		url: `${routePath}/verification-statuses`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let Q = Controller.selectVerificationStatuses();
			return coddyger.api(reply, Q);
		}
	});

	done();
};

export default defaultRoute;
