import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { FileUpload, TokenMiddleware, uploadPath } from '../../api/middleware';
import { NotificationCategory, notificationManager, NotificationType } from '../../services/notification';
import { MainService } from './main.service';
import fs from 'fs/promises';
import { ClientService } from '../client/client.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { storage } from '../../services/storage/storage.service';
import { DURATION_TOLERANCE_SECONDS, VideoError, extractPoster, probeVideo, remuxFaststart } from '../../helpers/video.helper';
import { MediaModerationService, ModerationVerdict } from '../media-moderation/media-moderation.service';
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

	/**
	 * Enregistre les fichiers reçus. Tous sont contrôlés AVANT le premier enregistrement : un refus
	 * ne laisse ni temporaire ni objet orphelin dans le stockage.
	 * Vidéos : poids et durée réelle (ffprobe) comparés aux limites réglées au BO, puis extraction
	 * d'une image d'aperçu, renvoyée dans `poster`.
	 */
	upload(items: any[], options: { maxImageBytes: number; uploader?: any }) {
		return new Promise(async (resolve, reject) => {
			if (!items || items.length === 0) {
				resolve({
					status: defines.status.badRequest,
					message: locale.exist('Fichier requis'),
					data: null
				});
				return;
			}

			// Un refus ou un échec en cours de route ne doit laisser aucun temporaire multer.
			const discardAll = () => Promise.all(items.map((item) => FileUpload.discard(item)));
			const refuse = async (message: string) => {
				await discardAll();
				resolve({ status: defines.status.badRequest, message, data: null });
			};

			try {
				const limits = await new PlatformConfigService().getMediaLimits();
				const checked: Array<{ file: any; contentType: string; duration?: number; verdict?: ModerationVerdict }> = [];
				// Modération (contenu sexuel / pédopornographique) des images et vidéos, avant tout
				// enregistrement. Les envois de l'admin ne sont pas analysés.
				const moderate = !options.uploader?.isAdmin;
				const uploaderId = options.uploader?._id;
				const moderation = new MediaModerationService();
				const rejectIfInappropriate = async (file: any, contentType: string, duration?: number) => {
					const verdict = await moderation.analyze(file, contentType, duration);
					if (verdict.status !== 'rejected') return { verdict };
					await moderation.record({
						originalName: file.originalname,
						mediaType: duration !== undefined ? 'video' : 'image',
						uploaderId,
						labels: verdict.labels,
						maxConfidence: verdict.maxConfidence,
						status: 'rejected'
					});
					await discardAll();
					resolve({
						status: 422,
						message:
							duration !== undefined
								? 'Vidéo refusée : contenu inapproprié détecté. Les contenus à caractère sexuel sont interdits sur YoYo.'
								: 'Image refusée : contenu inapproprié détecté. Les contenus à caractère sexuel sont interdits sur YoYo.',
						data: { code: 'MEDIA_REJECTED', confidence: verdict.maxConfidence }
					});
					return null;
				};

				for (const file of items) {
					if (!file) return refuse(locale.controller.uploadFailed);

					const contentType = FileUpload.contentTypeOf(file);
					if (!FileUpload.isVideo(contentType)) {
						if (file.size > options.maxImageBytes) return refuse(locale.controller.uploadTooLarge);
						let verdict: ModerationVerdict | undefined;
						// Image reconnue au type déclaré OU à ses octets : un type déclaré trompeur
						// ne permet pas d'échapper à l'analyse.
						const sniffed = moderate ? await FileUpload.sniffImageType(file.path) : null;
						if (moderate && (contentType.startsWith('image/') || sniffed)) {
							const result = await rejectIfInappropriate(file, sniffed || contentType);
							if (!result) return;
							verdict = result.verdict;
						}
						checked.push({ file, contentType, verdict });
						continue;
					}

					if (file.size > limits.maxVideoSizeMb * 1024 * 1024) {
						return refuse(`Vidéo trop lourde (maximum ${limits.maxVideoSizeMb} Mo)`);
					}
					const { duration } = await probeVideo(file.path);
					if (duration > limits.maxVideoSeconds + DURATION_TOLERANCE_SECONDS) {
						return refuse(`Vidéo trop longue : ${Math.round(duration)} s (maximum ${limits.maxVideoSeconds} s)`);
					}
					let verdict: ModerationVerdict | undefined;
					if (moderate) {
						const result = await rejectIfInappropriate(file, contentType, duration);
						if (!result) return;
						verdict = result.verdict;
					}
					checked.push({ file, contentType, duration, verdict });
				}

				const files: Array<any> = [];
				for (const { file, contentType, duration, verdict } of checked) {
					let poster: string | undefined;
					if (duration !== undefined) {
						const posterTemp = `${file.path}-poster.jpg`;
						try {
							await extractPoster(file.path, posterTemp, duration);
							poster = `${file.filename}-poster.jpg`;
							await storage.put(posterTemp, poster, 'image/jpeg');
						} finally {
							await fs.rm(posterTemp, { force: true });
						}
					}

					let save: any;
					// Taille réellement sauvegardée (le remux faststart la modifie légèrement).
					let savedSize = file.size;

					if (duration !== undefined) {
						// VIDÉO : on remux en « faststart » AVANT de sauvegarder, pour la lecture
						// progressive du feed « Découvrir ». Le temporaire remuxé est enregistré à la
						// place du fichier brut (même clé, même contentType video/mp4).
						const fsTemp = `${file.path}-fs.mp4`;
						try {
							let remuxed = false;
							try {
								await remuxFaststart(file.path, fsTemp);
								remuxed = true;
							} catch (remuxError) {
								// Repli non bloquant : on conserve la vidéo d'origine (lisible, juste
								// moins fluide). Ne JAMAIS faire échouer tout l'upload pour le faststart.
								console.error('Remux faststart échoué, conservation du fichier original :', remuxError);
							}

							// `FileUpload.save` lit `path` et supprime ce temporaire en sortie : on lui
							// confie le remuxé via une copie du descripteur, sans toucher l'original.
							const source = remuxed ? { ...file, path: fsTemp } : file;
							if (remuxed) savedSize = (await fs.stat(fsTemp)).size;

							save = await FileUpload.save(source, contentType);
						} finally {
							// Nettoyage du temporaire remuxé ET du temporaire multer d'origine
							// (quel que soit le chemin pris : succès, repli ou erreur).
							await fs.rm(fsTemp, { force: true });
							await FileUpload.discard(file);
						}
					} else {
						save = await FileUpload.save(file, contentType);
					}

					if (save.error) throw save;

					// Journal de modération ; un média `flagged` est stocké mais n'est plus servi par
					// `/file/` tant qu'un admin ne l'a pas approuvé.
					if (verdict) {
						await moderation.record({
							fileName: save.filename,
							posterName: poster,
							originalName: file.originalname,
							mediaType: duration !== undefined ? 'video' : 'image',
							uploaderId,
							labels: verdict.labels,
							maxConfidence: verdict.maxConfidence,
							status: verdict.status,
							note: verdict.note
						});
					}

					files.push({
						filename: save.filename,
						originalname: file.originalname,
						size: savedSize,
						...(duration !== undefined && { poster, duration: Math.round(duration * 10) / 10 })
					});
				}

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.successSave,
					data: files
				});
			} catch (error: any) {
				await discardAll();
				if (error instanceof VideoError) {
					resolve({ status: defines.status.badRequest, message: error.message, data: null });
				} else {
					reject(error);
				}
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
