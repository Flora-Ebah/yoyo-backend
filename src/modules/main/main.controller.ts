import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { FileUpload, TokenMiddleware, uploadPath } from '../../api/middleware';
import { NotificationCategory, notificationManager, NotificationType } from '../../services/notification';
import { MainService } from './main.service';
import fs from 'fs/promises';
import { ClientService } from '../client/client.service';
const controllerLabel: string = 'MainController';

export class MainController {
	private service: MainService;
	private clientService: ClientService;

	constructor() {
		this.service = new MainService();
		this.clientService = new ClientService();
	}

	// [SÉCURITÉ C-01] `generateToken` et `generateRefreshToken` supprimées le 02/09/2026 avec la
	// route `POST /get-token` qu'elles servaient. Elles signaient, avec le secret des jetons
	// utilisateur, une charge utile anonyme délivrée contre une clé en dur dans les applications.
	// Voir le commentaire en tête de `src/api/routes/main.route.ts`.
	// `generateRefreshToken` n'était d'ailleurs appelée par aucune route.

	verifyToken(payload: any) {
		return new Promise(async (resolve, reject) => {
			const client: any = await this.clientService.getOne({ email: payload.email });

			const accessToken: any = TokenMiddleware.generate(
				{
					_id: client._id,
					email: payload.email
				},
				'accessToken',
				`${client.securityPreferences.sessionTimeout}m`
			);

			const refreshToken: any = TokenMiddleware.generate(
				{
					_id: payload._id,
					email: payload.email
				},
				'refreshToken'
			);

			resolve({
				status: defines.status.requestOK,
				message: 'ok',
				data: {
					accessToken,
					refreshToken
				}
			});
		}).catch((e: IErrorObject) => {
			console.error(e);
			return coddyger.catchReturn(e, controllerLabel, 'selectOne');
		});
	}

	// Function to upload a file
	upload(items: any[]) {
		return new Promise(async (resolve, reject) => {
			if (!items || items.length === 0) {
				resolve({
					status: defines.status.badRequest,
					message: locale.exist('Fichier requis'),
					data: null
				});
			} else {
				let files: Array<any> = [];

				console.log(items);
				// Upload files
				for (let file of items) {
					if (!file) {
						resolve({ status: defines.status.badRequest, message: locale.controller.uploadFailed, data: null });
						return;
					} else if (file.size > 500000000) {
						resolve({ status: defines.status.badRequest, message: locale.controller.uploadTooLarge, data: null });
						return;
					}

					const save: any = await FileUpload.save(file);
					if (save.error) reject(save);

					files.push({
						filename: save.filename,
						originalname: file.originalname,
						size: file.size
					});
				}

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.successSave,
					data: files
				});
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'upload');
		});
	}

	sendSocket(io: any, payload: any) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!io) {
					return reject({
						status: defines.status.serverError,
						message: 'Socket.IO non initialisé',
						data: null
					});
				}

				const { message, event = 'message' } = payload;
				
				// Vérifier que le message n'est pas vide
				if (!message) {
					return reject({
						status: defines.status.badRequest,
						message: 'Le message ne peut pas être vide',
						data: null
					});
				}
				
				// Envoyer une notification à tous les clients connectés
				await notificationManager.sendNotification({
					category: NotificationCategory.INFO,
					type: NotificationType.PUSH,
					to: 'all',
					data: {
						title: 'Notification importante',
						message: message,
						data: {
							event: event, // Événement personnalisé (optionnel)
							additionalData: 'Données supplémentaires'
						}
					}
				});

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: {
						event,
						messageSent: true
					}
				});
			} catch (error) {
				console.error('Erreur lors de l\'émission du message:', error);
				reject({
					status: defines.status.serverError,
					message: 'Erreur lors de l\'émission du message',
					data: error
				});
			}
		});
	}

	/**
	 * Récupère l'URL directe vers un fichier
	 * @param filename Nom du fichier
	 * @returns URL du fichier
	 */
	getFileUrl(filename: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!filename) {
					return resolve({
						status: defines.status.badRequest,
						message: "Le nom du fichier est requis",
						data: null
					});
				}

				// Vérifier si le fichier existe
				const filePath = uploadPath + '/' + filename;
				try {
					await fs.access(filePath);
				} catch (error) {
					return resolve({
						status: defines.status.notFound,
						message: "Le fichier n'existe pas",
						data: null
					});
				}

				// Construire l'URL directe vers le fichier
				const fileUrl = `${uploadPath}/${filename}`;
				
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: fileUrl
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.error(e);
			return coddyger.catchReturn(e, controllerLabel, 'getFileUrl');
		});
	}
}
