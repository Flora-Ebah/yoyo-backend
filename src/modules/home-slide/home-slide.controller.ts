import coddyger, { IErrorObject, defines } from 'coddyger';
import { HomeSlideService } from './home-slide.service';
import { IHomeSlide } from './home-slide.interface';

const controllerLabel: string = 'HomeSlideController';

export class HomeSlideController {
  private readonly service: HomeSlideService;

  constructor() {
    this.service = new HomeSlideService();
  }

  getPublic() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getPublic();
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getPublic'));
  }

  getAll(payloads: { page?: number; pageSize?: number }) {
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

  create(item: IHomeSlide, createdBy?: any) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!item?.image) return resolve({ status: defines.status.badRequest, message: "L'image est requise.", data: null });
        const save: any = await this.service.create({ ...item, createdBy });
        if (save && save.error) return reject(save);
        resolve({ status: defines.status.requestOK, message: 'Slide créée.', data: save });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'create'));
  }

  update(id: string, item: Partial<IHomeSlide>) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.update(id, item);
        if (result && result.error) return reject(result);
        resolve({ status: defines.status.requestOK, message: 'Slide mise à jour.', data: result });
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
        resolve({ status: defines.status.requestOK, message: 'Slide supprimée.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'remove'));
  }
}
