import coddyger, { IErrorObject, defines } from 'coddyger';
import { BoutiqueSponsorService } from './boutique-sponsor.service';

const controllerLabel: string = 'BoutiqueSponsorController';

export class BoutiqueSponsorController {
  private readonly service: BoutiqueSponsorService;

  constructor() {
    this.service = new BoutiqueSponsorService();
  }

  sponsor(boutiqueId: string, adminId?: string, sponsorPlanId?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.sponsor(boutiqueId, adminId, sponsorPlanId);
        resolve({ status: defines.status.requestOK, message: 'Boutique mise en avant.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'sponsor'));
  }

  list(payloads: { page?: number; pageSize?: number; status?: string; from?: string; to?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.list(payloads);
        // Convention backend : métadonnées de pagination dans message, lignes dans data.
        resolve({ status: defines.status.requestOK, message: result, data: result?.rows ?? [] });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
  }

  byBoutique(boutiqueId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.activeForBoutique(boutiqueId);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'byBoutique'));
  }

  cancel(boutiqueId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.cancel(boutiqueId);
        resolve({ status: defines.status.requestOK, message: 'Mise en avant retirée.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'cancel'));
  }
}
