import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { NotificationService } from './notification.service';
import { INotification } from './notification.interface';
import { NotificationType, NotificationCategory } from '../../services/notification/notification.interface';

const controllerLabel: string = 'NotificationController';

export class NotificationController {
  private readonly service: NotificationService;

  constructor() {
    this.service = new NotificationService();
  }

  /**
   * Récupère toutes les notifications
   * @param payloads Paramètres de pagination et de filtrage
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getAll(payloads);
        const rows:any[] = items.rows;
        delete items.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: items.data,
          data: rows
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
   * Récupère une notification par son ID
   * @param id ID de la notification
   */
  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        
        if (!item) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Notification'),
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
   * Crée une nouvelle notification
   * @param item Données de la notification
   */
  create(item: INotification) {
    return new Promise(async (resolve, reject) => {
      try {
        // Validation des données
        if (!item.type || !Object.values(NotificationType).includes(item.type)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Type de notification invalide',
            data: null
          });
        }

        if (!item.category || !Object.values(NotificationCategory).includes(item.category)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Catégorie de notification invalide',
            data: null
          });
        }

        if (!item.to || (Array.isArray(item.to) && item.to.length === 0)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Destinataire(s) de notification requis(s)',
            data: null
          });
        }

        if (!item.data) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Message de notification requis',
            data: null
          });
        }

        // Création de la notification
        const notification = await this.service.create(item);
        
        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: notification
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
   * Envoie une notification
   * @param item Données de la notification
   */
  send(item: INotification) {
    return new Promise(async (resolve, reject) => {
      try {
        // Validation des données
        if (!item.type || !Object.values(NotificationType).includes(item.type)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Type de notification invalide',
            data: null
          });
        }

        if (!item.category || !Object.values(NotificationCategory).includes(item.category)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Catégorie de notification invalide',
            data: null
          });
        }

        if (!item.to || (Array.isArray(item.to) && item.to.length === 0)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Destinataire(s) de notification requis(s)',
            data: null
          });
        }

        if (!item.data) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Message de notification requis',
            data: null
          });
        }

        // Envoi de la notification
        const notification = await this.service.send(item);
        
        resolve({
          status: defines.status.created,
          message: 'Notification envoyée avec succès',
          data: notification
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'send');
    });
  }

  /**
   * Supprime une notification
   * @param id ID de la notification
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
            message: locale.notfound('Notification'),
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
   * Récupère les notifications d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param page Numéro de page
   * @param pageSize Taille de la page
   */
  getUserNotifications(userId: string, page: number = 1, pageSize: number = 10) {
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

        // Récupération des notifications
        const notifications = await this.service.getUserNotifications(userId, page, pageSize);
        const rows:any[] = notifications.rows;
        delete notifications.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: notifications.data,
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getUserNotifications');
    });
  }

  /**
   * Marque une notification comme lue
   * @param id ID de la notification
   */
  markAsRead(id: string) {
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
            message: locale.notfound('Notification'),
            data: null
          });
        }
        
        // Marquage comme lu
        const notification = await this.service.markAsRead(id);
        
        resolve({
          status: defines.status.requestOK,
          message: "Notification marquée comme lue",
          data: notification
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
   * Marque toutes les notifications d'un utilisateur comme lues
   * @param userId ID de l'utilisateur
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

        // Marquer toutes les notifications comme lues
        const result = await this.service.markAllAsRead(userId);
        
        resolve({
          status: defines.status.requestOK,
          message: 'Toutes les notifications ont été marquées comme lues',
          data: result
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'markAllAsRead');
    });
  }
}