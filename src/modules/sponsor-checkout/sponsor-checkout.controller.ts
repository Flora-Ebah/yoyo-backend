import coddyger, { IErrorObject, defines } from 'coddyger';
import { SponsorCheckoutService } from './sponsor-checkout.service';

const controllerLabel: string = 'SponsorCheckoutController';

export class SponsorCheckoutController {
  private readonly service: SponsorCheckoutService;

  constructor() {
    this.service = new SponsorCheckoutService();
  }

  /**
   * Initie le paiement d'une mise en avant pour la boutique du marchand connecté.
   */
  checkout(merchantId: string, boutiqueId: string, sponsorPlanId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.checkout(merchantId, boutiqueId, sponsorPlanId);

        if (!result.ok) {
          return resolve({
            status: result.status || defines.status.badRequest,
            message: result.message,
            // TODO DIAGNOSTIC TEMPORAIRE - à retirer : on propage le détail (stage/OM) au lieu de null
            data: result.data ?? null
          });
        }

        resolve({
          status: result.status || defines.status.created,
          message: result.message,
          data: result.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'checkout'));
  }
}
