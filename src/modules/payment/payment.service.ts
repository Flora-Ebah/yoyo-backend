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
import { AppEvents, eventBus } from '../../events';

export class PaymentService {
  private readonly dao: IData<IPayment>;
  private readonly serviceLabel = 'PaymentService';
  private readonly pushNotificationService: PushNotificationService;
  private readonly subscriptionService: SubscriptionService;
  private readonly partnerService: PartnerService;
  private readonly clientService: ClientService;
  /** Accès direct au modèle Partner pour les lectures projetées du chemin de scan. */
  private readonly partnerDao: PartnerSet;

  constructor() {
    this.dao = new PaymentSet();
    this.pushNotificationService = new PushNotificationService();
    this.subscriptionService = new SubscriptionService();
    this.partnerService = new PartnerService();
    this.clientService = new ClientService();
    this.partnerDao = new PartnerSet();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
	async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; from?: string; to?: string; partner?: string }): Promise<any> {
		try {
			let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';
			let from: string = payloads.from ?? '';
			let to: string = payloads.to ?? '';
			let partner: string = payloads.partner ?? '';

			let data: any | IErrorObject = {};

			// Filtres combinés : statut de paiement + plage de dates (createdAt).
			const params: any = {};

			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
			}

			// Filtre par partenaire (destinataire du paiement) : fiche détail partenaire.
			if (!coddyger.string.isEmpty(partner)) {
				params.to = partner;
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
   * Crée — ou retrouve — la demande de réduction d'un client chez un partenaire.
   *
   * @param item `from` (client authentifié) et `to` (partenaire scanné)
   * @returns `{ demande, created }` — `created` distingue une création d'une réutilisation
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

      const model: any = (this.dao as any).defaultModel;
      const partnerModel: any = (this.partnerDao as any).defaultModel;

      const [subscription, partner] = await Promise.all([
        this.subscriptionService.getCurrentSubscriptionWithPlanDetails(from),
        partnerModel.findOne({ _id: to, status: { $nin: ['removed', 'archived'] } }, '_id name user').lean()
      ]);

      if(!subscription) {
        return { error: true, message: locale.controller.payment.noSubscription };
      }

      if(!partner) {
        return { error: true, message: locale.notfound("Partenaire") };
      }

      const discountPercentage: number = subscription.planId?.discountPercentage ?? 0;

      let demande: any;
      let created: boolean;

      try {
        const outcome: any = await model.findOneAndUpdate(
          { from, to, status: 'pending' },
          {
            $setOnInsert: {
              _id: item._id ?? coddyger.string.generateObjectId(),
              from,
              to,
              status: 'pending',
              discountPercentage
            }
          },
          { upsert: true, new: true, includeResultMetadata: true }
        );

        demande = outcome?.value;
        created = Boolean(outcome?.lastErrorObject?.upserted);
      } catch (error: any) {

        if (error?.code !== 11000) {
          throw error;
        }

        demande = await model.findOne({ from, to, status: 'pending' }).lean();
        created = false;
      }

      if(!demande) {
        return { error: true, message: locale.notfound('Demande de réduction') };
      }

      if (created) {
        await eventBus.publish(AppEvents.PAYMENT_INITIATED, {
          paymentId: String(demande._id),
          partnerId: String(to)
        });
      }

      return { demande, created };
    } catch (error) {
      return { error: true, message: error };
    }
  }

  /**
   * Vérifie que l'appelant est bien le propriétaire de la boutique destinataire.
   *
   * @param partnerId Boutique destinataire de la demande
   * @param actorId `request.user._id` de l'appelant
   * @returns la boutique si l'appelant en est le propriétaire, sinon un descripteur d'erreur
   */
  private async resolveOwnedPartner(partnerId: string, actorId: string): Promise<any> {
    if (!coddyger.string.isValidObjectId(partnerId)) {
      return { error: true, data: locale.wrongObjectId('du partenaire') };
    }

    if (!coddyger.string.isValidObjectId(actorId)) {
      return { error: true, forbidden: true, data: locale.controller.payment.notOwner };
    }

    const partnerModel: any = (this.partnerDao as any).defaultModel;
    const partner: any = await partnerModel
      .findOne({ _id: partnerId, status: { $nin: ['removed', 'archived'] } }, '_id name user minOrder')
      .lean();

    if (!partner) {
      return { error: true, data: locale.notfound('Partenaire') };
    }

    if (String(partner.user ?? '') !== String(actorId)) {
      return { error: true, forbidden: true, data: locale.controller.payment.notOwner };
    }

    return { partner };
  }

  /**
   * Valide le montant de facture saisi par le commerçant.
   *
   * Il n'était soumis à aucun contrôle : ni positivité, ni cohérence avec le minimum de commande
   * de la boutique. Le montant alimente les statistiques de revenus et le calcul de la remise.
   */
  private validateAmount(amount: any, partner: any): { error: true; data: string } | null {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return { error: true, data: locale.controller.payment.invalidAmount };
    }

    const minOrder = Number(partner?.minOrder ?? 0);
    if (Number.isFinite(minOrder) && minOrder > 0 && value < minOrder) {
      return { error: true, data: locale.controller.payment.belowMinOrder(minOrder) };
    }

    return null;
  }

  /**
   * Met à jour une demande de réduction : acceptation (avec montant) ou rejet par le commerçant.
   *
   * @param id ID de la demande
   * @param item Nouvelles données (`status`, `amount`, `deniedReason`)
   * @param actorId `request.user._id` de l'appelant — requis pour le contrôle de propriété
   * @returns La demande mise à jour, ou un descripteur d'erreur (`forbidden` / `conflict`)
   */
  async update(id: string, item: Partial<IPayment>, actorId?: string): Promise<IPayment | IErrorObject | any> {
    try {
      if(!coddyger.string.isValidObjectId(id)) {
        return { error: true, data: locale.wrongObjectId("du paiement") };
      }

      const getPayment:any = await this.dao.selectOne({ _id: id });
      if(!getPayment) {
        return { error: true, data: locale.notfound('Demande de paiement') };
      }

      const partnerId: string = String(getPayment.to?._id ?? getPayment.to ?? '');
      const ownership: any = await this.resolveOwnedPartner(partnerId, String(actorId ?? ''));
      if (ownership.error) {
        return ownership;
      }

      if (getPayment.status !== 'pending') {
        return { error: true, conflict: true, data: locale.controller.payment.alreadyProcessed };
      }

      const subscription:any = await this.subscriptionService.getCurrentSubscriptionWithPlanDetails(getPayment.from);
      if(!subscription) {
        return { error: true, data: locale.controller.payment.noSubscription };
      }

      if (item.status === 'rejected') {
        item.deniedAt = new Date();
        item.deniedReason = item.deniedReason ?? 'La demande de réduction a été rejetée';
      } else {
        const invalidAmount = this.validateAmount(item.amount, ownership.partner);
        if (invalidAmount) {
          return invalidAmount;
        }

        item.amount = Number(item.amount);
        item.completedAt = new Date();
      }

      const model: any = (this.dao as any).defaultModel;
      const applied: any = await model
        .findOneAndUpdate({ _id: id, status: 'pending' }, { $set: item }, { new: true })
        .lean();

      if (!applied) {
        return { error: true, conflict: true, data: locale.controller.payment.alreadyProcessed };
      }

      // Send notification
      await this.pushNotificationService.create({
				title: 'Demande de reduction',
				body: 'Votre demande de reduction chez ' + getPayment.to.name + ' a été ' + (item.status === 'rejected' ? 'rejetée' : 'acceptée'),
				type: 'info',
				priority: 'high',
				data: {
					userId: subscription.userId._id,
					demand: id,
					boutiqueId: partnerId,
					status: item.status,
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
  async validatePayment(partnerId: string, amount: number, actorId?: string): Promise<any> {
    try {
      const ownership: any = await this.resolveOwnedPartner(partnerId, String(actorId ?? ''));
      if (ownership.error) {
        return ownership;
      }

      const invalidAmount = this.validateAmount(amount, ownership.partner);
      if (invalidAmount) {
        return invalidAmount;
      }

      const model: any = (this.dao as any).defaultModel;
      const lastPayment: any = await model
        .findOneAndUpdate(
          { to: partnerId, status: 'pending' },
          { $set: { status: 'success', amount: Number(amount), completedAt: new Date() } },
          { sort: { createdAt: -1 }, new: true }
        )
        .lean();

      if (!lastPayment) {
        return { error: true, data: locale.notfound('Demande de réduction en attente') };
      }

      // Envoyer une notification au client.
      const notification:any = await this.pushNotificationService.create({
        title: "Paiement validé",
        body: "Votre paiement a été validé avec succès",
        type: "success",
        priority: "normal",
        data: {
          userId: lastPayment.from,
          demand: String(lastPayment._id),
          boutiqueId: String(partnerId),
          status: 'success',
          url: `/payment/${lastPayment._id}`
        },
        target: Events.USER_NOTIFICATION,
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