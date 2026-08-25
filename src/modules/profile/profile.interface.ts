/**
 * Interface pour le module Profile
 */
export interface IProfile {
  _id?: string;
  slug?: string;
  name: string;
  ability?: IAbility[];
  description?: string;
  status?: string;
  user?: any;
}

export interface IAbility {
  name: string;
  subject: string;
  action: string;
}
