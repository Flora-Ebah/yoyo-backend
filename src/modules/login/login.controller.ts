import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { ILogin, ILoginClient, LoginService } from './';
import { ClientService } from '../client/client.service';

const controllerLabel: string = 'LoginController';

export class LoginController {
  private readonly service: LoginService;
  private readonly clientService: ClientService;
  constructor() {
    this.service = new LoginService();
    this.clientService = new ClientService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getAll(payloads);
        
        resolve({
          status: defines.status.requestOK,
          message: items.data,
          data: items.rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getAll');
    });
  }

  /**
   * Récupère un élément par son ID
   * @param id ID de l'élément
   * @returns Élément trouvé ou null
   */
  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        
        if (!item) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Login'),
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: item
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getById');
    });
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  login(item: ILoginClient) {
    return new Promise(async (resolve, reject) => {
      try {
        // Valider et formater le login
				const loginValidation = this.service.validateAndFormatLogin(item.login);
				if (!loginValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: loginValidation.message,
						data: null
					});
				}
				const formattedLogin = loginValidation.formattedLogin!;

        // Construire la requête et rechercher le client
				const isEmail = this.clientService.validateEmail(item.login).isValid;
				const searchQuery = this.service.buildClientSearchQuery(formattedLogin, isEmail);

        const client = await this.clientService.getOne(searchQuery);
        if (!client) {
					console.log(locale.notfound('Compte'), item.login);
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.loginFailed,
						data: null
					});
				}

				// Vérifier si le compte est verrouillé (maintenant que nous avons l'ID du client)
				const lockCheck = await this.service.checkAccountLock(client._id);
				if (lockCheck.isLocked) {
					return resolve({
						status: defines.status.forbidden,
						message: lockCheck.message,
						data: null
					});
				}

        // Vérifier le mot de passe
				const isValidPasscode = await this.service.verifyPassword(item.password, client.password);
				if (!isValidPasscode) {
					// Gérer la tentative de connexion échouée
					let updatedLoginAttempts: any = null;
					try {
						updatedLoginAttempts = await this.service.handleFailedLogin(
							client, 
							lockCheck.loginAttempts,
							item.userAgent,
							item.ip
						);
					} catch (attemptsError) {
						console.error('Erreur lors de l\'enregistrement de la tentative échouée:', attemptsError);
						updatedLoginAttempts = { attempts: lockCheck.loginAttempts?.attempts ? lockCheck.loginAttempts.attempts + 1 : 1 };
					}
					
					return resolve({
						status: defines.status.badRequest,
						message: this.service.getFailedLoginMessage(updatedLoginAttempts.attempts),
						data: null
					});
				}

        // Réinitialiser les tentatives de connexion après une connexion réussie
				try {
					await this.service.resetLoginAttempts(client._id, item.userAgent, item.ip);
				} catch (resetError) {
					console.error('Erreur lors de la réinitialisation des tentatives:', resetError);
				}

        // Générer les tokens
				const tokens = await this.service.generateTokens(client);
				if (!tokens) {
					return resolve({
						status: defines.status.serverError,
						message: 'Erreur lors de la génération des tokens d\'authentification',
						data: null
					});
				}

        // Associer le token à la tentative de connexion
				let loginId: any = null;
				try {
					loginId = await this.service.associateTokenWithLogin(client._id, tokens.token, item.userAgent, item.ip);
					if (!loginId) {
						return resolve({
							status: defines.status.serverError,
							message: 'Erreur lors de l\'association du token:',
							data: null
						});
					}
				} catch (associateError) {
					console.error('Erreur lors de l\'association du token:', associateError);
				}

				this.service.sendLoginNotification(client, loginId);

        // Préparer la réponse
				const userData = this.service.prepareClientResponse(client);
        
        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: {
						loginId,
						token: {
              accessToken: tokens.token,
              refreshToken: tokens.refreshToken
            },
						user: userData
					}
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'create');
    });
  }

	/**
	 * Récupérer les connexions
	 * @param payloads Paramètres de la requête
	 */
	select(payloads: {
		page?: number;
		pageSize?: number;
		query?: string;
		sortBy?: string;
		orderBy?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			const page: number = payloads?.page ?? 1;
			const pageSize: number = payloads?.pageSize!;
			const query: string = payloads?.query!;
			const sortBy: string = payloads?.sortBy ?? '';
			const orderBy: string = payloads?.orderBy ?? '';

			let data: any | IErrorObject = {};

			if (coddyger.string.isEmpty(query)) {
				data = await this.service.dao.select({
					params: {},
					page,
					pageSize
				});
			} else if (!coddyger.string.isEmpty(sortBy) || !coddyger.string.isEmpty(orderBy)) {
				data = await this.service.dao.select({
					params: {},
					page,
					pageSize,
					sort: sortBy,
					orderBy
				});
			} else {
				data = await this.service.dao.select({
					params: {
						$or: [
							{
								login: {
									$regex: query || '',
									$options: 'i'
								}
							},
							{
								ip: {
									$regex: query || '',
									$options: 'i'
								}
							},
							{
								userAgent: {
									$regex: query || '',
									$options: 'i'
								}
							}
						]
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

			const rows: ILogin[] = data.rows;
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

	/**
	 * Récupérer les connexions d'un client
	 * @param payloads Paramètres de la requête
	 */
	selectByClient(payloads: {
		login: string;
		page?: number;
		pageSize?: number;
		sortBy?: string;
		orderBy?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			const login: string = payloads.login;
			const page: number = payloads?.page ?? 1;
			const pageSize: number = payloads?.pageSize!;
			const sortBy: string = payloads?.sortBy ?? '';
			const orderBy: string = payloads?.orderBy ?? '';

			const data: any | IErrorObject = await this.service.dao.select({
				params: {
					user:login
				},
				page,
				pageSize,
				sort: sortBy,
				orderBy,
			});

			if (data.error) {
				reject(data);
				return;
			}

			const rows: ILogin[] = data.rows;
			delete data.rows;

			resolve({
				status: defines.status.requestOK,
				message: data,
				data: rows
			});
		});
	}

	/**
	 * Supprime une connexion et enregistre son token dans le modèle Token
	 * @param loginId ID de la connexion à supprimer
	 */
	deleteLogin(loginId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!coddyger.string.isValidObjectId(loginId)) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.wrongObjectId("de la connexion"),
						data: null
					});
				}

				const result = await this.service.deleteLogin(loginId);
				
				if (result.status === 'error') {
					return resolve({
						status: defines.status.badRequest,
						message: result.message,
						data: null
					});
				}
				
				return resolve({
					status: defines.status.requestOK,
					message: result.message,
					data: null
				});
			} catch (error) {
				console.error('Erreur lors de la suppression de la connexion:', error);
				return reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.error('Erreur attrapée dans le catch de deleteLogin:', e);
			return coddyger.catchReturn(e, controllerLabel, 'deleteLogin');
		});
	}

	/**
	 * Supprime une connexion du client connecté
	 * @param loginId ID de la connexion à supprimer
	 * @param clientId ID du client connecté
	 */
	deleteClientLogin(loginId: string, clientId: string) {
		return new Promise(async (resolve, reject) => {
			if (!loginId) {
				console.error('ID de connexion non fourni');
				return resolve({
					status: defines.status.badRequest,
					message: "ID de connexion requis",
					data: null
				});
			}
			
			if (!coddyger.string.isValidObjectId(loginId)) {
				return resolve({
					status: defines.status.badRequest,
					message: locale.wrongObjectId("de la connexion"),
					data: null
				});
			}

			if (!clientId || !coddyger.string.isValidObjectId(clientId)) {
				return resolve({
					status: defines.status.badRequest,
					message: "ID du client invalide",
					data: null
				});
			}

			const result = await this.service.deleteClientLogin(loginId, clientId);
			
			if (result.status === 'error') {
				return resolve({
					status: defines.status.badRequest,
					message: result.message,
					data: null
				});
			}
			
			return resolve({
				status: defines.status.requestOK,
				message: result.message,
				data: null
			});
		}).catch((e: IErrorObject) => {
			console.error('deleteClientLogin:', e);
			return coddyger.catchReturn(e, controllerLabel, 'deleteClientLogin');
		});
	}

	/**
	 * Déconnecte un utilisateur en enregistrant son token
	 * @param loginId ID de la connexion à désactiver
	 * @param userId ID de l'utilisateur
	 */
	logout(loginId: string, userId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				// Vérifier que les données requises sont présentes
				if (!loginId) {
					return resolve({
						status: defines.status.badRequest,
						message: 'ID de connexion requis',
						data: null
					});
				}

				if (!userId || !coddyger.string.isValidObjectId(userId)) {
					return resolve({
						status: defines.status.badRequest,
						message: 'ID utilisateur invalide',
						data: null
					});
				}

				// Appeler le service pour gérer la déconnexion
				const result = await this.service.logout(loginId, userId);
				
				if (result.status === 'error') {
					return resolve({
						status: defines.status.badRequest,
						message: result.message,
						data: null
					});
				}
				
				return resolve({
					status: defines.status.requestOK,
					message: result.message,
					data: null
				});
			} catch (error) {
				console.error('Erreur dans la fonction logout:', error);
				if (error === null || error === undefined) {
					return resolve({
						status: defines.status.serverError,
						message: 'Une erreur inconnue est survenue',
						data: null
					});
				}
				return reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.error('Erreur attrapée dans le catch de logout:', e);
			return coddyger.catchReturn(e, controllerLabel, 'logout');
		});
	}

	/**
	 * Vérifie la disponibilité d'un email
	 * @param email Email à vérifier
	 * @returns true si l'email est disponible, false sinon
	 */
	checkEmail(email: string) {
		return new Promise(async (resolve, reject) => {
			try {
				// Valider le format de l'email
				const emailValidation = this.clientService.validateEmail(email);
				if (!emailValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: emailValidation.message || 'Format d\'adresse email invalide',
						data: null
					});
				}

				const result = await this.service.checkEmail(email);
				if(result === true) {
					// L'email existe déjà, donc il n'est pas disponible
					return resolve({
						status: defines.status.badRequest,
						message: 'Cette adresse email est déjà utilisée',
						data: null
					});
				} else {
					// L'email n'existe pas, donc il est disponible
					return resolve({
						status: defines.status.requestOK,
						message: 'Cette adresse email est disponible',
						data: { available: true, email: email }
					});
				}
			} catch (error) {
				reject(error);
			}

		});
	}

	/**
	 * Vérifie la disponibilité d'un numéro de téléphone
	 * @param phoneNumber Numéro de téléphone à vérifier
	 * @returns true si le numéro est disponible, false sinon
	 */
	checkPhone(phoneNumber: string) {
		return new Promise(async (resolve, reject) => {
			try {
				// Valider le format du numéro de téléphone
				const phoneValidation = this.clientService.validateIvorianPhoneNumber(phoneNumber);
				if (!phoneValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: phoneValidation.message || 'Format de numéro de téléphone invalide',
						data: null
					});
				}

				// Formater le numéro de téléphone
				const formattedPhone = this.clientService.formatIvorianPhoneNumber(phoneNumber);
				
				// Vérifier si le numéro existe déjà
				const existingClient = await this.clientService.checkContactExists(formattedPhone);
				
				if (existingClient.exists) {
					return resolve({
						status: defines.status.badRequest,
						message: 'Ce numéro de téléphone est déjà utilisé',
						data: null
					});
				} else {
					return resolve({
						status: defines.status.requestOK,
						message: 'Ce numéro de téléphone est disponible',
						data: { available: true, phoneNumber: formattedPhone }
					});
				}
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.error(e);
			return coddyger.catchReturn(e, controllerLabel, 'checkPhone');
		});
	}
}