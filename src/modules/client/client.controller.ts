import coddyger, { IErrorObject, defines, env } from 'coddyger';
import { locale } from '../../public';
import { IClient, IRegister, ClientService, IUpdatePassword } from './';
import { LoginService } from '../login/login.service';
import { notificationManager, NotificationCategory, NotificationType } from '../../services/notification';
import { NotificationHelper } from '../../helpers/notification.helper';

const controllerLabel: string = 'ClientController';

export class ClientController {
  private readonly service: ClientService;
  private readonly serviceLogin: LoginService;

  constructor() {
    this.service = new ClientService();
    this.serviceLogin = new LoginService();
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
            message: locale.notfound('Client'),
            data: null
          });
        }

        const userData = this.serviceLogin.prepareClientResponse(item);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: userData
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
  register(item: IRegister) {
    return new Promise(async (resolve, reject) => {
      try {
        // Déterminer si le login est un email ou un numéro de téléphone
        const emailValidation = this.service.validateEmail(item.email);
        const phoneValidation = this.service.validateIvorianPhoneNumber(item.contact);

        if (!emailValidation.isValid && !phoneValidation.isValid) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.client.invalidLoginFormat,
            data: null
          });
        }

        // Validation des autres données
        const validation = this.service.validateRegistrationData(item);
        if (!validation.isValid) {
          return resolve({
            status: defines.status.badRequest,
            message: validation.message,
            data: null
          });
        }

        // Formatage des données
        const formattedItem: any = this.service.formatRegistrationData(item);

        // Vérification de l'existence des identifiants
        const existingCredentials = await this.service.checkExistingCredentials(formattedItem.email, formattedItem.contact);
        if (existingCredentials.exists) {
          return resolve({
            status: defines.status.badRequest,
            message: existingCredentials.message,
            data: existingCredentials.data
          });
        }

        // Détails du dernier compte enregistré pour le slug
			  const theLast: any = await this.service.selectLatest();
        formattedItem._id = coddyger.string.generateObjectId();
        formattedItem.slug = coddyger.buildSlug('CLT', theLast ? theLast.slug : null);
        formattedItem.password = await coddyger.string.encryptPassword(formattedItem.password);

        const save: any = await this.service.create(formattedItem);
        if (save.error) {
          return reject(save);
        }

        // Suivi admin : un nouveau compte vient d'être créé sur les apps.
        await NotificationHelper.notifySuperAdmins({
          title: formattedItem.isPartner ? 'Nouveau professionnel inscrit' : 'Nouveau client inscrit',
          message: `${`${formattedItem.firstname || ''} ${formattedItem.lastname || ''}`.trim() || formattedItem.email} vient de créer un compte.`,
          category: NotificationCategory.INFO,
          metadata: { type: formattedItem.isPartner ? 'pros' : 'clients', clientId: String(formattedItem._id) }
        });

        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'register');
    });
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  update(id: string, item: Partial<IClient>) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Client'),
            data: null
          });
        }
        
        // Mise à jour
        const updatedItem = await this.service.update(id, item);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: updatedItem
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'update');
    });
  }

  /**
   * Modifier le mot de passe d'un client
   * @param id ID de l'élément
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  updatePassword(id: string, item: IUpdatePassword) {  
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null  
          });
        }

        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,  
            message: locale.notfound('Client'),
            data: null
          });
        }

        const newPassword:string = item.newPassword ?? '';
        const confirmPassword:string = item.confirmPassword ?? '';
        
        if (newPassword !== confirmPassword) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.client.passwordNotMatch,
            data: null
          });
        }

        item.password = await coddyger.string.encryptPassword(newPassword);

        // Mise à jour du mot de passe
        await this.service.updatePassword(id, item);

        // [SÉCURITÉ F-03] Ne renvoie plus le document : `getById()` remonte le client complet,
        // empreinte du mot de passe incluse, alors que l'appelant n'est pas authentifié comme
        // étant ce client.
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'updatePassword');
    });
  }

  /**
   * Réinitialiser le mot de passe d'un client
   * @param id ID de l'élément
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  resetPassword(id: string, item: IUpdatePassword) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({  
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,  
            message: locale.notfound('Client'),
            data: null
          });
        }

        const isValidPasscode = await this.serviceLogin.verifyPassword(item.password ?? '', existingItem.password ?? '');
        if (!isValidPasscode) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.loginFailed,
            data: null
          });
        }

        item.password = await coddyger.string.encryptPassword(item.newPassword ?? '');
        // Réinitialisation du mot de passe
        const updatedItem:any = await this.service.updatePassword(id, {
          password: item.password,
        });

        if(updatedItem.error) {
          return reject(updatedItem);
        }

        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'resetPassword');
    });
  }

  /**
   * Met à jour le numéro de téléphone d'un client
   * @param clientId ID du client
   * @param phoneNumber Numéro de téléphone
   * @returns Résultat de l'opération
   */
	updatePhoneNumber(clientId: string, phoneNumber: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (coddyger.string.isValidObjectId(clientId) === false) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.wrongObjectId('client'),
						data: null
					});
				}

				// Validate phone number format
				const phoneValidation = this.service.validateIvorianPhoneNumber(phoneNumber);
				if (!phoneValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.client.invalidPhoneFormat,
						data: null
					});
				}

				// Check if phone number is already used
				const existingClient = await this.service.checkContactExists(phoneNumber);
				if (existingClient.exists) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.client.phoneNumberAlreadyUsed,
						data: null
					});
				}

				// Update client
				const updatedClient = await this.service.update(clientId, { contact: phoneNumber, isPhoneConfirmed: true });

				if (!updatedClient) {
					return resolve({
						status: defines.status.notFound,
						message: locale.notfound('Client'),
						data: null
					});
				}

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.client.phoneNumberUpdated,
					data: updatedClient
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'updatePhoneNumber');
		});
	}

	/**
	 * Met à jour l'adresse email d'un client
	 * @param clientId ID du client
	 * @param email Adresse email
	 * @returns Résultat de l'opération
	 */
	updateEmail(clientId: string, email: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (coddyger.string.isValidObjectId(clientId) === false) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.wrongObjectId('client'),
						data: null
					});
				}

				// Validate email format
				const emailValidation = this.service.validateEmail(email);
				if (!emailValidation.isValid) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.client.invalidEmailFormat,
						data: null
					});
				}

				// Check if email is already used
				const existingClient = await this.service.getOne({ email, _id: { $ne: clientId } });

				if (existingClient) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.controller.client.emailAlreadyUsed,
						data: null
					});
				}

				// Update client
				const updatedClient = await this.service.update(clientId, { email: email, isEmailConfirmed: true });

				if (!updatedClient) {
					return resolve({
						status: defines.status.notFound,
						message: locale.notfound('Client'),
						data: null
					});
				}

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.client.emailUpdated,
					data: updatedClient
				});
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'updateEmail');
		});
	}

  /**
   * Supprime un élément
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  delete(id: string, reason: string, removedBy: any) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Client'),
            data: null
          });
        }
        
        // Suppression
        await this.service.delete(id, reason, removedBy);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'delete');
    });
  }

  /**
   * Envoie une notification à un client
   * @param clientId ID du client
   * @param message Message à envoyer
   * @param notificationType Type de notification (EMAIL, SMS, PUSH)
   * @returns Résultat de l'envoi
   */
  sendNotification(clientId: string, message: string, notificationType: string = NotificationType.EMAIL) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier l'ID du client
        if (!clientId || !coddyger.string.isValidObjectId(clientId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du client"),
            data: null
          });
        }
        
        // Récupérer les informations du client
        const client = await this.service.getById(clientId);
        if (!client) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Client'),
            data: null
          });
        }
        
        // Déterminer le destinataire en fonction du type de notification
        let recipient = '';
        if (notificationType === NotificationType.EMAIL) {
          recipient = client.email;
        } else if (notificationType === NotificationType.SMS) {
          recipient = client.contact;
        } else if (notificationType === NotificationType.PUSH) {
          // Pour les notifications push, on utiliserait un token FCM stocké dans le profil du client
          recipient = client.pushToken || '';
          if (!recipient) {
            return resolve({
              status: defines.status.badRequest,
              message: 'Ce client n\'a pas de token pour les notifications push',
              data: null
            });
          }
        }
        
        // Envoyer la notification
        const result = await notificationManager.sendNotification({
          category: NotificationCategory.INFO,
          type: notificationType,
          to: recipient,
          data: {
            title: `Notification de YoYo`,
            message
          }
        });
        
        if (!result.success) {
          return resolve({
            status: defines.status.serverError,
            message: result.message,
            data: result.error
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: 'Notification envoyée avec succès',
          data: result.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'sendNotification');
    });
  }

  /**
   * Vérifie si un compte client existe avec le login fourni (email ou numéro de téléphone)
   * @param login Email ou numéro de téléphone
   * @returns Statut de l'existence du compte
   */
  verifyLogin(login: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!login) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Le champ login est requis',
            data: null
          });
        }

        const result = await this.service.verifyLogin(login);

        if (result.exists) {
          // Le compte existe - retourner 200
          return resolve({
            status: defines.status.requestOK,
            message: result.message,
            data: { exists: true }
          });
        } else {
          // Le compte n'existe pas - retourner 400
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: { exists: false }
          });
        }
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'verifyLogin');
    });
  }
}