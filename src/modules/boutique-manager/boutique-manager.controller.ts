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

  listMine(managerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const rows = await this.service.listByManager(managerId);
        resolve({ status: defines.status.requestOK, message: 'Ok', data: rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listMine'));
  }

  /** Liste paginée des gérants (administration). Pagination dans `message`, lignes dans `data`. */
  adminList(payloads: { page?: number; pageSize?: number; status?: string; q?: string; from?: string; to?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result = await this.service.adminList(payloads);
        resolve({ status: defines.status.requestOK, message: result.data, data: result.rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'adminList'));
  }

  count() {
    return new Promise(async (resolve, reject) => {
      try {
        const total = await this.service.countActive();
        resolve({ status: defines.status.requestOK, message: 'Ok', data: { total } });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'count'));
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

  updateManager(id: string, patch: { phone?: string; name?: string }, actorId: string, isAdmin: boolean = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.updateManager(id, patch, actorId, isAdmin);
        if (!result.success) {
          return resolve({ status: defines.status.badRequest, message: result.message, data: null });
        }
        resolve({ status: defines.status.requestOK, message: 'Gérant mis à jour', data: result.data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'updateManager'));
  }

  regenerateCode(id: string, actorId: string, isAdmin: boolean = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.regenerateCode(id, actorId, isAdmin);
        if (!result.success) {
          return resolve({ status: defines.status.badRequest, message: result.message, data: null });
        }
        resolve({ status: defines.status.requestOK, message: 'Code régénéré', data: result.data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'regenerateCode'));
  }

  remove(id: string, ownerId: string, isAdmin: boolean = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.remove(id, ownerId, isAdmin);
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
