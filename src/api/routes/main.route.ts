import coddyger from 'coddyger';
import { MainController } from '../../modules/main';
import { TokenMiddleware } from '../middleware';
import { FileUpload } from '../../helpers';
import { sendStoredFile } from '../../helpers/file-upload.helper';

const Controller: MainController = new MainController();
const tags: string[] = ['Gestion des connexions'];

// Create a FileUpload instance with appropriate options
// parseFloat tolère un commentaire en fin de ligne (`10 # Mo`) ; valeur absente ou invalide → 5 Mo.
const maxSizeTmp: number = Number.parseFloat(process.env.ALLOWED_FILE_SIZE ?? '') || 5;
const maxSize: number = maxSizeTmp * 1024 * 1024;
const allowedExtensions: string[] = process.env.ALLOWED_FILE_TYPES
	? process.env.ALLOWED_FILE_TYPES.split(',')
	: [
	'.pdf',
	'.doc',
	'.docx',
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.mp3',
	'.mp4',
	'.mov',
	'.txt',
	'.xls',
	'.xlsx'
];

// Plafond technique de réception (multer). Les limites réelles sont appliquées après réception,
// par type : `maxSize` pour les images et documents, `settings.media` (réglé au BO) pour les vidéos.
// Il doit rester ≥ au maximum accepté par `PUT /settings` pour `media.maxVideoSizeMb`.
const RECEIVE_CEILING_BYTES = 200 * 1024 * 1024;

const fileUpload = new FileUpload({
	maxSize: Math.max(maxSize, RECEIVE_CEILING_BYTES),
	allowedExtensions
});

const defaultRoute: any = (fastify: any, options, done) => {
	// [SÉCURITÉ C-01] `POST /get-token` supprimée le 02/09/2026.
	//
	// Elle échangeait une clé technique — la même pour les 4 applications, en dur dans chaque
	// binaire et dans le bundle navigateur de l'administration — contre un jeton signé avec le
	// **secret des jetons utilisateur**. Ce jeton ne désignait personne (`{ data: <clé>, reg }`)
	// mais franchissait `TokenMiddleware.verify` sur **toutes** les routes : c'est ce qui a rendu
	// F-03 (prise de contrôle de compte) et F-05 (secrets des prestataires de paiement)
	// exploitables sans posséder le moindre compte.
	//
	// Une chaîne embarquée dans un binaire n'est pas un secret. Elle est remplacée par Firebase
	// App Check (`AppCheckMiddleware`) sur les 8 routes d'avant-connexion : l'attestation est
	// produite par le système d'exploitation (Play Integrity / App Attest / reCAPTCHA Enterprise),
	// jamais par du code livré au client, et n'est donc pas extractible.
	//
	// `TokenMiddleware.verify` refuse par ailleurs désormais tout jeton sans `_id`, ce qui
	// invalide immédiatement les jetons publics encore en circulation — la clé restant, elle,
	// dans l'historique Git et dans les binaires déjà publiés.

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

			let Q = Controller.upload(files, { maxImageBytes: maxSize });
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
		handler: async (request, reply) => sendStoredFile(reply, request.params.filename)
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
