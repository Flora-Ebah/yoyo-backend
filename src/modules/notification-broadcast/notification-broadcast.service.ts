import { NotificationService } from '../notification';
import { NotificationType, NotificationCategory } from '../../services/notification/notification.interface';
import { ClientSet } from '../client/client.model';

export type BroadcastSegment = 'all' | 'clients' | 'partners';

/**
 * Diffusion d'une notification PUSH à un segment d'utilisateurs.
 *
 * Module/route NEUFS (déploiement fiable). Réutilise le chemin d'envoi par-utilisateur
 * éprouvé (`NotificationService.create`, qui accepte un tableau de destinataires dans `to`).
 */
export class NotificationBroadcastService {
  private readonly notifications: NotificationService;
  private readonly clients: ClientSet;

  constructor() {
    this.notifications = new NotificationService();
    this.clients = new ClientSet();
  }

  /** Résout les identifiants des destinataires selon le segment (comptes actifs uniquement). */
  private async recipients(segment: BroadcastSegment): Promise<string[]> {
    const params: any = { status: { $nin: ['removed', 'archived', 'anonymized'] } };
    if (segment === 'clients') params.isPartner = false;
    if (segment === 'partners') params.isPartner = true;

    const rows: any = await this.clients.selectHug(params);
    if (!Array.isArray(rows)) return [];
    return rows.map((r: any) => String(r._id)).filter(Boolean);
  }

  async broadcast(input: { category: string; segment: BroadcastSegment; title?: string; message: string }): Promise<{ sent: number }> {
    const ids = await this.recipients(input.segment);
    if (ids.length === 0) return { sent: 0 };

    const category = Object.values(NotificationCategory).includes(input.category as NotificationCategory)
      ? (input.category as NotificationCategory)
      : NotificationCategory.INFO;

    await this.notifications.create({
      type: NotificationType.PUSH,
      category,
      to: ids,
      data: { title: input.title, message: input.message },
      status: 'sent'
    } as any);

    return { sent: ids.length };
  }
}
