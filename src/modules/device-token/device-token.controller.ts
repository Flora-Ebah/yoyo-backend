import coddyger, { IErrorObject, defines } from 'coddyger';
import { DeviceTokenService } from './device-token.service';

const controllerLabel: string = 'DeviceTokenController';

export class DeviceTokenController {
  private readonly service: DeviceTokenService;

  constructor() {
    this.service = new DeviceTokenService();
  }

  register(userId: string, body: { token: string; app: 'client' | 'pro'; platform: 'ios' | 'android' }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!userId) return resolve({ status: defines.status.unauthorized, message: 'Non authentifié.', data: null });
        await this.service.register(String(userId), body);
        resolve({ status: defines.status.requestOK, message: 'Appareil enregistré.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'register'));
  }

  unregister(userId: string, token: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!userId) return resolve({ status: defines.status.unauthorized, message: 'Non authentifié.', data: null });
        await this.service.unregister(String(userId), token);
        // Idempotent : un jeton déjà absent n'est pas une erreur pour l'appli qui se déconnecte.
        resolve({ status: defines.status.requestOK, message: 'Appareil retiré.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'unregister'));
  }
}
