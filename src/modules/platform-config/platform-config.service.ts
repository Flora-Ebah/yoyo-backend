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

/** Garde-fous du montant saisi par le client : valeurs de départ, modifiables au BO. */
export const DEFAULT_REDEEM_LIMITS = { maxAmount: 500000, cooldownHours: 4, maxPerDay: 5, requireScanToken: false };

/**
 * Garde-fous valides, champ par champ. Contrairement aux limites vidéo, 0 est une valeur légitime
 * (garde-fou désactivé) : seul un champ absent ou invalide retombe sur le défaut.
 */
const normalizeRedeemLimits = (limits: any): NonNullable<IPlatformConfig['redeemLimits']> => {
  const pick = (value: any, fallback: number) => {
    const n = Number(value);
    return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    maxAmount: pick(limits?.maxAmount, DEFAULT_REDEEM_LIMITS.maxAmount),
    cooldownHours: pick(limits?.cooldownHours, DEFAULT_REDEEM_LIMITS.cooldownHours),
    maxPerDay: pick(limits?.maxPerDay, DEFAULT_REDEEM_LIMITS.maxPerDay),
    // Flag de sécurité : défaut `false` (comportement legacy) ; le BO peut l'activer pour exiger
    // un vrai scan frais. Seul un booléen explicite `true` active l'exigence.
    requireScanToken: limits?.requireScanToken === true
  };
};

/** Programme de parrainage : valeurs de départ, modifiables au BO (décisions 1 et 5). */
export const DEFAULT_REFERRAL_PROGRAM = { enabled: true, planId: null, referralsPerReward: 3, rewardCap: 3000 };

/** Paramètres du parrainage valides, champ par champ (un document ancien retombe sur le défaut). */
const normalizeReferralProgram = (program: any): NonNullable<IPlatformConfig['referralProgram']> => {
  const positive = (value: any, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    enabled: program?.enabled !== false,
    planId: program?.planId ? String(program.planId) : null,
    referralsPerReward: positive(program?.referralsPerReward, DEFAULT_REFERRAL_PROGRAM.referralsPerReward),
    rewardCap: positive(program?.rewardCap, DEFAULT_REFERRAL_PROGRAM.rewardCap)
  };
};

/** Délais du support : décision n°8 (paiement 2 h ouvrées, sinon 24 h, résolution 48 h). */
export const DEFAULT_SUPPORT_SLA = {
  paymentFirstResponseHours: 2,
  firstResponseHours: 24,
  resolutionHours: 48,
  businessStartHour: 8,
  businessEndHour: 18,
  businessDays: [1, 2, 3, 4, 5, 6]
};

/** Délais valides, champ par champ ; des heures ouvrées incohérentes retombent sur le défaut. */
export const normalizeSupportSla = (sla: any): NonNullable<IPlatformConfig['supportSla']> => {
  const hours = (value: any, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n <= 720 ? n : fallback;
  };
  const hour = (value: any, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 24 ? n : fallback;
  };
  let start = hour(sla?.businessStartHour, DEFAULT_SUPPORT_SLA.businessStartHour);
  let end = hour(sla?.businessEndHour, DEFAULT_SUPPORT_SLA.businessEndHour);
  if (end <= start) {
    start = DEFAULT_SUPPORT_SLA.businessStartHour;
    end = DEFAULT_SUPPORT_SLA.businessEndHour;
  }
  const days = Array.isArray(sla?.businessDays)
    ? Array.from(new Set<number>(sla.businessDays.map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
    : [];
  return {
    paymentFirstResponseHours: hours(sla?.paymentFirstResponseHours, DEFAULT_SUPPORT_SLA.paymentFirstResponseHours),
    firstResponseHours: hours(sla?.firstResponseHours, DEFAULT_SUPPORT_SLA.firstResponseHours),
    resolutionHours: hours(sla?.resolutionHours, DEFAULT_SUPPORT_SLA.resolutionHours),
    businessStartHour: start,
    businessEndHour: end,
    businessDays: days.length > 0 ? days : [...DEFAULT_SUPPORT_SLA.businessDays]
  };
};

export const DEFAULT_FRAUD_RULES: NonNullable<IPlatformConfig['fraudRules']> = {
  accountsPerDevice: 3,
  scansPerDay: 15,
  boutiqueSpikeFactor: 3,
  boutiqueSpikeMin: 20
};

/** Seuils valides, champ par champ (repli sur le défaut). */
export const normalizeFraudRules = (rules: any): NonNullable<IPlatformConfig['fraudRules']> => {
  const num = (value: any, fallback: number, min: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    accountsPerDevice: Math.round(num(rules?.accountsPerDevice, DEFAULT_FRAUD_RULES.accountsPerDevice, 2, 50)),
    scansPerDay: Math.round(num(rules?.scansPerDay, DEFAULT_FRAUD_RULES.scansPerDay, 2, 500)),
    boutiqueSpikeFactor: num(rules?.boutiqueSpikeFactor, DEFAULT_FRAUD_RULES.boutiqueSpikeFactor, 1.5, 50),
    boutiqueSpikeMin: Math.round(num(rules?.boutiqueSpikeMin, DEFAULT_FRAUD_RULES.boutiqueSpikeMin, 1, 10000))
  };
};

/** Moyens de paiement : activés par défaut, seul un `false` explicite enregistré au BO les coupe. */
export const DEFAULT_PAYMENT_PROVIDERS: NonNullable<IPlatformConfig['paymentProviders']> = { orangeMoney: true, wave: true };

export const normalizePaymentProviders = (providers: any): NonNullable<IPlatformConfig['paymentProviders']> => ({
  orangeMoney: providers?.orangeMoney !== false,
  wave: providers?.wave !== false
});

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
    return {
      ...doc,
      media: normalizeMedia(doc.media),
      redeemLimits: normalizeRedeemLimits(doc.redeemLimits),
      referralProgram: normalizeReferralProgram(doc.referralProgram),
      referralRewardsGranted: Number(doc.referralRewardsGranted) || 0,
      supportSla: normalizeSupportSla(doc.supportSla),
      fraudRules: normalizeFraudRules(doc.fraudRules),
      paymentProviders: normalizePaymentProviders(doc.paymentProviders)
    } as IPlatformConfig;
  }

  /** Garde-fous du montant saisi par le client (plafond, délai par boutique, quota journalier). */
  async getRedeemLimits(): Promise<NonNullable<IPlatformConfig['redeemLimits']>> {
    try {
      return normalizeRedeemLimits((await this.get()).redeemLimits);
    } catch {
      return { ...DEFAULT_REDEEM_LIMITS };
    }
  }

  /** Paramètres du programme de parrainage + nombre de récompenses déjà attribuées. */
  async getReferralProgram(): Promise<NonNullable<IPlatformConfig['referralProgram']> & { granted: number }> {
    try {
      const config = await this.get();
      return { ...normalizeReferralProgram(config.referralProgram), granted: config.referralRewardsGranted ?? 0 };
    } catch {
      return { ...DEFAULT_REFERRAL_PROGRAM, granted: 0 };
    }
  }

  /**
   * Réserve atomiquement une place du programme (« 3 000 premiers »). Deux validations simultanées
   * ne peuvent pas dépasser le plafond : l'incrément n'a lieu que si le compteur est sous `cap`.
   * Retourne `false` quand le programme est complet.
   */
  async reserveReferralReward(cap: number): Promise<boolean> {
    await this.get(); // garantit l'existence du singleton
    const model: any = (this.dao as any).defaultModel;
    const doc = await model.findOneAndUpdate(
      {
        status: { $ne: 'removed' },
        $or: [{ referralRewardsGranted: { $lt: cap } }, { referralRewardsGranted: { $exists: false } }]
      },
      { $inc: { referralRewardsGranted: 1 } },
      { new: true }
    );
    return !!doc;
  }

  /** Libère une place (récompense annulée ou attribution échouée). */
  async releaseReferralReward(): Promise<void> {
    const model: any = (this.dao as any).defaultModel;
    await model.updateOne(
      { status: { $ne: 'removed' }, referralRewardsGranted: { $gt: 0 } },
      { $inc: { referralRewardsGranted: -1 } }
    );
  }

  /** Délais cibles du support (repli sur la décision n°8). */
  async getSupportSla(): Promise<NonNullable<IPlatformConfig['supportSla']>> {
    try {
      return normalizeSupportSla((await this.get()).supportSla);
    } catch {
      return normalizeSupportSla(null);
    }
  }

  /** Seuils des alertes fraude (Excel CMS n°3). */
  async getFraudRules(): Promise<NonNullable<IPlatformConfig['fraudRules']>> {
    try {
      return normalizeFraudRules((await this.get()).fraudRules);
    } catch {
      return { ...DEFAULT_FRAUD_RULES };
    }
  }

  /** Interrupteurs BO des moyens de paiement (repli : tout activé). */
  async getPaymentProviders(): Promise<NonNullable<IPlatformConfig['paymentProviders']>> {
    try {
      return normalizePaymentProviders((await this.get()).paymentProviders);
    } catch {
      return { ...DEFAULT_PAYMENT_PROVIDERS };
    }
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

    if (data.redeemLimits) {
      next.redeemLimits = normalizeRedeemLimits({ ...current.redeemLimits, ...data.redeemLimits });
    }

    if (data.referralProgram) {
      next.referralProgram = normalizeReferralProgram({ ...current.referralProgram, ...data.referralProgram });
    }

    if (data.supportSla) {
      next.supportSla = normalizeSupportSla({ ...current.supportSla, ...data.supportSla });
    }

    if (data.fraudRules) {
      next.fraudRules = normalizeFraudRules({ ...current.fraudRules, ...data.fraudRules });
    }

    if (data.paymentProviders) {
      next.paymentProviders = normalizePaymentProviders({ ...current.paymentProviders, ...data.paymentProviders });
    }

    const res: any = await this.dao.update({ _id: (current as any)._id }, next);
    if (res && res.error) throw res;
    return { ...current, ...next } as IPlatformConfig;
  }
}
