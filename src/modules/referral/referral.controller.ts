import coddyger, { IErrorObject, defines } from 'coddyger';
import { referralService } from './referral.service';

const controllerLabel = 'ReferralController';

/** Administration du parrainage (CMS) : fiche client, revue des parrains suspects, fraude. */
export class ReferralController {
  detail(clientId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await referralService.adminDetail(clientId);
        if (!data) return resolve({ status: defines.status.notFound, message: 'Client introuvable', data: null });
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'detail'));
  }

  reviewList() {
    return new Promise(async (resolve, reject) => {
      try {
        resolve({ status: defines.status.requestOK, message: 'OK', data: await referralService.reviewList() });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'reviewList'));
  }

  approve(clientId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const rewardStatus = await referralService.approve(clientId);
        resolve({ status: defines.status.requestOK, message: 'Parrain validé', data: { rewardStatus } });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'approve'));
  }

  fraud(clientId: string, reason: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await referralService.markFraud(clientId, reason.trim());
        resolve({ status: defines.status.requestOK, message: 'Fraude enregistrée', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'fraud'));
  }
}
