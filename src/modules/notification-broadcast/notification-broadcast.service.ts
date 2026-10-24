import { LoggerService, LogLevel } from 'coddyger';
import { NotificationService, NotificationSet } from '../notification';
import { NotificationType, NotificationCategory } from '../../services/notification/notification.interface';
import { ClientSet } from '../client/client.model';
import { PartnerSet } from '../partner/partner.model';
import { SubscriptionSet } from '../subscription/subscription.model';
import { BoutiqueManagerSet } from '../boutique-manager/boutique-manager.model';
import { PushNotificationService } from '../push-notification/push-notification.service';

export type BroadcastSegment = 'all' | 'clients' | 'partners';

/** Écran ouvert au tap sur la notification ; chaque appli le traduit en route. */
export type BroadcastDestination = 'home' | 'subscription' | 'notifications' | 'partner';

/** Nombre maximal de diffusions par heure, tous administrateurs confondus (anti-spam). */
export const BROADCAST_HOURLY_LIMIT = 3;

export interface BroadcastAudience {
  segment: BroadcastSegment;
  /** Clients : abonnés actifs (`active`) ou sans abonnement actif (`none`). */
  subscription?: 'active' | 'none';
  /** Clients : abonnés actifs à ce plan. */
  planId?: string;
  /** Marchands : boutiques de cette ville. */
  ville?: string;
  /** Marchands : boutiques actuellement boostées. */
  sponsored?: boolean;
}

export interface BroadcastInput extends BroadcastAudience {
  category: string;
  title?: string;
  message: string;
  destination?: BroadcastDestination;
  partnerId?: string;
}

/** Statuts de compte exclus de toute diffusion. */
const EXCLUDED_STATUSES = ['removed', 'archived', 'anonymized'];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Diffusion d'une notification à un segment d'utilisateurs (Excel CMS n°15) : socket + section
 * Notifications + push FCM (appli fermée). Le ciblage fin (abonnement, plan, ville, boost) se
 * résout ici, côté serveur.
 */
export class NotificationBroadcastService {
  private readonly notifications: NotificationService;
  private readonly clients: ClientSet;

  constructor() {
    this.notifications = new NotificationService();
    this.clients = new ClientSet();
  }

  private model(set: any): any {
    return set.defaultModel;
  }

  /** Abonnés actifs (éventuellement à un plan donné). */
  private async activeSubscribers(planId?: string): Promise<string[]> {
    const query: any = { status: 'active', endDate: { $gt: new Date() } };
    if (planId) query.planId = planId;
    const ids: any[] = await this.model(new SubscriptionSet()).distinct('userId', query);
    return ids.map(String);
  }

  /** Propriétaires et gérants actifs des boutiques qui répondent au filtre. */
  private async merchantsOf(filter: { ville?: string; sponsored?: boolean }): Promise<string[]> {
    const query: any = { status: 'active' };
    if (filter.ville) query.ville = { $regex: `^${escapeRegex(filter.ville.trim())}$`, $options: 'i' };
    if (filter.sponsored) query.isSponsored = true;
    const partners: any[] = await this.model(new PartnerSet()).find(query, '_id user').lean();
    const owners = partners.map(p => String(p.user)).filter(Boolean);
    const managers: any[] = await this.model(new BoutiqueManagerSet()).distinct('manager', {
      boutique: { $in: partners.map(p => p._id) },
      status: 'active'
    });
    return [...new Set([...owners, ...managers.map(String)])];
  }

  /** Résout les identifiants des destinataires (comptes actifs uniquement). */
  async recipients(audience: BroadcastAudience): Promise<string[]> {
    if (audience.segment === 'partners' && (audience.ville || audience.sponsored)) {
      const ids = await this.merchantsOf(audience);
      if (ids.length === 0) return [];
      const rows: any[] = await this.model(this.clients)
        .find({ _id: { $in: ids }, status: { $nin: EXCLUDED_STATUSES } }, '_id')
        .lean();
      return rows.map(r => String(r._id));
    }

    const params: any = { status: { $nin: EXCLUDED_STATUSES } };
    if (audience.segment === 'clients') {
      params.isPartner = false;
      // Les gérants ont un compte client mais n'utilisent que l'appli Pro.
      params.isManager = { $ne: true };
      if (audience.planId || audience.subscription === 'active') {
        params._id = { $in: await this.activeSubscribers(audience.planId) };
      } else if (audience.subscription === 'none') {
        params._id = { $nin: await this.activeSubscribers() };
      }
    }
    if (audience.segment === 'partners') {
      params.$or = [{ isPartner: true }, { isManager: true }];
    }

    const rows: any = await this.clients.selectHug(params);
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => String(r._id)).filter(Boolean);
  }

  /** Nombre de destinataires, affiché par le CMS avant confirmation. */
  async preview(audience: BroadcastAudience): Promise<{ recipients: number }> {
    return { recipients: (await this.recipients(audience)).length };
  }

  /** Vrai si la limite horaire de diffusions est atteinte. */
  async limitReached(now: Date = new Date()): Promise<boolean> {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const count: number = await this.model(new NotificationSet()).countDocuments({
      'data.data.broadcast': true,
      createdAt: { $gte: since }
    });
    return count >= BROADCAST_HOURLY_LIMIT;
  }

  async broadcast(input: BroadcastInput): Promise<{ sent: number; limited?: boolean }> {
    if (await this.limitReached()) return { sent: 0, limited: true };

    const ids = await this.recipients(input);
    if (ids.length === 0) return { sent: 0 };

    const category = Object.values(NotificationCategory).includes(input.category as NotificationCategory)
      ? (input.category as NotificationCategory)
      : NotificationCategory.INFO;

    const audience = {
      segment: input.segment,
      subscription: input.subscription,
      planId: input.planId,
      ville: input.ville,
      sponsored: input.sponsored
    };

    // Historique (tableau « Notifications » du CMS) : la cible et le nombre de destinataires.
    const history: any = await this.notifications.create({
      type: NotificationType.PUSH,
      category,
      to: ids,
      data: {
        title: input.title,
        message: input.message,
        data: { broadcast: true, audience, recipients: ids.length, destination: input.destination ?? 'home' }
      },
      status: 'sent'
    } as any);

    // Publication (socket + section Notifications + FCM) hors du chemin de la requête : une
    // diffusion à des milliers de comptes ne doit pas faire attendre l'administrateur.
    const app = input.segment === 'partners' ? 'pro' : input.segment === 'clients' ? 'client' : undefined;
    const everyone = input.segment === 'all' && !input.subscription && !input.planId;
    void new PushNotificationService()
      .publishFromAdmin({
        title: input.title,
        message: input.message,
        to: everyone ? 'all' : ids,
        data: {
          editorial: true,
          app,
          destination: input.destination ?? 'home',
          partnerId: input.destination === 'partner' ? input.partnerId : undefined
        }
      })
      .catch((error) => {
        LoggerService.log({ type: LogLevel.Error, content: error, location: 'NotificationBroadcastService', method: 'broadcast' });
        if (history?._id) void this.notifications.update(String(history._id), { status: 'failed' } as any);
      });

    return { sent: ids.length };
  }
}
