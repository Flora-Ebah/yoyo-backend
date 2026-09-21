import coddyger, { IErrorObject, defines } from 'coddyger';
import { BoutiqueManagerService } from './boutique-manager.service';

const controllerLabel = 'BoutiqueManagerController';

export class BoutiqueManagerController {
  private readonly service: BoutiqueManagerService;

  constructor() {
    this.service = new BoutiqueManagerService();
  }

  invite(ownerId: string, payload: { boutiqueId: string; name: string; phone: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.invite({
          ownerId,
          boutiqueId: payload.boutiqueId,
          name: payload.name,
          phone: payload.phone
        });

        if (!result.success) {
          return resolve({ status: defines.status.badRequest, message: result.message, data: null });
        }

        resolve({ status: defines.status.created, message: 'Gérant invité', data: result.data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'invite'));
  }

  listByOwner(ownerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const rows = await this.service.listByOwner(ownerId);
        resolve({ status: defines.status.requestOK, message: 'Ok', data: rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listByOwner'));
  }

  listByBoutique(boutiqueId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const rows = await this.service.listByBoutique(boutiqueId);
        resolve({ status: defines.status.requestOK, message: 'Ok', data: rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listByBoutique'));
  }

  remove(id: string, ownerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.remove(id, ownerId);
        if (!result.success) {
          return resolve({ status: defines.status.badRequest, message: result.message, data: null });
        }
        resolve({ status: defines.status.requestOK, message: 'Gérant retiré', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'remove'));
  }
}
