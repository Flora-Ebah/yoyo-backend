import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { TokenMiddleware } from '../../api/middleware/token.middleware';
import { locale } from '../../public';
import { MessageTypes, NotificationCategory, NotificationType, notificationManager } from '../../services/notification';
import { IToken, TokenSet } from '../../shared/models';
import { IClient } from '../client';
import { ClientService } from '../client/client.service';
import { ILogin } from './login.interface';
import { LoginSet } from './login.model';
import { MessageHelper } from '../../helpers/message.helper';

export class LoginService {
	public readonly dao: IData<ILogin>;
	private readonly daoToken: IData<IToken>;
	private readonly serviceLabel = 'LoginService';
	private readonly clientService: ClientService;
  private readonly MAX_ATTEMPTS = 3;
	private readonly LOCK_DURATION_MINUTES = 30;

	constructor() {
		this.dao = new LoginSet();
		this.daoToken = new TokenSet();
		this.clientService = new ClientService();
	}

	/**
	 * Récupère tous les éléments
	 * @returns Liste des éléments
	 */
	async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }): Promise<any> {
		try {
			let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';

			let data: any | IErrorObject = {};

			if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: {}, page, pageSize });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { status }, page, pageSize });
			} else {
				data = await this.dao.select({
					params: {
						$or: [{ slug: { $regex: query || '', $options: 'i' } }, { title: { $regex: query || '', $options: 'i' } }]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

			const rows: ILogin[] = data.rows;
			delete data.rows;

			return {
				data,
				rows
			};
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'getAll'
			});
			throw error;
		}
	}

	/**
	 * Récupère tous les éléments
	 * @returns Liste des éléments
	 */
	async getHug(params?: any): Promise<ILogin[]> {
		try {
			const result: any = await this.dao.selectHug(params);
			return result;
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'getAll'
			});
			throw error;
		}
	}

	/**
	 * Récupère un élément par son ID
	 * @param id ID de l'élément
	 * @returns Élément trouvé ou null
	 */
	async getById(id: string): Promise<any> {
		try {
			return await this.dao.selectOne({ _id: id, status: { $nin: ['removed', 'archived'] } });
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'getById'
			});
			throw error;
		}
	}

	/**
	 * Crée un nouvel élément
	 * @param item Données de l'élément à créer
	 * @returns Élément créé
	 */
	async create(item: ILogin): Promise<any> {
		try {
			// Génération d'un ID si non fourni
			if (!item._id) {
				item._id = coddyger.string.generateObjectId();
			}

			// Ajout du statut par défaut si non fourni
			if (!item.status) {
				item.status = 'active';
			}

			return await this.dao.save(item);
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'create'
			});
			throw error;
		}
	}

	/**
	 * Met à jour un élément existant
	 * @param id ID de l'élément à mettre à jour
	 * @param item Nouvelles données
	 * @returns Élément mis à jour
	 */
	async update(id: string, item: Partial<ILogin>): Promise<ILogin | null> {
		try {
			const result: any = await this.dao.update({ _id: id }, item);
			if (result.error) {
				throw new Error(result);
			}
			return this.getById(id);
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'update'
			});
			throw error;
		}
	}

	/**
	 * Supprime un élément (mise à jour du statut)
	 * @param id ID de l'élément à supprimer
	 * @returns Résultat de l'opération
	 */
	async delete(id: string): Promise<void> {
		try {
			const result: any = await this.dao.update({ _id: id }, { status: 'removed' });
			if (result.error) {
				throw new Error(result);
			}
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'delete'
			});
			throw error;
		}
	}

	/**
	 * Vérifie et formate le login
	 * @param login Identifiant de l'utilisateur
	 * @returns Objet contenant le résultat de la validation et le login formaté
	 */
	validateAndFormatLogin(login: string): { isValid: boolean; formattedLogin?: string; message?: string } {
		const emailValidation = this.clientService.validateEmail(login);
		const phoneValidation = this.clientService.validateIvorianPhoneNumber(login);

		if (!emailValidation.isValid && !phoneValidation.isValid) {
			return {
				isValid: false,
				message: locale.controller.client.invalidLoginFormat
			};
		}

		let formattedLogin: string;
		if (emailValidation.isValid) {
			formattedLogin = this.clientService.formatEmail(login);
		} else {
			formattedLogin = this.clientService.formatIvorianPhoneNumber(login);
		}

		return {
			isValid: true,
			formattedLogin
		};
	}

	/**
	 * Vérifie si le compte est verrouillé
	 * @param clientId ID du client
	 * @returns Objet contenant le résultat de la vérification et le message d'erreur si verrouillé
	 */
	async checkAccountLock(
		clientId: string
	): Promise<{ isLocked: boolean; message?: string; loginAttempts?: any }> {
		let loginAttempts: any = null;
		try {
			loginAttempts = await this.getLoginAttempts(clientId);
		} catch (err) {
			console.error('Erreur lors de la récupération des tentatives de connexion:', err);
			return { isLocked: false, loginAttempts: null };
		}

		if (loginAttempts?.locked && loginAttempts.lockExpiration && loginAttempts.lockExpiration > new Date()) {
			const remainingTime = Math.ceil((loginAttempts.lockExpiration.getTime() - Date.now()) / 1000 / 60);
			return {
				isLocked: true,
				message: `Compte temporairement verrouillé. Réessayez dans ${remainingTime} minutes.`,
				loginAttempts
			};
		}

		return { isLocked: false, loginAttempts };
	}

	/**
	 * Récupère les tentatives de connexion pour un utilisateur
	 * @param clientId ID du client
	 * @returns Tentatives de connexion ou null si aucune
	 */
	async getLoginAttempts(clientId: string): Promise<ILogin | null> {
		const result: any = await this.dao.selectOne({ user: clientId });
		
		if (result && result.error) {
			console.error('Erreur lors de la récupération des tentatives de connexion:', result.error);
			throw new Error(result);
		}
		
		return result;
	}

	/**
	 * Construit la requête de recherche pour trouver le client
	 * @param formattedLogin Login formaté
	 * @param isEmail Indique si le login est un email
	 * @returns Requête de recherche
	 */
	buildClientSearchQuery(formattedLogin: string, isEmail: boolean): any {
		let searchQuery: any = {
			$or: [],
			status: 'active'
		};

		if (isEmail) {
			searchQuery.$or.push({ email: formattedLogin });
		} else {
			searchQuery.$or.push({ contact: formattedLogin });
		}

		return searchQuery;
	}

	/**
	 * Vérifie le mot de passe du client
	 * @param passcode Mot de passe fourni
	 * @param clientPasscode Mot de passe stocké
	 * @returns Résultat de la vérification
	 */
	async verifyPassword(passcode: string, clientPasscode: string): Promise<boolean> {
		try {
			return await coddyger.string.decryptPassword(passcode, clientPasscode);
		} catch (passError) {
			return false;
		}
	}

	/**
	 * Gère une tentative de connexion échouée
	 * @param client Données du client
	 * @param loginAttempts Tentatives de connexion existantes
	 * @param userAgent Agent utilisateur
	 * @param ip Adresse IP
	 * @returns Données mises à jour des tentatives de connexion
	 */
	async handleFailedLogin(
		client: any, 
		loginAttempts: ILogin | null, 
		userAgent?: string, 
		ip?: string
	): Promise<ILogin> {
		try {
			let attempts = 1;
			let locked = false;
			let lockExpiration: Date | undefined = undefined;

			if (loginAttempts) {
				// S'assurer que attempts est un nombre
				attempts = (typeof loginAttempts.attempts === 'number' ? loginAttempts.attempts : 0) + 1;

				// Vérifier si le compte doit être verrouillé
				if (attempts >= this.MAX_ATTEMPTS) {
					locked = true;

					// Définir l'expiration du verrouillage
					const now = new Date();
					lockExpiration = new Date(now.getTime() + this.LOCK_DURATION_MINUTES * 60000);
				}
			}

			// Préparer les données de la tentative de connexion
			const loginData: ILogin = {
				_id: loginAttempts?._id ?? coddyger.string.generateObjectId(),
				attempts,
				lastAttempt: new Date(),
				locked,
				lockExpiration,
				success: false,
				status: 'active',
				user: client._id
			};

			// Ajouter userAgent et IP s'ils sont fournis
			if (userAgent) {
				loginData.userAgent = userAgent;
			}

			if (ip) {
				loginData.ip = ip;
			}

			// Enregistrer la tentative de connexion
			await this.saveLoginAttempt(loginData);

			return loginData;
		} catch (error) {
			console.error('Erreur lors de la gestion de la tentative de connexion échouée:', error);
			throw error;
		}
	}

	/**
	 * Enregistre une tentative de connexion
	 * @param loginData Données de la tentative de connexion
	 * @returns Résultat de l'opération
	 */
	async saveLoginAttempt(loginData: ILogin): Promise<any> {
		try {
			// Construire la requête pour rechercher une entrée avec le même userAgent
			const query: any = { user: loginData.user };
			if (loginData.userAgent) {
				query.userAgent = loginData.userAgent;
			}
			
			// Vérifier si un document existe déjà pour ce client avec le même userAgent
			const existingAttempt: any = await this.dao.selectOne(query);

			if (existingAttempt) {
				// Mettre à jour le document existant
				const updateResult = await this.dao.update(
					{ _id: existingAttempt._id },
					{
						attempts: loginData.attempts,
						lastAttempt: new Date(),
						locked: loginData.locked,
						lockExpiration: loginData.lockExpiration,
						success: loginData.success,
						ip: loginData.ip ?? existingAttempt.ip
					}
				);
				
				return updateResult;
			} else {
				// Créer un nouveau document
				const saveResult = await this.dao.save(loginData);
				return saveResult;
			}
		} catch (error) {
			console.error("Erreur lors de l'enregistrement de la tentative de connexion:", error);
			throw error;
		}
	}

	/**
	 * Obtient le message d'erreur pour une tentative de connexion échouée
	 * @param attempts Nombre de tentatives échouées
	 * @returns Message d'erreur
	 */
	getFailedLoginMessage(attempts: number): string {
		const remainingAttempts = this.MAX_ATTEMPTS - attempts;

		if (remainingAttempts <= 0) {
			return 'Trop de tentatives échouées. Votre compte est temporairement verrouillé.';
		} else if (remainingAttempts === 1) {
			return 'Mot de passe incorrect. Il vous reste 1 tentative avant le verrouillage temporaire de votre compte.';
		} else {
			return `Mot de passe incorrect. Il vous reste ${remainingAttempts} tentatives avant le verrouillage temporaire de votre compte.`;
		}
	}

	/**
	 * Réinitialise les tentatives de connexion après une connexion réussie
	 * @param clientId ID du client
	 * @param userAgent Agent utilisateur
	 * @param ip Adresse IP
	 */
	async resetLoginAttempts(clientId: string, userAgent?: string, ip?: string): Promise<ILogin> {
		// Construire la requête pour rechercher une entrée avec le même userAgent
		const query: any = { user: clientId };
		if (userAgent) {
			query.userAgent = userAgent;
		}
		
		// Vérifier si un document existe déjà pour ce client avec le même userAgent
		const existingAttempt: any = await this.dao.selectOne(query);

		if (existingAttempt) {
			// Mettre à jour le document existant
			await this.dao.update(
				{ _id: existingAttempt._id },
				{
					attempts: 0,
					lastAttempt: new Date(),
					locked: false,
					lockExpiration: undefined,
					success: true,
					ip: ip ?? existingAttempt.ip
				}
			);

			return {
				...existingAttempt,
				attempts: 0,
				lastAttempt: new Date(),
				locked: false,
				lockExpiration: undefined,
				success: true
			};
		} else {
			// Créer un nouveau document
			const loginData: ILogin = {
				_id: coddyger.string.generateObjectId(),
				attempts: 0,
				lastAttempt: new Date(),
				locked: false,
				success: true,
				status: 'active',
				user: clientId
			};

			if (userAgent) {
				loginData.userAgent = userAgent;
			}

			if (ip) {
				loginData.ip = ip;
			}

			await this.dao.save(loginData);
			return loginData;
		}
	}

	/**
	 * Génère les tokens d'authentification
	 * @param client Données du client
	 * @returns Tokens générés ou null en cas d'erreur
	 */
	async generateTokens(client: any): Promise<{ token: string; refreshToken: string } | null> {
		try {
			const token = await TokenMiddleware.generate(
				{
					_id: client._id,
					email: client.email,
					contact: client.contact ?? ""
				},
				'accessToken',
				`${client.securityPreferences.sessionTimeout}m`
			);

			const refreshToken = await TokenMiddleware.generate(
				{
					_id: client._id,
					email: client.email,
					contact: client.contact ?? ""
				},
				'refreshToken'
			);

			return { token, refreshToken };
		} catch (tokenError) {
			console.error('Erreur lors de la génération des tokens:', tokenError);
			return null;
		}
	}

	/**
	 * Prépare les données du client pour la réponse
	 * @param client Données du client
	 * @returns Données formatées
	 */
	prepareClientResponse(client: any): any {
		// Calculer les informations de vérification du compte
		const isCertified = !!(client.isDocumentVerified && client.isContactVerified);
		const accountVerificationCompletion = this.clientService.buildAccountVerificationRate(
			client.isDocumentVerified,
			client.isContactVerified
		);

		return {
			_id: client._id,
			login: client.login,
			email: client.email,
			contact: client.contact,
			firstname: client.firstname,
			lastname: client.lastname,
			authProvider: client.authProvider,
			isDocumentVerified: client.isDocumentVerified,
			isEmailVerified: client.isEmailVerified,
			birthdate: client.birthdate,
			country: client.country,
			gender: client.gender,
			avatar: client.avatar,
			isCertified,
			isPartner: client.isPartner ?? false,
			// Compte créé à distance par un commercial : l'app Pro doit imposer l'écran
			// « définir mon mot de passe » tant que ce drapeau est vrai.
			mustChangePassword: client.mustChangePassword ?? false,
			accountVerificationCompletion,
      isPhoneConfirmed: client.isPhoneConfirmed,
      isEmailConfirmed: client.isEmailConfirmed,
			securityPreferences: client.securityPreferences,
			notificationPreferences: client.notificationPreferences,
			address: client.address,
			documentVerificationStatus: client.documentVerificationStatus ?? ''
		};
	}

	/**
	 * Gère la déconnexion d'un utilisateur en enregistrant son token
	 * @param loginId ID de la connexion à désactiver
	 * @param userId ID de l'utilisateur (client ou admin)
	 * @returns Résultat de l'opération
	 */
	async logout(loginId: string, userId: string): Promise<any> {
		if (!loginId) {
			return {
				status: 'error',
				message: 'ID de connexion non fourni',
				data: null
			};
		}

    const isLogin: any = await this.dao.selectOne({ _id: loginId });
    
    if (!isLogin) {
      return {
        status: 'error',
        message: 'Connexion non trouvée',
        data: null
      };
    }

		try {
			// Mettre à jour le statut du login à 'ended'
			await this.dao.update({ _id: loginId }, { status: 'ended' });
			
			// Vérifier si le token existe déjà dans le modèle Token
			const existingToken: any = await this.daoToken.exist({ token: isLogin.token });
			
			if (existingToken) {
				return {
					status: 'success',
					message: 'Déconnexion réussie',
					data: null
				};
			}
			
			// Préparer les données du token
			const tokenData: any = {
				_id: coddyger.string.generateObjectId(),
				token: isLogin.token,
				deactivatedAt: new Date(),
				status: 'inactive',
				user: userId
			};
			
			// Enregistrer le token dans le modèle Token
			await this.daoToken.save(tokenData);
			
			return {
				status: 'success',
				message: 'Déconnexion réussie',
				data: null
			};
		} catch (error) {
			console.error('Erreur lors de la déconnexion:', error);
			return {
				status: 'error',
				message: 'Une erreur est survenue lors de la déconnexion',
				data: null
			};
		}
	}

	/**
	 * Associe un token à une tentative de connexion réussie
	 * @param clientId ID du client
	 * @param token Token d'authentification
	 * @param userAgent Agent utilisateur
	 * @param ip Adresse IP
	 */
	async associateTokenWithLogin(
		clientId: string,
		token: string,
		userAgent?: string,
		ip?: string
	): Promise<any> {
		if (!token) {
			console.error('Token non fourni');
			return;
		}

		try {
			// Rechercher si une connexion existe avec le même userAgent
			const query: any = { user: clientId };
			if (userAgent) {
				query.userAgent = userAgent;
			}
			
			const matchingLogin: any = await this.dao.selectOne(query);
			
			if (matchingLogin) {
				// Mettre à jour le document existant
				await this.dao.update(
					{ _id: matchingLogin._id },
					{
						token,
						lastAttempt: new Date(),
						ip: ip || matchingLogin.ip,
						success: true,
						attempts: 0,
						locked: false
					}
				);

				return matchingLogin._id;
			} else {
				const _id: string = coddyger.string.generateObjectId();
				// Créer une nouvelle connexion
				const loginData: ILogin = {
					_id,
					user: clientId,
					success: true,
					attempts: 0,
					lastAttempt: new Date(),
					locked: false,
					token,
					status: 'active'
				};

				if (userAgent) {
					loginData.userAgent = userAgent;
				}

				if (ip) {
					loginData.ip = ip;
				}

				await this.dao.save(loginData);

				return _id
			}
		} catch (error) {
			console.error("Erreur lors de l'association du token:", error);
			// Ne pas propager l'erreur pour éviter d'interrompre le flux de connexion
			return false
		}
	}

	/**
	 * Supprime une connexion d'un client spécifique
	 * @param loginId ID de la connexion à supprimer
	 * @param clientId ID du client qui demande la suppression
	 * @returns Résultat de l'opération
	 */
	async deleteClientLogin(loginId: string, clientId: string): Promise<any> {
		// Valider les IDs
		const validationError = this.validateIds(loginId, clientId);
		if (validationError) return validationError;

		const loginDao = new LoginSet();

		// Vérifier que le client existe
		const client = await this.clientService.getOne({ _id: clientId });
		if (!client) {
			return {
				status: 'error',
				message: 'Client non trouvé',
				data: null
			};
		}

		// Récupérer les détails de la connexion
		const login = await loginDao.selectOne({ _id: loginId });
		if (!login) {
			return {
				status: 'error',
				message: 'Connexion non trouvée',
				data: null
			};
		}

		// Vérifier que la connexion appartient bien au client
		if (!this.loginBelongsToClient(login, client, clientId)) {
			return {
				status: 'error',
				message: "Vous n'êtes pas autorisé à supprimer cette connexion",
				data: null
			};
		}

		// Mettre à jour le statut de la connexion
		try {
			await loginDao.update({ _id: loginId }, { status: 'ended' });
		} catch (updateError) {
			console.error('Erreur lors de la mise à jour du statut de la connexion:', updateError);
			return {
				status: 'error',
				message: 'Erreur lors de la mise à jour du statut de la connexion',
				data: null
			};
		}

		// Gérer le token si présent
		if (login.token) {
			await this.saveTokenToModel(login.token, login, clientId);
		}

		return {
			status: 'success',
			message: 'Connexion supprimée avec succès',
			data: null
		};
	}

	/**
	 * Supprime une connexion et enregistre son token dans le modèle Token
	 * @param loginId ID de la connexion à supprimer
	 * @returns Résultat de l'opération
	 */
	async deleteLogin(loginId: string): Promise<any> {
		try {
			const loginDao = new LoginSet();

			// Récupérer les détails de la connexion
			const login = await loginDao.selectOne({ _id: loginId });

			if (!login) {
				return {
					status: 'error',
					message: 'Connexion non trouvée',
					data: null
				};
			}

			// Vérifier si la connexion a un token
			if (login.token) {
				try {
					// Vérifier si le token est déjà enregistré dans le modèle Token
					const existingToken = await this.daoToken.selectOne({ token: login.token });

					if (!existingToken) {
						// Préparer les données du token
						const tokenData: any = {
							_id: coddyger.string.generateObjectId(),
							token: login.token,
							deactivatedAt: new Date(),
							status: 'inactive'
						};

						// Ajouter le champ user qui est requis
						if (login.client && coddyger.string.isValidObjectId(login.client)) {
							tokenData.user = login.client;
						} else if (login.user && coddyger.string.isValidObjectId(login.user.toString())) {
							tokenData.user = login.user;
						} else {
							// Si aucun ID valide n'est disponible, utiliser un ID par défaut
							tokenData.user = coddyger.string.generateObjectId();
						}

						// Enregistrer le token dans le modèle Token
						try {
							await this.daoToken.save(tokenData);
						} catch (saveError) {
							console.error('Erreur lors de la sauvegarde du token:', saveError);
							// Continuer même en cas d'erreur avec le token
						}
					}
				} catch (tokenError) {
					console.error('Erreur lors de la vérification du token:', tokenError);
					// Continuer même en cas d'erreur avec le token
				}
			}

			// Mettre à jour le statut de la connexion
			try {
				await loginDao.update({ _id: loginId }, { status: 'ended' });
			} catch (updateError) {
				console.error('Erreur lors de la mise à jour du statut de la connexion:', updateError);
				return {
					status: 'error',
					message: 'Erreur lors de la mise à jour du statut de la connexion',
					data: null
				};
			}

			return {
				status: 'success',
				message: 'Connexion supprimée avec succès',
				data: null
			};
		} catch (error) {
			console.error('Erreur dans deleteLogin:', error);
			// Éviter de passer null ou undefined à LoggerService.log
			if (error) {
				try {
					LoggerService.log({
						type: LogLevel.Error,
						content: error,
						location: 'LoginService',
						method: 'deleteLogin'
					});
				} catch (logError) {
					console.error('Erreur lors de la journalisation:', logError);
				}
			}
			return {
				status: 'error',
				message: 'Une erreur est survenue lors de la suppression de la connexion',
				data: null
			};
		}
	}

	/**
	 * Vérifie si un email est associé à un compte client
	 * @param email Email à vérifier
	 * @returns true si l'email existe, false sinon
	 */
	async checkEmail(email: string): Promise<boolean | string> {
		try {
			const client = await this.clientService.getOne({ email });
			return !!client;
		} catch (error) {
			console.error('Erreur lors de la vérification de l\'email:', error);
			return false;
		}
	}

	// Envoie de notification de connexion
	async sendLoginNotification(client: IClient, loginId: string) {
		const loginNotifications:boolean = client.securityPreferences?.loginNotifications ?? false;
		if(!loginNotifications) return;

		const login:any = await this.dao.selectOne({ _id: loginId });
		MessageHelper.loginNotify({
			login: client.email,
			name: client.firstname + ' ' + client.lastname,
			lastAttempt: login.lastAttempt,
			userAgent: login.userAgent,
			ip: login.ip
		});
	}

	/**
	 * Vérifie si la connexion appartient au client
	 * @param login Objet de connexion
	 * @param client Objet client
	 * @param clientId ID du client
	 * @returns Vrai si la connexion appartient au client
	 */
	private loginBelongsToClient(login: any, client: any, clientId: string): boolean {
		const clientIdentifier = client.login || client.email || client.contact;
		return (
			login.userIdentifier === clientIdentifier ||
			login.client === clientId ||
			(login.user && login.user.toString() === clientId)
		);
	}

	/**
	 * Enregistre le token dans le modèle Token
	 * @param token Token à enregistrer
	 * @param login Objet de connexion
	 * @param clientId ID du client
	 */
	private saveTokenToModel(token: string, login: any, clientId: string) {
		return new Promise(async (resolve, reject) => {
			const tokenData: any = {
        _id: coddyger.string.generateObjectId(),
        token,
        deactivatedAt: new Date(),
        status: 'inactive'
      };

      // Enregistrer le token
      try {
        await this.daoToken.save(tokenData);
        resolve({ error: false, data: tokenData });
      } catch (saveError) {
        reject(saveError)
      }
		}).catch((e: any) => {
			console.error("Erreur lors de l'enregistrement du token:", e);
			return { error: true, data: e };
		});
	}

	/**
	 * Vérifie la validité des IDs fournis
	 * @param loginId ID de la connexion
	 * @param clientId ID du client
	 * @returns Un objet d'erreur ou null si les IDs sont valides
	 */
	private validateIds(loginId: string, clientId: string): any {
		if (!loginId || !coddyger.string.isValidObjectId(loginId)) {
			return {
				status: 'error',
				message: 'ID de connexion invalide',
				data: null
			};
		}

		if (!clientId || !coddyger.string.isValidObjectId(clientId)) {
			return {
				status: 'error',
				message: 'ID du client invalide',
				data: null
			};
		}

		return null;
	}
}
