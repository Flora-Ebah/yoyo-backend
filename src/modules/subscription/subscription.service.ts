import { ISubscription } from './subscription.interface';
import { SubscriptionSet } from './subscription.model';
import coddyger, { IData, IErrorObject, defines, LoggerService, LogLevel } from 'coddyger';
import { IPlan, PlanSet } from '../plan';

export class SubscriptionService {
  private readonly dao: any;
  private readonly planDao: IData<IPlan>;
  private readonly serviceLabel = 'SubscriptionService';

  constructor() {
    this.dao = new SubscriptionSet();
    this.planDao = new PlanSet();
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
							{ title: { $regex: query || '', $options: 'i' } },
						]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

      const rows: ISubscription[] = data.rows;
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
  async getHug(params?: any): Promise<ISubscription[]> {
    try {
      const result:any = await this.dao.selectHug(params);
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
  async create(item: ISubscription): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      
      // Ajout du statut par défaut si non fourni
      if (!item.status) {
        item.status = 'active';
      }
      
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
  async update(id: string, item: Partial<ISubscription>): Promise<ISubscription | null> {
    try {
      const result:any = await this.dao.update({ _id: id }, item);
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
     * Crée un nouvel abonnement
     * @param userId ID de l'utilisateur
     * @param planId ID du plan
     * @param options Options supplémentaires
     * @returns Résultat de l'opération
     */
    async createSubscription(
      userId: string,
      planId: string,
      options?: {
        durationMonths?: number;
        paymentMethod?: string;
        transactionId?: string;
        autoRenew?: boolean;
        metadata?: any;
      }
    ): Promise<{ success: boolean; message: string; subscription?: ISubscription }> {
      try {
        // Vérifier si le plan existe
        const plan:any = await this.planDao.selectOne({ _id: planId });
        
        if (!plan) {
          return {
            success: false,
            message: 'Plan non trouvé'
          };
        }
        
        // Vérifier si le plan est actif
        if (!plan.isActive) {
          return {
            success: false,
            message: 'Ce plan n\'est plus disponible'
          };
        }

        // Vérifier si l'utilisateur a déjà un abonnement actif
        const activeSubscription = await this.checkActiveSubscription(userId);
        if (activeSubscription.hasActiveSubscription) {
          return {
            success: false,
            message: 'Vous avez déjà un abonnement actif',
            subscription: activeSubscription.subscription
          };
        }
        
        // Durée de l'abonnement : priorité à durationMonths (renouvellement multi-mois),
        // sinon durationDays du plan (7, 30, 90, 365…), sinon 1 mois par défaut.
        const durationMonths = options?.durationMonths;

        // Date de début = date actuelle
        const startDate = new Date();
        const endDate = new Date(startDate);
        let subscriptionPrice = plan.price;

        if (durationMonths && durationMonths > 0) {
          endDate.setMonth(endDate.getMonth() + durationMonths);
          subscriptionPrice = plan.price * durationMonths;
        } else if (plan.durationDays && plan.durationDays > 0) {
          endDate.setDate(endDate.getDate() + plan.durationDays);
          subscriptionPrice = plan.price;
        } else {
          endDate.setMonth(endDate.getMonth() + 1);
          subscriptionPrice = plan.price;
        }

        // Créer l'objet abonnement
        const subscriptionData: ISubscription = {
          _id: coddyger.string.generateObjectId(),
          userId,
          planId,
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
          paymentMethod: options?.paymentMethod,
          transactionId: options?.transactionId,
          autoRenew: options?.autoRenew || false,
          price: subscriptionPrice,
          currency: plan.currency,
          metadata: options?.metadata
        };
        
        // Sauvegarder dans la base de données
        const result = await this.dao.save(subscriptionData);
        
        // Vérifier si le résultat est une erreur
        if ('error' in result) {
          LoggerService.log({
            type: LogLevel.Error,
            content: result,
            location: this.serviceLabel,
            method: 'createSubscription'
          });
          
          return {
            success: false,
            message: `Erreur lors de la création de l'abonnement: ${result.message}`
          };
        }
        
        // Journaliser la création
        LoggerService.log({
          type: LogLevel.Info,
          content: `Nouvel abonnement créé pour l'utilisateur ${userId}, valide du ${startDate.toISOString()} au ${endDate.toISOString()}`,
          location: this.serviceLabel,
          method: 'createSubscription'
        });
        
        return {
          success: true,
          message: 'Abonnement créé avec succès',
          subscription: result
        };
      } catch (error) {
        console.log(error);
        
        return {
          success: false,
          message: 'Une erreur est survenue lors de la création de l\'abonnement'
        };
      }
    }

  /**
   * Vérifie si un utilisateur a un abonnement actif
   * @param userId ID de l'utilisateur
   * @returns Résultat de la vérification
   */
  async checkActiveSubscription(userId: string): Promise<{ hasActiveSubscription: boolean; subscription?: ISubscription }> {
    try {
      const now = new Date();
      const subscription:any = await this.dao.selectOne({
        userId,
        status: 'active',
        endDate: { $gt: now }
      });
      
      return {
        hasActiveSubscription: !!subscription,
        subscription
      };
    } catch (error) {
      return { hasActiveSubscription: false };
    }
  }

  /**
   * Renouvelle un abonnement
   * @param subscriptionId ID de l'abonnement
   * @param options Options de renouvellement
   * @returns Résultat de l'opération
   */
  async renewSubscription(
    subscriptionId: string,
    options?: {
      durationMonths?: number;
      transactionId?: string;
      paymentMethod?: string;
    }
  ): Promise<{ success: boolean; message: string; subscription?: ISubscription }> {
    try {
      // Récupérer l'abonnement existant
      const existingSubscription:any = await this.dao.selectOne({ _id: subscriptionId });
      
      if (!existingSubscription) {
        return {
          success: false,
          message: 'Abonnement non trouvé'
        };
      }
      
      // Durée du renouvellement (par défaut: même durée que l'abonnement précédent ou 1 mois)
      const durationMonths = options?.durationMonths || 1;
      
      // Calculer la nouvelle date de fin
      // Si l'abonnement est encore actif, ajouter la durée à la date de fin existante
      // Sinon, ajouter la durée à la date actuelle
      const now = new Date();
      const isExpired = existingSubscription.endDate < now;
      
      const startDate = isExpired ? now : existingSubscription.endDate;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      
      // Mettre à jour l'abonnement
      const updateData = {
        startDate: isExpired ? startDate : existingSubscription.startDate,
        endDate,
        status: 'active',
        paymentStatus: 'paid',
        transactionId: options?.transactionId || existingSubscription.transactionId,
        paymentMethod: options?.paymentMethod || existingSubscription.paymentMethod
      };
      
      await this.dao.update({ _id: subscriptionId }, updateData);
      
      // Récupérer l'abonnement mis à jour
      const updatedSubscription:any = await this.dao.selectOne({ _id: subscriptionId });
      
      // Journaliser le renouvellement
      LoggerService.log({
        type: LogLevel.Info,
        content: `Abonnement ${subscriptionId} renouvelé jusqu'au ${endDate.toISOString()}`,
        location: this.serviceLabel,
        method: 'renewSubscription'
      });
      
      return {
        success: true,
        message: 'Abonnement renouvelé avec succès',
        subscription: updatedSubscription
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'renewSubscription'
      });
      
      return {
        success: false,
        message: 'Une erreur est survenue lors du renouvellement de l\'abonnement'
      };
    }
  }

  /**
   * Annule un abonnement
   * @param subscriptionId ID de l'abonnement
   * @param reason Raison de l'annulation
   * @returns Résultat de l'opération
   */
  async cancelSubscription(
    subscriptionId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Vérifier si l'abonnement existe
      const subscription:any = await this.dao.selectOne({ _id: subscriptionId });
      
      if (!subscription) {
        return {
          success: false,
          message: 'Abonnement non trouvé'
        };
      }
      
      // Mettre à jour l'abonnement
      await this.dao.update(
        { _id: subscriptionId },
        {
          status: 'cancelled',
          autoRenew: false,
          metadata: {
            ...subscription.metadata,
            cancellationReason: reason,
            cancelledAt: new Date()
          }
        }
      );
      
      // Journaliser l'annulation
      LoggerService.log({
        type: LogLevel.Info,
        content: `Abonnement ${subscriptionId} annulé. Raison: ${reason || 'Non spécifiée'}`,
        location: this.serviceLabel,
        method: 'cancelSubscription'
      });
      
      return {
        success: true,
        message: 'Abonnement annulé avec succès'
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'cancelSubscription'
      });
      
      return {
        success: false,
        message: 'Une erreur est survenue lors de l\'annulation de l\'abonnement'
      };
    }
  }

  /**
   * Récupère l'historique des abonnements d'un utilisateur
   * @param userId ID de l'utilisateur
   * @returns Liste des abonnements
   */
  async getUserSubscriptionHistory(userId: string): Promise<ISubscription[]> {
    try {
      return await this.dao.select({
        params: { userId },
        sort: 'startDate',
        orderBy: 'desc'
      }) as ISubscription[];
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'getUserSubscriptionHistory'
      });
      
      return [];
    }
  }

  /**
   * Marque les abonnements expirés
   * @returns Nombre d'abonnements mis à jour
   */
  async updateExpiredSubscriptions(): Promise<number> {
    try {
      const now = new Date();
      
      // Trouver tous les abonnements actifs qui ont expiré
      const expiredSubscriptions = await this.dao.select({
        params: {
          status: 'active',
          endDate: { $lt: now }
        }
      }) as ISubscription[];
      
      if (expiredSubscriptions.length === 0) {
        return 0;
      }
      
      // Mettre à jour le statut des abonnements expirés
      const result = await this.dao.update(
        {
          status: 'active',
          endDate: { $lt: now }
        },
        {
          status: 'expired'
        }
      );
      
      // Journaliser la mise à jour
      LoggerService.log({
        type: LogLevel.Info,
        content: `${expiredSubscriptions.length} abonnements marqués comme expirés`,
        location: this.serviceLabel,
        method: 'updateExpiredSubscriptions'
      });
      
      return expiredSubscriptions.length;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'updateExpiredSubscriptions'
      });
      
      return 0;
    }
  }

  /**
   * Récupère l'abonnement actuel d'un utilisateur avec les détails du plan
   * @param userId ID de l'utilisateur
   * @returns Abonnement actuel avec les détails du plan
   */
  async getCurrentSubscriptionWithPlanDetails(userId: string): Promise<any> {
    try {
      // Récupérer l'abonnement actif
      const subscription:any = await this.dao.selectOne({ userId, status: 'active', endDate: { $gt: new Date() } });
      
      if (!subscription) {
        return null;
      }
      
      // Récupérer les détails du plan
      const plan:any = await this.planDao.selectOne({ _id: subscription.planId });
      
      if (!plan) {
        return {
          ...subscription.toObject(),
          plan: null
        };
      }
      
      // Calculer les informations supplémentaires
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      const startDate = new Date(subscription.startDate);
      
      // Calculer la durée totale en jours
      const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculer le nombre de jours restants de l'abonnement
      let daysRemaining = 0;
      if (now >= startDate) {
        // Si l'abonnement a commencé, calculer les jours restants jusqu'à la fin
        daysRemaining = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      } else {
        // Si l'abonnement n'a pas encore commencé, afficher la durée totale
        daysRemaining = totalDays;
      }
      
      // Calculer le pourcentage de progression
      const progress = Math.min(100, Math.max(0, 100 - (daysRemaining / totalDays * 100)));
      
      // Retourner l'abonnement avec les détails du plan et les informations supplémentaires
      return {
        ...subscription,
        planId: {
          _id: plan._id,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          currency: plan.currency,
          features: plan.features,
          discountPercentage: plan.discountPercentage ?? 0
        },
        daysRemaining,
        totalDays,
        progress: Math.round(progress)
      };
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'abonnement avec les détails du plan:', error);
      return null;
    }
  }

  /**
   * Programme un renouvellement anticipé d'abonnement
   * Le nouveau plan s'activera à la fin de l'abonnement en cours
   * @param subscriptionId ID de l'abonnement actuel
   * @param newPlanId ID du nouveau plan
   * @param options Options de renouvellement
   * @returns Résultat de l'opération
   */
  async scheduleEarlyRenewal(
    subscriptionId: string,
    newPlanId: string,
    options?: {
      paymentMethod?: string;
      transactionId?: string;
      metadata?: any;
    }
  ): Promise<{ success: boolean; message: string; subscription?: ISubscription }> {
    try {
      // Vérifier si l'abonnement existe et est actif
      const currentSubscription = await this.dao.selectOne({ _id: subscriptionId });
      if (!currentSubscription) {
        return {
          success: false,
          message: 'Abonnement non trouvé'
        };
      }

      if (currentSubscription.status !== 'active') {
        return {
          success: false,
          message: 'Seuls les abonnements actifs peuvent être renouvelés de manière anticipée'
        };
      }

      // Vérifier si le nouveau plan existe
      const newPlan = await this.planDao.selectOne({ _id: newPlanId });
      if (!newPlan) {
        return {
          success: false,
          message: 'Plan non trouvé'
        };
      }

      // Vérifier s'il n'y a pas déjà un renouvellement en attente
      if (currentSubscription.pendingRenewal) {
        return {
          success: false,
          message: 'Un renouvellement est déjà en attente pour cet abonnement'
        };
      }

      // Calculer les dates du nouveau plan
      const newStartDate = new Date(currentSubscription.endDate);
      const newEndDate = new Date(newStartDate);
      newEndDate.setMonth(newEndDate.getMonth() + 1); // Par défaut 1 mois, peut être modifié

      // Calculer le prix
      const price = (newPlan as any).price;

      // Créer l'objet de renouvellement en attente
      const pendingRenewal = {
        planId: newPlanId,
        startDate: newStartDate,
        endDate: newEndDate,
        price: price,
        paymentMethod: options?.paymentMethod,
        transactionId: options?.transactionId,
        createdAt: new Date()
      };

      // Mettre à jour l'abonnement avec le renouvellement en attente
      const updatedSubscription = await this.dao.update(
        { _id: subscriptionId },
        { 
          pendingRenewal: pendingRenewal,
          metadata: {
            ...currentSubscription.metadata,
            earlyRenewalScheduled: true,
            earlyRenewalScheduledAt: new Date()
          }
        }
      );

      if (updatedSubscription.error) {
        return {
          success: false,
          message: 'Erreur lors de la programmation du renouvellement'
        };
      }

      // Journaliser l'opération
      LoggerService.log({
        type: LogLevel.Info,
        content: `Renouvellement anticipé programmé pour l'abonnement ${subscriptionId} avec le plan ${newPlanId}`,
        location: this.serviceLabel,
        method: 'scheduleEarlyRenewal'
      });

      return {
        success: true,
        message: 'Renouvellement anticipé programmé avec succès. Le nouveau plan s\'activera à la fin de l\'abonnement en cours.',
        subscription: await this.dao.selectOne({ _id: subscriptionId })
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'scheduleEarlyRenewal'
      });

      return {
        success: false,
        message: 'Une erreur est survenue lors de la programmation du renouvellement anticipé'
      };
    }
  }

  /**
   * Active le renouvellement en attente à la fin de l'abonnement actuel
   * Cette méthode doit être appelée par un job/cron à la date de fin
   * @param subscriptionId ID de l'abonnement
   * @returns Résultat de l'opération
   */
  async activatePendingRenewal(subscriptionId: string): Promise<{ success: boolean; message: string; subscription?: ISubscription }> {
    try {
      const subscription = await this.dao.selectOne({ _id: subscriptionId });
      if (!subscription || !subscription.pendingRenewal) {
        return {
          success: false,
          message: 'Aucun renouvellement en attente trouvé'
        };
      }

      const { pendingRenewal } = subscription;

      // Mettre à jour l'abonnement avec les nouvelles données
      const updatedSubscription = await this.dao.update(
        { _id: subscriptionId },
        {
          planId: pendingRenewal.planId,
          startDate: pendingRenewal.startDate,
          endDate: pendingRenewal.endDate,
          price: pendingRenewal.price,
          paymentMethod: pendingRenewal.paymentMethod,
          transactionId: pendingRenewal.transactionId,
          status: 'active',
          paymentStatus: 'paid',
          pendingRenewal: null, // Supprimer le renouvellement en attente
          metadata: {
            ...subscription.metadata,
            activatedFromPendingRenewal: true,
            activatedAt: new Date()
          }
        }
      );

      if (updatedSubscription.error) {
        return {
          success: false,
          message: 'Erreur lors de l\'activation du renouvellement'
        };
      }

      // Journaliser l'activation
      LoggerService.log({
        type: LogLevel.Info,
        content: `Renouvellement activé pour l'abonnement ${subscriptionId}`,
        location: this.serviceLabel,
        method: 'activatePendingRenewal'
      });

      return {
        success: true,
        message: 'Renouvellement activé avec succès',
        subscription: await this.dao.selectOne({ _id: subscriptionId })
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'activatePendingRenewal'
      });

      return {
        success: false,
        message: 'Une erreur est survenue lors de l\'activation du renouvellement'
      };
    }
  }

  /**
   * Récupère tous les abonnements avec un renouvellement en attente
   * @returns Liste des abonnements avec renouvellement en attente
   */
  async getSubscriptionsWithPendingRenewal(): Promise<ISubscription[]> {
    try {
      const subscriptions = await this.dao.selectHug({
        pendingRenewal: { $exists: true, $ne: null },
        status: 'active'
      });
      
      return subscriptions || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des abonnements avec renouvellement en attente:', error);
      return [];
    }
  }

  /**
   * Récupère les renouvellements en attente expirés
   * @param beforeDate Date limite
   * @returns Liste des abonnements avec renouvellements expirés
   */
  async getExpiredPendingRenewals(beforeDate: Date): Promise<ISubscription[]> {
    try {
      const subscriptions = await this.dao.selectHug({
        'pendingRenewal.createdAt': { $lt: beforeDate },
        pendingRenewal: { $exists: true, $ne: null }
      });
      
      return subscriptions || [];
    } catch (error) {
      console.error('Erreur lors de la récupération des renouvellements expirés:', error);
      return [];
    }
  }

  /**
   * Annule un renouvellement en attente
   * @param subscriptionId ID de l'abonnement
   * @returns Résultat de l'opération
   */
  async cancelPendingRenewal(subscriptionId: string): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.dao.update(
        { _id: subscriptionId },
        { 
          pendingRenewal: null,
          metadata: {
            pendingRenewalCancelled: true,
            cancelledAt: new Date()
          }
        }
      );

      if (result.error) {
        return {
          success: false,
          message: 'Erreur lors de l\'annulation du renouvellement en attente'
        };
      }

      return {
        success: true,
        message: 'Renouvellement en attente annulé avec succès'
      };
    } catch (error) {
      console.error('Erreur lors de l\'annulation du renouvellement en attente:', error);
      return {
        success: false,
        message: 'Une erreur est survenue lors de l\'annulation du renouvellement'
      };
    }
  }
}