import coddyger from 'coddyger';
import { dateRangeFilter } from '../../shared/date-filter';
import { BoutiqueSponsorSet } from './boutique-sponsor.model';
import { IBoutiqueSponsor } from './boutique-sponsor.interface';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { SponsorPlanService } from '../sponsor-plan/sponsor-plan.service';
import { SponsorPlanSet } from '../sponsor-plan/sponsor-plan.model';
import { PartnerSet } from '../partner/partner.model';

const DAY_MS = 24 * 60 * 60 * 1000;

export class BoutiqueSponsorService {
  private readonly dao: BoutiqueSponsorSet;
  private readonly config: PlatformConfigService;
  private readonly sponsorPlans: SponsorPlanService;
  private readonly partners: PartnerSet;

  constructor() {
    this.dao = new BoutiqueSponsorSet();
    this.config = new PlatformConfigService();
    this.sponsorPlans = new SponsorPlanService();
    this.partners = new PartnerSet();
  }

  /**
   * Met une boutique en avant.
   * - Si `sponsorPlanId` est fourni : applique le prix + la durée de cette **formule** (module sponsor-plan).
   * - Sinon : repli sur la config unique `platformConfig.sponsorPlan` (rétrocompatibilité).
   */
  async sponsor(boutiqueId: string, adminId?: string, sponsorPlanId?: string): Promise<IBoutiqueSponsor> {
    let price = 0;
    let durationDays = 30;
    let appliedPlanId: string | undefined;

    if (sponsorPlanId) {
      const formula: any = await this.sponsorPlans.getById(sponsorPlanId);
      if (!formula) {
        throw { error: true, message: 'Formule de mise en avant introuvable.' };
      }
      price = Number(formula.price) >= 0 ? Number(formula.price) : 0;
      durationDays = Number(formula.durationDays) > 0 ? Number(formula.durationDays) : 30;
      appliedPlanId = String(formula._id);
    } else {
      const cfg: any = await this.config.get();
      const plan = cfg?.sponsorPlan || {};
      durationDays = Number(plan.durationDays) > 0 ? Number(plan.durationDays) : 30;
      price = Number(plan.price) >= 0 ? Number(plan.price) : 0;
    }

    const now = new Date();
    const record: IBoutiqueSponsor = {
      _id: coddyger.string.generateObjectId(),
      boutiqueId,
      sponsorPlanId: appliedPlanId,
      startDate: now,
      endDate: new Date(now.getTime() + durationDays * DAY_MS),
      price,
      durationDays,
      createdBy: adminId,
      status: 'active'
    };

    const res: any = await this.dao.save(record);
    if (res && res.error) throw res;

    // La boutique devient sponsorisée (champ existant du module partner).
    await this.partners.update({ _id: boutiqueId }, { isSponsored: true });
    return record;
  }

  /**
   * [GARDE DE PROPRIÉTÉ] Indique si la boutique `boutiqueId` appartient au marchand `userId`.
   *
   * Réutilisable par toute route partenaire (verify) pour garantir qu'un marchand ne lit/pilote
   * JAMAIS la boutique d'un autre. La propriété se lit sur le champ `partner.user` (réf. Client),
   * peuplé en `{ _id, ... }` par `PartnerSet`. Retourne `false` si la boutique est introuvable,
   * supprimée ou sans propriétaire (anti-IDOR : l'appelant renverra alors 404/403).
   */
  async isOwnedBy(boutiqueId: string, userId: string): Promise<boolean> {
    if (!coddyger.string.isValidObjectId(boutiqueId) || !userId) return false;
    const boutique: any = await this.partners.selectOne({ _id: boutiqueId, status: { $nin: ['removed'] } });
    if (!boutique) return false;
    const ownerId = boutique.user?._id ?? boutique.user;
    return !!ownerId && String(ownerId) === String(userId);
  }

  /**
   * Sponsorisation active d'une boutique (sinon null). Expire paresseusement les
   * enregistrements dépassés et aligne `isSponsored` en conséquence.
   */
  async activeForBoutique(boutiqueId: string): Promise<IBoutiqueSponsor | null> {
    const now = new Date();
    const list: any = await this.dao.selectHug({ boutiqueId, status: 'active' });
    const rows: IBoutiqueSponsor[] = Array.isArray(list) ? list : [];

    let active: IBoutiqueSponsor | null = null;
    for (const s of rows) {
      if (new Date(s.endDate).getTime() > now.getTime()) {
        if (!active) active = s;
      } else {
        await this.dao.update({ _id: s._id }, { status: 'expired' });
      }
    }

    if (!active) await this.partners.update({ _id: boutiqueId }, { isSponsored: false });
    return active;
  }

  /**
   * Liste paginée des mises en avant (back-office).
   *
   * Chaque ligne est enrichie de la boutique peuplée `{ _id, name }` et de la formule
   * (sponsor-plan) peuplée `{ _id, name }`. `boutiqueId` / `sponsorPlanId` étant stockés
   * en chaîne (pas de ref Mongoose), l'enrichissement se fait par résolution manuelle.
   *
   * @param q Recherche texte sur le nom de la boutique ET le nom de la formule
   * @param expiringDays Ne renvoie que les mises en avant actives expirant sous X jours
   * @param from/to Filtre sur startDate (date de début de la mise en avant)
   */
  async list(payloads: {
    page?: number;
    pageSize?: number;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    expiringDays?: number;
  }): Promise<any> {
    const page = Number(payloads.page) > 0 ? Number(payloads.page) : 1;
    const pageSize = Number(payloads.pageSize) > 0 ? Number(payloads.pageSize) : 50;

    // Filtre « Période » sur startDate (date de début de la mise en avant).
    const params: any = { ...dateRangeFilter(payloads.from, payloads.to, 'startDate') };
    if (payloads.status) params.status = payloads.status;

    // Fenêtre d'expiration : réutilise la logique de metrics (actif + endDate ∈ ]now, now+X]).
    if (
      payloads.expiringDays !== undefined &&
      payloads.expiringDays !== null &&
      !Number.isNaN(Number(payloads.expiringDays))
    ) {
      const now = new Date();
      const thresholdDate = new Date(now);
      thresholdDate.setDate(thresholdDate.getDate() + Number(payloads.expiringDays));
      params.status = 'active';
      params.endDate = { $gt: now, $lte: thresholdDate };
    }

    // Recherche texte sur boutique (nom) + formule (nom) : on résout d'abord les ids,
    // puis on filtre les mises en avant sur ces ids (même approche que subscription.list).
    if (!coddyger.string.isEmpty(payloads.q)) {
      const rx = { $regex: payloads.q, $options: 'i' };
      let boutiqueIds: string[] = [];
      let planIds: string[] = [];

      try {
        const boutiques: any = await this.partners.selectHug({ name: rx });
        if (Array.isArray(boutiques)) boutiqueIds = boutiques.map((b: any) => String(b._id));
      } catch {
        boutiqueIds = [];
      }

      try {
        const plans: any = await new SponsorPlanSet().selectHug({ name: rx });
        if (Array.isArray(plans)) planIds = plans.map((p: any) => String(p._id));
      } catch {
        planIds = [];
      }

      params.$or = [{ boutiqueId: { $in: boutiqueIds } }, { sponsorPlanId: { $in: planIds } }];
    }

    // Récupère toutes les lignes filtrées (triées desc par createdAt via le DAO), puis pagine
    // en mémoire : volumes back-office modérés et DAO non paginé.
    const all: any = await this.dao.selectHug(params);
    const rowsAll: any[] = Array.isArray(all) ? all : [];
    const totalRows = rowsAll.length;
    const pageRows = rowsAll.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    // Enrichissement : boutique { _id, name } + formule { _id, name }.
    const boutiqueIds = [...new Set(pageRows.map((r) => r.boutiqueId).filter(Boolean).map(String))];
    const planIds = [...new Set(pageRows.map((r) => r.sponsorPlanId).filter(Boolean).map(String))];

    const [boutiques, plans] = await Promise.all([
      boutiqueIds.length ? this.partners.selectHug({ _id: { $in: boutiqueIds } }) : Promise.resolve([]),
      planIds.length ? new SponsorPlanSet().selectHug({ _id: { $in: planIds } }) : Promise.resolve([])
    ]);

    const boutiqueById = new Map<string, any>();
    (Array.isArray(boutiques) ? boutiques : []).forEach((b: any) =>
      boutiqueById.set(String(b._id), { _id: b._id, name: b.name })
    );
    const planById = new Map<string, any>();
    (Array.isArray(plans) ? plans : []).forEach((p: any) =>
      planById.set(String(p._id), { _id: p._id, name: p.name })
    );

    const rows = pageRows.map((r) => ({
      ...r,
      boutique: r.boutiqueId ? boutiqueById.get(String(r.boutiqueId)) || null : null,
      sponsorPlan: r.sponsorPlanId ? planById.get(String(r.sponsorPlanId)) || null : null
    }));

    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    return {
      rows,
      totalRows,
      page,
      pageSize,
      totalPages,
      countRowsPerPage: rows.length,
      totalPagesPerQuery: totalPages
    };
  }

  /**
   * Compteurs des mises en avant boutiques pour le back-office.
   * Réutilise la logique d'expiration de la liste (statut actif + endDate).
   * @param expiringDays Fenêtre (en jours) pour « en cours d'expiration »
   */
  async metrics(expiringDays: number = 7): Promise<{
    active: number;
    expiringSoon: number;
    expired: number;
    total: number;
    newThisMonth: number;
    revenue: number;
    byFormula: Array<{ formule: string; count: number }>;
  }> {
    const now = new Date();
    const thresholdDate = new Date(now);
    thresholdDate.setDate(thresholdDate.getDate() + expiringDays);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    const model: any = (this.dao as any).defaultModel;
    const activeFilter = { status: 'active', endDate: { $gt: now } };

    const [active, expiringSoon, expired, total, newThisMonth, revenueAgg, byFormulaAgg] = await Promise.all([
      model.countDocuments(activeFilter),
      model.countDocuments({ status: 'active', endDate: { $gt: now, $lte: thresholdDate } }),
      model.countDocuments({ $or: [{ status: 'expired' }, { endDate: { $lte: now } }] }),
      model.countDocuments({}),
      model.countDocuments({ startDate: { $gte: startOfMonth, $lt: startOfNextMonth } }),
      model.aggregate([{ $match: activeFilter }, { $group: { _id: null, total: { $sum: '$price' } } }]),
      model.aggregate([
        { $match: activeFilter },
        { $group: { _id: '$sponsorPlanId', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    const revenue = Array.isArray(revenueAgg) && revenueAgg.length > 0 ? revenueAgg[0].total || 0 : 0;

    // Résolution des noms de formules (sponsorPlanId stocké en chaîne, pas de ref).
    const planIds = (Array.isArray(byFormulaAgg) ? byFormulaAgg : [])
      .map((r: any) => r._id)
      .filter(Boolean)
      .map(String);
    let planById = new Map<string, string>();
    if (planIds.length) {
      const plans: any = await new SponsorPlanSet().selectHug({ _id: { $in: planIds } });
      (Array.isArray(plans) ? plans : []).forEach((p: any) => planById.set(String(p._id), p.name));
    }

    const byFormula = (Array.isArray(byFormulaAgg) ? byFormulaAgg : []).map((r: any) => ({
      formule: r._id ? planById.get(String(r._id)) || 'Inconnu' : 'Sans formule',
      count: r.count || 0
    }));

    return { active, expiringSoon, expired, total, newThisMonth, revenue, byFormula };
  }

  /** Retire la mise en avant (annule les sponsorisations actives). */
  async cancel(boutiqueId: string): Promise<{ cancelled: number }> {
    const list: any = await this.dao.selectHug({ boutiqueId, status: 'active' });
    const rows: IBoutiqueSponsor[] = Array.isArray(list) ? list : [];
    for (const s of rows) await this.dao.update({ _id: s._id }, { status: 'cancelled' });
    await this.partners.update({ _id: boutiqueId }, { isSponsored: false });
    return { cancelled: rows.length };
  }
}
