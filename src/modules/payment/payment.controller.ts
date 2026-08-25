import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PaymentService } from './payment.service';
import { IPayment } from './payment.interface';

const controllerLabel: string = 'PaymentController';

export class PaymentController {
  private readonly service: PaymentService;

  constructor() {
    this.service = new PaymentService();
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
            message: locale.notfound('Payment'),
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
  initiate(item: IPayment) {
    return new Promise(async (resolve, reject) => {
      try {
        const newItem = await this.service.create(item);
        if (newItem.error) {
          return resolve({
            status: defines.status.badRequest,
            message: newItem.message,
            data: newItem
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.successSave,
          data: newItem
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'initiate');
    });
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  create(item: IPayment) {
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
  validate(id: string, item: Partial<IPayment>) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Demande de paiement'),
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
            message: locale.notfound('Demande de paiement'),
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
   * Récupère les statistiques de paiement d'un client pour un partenaire
   * @param userId ID du client
   * @param partnerId ID du partenaire
   * @returns Statistiques de paiement
   */
  getPaymentStats(userId: string, partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getPaymentStats(userId, partnerId);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPaymentStats');
    });
  }

  /**
   * Récupère le dernier paiement d'un partenaire
   * @param partnerId ID du partenaire
   * @returns Dernier paiement
   */
  getLastPayment(partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getLastPayment(partnerId);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getLastPayment');
    });
  }

  /**
   * Récupère les transactions d'un partenaire
   * @param partnerId ID du partenaire
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  getPartnerTransactions(partnerId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getPartnerTransactions(partnerId, payloads);
        const rows = items.rows;
        const data = items.data;

        delete data.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: data,
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPartnerTransactions');
    });
  }

  /**
   * Valide un paiement
   * @param partnerId ID du partenaire
   * @param amount Montant du paiement
   * @returns Paiement validé
   */
  validatePayment(partnerId: string, amount: number) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        if (!amount || amount <= 0) {
          return resolve({
            status: defines.status.badRequest,
            message: "Le montant doit être supérieur à 0",
            data: null
          });
        }

        const items = await this.service.validatePayment(partnerId, amount);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'validatePayment');
    });
  }

  /**
   * Récupère les transactions d'un client
   * @param clientId ID du client
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  getClientTransactions(clientId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(clientId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du client"),
            data: null
          });
        }

        const items = await this.service.getClientTransactions(clientId, payloads);
        const rows = items.rows;
        const data = items.data;

        delete data.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: data,
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getClientTransactions');
    });
  }
}
