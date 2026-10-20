import crypto from 'crypto';
import { ITransaction } from './transaction.interface';
import { TransactionSet } from './transaction.model';
import { PlanSet } from '../plan';
import { ClientSet } from '../client';
import coddyger, { IData, IErrorObject, LogLevel } from 'coddyger';
import { logEvent } from '../../config/logger';
import { SubscriptionService } from '../subscription';
import { locale } from '../../public/locale/locale';
import { PaymentHelper } from '../../helpers/payment.helper';
import { WaveHelper } from '../../helpers/wave.helper';

/** Prestataires de paiement proposés au client. Orange Money reste le défaut historique. */
export const PAYMENT_PROVIDERS = ['orange-money', 'wave'] as const;
export type PaymentProvider = typeof PAYMENT_PROVIDERS[number];
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = 'orange-money';

const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  'orange-money': 'Orange Money',
  wave: 'Wave'
};

// Type pour le retour de la fonction
type ErrorResult = {
  success: false;
  error: Error;
  message: string;
  // TODO DIAGNOSTIC TEMPORAIRE - à retirer : détail non sensible du motif d'échec (étape + réponse OM nettoyée)
  debug?: any;
};

/**
 * TODO DIAGNOSTIC TEMPORAIRE - à retirer
 * Nettoie le corps de réponse Orange Money pour n'en garder que des champs non sensibles
 * (code/message/description/...). Ne JAMAIS laisser passer de clés/tokens/credentials.
 */
function sanitizeOmBody(body: any): any {
  if (body == null) return null;
  if (typeof body === 'string') return body.slice(0, 500);
  if (typeof body !== 'object') return body;
  // `error_code` / `error_message` : forme des erreurs Wave.
  const allowed = ['code', 'message', 'description', 'error', 'error_description', 'error_code', 'error_message', 'status', 'statusCode', 'detail', 'title'];
  const out: any = {};
  for (const key of allowed) {
    if (body[key] !== undefined && typeof body[key] !== 'object') out[key] = body[key];
  }
  // Repli : si rien d'autorisé n'a été trouvé, on expose uniquement les clés présentes (pas les valeurs) pour situer la forme.
  if (Object.keys(out).length === 0) out._keys = Object.keys(body).slice(0, 20);
  return out;
}

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
  private readonly waveHelper: WaveHelper;

  constructor() {
    this.dao = new TransactionSet();
    // [DETTE] Client axios CinetPay retiré : jamais utilisé, prestataire abandonné au profit
    // d'Orange Money (cf. PaymentHelper).
    this.planDao = new PlanSet();
    this.subscriptionService = new SubscriptionService();
    this.paymentHelper = new PaymentHelper();
    this.waveHelper = new WaveHelper();
  }

  /**
   * Prestataires réellement utilisables sur cet environnement. Les applications s'en servent
   * pour n'afficher que les moyens de paiement disponibles.
   * @returns Liste des prestataires configurés
   */
  static availableProviders(): PaymentProvider[] {
    return PAYMENT_PROVIDERS.filter((provider: PaymentProvider) =>
      provider === 'wave' ? WaveHelper.isConfigured() : true
    );
  }

  /**
   * Refuse un prestataire inconnu ou non configuré, avant toute écriture.
   * @param provider Prestataire demandé
   * @returns Un échec métier, ou null si le prestataire est utilisable
   */
  private rejectUnavailableProvider(provider: PaymentProvider): ErrorResult & { status: number } | null {
    if (TransactionService.availableProviders().includes(provider)) {
      return null;
    }

    const message = `Le paiement par ${PROVIDER_LABELS[provider] ?? provider} n'est pas disponible pour le moment.`;
    return { success: false, status: 400, error: new Error(message), message };
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
		paymentMethod?: string;
		from?: string;
		to?: string;
	}): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';
			let paymentStatus: any = payloads.paymentStatus ?? '';
			let paymentMethod: any = payloads.paymentMethod ?? '';
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

			// Prestataire (Orange Money / Wave). Valeur déjà bornée par l'enum de la route.
			if (!coddyger.string.isEmpty(paymentMethod)) {
				params.paymentMethod = String(paymentMethod);
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
				logEvent({
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
      logEvent({ 
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
      logEvent({ 
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
      logEvent({ 
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
      logEvent({ 
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
      logEvent({ 
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
      logEvent({ 
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
      logEvent({ 
        type: LogLevel.Error, 
        content: error || 'Erreur inconnue', 
        location: this.serviceLabel, 
        method: 'initiatePaymentWithHelper' 
      });
      throw error;
    }
  }

  /**
   * Construit l'URL de retour navigateur transmise à Orange Money.
   *
   * `return_url` et `cancel_url` pointent sur la même route : seul le paramètre `cancel`
   * les distingue, ce qui permet d'afficher le bon message sans dupliquer la page.
   *
   * @param returnToken Jeton aléatoire identifiant la transaction
   * @param cancelled Vrai pour l'URL d'annulation
   * @returns L'URL absolue à transmettre au prestataire
   */
  private buildReturnUrl(returnToken: string, cancelled: boolean): string {
    const base = (process.env.OM_RETURN_URL ?? '').trim().replace(/\/+$/, '');
    const separator = base.includes('?') ? '&' : '?';
    const suffix = cancelled ? '&cancel=1' : '';

    return `${base}${separator}t=${encodeURIComponent(returnToken)}${suffix}`;
  }

  /**
   * Vérifie le statut d'un paiement
   * @param transactionId ID de la transaction
   * @returns Statut du paiement
   */
  async checkPaymentStatus(payloads: { id: string, amount: number, payToken: string }): Promise<any> {
    try {
      // Wave : on passe par le chemin commun de règlement (idempotent, contrôle du montant, de
      // la devise et de la référence). Orange Money conserve son chemin historique ci-dessous.
      const current: any = await this.dao.selectOne({ _id: payloads.id });

      if (current?.paymentMethod === 'wave') {
        await this.settleTransaction(current, 'checkPaymentStatus');

        const settled: any = await this.dao.selectOne({ _id: payloads.id });
        return {
          ...settled,
          isPaid: settled?.paymentStatus === 'success',
        };
      }

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
      logEvent({
        type: LogLevel.Warn,
        content: `Notification de paiement rejetée : notifyToken inconnu`,
        location: this.serviceLabel,
        method: 'settleNotification'
      });
      return { found: false };
    }

    return this.settleTransaction(transaction, 'settleNotification');
  }

  /**
   * [SÉCURITÉ F-01] Résout le statut réel d'une transaction auprès d'Orange Money et l'applique.
   *
   * Cœur partagé par le webhook (`settleNotification`) et par la page de retour navigateur
   * (`settleByReturnToken`) : quel que soit le déclencheur, le statut vient du prestataire,
   * jamais de l'appelant, et le montant est contrôlé avant toute activation d'abonnement.
   *
   * @param transaction Transaction déjà résolue en base
   * @param method Nom de la méthode appelante, pour la journalisation
   * @returns La transaction telle qu'établie après vérification
   */
  private async settleTransaction(transaction: any, method: string): Promise<any> {
    // Idempotence : Orange Money peut rejouer une notification déjà traitée, et la page de
    // retour peut être rechargée autant de fois que l'utilisateur le souhaite.
    if (transaction.paymentStatus === 'success') {
      return { found: true, transaction, alreadySettled: true };
    }

    if (transaction.paymentMethod === 'wave') {
      return this.settleWaveTransaction(transaction, method);
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
        logEvent({
          type: LogLevel.Error,
          content: `Règlement rejeté pour la transaction ${transaction._id} : montant divergent ` +
            `(prestataire ${response.amount} / attendu ${transaction.amount})`,
          location: this.serviceLabel,
          method
        });
        return { found: true, transaction, amountMismatch: true };
      }
    }

    if (!providerStatus) {
      logEvent({
        type: LogLevel.Error,
        content: `Statut prestataire illisible pour la transaction ${transaction._id}`,
        location: this.serviceLabel,
        method
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
   * Variante Wave de `settleTransaction` : le statut est lu sur la session de paiement Wave,
   * retrouvée par l'identifiant stocké en base (`paymentToken`), jamais par une valeur reçue.
   *
   * Contrôles avant activation : la session doit porter NOTRE référence de transaction, et le
   * montant comme la devise réglés doivent correspondre à ceux de la base.
   *
   * @param transaction Transaction Wave déjà résolue en base
   * @param method Nom de la méthode appelante, pour la journalisation
   * @returns La transaction telle qu'établie après vérification
   */
  private async settleWaveTransaction(transaction: any, method: string): Promise<any> {
    if (!transaction.paymentToken) {
      logEvent({
        type: LogLevel.Error,
        content: `Transaction Wave ${transaction._id} sans identifiant de session`,
        location: this.serviceLabel,
        method
      });
      return { found: true, transaction, unreadableStatus: true };
    }

    const session: any = await this.waveHelper.getCheckoutSession(String(transaction.paymentToken));

    // Trace systématique de l'état lu chez Wave : seul moyen de diagnostiquer un échec côté
    // Wave (« Le paiement a échoué »), dont le motif n'est visible que dans `last_payment_error`.
    const paymentError = session?.last_payment_error;
    logEvent({
      type: paymentError ? LogLevel.Warn : LogLevel.Info,
      content: `Session Wave ${session?.id ?? transaction.paymentToken} (transaction ${transaction._id}) : ` +
        `checkout_status=${session?.checkout_status}, payment_status=${session?.payment_status}` +
        (paymentError ? `, erreur=${paymentError.code ?? '?'} — ${paymentError.message ?? ''}` : ''),
      location: this.serviceLabel,
      method
    });

    if (String(session?.client_reference ?? '') !== String(transaction._id)) {
      logEvent({
        type: LogLevel.Error,
        content: `Règlement Wave rejeté pour la transaction ${transaction._id} : référence de session divergente`,
        location: this.serviceLabel,
        method
      });
      return { found: true, transaction, referenceMismatch: true };
    }

    const providerStatus = WaveHelper.toPaymentStatus(session);

    if (providerStatus === 'success') {
      const sameAmount = Number(session.amount) === Number(transaction.amount);
      const sameCurrency = String(session.currency ?? '').toUpperCase() === String(transaction.currency ?? '').toUpperCase();

      if (!sameAmount || !sameCurrency) {
        logEvent({
          type: LogLevel.Error,
          content: `Règlement Wave rejeté pour la transaction ${transaction._id} : montant divergent ` +
            `(prestataire ${session.amount} ${session.currency} / attendu ${transaction.amount} ${transaction.currency})`,
          location: this.serviceLabel,
          method
        });
        return { found: true, transaction, amountMismatch: true };
      }

      // Référence Wave du paiement (visible dans l'app Wave du client) : utile au support et
      // à la recherche admin, qui porte déjà sur `txnId`.
      if (session.transaction_id) {
        await this.update(String(transaction._id), { txnId: String(session.transaction_id) });
      }
    }

    // Session encore ouverte : rien de tranché, on ne touche pas à la transaction. Un échec de
    // paiement (`payment_status: cancelled`) peut encore être suivi d'un succès dans la session.
    if (providerStatus === 'pending') {
      return { found: true, transaction, providerStatus };
    }

    const settled = await this.updateTransactionStatus(String(transaction._id), providerStatus);

    return { found: true, transaction: settled, providerStatus };
  }

  /**
   * Traite un événement webhook Wave dont la signature a déjà été vérifiée en amont.
   *
   * Même en signé, le contenu de l'événement n'est qu'un déclencheur : seul l'identifiant de
   * session sert, à retrouver la transaction, dont le statut est ensuite relu chez Wave.
   * Wave peut livrer un événement en double ou dans le désordre : `settleTransaction` est
   * idempotent et ne dépend pas de l'ordre d'arrivée.
   *
   * @param event Événement Wave (`{ id, type, data }`)
   * @returns `{ ignored }` pour un événement hors périmètre, sinon le résultat du règlement
   */
  async settleWaveEvent(event: any): Promise<any> {
    const type = String(event?.type ?? '');
    const sessionId = event?.data?.id;

    if (!type.startsWith('checkout.session.') || !sessionId) {
      return { ignored: true, type };
    }

    const transaction: any = await this.getOne({ paymentMethod: 'wave', paymentToken: String(sessionId) });

    if (!transaction) {
      logEvent({
        type: LogLevel.Warn,
        content: `Événement Wave ${event?.id ?? ''} ignoré : session ${sessionId} inconnue`,
        location: this.serviceLabel,
        method: 'settleWaveEvent'
      });
      return { found: false };
    }

    return this.settleTransaction(transaction, 'settleWaveEvent');
  }

  /**
   * Résout une transaction depuis le jeton porté par `return_url` / `cancel_url`.
   *
   * La redirection navigateur n'est qu'un signal d'affichage : elle ne prouve rien, et
   * l'utilisateur peut ne jamais y revenir. Elle sert donc de filet au webhook — si la
   * notification serveur a été perdue, ce chemin établit quand même le statut réel.
   *
   * @param returnToken Jeton aléatoire transmis dans l'URL de retour
   * @returns La transaction telle qu'établie après vérification
   */
  async settleByReturnToken(returnToken: string): Promise<any> {
    const transaction: any = await this.getOne({ returnToken });

    if (!transaction) {
      logEvent({
        type: LogLevel.Warn,
        content: `Retour de paiement ignoré : returnToken inconnu`,
        location: this.serviceLabel,
        method: 'settleByReturnToken'
      });
      return { found: false };
    }

    return this.settleTransaction(transaction, 'settleByReturnToken');
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
  private async archiveExistingTransactions(userId: string, planId: string): Promise<Result<{ settledCount: number }>> {
    try {
      const existingTransactions: any = await this.dao.select({
        params: {
          user: userId,
          plan: planId,
          status: 'active',
          paymentStatus: { $in: ['pending', 'failed', 'expired', 'cancelled'] }
        }
      });

      // Sessions Wave réglées entre-temps : réglées au lieu d'être archivées.
      let settledCount = 0;

      if (existingTransactions.rows && existingTransactions.rows.length > 0) {
        console.log(`Archivage de ${existingTransactions.rows.length} transaction(s) non terminée(s)`);

        for (const transaction of existingTransactions.rows) {
          // Wave : une session reste payable jusqu'à son expiration. On l'expire avant d'archiver
          // la transaction, sans quoi le client pourrait encore régler un paiement que plus rien
          // n'attend. Wave répond 409 si la session est déjà terminée : elle a pu être payée
          // juste avant, on la règle alors au lieu de l'annuler.
          if (transaction.paymentMethod === 'wave' && transaction.paymentStatus === 'pending' && transaction.paymentToken) {
            try {
              await this.waveHelper.expireCheckoutSession(String(transaction.paymentToken));
            } catch (expireError: any) {
              if (expireError?.status === 409) {
                const settlement: any = await this.settleTransaction(transaction, 'archiveExistingTransactions');
                if (settlement?.transaction?.paymentStatus === 'success') {
                  settledCount += 1;
                  continue;
                }
              } else {
                logEvent({
                  type: LogLevel.Warn,
                  content: `Session Wave ${transaction.paymentToken} non expirée (status=${expireError?.status ?? 'n/a'})`,
                  location: this.serviceLabel,
                  method: 'archiveExistingTransactions'
                });
              }
            }
          }

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

      return { success: true, data: { settledCount } };
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
   * @param paymentMethod Prestataire choisi par le client
   * @returns Objet transaction
   */
  private createTransactionObject(transactionId: string, userId: string, plan: any, isScheduledRenewal?: boolean, currentSubscriptionId?: string, paymentMethod: PaymentProvider = DEFAULT_PAYMENT_PROVIDER): ITransaction {
    const transaction: ITransaction = {
      _id: transactionId,
      user: userId,
      plan: plan._id,
      amount: plan.price,
      // Wave impose une devise ISO réelle (XOF) ; la devise du plan peut valoir `OUV` en recette OM.
      currency: paymentMethod === 'wave' ? WaveHelper.currency() : plan.currency,
      status: 'active',
      paymentMethod,
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
      // Orange Money ne renvoie aucun identifiant sur `return_url` : c'est à nous de le
      // transporter dans l'URL. On y met un jeton aléatoire plutôt que l'`_id` de la
      // transaction, qui est partiellement devinable (horodatage + compteur d'ObjectId).
      const returnToken = crypto.randomBytes(16).toString('hex');
      transaction.returnToken = returnToken;

      // Wave : session de paiement. `success_url` / `error_url` réutilisent la page de retour
      // commune ; la session est retrouvée ensuite par son identifiant, stocké dans `paymentToken`.
      if (transaction.paymentMethod === 'wave') {
        const session: any = await this.waveHelper.createCheckoutSession({
          amount: plan.price,
          currency: transaction.currency,
          clientReference: transaction._id!.toString(),
          successUrl: this.buildReturnUrl(returnToken, false),
          errorUrl: this.buildReturnUrl(returnToken, true),
        });

        if (!session?.id || !session?.wave_launch_url) {
          console.error('Réponse de paiement Wave invalide:', session);
          return {
            success: false,
            error: new Error('Impossible d\'initier le paiement'),
            message: 'Impossible d\'initier le paiement',
            debug: {
              stage: 'wave_initiate',
              reason: 'no_launch_url',
              orderId: transaction?._id?.toString(),
              amount: plan?.price,
              omBody: sanitizeOmBody(session)
            }
          };
        }

        logEvent({
          type: LogLevel.Info,
          content: `Session Wave ${session.id} créée pour la transaction ${transaction._id} ` +
            `(${session.amount} ${session.currency}, expire ${session.when_expires ?? '?'})`,
          location: this.serviceLabel,
          method: 'processPaymentInitiation'
        });

        transaction.paymentUrl = session.wave_launch_url;
        transaction.paymentToken = session.id;

        return { success: true, data: transaction };
      }

      const paymentDetails: any = await this.initiatePayment({
        orderId: transaction._id!.toString(),
        amount: plan.price,
        reference: transaction._id!.toString(),
        returnUrl: this.buildReturnUrl(returnToken, false),
        cancelUrl: this.buildReturnUrl(returnToken, true),
      });

      if (!paymentDetails || !paymentDetails.payment_url) {
        console.error('Réponse de paiement invalide:', paymentDetails);
        return {
          success: false,
          error: new Error('Impossible d\'initier le paiement'),
          message: 'Impossible d\'initier le paiement',
          // TODO DIAGNOSTIC TEMPORAIRE - à retirer
          debug: {
            stage: 'om_initiate',
            reason: 'no_payment_url',
            orderId: transaction?._id?.toString(),
            amount: plan?.price,
            omBody: sanitizeOmBody(paymentDetails)
          }
        };
      }
      
      transaction.paymentUrl = paymentDetails.payment_url;
      transaction.paymentToken = paymentDetails.pay_token;
      transaction.notifyToken = paymentDetails.notif_token;
      transaction.paymentMethod = 'orange-money';
      
      return { success: true, data: transaction };
    } catch (error: any) {
      // Le vrai motif de refus Orange Money (corps de réponse + code HTTP, remonté par
      // PaymentHelper) était jusqu'ici avalé et remplacé par un message générique, rendant le
      // diagnostic impossible. On le journalise explicitement ici.
      const omDetail = error?.data ?? error?.message ?? error;
      const providerLabel = PROVIDER_LABELS[transaction?.paymentMethod as PaymentProvider] ?? 'Orange Money';
      logEvent({
        type: LogLevel.Error,
        content: `Échec de l'initiation du paiement ${providerLabel} (orderId=${transaction?._id}, amount=${plan?.price}, status=${error?.status ?? 'n/a'}): ${typeof omDetail === 'object' ? JSON.stringify(omDetail) : omDetail}`,
        location: this.serviceLabel,
        method: 'processPaymentInitiation'
      });
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message: 'Erreur lors de l\'initiation du paiement',
        // TODO DIAGNOSTIC TEMPORAIRE - à retirer : étape + statut HTTP OM + corps OM nettoyé (sans secrets)
        debug: {
          stage: error?.step || 'om_payment',
          omStatus: error?.status ?? null,
          omBody: sanitizeOmBody(error?.data ?? error?.message ?? null),
          orderId: transaction?._id?.toString(),
          amount: plan?.price
        }
      };
    }
  }

  /**
   * Crée une transaction pour l'achat d'un plan
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @param isScheduledRenewal Indique si c'est un renouvellement programmé
   * @param currentSubscriptionId ID de l'abonnement actuel (pour les renouvellements)
   * @param paymentMethod Prestataire choisi par le client (Orange Money par défaut, pour les
   *   versions des applications qui ne transmettent pas encore ce choix)
   * @returns Transaction créée
   */
  async createPlanTransaction(userId: string, planId: string, isScheduledRenewal?: boolean, currentSubscriptionId?: string, paymentMethod: PaymentProvider = DEFAULT_PAYMENT_PROVIDER): Promise<any> {
    try {
      const unavailable = this.rejectUnavailableProvider(paymentMethod);
      if (unavailable) {
        return unavailable;
      }

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
            message: 'ID d\'abonnement actuel requis pour le renouvellement programmé'
          };
        }

        // Vérifier que l'abonnement fourni existe et appartient à l'utilisateur.
        // On interroge DIRECTEMENT l'abonnement par son id (getById) plutôt que de passer par
        // getCurrentSubscriptionWithPlanDetails : cette dernière n'accepte que l'abonnement
        // `active` non expiré, peuple le plan et avale toute erreur interne en `null` — ce qui
        // faisait échouer (puis planter en 500) un renouvellement pourtant légitime. Ici, seule la
        // propriété compte : l'abonnement existe et est bien celui de l'utilisateur.
        const currentSubscription: any = await this.subscriptionService.getById(currentSubscriptionId);
        const ownerId = currentSubscription?.userId?._id ?? currentSubscription?.userId;

        if (!currentSubscription || String(ownerId) !== String(userId)) {
          return {
            success: false,
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

        // Un paiement Wave précédent vient d'aboutir pendant l'archivage : l'abonnement est
        // désormais actif, on n'en fait pas payer un second.
        if (archiveResult.data.settledCount > 0) {
          const revalidation = await this.validateUserSubscription(userId);
          if (!revalidation.success) {
            return revalidation;
          }
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
      const transaction = this.createTransactionObject(transactionId, userId, plan, isScheduledRenewal, currentSubscriptionId, paymentMethod);

      // Étape 5bis: Plan gratuit (prix <= 0) — aucun paiement à initier.
      // On marque la transaction comme réglée et on crée directement l'abonnement.
      if (!plan.price || Number(plan.price) <= 0) {
        transaction.paymentMethod = 'free';
        transaction.paymentStatus = 'success';
        transaction.status = 'active';
        transaction.paymentUrl = 'free'; // champ requis, ne peut pas être vide
        await this.create(transaction);

        if (isScheduledRenewal && currentSubscriptionId) {
          // Renouvellement programmé d'un plan GRATUIT : aucune passerelle de paiement à appeler.
          // On programme directement le renouvellement (pendingRenewal), comme le ferait le retour
          // de paiement pour un plan payant.
          await this.subscriptionService.scheduleEarlyRenewal(
            currentSubscriptionId,
            (plan._id ?? planId).toString(),
            {
              paymentMethod: 'free',
              transactionId,
              metadata: { scheduledFrom: 'free-scheduled', scheduledAt: new Date().toISOString() }
            }
          );
        } else if (!isScheduledRenewal) {
          await this.subscriptionService.createSubscription(userId, plan._id ?? planId);
        }

        const savedFree = await this.dao.selectOne({ _id: transactionId });
        return {
          success: true,
          data: { ...savedFree, isFree: true, isScheduled: !!isScheduledRenewal, isExistingTransaction: false }
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
   * [MISE EN AVANT] Crée une transaction de sponsorisation de boutique (flux marchand self-service).
   *
   * Réutilise intégralement l'infrastructure de paiement des abonnements : même prestataire
   * (Orange Money via PaymentHelper), mêmes `return_url` / `cancel_url` / `notif_url` globaux,
   * donc mêmes routes de retour (`/transactions/payment-return`) et de notification
   * (`/transactions/payment-notify`), qui re-vérifient le statut auprès du prestataire avant toute
   * activation. L'activation (mise en avant) est branchée dans `updateTransactionStatus` via `kind`.
   *
   * SÉCURITÉ : le montant n'est JAMAIS lu du client. Le prix et la durée proviennent de la formule
   * (base). L'appartenance de la boutique au marchand est contrôlée en amont (sponsor-checkout).
   *
   * @param merchantId Marchand connecté (devient `user` de la transaction, pour le contrôle de propriété)
   * @param boutiqueId Boutique à mettre en avant
   * @param formula Formule de mise en avant (module sponsor-plan) déjà résolue en base
   * @param paymentMethod Prestataire choisi par le marchand
   * @returns { success, data } avec l'URL de paiement, ou { success:false, message }
   */
  async createSponsorTransaction(merchantId: string, boutiqueId: string, formula: any, paymentMethod: PaymentProvider = DEFAULT_PAYMENT_PROVIDER): Promise<any> {
    try {
      const unavailable = this.rejectUnavailableProvider(paymentMethod);
      if (unavailable) {
        return unavailable;
      }

      const price = Number(formula?.price) > 0 ? Number(formula.price) : 0;
      const currency = paymentMethod === 'wave' ? WaveHelper.currency() : (process.env.OM_CURRENCY || 'OUV');

      const transactionIdResult = this.generateTransactionId();
      if (!transactionIdResult.success) {
        return transactionIdResult;
      }
      const transactionId = transactionIdResult.data;

      const transaction: ITransaction = {
        _id: transactionId,
        user: merchantId,
        amount: price,
        currency,
        status: 'active',
        paymentMethod,
        paymentStatus: 'pending',
        paymentDate: new Date(),
        paymentId: transactionId.toString(),
        paymentUrl: '',
        kind: 'boutique-sponsor',
        boutiqueId: String(boutiqueId),
        sponsorPlanId: String(formula._id)
      };

      // Formule gratuite (prix <= 0) : aucun paiement à initier, on active directement.
      if (price <= 0) {
        transaction.paymentMethod = 'free';
        transaction.paymentStatus = 'success';
        transaction.paymentUrl = 'free'; // champ requis, ne peut pas être vide
        await this.create(transaction);
        await this.activateBoutiqueSponsor(transaction, transactionId);

        const savedFree = await this.dao.selectOne({ _id: transactionId });
        return { success: true, data: { ...savedFree, isFree: true } };
      }

      // Paiement payant : on réutilise l'initiation Orange Money des abonnements
      // (jeton de retour aléatoire, return/cancel url, pay_token, notif_token).
      const paymentResult = await this.processPaymentInitiation(transaction, { price });
      if (!paymentResult.success) {
        return paymentResult;
      }

      await this.create(paymentResult.data);
      const saved = await this.dao.selectOne({ _id: transactionId });
      return { success: true, data: saved };
    } catch (error: any) {
      console.log(error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        // TODO DIAGNOSTIC TEMPORAIRE - à retirer
        debug: {
          stage: 'db_create',
          reason: error?.message || String(error)
        }
      };
    }
  }

  /**
   * [MISE EN AVANT MULTI — YO Boost] Crée UNE transaction pour N boutiques, avec UN SEUL paiement.
   *
   * Même infrastructure de paiement que `createSponsorTransaction` (Orange Money des abonnements) :
   * le montant total = `formula.price × boutiqueIds.length`, stocké sur la transaction. L'activation
   * (sur TOUTES les boutiques) est déclenchée par le canal paiement→activation partagé via `kind`.
   *
   * SÉCURITÉ : le montant n'est JAMAIS lu du client ; le prix provient de la formule (base).
   * L'appartenance de CHAQUE boutique au marchand est contrôlée en amont (sponsor-checkout).
   *
   * @param merchantId Marchand connecté (devient `user` de la transaction)
   * @param boutiqueIds Boutiques à mettre en avant (au moins une)
   * @param formula Formule de mise en avant déjà résolue en base
   * @param paymentMethod Prestataire choisi par le marchand
   */
  async createSponsorTransactionMulti(merchantId: string, boutiqueIds: string[], formula: any, paymentMethod: PaymentProvider = DEFAULT_PAYMENT_PROVIDER): Promise<any> {
    try {
      const ids = Array.isArray(boutiqueIds) ? boutiqueIds.map(String) : [];
      if (ids.length === 0) {
        return { success: false, status: 400, message: 'Aucune boutique à mettre en avant.' };
      }

      const unavailable = this.rejectUnavailableProvider(paymentMethod);
      if (unavailable) {
        return unavailable;
      }

      const unitPrice = Number(formula?.price) > 0 ? Number(formula.price) : 0;
      const price = unitPrice * ids.length; // montant TOTAL = prix unitaire × N boutiques
      const currency = paymentMethod === 'wave' ? WaveHelper.currency() : (process.env.OM_CURRENCY || 'OUV');

      const transactionIdResult = this.generateTransactionId();
      if (!transactionIdResult.success) {
        return transactionIdResult;
      }
      const transactionId = transactionIdResult.data;

      const transaction: ITransaction = {
        _id: transactionId,
        user: merchantId,
        amount: price,
        currency,
        status: 'active',
        paymentMethod,
        paymentStatus: 'pending',
        paymentDate: new Date(),
        paymentId: transactionId.toString(),
        paymentUrl: '',
        kind: 'boutique-sponsor',
        boutiqueIds: ids,
        // Rétrocompat : on renseigne aussi boutiqueId avec la 1ère boutique (lecture par anciens outils).
        boutiqueId: ids[0],
        sponsorPlanId: String(formula._id)
      };

      // Formule gratuite (prix <= 0) : aucun paiement à initier, on active directement les N boutiques.
      if (price <= 0) {
        transaction.paymentMethod = 'free';
        transaction.paymentStatus = 'success';
        transaction.paymentUrl = 'free';
        await this.create(transaction);
        await this.activateBoutiqueSponsor(transaction, transactionId);

        const savedFree = await this.dao.selectOne({ _id: transactionId });
        return { success: true, data: { ...savedFree, isFree: true } };
      }

      // Paiement payant : initiation Orange Money partagée (montant total).
      const paymentResult = await this.processPaymentInitiation(transaction, { price });
      if (!paymentResult.success) {
        return paymentResult;
      }

      await this.create(paymentResult.data);
      const saved = await this.dao.selectOne({ _id: transactionId });
      return { success: true, data: saved };
    } catch (error: any) {
      console.log(error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        debug: { stage: 'db_create', reason: error?.message || String(error) }
      };
    }
  }

  /**
   * [MISE EN AVANT] Active la mise en avant des boutiques d'une transaction réglée.
   *
   * Généralisé pour le flux MULTI (YO Boost) : boucle sur `transaction.boutiqueIds` (repli sur
   * `boutiqueId` si ancien format mono) et appelle `BoutiqueSponsorService.sponsor` pour chacune.
   *
   * RÉ-ENTRANT / IDEMPOTENT par boutique : une boutique déjà sponsorisée activement n'est pas
   * ré-activée (on vérifie via `activeForBoutique`). Un ré-appel (rejeu de notification) n'active
   * donc que les manquantes. En fin de traitement, on vérifie que les N boutiques sont bien
   * `isSponsored` ; on re-tente / journalise les éventuels échecs. Les erreurs ne sont pas
   * propagées (la transaction est payée ; ne pas renvoyer d'échec au prestataire).
   *
   * @param transaction Transaction de sponsorisation (porte boutiqueIds / boutiqueId / sponsorPlanId / user)
   * @param transactionId ID de la transaction
   */
  private async activateBoutiqueSponsor(transaction: any, transactionId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BoutiqueSponsorService } = require('../boutique-sponsor/boutique-sponsor.service');
    const sponsorService = new BoutiqueSponsorService();

    // Liste des boutiques : flux MULTI prioritaire, repli mono pour l'ancien format.
    let ids: string[] = Array.isArray(transaction.boutiqueIds) && transaction.boutiqueIds.length
      ? transaction.boutiqueIds.map(String)
      : (transaction.boutiqueId ? [String(transaction.boutiqueId)] : []);
    // Dédoublonnage défensif (une même boutique ne doit être activée qu'une fois).
    ids = [...new Set(ids)];

    const sponsorPlanId = transaction.sponsorPlanId ? String(transaction.sponsorPlanId) : undefined;
    const userId = String(transaction.user);

    for (const boutiqueId of ids) {
      try {
        // Idempotence par boutique : ne pas ré-activer une mise en avant déjà active.
        const active = await sponsorService.activeForBoutique(boutiqueId);
        if (active) {
          continue;
        }
        await sponsorService.sponsor(boutiqueId, userId, sponsorPlanId);
        logEvent({
          type: LogLevel.Info,
          content: `Mise en avant activée pour la boutique ${boutiqueId} (transaction ${transactionId})`,
          location: this.serviceLabel,
          method: 'activateBoutiqueSponsor'
        });
      } catch (error) {
        logEvent({
          type: LogLevel.Error,
          content: `Échec d'activation de la mise en avant pour la boutique ${boutiqueId} (transaction ${transactionId}): ${error}`,
          location: this.serviceLabel,
          method: 'activateBoutiqueSponsor'
        });
      }
    }

    // Vérification finale : toutes les boutiques doivent être sponsorisées activement ; re-tente sinon.
    for (const boutiqueId of ids) {
      try {
        const active = await sponsorService.activeForBoutique(boutiqueId);
        if (!active) {
          logEvent({
            type: LogLevel.Error,
            content: `Boutique ${boutiqueId} non sponsorisée après activation (transaction ${transactionId}) — nouvelle tentative`,
            location: this.serviceLabel,
            method: 'activateBoutiqueSponsor'
          });
          await sponsorService.sponsor(boutiqueId, userId, sponsorPlanId);
        }
      } catch (error) {
        logEvent({
          type: LogLevel.Error,
          content: `Échec de la re-tentative d'activation pour la boutique ${boutiqueId} (transaction ${transactionId}): ${error}`,
          location: this.serviceLabel,
          method: 'activateBoutiqueSponsor'
        });
      }
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
        // [MISE EN AVANT] Transaction de sponsorisation boutique (flux marchand self-service).
        // On ne crée PAS d'abonnement client : on active la mise en avant de la boutique.
        // Idempotence : n'activer que si la transaction n'était pas DÉJÀ réglée (statut lu avant
        // mise à jour) — un rejeu de notification / retour navigateur ne double-active donc pas.
        if (transaction.kind === 'boutique-sponsor') {
          if (transaction.paymentStatus !== 'success') {
            await this.activateBoutiqueSponsor(transaction, transactionId);
          }
          return updatedTransaction;
        }

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
              logEvent({
                type: LogLevel.Info,
                content: `Renouvellement programmé avec succès pour la transaction ${transactionId}`,
                location: this.serviceLabel,
                method: 'updateTransactionStatus'
              });
            } else {
              logEvent({
                type: LogLevel.Error,
                content: `Erreur lors de la programmation du renouvellement: ${result.message}`,
                location: this.serviceLabel,
                method: 'updateTransactionStatus'
              });
              // En cas d'erreur, créer un abonnement normal comme fallback
              await this.subscriptionService.createSubscription(transaction.user, transaction.plan);
            }
          } catch (error) {
            logEvent({
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
      logEvent({ 
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
      logEvent({ 
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
  private async buildTransactionMatch(filters?: { paymentStatus?: string; paymentMethod?: string; from?: string; to?: string; query?: string }): Promise<any> {
    const params: any = { status: { $nin: ['removed', 'archived'] } };

    if (!coddyger.string.isEmpty(filters?.paymentMethod ?? '')) {
      params.paymentMethod = String(filters!.paymentMethod);
    }

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
  async getTransactionStats(filters?: { paymentStatus?: string; paymentMethod?: string; from?: string; to?: string; query?: string }): Promise<any> {
    try {
      // La methode count n'est pas disponible sur toutes les versions du DAO coddyger.
      // On calcule les compteurs a partir des lignes brutes pour eviter les 500.
      const params = await this.buildTransactionMatch(filters);
      const rows = await this.dao.selectHug(params);
      const transactions: ITransaction[] = Array.isArray(rows) ? rows : [];

      const current = this.summarizeTransactions(transactions);

      // Ventilation par prestataire (Orange Money, Wave, gratuit…) pour le back-office.
      const byPaymentMethod: Record<string, any> = {};
      const groups = new Map<string, ITransaction[]>();
      for (const t of transactions) {
        const key = t.paymentMethod || 'inconnu';
        groups.set(key, [...(groups.get(key) ?? []), t]);
      }
      groups.forEach((list, key) => {
        byPaymentMethod[key] = this.summarizeTransactions(list);
      });

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
          paymentMethod: filters?.paymentMethod,
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

      return { ...current, byPaymentMethod, trends };
    } catch (error) {
      logEvent({
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
      logEvent({
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
      logEvent({ 
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
      logEvent({
        type: LogLevel.Error,
        content: `Erreur lors de la récupération des transactions de renouvellement programmé: ${error}`,
        location: this.serviceLabel,
        method: 'getScheduledRenewalTransactions'
      });
      return [];
    }
  }
}
