import coddyger, { IErrorObject, defines } from 'coddyger';
import { NotificationBroadcastService, BroadcastSegment } from './notification-broadcast.service';

const controllerLabel: string = 'NotificationBroadcastController';

export class NotificationBroadcastController {
  private readonly service: NotificationBroadcastService;

  constructor() {
    this.service = new NotificationBroadcastService();
  }

  broadcast(body: { category: string; segment: BroadcastSegment; title?: string; message: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.service.broadcast(body);
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
