import coddyger from 'coddyger';
import { PlatformConfigSet } from './platform-config.model';
import { IPlatformConfig } from './platform-config.interface';

const DEFAULT_COLORS = [
  { threshold: 10, color: '#2E7D32' },
  { threshold: 15, color: '#EF6C00' },
  { threshold: 20, color: '#C62828' }
];

/** Vidéo de présentation d'une boutique : valeurs de départ, modifiables au BO. */
const DEFAULT_MEDIA = { maxVideoSeconds: 20, maxVideoSizeMb: 50 };

/** Limites vidéo valides, champ par champ : un document ancien ou incomplet retombe sur le défaut. */
const normalizeMedia = (media: any): NonNullable<IPlatformConfig['media']> => {
  const seconds = Number(media?.maxVideoSeconds);
  const size = Number(media?.maxVideoSizeMb);
  return {
    maxVideoSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_MEDIA.maxVideoSeconds,
    maxVideoSizeMb: Number.isFinite(size) && size > 0 ? size : DEFAULT_MEDIA.maxVideoSizeMb
  };
};

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
    // `media` toujours complet dans la réponse, y compris pour un document créé avant ce champ :
    // les apps lisent ces limites sans valeur de repli codée en dur de leur côté.
    return { ...doc, media: normalizeMedia(doc.media) } as IPlatformConfig;
  }

  /** Limites de la vidéo de présentation (durée en secondes, poids en Mo). */
  async getMediaLimits(): Promise<NonNullable<IPlatformConfig['media']>> {
    try {
      return normalizeMedia((await this.get()).media);
    } catch {
      return { ...DEFAULT_MEDIA };
    }
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

    if (data.media) {
      next.media = normalizeMedia({ ...current.media, ...data.media });
    }

    const res: any = await this.dao.update({ _id: (current as any)._id }, next);
    if (res && res.error) throw res;
    return { ...current, ...next } as IPlatformConfig;
  }
}
