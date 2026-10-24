import { LoggerService, LogLevel } from 'coddyger';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { getFirebaseApp } from '../../helpers/firebase-admin.helper';
import { DeviceTokenService } from '../../modules/device-token/device-token.service';
import { DeviceApp } from '../../modules/device-token/device-token.interface';
import { ClientSet } from '../../modules/client/client.model';

/** Limite de jetons par appel `sendEachForMulticast` imposée par FCM. */
const FCM_BATCH_SIZE = 500;

/**
 * Codes d'erreur FCM qui signifient « ce jeton ne servira plus jamais » (appli désinstallée,
 * jeton expiré ou corrompu). Les autres erreurs (quota, réseau, charge invalide) ne justifient
 * pas de supprimer le jeton.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

export interface FcmMessage {
  title: string;
  body: string;
  /** Données transmises à l'appli au tap (`url`, `event`, identifiants…), converties en chaînes. */
  data?: Record<string, any>;
}

export interface FcmSendOptions {
  /** Limite l'envoi aux appareils d'une application (`pro` pour les notifications marchand). */
  app?: DeviceApp;
  /**
   * Diffusion éditoriale (CMS) : respecte les préférences du compte (`push` et `types.news`).
   * Les messages transactionnels (réduction, paiement, support, sécurité) partent toujours.
   */
  editorial?: boolean;
}

export interface FcmSendResult {
  sent: number;
  failed: number;
  /** Vrai quand Firebase n'est pas configuré : rien n'a été tenté. */
  skipped?: boolean;
}

/** FCM n'accepte que des chaînes dans `data`. */
const toStringData = (data?: Record<string, any>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return out;
};

/**
 * Envoi des push Firebase Cloud Messaging (Android et iOS, appli fermée comprise). Le socket
 * reste le canal temps réel quand l'appli est ouverte ; FCM couvre tout le reste.
 */
export class FcmService {
  private readonly serviceLabel = 'FcmService';
  private readonly tokens = new DeviceTokenService();

  /** Instance Messaging, ou `null` si Firebase n'est pas configuré (envoi ignoré, sans erreur). */
  protected messaging(): Messaging | null {
    const app = getFirebaseApp();
    return app ? getMessaging(app) : null;
  }

  /** Utilisateurs (parmi `userIds`) qui ont désactivé les push ou les actualités. */
  private async optedOut(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const model: any = (new ClientSet() as any).defaultModel;
    const rows: any[] = await model
      .find(
        {
          _id: { $in: userIds },
          $or: [{ 'notificationPreferences.push': false }, { 'notificationPreferences.types.news': false }]
        },
        '_id'
      )
      .lean();
    return new Set(rows.map(r => String(r._id)));
  }

  async sendToUsers(userIds: string[] | 'all', message: FcmMessage, options: FcmSendOptions = {}): Promise<FcmSendResult> {
    const messaging = this.messaging();
    if (!messaging) return { sent: 0, failed: 0, skipped: true };

    let targets = await this.tokens.tokensFor(userIds, options.app);
    if (options.editorial && targets.length > 0) {
      const excluded = await this.optedOut([...new Set(targets.map(t => t.user))]);
      targets = targets.filter(t => !excluded.has(t.user));
    }
    if (targets.length === 0) return { sent: 0, failed: 0 };

    const data = toStringData(message.data);
    const tokens = [...new Set(targets.map(t => t.token))];
    const dead: string[] = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
      const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
      try {
        const response = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: message.title, body: message.body },
          data,
          android: {
            priority: 'high',
            // Canal « default » : créé au démarrage par les deux applis.
            notification: { channelId: 'default', sound: 'default' }
          },
          apns: { payload: { aps: { sound: 'default' } } }
        });
        sent += response.successCount;
        failed += response.failureCount;
        response.responses.forEach((r, index) => {
          if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(batch[index]);
        });
      } catch (error) {
        failed += batch.length;
        LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'sendToUsers' });
      }
    }

    if (dead.length > 0) {
      await this.tokens.removeTokens(dead).catch(() => undefined);
    }

    return { sent, failed };
  }
}

export const fcmService = new FcmService();
