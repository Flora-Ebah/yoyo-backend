import coddyger from 'coddyger';
import { HomeSlideSet } from './home-slide.model';
import { IHomeSlide } from './home-slide.interface';

export class HomeSlideService {
  private readonly dao: HomeSlideSet;

  constructor() {
    this.dao = new HomeSlideSet();
  }

  /** Slides publiques : actives, dans leur fenêtre d'affichage, triées par `order`. */
  async getPublic(): Promise<IHomeSlide[]> {
    const now = new Date();
    const list: any = await this.dao.selectHug({
      status: { $nin: ['removed', 'inactive'] },
      active: true,
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] }
      ]
    });
    return Array.isArray(list) ? list : [];
  }

  async getAll(payloads: { page?: number; pageSize?: number }): Promise<any> {
    return this.dao.select({ params: {}, page: payloads.page ?? 1, pageSize: payloads.pageSize ?? 50 });
  }

  async getById(id: string): Promise<IHomeSlide | null> {
    const doc: any = await this.dao.selectOne({ _id: id, status: { $nin: ['removed'] } });
    return doc && !doc.error ? doc : null;
  }

  async create(item: IHomeSlide): Promise<any> {
    item._id ??= coddyger.string.generateObjectId();
    item.status ??= 'active';
    item.active ??= true;
    item.order ??= 0;
    return this.dao.save(item);
  }

  async update(id: string, item: Partial<IHomeSlide>): Promise<any> {
    const next: any = { ...item };
    delete next._id;
    return this.dao.update({ _id: id }, next);
  }

  async remove(id: string): Promise<any> {
    return this.dao.update({ _id: id }, { status: 'removed' });
  }
}
