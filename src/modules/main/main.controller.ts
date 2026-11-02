import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { FileUpload, TokenMiddleware, uploadPath } from '../../api/middleware';
import { NotificationCategory, notificationManager, NotificationType } from '../../services/notification';
import { MainService } from './main.service';
import fs from 'fs/promises';
import { ClientService } from '../client/client.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { storage } from '../../services/storage/storage.service';
import {
	DURATION_TOLERANCE_SECONDS,
	VideoError,
	VideoProbe,
	extractPoster,
	needsTranscode,
	probeVideo,
	remuxFaststart,
	transcodeForStreaming
} from '../../helpers/video.helper';
import { MediaModerationService, ModerationVerdict } from '../media-moderation/media-moderation.service';
const controllerLabel: string = 'MainController';

/** Statuts de compte qui interdisent le renouvellement d'une session. */
const REFRESH_REFUSED_STATUSES = ['suspended', 'locked', 'removed', 'anonymized'];

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
			// Un jeton admin ne se renouvelle pas : la session du CMS repasse par le mot de passe et le
			// code e-mail (Excel CMS n°10). Sans ce refus, un refresh valide 7 jours contournait le 2FA.
			if (payload?.isAdmin) {
				return resolve({ status: defines.status.authError, message: 'Session expirée : reconnectez-vous.', data: null });
			}

			// Le compte doit encore exister et ne pas être bloqué, suspendu ou supprimé : auparavant, un
			// compte bloqué gardait l'accès tant que son refresh token (7 jours) restait valide.
			const client: any = await this.clientService.getOne({ _id: payload?._id });
			if (!client || REFRESH_REFUSED_STATUSES.includes(client.status)) {
				return resolve({ status: defines.status.authError, message: 'Session expirée : reconnectez-vous.', data: null });
			}

			const accessToken: any = TokenMiddleware.generate(
				{
					_id: client._id,
					email: client.email
				},
				'accessToken',
				`${client.securityPreferences?.sessionTimeout || 60}m`
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
				const checked: Array<{
					file: any;
					contentType: string;
					duration?: number;
					probe?: VideoProbe;
					verdict?: ModerationVerdict;
				}> = [];
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
					const probe = await probeVideo(file.path);
					const { duration } = probe;
					if (duration > limits.maxVideoSeconds + DURATION_TOLERANCE_SECONDS) {
						return refuse(`Vidéo trop longue : ${Math.round(duration)} s (maximum ${limits.maxVideoSeconds} s)`);
					}
					let verdict: ModerationVerdict | undefined;
					if (moderate) {
						const result = await rejectIfInappropriate(file, contentType, duration);
						if (!result) return;
						verdict = result.verdict;
					}
					checked.push({ file, contentType, duration, probe, verdict });
				}

				const files: Array<any> = [];
				for (const { file, contentType, duration, probe, verdict } of checked) {
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
					// Taille réellement sauvegardée (ré-encodage ou remux la modifient).
					let savedSize = file.size;

					if (duration !== undefined) {
						// VIDÉO : avant sauvegarde, mise au profil de diffusion mobile, du plus utile au
						// plus sûr :
						//  1. ré-encodage H.264 720p plafonné (~6 Mo pour 20 s au lieu de 40-120 Mo),
						//     sauf si la vidéo y est déjà ;
						//  2. sinon, ou s'il échoue, remux « faststart » sans ré-encodage (lecture
						//     progressive : la 1re image s'affiche avant la fin du téléchargement) ;
						//  3. en dernier recours, le fichier d'origine (lisible, moins fluide).
						// Ne JAMAIS faire échouer tout l'upload pour une de ces optimisations.
						const fsTemp = `${file.path}-fs.mp4`;
						try {
							let prepared = false;
							if (probe && needsTranscode(probe)) {
								try {
									await transcodeForStreaming(file.path, fsTemp);
									prepared = true;
								} catch (transcodeError) {
									console.error('Ré-encodage vidéo échoué, repli sur le remux faststart :', transcodeError);
								}
							}
							if (!prepared) {
								try {
									await remuxFaststart(file.path, fsTemp);
									prepared = true;
								} catch (remuxError) {
									console.error('Remux faststart échoué, conservation du fichier original :', remuxError);
								}
							}

							// `FileUpload.save` lit `path` et supprime ce temporaire en sortie : on lui
							// confie le fichier préparé via une copie du descripteur, sans toucher
							// l'original. Le fichier préparé est un MP4 : clé `.mp4` et type video/mp4,
							// même si l'envoi était un .mov.
							const source = prepared ? { ...file, path: fsTemp } : file;
							if (prepared) savedSize = (await fs.stat(fsTemp)).size;

							save = await FileUpload.save(source, prepared ? 'video/mp4' : contentType);
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
