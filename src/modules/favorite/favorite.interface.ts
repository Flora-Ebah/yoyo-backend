/**
 * Interface du module Favoris (bookmark) — un client met une boutique (partner) en favori.
 * Un seul enregistrement par (partnerId, userId) ; le favori est un simple marque-page,
 * posé ou retiré via un toggle.
 */
export interface IFavorite {
  _id?: string;
  /** Boutique mise en favori. */
  partnerId: any;
  /** Client (utilisateur) propriétaire du favori. */
  userId: any;
}
