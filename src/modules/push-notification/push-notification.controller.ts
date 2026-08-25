import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PushNotificationService } from './push-notification.service';
import { IPushNotification } from './push-notification.interface';

const controllerLabel: string = 'PushNotificationController';

export class PushNotificationController {
  private readonly service: PushNotificationService;

  constructor() {
    this.service = new PushNotificationService();
  }

  /**
   * Récupère toutes les notifications push
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
   * Récupère une notification push par son ID
   */
  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        
        if (!item) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('PushNotification'),
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
   * Crée une nouvelle notification push
   */
  create(item: IPushNotification) {
    return new Promise(async (resolve, reject) => {
      try {
        // Validation des champs requis
        if (!item.title || !item.body) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Le titre et le corps de la notification sont requis',
            data: null
          });
        }

        // Validation du type
        if (!['info', 'success', 'warning', 'error'].includes(item.type)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Type de notification invalide',
            data: null
          });
        }

        // Validation de la priorité
        if (!['low', 'normal', 'high'].includes(item.priority)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Priorité de notification invalide',
            data: null
          });
        }

        // Validation de la cible
        if (!item.target) {
          return resolve({
            status: defines.status.badRequest,
            message: 'La cible de la notification est requise',
            data: null
          });
        }

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
   * Met à jour une notification push
   */
  update(id: string, item: Partial<IPushNotification>) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la notification"),
            data: null
          });
        }
        
        // Vérification de l'existence de la notification
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('PushNotification'),
            data: null
          });
        }

        // Validation du type si fourni
        if (item.type && !['info', 'success', 'warning', 'error'].includes(item.type)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Type de notification invalide',
            data: null
          });
        }

        // Validation de la priorité si fournie
        if (item.priority && !['low', 'normal', 'high'].includes(item.priority)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Priorité de notification invalide',
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
   * Supprime une notification push
   */
  delete(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la notification"),
            data: null
          });
        }
        
        // Vérification de l'existence de la notification
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('PushNotification'),
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
   * Marque toutes les notifications d'un utilisateur comme lues
   */
  markAllAsRead(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!userId || !coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'utilisateur"),
            data: null
          });
        }

        await this.service.markAllAsRead(userId);
        
        resolve({
          status: defines.status.requestOK,
          message: 'Toutes les notifications ont été marquées comme lues',
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'markAllAsRead');
    });
  }

  /**
   * Marque une notification spécifique comme lue
   */
  markAsRead(notificationId: string, userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!notificationId || !coddyger.string.isValidObjectId(notificationId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la notification"),
            data: null
          });
        }

        // Vérification de l'existence de la notification
        const existingItem = await this.service.getById(notificationId);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('PushNotification'),
            data: null
          });
        }

        await this.service.markAsRead(notificationId, userId);
        
        resolve({
          status: defines.status.requestOK,
          message: 'La notification a été marquée comme lue',
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'markAsRead');
    });
  }

  /**
   * Récupère les notifications d'un utilisateur
   */
  getUserNotifications(userId: string, payloads: { page?: number; pageSize?: number; read?: boolean }) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!userId || !coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'utilisateur"),
            data: null
          });
        }

        const items = await this.service.getUserNotifications(userId, payloads);
        
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
      return coddyger.catchReturn(e, controllerLabel, 'getUserNotifications');
    });
  }
}