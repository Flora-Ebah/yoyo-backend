/**
 * Interface pour le module Transaction
 */
export interface ITransaction {
  _id?: string;
  user?: any;
  plan?: any;
  amount?: number;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentDate?: Date;
  paymentId?: string;
  paymentUrl?: string;
  paymentToken?: string;
  notifyToken?: string;
  returnToken?: string;
  txnId?: string;
  isScheduledRenewal?: boolean;
  currentSubscriptionId?: string;
  // Nature de la transaction. 'subscription' (défaut) = achat/renouvellement d'un plan client.
  // 'boutique-sponsor' = mise en avant d'une boutique par son marchand (self-service payant).
  // Permet au canal paiement→activation partagé de brancher la bonne activation.
  kind?: 'subscription' | 'boutique-sponsor';
  // Renseignés uniquement pour kind === 'boutique-sponsor'.
  boutiqueId?: string;       // boutique (module partner) à mettre en avant
  sponsorPlanId?: string;    // formule de mise en avant (module sponsor-plan) à appliquer
}
