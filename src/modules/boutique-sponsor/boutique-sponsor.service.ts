import coddyger from 'coddyger';
import { dateRangeFilter } from '../../shared/date-filter';
import { BoutiqueSponsorSet } from './boutique-sponsor.model';
import { IBoutiqueSponsor } from './boutique-sponsor.interface';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PartnerSet } from '../partner/partner.model';

const DAY_MS = 24 * 60 * 60 * 1000;

export class BoutiqueSponsorService {
  private readonly dao: BoutiqueSponsorSet;
  private readonly config: PlatformConfigService;
  private readonly partners: PartnerSet;

  constructor() {
    this.dao = new BoutiqueSponsorSet();
    this.config = new PlatformConfigService();
    this.partners = new PartnerSet();
  }

  /** Met une boutique en avant selon l'abonnement courant (prix + durée de `sponsorPlan`). */
  async sponsor(boutiqueId: string, adminId?: string): Promise<IBoutiqueSponsor> {
    const cfg: any = await this.config.get();
    const plan = cfg?.sponsorPlan || {};
    const durationDays = Number(plan.durationDays) > 0 ? Number(plan.durationDays) : 30;
    const price = Number(plan.price) >= 0 ? Number(plan.price) : 0;

    const now = new Date();
    const record: IBoutiqueSponsor = {
      _id: coddyger.string.generateObjectId(),
      boutiqueId,
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
