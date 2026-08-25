import coddyger, { IData, IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { ISubscription, SubscriptionSet } from './';
import { SubscriptionService } from './subscription.service';
import { IPlan, PlanSet } from '../plan';

const controllerLabel: string = 'SubscriptionController';

export class SubscriptionController {
  private readonly dao: IData<ISubscription>;
  private readonly service: SubscriptionService;

  constructor() {
    this.dao = new SubscriptionSet();
    this.service = new SubscriptionService();
  }

  /**
   * Crée un nouvel abonnement
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @param options Options supplémentaires
   * @returns Résultat de l'opération
   */
  create(userId: string, planId: string, options?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier si les paramètres sont valides
        if (!coddyger.string.isValidObjectId(userId) || !coddyger.string.isValidObjectId(planId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        // Créer l'abonnement via le service
        const result = await this.service.createSubscription(userId, planId, options);

        if (!result.success) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: result.message,
          data: result.subscription
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'create');
      }
    });
  }

  /**
   * Vérifie si un utilisateur a un abonnement actif
   * @param userId ID de l'utilisateur
   * @returns Résultat de la vérification
   */
  checkActive(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        const result = await this.service.checkActiveSubscription(userId);

        return resolve({
          status: defines.status.requestOK,
          message: result.hasActiveSubscription 
            ? 'L\'utilisateur a un abonnement actif' 
            : 'L\'utilisateur n\'a pas d\'abonnement actif',
          data: {
            hasActiveSubscription: result.hasActiveSubscription,
            subscription: result.subscription
          }
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'checkActive');
      }
    });
  }

  /**
   * Renouvelle un abonnement
   * @param subscriptionId ID de l'abonnement
   * @param options Options de renouvellement
   * @returns Résultat de l'opération
   */
  renew(subscriptionId: string, options?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(subscriptionId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        const result = await this.service.renewSubscription(subscriptionId, options);

        if (!result.success) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: result.message,
          data: result.subscription
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'renew');
      }
    });
  }

  /**
   * Annule un abonnement
   * @param subscriptionId ID de l'abonnement
   * @param reason Raison de l'annulation
   * @returns Résultat de l'opération
   */
  cancel(subscriptionId: string, reason?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(subscriptionId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        const result = await this.service.cancelSubscription(subscriptionId, reason);

        if (!result.success) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: result.message,
          data: null
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'cancel');
      }
    });
  }

  /**
   * Récupère l'historique des abonnements d'un utilisateur
   * @param userId ID de l'utilisateur
   * @returns Liste des abonnements
   */
  getUserHistory(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        const subscriptions:any = await this.service.getUserSubscriptionHistory(userId);
        const rows = subscriptions.rows;

        delete subscriptions.rows;

        return resolve({
          status: defines.status.requestOK,
          message: subscriptions,
          data: rows
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'getUserHistory');
      }
    });
  }

  /**
   * Récupère les détails d'un abonnement
   * @param subscriptionId ID de l'abonnement
   * @returns Détails de l'abonnement
   */
  getDetails(subscriptionId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(subscriptionId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        const subscription = await this.dao.selectOne({ _id: subscriptionId });

        if (!subscription) {
          return resolve({
            status: defines.status.notFound,
            message: 'Abonnement non trouvé',
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: 'Détails de l\'abonnement récupérés avec succès',
          data: subscription
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'getDetails');
      }
    });
  }

  /**
   * Liste tous les abonnements
   * @param page Numéro de page
   * @param pageSize Taille de la page
   * @param status Statut des abonnements à récupérer
   * @returns Liste des abonnements
   */
  list(page: number = 1, pageSize: number = 10, status?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const params: any = {};
        
        if (status) {
          params.status = status;
        }
        
        const result = await this.dao.select({
          params,
          page,
          pageSize,
          sort: 'createdAt',
          orderBy: 'desc'
        });
        
        // Si result est null ou undefined, on renvoie une liste vide
        if (!result) {
          return resolve({
            status: defines.status.requestOK,
            message: 'Aucun résultat trouvé',
            data: []
          });
        }
        
        if ('error' in result) {
          reject(result);
          return;
        }
        
        // Supposons que result est un objet avec rows et metadata
        const subscriptions = 'rows' in result ? result.rows : [];
        const metadata = { ...result };
        if ('rows' in metadata) {
          delete metadata.rows;
        }
        
        resolve({
          status: defines.status.requestOK,
          message: metadata,
          data: subscriptions
        });
      } catch (e) {
        console.error(e);
        return coddyger.catchReturn(e, controllerLabel, 'list');
      }
    });
  }

  /**
   * Récupère l'abonnement actuel d'un utilisateur avec les détails du plan
   * @param userId ID de l'utilisateur
   * @returns Abonnement actuel avec les détails du plan
   */
  getCurrentSubscription(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier si l'ID utilisateur est valide
        if (!coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }

        // Récupérer l'abonnement actif via le service
        const subscription = await this.service.getCurrentSubscriptionWithPlanDetails(userId);

        if (!subscription) {
          return resolve({
            status: defines.status.notFound,
            message: "Aucun abonnement actif trouvé pour cet utilisateur",
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: "Abonnement actuel récupéré avec succès",
          data: subscription
        });
      } catch (error) {
        console.error('Erreur lors de la récupération de l\'abonnement actuel:', error);
        return reject(error);
      }
    }).catch((e: IErrorObject) => {
      return coddyger.catchReturn(e, controllerLabel, 'getCurrentSubscription');
    });
  }

  /**
   * Programme un renouvellement anticipé d'abonnement
   * @param subscriptionId ID de l'abonnement actuel
   * @param newPlanId ID du nouveau plan
   * @param options Options de renouvellement
   * @returns Résultat de l'opération
   */
  scheduleEarlyRenewal(subscriptionId: string, newPlanId: string, options?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(subscriptionId) || !coddyger.string.isValidObjectId(newPlanId)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'IDs invalides',
            data: null
          });
        }

        const result = await this.service.scheduleEarlyRenewal(subscriptionId, newPlanId, options);

        if (!result.success) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: result.message,
          data: result.subscription
        });
      } catch (error) {
        console.error('Erreur lors de la programmation du renouvellement anticipé:', error);
        return reject(error);
      }
    }).catch((e: IErrorObject) => {
      return coddyger.catchReturn(e, controllerLabel, 'scheduleEarlyRenewal');
    });
  }

  /**
   * Active un renouvellement en attente
   * @param subscriptionId ID de l'abonnement
   * @returns Résultat de l'opération
   */
  activatePendingRenewal(subscriptionId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(subscriptionId)) {
          return resolve({
            status: defines.status.badRequest,
            message: 'ID d\'abonnement invalide',
            data: null
          });
        }

        const result = await this.service.activatePendingRenewal(subscriptionId);

        if (!result.success) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: null
          });
        }

        return resolve({
          status: defines.status.requestOK,
          message: result.message,
          data: result.subscription
        });
      } catch (error) {
        console.error('Erreur lors de l\'activation du renouvellement:', error);
        return reject(error);
      }
    }).catch((e: IErrorObject) => {
      return coddyger.catchReturn(e, controllerLabel, 'activatePendingRenewal');
    });
  }
}