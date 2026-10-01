import coddyger from 'coddyger';
import { dateRangeFilter } from '../../shared/date-filter';
import { BoutiqueSponsorSet } from './boutique-sponsor.model';
import { IBoutiqueSponsor } from './boutique-sponsor.interface';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { SponsorPlanService } from '../sponsor-plan/sponsor-plan.service';
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

  /** Liste paginée de toutes les sponsorisations (admin). */
  async list(payloads: { page?: number; pageSize?: number; status?: string; from?: string; to?: string }): Promise<any> {
    const params: any = { ...dateRangeFilter(payloads.from, payloads.to) };
    if (payloads.status) params.status = payloads.status;
    return this.dao.select({ params, page: payloads.page ?? 1, pageSize: payloads.pageSize ?? 50 });
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
