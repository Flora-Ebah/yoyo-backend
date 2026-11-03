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
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { ScanTokenHelper } from '../../helpers/scan-token.helper';
import { PartnerAccessHelper } from '../../helpers/partner-access.helper';
import { fraudAlertService } from '../fraud-alert/fraud-alert.service';

export class PaymentService {
  private readonly dao: IData<IPayment>;
  private readonly serviceLabel = 'PaymentService';
  private readonly pushNotificationService: PushNotificationService;
  private readonly subscriptionService: SubscriptionService;
  private readonly partnerService: PartnerService;
  private readonly clientService: ClientService;
  /** Accès direct au modèle Partner pour les lectures projetées du chemin de scan. */
  private readonly partnerDao: PartnerSet;
  /** Garde-fous du montant saisi par le client (`redeemLimits`, réglés au BO). */
  private readonly platformConfigService: PlatformConfigService;

  constructor() {
    this.dao = new PaymentSet();
    this.pushNotificationService = new PushNotificationService();
    this.subscriptionService = new SubscriptionService();
    this.partnerService = new PartnerService();
    this.clientService = new ClientService();
    this.partnerDao = new PartnerSet();
    this.platformConfigService = new PlatformConfigService();
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
        partnerModel.findOne({ _id: to, status: { $nin: ['removed', 'archived'] } }, '_id name user maxDiscount').lean()
      ]);

      if(!subscription) {
        return { error: true, message: locale.controller.payment.noSubscription };
      }

      if(!partner) {
        return { error: true, message: locale.notfound("Partenaire") };
      }

      // Le pourcentage appliqué est désormais celui de la BOUTIQUE (`partner.maxDiscount`),
      // plus celui du plan du client. Absent ou 0 => aucune réduction.
      const discountPercentage: number = Number(partner.maxDiscount ?? 0) || 0;

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
   * Vérifie que l'appelant est bien le propriétaire (ou un gérant actif) de la boutique destinataire.
   *
   * @param partnerId Boutique destinataire de la demande
   * @param actorId `request.user._id` de l'appelant
   * @returns la boutique si l'appelant en est le propriétaire ou le gérant, sinon un descripteur d'erreur
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

    // Le gérant actif d'une boutique a les mêmes droits que le propriétaire sur son QR et ses tickets.
    if (!PartnerAccessHelper.isOwner(partner, actorId) && !(await PartnerAccessHelper.isActiveManager(partner._id, actorId))) {
      return { error: true, forbidden: true, data: locale.controller.payment.notOwner };
    }

    return { partner };
  }

  /**
   * [SÉCURITÉ] Émet un jeton `scan` court (30 s) pour le QR affiché par l'app marchand.
   *
   * Le QR n'encode plus l'`id` de boutique en clair et statique, mais ce jeton signé qui expire en
   * 30 s : une photo du QR devient inutile passé ce délai. Le marchand connecté doit POSSÉDER la
   * boutique (sinon 403), sans quoi n'importe quel compte pourrait fabriquer des QR d'autrui.
   *
   * @param boutiqueId Boutique dont on affiche le QR
   * @param actorId `request.user._id` du marchand connecté (propriétaire attendu)
   * @returns `{ token, expiresIn }` ou un descripteur d'erreur (`forbidden` si pas propriétaire)
   */
  async issueScanToken(boutiqueId: string, actorId: string): Promise<any> {
    try {
      const ownership: any = await this.resolveOwnedPartner(boutiqueId, actorId);
      if (ownership.error) {
        return ownership;
      }

      const token = ScanTokenHelper.signScan(String(ownership.partner._id));
      return { token, expiresIn: ScanTokenHelper.SCAN_TTL_SECONDS };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * [SÉCURITÉ] Échange un jeton `scan` (scanné sur le QR marchand) contre une session `redeem`.
   *
   * C'est l'étape qui prouve le scan frais : le client présente un jeton `scan` non expiré, et reçoit
   * une session liée à SON compte et à la boutique issue du jeton (jamais d'un identifiant fourni par
   * le client). La session vaut 10 min, le temps de saisir le montant et de valider.
   *
   * @param scanToken Jeton `scan` lu dans le QR
   * @param userId `request.user._id` du client connecté
   * @returns `{ redeemSession, expiresIn, boutique }` ; `gone` si le scan a expiré, erreur sinon
   */
  async scanVerify(scanToken: string, userId: string): Promise<any> {
    try {
      if (!coddyger.string.isValidObjectId(userId)) {
        return { error: true, data: locale.wrongObjectId('du client') };
      }

      const result = ScanTokenHelper.verify(scanToken, 'scan');
      if (result.expired) {
        return { error: true, gone: true, data: locale.controller.payment.scanExpired };
      }
      if (result.invalid || !result.payload) {
        return { error: true, data: locale.controller.payment.scanInvalid };
      }

      const boutiqueId = String(result.payload.boutiqueId);
      const partnerModel: any = (this.partnerDao as any).defaultModel;
      const partner: any = await partnerModel
        .findOne({ _id: boutiqueId, status: { $nin: ['removed', 'archived'] } }, '_id name maxDiscount')
        .lean();

      if (!partner) {
        return { error: true, data: locale.notfound('Partenaire') };
      }

      const redeemSession = ScanTokenHelper.signRedeem(boutiqueId, String(userId));

      return {
        redeemSession,
        expiresIn: ScanTokenHelper.REDEEM_TTL_SECONDS,
        boutique: {
          _id: String(partner._id),
          name: partner.name,
          maxDiscount: Number(partner.maxDiscount ?? 0) || 0
        }
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Valide le montant de facture saisi par le commerçant.
   *
   * Il n'était soumis à aucun contrôle : ni positivité, ni cohérence avec le minimum de commande
   * de la boutique. Le montant alimente les statistiques de revenus et le calcul de la remise.
   */
  private validateAmount(amount: any, partner: any, maxAmount: number = 0): { error: true; data: string } | null {
    const value = Number(amount);

    if (!Number.isFinite(value) || value <= 0) {
      return { error: true, data: locale.controller.payment.invalidAmount };
    }

    const minOrder = Number(partner?.minOrder ?? 0);
    if (Number.isFinite(minOrder) && minOrder > 0 && value < minOrder) {
      return { error: true, data: locale.controller.payment.belowMinOrder(minOrder) };
    }

    // Plafond par achat : celui de la plateforme (CMS). Le marchand ne fixe plus de plafond.
    // Le client saisissant lui-même le montant, c'est la borne contre un zéro de trop ou une fraude.
    const ceiling = this.effectiveMaxAmount(maxAmount);
    if (ceiling > 0 && value > ceiling) {
      return { error: true, data: locale.controller.payment.aboveMaxOrder(ceiling) };
    }

    return null;
  }

  /**
   * Plafond par achat applicable : celui de la plateforme (0 = aucun). `partner.maxOrder` n'est plus
   * lu : le plafond marchand a été retiré (remarques testeurs Pro n°5).
   */
  private effectiveMaxAmount(platformMax: number): number {
    const fallback = Number(platformMax ?? 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  /** Minuit (heure du serveur) du jour courant : début de la fenêtre du quota journalier. */
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Indique si le montant est très au-dessus des achats habituels de la boutique : plus de 5 fois la
   * médiane de ses 50 derniers tickets validés. Ne bloque rien — le ticket est seulement signalé au
   * marchand, qui peut l'invalider. Sans historique suffisant (< 10 tickets), rien n'est signalé.
   */
  private async isUnusualAmount(to: string, amount: number): Promise<boolean> {
    try {
      const model: any = (this.dao as any).defaultModel;
      const recent: any[] = await model
        .find({ to, status: 'success' }, 'amount')
        .sort({ completedAt: -1 })
        .limit(50)
        .lean();
      const amounts = (recent ?? []).map((p: any) => Number(p.amount)).filter((n: number) => Number.isFinite(n) && n > 0);
      if (amounts.length < 10) return false;
      amounts.sort((a: number, b: number) => a - b);
      const mid = Math.floor(amounts.length / 2);
      const median = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
      return median > 0 && amount > 5 * median;
    } catch {
      return false;
    }
  }

  /**
   * Arrondit le net et calcule la réduction appliquée.
   *
   * INVARIANT SÉCURITÉ : seul `amount` (prix total) vient du client ; le net et le montant de la
   * réduction sont TOUJOURS recalculés ici à partir du pourcentage figé côté serveur.
   */
  private computeDiscount(amount: number, discountPercentage: number): { net: number; discount: number } {
    const pct = Number.isFinite(discountPercentage) ? Math.max(0, discountPercentage) : 0;
    const net = Math.round(amount * (1 - pct / 100));
    const discount = amount - net;

    return { net, discount };
  }

  /**
   * Flux client en un seul appel : le client scanne le QR (id boutique), saisit le prix total et
   * valide lui-même sa réduction. Écrit directement un ticket `success`, sans intervention du
   * marchand (qui conserve uniquement le pouvoir d'invalider a posteriori, cf. `invalidate`).
   *
   * Transaction logique atomique :
   *  1. abonnement ACTIF du client (exigence conservée) ;
   *  2. boutique existante et `from` ≠ `to` ;
   *  3. montant borné (`validateAmount` : > 0, ≥ `partner.minOrder`, ≤ plafond plateforme) ;
   *  4. pourcentage figé = `partner.maxDiscount` (0 si absent) ;
   *  5. net + réduction recalculés SERVEUR ;
   *  6. garde-fou idempotent : un ticket `success` identique (from, to, amount) de moins de ~60 s
   *     est renvoyé tel quel au lieu d'en créer un second (anti double-soumission) ;
   *  7. délai par boutique (`redeemLimits.cooldownHours`) et quota journalier (`redeemLimits.maxPerDay`) ;
   *  8. montant inhabituel pour la boutique => ticket `flagged`, signalé au marchand ;
   *  9. notification du marchand (push + socket).
   *
   * [SÉCURITÉ niveau 2] Deux modes, selon le flag `redeemLimits.requireScanToken` :
   *  - session `redeem` fournie (issue de `scan-verify`) : la boutique vient du JETON, jamais du
   *    corps ; le `userId` du jeton doit correspondre au client connecté (sinon 403), et un jeton
   *    expiré renvoie 410 (« re-scannez »). Toujours accepté, même flag OFF.
   *  - pas de session : si `requireScanToken` est ON → refus (400, scan obligatoire) ; sinon repli
   *    legacy sur `to` fourni par le client (comportement historique inchangé).
   *
   * @param from Client authentifié (issu du jeton de session, jamais du corps)
   * @param payload `{ to?, amount, redeemSession? }` — `amount` est la SEULE valeur monétaire du client
   * @returns `{ ticket }` — montant, réduction, net, boutique, date
   */
  async redeem(from: string, payload: { to?: string; amount: any; redeemSession?: string }): Promise<any> {
    try {
      const { to: toLegacy, amount, redeemSession } = payload ?? ({} as any);

      if (!coddyger.string.isValidObjectId(from)) {
        return { error: true, data: locale.wrongObjectId('du client') };
      }

      const limits = await this.platformConfigService.getRedeemLimits();

      // Boutique EFFECTIVE : issue du jeton de session quand il est présent, jamais du client.
      let effectiveTo: string;

      if (redeemSession !== undefined && redeemSession !== null && redeemSession !== '') {
        const session = ScanTokenHelper.verify(String(redeemSession), 'redeem');
        if (session.expired) {
          return { error: true, gone: true, data: locale.controller.payment.sessionExpired };
        }
        if (session.invalid || !session.payload) {
          return { error: true, data: locale.controller.payment.scanInvalid };
        }
        // La session est nominative : elle ne vaut que pour le client qui a scanné.
        if (String(session.payload.userId) !== String(from)) {
          return { error: true, forbidden: true, data: locale.controller.payment.notOwner };
        }
        effectiveTo = String(session.payload.boutiqueId);
      } else {
        // Pas de session : interdit si le scan est obligatoire, sinon repli legacy sur `to`.
        if (limits.requireScanToken) {
          return { error: true, data: locale.controller.payment.scanRequired };
        }
        if (!toLegacy || !coddyger.string.isValidObjectId(toLegacy)) {
          return { error: true, data: locale.wrongObjectId('du partenaire') };
        }
        effectiveTo = String(toLegacy);
      }

      if (String(from) === String(effectiveTo)) {
        return { error: true, data: locale.controller.payment.sameClient };
      }

      const partnerModel: any = (this.partnerDao as any).defaultModel;

      const [subscription, partner] = await Promise.all([
        this.subscriptionService.getCurrentSubscriptionWithPlanDetails(from),
        // Boutique en service uniquement : ni masquée après un refus de validation, ni suspendue (Excel CMS n°14).
        partnerModel.findOne({ _id: effectiveTo, status: 'active' }, '_id name user maxDiscount minOrder categories').lean()
      ]);

      if (!subscription) {
        return { error: true, data: locale.controller.payment.noSubscription };
      }

      if (!partner) {
        return { error: true, data: locale.notfound('Partenaire') };
      }

      // À partir d'ici, `to` désigne toujours la boutique effective (jeton ou legacy).
      const to: string = effectiveTo;

      // La commande minimale ne vaut que pour les catégories qui l'autorisent (boulangeries, supérettes).
      const minOrderApplies = Number(partner.minOrder ?? 0) > 0 && (await PartnerAccessHelper.isMinOrderEligible(partner.categories));
      const invalidAmount = this.validateAmount(amount, { ...partner, minOrder: minOrderApplies ? partner.minOrder : 0 }, limits.maxAmount);
      if (invalidAmount) {
        return invalidAmount;
      }

      const total: number = Number(amount);

      // Pourcentage de la BOUTIQUE, figé côté serveur. Absent / 0 => réduction nulle.
      const discountPercentage: number = Number(partner.maxDiscount ?? 0) || 0;
      const { net, discount } = this.computeDiscount(total, discountPercentage);

      const model: any = (this.dao as any).defaultModel;

      // Garde-fou idempotent léger : rejoue le dernier ticket success identique (from, to, amount)
      // s'il date de moins de 60 s, pour absorber une double-soumission (double tap, retry réseau)
      // sans créer deux tickets. Le rate-limit de la route reste la première barrière.
      const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
      const recent: any = await model
        .findOne({ from, to, amount: total, status: 'success', completedAt: { $gte: sixtySecondsAgo } })
        .sort({ completedAt: -1 })
        .lean();

      if (recent) {
        return { ticket: this.buildTicket(recent, partner, discount, net) };
      }

      // Délai par boutique : APRÈS le garde-fou idempotent, pour qu'un rejeu légitime (double tap,
      // retry réseau) reçoive toujours son ticket au lieu d'une erreur.
      const cooldownHours = Number(limits.cooldownHours) || 0;
      if (cooldownHours > 0) {
        const last: any = await model
          .findOne({ from, to, status: 'success', completedAt: { $gte: new Date(Date.now() - cooldownHours * 3600 * 1000) } }, 'completedAt')
          .sort({ completedAt: -1 })
          .lean();
        if (last?.completedAt) {
          const unlockAt = new Date(new Date(last.completedAt).getTime() + cooldownHours * 3600 * 1000);
          return { error: true, data: locale.controller.payment.redeemCooldown(unlockAt) };
        }
      }

      // Quota journalier, toutes boutiques confondues.
      const maxPerDay = Number(limits.maxPerDay) || 0;
      if (maxPerDay > 0) {
        const usedToday: number = await model.countDocuments({ from, status: 'success', completedAt: { $gte: this.startOfToday() } });
        if (usedToday >= maxPerDay) {
          return { error: true, data: locale.controller.payment.dailyLimitReached(maxPerDay) };
        }
      }

      const flagged = await this.isUnusualAmount(to, total);

      const _id = coddyger.string.generateObjectId();
      const completedAt = new Date();

      await model.create({
        _id,
        from,
        to,
        amount: total,
        discountPercentage,
        status: 'success',
        completedAt,
        validatedBy: 'client',
        flagged
      });

      // File d'alertes fraude du back-office (Excel CMS n°3), sans retarder le ticket.
      if (flagged) void fraudAlertService.flaggedScan({ _id, from, to, amount: total, boutiqueName: partner.name });

      // Notifie le marchand (réutilise push + socket, comme la notification de demande initiée).
      await this.pushNotificationService.create({
        title: flagged ? '⚠️ Montant inhabituel' : 'Réduction validée',
        body: flagged
          ? `Réduction validée sur un achat de ${total.toLocaleString('fr-FR')} F dans votre boutique ${partner.name}, bien au-dessus de vos montants habituels. Vérifiez-la et invalidez-la si besoin.`
          : `Une réduction vient d'être validée dans votre boutique ${partner.name}`,
        type: 'info',
        priority: 'high',
        data: {
          userId: partner.user,
          demand: String(_id),
          boutiqueId: String(to),
          status: 'success',
          flagged,
          url: `/payment/${_id}`
        },
        target: Events.PUSH_DEMANDE,
        status: 'pending'
      } as IPushNotification);

      return {
        ticket: this.buildTicket({ _id, amount: total, discountPercentage, completedAt }, partner, discount, net)
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Met en forme le ticket renvoyé à l'app client après un `redeem`.
   */
  private buildTicket(payment: any, partner: any, discount: number, net: number): any {
    return {
      _id: String(payment._id),
      montant: Number(payment.amount),
      reduction: discount,
      net,
      discountPercentage: Number(payment.discountPercentage ?? 0),
      boutique: { _id: String(partner._id), name: partner.name },
      date: payment.completedAt,
      status: 'success'
    };
  }

  /**
   * Invalidation a posteriori d'un ticket par le marchand : seul pouvoir restant du commerçant sur
   * un ticket. Fait passer un ticket `success` à `invalidated` et notifie le client.
   *
   * @param id Ticket à invalider
   * @param actorId `request.user._id` — doit posséder la boutique destinataire (`resolveOwnedPartner`)
   * @returns Le ticket invalidé, ou un descripteur d'erreur (`forbidden` / `conflict`)
   */
  async invalidate(id: string, actorId?: string): Promise<any> {
    try {
      if (!coddyger.string.isValidObjectId(id)) {
        return { error: true, data: locale.wrongObjectId('du paiement') };
      }

      const payment: any = await this.dao.selectOne({ _id: id });
      if (!payment) {
        return { error: true, data: locale.notfound('Ticket de réduction') };
      }

      const partnerId: string = String(payment.to?._id ?? payment.to ?? '');
      const ownership: any = await this.resolveOwnedPartner(partnerId, String(actorId ?? ''));
      if (ownership.error) {
        return ownership;
      }

      if (payment.status !== 'success') {
        return { error: true, conflict: true, data: locale.controller.payment.notInvalidable };
      }

      const model: any = (this.dao as any).defaultModel;
      const applied: any = await model
        .findOneAndUpdate(
          { _id: id, status: 'success' },
          { $set: { status: 'invalidated', invalidatedAt: new Date(), invalidatedBy: actorId } },
          { new: true }
        )
        .lean();

      if (!applied) {
        return { error: true, conflict: true, data: locale.controller.payment.notInvalidable };
      }

      // Notifie le client que sa réduction a été invalidée par la boutique.
      await this.pushNotificationService.create({
        title: 'Réduction invalidée',
        body: `Votre réduction chez ${payment.to?.name ?? 'la boutique'} a été invalidée`,
        type: 'warning',
        priority: 'high',
        data: {
          userId: String(payment.from?._id ?? payment.from ?? ''),
          demand: id,
          boutiqueId: partnerId,
          status: 'invalidated',
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
  /**
   * Détail d'une transaction (ticket de réduction) pour son seul titulaire : traçabilité côté
   * client, à l'image du détail marchand de l'app Pro. Montants recalculés comme au `redeem`.
   * @returns La transaction, ou `null` si elle n'existe pas ou n'appartient pas au client
   */
  async getClientTransactionDetails(clientId: string, paymentId: string): Promise<any> {
    const payment: any = await this.dao.selectOne({ _id: paymentId, from: clientId });
    if (!payment || payment.error) return null;

    const amount = Number(payment.amount) || 0;
    const pct = Number(payment.discountPercentage) || 0;
    const net = Math.round(amount * (1 - pct / 100));
    return {
      _id: String(payment._id),
      reference: String(payment._id),
      boutique: payment.to ? { _id: String(payment.to._id ?? payment.to), name: payment.to.name } : null,
      amount,
      discountPercentage: pct,
      reduction: amount - net,
      net,
      status: payment.status,
      validatedBy: payment.validatedBy,
      deniedReason: payment.deniedReason,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
      invalidatedAt: payment.invalidatedAt,
      updatedAt: payment.updatedAt
    };
  }

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
   * Économies cumulées d'un client : somme des réductions de ses tickets VALIDÉS (`success`). Les
   * tickets invalidés par le marchand, en attente ou refusés ne comptent pas. La réduction de chaque
   * ticket est recalculée avec la même formule que `redeem` (`computeDiscount`).
   *
   * @returns `{ total, month, count }` — `month` couvre le mois civil en cours (heure du serveur)
   */
  async getClientSavings(clientId: string): Promise<{ total: number; month: number; count: number }> {
    const model: any = (this.dao as any).defaultModel;
    const rows: any[] = await model
      .find({ from: clientId, status: 'success' }, 'amount discountPercentage completedAt createdAt')
      .lean();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let total = 0;
    let month = 0;
    for (const p of rows ?? []) {
      const amount = Number(p.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const { discount } = this.computeDiscount(amount, Number(p.discountPercentage ?? 0));
      total += discount;
      const at = new Date(p.completedAt ?? p.createdAt);
      if (at >= monthStart) month += discount;
    }

    return { total, month, count: (rows ?? []).length };
  }

  /**
   * Dernière réduction VALIDÉE (`success`) d'un client : la plus récente, avec le montant de la
   * réduction (recalculé via `computeDiscount`, même formule que `redeem`), le nom du marchand
   * (boutique `to` peuplée) et la date. `null` si le client n'a aucun ticket validé.
   *
   * @returns `{ amount, merchant?, date? } | null`
   */
  async getClientLastSaving(clientId: string): Promise<{ amount: number; merchant?: string; date?: string } | null> {
    try {
      const model: any = (this.dao as any).defaultModel;
      const last: any = await model
        .findOne({ from: clientId, status: 'success' }, 'amount discountPercentage completedAt createdAt to')
        .sort({ completedAt: -1 })
        .populate('to', '_id name')
        .lean();

      if (!last) {
        return null;
      }

      const amount = Number(last.amount);
      const { discount } = this.computeDiscount(Number.isFinite(amount) ? amount : 0, Number(last.discountPercentage ?? 0));
      const at = last.completedAt ?? last.createdAt;

      return {
        amount: discount,
        merchant: last.to?.name ?? undefined,
        date: at ? new Date(at).toISOString() : undefined
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Consommation des réductions du jour par rapport au quota (`redeemLimits.maxPerDay`), lue par
   * l'app Client pour la pastille « N aujourd'hui ». Même comptage que le quota de `redeem`.
   * `dayLimit` / `monthLimit` à 0 = illimité (pas de quota mensuel à ce jour).
   */
  async getScanUsage(clientId: string): Promise<{ hasSubscription: boolean; dayUsed: number; dayLimit: number; monthUsed: number; monthLimit: number }> {
    const model: any = (this.dao as any).defaultModel;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [subscription, limits, dayUsed, monthUsed] = await Promise.all([
      this.subscriptionService.getCurrentSubscriptionWithPlanDetails(clientId),
      this.platformConfigService.getRedeemLimits(),
      model.countDocuments({ from: clientId, status: 'success', completedAt: { $gte: this.startOfToday() } }),
      model.countDocuments({ from: clientId, status: 'success', completedAt: { $gte: monthStart } })
    ]);

    return {
      hasSubscription: !!subscription,
      dayUsed: Number(dayUsed) || 0,
      dayLimit: Number(limits.maxPerDay) || 0,
      monthUsed: Number(monthUsed) || 0,
      monthLimit: 0
    };
  }
}
