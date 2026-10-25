import coddyger, { LoggerService, LogLevel } from 'coddyger';
import { phoneKey, randomCode } from '../../helpers/code-generator';
import { ClientSet } from '../client/client.model';
import { PlanSet } from '../plan/plan.model';
import { SubscriptionSet } from '../subscription/subscription.model';
import { FreeMonthService, FREE_MONTH_DAYS } from '../subscription/free-month.service';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { Events } from '../push-notification/push-notification.model';
import { CompanySet, ICompany } from './company.model';
import {
  IPromoBatch,
  IPromoCode,
  PromoBatchSet,
  PromoCodeSet,
  PromoCodeType,
  PromoRedemptionSet,
  PROMO_CODE_PREFIX
} from './promo-code.model';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Partie aléatoire des codes (Excel n°13 : `GIFT-XXXX`, `BIZ-XXXX`). 32⁴ ≈ 1 million de combinaisons :
 * la devinette est bornée par l'anti-devinette (5 échecs par heure et par compte) et les codes
 * nominatifs sont liés à un téléphone.
 */
const CODE_LENGTH = 4;
/** Délai d'activation par défaut (décision n°6 : 30 jours pour activer un code cadeau). */
export const PROMO_ACTIVATION_DAYS = 30;
/** Anti-devinette : au-delà de 5 codes refusés en une heure, le compte doit patienter. */
export const PROMO_MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;
/** Taille maximale d'un lot (création ou import CSV). */
export const PROMO_BATCH_MAX = 1000;

const CODE_FORMAT = /^(GIFT|BIZ)-[A-Z0-9]{4,12}$/;

/** Motif d'échec d'une activation, traduit en message par le contrôleur. */
export type PromoFailure =
  | 'code-invalid'
  | 'code-expired'
  | 'code-used'
  | 'already-redeemed'
  | 'too-many-attempts'
  | 'account-not-found';

export class PromoCodeError extends Error {
  constructor(public readonly reason: PromoFailure) {
    super(reason);
  }
}

/** Le code a-t-il la forme d'un code cadeau ou Business (`GIFT-…`, `BIZ-…`) ? */
export const isPromoCodeFormat = (raw?: string | null): boolean => CODE_FORMAT.test(normalizeCode(raw));

export const normalizeCode = (raw?: string | null): string => String(raw ?? '').trim().toUpperCase();

/** État d'un code tel qu'affiché au CMS. « Expiré » se déduit de la date, il n'est jamais stocké. */
export const codeState = (c: IPromoCode, now = new Date()): 'active' | 'disabled' | 'used' | 'expired' => {
  if (c.status === 'used' || c.uses >= c.maxUses) return 'used';
  if (c.status === 'disabled') return 'disabled';
  return new Date(c.expiresAt) <= now ? 'expired' : 'active';
};

/**
 * Codes & promotions (Excel Codes n°3, 4, 10, 13) : codes cadeaux et lots YOYO Business. Chaque
 * code activé donne des jours d'abonnement offerts via `FreeMonthService` (prolongation de
 * l'abonnement en cours, sinon création d'un abonnement), jamais une réduction de prix.
 */
export class PromoCodeService {
  private readonly serviceLabel = 'PromoCodeService';
  private readonly companies: any = new CompanySet().defaultModel;
  private readonly batches: any = new PromoBatchSet().defaultModel;
  private readonly codes: any = new PromoCodeSet().defaultModel;
  private readonly redemptions: any = new PromoRedemptionSet().defaultModel;
  private readonly clients: any = (new ClientSet() as any).defaultModel;
  private readonly plans: any = (new PlanSet() as any).defaultModel;
  private readonly subscriptions: any = (new SubscriptionSet() as any).defaultModel;
  private readonly freeMonths = new FreeMonthService();

  private log(method: string, error: unknown) {
    LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method });
  }

  /** Push à l'utilisateur (appli Client), qui ouvre le détail de son abonnement au tap. */
  private async notify(userId: string, title: string, body: string): Promise<void> {
    await new PushNotificationService()
      .create({
        title,
        body,
        type: 'info',
        priority: 'normal',
        status: 'pending',
        target: Events.USER_NOTIFICATION,
        data: { userId: String(userId), app: 'client', url: '/card/subscription-details', kind: 'promo-code' }
      } as any)
      .catch((error) => this.log('notify', error));
  }

  // ===================== Activation (appli Client) =====================

  /**
   * Code saisi à l'inscription : seul son format est contrôlé, jamais son existence. Sinon
   * l'inscription, qui n'a pas de compteur d'échecs, servirait à deviner des codes. Le code est
   * mémorisé sur le compte et vérifié à son activation (`redeemPending`), avec l'anti-devinette.
   */
  forSignup(raw: string): { type: PromoCodeType; code: string } | null {
    const code = normalizeCode(raw);
    if (!isPromoCodeFormat(code)) return null;
    return { type: code.startsWith(`${PROMO_CODE_PREFIX.business}-`) ? 'business' : 'gift', code };
  }

  /**
   * Anti-devinette : réserve atomiquement un essai AVANT de chercher le code. Des requêtes
   * simultanées ne peuvent donc pas dépasser la limite. Un essai réussi est rendu (`refundAttempt`).
   */
  private async reserveAttempt(userId: string): Promise<any> {
    const now = new Date();
    // Fenêtre d'une heure écoulée : le compteur repart de zéro.
    await this.clients.updateOne(
      {
        _id: userId,
        $or: [{ promoFailuresAt: null }, { promoFailuresAt: { $lte: new Date(now.getTime() - FAILURE_WINDOW_MS) } }]
      },
      { $set: { promoFailures: 0, promoFailuresAt: now } }
    );
    const client = await this.clients
      .findOneAndUpdate(
        { _id: userId, $or: [{ promoFailures: null }, { promoFailures: { $lt: PROMO_MAX_FAILURES } }] },
        { $inc: { promoFailures: 1 } },
        { new: true, projection: 'contact' }
      )
      .lean();
    if (client) return client;
    throw new PromoCodeError((await this.clients.exists({ _id: userId })) ? 'too-many-attempts' : 'account-not-found');
  }

  private async refundAttempt(userId: string): Promise<void> {
    await this.clients.updateOne({ _id: userId, promoFailures: { $gt: 0 } }, { $inc: { promoFailures: -1 } }).catch(() => undefined);
  }

  /**
   * Active un code pour un compte. Lève `PromoCodeError` avec le motif du refus.
   * La réservation de l'utilisation est atomique : deux comptes ne prennent jamais le même code.
   */
  async redeem(userId: string, raw: string): Promise<{ type: PromoCodeType; days: number; mode: string; endDate: Date | null }> {
    const client = await this.reserveAttempt(userId);

    const code = await this.codes.findOne({ code: normalizeCode(raw) }).lean();
    // Code d'un autre numéro : même refus qu'un code inexistant, pour ne pas révéler qu'il existe.
    const notYours = code?.holderPhone && phoneKey(code.holderPhone) !== phoneKey(client.contact);
    if (!code || code.status === 'disabled' || notYours) throw new PromoCodeError('code-invalid');
    const state = codeState(code);
    if (state === 'used') throw new PromoCodeError('code-used');
    if (state === 'expired') throw new PromoCodeError('code-expired');
    if (await this.redemptions.exists({ batch: code.batch, user: userId })) {
      await this.refundAttempt(userId);
      throw new PromoCodeError('already-redeemed');
    }

    const reserved = await this.codes.findOneAndUpdate(
      { _id: code._id, status: 'active', uses: { $lt: code.maxUses }, expiresAt: { $gt: new Date() } },
      { $inc: { uses: 1 } },
      { new: true }
    ).lean();
    if (!reserved) throw new PromoCodeError('code-used');
    if (reserved.uses >= reserved.maxUses) await this.codes.updateOne({ _id: code._id }, { status: 'used' });

    const release = async () => {
      await this.codes.updateOne({ _id: code._id }, { $inc: { uses: -1 }, $set: { status: 'active' } }).catch(() => undefined);
    };

    const redemptionId = coddyger.string.generateObjectId();
    try {
      await this.redemptions.create({
        _id: redemptionId,
        code: code._id,
        batch: code.batch,
        company: code.company,
        user: userId,
        status: 'applied'
      });
    } catch (error: any) {
      await release();
      if (error?.code === 11000) {
        await this.refundAttempt(userId);
        throw new PromoCodeError('already-redeemed');
      }
      throw error;
    }

    try {
      const batch = await this.batches.findOne({ _id: code.batch }, 'planId days').lean();
      const grant = await this.freeMonths.grant(userId, code.type, String(redemptionId), {
        planId: batch?.planId ? String(batch.planId) : null,
        days: batch?.days ?? FREE_MONTH_DAYS
      });
      await this.redemptions.updateOne({ _id: redemptionId }, { grantId: grant._id });
      await this.refundAttempt(userId);

      const subscription: any = grant.subscriptionId
        ? await this.subscriptions.findOne({ _id: grant.subscriptionId }, 'endDate').lean()
        : null;
      const months = Math.max(1, Math.round(grant.days / 30));
      await this.notify(
        userId,
        months > 1 ? `${months} mois offerts activés 🎁` : 'Votre mois offert est activé 🎁',
        `Votre code ${code.code} est activé : ${grant.days} jours d'abonnement YoYo offerts.`
      );
      return { type: code.type, days: grant.days, mode: grant.mode ?? 'created', endDate: subscription?.endDate ?? null };
    } catch (error) {
      await this.redemptions.deleteOne({ _id: redemptionId }).catch(() => undefined);
      await release();
      throw error;
    }
  }

  /**
   * Code saisi à l'inscription : activé une fois le compte vérifié. Ne bloque jamais l'activation
   * du compte ; le code est retiré du compte quel que soit le résultat.
   */
  async redeemPending(clientId: string): Promise<void> {
    try {
      const client = await this.clients.findOneAndUpdate(
        { _id: clientId, pendingPromoCode: { $exists: true } },
        { $unset: { pendingPromoCode: 1 } }
      ).lean();
      if (!client?.pendingPromoCode) return;
      try {
        await this.redeem(String(clientId), client.pendingPromoCode);
      } catch (error) {
        // Le code n'avait pas été vérifié à l'inscription : l'utilisateur apprend ici qu'il est refusé.
        if (!(error instanceof PromoCodeError)) throw error;
        await this.notify(
          String(clientId),
          "Code non activé",
          `Votre code ${client.pendingPromoCode} n'a pas pu être activé. Vérifiez-le depuis « J'ai un code ».`
        );
      }
    } catch (error) {
      this.log('redeemPending', error);
    }
  }

  // ===================== Entreprises (CMS) =====================

  async listCompanies(): Promise<any[]> {
    const rows = await this.companies.find({}).sort({ status: 1, name: 1 }).lean();
    const counts = await this.redemptions.aggregate([
      { $match: { company: { $ne: null }, status: 'applied' } },
      { $group: { _id: '$company', activations: { $sum: 1 } } }
    ]);
    const codes = await this.codes.aggregate([
      { $match: { company: { $ne: null } } },
      { $group: { _id: '$company', codes: { $sum: 1 } } }
    ]);
    const byId = (list: any[], key: string) => new Map(list.map((x) => [String(x._id), x[key]]));
    const act = byId(counts, 'activations');
    const total = byId(codes, 'codes');
    return rows.map((c: any) => ({ ...c, codes: total.get(String(c._id)) ?? 0, activations: act.get(String(c._id)) ?? 0 }));
  }

  async createCompany(data: Partial<ICompany>, adminId?: string): Promise<ICompany> {
    const doc = { ...data, _id: coddyger.string.generateObjectId(), status: 'active', createdBy: adminId };
    await this.companies.create(doc);
    return doc as ICompany;
  }

  async updateCompany(id: string, data: Partial<ICompany>): Promise<ICompany | null> {
    return this.companies.findOneAndUpdate({ _id: id }, { $set: data }, { new: true }).lean();
  }

  /** Fiche entreprise : ses lots (avec statistiques) et toutes les activations de ses codes. */
  async companyDetail(id: string): Promise<any | null> {
    const company = await this.companies.findOne({ _id: id }).lean();
    if (!company) return null;
    const batches = await this.listBatches({ company: company._id });
    const redemptions = await this.redemptionRows({ company: company._id });
    return { company, batches, redemptions };
  }

  // ===================== Lots et codes (CMS) =====================

  /** Codes uniques `PRÉFIXE-XXXXXX`, vérifiés contre la base avant insertion. */
  private async generateCodes(type: PromoCodeType, count: number): Promise<string[]> {
    const prefix = PROMO_CODE_PREFIX[type];
    const result = new Set<string>();
    for (let round = 0; round < 10 && result.size < count; round++) {
      const candidates: string[] = [];
      while (candidates.length < count - result.size) {
        const c = `${prefix}-${randomCode(CODE_LENGTH)}`;
        if (!result.has(c) && !candidates.includes(c)) candidates.push(c);
      }
      const taken = new Set((await this.codes.find({ code: { $in: candidates } }, 'code').lean()).map((x: any) => x.code));
      candidates.filter((c) => !taken.has(c)).forEach((c) => result.add(c));
    }
    if (result.size < count) throw new Error('Impossible de générer des codes uniques');
    return [...result];
  }

  /**
   * Crée un lot : `count` codes libres, ou un code nominatif par ligne importée (`rows`). Un code
   * nominatif avec téléphone n'est utilisable que par le compte qui a ce numéro.
   */
  async createBatch(
    input: {
      type: PromoCodeType;
      label: string;
      companyId?: string;
      invoiceRef?: string;
      planId?: string;
      days?: number;
      expiresAt?: string;
      count?: number;
      rows?: { name?: string; phone?: string }[];
    },
    adminId?: string
  ): Promise<{ batch: IPromoBatch; codes: number } | { error: string }> {
    if (input.type === 'business') {
      if (!input.companyId) return { error: 'Une entreprise est obligatoire pour un lot YOYO Business.' };
      const company = await this.companies.findOne({ _id: input.companyId, status: 'active' }).lean();
      if (!company) return { error: 'Entreprise introuvable ou archivée.' };
    }
    if (input.planId && !(await this.plans.exists({ _id: input.planId, isActive: true }))) {
      return { error: 'Plan introuvable ou inactif.' };
    }

    const rows = (input.rows ?? []).filter((r) => (r.name ?? '').trim() || (r.phone ?? '').trim());
    const count = rows.length || Math.round(input.count ?? 0);
    if (count < 1 || count > PROMO_BATCH_MAX) return { error: `Le lot doit compter entre 1 et ${PROMO_BATCH_MAX} codes.` };
    const badPhone = rows.findIndex((r) => (r.phone ?? '').trim() && phoneKey(r.phone).length < 8);
    if (badPhone >= 0) return { error: `Ligne ${badPhone + 1} : numéro de téléphone invalide.` };

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + PROMO_ACTIVATION_DAYS * DAY_MS);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return { error: "La date limite d'activation doit être future." };

    const batch: IPromoBatch = {
      _id: coddyger.string.generateObjectId(),
      type: input.type,
      label: input.label.trim(),
      company: input.type === 'business' ? input.companyId : undefined,
      invoiceRef: input.invoiceRef?.trim() || undefined,
      planId: input.planId || undefined,
      days: input.days && input.days > 0 ? Math.round(input.days) : FREE_MONTH_DAYS,
      expiresAt,
      count,
      createdBy: adminId
    };
    const codes = await this.generateCodes(input.type, count);
    await this.batches.create(batch);
    await this.codes.insertMany(
      codes.map((code, i) => ({
        _id: coddyger.string.generateObjectId(),
        code,
        type: batch.type,
        batch: batch._id,
        company: batch.company,
        holderName: rows[i]?.name?.trim() || undefined,
        holderPhone: rows[i]?.phone?.trim() || undefined,
        maxUses: 1,
        uses: 0,
        expiresAt,
        status: 'active'
      }))
    );
    return { batch, codes: codes.length };
  }

  /** Lots avec leurs compteurs : total, activés, disponibles, expirés, désactivés. */
  async listBatches(filter: any = {}): Promise<any[]> {
    const batches = await this.batches.find(filter).sort({ createdAt: -1 }).lean();
    if (!batches.length) return [];
    const now = new Date();
    const stats = await this.codes.aggregate([
      { $match: { batch: { $in: batches.map((b: any) => b._id) } } },
      {
        $group: {
          _id: '$batch',
          total: { $sum: 1 },
          used: { $sum: { $cond: [{ $gte: ['$uses', '$maxUses'] }, 1, 0] } },
          disabled: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'disabled'] }, { $lt: ['$uses', '$maxUses'] }] }, 1, 0] } },
          expired: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $lt: ['$uses', '$maxUses'] }, { $lte: ['$expiresAt', now] }] }, 1, 0]
            }
          }
        }
      }
    ]);
    const byBatch = new Map(stats.map((s: any) => [String(s._id), s]));
    const companyIds = batches.map((b: any) => b.company).filter(Boolean);
    const companies = companyIds.length ? await this.companies.find({ _id: { $in: companyIds } }, 'name').lean() : [];
    const names = new Map(companies.map((c: any) => [String(c._id), c.name]));
    return batches.map((b: any) => {
      const s: any = byBatch.get(String(b._id)) ?? { total: 0, used: 0, disabled: 0, expired: 0 };
      return {
        ...b,
        companyName: b.company ? names.get(String(b.company)) ?? null : null,
        stats: {
          total: s.total,
          used: s.used,
          disabled: s.disabled,
          expired: s.expired,
          available: Math.max(0, s.total - s.used - s.disabled - s.expired)
        }
      };
    });
  }

  /** Activations, avec le nom et le contact du compte (réservé au CMS). */
  private async redemptionRows(filter: any): Promise<any[]> {
    const rows = await this.redemptions.find(filter).sort({ createdAt: -1 }).lean();
    if (!rows.length) return [];
    const [users, codes] = await Promise.all([
      this.clients.find({ _id: { $in: rows.map((r: any) => r.user) } }, 'firstname lastname email contact').lean(),
      this.codes.find({ _id: { $in: rows.map((r: any) => r.code) } }, 'code').lean()
    ]);
    const userById = new Map(users.map((u: any) => [String(u._id), u]));
    const codeById = new Map(codes.map((c: any) => [String(c._id), c.code]));
    return rows.map((r: any) => ({ ...r, code: codeById.get(String(r.code)) ?? null, codeId: r.code, user: userById.get(String(r.user)) ?? { _id: r.user } }));
  }

  /** Détail d'un lot : ses codes (avec état calculé et activation éventuelle). */
  async batchDetail(id: string): Promise<any | null> {
    const [batch] = await this.listBatches({ _id: id });
    if (!batch) return null;
    const plan = batch.planId ? await this.plans.findOne({ _id: batch.planId }, 'name price').lean() : null;
    const codes = await this.codes.find({ batch: batch._id }).sort({ createdAt: 1, code: 1 }).lean();
    const redemptions = await this.redemptionRows({ batch: batch._id });
    const byCode = new Map<string, any>();
    redemptions.forEach((r) => byCode.set(String(r.codeId), r));
    const now = new Date();
    return {
      batch: { ...batch, plan },
      codes: codes.map((c: any) => ({ ...c, state: codeState(c, now), redemption: byCode.get(String(c._id)) ?? null }))
    };
  }

  /** Désactive ou réactive un code non utilisé. */
  async setCodeStatus(id: string, status: 'active' | 'disabled'): Promise<IPromoCode | null> {
    const from = status === 'active' ? 'disabled' : 'active';
    return this.codes
      .findOneAndUpdate({ _id: id, status: from, $expr: { $lt: ['$uses', '$maxUses'] } }, { status }, { new: true })
      .lean();
  }

  /**
   * Réattribue un code jamais utilisé à un nouveau titulaire (décision n°6), avec un nouveau délai
   * d'activation.
   */
  async reassign(id: string, input: { name?: string; phone?: string; expiresAt?: string }): Promise<IPromoCode | { error: string } | null> {
    if (input.phone && phoneKey(input.phone).length < 8) return { error: 'Numéro de téléphone invalide.' };
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + PROMO_ACTIVATION_DAYS * DAY_MS);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return { error: "La date limite d'activation doit être future." };
    const set: any = { expiresAt, status: 'active' };
    const unset: any = {};
    if (input.name?.trim()) set.holderName = input.name.trim();
    else unset.holderName = 1;
    if (input.phone?.trim()) set.holderPhone = input.phone.trim();
    else unset.holderPhone = 1;
    return this.codes.findOneAndUpdate({ _id: id, uses: 0 }, { $set: set, $unset: unset }, { new: true }).lean();
  }

  /** Annule une activation (fraude, erreur) : les jours offerts sont retirés et l'utilisateur prévenu. */
  async revokeRedemption(id: string, reason: string): Promise<boolean> {
    const redemption = await this.redemptions.findOneAndUpdate(
      { _id: id, status: 'applied' },
      { status: 'revoked', revokedAt: new Date(), revokedReason: reason },
      { new: true }
    ).lean();
    if (!redemption) return false;
    if (redemption.grantId) await this.freeMonths.revoke(String(redemption.grantId), reason);
    await this.notify(
      String(redemption.user),
      'Mois offert annulé',
      "L'activation de votre code a été annulée. Contactez le support pour en savoir plus."
    );
    return true;
  }
}

export const promoCodeService = new PromoCodeService();
