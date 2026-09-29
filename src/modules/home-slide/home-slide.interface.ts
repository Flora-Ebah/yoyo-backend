/**
 * Interface du module HomeSlide (#5) — carrousel « offres spéciales / découverte » de l'accueil
 * client, géré depuis le backoffice. Chaque slide = une image cliquable, ordonnée, avec une
 * période d'affichage optionnelle.
 */
export interface IHomeSlide {
  _id?: string;
  title?: string;
  /** Image de la slide (nom de fichier / URL). */
  image: string;
  /** Lien optionnel (deep-link interne ou URL). */
  link?: string;
  /** Rang d'affichage (croissant). */
  order?: number;
  active?: boolean;
  /** Fenêtre d'affichage optionnelle. */
  startsAt?: Date;
  endsAt?: Date;
  status?: string;
  createdBy?: any;
}
