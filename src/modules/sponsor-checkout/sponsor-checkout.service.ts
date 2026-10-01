import coddyger from 'coddyger';
import { PartnerSet } from '../partner/partner.model';
import { SponsorPlanService } from '../sponsor-plan/sponsor-plan.service';
import { TransactionService } from '../transaction/transaction.service';

/**
 * [MISE EN AVANT] Parcours marchand self-service : un marchand souscrit lui-même à une formule
 * de mise en avant pour SA boutique, AVEC paiement.
 *
 * Ce service ne contient aucune logique de paiement propre : il valide l'appartenance de la
 * boutique au marchand et la formule (toutes deux en base), puis délègue l'initiation du paiement
 * à `TransactionService.createSponsorTransaction`, qui réutilise l'infrastructure Orange Money
 * des abonnements. L'activation de la mise en avant est déclenchée par le canal paiement→activation
 * partagé (retour navigateur / notification), jamais ici.
 */
export class SponsorCheckoutService {
  private readonly partners: PartnerSet;
  private readonly sponsorPlans: SponsorPlanService;
  private readonly transactions: TransactionService;

  constructor() {
    this.partners = new PartnerSet();
    this.sponsorPlans = new SponsorPlanService();
    this.transactions = new TransactionService();
  }

  /**
   * Initie le paiement d'une mise en avant pour la boutique du marchand connecté.
   *
   * @param merchantId Marchand authentifié (request.user._id)
   * @param boutiqueId Boutique à mettre en avant
   * @param sponsorPlanId Formule de mise en avant choisie
   * @returns { ok, status, message, data } — data porte l'URL de paiement et la référence
   */
  async checkout(merchantId: string, boutiqueId: string, sponsorPlanId: string): Promise<any> {
    // Validation des identifiants
    if (!coddyger.string.isValidObjectId(boutiqueId)) {
      return { ok: false, status: 400, message: "Identifiant de boutique invalide." };
    }
    if (!coddyger.string.isValidObjectId(sponsorPlanId)) {
      return { ok: false, status: 400, message: 'Identifiant de formule invalide.' };
    }

    // Appartenance : la boutique doit exister, ne pas être supprimée et appartenir au marchand.
    const boutique: any = await this.partners.selectOne({ _id: boutiqueId, status: { $nin: ['removed'] } });
    if (!boutique) {
      return { ok: false, status: 404, message: 'Boutique introuvable.' };
    }

    // `user` est peuplé ({ _id, ... }) par PartnerSet ; on compare l'identifiant brut.
    const ownerId = boutique.user?._id ?? boutique.user;
    if (!ownerId || String(ownerId) !== String(merchantId)) {
      // On masque l'existence de la boutique d'autrui (anti-IDOR).
      return { ok: false, status: 404, message: 'Boutique introuvable.' };
    }

    // Formule : doit exister et être active. Le prix provient d'ICI, jamais du client.
    const formula: any = await this.sponsorPlans.getById(sponsorPlanId);
    if (!formula || formula.status === 'removed') {
      return { ok: false, status: 404, message: 'Formule de mise en avant introuvable.' };
    }
    if (formula.isActive === false || formula.status !== 'active') {
      return { ok: false, status: 400, message: "Cette formule de mise en avant n'est plus disponible." };
    }

    // Délégation à l'infrastructure de paiement partagée.
    const result: any = await this.transactions.createSponsorTransaction(merchantId, boutiqueId, formula);

    if (!result || result.success === false) {
      return {
        ok: false,
        status: result?.status || 400,
        message: result?.message || "Impossible d'initier le paiement de la mise en avant."
      };
    }

    const tx: any = result.data || {};
    return {
      ok: true,
      status: 201,
      message: tx.isFree ? 'Mise en avant activée (formule gratuite).' : 'Paiement de la mise en avant initié.',
      data: {
        transactionId: String(tx._id),
        amount: tx.amount,
        currency: tx.currency,
        paymentStatus: tx.paymentStatus,
        paymentUrl: tx.paymentUrl,
        isFree: !!tx.isFree,
        boutiqueId: String(boutiqueId),
        sponsorPlanId: String(sponsorPlanId)
      }
    };
  }
}
