import coddyger, { IErrorObject, defines } from 'coddyger';
import { BoutiqueSponsorService } from './boutique-sponsor.service';

const controllerLabel: string = 'BoutiqueSponsorController';

export class BoutiqueSponsorController {
  private readonly service: BoutiqueSponsorService;

  constructor() {
    this.service = new BoutiqueSponsorService();
  }

  sponsor(boutiqueId: string, adminId?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.sponsor(boutiqueId, adminId);
        resolve({ status: defines.status.requestOK, message: 'Boutique mise en avant.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'sponsor'));
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
