import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PartnerService } from './partner.service';
import { IPartner } from './partner.interface';

const controllerLabel: string = 'PartnerController';

export class PartnerController {
  private readonly service: PartnerService;

  constructor() {
    this.service = new PartnerService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; category?: string }) {
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