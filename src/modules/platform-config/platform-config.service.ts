import coddyger from 'coddyger';
import { PlatformConfigSet } from './platform-config.model';
import { IPlatformConfig } from './platform-config.interface';

const DEFAULT_COLORS = [
  { threshold: 10, color: '#2E7D32' },
  { threshold: 15, color: '#EF6C00' },
  { threshold: 20, color: '#C62828' }
];

export class PlatformConfigService {
  private readonly dao: PlatformConfigSet;

  constructor() {
    this.dao = new PlatformConfigSet();
  }

  /** Récupère (ou crée) le singleton de configuration. */
  async get(): Promise<IPlatformConfig> {
    let doc: any = await this.dao.selectOne({ status: { $ne: 'removed' } });
    if (doc && doc.error) doc = null;
    if (!doc) {
      const created: IPlatformConfig = {
        _id: coddyger.string.generateObjectId(),
        discountColors: DEFAULT_COLORS,
        status: 'active'
      };
      const res: any = await this.dao.save(created);
      if (res && res.error) return created;
      doc = created;
    }
    return doc as IPlatformConfig;
  }

  /** Met à jour la configuration (whitelist des champs). */
  async update(data: Partial<IPlatformConfig>): Promise<IPlatformConfig> {
    const current = await this.get();
    const next: any = {};

    if (Array.isArray(data.discountColors)) {
      next.discountColors = data.discountColors
        .filter((c: any) => c && typeof c.threshold === 'number' && typeof c.color === 'string')
        .map((c: any) => ({ threshold: Number(c.threshold), color: String(c.color) }));
    }
    if (data.sponsorPlan) {
      next.sponsorPlan = {
        price: Number((data.sponsorPlan as any).price) || 0,
        durationDays: Number((data.sponsorPlan as any).durationDays) || 0
      };
    }
    if (data.proximityPush) {
      const p: any = data.proximityPush;
      next.proximityPush = {
        radiusMeters: Number(p.radiusMeters) || 0,
        minIntervalHours: Number(p.minIntervalHours) || 0,
        target: p.target === 'sponsored' ? 'sponsored' : 'all'
      };
    }

    const res: any = await this.dao.update({ _id: (current as any)._id }, next);
    if (res && res.error) throw res;
    return { ...current, ...next } as IPlatformConfig;
  }
}
