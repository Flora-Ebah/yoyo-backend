import coddyger, { IErrorObject, defines } from 'coddyger';
import {
  NotificationBroadcastService,
  BroadcastAudience,
  BroadcastInput,
  BROADCAST_HOURLY_LIMIT
} from './notification-broadcast.service';

const controllerLabel: string = 'NotificationBroadcastController';

export class NotificationBroadcastController {
  private readonly service: NotificationBroadcastService;

  constructor() {
    this.service = new NotificationBroadcastService();
  }

  preview(body: BroadcastAudience) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.service.preview(body);
        resolve({ status: defines.status.requestOK, message: `${result.recipients} destinataire(s).`, data: result });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'preview'));
  }

  broadcast(body: BroadcastInput) {
    return new Promise(async (resolve, reject) => {
      try {
        if (body.destination === 'partner' && !body.partnerId) {
          return resolve({ status: defines.status.badRequest, message: 'Choisissez la boutique à ouvrir.', data: null });
        }
        const result = await this.service.broadcast(body);
        if (result.limited) {
          return resolve({
            status: 429,
            message: `Limite atteinte : ${BROADCAST_HOURLY_LIMIT} diffusions par heure au maximum. Réessayez plus tard.`,
            data: null
          });
        }
        resolve({
          status: defines.status.requestOK,
          message: `Notification envoyée à ${result.sent} destinataire(s).`,
          data: result
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'broadcast'));
  }
}
