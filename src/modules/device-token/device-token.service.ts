import mongoose from 'mongoose';
import { DeviceApp, DevicePlatform } from './device-token.interface';
import { DeviceTokenSet } from './device-token.model';

/** Délai au-delà duquel un appareil qui ne s'est plus manifesté est oublié. */
export const DEVICE_TOKEN_TTL_DAYS = 60;

export class DeviceTokenService {
  private readonly dao: DeviceTokenSet;

  constructor() {
    this.dao = new DeviceTokenSet();
  }

  private get model(): any {
    return (this.dao as any).defaultModel;
  }

  /**
   * Enregistre (ou rafraîchit) le jeton d'un appareil pour l'utilisateur connecté. Un jeton déjà
   * connu sous un autre compte lui est réattribué : c'est le dernier compte connecté sur
   * l'appareil qui doit recevoir les push.
   */
  async register(userId: string, input: { token: string; app: DeviceApp; platform: DevicePlatform }): Promise<void> {
    await this.model.updateOne(
      { token: input.token },
      {
        $set: { user: userId, app: input.app, platform: input.platform, lastSeenAt: new Date() },
        $setOnInsert: { _id: new mongoose.Types.ObjectId() }
      },
      { upsert: true }
    );
  }

  /** Retire le jeton à la déconnexion, seulement s'il appartient bien à l'appelant. */
  async unregister(userId: string, token: string): Promise<boolean> {
    const result = await this.model.deleteOne({ token, user: userId });
    return (result?.deletedCount ?? 0) > 0;
  }

  /**
   * Jetons des utilisateurs donnés (tous si `userIds` vaut `'all'`), filtrés par application.
   * Renvoie aussi l'utilisateur pour pouvoir appliquer ses préférences.
   */
  async tokensFor(userIds: string[] | 'all', app?: DeviceApp): Promise<Array<{ token: string; user: string }>> {
    const query: any = {};
    if (userIds !== 'all') {
      const ids = userIds.map(String).filter(id => mongoose.isValidObjectId(id));
      if (ids.length === 0) return [];
      query.user = { $in: ids };
    }
    if (app) query.app = app;
    const rows: any[] = await this.model.find(query, 'token user').lean();
    return rows.map(r => ({ token: r.token, user: String(r.user) }));
  }

  /** Supprime des jetons que FCM a déclarés invalides (appli désinstallée, jeton expiré). */
  async removeTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.model.deleteMany({ token: { $in: tokens } });
  }

  /** Purge les appareils qui ne se sont plus manifestés depuis `DEVICE_TOKEN_TTL_DAYS` jours. */
  async purgeStale(now: Date = new Date()): Promise<number> {
    const limit = new Date(now.getTime() - DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.model.deleteMany({ lastSeenAt: { $lt: limit } });
    return result?.deletedCount ?? 0;
  }
}
