/**
 * Interface du module Influencer (#17).
 * Un influenceur possède un code promo unique ; à l'inscription, le client peut saisir ce code
 * (`influencerCode` sur le client). Les stats permettent de suivre qui a ramené le plus de clients.
 */
export interface IInfluencer {
  _id?: string;
  name: string;
  contact?: string;
  /** Code promo unique de l'influenceur (majuscules). */
  code: string;
  active?: boolean;
  status?: string;
  /** Admin auteur de la création. */
  createdBy?: any;
}
