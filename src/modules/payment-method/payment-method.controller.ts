import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PaymentMethodService } from './payment-method.service';
import { IPaymentMethod } from './payment-method.interface';

const controllerLabel: string = 'PaymentMethodController';

export class PaymentMethodController {
  private readonly service: PaymentMethodService;

  constructor() {
    this.service = new PaymentMethodService();
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
            message: locale.notfound('PaymentMethod'),
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
  create(item: IPaymentMethod) {
    return new Promise(async (resolve, reject) => {
      try {
        const newItem = await this.service.create(item);
        
        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: newItem
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
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  update(id: string, item: Partial<IPaymentMethod>) {
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
            message: locale.notfound('PaymentMethod'),
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
            message: locale.notfound('PaymentMethod'),
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
   * Récupère les méthodes de paiement par type
   * @param type Type de méthode de paiement
   * @returns Liste des méthodes de paiement
   */
  getByType(type: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getByType(type);
        
        if (items.error) {
          throw items;
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getByType');
    });
  }

  /**
   * Récupère les méthodes de paiement par provider
   * @param provider Provider de paiement
   * @returns Liste des méthodes de paiement
   */
  getByProvider(provider: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getByProvider(provider);
        
        if (items.error) {
          throw items;
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getByProvider');
    });
  }

  /**
   * Récupère toutes les méthodes de paiement actives
   * @returns Liste des méthodes de paiement actives
   */
  getActiveMethods() {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getActiveMethods();
        
        if (items.error) {
          throw items;
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getActiveMethods');
    });
  }

  /**
   * Récupère les méthodes de paiement par type et provider
   * @param type Type de méthode de paiement
   * @param provider Provider de paiement
   * @returns Liste des méthodes de paiement
   */
  getByTypeAndProvider(type: string, provider: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getByTypeAndProvider(type, provider);
        
        if (items.error) {
          throw items;
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getByTypeAndProvider');
    });
  }

  /**
   * Vérifie si une méthode de paiement est active
   * @param id ID de la méthode de paiement
   * @returns Statut de la méthode
   */
  isMethodActive(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la méthode de paiement"),
            data: false
          });
        }
        
        const isActive = await this.service.isMethodActive(id);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: isActive
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'isMethodActive');
    });
  }

  /**
   * [SÉCURITÉ F-05] `getApiConfig()` a été retirée en même temps que la route
   * `GET /payment-method/config/:id` : elle renvoyait tel quel `apiConfig`, identifiants des
   * prestataires de paiement compris, à tout appelant passant `TokenMiddleware.verify` — donc au
   * porteur du jeton public embarqué dans les applications mobiles. Aucune application ne la
   * consommait. Les secrets ne sortent plus du processus (cf. `PAYMENT_METHOD_SECRET_PROJECTION`).
   */

  /**
   * Met à jour le statut d'une méthode de paiement
   * @param id ID de la méthode de paiement
   * @param status Nouveau statut
   * @returns Résultat de l'opération
   */
  updateStatus(id: string, status: 'active' | 'inactive' | 'suspended' | 'removed') {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la méthode de paiement"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('PaymentMethod'),
            data: null
          });
        }
        
        // Mise à jour du statut
        const updatedItem = await this.service.updateStatus(id, status);
        
        if (updatedItem.error) {
          throw updatedItem;
        }
        
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
      return coddyger.catchReturn(e, controllerLabel, 'updateStatus');
    });
  }
}