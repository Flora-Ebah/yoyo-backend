import coddyger, { IErrorObject, defines } from 'coddyger';
import { SponsorCheckoutService } from './sponsor-checkout.service';

const controllerLabel: string = 'SponsorCheckoutController';

/**
 * TODO DIAGNOSTIC TEMPORAIRE - à retirer
 * Construit un suffixe diagnostic lisible à partir du `data` d'un échec de checkout sponsor et
 * l'ajoute au `message`. On passe par `message` car c'est le seul champ qui traverse de façon fiable
 * toute la chaîne de réponse jusqu'à l'app (le champ `data` arrive à null côté app — voir rapport).
 * Ne contient AUCUN secret : `omBody` est déjà nettoyé en amont par `sanitizeOmBody` (liste blanche,
 * jamais les clés/tokens Orange Money). Couvre tous les stages : validation_body, boutique_*,
 * formula_*, om_token, om_initiate, om_payment, db_create, create_sponsor_transaction.
 */
function buildDiagMessage(baseMessage: string, data: any): string {
  // TODO DIAGNOSTIC TEMPORAIRE - à retirer
  try {
    const d: any = data || {};
    const debug: any = d.debug || {};
    const stage = debug.stage || d.stage || 'n/a';
    const omStatus = debug.omStatus ?? 'n/a';
    const amount = debug.amount ?? d.amount ?? 'n/a';
    const currency = d.currency || process.env.OM_CURRENCY || 'n/a';

    // omBody est déjà nettoyé (sanitizeOmBody) ; on le sérialise et on tronque par prudence.
    const omRaw = debug.omBody ?? debug.reason ?? d.field ?? null;
    let om = 'n/a';
    if (omRaw != null) {
      om = typeof omRaw === 'string' ? omRaw : JSON.stringify(omRaw);
      if (om.length > 300) om = om.slice(0, 300) + '…';
    }

    const suffix = `[DIAG] stage=${stage} omStatus=${omStatus} om=${om} amount=${amount} cur=${currency}`;
    return `${baseMessage} ${suffix}`;
  } catch {
    return baseMessage;
  }
}

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
            // TODO DIAGNOSTIC TEMPORAIRE - à retirer : le motif réel est placé dans `message` (fiable
            // jusqu'à l'app) en plus de `data` (qui peut arriver à null côté app — voir rapport).
            message: buildDiagMessage(result.message, result.data),
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
