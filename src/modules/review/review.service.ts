import coddyger from 'coddyger';
import { dateRangeFilter } from '../../shared/date-filter';
import { ReviewSet } from './review.model';
import { IReview } from './review.interface';

export class ReviewService {
  private readonly dao: ReviewSet;

  constructor() {
    this.dao = new ReviewSet();
  }

  /** Crée ou met à jour l'avis d'un client sur un marchand (un seul vote, modifiable). */
  async upsertReview(partnerId: string, clientId: string, emoji: number): Promise<any> {
    const value = Math.max(1, Math.min(5, Math.round(Number(emoji))));
    const existing: any = await this.dao.selectOne({ partner: partnerId, client: clientId });
    if (existing && !existing.error) {
      return this.dao.update({ _id: existing._id }, { emoji: value, status: 'active' });
    }
    return this.dao.save({
      _id: coddyger.string.generateObjectId(),
      partner: partnerId,
      client: clientId,
      emoji: value,
      status: 'active'
    } as IReview);
  }

  /** Résumé public d'un marchand : moyenne, total, distribution, ratio négatif (emoji ≤ 2). */
  async getSummary(partnerId: string): Promise<any> {
    const list: any = await this.dao.selectHug({ partner: partnerId, status: 'active' });
    const rows: IReview[] = Array.isArray(list) ? list : [];
    const count = rows.length;
    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let sum = 0;
    let negative = 0;
    for (const r of rows) {
      const e = Number(r.emoji);
      if (e >= 1 && e <= 5) {
        distribution[String(e)] += 1;
        sum += e;
        if (e <= 2) negative += 1;
      }
    }
    const average = count > 0 ? Number((sum / count).toFixed(2)) : 0;
    const negativeRatio = count > 0 ? Number((negative / count).toFixed(2)) : 0;
    return { average, count, distribution, negativeRatio };
  }

  /** Liste paginée (modération admin). */
  async getAll(payloads: { page?: number; pageSize?: number; status?: string; from?: string; to?: string }): Promise<any> {
    const params: any = { ...dateRangeFilter(payloads.from, payloads.to) };
    if (payloads.status && !coddyger.string.isEmpty(payloads.status)) params.status = payloads.status;
    return this.dao.select({ params, page: payloads.page ?? 1, pageSize: payloads.pageSize ?? 20 });
  }

  /** Masque un avis (modération). */
  async hide(id: string): Promise<any> {
    return this.dao.update({ _id: id }, { status: 'hidden' });
  }

  async remove(id: string): Promise<any> {
    return this.dao.update({ _id: id }, { status: 'removed' });
  }
}
