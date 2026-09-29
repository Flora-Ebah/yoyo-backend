import coddyger, { IErrorObject, defines } from 'coddyger';
import { InfluencerService } from './influencer.service';
import { IInfluencer } from './influencer.interface';

const controllerLabel: string = 'InfluencerController';

export class InfluencerController {
  private readonly service: InfluencerService;

  constructor() {
    this.service = new InfluencerService();
  }

  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }) {
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

  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        if (!item) return resolve({ status: defines.status.notFound, message: 'Influenceur introuvable.', data: null });
        resolve({ status: defines.status.requestOK, message: 'OK', data: item });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getById'));
  }

  create(item: IInfluencer, createdBy?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!item?.name || !item?.code) {
          return resolve({ status: defines.status.badRequest, message: 'Nom et code sont requis.', data: null });
        }
        const save: any = await this.service.create({ ...item, createdBy });
        if (save && save.error) {
          return resolve({ status: defines.status.badRequest, message: save.message || "Échec de la création.", data: null });
        }
        resolve({ status: defines.status.requestOK, message: 'Influenceur créé.', data: save });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'create'));
  }

  update(id: string, item: Partial<IInfluencer>) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.update(id, item);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Influenceur mis à jour.', data: result });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'update'));
  }

  remove(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.remove(id);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Influenceur supprimé.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'remove'));
  }

  getStats() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getStats();
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getStats'));
  }

  validate(code: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const inf = await this.service.validateCode(code);
        resolve({ status: defines.status.requestOK, message: 'OK', data: { valid: !!inf, name: inf?.name ?? null } });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'validate'));
  }
}
