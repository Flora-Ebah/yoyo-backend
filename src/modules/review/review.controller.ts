import coddyger, { IErrorObject, defines } from 'coddyger';
import { ReviewService } from './review.service';

const controllerLabel: string = 'ReviewController';

export class ReviewController {
  private readonly service: ReviewService;

  constructor() {
    this.service = new ReviewService();
  }

  upsert(partnerId: string, clientId: string, emoji: number) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!partnerId || !clientId) {
          return resolve({ status: defines.status.badRequest, message: 'Paramètres manquants.', data: null });
        }
        const n = Math.round(Number(emoji));
        if (!(n >= 1 && n <= 5)) {
          return resolve({ status: defines.status.badRequest, message: 'La note doit être comprise entre 1 et 5.', data: null });
        }
        const result: any = await this.service.upsertReview(partnerId, clientId, n);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Avis enregistré.', data: result });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'upsert'));
  }

  summary(partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getSummary(partnerId);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'summary'));
  }

  getAll(payloads: { page?: number; pageSize?: number; status?: string; from?: string; to?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getAll(payloads);
        if (items && items.error) return reject(items);
        resolve({ status: defines.status.requestOK, message: items.data, data: items.rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getAll'));
  }

  hide(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.hide(id);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Avis masqué.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'hide'));
  }

  remove(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.remove(id);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Avis supprimé.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'remove'));
  }
}
