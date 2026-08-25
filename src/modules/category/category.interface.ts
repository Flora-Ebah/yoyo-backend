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
}