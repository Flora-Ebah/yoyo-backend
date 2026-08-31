import { locale } from '../../public/locale/locale';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';
import { IPayment } from './payment.interface';
import { PaymentSet } from './payment.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { SubscriptionService } from '../subscription/subscription.service';
import { PartnerService } from '../partner/partner.service';
import { ClientService } from '../client/client.service';
import { ClientSet } from '../client';
import { PartnerSet } from '../partner';

export class PaymentService {
  private readonly dao: IData<IPayment>;
  private readonly serviceLabel = 'PaymentService';
  private readonly pushNotificationService: PushNotificationService;
  private readonly subscriptionService: SubscriptionService;
  private readonly partnerService: PartnerService;
  private readonly clientService: ClientService;

  constructor() {
    this.dao = new PaymentSet();
    this.pushNotificationService = new PushNotificationService();
    this.subscriptionService = new SubscriptionService();
    this.partnerService = new PartnerService();
    this.clientService = new ClientService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
	async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; from?: string; to?: string }): Promise<any> {
		try {
			let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';
			let from: string = payloads.from ?? '';
			let to: string = payloads.to ?? '';

			let data: any | IErrorObject = {};

			// Filtres combinés : statut de paiement + plage de dates (createdAt).
			const params: any = {};

			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
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

				// Recherche élargie : par nom/email/contact du client (from) et par nom du
				// partenaire (to), en plus du motif de refus.
				let clientIds: any[] = [];
				let partnerIds: any[] = [];

				try {
					const clients: any = await new ClientSet().selectHug({
						$or: [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }]
					});

					if (Array.isArray(clients)) {
						clientIds = clients.map((c: any) => c._id);
					}

					const partners: any = await new PartnerSet().selectHug({ name: rx });

					if (Array.isArray(partners)) {
						partnerIds = partners.map((p: any) => p._id);
					}
				} catch (searchError) {
					clientIds = [];
					partnerIds = [];
				}

				params.$or = [
					{ from: { $in: clientIds } },
					{ to: { $in: partnerIds } },
					{ deniedReason: rx }
				];
			}

			data = await this.dao.select({ params, page, pageSize });

			if (data.error) {
				throw data;
			}

			const rows: IPayment[] = data.rows;
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
	 * Statistiques agrégées des paiements partenaires (admin), avec les mêmes filtres
	 * que la liste (statut, plage de dates, recherche client/partenaire).
	 */
	async getOverviewStats(filters?: { status?: string; from?: string; to?: string; query?: string }): Promise<any> {
		try {
			const status = filters?.status ?? '';
			const from = filters?.from ?? '';
			const to = filters?.to ?? '';
			const query = filters?.query ?? '';

			const params: any = { status: { $nin: ['removed', 'archived'] } };

			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
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
				let partnerIds: any[] = [];

				try {
					const clients: any = await new ClientSet().selectHug({
						$or: [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }]
					});

					if (Array.isArray(clients)) {
						clientIds = clients.map((c: any) => c._id);
					}

					const partners: any = await new PartnerSet().selectHug({ name: rx });

					if (Array.isArray(partners)) {
						partnerIds = partners.map((p: any) => p._id);
					}
				} catch (searchError) {
					clientIds = [];
					partnerIds = [];
				}

				params.$or = [{ from: { $in: clientIds } }, { to: { $in: partnerIds } }, { deniedReason: rx }];
			}

			const rows: any = await this.dao.selectHug(params);
			const payments: any[] = Array.isArray(rows) ? rows : [];

			const successCount = payments.filter(p => p.status === 'success').length;
			const pendingCount = payments.filter(p => p.status === 'pending').length;
			const failedCount = payments.filter(p => p.status === 'failed' || p.status === 'rejected').length;
			const refundedCount = payments.filter(p => p.status === 'refunded').length;

			const totalAmount = payments
				.filter(p => p.status === 'success')
				.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

			return {
				totalPayments: payments.length,
				successCount,
				pendingCount,
				failedCount,
				refundedCount,
				totalAmount
			};
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Top partenaires par volume de paiements réussis (widget « Top professionnels » du dashboard).
	 * @returns Liste triée [{ partnerId, name, volume, amount }]
	 */
	async getTopPartners(filters?: { from?: string; to?: string; status?: string; limit?: number; certified?: string }): Promise<any> {
		try {
			const from = filters?.from ?? '';
			const to = filters?.to ?? '';
			const status = filters?.status ?? 'success';
			const limit = Number(filters?.limit) > 0 ? Number(filters?.limit) : 5;
			const certified = (filters?.certified ?? '').toLowerCase();

			const params: any = { status: { $nin: ['removed', 'archived'] } };

			// Par défaut on ne compte que les paiements réellement encaissés (success).
			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
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

			// Filtre « Pro : certifiés / non certifiés » basé sur le KYC du propriétaire.
			if (certified === 'certified' || certified === 'uncertified') {
				const clientFilter =
					certified === 'certified'
						? { isDocumentVerified: true }
						: { $or: [{ isDocumentVerified: { $ne: true } }, { isDocumentVerified: { $exists: false } }] };

				const clients: any = await new ClientSet().selectHug(clientFilter);
				const clientIds = Array.isArray(clients) ? clients.map((c: any) => c._id) : [];
				const partners: any = await new PartnerSet().selectHug({ user: { $in: clientIds } });
				const partnerIds = Array.isArray(partners) ? partners.map((p: any) => p._id) : [];

				params.to = { $in: partnerIds };
			}

			const rows: any = await this.dao.selectHug(params);
			const payments: any[] = Array.isArray(rows) ? rows : [];

			// `to` est populé par PaymentSet.selectHug ({ _id, name }).
			const grouped = new Map<string, { partnerId: string; name: string; volume: number; amount: number }>();

			for (const p of payments) {
				const partner: any = p.to;

				if (!partner) continue;

				const partnerId = String(partner._id ?? partner);
				const name = partner.name ?? 'Partenaire';
				const entry = grouped.get(partnerId) ?? { partnerId, name, volume: 0, amount: 0 };

				entry.volume += 1;
				entry.amount += Number(p.amount) || 0;
				grouped.set(partnerId, entry);
			}

			return Array.from(grouped.values())
				.sort((a, b) => b.volume - a.volume || b.amount - a.amount)
				.slice(0, limit);
		} catch (error) {
			return { error: true, data: error };
		}
	}

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getHug(params?: any): Promise<IPayment[] | IErrorObject> {
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
  async create(item: IPayment): Promise<any> {
    try {
      const { from, to } = item;

      if(!coddyger.string.isValidObjectId(from) || !coddyger.string.isValidObjectId(to)) {
        return { error: true, message: locale.wrongObjectId("du client") };
      }

      if(from === to) {
        return { error: true, message: locale.controller.payment.sameClient };
      }

      const subscription:any = await this.subscriptionService.getCurrentSubscriptionWithPlanDetails(from);
      if(!subscription) {
        return { error: true, message: locale.controller.payment.noSubscription };
      }

      const hasPendingPayment:any = await this.dao.selectOne({ from, to, status: "pending" });

      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      // Le discountPercentage est dans planId selon getCurrentSubscriptionWithPlanDetails
      item.discountPercentage = subscription.planId?.discountPercentage ?? 0;

      let result:any;
      if(hasPendingPayment) {
        await this.dao.remove({ _id: hasPendingPayment._id });
        result = await this.dao.save(item);
      } else {
        result = await this.dao.save(item);
      }

      if(result.error) {
        throw new Error(result);
      }

      const partner: any = await this.partnerService.getById(to);
      if(!partner) {
        return { error: true, message: locale.notfound("Partenaire") };
      }

      // Envoyer une notification à tous les clients connectés
      const pushNotification = await this.pushNotificationService.create({
				title: 'Demande de paiement',
				body:
					'Une nouvelle demande de paiement a été initiée par ' +
					subscription.userId.lastname +
					' ' +
					subscription.userId.firstname.split(' ')[0],
				type: 'info',
				priority: 'high',
				data: {
					userId: partner.user._id,
          demand: item._id,
          boutiqueId: to,
					url: `/payment/${item._id}`
				},
				target: Events.PUSH_DEMANDE,
				status: 'pending'
			} as IPushNotification);

      if (pushNotification.error) {
        console.log(pushNotification);
        throw new Error(pushNotification);
      }

      return await this.getOne({ _id: item._id });
    } catch (error) {
      return { error: true, message: error };
    }
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  async update(id: string, item: Partial<IPayment>): Promise<IPayment | IErrorObject> {
    try {
      if(!coddyger.string.isValidObjectId(id)) {
        return { error: true, data: locale.wrongObjectId("du paiement") };
      }

      const getPayment:any = await this.dao.selectOne({ _id: id });
      if(!getPayment) {
        return { error: true, data: locale.notfound('Demande de paiement') };
      }

      const subscription:any = await this.subscriptionService.getCurrentSubscriptionWithPlanDetails(getPayment.from);
      if(!subscription) {
        return { error: true, data: locale.controller.payment.noSubscription };
      }

      const result:any = await this.dao.update({ _id: id }, item);
      if (result.error) {
        throw new Error(result);
      }

      if (item.status === 'rejected') {
        item.deniedAt = new Date();
        item.deniedReason = 'The payment was rejected';
      }

      // Send notification
      await this.pushNotificationService.create({
				title: 'Demande de reduction',
				body: 'Votre demande de reduction chez ' + getPayment.to.name + ' a été ' + (item.status === 'rejected' ? 'rejetée' : 'acceptée'),
				type: 'info',
				priority: 'high',
				data: {
					userId: subscription.userId._id,
					subscription,
					url: `/payment/${id}`
				},
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as IPushNotification);

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
	 * Récupère le dernier élément
	 * @returns Dernier élément
	 */
	async selectLatest(): Promise<IPayment | null> {
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
	async selectLatestWithParams(params: any): Promise<IPayment | null> {
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
   * Récupère les statistiques de paiement d'un client pour un partenaire
   * @param userId ID du client
   * @param partnerId ID du partenaire
   * @returns Statistiques de paiement
   */
  async getPaymentStats(userId: string, partnerId: string): Promise<any> {
    try {
      // Vérifier si le partenaire existe
      const partner:any = await this.partnerService.getById(partnerId);
      if (!partner) {
        return { error: true, data: locale.notfound('Partner') };
      }

      // Récupérer tous les paiements du client pour ce partenaire
      const payments:any = await this.dao.select({
        params: {
          to: partnerId
        }
      });

      if (payments.error) {
        throw payments;
      }

      // Calculer les statistiques
      const stats = {
        pendingCount: 0,
        successCount: 0,
        totalDiscount: 0,
        totalRevenue: 0
      };

      // Parcourir les paiements pour calculer les statistiques
      payments.rows.forEach((payment: any) => {
        // Compter les paiements en attente
        if (payment.status === 'pending') {
          stats.pendingCount++;
        }

        // Compter les paiements réussis et calculer les revenus
        if (payment.status === 'success') {
          stats.successCount++;
          
          // Calculer la réduction si applicable
          if (payment.discountPercentage) {
            const discountAmount = (payment.amount * payment.discountPercentage) / 100;
            stats.totalDiscount += discountAmount;
          }

          // Ajouter le montant au revenu total
          stats.totalRevenue += payment.amount;
        }
      });

      return {
        data: stats,
        rows: payments.rows
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère le dernier paiement en attente d'un partenaire
   * @param partnerId ID du partenaire
   * @returns Dernier paiement
   */
  async getLastPayment(partnerId: string): Promise<any> {
    try {
      // Vérifier si le partenaire existe
      const partner:any = await this.partnerService.getById(partnerId);
      if (!partner) {
        return { error: true, data: locale.notfound('Partner') };
      }

      // Récupérer le dernier paiement pour ce partenaire
      const lastPayment:any = await this.dao.selectLatestWithParams({
        to: partnerId,
        status: 'pending'
      });

      if (!lastPayment) {
        return { error: true, data: locale.notfound('Payment') };
      }

      lastPayment.from = await this.clientService.getOne({ _id: lastPayment.from });

      return {
        data: lastPayment,
        rows: [lastPayment]
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les transactions d'un partenaire
   * @param partnerId ID du partenaire
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  async getPartnerTransactions(partnerId: string, payloads: { page?: number; pageSize?: number; status?: string }): Promise<any> {
    try {
      // Vérifier si le partenaire existe
      const partner:any = await this.partnerService.getById(partnerId);
      if (!partner) {
        return { error: true, data: locale.notfound('Partner') };
      }

      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let status: string = payloads.status ?? '';

      // Construire la requête
      let query: any = {
        to: partnerId,
        status: { $nin: ['removed', 'archived'] }
      };

      // Ajouter le filtre par statut si spécifié
      if (status) {
        query.status = status;
      }

      // Récupérer les transactions
      const transactions:any = await this.dao.select({
        params: query,
        page,
        pageSize,
      });

      if (transactions.error) {
        throw transactions;
      }

      // Enrichir les transactions avec les informations du client
      const enrichedTransactions = await Promise.all(transactions.rows.map(async (transaction: any) => {
        const client = await this.partnerService.getById(transaction.from);
        return {
          ...transaction,
          client: client ? {
            _id: client._id,
            name: client.name,
            email: client.email
          } : null
        };
      }));

      return {
        data: {
          ...transactions,
          rows: undefined
        },
        rows: enrichedTransactions
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les transactions d'un client
   * @param clientId ID du client
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  async getClientTransactions(clientId: string, payloads: { page?: number; pageSize?: number; status?: string }): Promise<any> {
    try {
      // Vérifier si le client existe
      const client:any = await this.clientService.getById(clientId);
      if (!client) {
        return { error: true, data: locale.notfound('Client') };
      }

      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let status: string = payloads.status ?? '';

      // Construire la requête
      let query: any = {
        from: clientId,
        status: { $nin: ['removed', 'archived', 'cancelled'] },

      };

      // Ajouter le filtre par statut si spécifié
      if (status) {
        query.status = status;
      }

      // Récupérer les transactions
      const transactions:any = await this.dao.select({
        params: query,  
        page,
        pageSize,
      });

      if (transactions.error) {
        throw transactions;
      }

      return {
        data: transactions,
        rows: transactions.rows
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Valide un paiement
   * @param partnerId ID du partenaire
   * @param amount Montant du paiement
   * @returns Paiement validé
   */
  async validatePayment(partnerId: string, amount: number): Promise<any> {
    try {
      // Vérifier si le partenaire existe
      const partner:any = await this.partnerService.getById(partnerId);
      if (!partner) {
        return { error: true, data: locale.notfound('Partner') };
      }

      // Récupérer le dernier paiement en attente pour ce partenaire
      const lastPayment:any = await this.dao.selectLatestWithParams({
        to: partnerId,
        status: 'pending'
      });

      if (!lastPayment) {
        return { error: true, data: locale.notfound('Payment') };
      }

      // Mettre à jour le statut du paiement
      const updatedPayment:any = await this.dao.update(
        { _id: lastPayment._id },
        { 
          status: 'success',
          completedAt: new Date()
        }
      );

      if (updatedPayment.error) {
        throw updatedPayment;
      }

      // Envoyer une notification au client
      const notification:any = await this.pushNotificationService.create({
        title: "Paiement validé",
        body: "Votre paiement a été validé avec succès",
        type: "success",
        priority: "normal",
        data: {
          payload: 'payment',
          payment: lastPayment,
          url: `/payment/${lastPayment._id}`
        },
        target: lastPayment.from,
        status: "pending"
      } as IPushNotification);

      if(notification.error) {
        throw new Error(notification);
      }

      return {
        data: await this.getById(lastPayment._id),
        rows: [lastPayment]
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }
}