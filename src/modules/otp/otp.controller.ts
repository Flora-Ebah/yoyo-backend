import coddyger, { IData, IErrorObject, LoggerService, LogLevel, defines, env } from 'coddyger';
import { locale } from '../../public';
import { IOtp, OtpSet } from './';
import { OtpService } from './otp.service';
import { ClientService } from '../client/client.service';
import { LoginService } from '../login/login.service';
import { MessageTypes } from '../../services/notification';
import { MessageHelper, PasswordResetTokenHelper } from '../../helpers';

const controllerLabel: string = 'OtpController';

export class OtpController {
	private readonly dao: IData<IOtp>;
	private readonly clientService: ClientService;
	private readonly loginService: LoginService;
	private readonly service: OtpService;

	constructor() {
		this.dao = new OtpSet();
		this.clientService = new ClientService();
		this.loginService = new LoginService();
		this.service = new OtpService();
	}

	// Fonction pour générer un nouveau code OTP
	generate(login: string, messageType?: string) {
		return new Promise(async (resolve, reject) => {
			try {
				// Validate login format (email or phone)
				const emailValidation = this.clientService.validateEmail(login);
				const phoneValidation = this.clientService.validateIvorianPhoneNumber(login);

				if (!emailValidation.isValid && !phoneValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.client.invalidLoginFormat,
						data: null
					});
				}

				// Format login based on type
				const formattedLogin = emailValidation.isValid
					? this.clientService.formatEmail(login)
					: this.clientService.formatIvorianPhoneNumber(login);

				// Vérifier si un OTP actif existe déjà pour ce login
				const existingOtp: any = await this.dao.selectOne({
					login: formattedLogin,
					status: 'active',
					type: emailValidation.isValid ? 'email' : 'phone'
				});

				if (existingOtp) {
					await this.dao.update({ _id: existingOtp._id }, { status: 'expired' });
				}

				// Définir le type de message si non spécifié
				let validMessageType;
				
				if (messageType) {
					// Convertir le messageType en snake_case (de ACCOUNT_VERIFICATION à account_verification)
					const msgTypeKey = messageType.toLowerCase();
					
					// Vérifier si cette valeur existe dans MessageTypes.TYPES
					for (const [key, value] of Object.entries(MessageTypes.TYPES)) {
						if (value === msgTypeKey) {
							validMessageType = value;
							break;
						}
					}
				}
				
				// Utiliser ACCOUNT_VERIFICATION par défaut si le type n'est pas valide
				validMessageType ??= MessageTypes.TYPES.ACCOUNT_VERIFICATION;

				// Récupérer la configuration du message
				const messageConfig = MessageTypes.getMessageConfig(validMessageType);
				
				// Générer un code OTP à 6 chiffres par défaut
				const code = OtpService.generateOTP(6);

				// Calculer la date d'expiration basée sur la configuration du message
				const expiresAt = new Date();
				expiresAt.setMinutes(expiresAt.getMinutes() + messageConfig.expiryMinutes);

				const newOtp: IOtp = {
					_id: coddyger.string.generateObjectId(),
					code,
					login: formattedLogin,
					type: emailValidation.isValid ? 'email' : 'phone',
					purpose: validMessageType,
					status: 'active',
					expiresAt,
					attempts: 0
				};

				// Sauvegarder l'OTP dans la base de données
				const save: any | IErrorObject = await this.dao.save(newOtp);

				if (save.error) {
					reject(save);
				} else {
					// Send OTP based on login type
					OtpService.sendOtp(
						formattedLogin, 
						code, 
						validMessageType, 
						emailValidation.isValid ? 'email' : 'phone'
					);

					resolve({
						status: defines.status.requestOK,
						message: 'Code de vérification envoyé avec succès',
						data: null
					});
				}
			} catch (e) {
				console.error(e);
				return coddyger.catchReturn(e, controllerLabel, 'generate');
			}
		});
	}

	/**
	 * Vérifie un code OTP.
	 *
	 * [SÉCURITÉ] En déplaçant l'autorisation de réinitialisation vers le `resetToken` (F-03), cette
	 * méthode est devenue le seul obstacle à une prise de contrôle de compte. Elle ne comportait
	 * pourtant aucun garde-fou : la recherche filtrait déjà sur le code, donc la comparaison qui
	 * suivait était toujours vraie et la branche d'échec — celle qui compte les tentatives — était
	 * du code mort. `maxAttempts` n'était donc jamais appliqué et un code à 6 chiffres se devinait.
	 *
	 * L'OTP est désormais recherché par login seul, le code est comparé en mémoire, et le quota de
	 * tentatives invalide le code une fois épuisé.
	 */
	verify(login: string, code: string) {
		return new Promise(async (resolve, reject) => {
			try {
				// `generate()` enregistre l'OTP sous un login formaté. Sans le même formatage ici, une
				// adresse saisie avec une majuscule ou un numéro saisi avec des espaces ne retrouvait
				// jamais son code.
				const emailValidation = this.clientService.validateEmail(login);
				const formattedLogin = emailValidation.isValid
					? this.clientService.formatEmail(login)
					: this.clientService.formatIvorianPhoneNumber(login);

				// Recherche par login seul : c'est ce qui rend la comparaison du code — et donc le
				// décompte des tentatives — réellement effective. `generate()` expirant l'OTP actif
				// précédent, il y en a au plus un par login.
				const otp: any = await this.dao.selectOne({
					login: formattedLogin,
					status: 'active',
					expiresAt: { $gt: new Date() }
				});

				if (!otp || otp.error) {
					// Message volontairement indifférencié : il ne doit pas révéler si le login existe.
					resolve({
						status: defines.status.badRequest,
						message: 'Code OTP invalide ou expiré',
						data: null
					});
					return;
				}

				// Incrémenter le nombre de tentatives
				const attempts = (otp.attempts || 0) + 1;

				// Vérifier si le code est correct
				if (otp.code !== code) {
					const maxAttempts = MessageTypes.getMessageConfig(otp.purpose)?.maxAttempts ?? 3;

					if (attempts >= maxAttempts) {
						// Quota épuisé : le code est brûlé, y compris pour une saisie correcte ensuite.
						await this.dao.update({ _id: otp._id }, { status: 'expired', attempts });

						LoggerService.log({
							type: LogLevel.Warn,
							content: `Quota de tentatives OTP épuisé pour ${formattedLogin} (${otp.purpose})`,
							location: controllerLabel,
							method: 'verify'
						});

						resolve({
							status: defines.status.badRequest,
							message: 'Trop de tentatives. Demandez un nouveau code.',
							data: { verified: false, attempts }
						});
						return;
					}

					await this.dao.update({ _id: otp._id }, { attempts });

					LoggerService.log({
						type: LogLevel.Warn,
						content: `Code OTP incorrect pour ${formattedLogin} (tentative ${attempts}/${maxAttempts})`,
						location: controllerLabel,
						method: 'verify'
					});

					resolve({
						status: defines.status.badRequest,
						message: 'Code OTP incorrect',
						data: { verified: false, attempts }
					});
					return;
				}

				// Marquer l'OTP comme utilisé
				await this.dao.update(
					{ _id: otp._id },
					{
						status: 'used',
						usedAt: new Date(),
						attempts
					}
				);

				// Le login vérifié peut ne correspondre à aucun client existant
				// (ex: nouvel email/téléphone lors d'un changement d'email/téléphone,
				// qui n'est associé à aucun compte tant que la modification n'est pas
				// enregistrée) - ne pas planter dans ce cas.
				const user: any = await this.clientService.getOne(
					{ $or: [{ email: formattedLogin }, { contact: formattedLogin }] },
					'_id'
				);

				if (user && otp.purpose === MessageTypes.TYPES.ACCOUNT_VERIFICATION) {
					await this.clientService.update(user._id, { status: 'active' });
					MessageHelper.welcomeClient(user)
				}

				// [SÉCURITÉ F-03] Un parcours « mot de passe oublié » est autorisé par la
				// vérification de l'OTP, pas par l'identifiant que l'appelant annonce. On émet
				// donc ici le jeton court et à usage unique qu'exigera `updatePassword`.
				const isPasswordReset = otp.purpose === MessageTypes.TYPES.PASSWORD_RESET;
				const resetToken =
					isPasswordReset && user ? PasswordResetTokenHelper.issue(user._id) : null;

				// [SÉCURITÉ] `userId` n'est plus renvoyé : il n'autorise plus rien depuis F-03, et
				// l'exposer invite à réintroduire le schéma « l'appelant annonce sa cible ».
				resolve({
					status: defines.status.requestOK,
					message: 'Code OTP vérifié avec succès',
					data: { resetToken }
				});
			} catch (e) {
				reject(e);
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'verify');
		});
	}
	// Function to remove Otp
	remove(_id: string, erase?: boolean) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(_id)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				// Controller l'existence de l'élément
				let isData: any = await this.dao.exist({ _id });

				if (isData.error) {
					reject(isData);
				} else if (isData === false) {
					resolve({ status: defines.status.notFound, message: locale.notfound('Enregistrement'), data: null });
				} else {
					const remove: any = erase
						? await this.dao.remove({ _id })
						: await this.dao.update({ _id }, { status: 'removed' });

					if (remove.error) {
						reject(remove);
					} else {
						// Retrieve the updated demand item from the database
						const updatedItem: any = await this.dao.selectOne({ _id });
						// Resolve with a success response and the updated demand item
						resolve({
							status: defines.status.requestOK,
							message: locale.controller.done,
							data: updatedItem
						});
					}
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'remove');
		});
	}

	// Function to restore Otp
	restore(_id: string) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(_id)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				// Controller l'existence de l'élément
				let isData: any = await this.dao.exist({ _id });

				if (isData.error) {
					reject(isData);
				} else if (isData === false) {
					resolve({ status: defines.status.notFound, message: locale.notfound('Enregistrement'), data: null });
				} else {
					const remove: any = await this.dao.update({ _id }, { status: 'active' });

					if (remove.error) {
						reject(remove);
					} else {
						// Retrieve the updated demand item from the database
						const updatedItem: any = await this.dao.selectOne({ _id });
						// Resolve with a success response and the updated demand item
						resolve({
							status: defines.status.requestOK,
							message: locale.controller.done,
							data: updatedItem
						});
					}
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'remove');
		});
	}

	// Function to select with parameters Otp
	select(payloads: {
		page?: number;
		pageSize?: number;
		query?: string;
		date?: string;
		params?: any;
		sortBy?: string;
		orderBy?: string;
		status?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			const page: number = payloads.page || 1;
			const pageSize: number = payloads.pageSize!;
			const query: string = payloads.query!;
			const status: any = payloads.status!;
			const sortBy: string = payloads.sortBy ?? '';
			const orderBy: string = payloads.orderBy ?? '';

			let data: any | IErrorObject = {};

			if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: {}, page, pageSize });
			} else if (!coddyger.string.isEmpty(sortBy) || !coddyger.string.isEmpty(orderBy)) {
				data = await this.dao.select({ params: {}, page, pageSize, sort: sortBy, orderBy });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { status }, page, pageSize, sort: sortBy, orderBy });
			} else {
				data = await this.dao.select({
					params: {
						$or: [{ slug: { $regex: query || '', $options: 'i' } }, { title: { $regex: query || '', $options: 'i' } }]
					},
					page,
					pageSize,
					sort: sortBy,
					orderBy
				});
			}

			if (data.error) {
				reject(data);
				return;
			}

			const rows: IOtp[] = data.rows;
			delete data.rows;

			resolve({
				status: defines.status.requestOK,
				message: data,
				data: rows
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'select');
		});
	}

	// Function to select all Otp
	selectAll() {
		return new Promise(async (resolve, reject) => {
			const data: any | IErrorObject = await this.dao.selectHug();
			if (data.error) {
				reject(data);
				return;
			}

			const rows: IOtp[] = data;

			resolve({
				status: defines.status.requestOK,
				message: {
					totalRows: rows.length
				},
				data: rows || []
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectAll');
		});
	}

	// Function to select detail of Otp by id
	selectOne(payload: string) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(payload)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				const local: any | IErrorObject = await this.dao.selectOne({ _id: payload });

				if (local) {
					resolve({
						status: defines.status.requestOK,
						message: 'OK',
						data: local
					});
				} else {
					resolve({
						status: defines.status.notFound,
						message: locale.notfound('Enregistrement'),
						data: null
					});
					return;
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectOne');
		});
	}

	selectByStatus(payloads: { page?: number; pageSize?: number; status: string }) {
		return new Promise(async (resolve, reject) => {
			let page: number = payloads.page || 1;
			let pageSize: number = payloads.pageSize!;
			let status: any = payloads.status!;

			const data: any | IErrorObject = await this.dao.select({
				params: {
					status
				},
				page,
				pageSize
			});

			if (data.error) {
				reject(data);
				return;
			}

			const rows: IOtp[] = data.rows;
			delete data.rows;

			resolve({
				status: defines.status.requestOK,
				message: data,
				data: rows
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectByStatus');
		});
	}

	/**
	 * Point d'entrée pour générer un OTP
	 * Vérifie l'existence du client et utilise la méthode appropriée (email ou SMS)
	 * en fonction du type de contact fourni
	 * @param payload Données pour la génération du code
	 * @returns Résultat de l'opération
	 */
	generateOtp(payload: {
		userId: string;
		contact: string; // Email ou numéro de téléphone
		purpose: 'account_verification' | 'password_reset' | 'login_verification' | 'transaction_confirmation' | 'other';
		purposeDetails?: string;
		ip?: string;
		userAgent?: string;
		expiryMinutes?: number;
	}) {
		return new Promise(async (resolve, reject) => {
			try {
				// Vérifier l'existence du client
				const client = await this.clientService.getById(payload.userId);
				
				if (!client) {
					return resolve({
						status: defines.status.notFound,
						message: locale.notfound('Client'),
						data: null
					});
				}

				// Déterminer si le contact est un email ou un numéro de téléphone
				const emailValidation = this.clientService.validateEmail(payload.contact);
				const phoneValidation = this.clientService.validateIvorianPhoneNumber(payload.contact);

				if (!emailValidation.isValid && !phoneValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: 'Format de contact invalide. Veuillez fournir un email ou un numéro de téléphone valide.',
						data: null
					});
				}

				// Récupérer la configuration pour ce type de message
				const messageConfig = MessageTypes.getMessageConfig(payload.purpose);
				
				// Format login based on type
				const formattedLogin = emailValidation.isValid
					? this.clientService.formatEmail(payload.contact)
					: this.clientService.formatIvorianPhoneNumber(payload.contact);

				// Vérifier si un OTP actif existe déjà pour ce login
				const existingOtp: any = await this.dao.selectOne({
					login: formattedLogin,
					status: 'active',
					type: emailValidation.isValid ? 'email' : 'phone'
				});

				if (existingOtp) {
					await this.dao.update({ _id: existingOtp._id }, { status: 'expired' });
				}

				// Générer un code OTP
				const code = OtpService.generateCode();

				// Créer l'objet OTP selon l'interface IOtp
				const newOtp: IOtp = {
					_id: coddyger.string.generateObjectId(),
					code,
					login: formattedLogin,
					type: emailValidation.isValid ? 'email' : 'phone',
					purpose: payload.purpose,
					status: 'active',
					expiresAt: new Date(Date.now() + (payload.expiryMinutes || messageConfig.expiryMinutes) * 60 * 1000),
					attempts: 0
				};

				// Stocker les métadonnées dans un champ de commentaire ou de description si nécessaire
				// Cela dépend de la façon dont vous souhaitez gérer ces informations supplémentaires

				// Sauvegarder l'OTP dans la base de données
				const save: any | IErrorObject = await this.dao.save(newOtp);

				if (save.error) {
					reject(save);
				} else {
					// Préparer le message en fonction du type de contact
					let message;
					
					if (emailValidation.isValid) {
						// Obtenir le template d'email
						const emailTemplate = MessageTypes.getEmailTemplate(
							payload.purpose, 
							code, 
							client.firstname ? `${client.firstname} ${client.lastname || ''}`.trim() : undefined,
							payload.purposeDetails ? { details: payload.purposeDetails } : undefined
						);
						
						message = emailTemplate.subject;
						
						// TODO: Envoyer l'email avec le template
						// Pour l'instant, utiliser la méthode existante
						OtpService.sendOtp(formattedLogin, code, message, 'email');
					} else {
						// Obtenir le template SMS
						const smsMessage = MessageTypes.getSmsTemplate(payload.purpose, code);
						
						message = smsMessage;
						
						// TODO: Envoyer le SMS avec le template
						// Pour l'instant, utiliser la méthode existante
						OtpService.sendOtp(formattedLogin, code, message, 'phone');
					}

					resolve({
						status: defines.status.requestOK,
						message: emailValidation.isValid 
							? 'Code de vérification envoyé par email avec succès' 
							: 'Code de vérification envoyé par SMS avec succès',
						data: {
							login: formattedLogin,
							type: emailValidation.isValid ? 'email' : 'phone',
							otp: env.mode === 'dev' ? code : '...',
							purpose: payload.purpose
						}
					});
				}
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.error(e);
			return coddyger.catchReturn(e, controllerLabel, 'generateOtp');
		});
	}
}
