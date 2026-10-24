import { LoggerService, LogLevel } from 'coddyger';
import { ClientSet } from '../client/client.model';
import { FreeMonthService } from '../subscription/free-month.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PushNotificationService } from '../push-notification/push-notification.service';
import { Events } from '../push-notification/push-notification.model';

/** Règle de vitesse (Excel n°6) : au-delà de 5 filleuls inscrits en 24 h, le parrain passe en revue. */
export const REFERRAL_VELOCITY_MAX = 5;
const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Relances (Excel n°12) : une par semaine au plus, deux en tout. */
export const REFERRAL_MAX_NUDGES = 2;
const NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** Fraude (décision n°9) : blocage du compte au 2ᵉ avertissement. */
const WARNINGS_BEFORE_SUSPENSION = 2;

const CLOSED_STATUSES = ['removed', 'archived', 'anonymized'];

export type RewardStatus = 'none' | 'pending-review' | 'applied' | 'revoked' | 'blocked' | 'closed';
export type ReferredStatus = 'registered' | 'validated' | 'rejected';

/** « Awa K. » : jamais d'e-mail ni de téléphone d'un filleul côté parrain. */
const displayName = (c: any): string => {
  const first = (c.firstname ?? '').trim();
  const initial = (c.lastname ?? '').trim().charAt(0);
  return [first, initial ? `${initial.toUpperCase()}.` : ''].filter(Boolean).join(' ') || 'Nouveau membre';
};

const referredStatus = (c: any): ReferredStatus =>
  c.referralRejected ? 'rejected' : c.referralCredited ? 'validated' : 'registered';

/** Lien de parrainage public. Même domaine que les App Links (`/.well-known`) du backend. */
export const referralLink = (code: string): string | null => {
  const base = (process.env.CLIENT_APP_URL ?? process.env.PRO_APP_URL ?? '').trim().replace(/\/+$/, '');
  return base && code ? `${base}/r/${code}` : null;
};

/**
 * Programme de parrainage (Excel Parrainage n°1, 2, 5, 6, 9, 11, 12).
 *
 * Un filleul compte à son 1er abonnement PAYÉ. Au `referralsPerReward`-ième filleul validé, le
 * parrain reçoit UN mois offert (une seule récompense par parrain), dans la limite des
 * `rewardCap` premières récompenses du programme. Les comptes suspects passent par une revue
 * dans le CMS avant toute récompense.
 */
export class ReferralService {
  private readonly serviceLabel = 'ReferralService';
  private readonly clients: any = (new ClientSet() as any).defaultModel;
  private readonly freeMonths = new FreeMonthService();
  private readonly config = new PlatformConfigService();

  private log(method: string, error: unknown) {
    LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method });
  }

  /** Push au parrain (appli Client), qui ouvre l'écran « Mes parrainages » au tap. */
  private async notify(userId: string, title: string, body: string): Promise<void> {
    await new PushNotificationService()
      .create({
        title,
        body,
        type: 'info',
        priority: 'normal',
        status: 'pending',
        target: Events.USER_NOTIFICATION,
        data: { userId: String(userId), app: 'client', url: '/referral', kind: 'referral' }
      } as any)
      .catch((error) => this.log('notify', error));
  }

  // ===================== Cycle de vie d'un filleul =====================

  /**
   * Filleul inscrit (avant toute vérification) : applique la règle de vitesse au parrain. Les
   * inscriptions jamais vérifiées comptent aussi : c'est justement le signe de faux comptes.
   */
  async onRegistered(referrerId: string): Promise<void> {
    try {
      const referrer = await this.clients.findOne({ _id: referrerId }, 'referralReviewClearedAt referralReview').lean();
      if (!referrer || referrer.referralReview) return;
      const since = new Date(Math.max(Date.now() - VELOCITY_WINDOW_MS, new Date(referrer.referralReviewClearedAt ?? 0).getTime()));
      const recent = await this.clients.countDocuments({ referredBy: referrerId, createdAt: { $gte: since } });
      if (recent > REFERRAL_VELOCITY_MAX) {
        await this.clients.updateOne({ _id: referrerId }, { referralReview: true });
      }
    } catch (error) {
      this.log('onRegistered', error);
    }
  }

  /** Filleul activé (e-mail vérifié) : on prévient le parrain. */
  async onActivated(clientId: string): Promise<void> {
    try {
      const referred = await this.clients.findOne({ _id: clientId }, 'referredBy firstname lastname').lean();
      if (!referred?.referredBy) return;
      const { referralsPerReward } = await this.config.getReferralProgram();
      await this.notify(
        referred.referredBy,
        'Un filleul a rejoint YoYo 🎉',
        `${displayName(referred)} s'est inscrit avec votre code. Il comptera dès son premier abonnement (objectif : ${referralsPerReward}).`
      );
    } catch (error) {
      this.log('onActivated', error);
    }
  }

  /**
   * Filleul validé : appelé à chaque abonnement PAYÉ, une seule prise en compte par filleul.
   * Remplace `ClientService.creditReferrerForPaidReferral`, qui ne faisait qu'incrémenter un compteur.
   */
  async onPaidSubscription(referredId: string): Promise<void> {
    try {
      const referred = await this.clients
        .findOne({ _id: referredId }, 'referredBy referralCredited referralRejected signupDeviceId contact firstname lastname')
        .lean();
      if (!referred?.referredBy || referred.referralCredited || referred.referralRejected) return;

      const referrer = await this.clients
        .findOne({ _id: referred.referredBy, status: { $nin: CLOSED_STATUSES } }, 'signupDeviceId contact')
        .lean();
      if (!referrer) return;

      // Auto-parrainage (Excel n°6) : même appareil ou même numéro que le parrain → jamais compté.
      const rejection =
        referred.signupDeviceId && referred.signupDeviceId === referrer.signupDeviceId
          ? 'same-device'
          : referred.contact && referred.contact === referrer.contact
            ? 'same-phone'
            : null;
      if (rejection) {
        await this.clients.updateOne({ _id: referredId }, { referralRejected: rejection });
        return;
      }

      // Marquage atomique : deux paiements simultanés du même filleul ne comptent qu'une fois.
      const marked = await this.clients.updateOne(
        { _id: referredId, referralCredited: { $ne: true } },
        { referralCredited: true, referralValidatedAt: new Date() }
      );
      if (!marked.modifiedCount) return;

      const updated = await this.clients
        .findOneAndUpdate({ _id: referred.referredBy }, { $inc: { referredCount: 1 } }, { new: true })
        .lean();
      const { referralsPerReward } = await this.config.getReferralProgram();
      const count = updated?.referredCount ?? 0;

      if (count < referralsPerReward) {
        await this.notify(
          referred.referredBy,
          'Filleul validé ✅',
          `${displayName(referred)} vient de s'abonner : ${count}/${referralsPerReward}. Encore ${referralsPerReward - count} pour votre mois offert !`
        );
        return;
      }
      await this.tryReward(String(referred.referredBy));
    } catch (error) {
      this.log('onPaidSubscription', error);
    }
  }

  /**
   * Attribue LA récompense du parrain si toutes les conditions sont réunies : objectif atteint,
   * aucune récompense déjà reçue, pas de revue en cours ni de fraude, programme ouvert.
   */
  async tryReward(referrerId: string): Promise<RewardStatus> {
    const referrer = await this.clients
      .findOne({ _id: referrerId }, 'referredCount referralRewardId referralReview referralRewardBlocked status')
      .lean();
    if (!referrer || CLOSED_STATUSES.includes(referrer.status)) return 'none';
    if (referrer.referralRewardId) return 'applied';
    if (referrer.referralRewardBlocked) return 'blocked';

    const program = await this.config.getReferralProgram();
    if ((referrer.referredCount ?? 0) < program.referralsPerReward) return 'none';
    if (referrer.referralReview) return 'pending-review';
    if (!program.enabled) return 'closed';
    if (!(await this.config.reserveReferralReward(program.rewardCap))) return 'closed';

    try {
      const grant = await this.freeMonths.grant(referrerId, 'referral', referrerId);
      await this.clients.updateOne({ _id: referrerId }, { referralRewardId: grant._id, $inc: { freeMonthsGranted: 1 } });
      await this.notify(
        referrerId,
        'Votre mois offert est activé 🎁',
        `Merci d'avoir fait découvrir YoYo à ${program.referralsPerReward} amis : 30 jours d'abonnement vous sont offerts.`
      );
      return 'applied';
    } catch (error) {
      await this.config.releaseReferralReward().catch(() => undefined);
      this.log('tryReward', error);
      return 'none';
    }
  }

  // ===================== Écran « Mes parrainages » (appli Client) =====================

  async info(clientId: string): Promise<any> {
    const client = await this.clients
      .findOne(
        { _id: clientId },
        'referralCode referredCount referralRewardId referralReview referralRewardBlocked freeMonthsGranted'
      )
      .lean();
    if (!client) return null;

    const [program, referred, grant] = await Promise.all([
      this.config.getReferralProgram(),
      this.clients
        .find({ referredBy: clientId, status: { $nin: CLOSED_STATUSES } }, 'firstname lastname referralCredited referralRejected createdAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      client.referralRewardId ? this.freeMonths.listFor(clientId).then(list => list.find(g => String(g._id) === String(client.referralRewardId))) : null
    ]);

    const placesLeft = Math.max(0, program.rewardCap - program.granted);
    const validated = client.referredCount ?? 0;
    let rewardStatus: RewardStatus = 'none';
    if (grant) rewardStatus = grant.status === 'revoked' ? 'revoked' : 'applied';
    else if (client.referralRewardBlocked) rewardStatus = 'blocked';
    else if (validated >= program.referralsPerReward && client.referralReview) rewardStatus = 'pending-review';
    else if (!program.enabled || placesLeft === 0) rewardStatus = 'closed';

    return {
      code: client.referralCode ?? null,
      link: referralLink(client.referralCode),
      validated,
      goal: program.referralsPerReward,
      rewardStatus,
      rewardGrantedAt: grant?.createdAt ?? null,
      placesLeft,
      // Rétro-compat : champs lus par les versions précédentes de l'appli.
      referralCode: client.referralCode ?? null,
      referredCount: validated,
      freeMonthsGranted: client.freeMonthsGranted ?? 0,
      referred: referred.map((r: any) => ({ name: displayName(r), status: referredStatus(r), joinedAt: r.createdAt }))
    };
  }

  // ===================== CMS =====================

  /** Fiche client : parrain, filleuls (avec contact, réservé aux admins) et mois offerts. */
  async adminDetail(clientId: string): Promise<any> {
    const client = await this.clients
      .findOne(
        { _id: clientId },
        'referralCode referredBy referredCount referralReview referralRewardBlocked referralWarnings referralRejected referralCredited signupDeviceId'
      )
      .lean();
    if (!client) return null;
    const [referrer, referred, grants, program] = await Promise.all([
      client.referredBy ? this.clients.findOne({ _id: client.referredBy }, 'firstname lastname email referralCode').lean() : null,
      this.clients
        .find({ referredBy: clientId }, 'firstname lastname email contact status referralCredited referralRejected referralValidatedAt createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      this.freeMonths.listFor(clientId),
      this.config.getReferralProgram()
    ]);
    return {
      code: client.referralCode ?? null,
      goal: program.referralsPerReward,
      validated: client.referredCount ?? 0,
      review: !!client.referralReview,
      rewardBlocked: !!client.referralRewardBlocked,
      warnings: client.referralWarnings ?? 0,
      ownStatus: client.referredBy ? referredStatus(client) : null,
      ownRejection: client.referralRejected ?? null,
      referrer,
      referred: referred.map((r: any) => ({ ...r, referralStatus: referredStatus(r) })),
      grants
    };
  }

  /** Parrains en attente de vérification (règle de vitesse), du plus actif au moins actif. */
  async reviewList(): Promise<any[]> {
    const rows = await this.clients
      .find({ referralReview: true, status: { $nin: CLOSED_STATUSES } }, 'firstname lastname email contact referralCode referredCount referralWarnings')
      .sort({ referredCount: -1 })
      .lean();
    const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
    return Promise.all(
      rows.map(async (r: any) => ({
        ...r,
        registeredLast24h: await this.clients.countDocuments({ referredBy: r._id, createdAt: { $gte: since } }),
        registeredTotal: await this.clients.countDocuments({ referredBy: r._id })
      }))
    );
  }

  /** Revue levée : le parrain est légitime, sa récompense part si l'objectif est atteint. */
  async approve(referrerId: string): Promise<RewardStatus> {
    await this.clients.updateOne({ _id: referrerId }, { referralReview: false, referralReviewClearedAt: new Date() });
    return this.tryReward(referrerId);
  }

  /**
   * Fraude confirmée (décision n°9) : récompense annulée (ou refusée si elle n'était pas encore
   * attribuée), avertissement par push, compte suspendu à la récidive.
   */
  async markFraud(referrerId: string, reason: string): Promise<{ revoked: boolean; suspended: boolean }> {
    const client = await this.clients.findOne({ _id: referrerId }, 'referralRewardId referralWarnings').lean();
    if (!client) throw new Error('Client introuvable');

    let revoked = false;
    if (client.referralRewardId) {
      revoked = !!(await this.freeMonths.revoke(String(client.referralRewardId), reason));
      if (revoked) await this.config.releaseReferralReward().catch(() => undefined);
    }
    const warnings = (client.referralWarnings ?? 0) + 1;
    const suspended = warnings >= WARNINGS_BEFORE_SUSPENSION;
    await this.clients.updateOne(
      { _id: referrerId },
      {
        referralReview: false,
        referralReviewClearedAt: new Date(),
        referralRewardBlocked: true,
        referralWarnings: warnings,
        ...(suspended ? { status: 'suspended' } : {})
      }
    );
    await this.notify(
      referrerId,
      'Parrainage : récompense annulée',
      suspended
        ? 'Votre compte est suspendu suite à une nouvelle fraude au parrainage. Contactez le support pour contester.'
        : `Votre récompense de parrainage a été annulée (${reason}). En cas de récidive, le compte sera suspendu. Vous pouvez contester via le support.`
    );
    return { revoked, suspended };
  }

  // ===================== Relances (cron) =====================

  /** Relance les parrains arrêtés à mi-chemin (1/3, 2/3) : une fois par semaine, deux fois au plus. */
  async nudgeStalled(): Promise<number> {
    const program = await this.config.getReferralProgram();
    if (!program.enabled || program.granted >= program.rewardCap) return 0;
    const before = new Date(Date.now() - NUDGE_INTERVAL_MS);
    const stalled = await this.clients
      .find(
        {
          status: 'active',
          referredCount: { $gte: 1, $lt: program.referralsPerReward },
          referralRewardId: { $exists: false },
          referralRewardBlocked: { $ne: true },
          referralNudges: { $not: { $gte: REFERRAL_MAX_NUDGES } },
          $or: [{ referralLastNudgeAt: { $exists: false } }, { referralLastNudgeAt: { $lte: before } }]
        },
        '_id referredCount'
      )
      .limit(500)
      .lean();
    for (const c of stalled) {
      const missing = program.referralsPerReward - (c.referredCount ?? 0);
      await this.notify(
        c._id,
        'Plus que ' + missing + (missing > 1 ? ' amis' : ' ami') + ' pour votre mois offert',
        `Vous êtes à ${c.referredCount}/${program.referralsPerReward}. Partagez votre code YoYo, il reste ${Math.max(0, program.rewardCap - program.granted)} places.`
      );
      await this.clients.updateOne({ _id: c._id }, { $inc: { referralNudges: 1 }, referralLastNudgeAt: new Date() });
    }
    return stalled.length;
  }
}

export const referralService = new ReferralService();
