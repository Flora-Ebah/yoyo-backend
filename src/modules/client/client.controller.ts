import coddyger, { IErrorObject, defines, env } from 'coddyger';
import { locale } from '../../public';
import { IClient, IRegister, ClientService, IUpdatePassword } from './';
import { LoginService } from '../login/login.service';
import { InfluencerService } from '../influencer/influencer.service';
import { notificationManager, NotificationCategory, NotificationType } from '../../services/notification';
import { NotificationHelper } from '../../helpers/notification.helper';

const controllerLabel: string = 'ClientController';

export class ClientController {
  private readonly service: ClientService;
  private readonly serviceLogin: LoginService;
  private readonly serviceInfluencer: InfluencerService;

  constructor() {
    this.service = new ClientService();
    this.serviceLogin = new LoginService();
    this.serviceInfluencer = new InfluencerService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; isPartner?: boolean; from?: string; to?: string }) {
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
  // Parrainage (#6/#7) : infos du client connecté (code, nb de filleuls validés, mois offerts).
  getReferral(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getReferralInfo(userId);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getReferral'));
  }

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

        // Rattachement à un agent via son matricule (facultatif, saisi depuis yoyo-pro).
        // S'il est fourni, il DOIT correspondre à un agent actif — sinon on refuse l'inscription
        // avec un message clair (évite un lien silencieusement perdu). S'il est vide, on continue.
        const rawMatricule = (item as any).agentMatricule;
        if (rawMatricule && String(rawMatricule).trim()) {
          const agent = await this.service.resolveAgentByMatricule(String(rawMatricule).trim());
          if (!agent) {
            return resolve({
              status: defines.status.badRequest,
              message: "Le matricule de l'agent est introuvable. Vérifiez-le ou laissez le champ vide.",
              data: null
            });
          }
          formattedItem.createdBy = agent._id;
        }

        // ===================== Code promo unifié (influenceur OU parrainage) =====================
        // L'app n'envoie plus qu'UN SEUL champ `promoCode`, que le serveur résout automatiquement.
        // Rétro-compat : si `promoCode` est absent, on retombe sur les anciens champs séparés
        // (`influencerCode` / `referralCode`) envoyés par les versions plus anciennes de l'app.
        // `promo` est renvoyé dans la réponse pour que l'app affiche le type reconnu.
        let promo: { type: 'influencer' | 'referral' | 'invalid' | 'none'; code: string | null } = {
          type: 'none',
          code: null
        };

        const rawPromo = (item as any).promoCode;
        if (rawPromo && String(rawPromo).trim()) {
          const promoCode = String(rawPromo).trim();
          promo.code = promoCode.toUpperCase();

          // PRIORITÉ (choix documenté) : on tente D'ABORD le code influenceur, PUIS le code
          // parrainage. Ce choix tranche une éventuelle collision (un même code reconnu par les
          // deux systèmes) en faveur de l'influenceur.
          // a. Influenceur : code actif ?
          const influencer: any = await this.serviceInfluencer.validateCode(promoCode);
          if (influencer) {
            // Même comportement que l'ancien `influencerCode` : mémorisé tel quel (uppercase).
            formattedItem.influencerCode = promoCode.toUpperCase();
            promo.type = 'influencer';
          } else {
            // b. Parrainage : un client possède-t-il ce code de parrainage ?
            const referrer: any = await this.service.resolveReferrer(promoCode);
            if (referrer) {
              // Même logique que l'ancien `referralCode` : on mémorise le lien `referredBy`.
              // Le crédit (mois offert) intervient plus tard, à la souscription payante.
              formattedItem.referredBy = referrer._id;
              promo.type = 'referral';
            } else {
              // c. Code inconnu : on NE bloque PAS l'inscription (code promo facultatif), on l'ignore.
              promo.type = 'invalid';
            }
          }
        } else {
          // Rétro-compat : anciens champs séparés, traités exactement comme avant.
          // Parrainage (#6/#7) : code du parrain saisi à l'inscription (facultatif). On résout le
          // parrain et on mémorise le lien (`referredBy`) ; le crédit (mois offert) intervient
          // plus tard, quand le filleul devient abonné payant.
          const sponsorCode = (item as any).referralCode;
          if (sponsorCode && String(sponsorCode).trim()) {
            const referrer: any = await this.service.resolveReferrer(String(sponsorCode));
            if (referrer) {
              formattedItem.referredBy = referrer._id;
              promo = { type: 'referral', code: String(sponsorCode).trim().toUpperCase() };
            }
          }

          // Attribution influenceur (#17) : code saisi à l'inscription (facultatif), mémorisé tel quel.
          const infCode = (item as any).influencerCode;
          if (infCode && String(infCode).trim()) {
            formattedItem.influencerCode = String(infCode).trim().toUpperCase();
            promo = { type: 'influencer', code: String(infCode).trim().toUpperCase() };
          }
        }

        // Le code saisi (celui du parrain) ne doit jamais devenir le code propre du nouveau
        // client : on le retire pour que `create()` en génère un neuf et unique.
        delete formattedItem.referralCode;
        // `promoCode` est un champ d'entrée transitoire : il ne doit pas être persisté sur le client.
        delete formattedItem.promoCode;

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

        // On expose le type de code promo reconnu pour que l'app affiche le bon message
        // (« code influenceur appliqué » / « code parrainage appliqué » / « code invalide »).
        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: { promo }
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

        // Vérification de l'existence de l'élément. On utilise `getOne` (et non `getById`) car ce
        // dernier exclut les comptes `removed` : or le parcours « code oublié » doit fonctionner sur
        // un compte supprimé (l'OTP a prouvé la propriété) pour permettre sa réactivation.
        const existingItem: any = await this.service.getOne({ _id: id });

        if (!existingItem || existingItem.error) {
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

        // Réactivation (DCP/RGPD) : un compte supprimé qui réinitialise son code via OTP prouve la
        // propriété ⇒ on le restaure et on relance le délai de grâce.
        if (existingItem.status === 'removed') {
          await this.service.reactivate(id);
        }

        // Activation par OTP : un compte marchand en attente (`pending`, créé par un commercial/admin)
        // qui définit son code via OTP devient actif. L'OTP a prouvé la possession de l'e-mail/numéro.
        if (existingItem.status === 'pending') {
          await this.service.update(id, { status: 'active', mustChangePassword: false } as any);
        }

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
   * Statistiques globales des utilisateurs (cartes de stats admin) : total, actifs, suspendus,
   * KYC vérifiés, partenaires, etc. Indépendant de la pagination/filtres de liste.
   */
  getStats() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getStats();
        resolve({ status: defines.status.requestOK, message: 'Statistiques des utilisateurs', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getStats');
    });
  }

  /**
   * Anonymise immédiatement un client (administration, DCP/RGPD). Bypasse le délai de grâce.
   * N'utilise pas `getById` (qui exclut les comptes déjà `removed`) : un compte supprimé doit
   * pouvoir être anonymisé sur-le-champ.
   * @param id ID du client à anonymiser
   */
  anonymize(id: string, performedBy?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({ status: defines.status.badRequest, message: locale.wrongObjectId("de l'élément"), data: null });
        }

        const existing: any = await this.service.getOne({ _id: id });
        if (!existing || existing.error) {
          return resolve({ status: defines.status.notFound, message: locale.notfound('Client'), data: null });
        }

        if (existing.status === 'anonymized') {
          return resolve({ status: defines.status.requestOK, message: 'Ce compte est déjà anonymisé.', data: null });
        }

        const result = await this.service.anonymize(id, { trigger: 'admin', performedBy });
        if (result.error) {
          return resolve({ status: defines.status.serverError, message: "Échec de l'anonymisation.", data: null });
        }

        resolve({ status: defines.status.requestOK, message: locale.controller.done, data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'anonymize');
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
            // `removed` → proposer « Réactiver mon compte » ; `pendingActivation` → déclencher le
            // parcours d'activation par OTP (compte créé par un commercial/admin, code pas encore défini).
            data: {
              exists: true,
              removed: result.status === 'removed',
              pendingActivation: result.status === 'pending'
            }
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