import { ITransaction } from './transaction.interface';
import { TransactionSet } from './transaction.model';
import { PlanSet } from '../plan';
import { ClientSet } from '../client';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { SubscriptionService } from '../subscription';
import { locale } from '../../public/locale/locale';
import { PaymentHelper } from '../../helpers/payment.helper';

// Type pour le retour de la fonction
type ErrorResult = {
  success: false;
  error: Error;
  message: string;
};

type SuccessResult<T> = {
  success: true;
  data: any;
};

type Result<T> = SuccessResult<T> | ErrorResult;

export class TransactionService {
  private readonly dao: IData<ITransaction>;
  private readonly planDao: IData<any>;
  private readonly serviceLabel = 'TransactionService';
  private readonly subscriptionService: SubscriptionService;
  private readonly paymentHelper: PaymentHelper;

  constructor() {
    this.dao = new TransactionSet();
    // [DETTE] Client axios CinetPay retiré : jamais utilisé, prestataire abandonné au profit
    // d'Orange Money (cf. PaymentHelper).
    this.planDao = new PlanSet();
    this.subscriptionService = new SubscriptionService();
    this.paymentHelper = new PaymentHelper();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getAll(payloads: {
		page?: number;
		pageSize?: number;
		query?: string;
		status?: string;
		paymentStatus?: string;
		from?: string;
		to?: string;
	}): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';
			let paymentStatus: any = payloads.paymentStatus ?? '';
			let from: string = payloads.from ?? '';
			let to: string = payloads.to ?? '';

      let data: any | IErrorObject = {};

			// Construction des filtres combinés (statut métier, statut de paiement,
			// plage de dates sur createdAt, recherche sur les identifiants de paiement).
			const params: any = {};

			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
			}

			if (!coddyger.string.isEmpty(paymentStatus)) {
				params.paymentStatus = paymentStatus;
			}

			if (!coddyger.string.isEmpty(from) || !coddyger.string.isEmpty(to)) {
				params.createdAt = {};

				if (!coddyger.string.isEmpty(from)) {
					params.createdAt.$gte = new Date(from);
				}

				if (!coddyger.string.isEmpty(to)) {
					const end = new Date(to);
					end.setHours(23, 59, 59, 999);
					params.createdAt.$lte = end;
				}
			}

			if (!coddyger.string.isEmpty(query)) {
				const rx = { $regex: query, $options: 'i' };

				// Recherche élargie : on retrouve d'abord les clients dont le nom / email /
				// contact correspond, puis on filtre les transactions sur ces clients,
				// en plus des identifiants de paiement.
				let clientIds: any[] = [];

				try {
					const clientDao: any = new ClientSet();
					const clients: any = await clientDao.selectHug({
						$or: [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }]
					});

					if (Array.isArray(clients)) {
						clientIds = clients.map((c: any) => c._id);
					}
				} catch (searchError) {
					clientIds = [];
				}

				params.$or = [
					{ user: { $in: clientIds } },
					{ paymentId: rx },
					{ txnId: rx }
				];
			}

			data = await this.dao.select({ params, page, pageSize });

			if (data.error) {
				throw data;
			}

      const rows: ITransaction[] = data.rows;
			delete data.rows;

			// Peuple le client (collection Client) et le plan afin de renvoyer des noms
			// plutôt que des ObjectId bruts. Best-effort : on ne bloque pas la liste si
			// une référence est manquante.
			try {
				const model: any = (this.dao as any).defaultModel;

				await model.populate(rows, [
					{ path: 'user', model: 'Client', select: 'firstname lastname email contact' },
					{ path: 'plan', model: 'Plan', select: 'name label' }
				]);
			} catch (populateError) {
				LoggerService.log({
					type: LogLevel.Warn,
					content: populateError,
					location: this.serviceLabel,
					method: 'getAll:populate'
				});
			}

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
  async getHug(params?: any): Promise<ITransaction[]> {
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
   * Récupère un élément par ses paramètres
   * @param params Paramètres de la requête
   * @returns Élément trouvé ou null
   */
  async getOne(params: any, fields: string = ""): Promise<any> {
    try {
      return await this.dao.selectOne(params, fields);
    } catch (error) {
      return null;
    }
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  async create(item: ITransaction): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        const generatedId = coddyger.string.generateObjectId();
        if (!generatedId) {
          throw new Error('Impossible de générer un ID pour la transaction');
        }
        item._id = generatedId;
      }
      
      // Ajout du statut par défaut si non fourni
      if (!item.status) {
        item.status = 'active';
      }
      
      const result = await this.dao.save(item);
      if (result && typeof result === 'object' && 'error' in result) {
        throw new Error((result as any).error || 'Erreur lors de la création');
      }
      return result;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
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
  async update(id: string, item: Partial<ITransaction>): Promise<ITransaction | null> {
    try {
      const result:any = await this.dao.update({ _id: id }, item);
      if (result && result.error) {
        throw new Error(result.error || 'Erreur lors de la mise à jour');
      }
      return this.getById(id);
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
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
      if (result && result.error) {
        throw new Error(result.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'delete' 
      });
      throw error;
    }
  }

  /**
   * Initie un paiement via le PaymentHelper
   * @param payload Données du paiement
   * @returns Résultat du paiement
   */
  private async initiatePayment(payload: {
    orderId: string;
    amount: number;
    reference: string;
    returnUrl?: string;
    cancelUrl?: string;
    notifUrl?: string;
    lang?: string;
  }): Promise<any> {
    try {
      // Vérifier que les paramètres requis sont présents
      if (!payload.orderId || !payload.amount || !payload.reference) {
        throw new Error('Paramètres de paiement manquants');
      }

      const paymentResult = await this.paymentHelper.initiatePayment({
        orderId: payload.orderId,
        amount: payload.amount,
        reference: payload.reference,
        returnUrl: payload.returnUrl || process.env.OM_RETURN_URL!,
        cancelUrl: payload.cancelUrl || process.env.OM_RETURN_URL!,
        notifUrl: payload.notifUrl || process.env.OM_NOTIFY_URL!,
        lang: payload.lang || 'fr'
      });

      return paymentResult;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'initiatePaymentWithHelper' 
      });
      throw error;
    }
  }

  /**
   * Vérifie le statut d'un paiement
   * @param transactionId ID de la transaction
   * @returns Statut du paiement
   */
  async checkPaymentStatus(payloads: { id: string, amount: number, payToken: string }): Promise<any> {
    try {
      const response = await this.paymentHelper.checkTransactionStatus({
        orderId: payloads.id,
        amount: payloads.amount,
        payToken: payloads.payToken
      });

      // [SÉCURITÉ F-01 / 2e] L'appel direct à `createSubscription` a été retiré : il faisait
      // doublon avec `updateTransactionStatus`, qui crée déjà l'abonnement lorsque le statut
      // passe à 'success'. Un seul chemin d'activation, pour éviter toute course.
      await this.updateTransactionStatus(payloads.id, response.status.toLowerCase());

      // Récupérer la transaction mise à jour
      const transaction: any = await this.dao.selectOne({ _id: payloads.id });

      return {
        ...transaction,
        isPaid: transaction.paymentStatus === 'success',
      };
    } catch (error) {
      console.log('error', error);
      throw error;
    }
  }

  /**
   * [SÉCURITÉ F-01] Traite une notification de paiement du prestataire.
   *
   * Le statut annoncé par l'appelant n'est jamais utilisé : la transaction est résolue par son
   * `notifyToken` (jeton non devinable émis par Orange Money à l'initiation du paiement), puis
   * son statut réel est ré-interrogé auprès d'Orange Money à partir des valeurs stockées en
   * base. L'abonnement n'est activé qu'après confirmation du prestataire ET contrôle du montant.
   *
   * @param notifyToken Jeton de notification transmis par le prestataire
   * @returns La transaction telle qu'établie après vérification
   */
  async settleNotification(notifyToken: string): Promise<any> {
    const transaction: any = await this.getOne({ notifyToken });

    if (!transaction) {
      LoggerService.log({
        type: LogLevel.Warn,
        content: `Notification de paiement rejetée : notifyToken inconnu`,
        location: this.serviceLabel,
        method: 'settleNotification'
      });
      return { found: false };
    }

    // Idempotence : Orange Money peut rejouer une notification déjà traitée.
    if (transaction.paymentStatus === 'success') {
      return { found: true, transaction, alreadySettled: true };
    }

    // Source de vérité : le prestataire, interrogé avec les valeurs de la base.
    const response = await this.paymentHelper.checkTransactionStatus({
      orderId: String(transaction._id),
      amount: transaction.amount,
      payToken: transaction.paymentToken
    });

    const providerStatus: string = (response?.status ?? '').toUpperCase();

    // Contrôle du montant : bloque l'activation sur un sous-paiement.
    if (providerStatus === 'SUCCESS' && response?.amount !== undefined) {
      if (Number(response.amount) !== Number(transaction.amount)) {
        LoggerService.log({
          type: LogLevel.Error,
          content: `Notification rejetée pour la transaction ${transaction._id} : montant divergent ` +
            `(prestataire ${response.amount} / attendu ${transaction.amount})`,
          location: this.serviceLabel,
          method: 'settleNotification'
        });
        return { found: true, transaction, amountMismatch: true };
      }
    }

    if (!providerStatus) {
      LoggerService.log({
        type: LogLevel.Error,
        content: `Statut prestataire illisible pour la transaction ${transaction._id}`,
        location: this.serviceLabel,
        method: 'settleNotification'
      });
      return { found: true, transaction, unreadableStatus: true };
    }

    const settled = await this.updateTransactionStatus(
      String(transaction._id),
      providerStatus.toLowerCase()
    );

    return { found: true, transaction: settled, providerStatus };
  }

  /**
   * Valide qu'un utilisateur n'a pas d'abonnement actif
   * @param userId ID de l'utilisateur
   * @returns Résultat de la validation
   */
  private async validateUserSubscription(userId: string): Promise<Result<void>> {
    try {
      const activeSubscription = await this.subscriptionService.checkActiveSubscription(userId);
      if (activeSubscription.hasActiveSubscription) {
        return {
          success: false,
          error: new Error(locale.controller.transaction.active_subscription_error),
          message: locale.controller.transaction.active_subscription_error
        };
      }
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de la validation de l\'abonnement'
      };
    }
  }

  /**
   * Archive les transactions existantes non terminées
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @returns Résultat de l'archivage
   */
  private async archiveExistingTransactions(userId: string, planId: string): Promise<Result<void>> {
    try {
      const existingTransactions: any = await this.dao.select({
        params: {
          user: userId,
          plan: planId,
          status: 'active',
          paymentStatus: { $in: ['pending', 'failed', 'expired', 'cancelled'] }
        }
      });

      if (existingTransactions.rows && existingTransactions.rows.length > 0) {
        console.log(`Archivage de ${existingTransactions.rows.length} transaction(s) non terminée(s)`);
        
        for (const transaction of existingTransactions.rows) {
          try {
            const updateResult = await this.dao.update({ _id: transaction._id }, {
              status: 'archived',
              paymentStatus: 'cancelled'
            });
            
            if (updateResult && typeof updateResult === 'object' && 'error' in updateResult) {
              console.error(`Erreur lors de l'archivage de la transaction ${transaction._id}:`, (updateResult as any).error);
            } else {
              console.log(`Transaction ${transaction._id} archivée avec succès`);
            }
          } catch (archiveError) {
            console.error(`Erreur lors de l'archivage de la transaction ${transaction._id}:`, archiveError);
          }
        }
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de l\'archivage des transactions'
      };
    }
  }

  /**
   * Valide et récupère les informations du plan
   * @param planId ID du plan
   * @returns Plan validé ou erreur
   */
  private async validateAndGetPlan(planId: string): Promise<Result<any>> {
    try {
      const plan: any = await this.planDao.selectOne({ _id: planId });
      if (!plan) {
        return {
          success: false,
          error: new Error(`Plan avec l'ID ${planId} non trouvé`),
          message: `Plan avec l'ID ${planId} non trouvé`
        };
      }
      return { success: true, data: plan };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de la récupération du plan'
      };
    }
  }

  /**
   * Génère un ID de transaction avec fallback
   * @returns ID de transaction généré
   */
  private generateTransactionId(): Result<string> {
    try {
      let transactionId = coddyger.string.generateObjectId();
      
      if (!transactionId) {
        transactionId = new Date().getTime().toString() + Math.random().toString(36).substr(2, 9);
      }
      
      if (!transactionId) {
        return {
          success: false,
          error: new Error('Impossible de générer un ID de transaction'),
          message: 'Impossible de générer un ID de transaction'
        };
      }
      
      return { success: true, data: transactionId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de la génération de l\'ID'
      };
    }
  }

  /**
   * Crée l'objet transaction
   * @param transactionId ID de la transaction
   * @param userId ID de l'utilisateur
   * @param plan Informations du plan
   * @param isScheduledRenewal Indique si c'est un renouvellement programmé
   * @param currentSubscriptionId ID de l'abonnement actuel
   * @returns Objet transaction
   */
  private createTransactionObject(transactionId: string, userId: string, plan: any, isScheduledRenewal?: boolean, currentSubscriptionId?: string): ITransaction {
    const transaction: ITransaction = {
      _id: transactionId,
      user: userId,
      plan: plan._id,
      amount: plan.price,
      currency: plan.currency,
      status: 'active',
      paymentMethod: 'orange-money',
      paymentStatus: 'pending',
      paymentDate: new Date(),
      paymentId: transactionId.toString(),
      paymentUrl: '',
      isScheduledRenewal: isScheduledRenewal || false,
      currentSubscriptionId: currentSubscriptionId
    };

    return transaction;
  }

  /**
   * Traite l'initiation du paiement
   * @param transaction Objet transaction
   * @param plan Informations du plan
   * @returns Transaction mise à jour avec les détails de paiement
   */
  private async processPaymentInitiation(transaction: ITransaction, plan: any): Promise<Result<ITransaction>> {
    try {
      const paymentDetails: any = await this.initiatePayment({
        orderId: transaction._id!.toString(),
        amount: plan.price,
        reference: transaction._id!.toString(),
      });

      if (!paymentDetails || !paymentDetails.payment_url) {
        console.error('Réponse de paiement invalide:', paymentDetails);
        return {
          success: false,
          error: new Error('Impossible d\'initier le paiement'),
          message: 'Impossible d\'initier le paiement'
        };
      }
      
      transaction.paymentUrl = paymentDetails.payment_url;
      transaction.paymentToken = paymentDetails.pay_token;
      transaction.notifyToken = paymentDetails.notif_token;
      transaction.paymentMethod = 'orange-money';
      
      return { success: true, data: transaction };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de l\'initiation du paiement'
      };
    }
  }

  /**
   * Crée une transaction pour l'achat d'un plan
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @param isScheduledRenewal Indique si c'est un renouvellement programmé
   * @param currentSubscriptionId ID de l'abonnement actuel (pour les renouvellements)
   * @returns Transaction créée
   */
  async createPlanTransaction(userId: string, planId: string, isScheduledRenewal?: boolean, currentSubscriptionId?: string): Promise<any> {
    try {
      // Étape 1: Valider l'abonnement utilisateur (sauf pour les renouvellements programmés)
      if (!isScheduledRenewal) {
        const subscriptionValidation = await this.validateUserSubscription(userId);
        if (!subscriptionValidation.success) {
          return subscriptionValidation;
        }
      } else {
        // Pour les renouvellements programmés, vérifier que l'abonnement actuel existe
        if (!currentSubscriptionId) {
          return {
            success: false,
            error: new Error('ID d\'abonnement actuel requis pour le renouvellement programmé'),
            message: 'ID d\'abonnement actuel requis pour le renouvellement programmé'
          };
        }
        
        // Vérifier que l'abonnement actuel appartient à l'utilisateur
        const currentSubscription = await this.subscriptionService.getCurrentSubscriptionWithPlanDetails(userId);
        
        if (!currentSubscription || currentSubscription._id.toString() !== currentSubscriptionId) {
          return {
            success: false,
            error: new Error('Abonnement actuel non trouvé ou non valide'),
            message: 'Abonnement actuel non trouvé ou non valide'
          };
        }
      }

      // Étape 2: Archiver les transactions existantes (sauf pour les renouvellements programmés)
      if (!isScheduledRenewal) {
        const archiveResult = await this.archiveExistingTransactions(userId, planId);
        if (!archiveResult.success) {
          return archiveResult;
        }
      }
      
      // Étape 3: Valider et récupérer le plan
      const planResult = await this.validateAndGetPlan(planId);
      if (!planResult.success) {
        return planResult;
      }
      const plan = planResult.data;
      
      // Étape 4: Générer l'ID de transaction
      const transactionIdResult = this.generateTransactionId();
      if (!transactionIdResult.success) {
        return transactionIdResult;
      }
      const transactionId = transactionIdResult.data;
      
      // Étape 5: Créer l'objet transaction
      const transaction = this.createTransactionObject(transactionId, userId, plan, isScheduledRenewal, currentSubscriptionId);

      // Étape 5bis: Plan gratuit (prix <= 0) — aucun paiement à initier.
      // On marque la transaction comme réglée et on crée directement l'abonnement.
      if (!plan.price || Number(plan.price) <= 0) {
        transaction.paymentMethod = 'free';
        transaction.paymentStatus = 'success';
        transaction.status = 'active';
        transaction.paymentUrl = 'free'; // champ requis, ne peut pas être vide
        await this.create(transaction);

        if (!isScheduledRenewal) {
          await this.subscriptionService.createSubscription(userId, plan._id ?? planId);
        }

        const savedFree = await this.dao.selectOne({ _id: transactionId });
        return {
          success: true,
          data: { ...savedFree, isFree: true, isExistingTransaction: false }
        };
      }

      // Étape 6: Traiter l'initiation du paiement
      const paymentResult = await this.processPaymentInitiation(transaction, plan);
      if (!paymentResult.success) {
        return paymentResult;
      }
      const updatedTransaction = paymentResult.data;
      
      // Étape 7: Sauvegarder la transaction
      await this.create(updatedTransaction);
      const savedTransaction = await this.dao.selectOne({ _id: transactionId });
      
      return {
        success: true,
        data: { ...savedTransaction, isExistingTransaction: false }
      };
    } catch (error) {
      console.log(error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      return { success: false, error: errorObj };
    }
  }

  /**
   * Met à jour le statut d'une transaction après notification de paiement
   * @param transactionId ID de la transaction
   * @param paymentStatus Statut du paiement
   * @returns Transaction mise à jour
   */
  async updateTransactionStatus(transactionId: string, paymentStatus: string): Promise<ITransaction | null> {
    try {
      console.log('updateTransactionStatus', transactionId, paymentStatus);
      // Récupérer la transaction
      const transaction = await this.getOne({_id: transactionId});
      
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} non trouvée`);
      }
      
      // Mettre à jour le statut
      const updatedTransaction = await this.update(transactionId, {
        paymentStatus,
        paymentDate: new Date()
      });

      if(paymentStatus === 'success') {
        // Vérifier si c'est un renouvellement programmé
        if (transaction.isScheduledRenewal && transaction.currentSubscriptionId) {
          // Programmer le renouvellement au lieu de créer un nouvel abonnement
          try {
            const result = await this.subscriptionService.scheduleEarlyRenewal(
              transaction.currentSubscriptionId,
              transaction.plan,
              {
                paymentMethod: transaction.paymentMethod,
                transactionId: transactionId,
                metadata: {
                  paymentTransactionId: transactionId,
                  scheduledFrom: 'payment-success',
                  scheduledAt: new Date().toISOString()
                }
              }
            );
            
            if (result.success) {
              LoggerService.log({
                type: LogLevel.Info,
                content: `Renouvellement programmé avec succès pour la transaction ${transactionId}`,
                location: this.serviceLabel,
                method: 'updateTransactionStatus'
              });
            } else {
              LoggerService.log({
                type: LogLevel.Error,
                content: `Erreur lors de la programmation du renouvellement: ${result.message}`,
                location: this.serviceLabel,
                method: 'updateTransactionStatus'
              });
              // En cas d'erreur, créer un abonnement normal comme fallback
              await this.subscriptionService.createSubscription(transaction.user, transaction.plan);
            }
          } catch (error) {
            LoggerService.log({
              type: LogLevel.Error,
              content: `Exception lors de la programmation du renouvellement pour la transaction ${transactionId}: ${error}`,
              location: this.serviceLabel,
              method: 'updateTransactionStatus'
            });
            // En cas d'erreur, créer un abonnement normal comme fallback
            await this.subscriptionService.createSubscription(transaction.user, transaction.plan);
          }
        } else {
          // Créer un nouvel abonnement (comportement normal)
          await this.subscriptionService.createSubscription(transaction.user, transaction.plan);
        }
      } 
      
      return updatedTransaction;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Récupère l'historique des transactions d'un utilisateur
   * @param userId ID de l'utilisateur
   * @param page Page
   * @param pageSize Taille de la page
   * @returns Liste des transactions
   */
  async getUserTransactions(userId: string, page: number = 1, pageSize: number = 10): Promise<any> {
    try {
      const data = await this.dao.select({
        params: { user: userId, status: { $nin: ['removed', 'archived'] } },
        page,
        pageSize,
        sort: { paymentDate: -1 }
      });
      
      if (data && 'error' in data) {
        throw data;
      }
      
      const rows = data && 'rows' in data ? data.rows : [];
      const result = { ...data };
      if (result && 'rows' in result) {
        delete result.rows;
      }
      
      return {
        data: result,
        rows
      };
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'getUserTransactions' 
      });
      throw error;
    }
  }

  /**
   * Récupère les transactions réussies pour un plan spécifique
   * @param planId ID du plan
   * @returns Liste des transactions
   */
  async getSuccessfulTransactionsByPlan(planId: string): Promise<ITransaction[]> {
    try {
      const result = await this.dao.selectHug({
        plan: planId,
        paymentStatus: 'success',
        status: { $nin: ['removed', 'archived'] }
      });
      
      return Array.isArray(result) ? result : [];
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'getSuccessfulTransactionsByPlan' 
      });
      throw error;
    }
  }

  /**
   * Normalise un statut de paiement brut (valeurs prestataire hétérogènes) vers une valeur canonique.
   */
  private normalizePaymentStatus(value?: string): 'success' | 'pending' | 'failed' | 'refunded' | 'expired' | 'cancelled' | 'initiated' {
    const normalized = String(value || '').trim().toLowerCase();

    if (['success', 'succeeded', 'completed', 'paid', 'accepted'].includes(normalized)) return 'success';
    if (['failed', 'fail', 'refused', 'rejected', 'error'].includes(normalized)) return 'failed';
    if (['refunded', 'refund'].includes(normalized)) return 'refunded';
    if (['expired', 'timeout'].includes(normalized)) return 'expired';
    if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
    if (['initiated', 'initialised', 'initialized'].includes(normalized)) return 'initiated';

    return 'pending';
  }

  /**
   * Construit le filtre Mongo commun aux widgets (statut de paiement, plage de dates sur
   * createdAt, recherche sur le client / les identifiants de paiement).
   */
  private async buildTransactionMatch(filters?: { paymentStatus?: string; from?: string; to?: string; query?: string }): Promise<any> {
    const params: any = { status: { $nin: ['removed', 'archived'] } };

    const paymentStatus = filters?.paymentStatus ?? '';
    const from = filters?.from ?? '';
    const to = filters?.to ?? '';
    const query = filters?.query ?? '';

    if (!coddyger.string.isEmpty(paymentStatus)) {
      params.paymentStatus = paymentStatus;
    }

    if (!coddyger.string.isEmpty(from) || !coddyger.string.isEmpty(to)) {
      params.createdAt = {};

      if (!coddyger.string.isEmpty(from)) {
        params.createdAt.$gte = new Date(from);
      }

      if (!coddyger.string.isEmpty(to)) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        params.createdAt.$lte = end;
      }
    }

    if (!coddyger.string.isEmpty(query)) {
      const rx = { $regex: query, $options: 'i' };
      let clientIds: any[] = [];

      try {
        const clients: any = await new ClientSet().selectHug({
          $or: [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }]
        });

        if (Array.isArray(clients)) {
          clientIds = clients.map((c: any) => c._id);
        }
      } catch (searchError) {
        clientIds = [];
      }

      params.$or = [{ user: { $in: clientIds } }, { paymentId: rx }, { txnId: rx }];
    }

    return params;
  }

  /**
   * Calcule les compteurs à partir d'un lot de transactions déjà chargées.
   */
  private summarizeTransactions(transactions: ITransaction[]): {
    totalTransactions: number;
    successfulTransactions: number;
    pendingTransactions: number;
    failedTransactions: number;
    totalAmount: number;
  } {
    const normalizedStatuses = transactions.map(t => this.normalizePaymentStatus(t.paymentStatus));
    const successfulTransactions = normalizedStatuses.filter(status => status === 'success').length;
    const pendingTransactions = normalizedStatuses.filter(status => status === 'pending' || status === 'initiated').length;
    const failedTransactions = normalizedStatuses.filter(status => status === 'failed').length;

    const totalAmount = transactions
      .filter(t => this.normalizePaymentStatus(t.paymentStatus) === 'success')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return {
      totalTransactions: transactions.length,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
      totalAmount
    };
  }

  /**
   * Variation en pourcentage entre une valeur courante et une valeur précédente.
   * Renvoie null quand il n'existe pas de base de comparaison (période précédente vide).
   */
  private percentChange(current: number, previous: number): number | null {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }

    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  /**
   * Récupère les statistiques des transactions, avec tendances période-sur-période
   * lorsqu'une plage de dates explicite est fournie.
   * @returns Statistiques des transactions
   */
  async getTransactionStats(filters?: { paymentStatus?: string; from?: string; to?: string; query?: string }): Promise<any> {
    try {
      // La methode count n'est pas disponible sur toutes les versions du DAO coddyger.
      // On calcule les compteurs a partir des lignes brutes pour eviter les 500.
      const params = await this.buildTransactionMatch(filters);
      const rows = await this.dao.selectHug(params);
      const transactions: ITransaction[] = Array.isArray(rows) ? rows : [];

      const current = this.summarizeTransactions(transactions);

      // Tendances période-sur-période : compare la plage courante à la plage équivalente
      // qui la précède immédiatement. Calculé uniquement si `from` et `to` sont fournis.
      let trends: any = null;
      const from = filters?.from ?? '';
      const to = filters?.to ?? '';

      if (!coddyger.string.isEmpty(from) && !coddyger.string.isEmpty(to)) {
        const startDate = new Date(from);
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);

        const rangeMs = endDate.getTime() - startDate.getTime();
        const prevEnd = new Date(startDate.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - rangeMs);

        const prevParams = await this.buildTransactionMatch({
          paymentStatus: filters?.paymentStatus,
          query: filters?.query,
          from: prevStart.toISOString(),
          to: prevEnd.toISOString()
        });

        const prevRows = await this.dao.selectHug(prevParams);
        const previous = this.summarizeTransactions(Array.isArray(prevRows) ? prevRows : []);

        const successRate = current.totalTransactions > 0 ? (current.successfulTransactions / current.totalTransactions) * 100 : 0;
        const prevSuccessRate = previous.totalTransactions > 0 ? (previous.successfulTransactions / previous.totalTransactions) * 100 : 0;

        trends = {
          totalTransactions: this.percentChange(current.totalTransactions, previous.totalTransactions),
          totalAmount: this.percentChange(current.totalAmount, previous.totalAmount),
          successRate: Math.round((successRate - prevSuccessRate) * 10) / 10
        };
      }

      return { ...current, trends };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error || 'Erreur inconnue',
        location: this.serviceLabel,
        method: 'getTransactionStats'
      });
      throw error;
    }
  }

  /**
   * Série temporelle des transactions pour le graphe d'évolution du dashboard admin.
   * Regroupe par jour ou par mois selon l'étendue de la plage (auto au-delà de 92 jours).
   * @returns { interval, series: [{ period, total, successful, failed, pending, amount }] }
   */
  async getTransactionTimeseries(filters?: {
    paymentStatus?: string;
    from?: string;
    to?: string;
    query?: string;
    interval?: 'day' | 'month';
  }): Promise<any> {
    try {
      const params = await this.buildTransactionMatch(filters);
      const rows = await this.dao.selectHug(params);
      const transactions: ITransaction[] = Array.isArray(rows) ? rows : [];

      const from = filters?.from ? new Date(filters.from) : null;
      const to = filters?.to ? new Date(filters.to) : null;
      let interval: 'day' | 'month' = filters?.interval ?? 'day';

      if (!filters?.interval && from && to) {
        const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
        interval = days > 92 ? 'month' : 'day';
      }

      const keyOf = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');

        return interval === 'month' ? `${y}-${m}` : `${y}-${m}-${day}`;
      };

      const buckets = new Map<string, { period: string; total: number; successful: number; failed: number; pending: number; amount: number }>();

      // Pré-remplit les buckets vides sur la plage pour un axe continu côté graphe.
      if (from && to) {
        const cursor = new Date(from);
        cursor.setHours(0, 0, 0, 0);

        while (cursor.getTime() <= to.getTime()) {
          const k = keyOf(cursor);

          if (!buckets.has(k)) {
            buckets.set(k, { period: k, total: 0, successful: 0, failed: 0, pending: 0, amount: 0 });
          }

          if (interval === 'month') {
            cursor.setMonth(cursor.getMonth() + 1);
          } else {
            cursor.setDate(cursor.getDate() + 1);
          }
        }
      }

      for (const t of transactions) {
        const raw = (t as any).createdAt ?? t.paymentDate;

        if (!raw) continue;

        const k = keyOf(new Date(raw));
        const bucket = buckets.get(k) ?? { period: k, total: 0, successful: 0, failed: 0, pending: 0, amount: 0 };
        const status = this.normalizePaymentStatus(t.paymentStatus);

        bucket.total += 1;

        if (status === 'success') {
          bucket.successful += 1;
          bucket.amount += Number(t.amount) || 0;
        } else if (status === 'failed') {
          bucket.failed += 1;
        } else if (status === 'pending' || status === 'initiated') {
          bucket.pending += 1;
        }

        buckets.set(k, bucket);
      }

      const series = Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));

      return { interval, series };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error || 'Erreur inconnue',
        location: this.serviceLabel,
        method: 'getTransactionTimeseries'
      });
      throw error;
    }
  }

  /**
   * Vérifie si une transaction est existante (créée il y a plus d'une minute)
   * @param transactionId ID de la transaction
   * @returns true si la transaction existe depuis plus d'une minute
   */
  async isExistingTransaction(transactionId: string): Promise<boolean> {
    try {
      // Récupérer la transaction
      const transaction:any = await this.dao.exist({ _id: transactionId });
      
      if (!transaction) {
        return false;
      }
      
      // Si la transaction a été créée il y a plus d'une minute, c'est une transaction existante
      return true;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'isExistingTransaction' 
      });
      return false;
    }
  }

  /**
   * Récupère les transactions de renouvellement programmé pour un abonnement
   * @param userId ID de l'utilisateur
   * @param subscriptionId ID de l'abonnement
   * @returns Transactions de renouvellement programmé
   */
  async getScheduledRenewalTransactions(userId: string, subscriptionId: string) {
    try {
      const transactions = await this.dao.select({
        user: userId,
        currentSubscriptionId: subscriptionId,
        isScheduledRenewal: true,
        status: 'active',
        paymentStatus: { $in: ['pending', 'success'] }
      });

      return transactions || [];
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: `Erreur lors de la récupération des transactions de renouvellement programmé: ${error}`,
        location: this.serviceLabel,
        method: 'getScheduledRenewalTransactions'
      });
      return [];
    }
  }
}
