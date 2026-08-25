/**
 * Interface pour les heures d'ouverture
 */
export interface IOpeningHours {
  day: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  breaks?: {
    startTime: string;
    endTime: string;
  }[];
}

/**
 * Interface pour le module Partner
 */
export interface IPartner {
  _id?: string;
  slug?: string;
  name: string;
  description?: string;
  ville?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  categories?: any[];
  thumbnail?: string;
  photos?: string[];
  maxDiscount?: number;
  minOrder?: number;
  isSponsored?: boolean;
  // Jours et heures d'ouverture
  openingHours?: IOpeningHours[];
  
  status?: string;
  user?: any;
}
