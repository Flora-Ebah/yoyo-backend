import { MessageHelper } from '../../helpers';
import { PartnerService } from '../partner';
import { IClient, IUpdatePassword } from './client.interface';
import { ClientSet } from './client.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class ClientService {
	private readonly dao: IData<IClient>;
	private readonly serviceLabel = 'ClientService';
	private readonly partnerService: PartnerService;

	constructor() {
		this.dao = new ClientSet();
		this.partnerService = new PartnerService();
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
						$or: [
							{ slug: { $regex: query || '', $options: 'i' } }, 
							{ firstname: { $regex: query || '', $options: 'i' } },
							{ lastname: { $regex: query || '', $options: 'i' } },
							{ email: { $regex: query || '', $options: 'i' } },
							{ contact: { $regex: query || '', $options: 'i' } }
						]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

			const rows: IClient[] = data.rows;
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
	async getHug(params?: any): Promise<IClient[]> {
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
	async create(item: IClient): Promise<any> {
		try {
			// Génération d'un ID si non fourni
			item._id ??= coddyger.string.generateObjectId();

			// Ajout du statut par défaut si non fourni
			item.status ??= 'active';

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
	async update(id: string, item: Partial<IClient>): Promise<IClient | null> {
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
	async delete(id: string, reason: string, removedBy: any): Promise<void> {
		try {
			// Récupérer le client avant de le marquer comme supprimé : getById()
			// exclut le statut 'removed', donc l'appeler après la mise à jour
			// renverrait null et ferait planter les notifications ci-dessous.
			const user = await this.getById(id);

			const result: any = await this.dao.update({ _id: id }, { status: 'removed', removedReason: reason, removedAt: new Date(), removedBy });
			if (result.error) {
				throw new Error(result);
			}

			const partners = await this.partnerService.removePartnersByUserId(id);
			if(partners.error) {
				throw new Error(partners);
			}

			await MessageHelper.deleteAccountNotify(user);
			await MessageHelper.deleteAccountClientNotify(user);
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
	 * Récupère le dernier élément
	 * @returns Dernier élément
	 */
	async selectLatest(): Promise<IClient | null> {
		try {
			const result: any = await this.dao.selectLatest();
			return result;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Récupère le dernier élément avec des paramètres
	 * @param params Paramètres de la requête
	 * @returns Dernier élément
	 */
	async selectLatestWithParams(params: any): Promise<IClient | null> {
		try {
			const result: any = await this.dao.selectLatestWithParams(params);
			return result;
		} catch (error) {
			return null;
		}
	}

  /**
   * Récupère un élément par ses paramètres
   * @param params Paramètres de la requête
   * @returns Élément trouvé ou null
   */
  async getOne(params: any, fields: string = ""): Promise<any> {
    try {
      return await this.dao.selectOne(params, fields);
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getOne' 
      });
      throw error;
    }
  }

	validateIvorianPhoneNumber(phoneNumber: string): { isValid: boolean; message?: string } {
		try {
			// Supprimer tous les espaces et caractères spéciaux
			const cleanNumber = phoneNumber.replace(/[\s-]/g, '');

			// Vérifier si le numéro contient exactement 10 chiffres
			if (!/^\d{10}$/.test(cleanNumber)) {
				return {
					isValid: false,
					message: 'Le numéro doit contenir exactement 10 chiffres'
				};
			}

			// Vérifier si le numéro commence par les préfixes valides (01, 02, 03, 05, 07)
			const validPrefixes = ['01', '02', '03', '05', '07'];
			const prefix = cleanNumber.substring(0, 2);

			if (!validPrefixes.includes(prefix)) {
				return {
					isValid: false,
					message: 'Le numéro doit commencer par 01, 02, 03, 05 ou 07'
				};
			}

			return {
				isValid: true,
				message: 'Numéro de téléphone valide'
			};
		} catch (error) {
			return {
				isValid: false,
				message: 'Erreur lors de la validation du numéro'
			};
		}
	}

	formatIvorianPhoneNumber(phoneNumber: string): string {
		try {
			const cleanNumber = phoneNumber.replace(/[\s-]/g, '');
			if (this.validateIvorianPhoneNumber(cleanNumber).isValid) {
				// Format: XX XX XX XX XX
				return cleanNumber.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1$2$3$4$5');
			}
			return phoneNumber;
		} catch (error) {
			return phoneNumber;
		}
	}

	validateEmail(email: string): { isValid: boolean; message?: string } {
		try {
			// Expression régulière pour la validation d'email
			const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

			// Vérifier si l'email est vide
			if (!email || email.trim() === '') {
				return {
					isValid: false,
					message: "L'adresse email est requise"
				};
			}

			// Vérifier la longueur de l'email
			if (email.length > 254) {
				return {
					isValid: false,
					message: "L'adresse email est trop longue"
				};
			}

			// Vérifier le format de l'email
			if (!emailRegex.test(email)) {
				return {
					isValid: false,
					message: "Format d'adresse email invalide"
				};
			}

			return {
				isValid: true,
				message: 'Adresse email valide'
			};
		} catch (error) {
			return {
				isValid: false,
				message: "Erreur lors de la validation de l'email"
			};
		}
	}

	formatEmail(email: string): string {
		return email.trim().toLowerCase();
	}

	validatePasscode(passcode: any): { isValid: boolean; message?: string } {
		try {
			// Vérifier si le passcode est défini
			if (!passcode) {
				return {
					isValid: false,
					message: 'Le code secret est requis'
				};
			}

			// Convertir en string pour la validation
			const passcodeStr = passcode.toString();

			// Vérifier si c'est un nombre
			// if (!/^\d+$/.test(passcodeStr)) {
			// 	return {
			// 		isValid: false,
			// 		message: 'Le code secret doit contenir uniquement des chiffres'
			// 	};
			// }

			// Vérifier la longueur (par exemple, entre 4 et 6 chiffres)
			// if (passcodeStr.length < 4 || passcodeStr.length > 6) {
			// 	return {
			// 		isValid: false,
			// 		message: 'Le code secret doit contenir entre 4 et 6 chiffres'
			// 	};
			// }

			return {
				isValid: true,
				message: 'Code secret valide'
			};
		} catch (error) {
			return {
				isValid: false,
				message: 'Erreur lors de la validation du code secret'
			};
		}
	}

	formatPasscode(passcode: any): string {
		return passcode.toString();
	}

	formatName(name: string): string {
		try {
			if (!name) return name;

			// Diviser le nom en mots, formater chaque mot et les rejoindre
			return name
				.toLowerCase()
				.split(' ')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');
		} catch (error) {
			return name;
		}
	}

	validateRegistrationData(item: IClient): { isValid: boolean; message?: string } {
		try {
			const { email, contact, firstname, lastname, password, birthdate, country } = item;

			// Valider le passcode
			const passcodeValidation = this.validatePasscode(password);
			if (!passcodeValidation.isValid) {
				return passcodeValidation;
			}

			return { isValid: true };
		} catch (error) {
			return {
				isValid: false,
				message: 'Erreur lors de la validation des données'
			};
		}
	}

	formatRegistrationData(item: IClient): IClient {
		const formattedData = { ...item };

		if (formattedData.email) {
			formattedData.email = this.formatEmail(formattedData.email);
		}
		if (formattedData.contact) {
			formattedData.contact = this.formatIvorianPhoneNumber(formattedData.contact);
		}
		if (formattedData.firstname) {
			formattedData.firstname = this.formatName(formattedData.firstname);
		}
		if (formattedData.lastname) {
			formattedData.lastname = this.formatName(formattedData.lastname);
		}
		if (formattedData.password) {
			formattedData.password = this.formatPasscode(formattedData.password);
		}

		return formattedData;
	}

	async checkExistingCredentials(email?: string, contact?: string): Promise<{ exists: boolean; message?: string, data?: any }> {
		try {
			if (email) {
				const isEmail: any = await this.dao.selectOne({ email });
				if (isEmail) {
					return { exists: true, message: 'Cette adresse email est déjà utilisée', data: isEmail.status };
				}
			}

			if (contact) {
				const isContact: any = await this.dao.selectOne({ contact });
				if (isContact) {
					return { exists: true, message: 'Ce numéro de téléphone est déjà utilisé', data: isContact.status };
				}
			}

			return { exists: false };
		} catch (error) {
			return { exists: true, message: 'Erreur lors de la vérification des identifiants' };
		}
	}

	async verifyClientExists(_id: string): Promise<{ exists: boolean; message?: string }> {
		try {
			const isData: any = await this.dao.exist({ _id });

			if (isData.error) {
				return {
					exists: false,
					message: 'Erreur lors de la vérification du client'
				};
			}

			if (!isData) {
				return {
					exists: false,
					message: 'Client non trouvé'
				};
			}

			return { exists: true };
		} catch (error) {
			return {
				exists: false,
				message: 'Erreur lors de la vérification du client'
			};
		}
	}

	async checkContactExists(contact: string): Promise<{ exists: boolean; message: string }> {
		try {
			// Valider le format du numéro
			const validation = this.validateIvorianPhoneNumber(contact);
			if (!validation.isValid) {
				return {
					exists: false,
					message: validation.message || 'Numéro de téléphone invalide'
				};
			}

			// Formater le numéro pour la recherche
			const formattedContact = this.formatIvorianPhoneNumber(contact);

			// Vérifier si le numéro existe déjà
			const existingClient = await this.dao.selectOne({ contact: formattedContact });

			return {
				exists: !!existingClient,
				message: existingClient ? 'Ce numéro de téléphone est déjà utilisé' : 'Ce numéro de téléphone est disponible'
			};
		} catch (error) {
			throw error;
		}
	}

	buildAccountVerificationRate(isDocumentVerified: boolean, isContactVerified: boolean) {
		let rate = 0;
		if (isDocumentVerified) {
			rate += 50;
		}
		if (isContactVerified) {
			rate += 50;
		}
		return rate;
	}

	async updatePassword(id: string, item: any) {
		try {
			const result: any = await this.dao.update({ _id: id }, item);
			if (result.error) {
				throw new Error(result);
			}
			return this.getById(id);
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Vérifie si un compte client existe avec le login fourni (email ou numéro de téléphone)
	 * @param login Email ou numéro de téléphone
	 * @returns Information sur l'existence du compte
	 */
	async verifyLogin(login: string): Promise<{ exists: boolean; message: string }> {
		try {
			// Valider et déterminer le type de login
			const emailValidation = this.validateEmail(login);
			const phoneValidation = this.validateIvorianPhoneNumber(login);

			if (!emailValidation.isValid && !phoneValidation.isValid) {
				return {
					exists: false,
					message: 'Format invalide. Veuillez fournir un email ou un numéro de téléphone valide'
				};
			}

			// Construire la requête de recherche
			let searchQuery: any = {};
			
			if (emailValidation.isValid) {
				// Recherche par email
				searchQuery.email = login;
			} else if (phoneValidation.isValid) {
				// Formater et rechercher par numéro de téléphone
				const formattedPhone = this.formatIvorianPhoneNumber(login);
				searchQuery.contact = formattedPhone;
			}

			// Rechercher le client
			const client = await this.getOne(searchQuery);

			if (client) {
				return {
					exists: true,
					message: 'Un compte existe avec ce login'
				};
			} else {
				return {
					exists: false,
					message: 'Aucun compte trouvé avec ce login'
				};
			}
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'verifyLogin'
			});
			return {
				exists: false,
				message: 'Erreur lors de la vérification du login'
			};
		}
	}
}
