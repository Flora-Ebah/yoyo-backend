import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { TransactionService } from './transaction.service';
import { ITransaction } from './transaction.interface';

const controllerLabel: string = 'TransactionController';

export class TransactionController {
  private readonly service: TransactionService;

  constructor() {
    this.service = new TransactionService();
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
            message: locale.notfound('Transaction'),
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
            message: locale.notfound('Transaction'),
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
   * Crée une transaction pour l'achat d'un plan
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @param isScheduledRenewal Indique si c'est un renouvellement programmé
   * @param currentSubscriptionId ID de l'abonnement actuel (pour les renouvellements)
   * @returns Transaction créée avec URL de paiement
   */
  createPlanTransaction(userId: string, planId: string, isScheduledRenewal?: boolean, currentSubscriptionId?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification des paramètres
        if (!userId || !coddyger.string.isValidObjectId(userId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'utilisateur"),
            data: null
          });
        }

        if (!planId || !coddyger.string.isValidObjectId(planId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du plan"),
            data: null
          });
        }

        // Création ou récupération de la transaction
        const transaction:any = await this.service.createPlanTransaction(userId, planId, isScheduledRenewal, currentSubscriptionId);
        if(transaction.error) {
          return reject(transaction);
        }
        
        resolve({
          status: defines.status.created,
          message: "Ok",
          data: transaction.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'createPlanTransaction');
    });
  }

  /**
   * Vérifie le statut d'un paiement
   * @param transactionId ID de la transaction
   * @returns Statut du paiement
   */
  checkPaymentStatus(transactionId: string, requester?: { _id: string; isAdmin?: boolean }) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!transactionId) {
          return resolve({
            status: defines.status.badRequest,
            message: "L'ID de transaction est requis",
            data: null
          });
        }

        const transaction:any = await this.service.getOne({_id: transactionId});
        if(!transaction) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Transaction'),
            data: null
          });
        }

        // [SÉCURITÉ F-01 / 2d] Contrôle de propriété : cette vérification déclenche l'activation
        // d'un abonnement en effet de bord. Sans ce contrôle, tout compte connecté pouvait la
        // déclencher sur la transaction d'autrui (IDOR).
        if (requester && !requester.isAdmin && String(transaction.user) !== String(requester._id)) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Transaction'),
            data: null
          });
        }

        // Vérification du statut
        const paymentStatus = await this.service.checkPaymentStatus({ id: transactionId, amount: transaction.amount, payToken: transaction.paymentToken });
        
        resolve({
          status: defines.status.requestOK,
          message: "Statut du paiement récupéré avec succès",
          data: paymentStatus
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'checkPaymentStatus');
    });
  }

  /**
   * Met à jour le statut d'une transaction
   * @param transactionId ID de la transaction
   * @param paymentStatus Statut du paiement
   * @returns Transaction mise à jour
   */
  updateTransactionStatus(transactionId: string, paymentStatus: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification des paramètres
        if (!transactionId || !coddyger.string.isValidObjectId(transactionId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de la transaction"),
            data: null
          });
        }

        if (!paymentStatus) {
          return resolve({
            status: defines.status.badRequest,
            message: "Le statut du paiement est requis",
            data: null
          });
        }

        // Mise à jour du statut
        const transaction = await this.service.updateTransactionStatus(transactionId, paymentStatus);
        
        if (!transaction) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Transaction'),
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: "Statut de la transaction mis à jour avec succès",
          data: transaction
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'updateTransactionStatus');
    });
  }

  /**
   * Récupère l'historique des transactions d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param page Page
   * @param pageSize Taille de la page
   * @returns Liste des transactions
   */
  getUserTransactions(userId: string, page: number = 1, pageSize: number = 10) {
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

        // Récupération des transactions
        const transactions = await this.service.getUserTransactions(userId, page, pageSize);
        
        resolve({
          status: defines.status.requestOK,
          message: "Historique des transactions récupéré avec succès",
          data: transactions
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getUserTransactions');
    });
  }

  /**
   * Récupère les statistiques des transactions
   * @returns Statistiques des transactions
   */
  getTransactionStats() {
    return new Promise(async (resolve, reject) => {
      try {
        // Récupération des statistiques
        const stats = await this.service.getTransactionStats();
        
        resolve({
          status: defines.status.requestOK,
          message: "Statistiques des transactions récupérées avec succès",
          data: stats
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getTransactionStats');
    });
  }

  /**
   * [SÉCURITÉ F-01] `paymentCallback()` a été supprimé avec la route `payment-callback` :
   * l'activation d'abonnement reposait sur `cpm_error_message`, un champ CinetPay fourni par
   * l'appelant sur un endpoint non authentifié. Le paramètre `signature` y était déstructuré
   * mais jamais vérifié.
   */

  /**
   * Webhook pour les notifications de paiement
   * @param payload Données du paiement
   * @param user Utilisateur
   * @returns Résultat du paiement
   */
  paymentNotify(payload: any) {
    return new Promise(async (resolve, reject) => {
      // [SÉCURITÉ F-01] `payload.status` est volontairement ignoré : il n'est pas authentifié.
      // Seul le `notif_token` sert à identifier la transaction, dont le statut réel est ensuite
      // établi auprès d'Orange Money par le service.
      const { notif_token } = payload;

      const result: any = await this.service.settleNotification(notif_token);

      if (!result.found) {
        return reject({
          status: defines.status.notFound,
          message: locale.notfound('Transaction'),
          data: null
        });
      }

      if (result.amountMismatch || result.unreadableStatus) {
        return reject({
          status: defines.status.badRequest,
          message: "Notification de paiement non validée",
          data: null
        });
      }

      resolve({
        status: defines.status.requestOK,
        message: result.alreadySettled
          ? "Notification déjà traitée"
          : "Transaction mise à jour avec succès",
        data: null
      });
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'paymentNotify');
    });
  }

  /**
   * Récupère les transactions de renouvellement programmé pour un abonnement
   * @param userId ID de l'utilisateur
   * @param subscriptionId ID de l'abonnement
   * @returns Transactions de renouvellement programmé
   */
  getScheduledRenewalTransactions(userId: string, subscriptionId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const transactions = await this.service.getScheduledRenewalTransactions(userId, subscriptionId);
        resolve({
          status: defines.status.requestOK,
          message: "Transactions de renouvellement programmé récupérées avec succès",
          data: transactions
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}