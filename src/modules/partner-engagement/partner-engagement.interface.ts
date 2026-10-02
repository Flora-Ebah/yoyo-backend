/**
 * Module Engagement social des boutiques (partners).
 *
 * Trois volets :
 *  - LIKES     : un like par (partnerId, userId), modélisé par présence/absence d'un document.
 *  - COMMENTS  : commentaires texte des clients, avec suppression logique (`status`).
 *  - PARTAGES  : simple compteur atomique par boutique, stocké dans `partner_stats`.
 *
 * Le CLIENT (collection `Client`) est l'auteur des likes et commentaires.
 */

/** Like d'un client sur une boutique — unicité sur (partnerId, userId). */
export interface IPartnerLike {
  _id?: string;
  partnerId: any;
  userId: any;
}

/** Commentaire d'un client sur une boutique. */
export interface IPartnerComment {
  _id?: string;
  partnerId: any;
  userId: any;
  text: string;
  status?: string;
}

/** Statistiques agrégées d'une boutique — porte le compteur de partages. */
export interface IPartnerStats {
  _id?: string;
  partnerId: any;
  shareCount: number;
}
