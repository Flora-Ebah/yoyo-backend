import coddyger from 'coddyger';
import { FreeMonthGrantSet, FreeMonthSource, IFreeMonthGrant } from './free-month.model';
import { SubscriptionSet } from './subscription.model';
import { PlanSet } from '../plan/plan.model';
import { PlatformConfigService } from '../platform-config/platform-config.service';

/** Durée d'un mois offert. */
export const FREE_MONTH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Prix du plan offert par défaut quand le BO n'en a pas choisi (décision n°5). */
const DEFAULT_OFFERED_PRICE = 2000;

const shift = (date: Date | undefined, days: number): Date | undefined =>
  date ? new Date(new Date(date).getTime() + days * DAY_MS) : date;

/**
 * Mois offerts (parrainage aujourd'hui, codes cadeaux et YOYO Business ensuite).
 *
 * Règle (décision n°4) : un mois offert ne remplace jamais un abonnement. Abonnement actif → sa fin
 * recule de 30 jours (un renouvellement programmé est décalé d'autant). Sans abonnement → un
 * abonnement de 30 jours est créé sur le plan offert. Chaque octroi est tracé (`FreeMonthGrant`),
 * ce qui permet de l'afficher dans le CMS et de l'annuler en cas de fraude.
 */
export class FreeMonthService {
  private readonly grants = new FreeMonthGrantSet();
  private readonly subscriptions: any = (new SubscriptionSet() as any).defaultModel;
  private readonly plans: any = (new PlanSet() as any).defaultModel;

  /** Plan offert : celui choisi au BO, sinon le plan actif à 2 000 F, sinon le moins cher payant. */
  async offeredPlan(): Promise<any | null> {
    const { planId } = await new PlatformConfigService().getReferralProgram();
    if (planId) {
      const chosen = await this.plans.findOne({ _id: planId, isActive: true }).lean();
      if (chosen) return chosen;
    }
    return (
      (await this.plans.findOne({ isActive: true, price: DEFAULT_OFFERED_PRICE }).lean()) ??
      (await this.plans.findOne({ isActive: true, price: { $gt: 0 } }).sort({ price: 1 }).lean())
    );
  }

  /**
   * Accorde un mois offert. Idempotent par `(source, ref)` : un second appel pour le même événement
   * renvoie l'octroi existant sans rien prolonger.
   */
  async grant(userId: string, source: FreeMonthSource, ref: string): Promise<IFreeMonthGrant> {
    const model: any = this.grants.defaultModel;
    const existing = await model.findOne({ source, ref }).lean();
    if (existing) return existing;

    // L'octroi est écrit AVANT l'abonnement : l'index unique `(source, ref)` arbitre deux appels
    // simultanés, et seul le gagnant touche à l'abonnement.
    const grant: IFreeMonthGrant = {
      _id: coddyger.string.generateObjectId(),
      user: userId,
      source,
      ref,
      days: FREE_MONTH_DAYS,
      status: 'applied'
    };
    try {
      await model.create(grant);
    } catch (error: any) {
      if (error?.code === 11000) return model.findOne({ source, ref }).lean();
      throw error;
    }

    try {
      const now = new Date();
      const active = await this.subscriptions
        .findOne({ userId, status: 'active', endDate: { $gt: now } })
        .sort({ endDate: -1 })
        .lean();

      if (active) {
        const set: any = { endDate: shift(active.endDate, FREE_MONTH_DAYS) };
        if (active.pendingRenewal?.startDate) {
          set['pendingRenewal.startDate'] = shift(active.pendingRenewal.startDate, FREE_MONTH_DAYS);
          set['pendingRenewal.endDate'] = shift(active.pendingRenewal.endDate, FREE_MONTH_DAYS);
        }
        await this.subscriptions.updateOne({ _id: active._id }, { $set: set });
        await model.updateOne({ _id: grant._id }, { subscriptionId: active._id, mode: 'extended', planId: active.planId });
        return { ...grant, subscriptionId: active._id, mode: 'extended', planId: active.planId };
      }

      const plan = await this.offeredPlan();
      if (!plan) throw new Error('Aucun plan actif à offrir');
      const subscriptionId = coddyger.string.generateObjectId();
      // Écrit directement (sans `createSubscription`) : un mois offert ne doit jamais compter
      // comme un abonnement payé, donc jamais redéclencher le parrainage.
      await this.subscriptions.create({
        _id: subscriptionId,
        userId,
        planId: plan._id,
        startDate: now,
        endDate: shift(now, FREE_MONTH_DAYS),
        status: 'active',
        paymentStatus: 'paid',
        paymentMethod: 'free-month',
        autoRenew: false,
        price: 0,
        currency: plan.currency ?? 'XOF',
        metadata: { source: 'free-month', grantSource: source, grantId: String(grant._id) }
      });
      await model.updateOne({ _id: grant._id }, { subscriptionId, mode: 'created', planId: plan._id });
      return { ...grant, subscriptionId, mode: 'created', planId: plan._id };
    } catch (error) {
      // Rien n'a été accordé : l'octroi ne doit pas rester, sinon il bloquerait un nouvel essai.
      await model.deleteOne({ _id: grant._id }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Annule un octroi (fraude, décision n°9) : les 30 jours sont retirés de l'abonnement s'il court
   * encore, sans jamais ramener sa fin avant aujourd'hui.
   */
  async revoke(grantId: string, reason: string): Promise<IFreeMonthGrant | null> {
    const model: any = this.grants.defaultModel;
    const grant = await model.findOneAndUpdate(
      { _id: grantId, status: 'applied' },
      { status: 'revoked', revokedAt: new Date(), revokedReason: reason },
      { new: true }
    ).lean();
    if (!grant) return null;

    const subscription = grant.subscriptionId ? await this.subscriptions.findOne({ _id: grant.subscriptionId }).lean() : null;
    const now = new Date();
    if (subscription && subscription.status === 'active' && new Date(subscription.endDate) > now) {
      const shortened = shift(subscription.endDate, -grant.days)!;
      const set: any = shortened > now ? { endDate: shortened } : { endDate: now, status: 'expired' };
      if (subscription.pendingRenewal?.startDate) {
        set['pendingRenewal.startDate'] = shift(subscription.pendingRenewal.startDate, -grant.days);
        set['pendingRenewal.endDate'] = shift(subscription.pendingRenewal.endDate, -grant.days);
      }
      await this.subscriptions.updateOne({ _id: subscription._id }, { $set: set });
    }
    return grant;
  }

  /** Octrois d'un utilisateur, du plus récent au plus ancien (fiche client du CMS). */
  async listFor(userId: string): Promise<IFreeMonthGrant[]> {
    return this.grants.defaultModel.find({ user: userId }).sort({ createdAt: -1 }).lean() as any;
  }
}
