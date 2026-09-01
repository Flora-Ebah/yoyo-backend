import { INotification } from './notification.interface';
import { NotificationSet } from './notification.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { NotificationManager, NotificationType, NotificationCategory } from '../../services/notification';

export class NotificationService {
  private readonly dao: IData<INotification>;
  private readonly serviceLabel = 'NotificationService';
  private readonly notificationManager: NotificationManager;

  constructor() {
    this.dao = new NotificationSet();
    this.notificationManager = NotificationManager.getInstance();
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

			const rows: INotification[] = data.rows;
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
   * Récupère une notification par son ID
   * @param id ID de la notification
   */
  async getById(id: string): Promise<any> {
    try {
      const result = await this.dao.selectOne({ _id: id });
      return result || null;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  	/**
	 * Récupère le dernier élément
	 * @returns Dernier élément
	 */
	async selectLatest(): Promise<INotification | null> {
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
	async selectLatestWithParams(params: any): Promise<INotification | null> {
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

  /**
   * Crée une nouvelle notification
   * @param item Données de la notification
   */
  async create(item: INotification): Promise<any> {
		try {
			// Génération d'un ID si non fourni
			if (!item._id) {
				item._id = coddyger.string.generateObjectId();
			}

			return await this.dao.save(item);
		} catch (error) {
			return { error: true, data: error };
		}
  }

  /**
   * Met à jour une notification
   * @param id ID de la notification
   * @param item Nouvelles données
   */
	async update(id: string, item: Partial<INotification>): Promise<any> {
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
   * Supprime une notification
   * @param id ID de la notification
   */
  async delete(id: string): Promise<void> {
    try {
      await this.dao.remove({ _id: id });
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
   * Envoie une notification
   * @param item Données de la notification
   */
  async send(item: INotification): Promise<any> {
    try {
      // Créer la notification dans la base de données
      const notification = await this.create(item);

      // Envoyer la notification via le gestionnaire de notifications
      const result:any = await this.notificationManager.sendNotification({
        type: item.type,
        category: item.category,
        to: item.to,
        data: item.data,
        template: item.template,
        templateData: item.templateData,
        attachments: item.attachments
      });

      // Mettre à jour le statut de la notification
      if (result.success) {
        await this.update(notification._id, {
          status: 'sent',
          sentAt: new Date()
        });
      } else {
        await this.update(notification._id, {
          status: 'failed',
          error: result.message
        });
      }

      const updatedNotification = await this.getById(notification._id);
      if (!updatedNotification) {
        throw new Error('Notification non trouvée après mise à jour');
      }
      return updatedNotification;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les notifications d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param page Numéro de page
   * @param pageSize Taille de la page
   */
  async getUserNotifications(userId: string, page: number = 1, pageSize: number = 10): Promise<any> {
    try {
      const result:any = await this.dao.select({ params: { to: userId }, page, pageSize });

      if (result.error) {
        throw result;
      }

      // Le DAO renvoie `totalRows` / `totalPages` (cf. MongoDbDao.select) : lire `result.total`
      // donnait `NaN`, sérialisé en `null` dans la métadonnée de pagination.
      return {
        data: {
          page,
          pageSize,
          total: result.totalRows,
          totalPages: result.totalPages
        },
        rows: result.rows
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'getUserNotifications'
      });
      throw error;
    }
  }

  /**
   * Marque une notification comme lue
   * @param id ID de la notification
   */
  async markAsRead(id: string): Promise<INotification | null> {
    try {
      // Ne touche plus à `status` : passer une notification en 'sent' pour dire « lue » écrasait
      // son état d'acheminement (et rendait « lue » toute notification simplement envoyée).
      return await this.update(id, {
        isRead: true,
        readAt: new Date()
      });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'markAsRead'
      });
      throw error;
    }
  }

  /**
   * Marque toutes les notifications d'un utilisateur comme lues
   * @param userId ID de l'utilisateur
   */
  async markAllAsRead(userId: string): Promise<any> {
    try {
      // `read` n'existe pas au schéma : le filtre ne remontait rien et la mise à jour était
      // silencieusement ignorée. Le champ est `isRead`, et il faut un updateMany.
      const result:any = await this.dao.updateMany(
        { to: userId, isRead: { $ne: true } },
        { isRead: true, readAt: new Date() }
      );

      if (result.error) {
        throw result;
      }

      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }
}