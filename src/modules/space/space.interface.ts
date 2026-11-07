/**
 * Un ESPACE (« guichet ») = une interface focalisée du back-office (sans sidebar) vers laquelle un
 * utilisateur est routé selon ses droits. La config est pilotée par la donnée (modifiable depuis
 * l'écran d'admin), sans code. Le rendu des PAGES reste codé (groupes de routes focalisés existants).
 */
export interface ISpaceRule {
  subject: string;
  action: string;
}

export interface ISpace {
  _id?: any;
  /** Branding affiché dans l'en-tête (ex. « YoYo Commercial »). */
  label: string;
  /** Libellé du rôle affiché dans le menu utilisateur (ex. « Commercial »). */
  roleLabel?: string;
  /** Page d'accueil de l'espace (route existante, ex. « /commercial »). */
  landing: string;
  /** Règle d'affectation : TOUS ces droits doivent être accordés (hiérarchie incluse). */
  requires: ISpaceRule[];
  /** Règle d'affectation : AUCUN accès (même sous-module `sujet.*`) sur ces sujets. */
  excludes: string[];
  /** Ordre d'évaluation (la 1re règle qui matche l'emporte). */
  order?: number;
  status?: 'active' | 'inactive' | 'removed';
  createdAt?: Date;
  updatedAt?: Date;
}
