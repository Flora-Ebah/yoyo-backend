/**
 * Formule de « mise en avant » (sponsorisation d'une boutique).
 *
 * Remplace la config unique `platformConfig.sponsorPlan` par un catalogue : l'admin peut créer
 * plusieurs formules (ex. 7 j, 30 j, 90 j) à prix différents. Le marchand (app Pro) choisit une
 * formule ; la sponsorisation applique son `price` et sa `durationDays`.
 */
export interface ISponsorPlan {
  _id?: string;
  name: string;
  description?: string;
  price: number;
  durationDays: number;
  /** Rang d'affichage (croissant) dans la liste de choix. */
  position?: number;
  /** Formule proposée au marchand (sinon masquée). */
  isActive?: boolean;
  status?: string;
}
