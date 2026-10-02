import coddyger, { IErrorObject, LoggerService, LogLevel, defines } from 'coddyger';
import { locale } from '../../public';
import { PartnerService } from './partner.service';
import { IPartner } from './partner.interface';
import { ICommercial, IOnboardPayload, PartnerOnboardingService } from './partner-onboarding.service';
// Imports « feuilles » (model/service) et non les barrels, pour éviter un cycle
// partner ↔ client ↔ enrolment lors de la création d'enrôlement depuis yoyo-pro.
import { ClientSet } from '../client/client.model';
import { AdminSet } from '../admin/admin.model';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { BoutiqueManagerService } from '../boutique-manager/boutique-manager.service';

const controllerLabel: string = 'PartnerController';

export class PartnerController {
  private readonly service: PartnerService;
  private readonly onboardingService: PartnerOnboardingService;
  private readonly enrolmentService: EnrolmentService;
  private readonly bmService: BoutiqueManagerService;

  constructor() {
    this.service = new PartnerService();
    this.onboardingService = new PartnerOnboardingService();
    this.enrolmentService = new EnrolmentService();
    this.bmService = new BoutiqueManagerService();
  }

  /**
   * Boutiques ACCESSIBLES par l'utilisateur connecté dans yoyo-pro :
   *   - celles qu'il POSSÈDE (propriétaire), plus
   *   - celles qu'il GÈRE (gérant, via un lien actif boutique-manager).
   * Fusionne sans doublon. Utilisé par `GET /partners/me`.
   */
  getAccessibleByUserId(userId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const owned: any = await this.service.getByUserId(userId, payloads);
        const rows: any[] = Array.isArray(owned?.rows) ? [...owned.rows] : [];

        const managedIds = await this.bmService.getManagedBoutiqueIds(userId);
        if (managedIds.length > 0) {
          const managed = await this.service.getByIds(managedIds);
          const seen = new Set(rows.map(r => String(r._id)));
          for (const m of managed) {
            if (!seen.has(String((m as any)._id))) rows.push(m);
          }
        }

        resolve({ status: defines.status.requestOK, message: owned?.data ?? null, data: rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getAccessibleByUserId'));
  }

  /**
   * Crée l'enrôlement correspondant à une boutique enregistrée depuis yoyo-pro, LORSQUE le compte
   * marchand a été rattaché à un agent (via son matricule à l'inscription : `client.createdBy`).
   *
   * C'est ce qui fait apparaître ces boutiques dans « Activité commerciale » avec l'agent qui a
   * aidé à l'enregistrement. Best-effort : ne doit jamais faire échouer la création de la boutique.
   * L'onboarding CMS a son propre enrôlement (via le service) et ne passe pas par ici.
   * @param partner Boutique tout juste créée (porte `_id` et `user`)
   */
  private async createEnrolmentIfAgentLinked(partner: any): Promise<void> {
    try {
      const ownerId = partner && (typeof partner.user === 'object' ? partner.user?._id : partner.user);
      if (!ownerId) return;

      const client: any = await new ClientSet().selectOne({ _id: ownerId });
      // Pas d'agent rattaché (inscription sans matricule) → rien à tracer.
      if (!client || client.error || !client.createdBy) return;

      // Éviter un doublon si un enrôlement existe déjà pour ce compte (ex. onboarding CMS).
      if (await this.enrolmentService.existsForClient(String(ownerId))) return;

      const agent: any = await new AdminSet().selectOne({ _id: client.createdBy });
      const commercialName = agent
        ? `${agent.firstname || ''} ${agent.lastname || ''}`.trim() || agent.email || 'Agent'
        : 'Agent';

      await this.enrolmentService.create({
        client: ownerId,
        partner: partner._id,
        commercial: client.createdBy,
        merchantName: `${client.firstname || ''} ${client.lastname || ''}`.trim() || client.email,
        merchantEmail: client.email,
        merchantPhone: client.contact,
        shopName: partner.name,
        ville: partner.ville,
        category: '',
        commercialName,
        // Le compte est déjà utilisable (auto-inscription) → considéré activé.
        enrolmentStatus: client.status === 'active' ? 'activated' : 'pending',
        status: 'active'
      } as any);
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: controllerLabel, method: 'createEnrolmentIfAgentLinked' });
    }
  }

  /**
   * Enrôle un marchand à distance : crée son compte, sa boutique, et lui envoie le lien d'activation
   * @param payload Données du marchand et de sa boutique
   * @param commercial Admin authentifié — source unique de l'attribution (`createdBy`)
   */
  onboard(payload: IOnboardPayload, commercial: ICommercial) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.onboardingService.onboard(payload, commercial);

        resolve({
          status: result.status,
          message: result.message,
          data: result.ok ? result.data : (result.data ?? null)
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'onboard');
    });
  }

  /**
   * Active un compte marchand : le porteur du lien définit son mot de passe
   * @param token Jeton d'activation à usage unique
   * @param password Mot de passe choisi
   */
  /**
   * Vérifie l'état d'un jeton d'activation (sans le consommer) : `{ valid, reason }`.
   */
  checkActivation(token: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.onboardingService.checkActivation(token);
        resolve({ status: defines.status.requestOK, message: 'Statut du jeton', data: result });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'checkActivation');
    });
  }

  activate(token: string, password: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.onboardingService.activate(token, password);

        resolve({
          status: result.status,
          message: result.message,
          data: result.ok ? result.data : null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'activate');
    });
  }

  /**
   * Réémet un lien d'activation pour un enrôlement encore en attente
   * @param enrolmentId Enrôlement concerné
   * @param commercial Admin appelant
   */
  resendActivation(enrolmentId: string, commercial: ICommercial) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.onboardingService.resendActivation(enrolmentId, commercial);

        resolve({
          status: result.status,
          message: result.message,
          data: result.ok ? result.data : null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'resendActivation');
    });
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; category?: string; createdBy?: string; sort?: string; from?: string; to?: string }) {
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
            message: locale.notfound('Partner'),
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
  create(item: IPartner) {
    return new Promise(async (resolve, reject) => {
      try {
        const newItem = await this.service.create(item);
        
        // Vérifier si le service a retourné une erreur de validation
        if ((newItem as IErrorObject).error) {
          return resolve({
            status: defines.status.badRequest,
            message: (newItem as IErrorObject).data,
            data: null
          });
        }

        // Trace commerciale : si le compte est rattaché à un agent (matricule saisi à
        // l'inscription yoyo-pro), on crée l'enrôlement correspondant. `item` porte `_id`
        // (renseigné par le service) et `user`.
        await this.createEnrolmentIfAgentLinked(item);

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
      return coddyger.catchReturn(e, controllerLabel, 'create');
    });
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  update(id: string, item: Partial<IPartner>) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier si l'ID est valide
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        const updatedItem = await this.service.update(id, item);
        
        // Vérifier si le service a retourné une erreur de validation
        if ((updatedItem as IErrorObject).error) {
          return resolve({
            status: defines.status.badRequest,
            message: (updatedItem as IErrorObject).data,
            data: null
          });
        }
        
        if (!updatedItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Partner'),
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.successUpdate,
          data: null
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
   * Supprime un élément
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  delete(id: string) {
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
            message: locale.notfound('Partner'),
            data: null
          });
        }
        
        // Suppression
        await this.service.delete(id);
        
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
   * Récupère les partenaires par ID utilisateur
   * @param userId ID de l'utilisateur
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires
   */
  getByUserId(userId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'utilisateur"),
            data: null
          });
        }

        const items = await this.service.getByUserId(userId, payloads);
        
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
      return coddyger.catchReturn(e, controllerLabel, 'getByUserId');
    });
  }

  /**
   * [ADMIN] Boutiques qu'un utilisateur (client) GÈRE en tant que GÉRANT ACTIF
   * (lien actif dans boutique-manager), à l'exclusion de celles qu'il POSSÈDE.
   *
   * Pendant « admin » de `GET /partners/me` : résout les ids gérés via
   * `BoutiqueManagerService.getManagedBoutiqueIds`, puis les objets Partner publics
   * via `PartnerService.getByIds` (qui exclut déjà removed/archived).
   * Trié par nom pour un ordre cohérent. Aucune boutique ⇒ `data: []`.
   */
  getManagedByUserId(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'utilisateur"),
            data: null
          });
        }

        const managedIds = await this.bmService.getManagedBoutiqueIds(userId);
        if (!managedIds || managedIds.length === 0) {
          return resolve({
            status: defines.status.requestOK,
            message: 'Aucune boutique gérée.',
            data: []
          });
        }

        const managed = await this.service.getByIds(managedIds);

        // On ne montre QUE les boutiques gérées : on exclut celles que l'user possède déjà.
        const rows = managed
          .filter((m: any) => String(m.user) !== String(userId))
          .sort((a: any, b: any) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')));

        resolve({
          status: defines.status.requestOK,
          message: 'Boutiques gérées récupérées avec succès.',
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getManagedByUserId');
    });
  }

  /**
   * Récupère les partenaires ouverts à la date actuelle
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires ouverts
   */
  getOpenPartners(payloads: { page?: number; pageSize?: number; ville?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getOpenPartners(payloads);
        
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
      return coddyger.catchReturn(e, controllerLabel, 'getOpenPartners');
    });
  }

  /**
   * Récupère les partenaires sponsorisés
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires sponsorisés
   */
  getSponsoredPartners(payloads: { page?: number; pageSize?: number; ville?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getSponsoredPartners(payloads);
        
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
      return coddyger.catchReturn(e, controllerLabel, 'getSponsoredPartners');
    });
  }

  /**
   * Répartition géographique des partenaires par ville (widget carte du dashboard)
   * @returns Liste [{ ville, pros, lat, lng }]
   */
  getGeoDistribution(filters?: { certified?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getGeoDistribution(filters);

        resolve({
          status: defines.status.requestOK,
          message: 'Répartition géographique récupérée avec succès',
          data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getGeoDistribution');
    });
  }

  /**
   * Statistiques des partenaires (total + nouveaux sur période avec tendance)
   * @returns { total, newInPeriod, trend }
   */
  getStats(filters?: { from?: string; to?: string; certified?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getStats(filters);

        resolve({
          status: defines.status.requestOK,
          message: 'Statistiques des partenaires récupérées avec succès',
          data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getStats');
    });
  }
}