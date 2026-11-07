import coddyger, { LoggerService, LogLevel } from 'coddyger';
import { SpaceSet } from './space.model';
import { ISpace } from './space.interface';

const serviceLabel = 'SpaceService';

/** Espaces par défaut insérés au 1er démarrage (si la collection est vide). */
const DEFAULT_SPACES: ISpace[] = [
  {
    label: 'YoYo Commercial',
    roleLabel: 'Commercial',
    landing: '/commercial',
    requires: [{ subject: 'pros', action: 'create' }],
    excludes: ['dashboard'],
    order: 10,
    status: 'active',
  },
  {
    label: 'YoYo Support',
    roleLabel: 'Service clientèle',
    landing: '/support',
    requires: [{ subject: 'support', action: 'read' }],
    excludes: ['dashboard', 'moderation'],
    order: 20,
    status: 'active',
  },
];

export class SpaceService {
  private readonly dao = new SpaceSet();

  /** Liste les espaces actifs (pour la résolution). */
  async listActive(): Promise<ISpace[]> {
    try {
      const model: any = (this.dao as any).defaultModel;
      return await model.find({ status: 'active' }).sort({ order: 1 }).lean();
    } catch {
      return [];
    }
  }

  /** Liste complète (pour l'admin) hors supprimés. */
  async getAll(): Promise<ISpace[]> {
    const model: any = (this.dao as any).defaultModel;
    return await model.find({ status: { $ne: 'removed' } }).sort({ order: 1 }).lean();
  }

  async getById(id: string): Promise<any> {
    const model: any = (this.dao as any).defaultModel;
    return await model.findById(id).lean();
  }

  async create(item: ISpace): Promise<any> {
    try {
      item._id = coddyger.string.generateObjectId();
      item.status = item.status ?? 'active';
      return await this.dao.save(item as any);
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'create' });
      return { error: true, data: error };
    }
  }

  async update(id: string, item: Partial<ISpace>): Promise<any> {
    try {
      return await this.dao.update({ _id: id }, item);
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'update' });
      return { error: true, data: error };
    }
  }

  /** Suppression définitive. */
  async delete(id: string): Promise<void> {
    const model: any = (this.dao as any).defaultModel;
    await model.deleteOne({ _id: id });
  }

  async existsRaw(id: string): Promise<boolean> {
    const model: any = (this.dao as any).defaultModel;
    return !!(await model.exists({ _id: id }));
  }

  /** Insère les espaces par défaut si la collection est vide (idempotent). */
  async seedDefaults(): Promise<void> {
    try {
      const model: any = (this.dao as any).defaultModel;
      const count = await model.countDocuments({});
      if (count > 0) return;
      for (const s of DEFAULT_SPACES) {
        await this.create({ ...s });
      }
      LoggerService.log({ type: LogLevel.Info, content: 'Espaces par défaut créés', location: serviceLabel, method: 'seedDefaults' });
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'seedDefaults' });
    }
  }
}
