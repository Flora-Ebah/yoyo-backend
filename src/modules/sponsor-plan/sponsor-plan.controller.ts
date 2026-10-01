import coddyger, { IErrorObject, defines } from 'coddyger';
import { SponsorPlanService } from './sponsor-plan.service';
import { ISponsorPlan } from './sponsor-plan.interface';

const controllerLabel: string = 'SponsorPlanController';

export class SponsorPlanController {
  private readonly service: SponsorPlanService;

  constructor() {
    this.service = new SponsorPlanService();
  }

  list(payloads: { page?: number; pageSize?: number; status?: string; q?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.list(payloads);
        // Convention : métadonnées de pagination dans `message`, lignes dans `data`.
        resolve({ status: defines.status.requestOK, message: result.data, data: result.rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
  }

  active() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.active();
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'active'));
  }

  details(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getById(id);
        if (!data) return resolve({ status: defines.status.notFound, message: 'Formule introuvable.', data: null });
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'details'));
  }

  create(body: Partial<ISponsorPlan>) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.create(body);
        resolve({ status: defines.status.requestOK, message: 'Formule créée.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'create'));
  }

  update(id: string, body: Partial<ISponsorPlan>) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.update(id, body);
        resolve({ status: defines.status.requestOK, message: 'Formule mise à jour.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'update'));
  }

  delete(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.service.delete(id);
        resolve({ status: defines.status.requestOK, message: 'Formule supprimée.', data: null });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'delete'));
  }
}
