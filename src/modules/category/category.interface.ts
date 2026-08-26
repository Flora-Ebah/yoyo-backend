/**
 * Interface pour le module Category
 */
export interface ICategory {
  _id?: string;
  name: string;
  description?: string;
  status?: string;
  parent?: any;
  icon?: string;
  color?: string;
  /**
   * Rang d'affichage dans les listes de choix (app Client, app Partenaire).
   * L'ordre des catégories est éditorial : sans ce champ, le tri par défaut du DAO
   * (`createdAt` décroissant) plaçait les dernières créées en tête, donc « Autres »
   * en première position de la barre de filtres.
   */
  position?: number;
}