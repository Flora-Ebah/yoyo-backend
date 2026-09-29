import { MessageHelper } from '../../helpers';
import { PartnerService } from '../partner';
import { SettingsService } from '../settings';
import { AnonymizationLogService } from '../anonymization-log';
import { EnrolmentService } from '../enrolment';
import { AdminSet } from '../admin/admin.model';
import { IClient, IUpdatePassword } from './client.interface';
import { ClientSet } from './client.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class ClientService {
	private readonly dao: IData<IClient>;
	private readonly serviceLabel = 'ClientService';
	private readonly partnerService: PartnerService;
	private readonly settingsService: SettingsService;
	private readonly anonymizationLogService: AnonymizationLogService;
	private readonly enrolmentService: EnrolmentService;

	constructor() {
		this.dao = new ClientSet();
		this.partnerService = new PartnerService();
		this.settingsService = new SettingsService();
		this.anonymizationLogService = new AnonymizationLogService();
		this.enrolmentService = new EnrolmentService();
	}

	/**
	 * Retrouve un agent (Admin) actif par son matricule. Sert à rattacher une inscription yoyo-pro
	 * à l'agent dont le matricule a été saisi. Renvoie `null` si aucun agent actif ne correspond.
	 * @param matricule Matricule saisi à l'inscription
	 */
	async resolveAgentByMatricule(matricule: string): Promise<{ _id: string } | null> {
		try {
			const value = (matricule || '').trim();
			if (!value) return null;

			const dao: any = new AdminSet();
			const admin: any = await dao.selectOne({ matricule: value, status: 'active' });

			return admin && !admin.error ? admin : null;
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'resolveAgentByMatricule' });
			return null;
		}
	}

	/**
	 * Récupère tous les éléments
	 * @returns Liste des éléments
	 */
	async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; isPartner?: boolean }): Promise<any> {
		try {
			let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';

			// Filtre Type (boutiques vs utilisateurs de l'app), injecté dans tous les cas de requête.
			// On EXCLUT toujours les comptes GÉRANT (isManager) : ce ne sont ni des clients de l'app
			// ni des partenaires — ils appartiennent à une boutique et ne doivent pas polluer la liste.
			const typeFilter: any = {
				isManager: { $ne: true },
				...(typeof payloads.isPartner === 'boolean' ? { isPartner: payloads.isPartner } : {})
			};

			let data: any | IErrorObject = {};

			if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { ...typeFilter }, page, pageSize });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { ...typeFilter, status }, page, pageSize });
			} else {
				data = await this.dao.select({
					params: {
						...typeFilter,
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
			return await this.dao.selectOne({ _id: id, status: { $nin: ['removed', 'archived', 'anonymized'] } });
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

			// Parrainage (#6/#7) : chaque client reçoit un code de parrainage unique à la création.
			if (!item.referralCode) {
				item.referralCode = await this.generateUniqueReferralCode();
			}
			item.referredCount ??= 0;
			item.freeMonthsGranted ??= 0;

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

	// ===================== Parrainage (#6/#7) =====================

	/** Génère un code de parrainage unique (6 caractères alphanumériques majuscules). */
	async generateUniqueReferralCode(): Promise<string> {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I,O,0,1 (lisibilité)
		for (let attempt = 0; attempt < 10; attempt++) {
			let code = '';
			for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
			const existing: any = await this.dao.selectOne({ referralCode: code });
			if (!existing) return code;
		}
		// Repli extrêmement improbable : suffixe temporel pour garantir l'unicité.
		return 'R' + Date.now().toString(36).toUpperCase().slice(-6);
	}

	/** Résout un code de parrainage en client parrain (ou null). Ignore un code vide/inconnu. */
	async resolveReferrer(code?: string): Promise<any | null> {
		if (!code || !code.trim()) return null;
		const referrer: any = await this.dao.selectOne({
			referralCode: code.trim().toUpperCase(),
			status: { $nin: ['removed', 'archived', 'anonymized'] }
		});
		return referrer && !referrer.error ? referrer : null;
	}

	/** Infos de parrainage d'un client (pour l'écran « Parrainage »). */
	async getReferralInfo(clientId: string): Promise<any> {
		const client: any = await this.dao.selectOne({ _id: clientId });
		if (!client || client.error) return { error: true };
		return {
			referralCode: client.referralCode ?? null,
			referredCount: client.referredCount ?? 0,
			freeMonthsGranted: client.freeMonthsGranted ?? 0
		};
	}

	/**
	 * Crédite le parrain quand un filleul devient abonné PAYANT (#7).
	 * À APPELER depuis le flux d'activation d'abonnement payant (voir subscription/transaction).
	 * Règle : chaque filleul validé incrémente `referredCount` du parrain ; l'offre « 3000 premiers »
	 * accorde 1 mois offert tous les 3 filleuls validés (plafonnée côté logique métier).
	 * ⚠️ À TESTER contre la base avant mise en prod (crédit non exécuté ici, méthode utilitaire).
	 */
	async creditReferrerForPaidReferral(referredClientId: string): Promise<void> {
		try {
			const referred: any = await this.dao.selectOne({ _id: referredClientId });
			// Garde-fou d'IDEMPOTENCE : pas de parrain, ou filleul déjà comptabilisé → on ne fait rien.
			// Indispensable car ce point peut être atteint à chaque abonnement (y compris renouvellements).
			if (!referred || referred.error || !referred.referredBy || referred.referralCredited) return;

			const referrer: any = await this.dao.selectOne({ _id: referred.referredBy });
			if (!referrer || referrer.error) return;

			const newCount = (referrer.referredCount ?? 0) + 1;
			const update: any = { referredCount: newCount };

			// 1 mois offert tous les 3 filleuls validés.
			if (newCount % 3 === 0) {
				update.freeMonthsGranted = (referrer.freeMonthsGranted ?? 0) + 1;
			}

			await this.dao.update({ _id: referrer._id }, update);
			// On marque le filleul comme comptabilisé pour ne jamais le recompter (renouvellements).
			await this.dao.update({ _id: referred._id }, { referralCredited: true });
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'creditReferrerForPaidReferral' });
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
			if (partners?.error) {
				throw new Error(partners);
			}

			// Retirer aussi les enrôlements liés, sinon la boutique supprimée reste visible dans
			// la vue du commercial (alimentée par la collection `enrolment`).
			await this.enrolmentService.removeByClientId(id);

			// Notifications best-effort : elles ne doivent jamais faire échouer la suppression
			// (le compte et la boutique sont déjà supprimés à ce stade).
			try {
				await MessageHelper.deleteAccountNotify(user);
				await MessageHelper.deleteAccountClientNotify(user);
			} catch (notifyError) {
				LoggerService.log({
					type: LogLevel.Error,
					content: notifyError,
					location: this.serviceLabel,
					method: 'delete:notify'
				});
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
	 * Statistiques GLOBALES des utilisateurs (indépendantes de la pagination et des filtres de liste).
	 * Exclut les comptes retirés/archivés/anonymisés, comme les listes. Sert aux cartes de stats.
	 */
	async getStats(): Promise<any> {
		try {
			const model: any = (this.dao as any).defaultModel;
			// Exclut aussi les comptes GÉRANT des statistiques (ce ne sont pas des utilisateurs de l'app).
			const base: any = { status: { $nin: ['removed', 'archived', 'anonymized'] }, isManager: { $ne: true } };

			const [total, active, inactive, suspended, pending, kycVerified, partners] = await Promise.all([
				model.countDocuments(base),
				model.countDocuments({ ...base, status: 'active' }),
				model.countDocuments({ ...base, status: 'inactive' }),
				model.countDocuments({ ...base, status: 'suspended' }),
				model.countDocuments({ ...base, status: 'pending' }),
				model.countDocuments({ ...base, isDocumentVerified: true }),
				model.countDocuments({ ...base, isPartner: true })
			]);

			// `clients` = utilisateurs de l'app cliente (non partenaires) ; `partners` = comptes marchands.
			return { total, active, inactive, suspended, pending, kycVerified, partners, clients: total - partners };
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'getStats' });
			return { total: 0, active: 0, inactive: 0, suspended: 0, pending: 0, kycVerified: 0, partners: 0, clients: 0 };
		}
	}

	/**
	 * Anonymise définitivement un compte (DCP/RGPD) : retire toutes les données nominatives du
	 * client et de ses boutiques, rend la connexion impossible, mais conserve la ligne (`_id`,
	 * historique) pour ne pas fausser les statistiques. Opération idempotente.
	 * @param id ID du client à anonymiser
	 * @param context Origine de l'anonymisation (journal d'audit) : cron automatique ou admin.
	 */
	async anonymize(id: string, context?: { trigger: 'cron' | 'admin'; performedBy?: any }): Promise<{ error: boolean; data?: any }> {
		try {
			const scrub: any = {
				email: `deleted+${id}@yoyo.invalid`,
				contact: null,
				firstname: 'Utilisateur',
				lastname: 'supprimé',
				// Mot de passe rendu inutilisable (aucun hash valide ⇒ connexion impossible).
				password: `${coddyger.string.generateObjectId()}${coddyger.string.generateObjectId()}`,
				address: null,
				birthdate: null,
				country: null,
				gender: null,
				avatar: null,
				documents: [],
				secretResponse: null,
				secretQuestion: null,
				status: 'anonymized',
				anonymizedAt: new Date()
			};

			const result: any = await this.dao.update({ _id: id }, scrub);
			if (result?.error) {
				throw result;
			}

			// Boutiques/partenaires liés : retrait des données nominatives du marchand.
			await this.partnerService.anonymizePartnersByUserId(id);

			// Enrôlements liés : retirés pour qu'ils disparaissent de la vue du commercial.
			await this.enrolmentService.removeByClientId(id);

			// Journal d'audit (best-effort) : trace non nominative de l'acte d'anonymisation.
			await this.anonymizationLogService.record({
				clientId: id,
				trigger: context?.trigger ?? 'cron',
				performedBy: context?.performedBy
			});

			return { error: false };
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'anonymize' });
			return { error: true, data: error };
		}
	}

	/**
	 * Réactive un compte supprimé (`removed`) tant que le délai de grâce n'est pas écoulé : le
	 * statut repasse à `active`, les marqueurs de suppression sont effacés et le délai est relancé
	 * (modèle « soft delete » type Facebook). Sans effet sur un compte déjà `anonymized`.
	 * @param id ID du client à réactiver
	 */
	async reactivate(id: string): Promise<{ error: boolean }> {
		try {
			const result: any = await this.dao.update(
				{ _id: id },
				{ status: 'active', removedAt: null, removedReason: null, reactivatedAt: new Date() }
			);
			if (result?.error) {
				throw result;
			}

			// Restaure les boutiques retirées lors de la suppression : le marchand retrouve sa boutique.
			await this.partnerService.restorePartnersByUserId(id);

			// Restaure symétriquement les enrôlements retirés.
			await this.enrolmentService.restoreByClientId(id);

			return { error: false };
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'reactivate' });
			return { error: true };
		}
	}

	/**
	 * Anonymise les comptes supprimés dont le délai de grâce est écoulé. Appelé quotidiennement par
	 * le cron. Le délai (jours) est lu depuis les paramètres de la plateforme (module Settings).
	 * @returns Nombre de comptes anonymisés
	 */
	async cleanupRemovedClients(): Promise<{ anonymized: number }> {
		try {
			const graceDays = await this.settingsService.getAccountDeletionGraceDays();
			const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

			// On capte les comptes supprimés dont le délai est écoulé. Repli sur `updatedAt` pour les
			// anciens comptes `removed` sans `removedAt` (backfill) : sinon ils ne seraient jamais purgés.
			const candidates: any = await this.dao.selectHug({
				status: 'removed',
				$or: [{ removedAt: { $lte: cutoff } }, { removedAt: null, updatedAt: { $lte: cutoff } }]
			});
			const rows: any[] = Array.isArray(candidates) ? candidates : [];

			let count = 0;
			for (const row of rows) {
				const res = await this.anonymize(String(row._id), { trigger: 'cron' });
				if (!res.error) {
					count++;
				}
			}

			LoggerService.log({
				type: LogLevel.Info,
				content: `Anonymisation : ${count}/${rows.length} compte(s) supprimé(s) depuis plus de ${graceDays} jours.`,
				location: this.serviceLabel,
				method: 'cleanupRemovedClients'
			});

			return { anonymized: count };
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'cleanupRemovedClients' });
			return { anonymized: 0 };
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
			// Les comptes anonymisés ont des identifiants brouillés (email/contact retirés) : ils ne
			// « réservent » plus rien, l'adresse/numéro d'origine redeviennent disponibles.
			if (email) {
				const isEmail: any = await this.dao.selectOne({ email, status: { $ne: 'anonymized' } });
				if (isEmail) {
					const message = isEmail.status === 'removed'
						? 'Un compte supprimé utilise cette adresse. Connectez-vous pour le réactiver.'
						: 'Cette adresse email est déjà utilisée';
					return { exists: true, message, data: isEmail.status };
				}
			}

			if (contact) {
				const isContact: any = await this.dao.selectOne({ contact, status: { $ne: 'anonymized' } });
				if (isContact) {
					const message = isContact.status === 'removed'
						? 'Un compte supprimé utilise ce numéro. Connectez-vous pour le réactiver.'
						: 'Ce numéro de téléphone est déjà utilisé';
					return { exists: true, message, data: isContact.status };
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

			// Vérifier si le numéro existe déjà (hors comptes anonymisés dont le numéro a été retiré).
			const existingClient: any = await this.dao.selectOne({ contact: formattedContact, status: { $ne: 'anonymized' } });

			const message = !existingClient
				? 'Ce numéro de téléphone est disponible'
				: existingClient.status === 'removed'
					? 'Un compte supprimé utilise ce numéro. Connectez-vous pour le réactiver.'
					: 'Ce numéro de téléphone est déjà utilisé';

			return {
				exists: !!existingClient,
				message
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
	async verifyLogin(login: string): Promise<{ exists: boolean; message: string; status?: string }> {
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

			// Exclure les comptes anonymisés (identifiants brouillés) : leur email/numéro d'origine
			// est de nouveau disponible pour une nouvelle inscription.
			searchQuery.status = { $ne: 'anonymized' };

			// Rechercher le client
			const client = await this.getOne(searchQuery);

			if (client) {
				// On expose le statut pour que l'app puisse proposer « Réactiver mon compte » lorsqu'il
				// s'agit d'un compte supprimé (réactivable en se connectant).
				return {
					exists: true,
					message: 'Un compte existe avec ce login',
					status: client.status
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
