import coddyger, { IData, LoggerService, LogLevel } from 'coddyger';
import { ISettings } from './settings.interface';
import { SettingsSet } from './settings.model';

// Valeurs par défaut si aucun document de configuration n'existe encore en base.
const DEFAULTS: Pick<ISettings, 'discountMin' | 'discountMax' | 'accountDeletionGraceDays' | 'maxBoutiquesPerMerchant' | 'discountColors'> & {
  media: NonNullable<ISettings['media']>;
} = {
  discountMin: 10,
  discountMax: 50,
  accountDeletionGraceDays: 30,
  maxBoutiquesPerMerchant: 0,
  // Valeur par défaut modifiable par l'admin (#3). Le client applique la couleur du plus grand
  // seuil ≤ maxDiscount du marchand.
  discountColors: [
    { threshold: 10, color: '#2E7D32' },
    { threshold: 15, color: '#EF6C00' },
    { threshold: 20, color: '#C62828' }
  ],
  // Vidéo de présentation d'une boutique : valeurs de départ, modifiables au BO.
  media: { maxVideoSeconds: 20, maxVideoSizeMb: 50 }
};

/** Limites vidéo valides, champ par champ : un document ancien ou incomplet retombe sur le défaut. */
const normalizeMedia = (media: any): NonNullable<ISettings['media']> => {
  const seconds = Number(media?.maxVideoSeconds);
  const size = Number(media?.maxVideoSizeMb);
  return {
    maxVideoSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULTS.media.maxVideoSeconds,
    maxVideoSizeMb: Number.isFinite(size) && size > 0 ? size : DEFAULTS.media.maxVideoSizeMb
  };
};

export class SettingsService {
  private readonly dao: IData<ISettings>;
  private readonly serviceLabel = 'SettingsService';

  // Cache mémoire du document unique : évite un accès base à chaque validation de remise.
  // Invalidé à chaque mise à jour (`update`).
  private static cache: ISettings | null = null;

  constructor() {
    this.dao = new SettingsSet();
  }

  /**
   * Récupère (ou crée à la volée) le document de configuration unique.
   * Utilise un cache mémoire ; le premier appel lit la base, les suivants servent le cache.
   */
  async getSettings(): Promise<ISettings> {
    if (SettingsService.cache) {
      return SettingsService.cache;
    }

    try {
      let doc: any = await this.dao.selectOne({ status: { $ne: 'removed' } });

      if (doc && doc.error) {
        throw doc;
      }

      // Aucune configuration : on crée le singleton avec les valeurs par défaut.
      if (!doc) {
        const created: ISettings = {
          _id: coddyger.string.generateObjectId(),
          discountMin: DEFAULTS.discountMin,
          discountMax: DEFAULTS.discountMax,
          accountDeletionGraceDays: DEFAULTS.accountDeletionGraceDays,
          maxBoutiquesPerMerchant: DEFAULTS.maxBoutiquesPerMerchant,
          discountColors: DEFAULTS.discountColors,
          media: DEFAULTS.media,
          status: 'active'
        };
        const result: any = await this.dao.save(created);
        if (result && result.error) {
          throw result;
        }
        doc = created;
      }

      // `media` toujours complet dans la réponse, y compris pour un document créé avant ce champ :
      // les apps lisent ces limites sans valeur de repli codée en dur de leur côté.
      const plain: any = typeof doc.toObject === 'function' ? doc.toObject() : doc;
      const resolved = { ...plain, media: normalizeMedia(plain.media) } as ISettings;
      SettingsService.cache = resolved;
      return resolved;
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'getSettings' });
      // Repli sûr : en cas d'erreur base, on renvoie les valeurs par défaut (jamais de blocage).
      return { ...DEFAULTS, status: 'active' };
    }
  }

  /** Limites de la vidéo de présentation (durée en secondes, poids en Mo). */
  async getMediaLimits(): Promise<NonNullable<ISettings['media']>> {
    try {
      return normalizeMedia((await this.getSettings()).media);
    } catch {
      return DEFAULTS.media;
    }
  }

  /**
   * Bornes de la remise marchand, lues depuis la configuration. Utilisé par la validation
   * des partenaires (création/mise à jour) — source de vérité côté serveur.
   */
  async getDiscountBounds(): Promise<{ min: number; max: number }> {
    const s = await this.getSettings();
    return { min: Number(s.discountMin), max: Number(s.discountMax) };
  }

  /**
   * Délai de grâce (jours) avant anonymisation d'un compte supprimé. Lu depuis la configuration ;
   * repli sur la valeur par défaut si le champ est absent (anciens documents) ou invalide.
   */
  async getAccountDeletionGraceDays(): Promise<number> {
    const s = await this.getSettings();
    const value = Number(s.accountDeletionGraceDays);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULTS.accountDeletionGraceDays;
  }

  /**
   * Nombre maximum de boutiques par marchand (0 = illimité). Lu depuis la configuration ; repli
   * sur la valeur par défaut si le champ est absent (anciens documents) ou invalide.
   */
  async getMaxBoutiquesPerMerchant(): Promise<number> {
    const s = await this.getSettings();
    const value = Number(s.maxBoutiquesPerMerchant);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULTS.maxBoutiquesPerMerchant;
  }

  /**
   * Met à jour la configuration (remise min/max, couleurs %, sponsor, push proximité).
   * Réservé à l'administrateur (garde côté route).
   * (Rebuild forcé — busting du cache Docker `COPY src/` sur dev.)
   */
  async update(data: Partial<ISettings>): Promise<ISettings> {
    try {
      const current = await this.getSettings();

      const next: any = {};
      if (typeof data.discountMin !== 'undefined') next.discountMin = Number(data.discountMin);
      if (typeof data.discountMax !== 'undefined') next.discountMax = Number(data.discountMax);
      if (typeof data.accountDeletionGraceDays !== 'undefined') next.accountDeletionGraceDays = Number(data.accountDeletionGraceDays);
      if (typeof data.maxBoutiquesPerMerchant !== 'undefined') next.maxBoutiquesPerMerchant = Number(data.maxBoutiquesPerMerchant);
      if (typeof data.discountColors !== 'undefined' && Array.isArray(data.discountColors)) {
        next.discountColors = data.discountColors
          .filter((c: any) => c && typeof c.threshold === 'number' && typeof c.color === 'string')
          .map((c: any) => ({ threshold: Number(c.threshold), color: String(c.color) }));
      }
      if (typeof data.sponsorPlan !== 'undefined' && data.sponsorPlan) {
        next.sponsorPlan = {
          price: Number((data.sponsorPlan as any).price) || 0,
          durationDays: Number((data.sponsorPlan as any).durationDays) || 0
        };
      }
      if (typeof data.proximityPush !== 'undefined' && data.proximityPush) {
        const p: any = data.proximityPush;
        next.proximityPush = {
          radiusMeters: Number(p.radiusMeters) || 0,
          minIntervalHours: Number(p.minIntervalHours) || 0,
          target: p.target === 'sponsored' ? 'sponsored' : 'all'
        };
      }
      if (typeof data.media !== 'undefined' && data.media) {
        next.media = normalizeMedia({ ...current.media, ...data.media });
      }

      const result: any = await this.dao.update({ _id: current._id }, next);
      if (result && result.error) {
        throw result;
      }

      // Rafraîchir le cache pour que la prochaine lecture reflète la mise à jour.
      const updated = { ...current, ...next } as ISettings;
      SettingsService.cache = updated;
      return updated;
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'update' });
      throw error;
    }
  }
}
