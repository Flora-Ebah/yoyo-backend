import coddyger, { IErrorObject, defines } from 'coddyger';
import { GeoService } from './geo.service';

const controllerLabel: string = 'GeoController';

export class GeoController {
  private readonly service: GeoService;

  constructor() {
    this.service = new GeoService();
  }

  ping(userId: string, lat: number, lng: number) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!userId) return resolve({ status: defines.status.unauthorized, message: 'Non authentifié.', data: null });
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          return resolve({ status: defines.status.badRequest, message: 'Coordonnées invalides.', data: null });
        }
        const result = await this.service.handlePing(userId, lat, lng);
        resolve({ status: defines.status.requestOK, message: 'OK', data: result });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'ping'));
  }
}
