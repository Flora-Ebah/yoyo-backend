import coddyger from 'coddyger';
import { MainController } from '../../modules/main';
import { TokenMiddleware, uploadPath } from '../middleware';
import { FileUpload } from '../../helpers';
import path from 'path';
import fs from 'fs';

const Controller: MainController = new MainController();
const tags: string[] = ['Gestion des connexions'];

// Create a FileUpload instance with appropriate options
const maxSizeTmp: any = process.env.ALLOWED_FILE_SIZE! ?? 5;
const maxSize: number = Number(maxSizeTmp) * 1024 * 1024;
const allowedExtensions: string[] = process.env.ALLOWED_FILE_TYPES
	? process.env.ALLOWED_FILE_TYPES.split(',')
	: [
	'.pdf',
	'.doc',
	'.docx',
	'.jpg',
	'.jpeg',
	'.png',
	'.mp3',
	'.mp4',
	'.txt',
	'.xls',
	'.xlsx'
];

// Create a FileUpload instance with appropriate options
const fileUpload = new FileUpload({
	maxSize,
	allowedExtensions
});

const defaultRoute: any = (fastify: any, options, done) => {
	// Generate access token
	fastify.route({
		schema: {
			tags: [...tags, 'Tokens'],
			summary: 'Générer un access token',
			body: {
				type: 'object',
				properties: {
					// [SÉCURITÉ B-05] La valeur réelle était placée en `default` : la documentation
					// publiait donc la clé technique partagée par les 4 applications, en clair, à
					// quiconque ouvrait `/documentation`.
					apikey: { type: 'string' }
				},
				required: ['apikey'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `/get-token`,
		handler: (request, reply) => {
			const apikey: string = request.body.apikey;

			let Q = Controller.generateToken(apikey);
			return coddyger.api(reply, Q);
		}
	});

	// Verify access token
	fastify.route({
		schema: {
			tags: [...tags, 'Tokens'],
			summary: 'Vérifier un access token',
			description:
				"Accepte uniquement les refresh tokens. En cas de vérification réussie, une nouvelle pair d'access/refresh est généré.",
			response: {
				200: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: {
								accessToken: { type: 'string', default: 'eyJhbGciOiJIUzI1NiIsI...' },
								refreshToken: { type: 'string', default: 'eyJhbGciOiJIUzI1NiIsI...' }
							}
						}
					}
				}
			}
		},
		method: 'GET',
		url: `/refresh-token`,
		preHandler: [TokenMiddleware.verifyRefreshToken],
		handler: (request, reply) => {
			const user: any = request.user;

			let Q = Controller.verifyToken(user);
			return coddyger.api(reply, Q);
		}
	});

	// File upload
	fastify.route({
		schema: {
			tags: [...tags, 'File Upload'],
			summary: 'Upload de fichiers',
			description: `Permet d'uploader un ou plusieurs fichiers (maximum ${maxSizeTmp}MB par fichier).
Extensions acceptées : ${allowedExtensions.join(', ')}
Limite : 5 fichiers maximum par requête.

Instructions :
- Utilisez une requête multipart/form-data
- Le champ pour les fichiers doit être nommé 'files'
- Nécessite un token d'authentification valide
- Chaque fichier doit respecter la taille maximale de ${maxSizeTmp}MB

Réponse :
- Retourne un tableau des fichiers uploadés avec leurs noms et URLs d'accès
- En cas d'erreur, retourne un message détaillé sur le problème rencontré`
		},
		method: 'POST',
		url: `/upload`,
		preHandler: [TokenMiddleware.verify, fileUpload.single('files', 5)],
		handler: (request, reply) => {
			const files = request.files;

			let Q = Controller.upload(files);
			return coddyger.api(reply, Q);
		}
	});

	// File serve
	fastify.route({
		schema: {
			tags: [...tags, 'File Upload'],
			summary: 'File serve',
			description: 'Afficher un fichier par le nom',
			params: {
				type: 'object',
				properties: {
					filename: { type: 'string' }
				},
				required: ['filename'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `/serve/:filename`,
		preHandler: [TokenMiddleware.verify],
		handler: async (request, reply) => {
			const filename = request.params.filename;
			const filePath = path.join(uploadPath, filename);

			// Vérifier si le fichier existe
			try {
				await fs.promises.access(filePath);
				return reply.sendFile(filename, uploadPath);
			} catch (error) {
				return reply.code(404).send({
					message: 'Fichier introuvable',
					data: null
				});
			}
		}
	});

	// Envoyer un message via Socket.IO
	fastify.route({
		schema: {
			tags: ["Default"],
			summary: 'Envoyer un message via Socket.IO',
			description: "Envoyer un message à tous les clients connectés",
			body: {
				type: 'object',
				properties: {
					message: { type: 'string' },
					event: { type: 'string', default: 'message' }
				},
				required: ['message']
			}
		},
		method: 'POST',
		url: `/send-socket`,
		handler: (request, reply) => {
			const io = request.io;
			
			if (!io) {
				return reply.status(503).send({
					status: 503,
					message: 'Service Socket.IO non disponible',
					data: null
				});
			}
			
			const { message, event = 'message' } = request.body;

			let Q = Controller.sendSocket(io, { message, event });
			return coddyger.api(reply, Q);
		}
	});

	// Swagger
	fastify.route({
		schema: {
			tags,
			summary: 'Swagger UI',
			description: 'Swagger UI',
			hide: true
		},
		method: 'GET',
		url: `/swagger`,
		handler: (request, reply) => {
			return fastify.swagger();
		}
	});

	done();
};

export default defaultRoute;
