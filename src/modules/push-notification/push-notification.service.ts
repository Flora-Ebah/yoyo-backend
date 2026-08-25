import { notificationManager, NotificationCategory, NotificationType } from '../../services/notification';
import { IPushNotification } from './push-notification.interface';
import { PushNotificationSet } from './push-notification.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class PushNotificationService {
  private readonly dao: IData<IPushNotification>;
  private readonly serviceLabel = 'PushNotificationService';

  constructor() {
    this.dao = new PushNotificationSet();
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
						$or: [{ slug: { $regex: query || '', $options: 'i' } }, { title: { $regex: query || '', $options: 'i' } }]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

			const rows: IPushNotification[] = data.rows;
			delete data.rows;

			return {
				data,
				rows
			};
		} catch (error) {
			return { error: true, data: error };
		}
	}

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getHug(params?: any): Promise<IPushNotification[] | IErrorObject> {
    try {
      const result:any = await this.dao.selectHug(params);
      return result;
    } catch (error) {
      return { error: true, data: error };
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
      return { error: true, data: error };
    }
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  async create(item: IPushNotification): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      
      const notification:any = await this.dao.save(item);

      const result:any = await this.sendPushNotification(notification);
      if(result.error) {
        throw new Error(result);
      }
      
      return notification;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  async update(id: string, item: Partial<IPushNotification>): Promise<IPushNotification | IErrorObject> {
    try {
      const result:any = await this.dao.update({ _id: id }, item);
      if (result.error) {
        throw new Error(result);
      }
      return this.getById(id);
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Supprime un élément (mise à jour du statut)
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  async delete(id: string): Promise<void> {
    try {
      const result:any = await this.dao.update({ _id: id }, { status: 'removed' });
      if (result.error) {
        throw new Error(result);
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
   * Envoie une notification push en temps réel
   */
  private async sendPushNotification(notification: IPushNotification): Promise<any> {
    try {
      const payload = {
        id: notification._id,
        title: notification.title,
        body: notification.body,
        type: notification.type,
        priority: notification.priority,
        data: notification.data,
        timestamp: new Date().toISOString()
      };

      const result:any = await this.sendNotification({ ...payload, event: notification.target, to: 'all' });
      if(result.success === false) {
        throw new Error(result);
      }

      // Mettre à jour le statut de la notification
      await this.dao.update(
        { _id: notification._id },
        { 
          status: 'sent',
          sentAt: new Date()
        }
      );

      return result;
    } catch (error: any) {
      // En cas d'erreur, mettre à jour le statut de la notification
      await this.dao.update(
        { _id: notification._id },
        { 
          status: 'failed',
          error: error.message
        }
      );
      return { error: true, data: error };
    }
  }

  private async sendNotification(notification: any): Promise<any> {
    try {
      // Envoyer une notification à tous les clients connectés
      const result:any = await notificationManager.sendNotification({
        category: NotificationCategory.INFO,
        type: NotificationType.PUSH,
        to: notification.to,
        data: {
          title: notification.title,
          message: notification.body,
          data: {
            event: notification.event,
            additionalData: notification.data
          }
        }
      });

      if(result.success === false) {
        throw new Error(result);
      }

      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

	/**
	 * Récupère le dernier élément
	 * @returns Dernier élément
	 */
	async selectLatest(): Promise<IPushNotification | null> {
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
	async selectLatestWithParams(params: any): Promise<IPushNotification | null> {
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
      return { error: true, data: error };
    }
  }

  /**
   * Marque toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(userId: string): Promise<void | IErrorObject> {
    try {
      const result:any = await this.dao.updateMany(
        { 
          'target.userId': userId,
          status: { $nin: ['removed', 'archived'] }
        },
        { 
          $set: {
            read: true,
            readAt: new Date()
          },
          $addToSet: {
            readBy: userId
          }
        }
      );

      if (result.error) {
        throw new Error(result);
      }
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'markAllAsRead' 
      });
      return { error: true, data: error };
    }
  }

  /**
   * Marque une notification spécifique comme lue
   */
  async markAsRead(notificationId: string, userId: string): Promise<void | IErrorObject> {
    try {
      const result:any = await this.dao.update(
        { 
          _id: notificationId,
          status: { $nin: ['removed', 'archived'] }
        },
        { 
          $set: {
            read: true,
            readAt: new Date()
          },
          $addToSet: {
            readBy: userId
          }
        }
      );

      if (result.error) {
        throw new Error(result);
      }
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'markAsRead' 
      });
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les notifications d'un utilisateur
   */
  async getUserNotifications(userId: string, payloads: { page?: number; pageSize?: number; read?: boolean }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let read: boolean | undefined = payloads.read;

      const query: any = {
        status: { $nin: ['removed', 'archived'] }
      };

      // Construire la requête en fonction des paramètres
      query.$or = [
        { 'target': 'push-notification' },
        { 'data.user': userId },
        { 'data.users': userId }
      ];

      if (read !== undefined) {
        query.read = read;
      }

      const data: any = await this.dao.select({ 
        params: query,
        page,
        pageSize,
        sort: { createdAt: -1 } // Trier par date de création décroissante
      });

      if (data.error) {
        throw data;
      }

      const rows: IPushNotification[] = data.rows;
      delete data.rows;

      return {
        data,
        rows
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }
}