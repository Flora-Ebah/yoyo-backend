import coddyger, { IErrorObject } from 'coddyger';
import { InfluencerSet } from './influencer.model';
import { IInfluencer } from './influencer.interface';
import { ClientSet } from '../client/client.model';
import { dateRangeFilter } from '../../shared/date-filter';

export class InfluencerService {
  private readonly dao: InfluencerSet;

  constructor() {
    this.dao = new InfluencerSet();
  }

  async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; from?: string; to?: string }): Promise<any> {
    const page = payloads.page ?? 1;
    const pageSize = payloads.pageSize ?? 10;
    const query = payloads.query ?? '';
    const params: any = { ...dateRangeFilter(payloads.from, payloads.to) };
    if (query && !coddyger.string.isEmpty(query)) {
      params.$or = [
        { name: { $regex: query, $options: 'i' } },
        { code: { $regex: query, $options: 'i' } },
        { contact: { $regex: query, $options: 'i' } }
      ];
    }
    return this.dao.select({ params, page, pageSize });
  }

  async getById(id: string): Promise<IInfluencer | null> {
    const doc: any = await this.dao.selectOne({ _id: id, status: { $nin: ['removed', 'archived'] } });
    return doc && !doc.error ? doc : null;
  }

  /** Résout un code influenceur actif (public : validation à la saisie). */
  async validateCode(code?: string): Promise<IInfluencer | null> {
    if (!code || !code.trim()) return null;
    const doc: any = await this.dao.selectOne({
      code: code.trim().toUpperCase(),
      active: true,
      status: { $nin: ['removed', 'archived'] }
    });
    return doc && !doc.error ? doc : null;
  }

  async create(item: IInfluencer): Promise<any> {
    item._id ??= coddyger.string.generateObjectId();
    item.status ??= 'active';
    item.active ??= true;
    item.code = (item.code || '').trim().toUpperCase();
    // Unicité du code.
    const existing: any = await this.dao.selectOne({ code: item.code, status: { $nin: ['removed'] } });
    if (existing && !existing.error) {
      return { error: true, message: 'Ce code influenceur existe déjà.' };
    }
    return this.dao.save(item);
  }

  async update(id: string, item: Partial<IInfluencer>): Promise<any> {
    const next: any = { ...item };
    if (typeof next.code === 'string') next.code = next.code.trim().toUpperCase();
    delete next._id;
    return this.dao.update({ _id: id }, next);
  }

  async remove(id: string): Promise<any> {
    return this.dao.update({ _id: id }, { status: 'removed' });
  }

  /**
   * Statistiques d'acquisition par influenceur (#17) : nombre de clients ayant saisi le code.
   * Retourne la liste triée par `clientsReferred` décroissant.
   * NB : les conversions/CA (abonnements payants) nécessitent une jointure abonnement — à ajouter.
   */
  async getStats(): Promise<any[]> {
    const list: any = await this.dao.selectHug({ status: { $nin: ['removed', 'archived'] } });
    const influencers: IInfluencer[] = Array.isArray(list) ? list : [];
    const clientDao = new ClientSet();

    const stats = await Promise.all(
      influencers.map(async (inf) => {
        const clients: any = await clientDao.selectHug({
          influencerCode: inf.code,
          status: { $nin: ['removed', 'anonymized'] }
        });
        const clientsReferred = Array.isArray(clients) ? clients.length : 0;
        return {
          _id: inf._id,
          name: inf.name,
          code: inf.code,
          active: inf.active,
          clientsReferred
        };
      })
    );

    return stats.sort((a, b) => b.clientsReferred - a.clientsReferred);
  }
}
