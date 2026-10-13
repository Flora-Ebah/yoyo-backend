import { ClientSet } from '../client/client.model';
import { PartnerSet } from '../partner/partner.model';
import { SettingsService } from '../settings/settings.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PushNotificationService } from '../push-notification/push-notification.service';

/** Distance en mètres entre deux points GPS (formule de Haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Push par proximité (#1). L'app remonte la position (background). Le serveur calcule le partenaire
 * le plus proche dans le rayon configuré au BO et envoie une notif FCM, avec anti-spam.
 * Tout est piloté par `proximityPush` — aucune valeur en dur. Le BO l'enregistre dans platform-config
 * (`PUT /platform-config`) ; `settings.proximityPush` n'est plus qu'un repli pour les anciennes bases.
 */
export class GeoService {
  private readonly clientDao: ClientSet;
  private readonly partnerDao: PartnerSet;
  private readonly settings: SettingsService;
  private readonly platformConfig: PlatformConfigService;
  private readonly pushService: PushNotificationService;

  constructor() {
    this.clientDao = new ClientSet();
    this.partnerDao = new PartnerSet();
    this.settings = new SettingsService();
    this.platformConfig = new PlatformConfigService();
    this.pushService = new PushNotificationService();
  }

  async handlePing(userId: string, lat: number, lng: number): Promise<{ updated: boolean; notified: boolean; partner?: any }> {
    // 1) Mémoriser la dernière position.
    await this.clientDao.update({ _id: userId }, { lastLocation: { lat, lng, at: new Date() } });

    // 2) Config BO. Lue dans platform-config, là où le BO l'écrit : elle était lue dans `settings`,
    // que le BO ne met jamais à jour pour ce champ — le rayon restait vide et aucune notif ne partait.
    const platform: any = await this.platformConfig.get().catch(() => null);
    const legacy: any = platform?.proximityPush?.radiusMeters > 0 ? null : await this.settings.getSettings();
    const prox = platform?.proximityPush?.radiusMeters > 0 ? platform.proximityPush : legacy?.proximityPush;
    if (!prox || !prox.radiusMeters || prox.radiusMeters <= 0) {
      return { updated: true, notified: false };
    }

    // 3) Anti-spam : pas plus d'une notif par `minIntervalHours`.
    const client: any = await this.clientDao.selectOne({ _id: userId });
    if (!client || client.error) return { updated: true, notified: false };
    const minMs = (Number(prox.minIntervalHours) || 0) * 3600 * 1000;
    if (client.lastProximityPushAt && Date.now() - new Date(client.lastProximityPushAt).getTime() < minMs) {
      return { updated: true, notified: false };
    }

    // 4) Partenaires géolocalisés (option : sponsorisés uniquement).
    const params: any = {
      status: { $nin: ['removed', 'archived'] },
      latitude: { $ne: null },
      longitude: { $ne: null }
    };
    if (prox.target === 'sponsored') params.isSponsored = true;

    const list: any = await this.partnerDao.selectHug(params);
    const partners: any[] = Array.isArray(list) ? list : [];

    // 5) Le plus proche dans le rayon.
    let nearest: any = null;
    let nearestDist = Infinity;
    for (const p of partners) {
      if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
      const d = distanceMeters(lat, lng, p.latitude, p.longitude);
      if (d <= prox.radiusMeters && d < nearestDist) {
        nearest = p;
        nearestDist = d;
      }
    }

    if (!nearest) return { updated: true, notified: false };

    // 6) Envoi FCM via l'infra existante + horodatage anti-spam.
    await this.pushService.create({
      title: 'Une bonne affaire près de vous 🎉',
      body: `${nearest.name} est tout proche. Profitez-en avec votre carte YoYo !`,
      type: 'info',
      priority: 'high',
      status: 'pending',
      data: { userId, kind: 'proximity', partnerId: String(nearest._id), partnerName: nearest.name }
    } as any);

    await this.clientDao.update({ _id: userId }, { lastProximityPushAt: new Date() });

    return { updated: true, notified: true, partner: { _id: nearest._id, name: nearest.name } };
  }
}
