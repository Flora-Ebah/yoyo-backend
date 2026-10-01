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

  /**
   * Mise en avant active d'une boutique.
   *
   * Accessible à l'administrateur ET au marchand propriétaire de la boutique (self-service).
   * [GARDE DE PROPRIÉTÉ] Un marchand non-admin ne peut lire que SA propre boutique : sinon on
   * renvoie 404 (anti-IDOR, on masque l'existence de la boutique d'autrui).
   */
  byBoutique(boutiqueId: string, requester?: { _id: string; isAdmin?: boolean }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (requester && !requester.isAdmin) {
          const owned = await this.service.isOwnedBy(boutiqueId, String(requester._id));
          if (!owned) {
            return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
          }
        }
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
