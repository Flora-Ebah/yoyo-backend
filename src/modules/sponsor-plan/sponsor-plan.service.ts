import coddyger from 'coddyger';
import { SponsorPlanSet } from './sponsor-plan.model';
import { ISponsorPlan } from './sponsor-plan.interface';

/** Catalogue des formules de mise en avant (CRUD administrateur). */
export class SponsorPlanService {
  private readonly dao: SponsorPlanSet;

  constructor() {
    this.dao = new SponsorPlanSet();
  }

  /** Liste paginée des formules (hors supprimées), filtrable par statut et recherche. */
  async list(payloads: { page?: number; pageSize?: number; status?: string; q?: string } = {}): Promise<any> {
    const params: any = { status: { $ne: 'removed' } };
    if (payloads.status) params.status = payloads.status;
    if (payloads.q) params.name = { $regex: payloads.q, $options: 'i' };

    const data: any = await this.dao.select({ params, page: payloads.page, pageSize: payloads.pageSize });
    if (data && data.error) throw data;
    const rows: ISponsorPlan[] = data.rows;
    delete data.rows;
    return { data, rows };
  }

  /** Formules actives, pour l'app Pro (liste de choix). */
  async active(): Promise<ISponsorPlan[]> {
    const rows: any = await this.dao.selectHug({ status: 'active', isActive: true });
    return Array.isArray(rows) ? rows : [];
  }

  async getById(id: string): Promise<ISponsorPlan | null> {
    return this.dao.selectOne({ _id: id, status: { $ne: 'removed' } });
  }

  async create(item: Partial<ISponsorPlan>): Promise<ISponsorPlan> {
    const record: ISponsorPlan = {
      _id: coddyger.string.generateObjectId(),
      name: String(item.name || '').trim(),
      description: item.description ? String(item.description).trim() : undefined,
      price: Number(item.price) || 0,
      durationDays: Number(item.durationDays) || 0,
      position: Number(item.position) || 0,
      isActive: item.isActive !== false,
      status: 'active'
    };
    const res: any = await this.dao.save(record);
    if (res && res.error) throw res;
    return record;
  }

  async update(id: string, item: Partial<ISponsorPlan>): Promise<ISponsorPlan | null> {
    const next: any = {};
    if (typeof item.name !== 'undefined') next.name = String(item.name).trim();
    if (typeof item.description !== 'undefined') next.description = String(item.description).trim();
    if (typeof item.price !== 'undefined') next.price = Number(item.price) || 0;
    if (typeof item.durationDays !== 'undefined') next.durationDays = Number(item.durationDays) || 0;
    if (typeof item.position !== 'undefined') next.position = Number(item.position) || 0;
    if (typeof item.isActive !== 'undefined') next.isActive = !!item.isActive;
    if (typeof item.status !== 'undefined') next.status = item.status;

    const res: any = await this.dao.update({ _id: id }, next);
    if (res && res.error) throw res;
    return this.getById(id);
  }

  /** Suppression logique (statut `removed`). */
  async delete(id: string): Promise<void> {
    const res: any = await this.dao.update({ _id: id }, { status: 'removed' });
    if (res && res.error) throw res;
  }
}
