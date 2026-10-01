/**
 * Mise en avant (sponsorisation) d'une boutique = application de l'abonnement
 * boutique (prix + durée) défini dans la config plateforme (`sponsorPlan`).
 * Un enregistrement actif rend la boutique `isSponsored` jusqu'à `endDate`.
 */
export interface IBoutiqueSponsor {
  _id?: string;
  boutiqueId: string;       // id de la boutique (module partner)
  startDate: Date;
  endDate: Date;
  price?: number;           // prix appliqué (copié depuis sponsorPlan au moment de la création)
  durationDays?: number;    // durée appliquée (copiée depuis sponsorPlan)
  createdBy?: string;       // admin qui a mis en avant (pour la traçabilité)
  status?: 'active' | 'expired' | 'cancelled' | 'removed';
}
