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
  /** Réseaux sociaux du marchand (saisis côté Pro ou Admin, affichés côté client). */
  socials?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    twitter?: string;
    whatsapp?: string;
    website?: string;
  };
  categories?: any[];
  thumbnail?: string;
  photos?: string[];
  /** Vidéo de présentation facultative (clé de stockage) et son image d'aperçu, extraite par le serveur. */
  video?: string;
  videoPoster?: string;
  maxDiscount?: number;
  minOrder?: number;
  /** Plafond par achat (FCFA) fixé par la boutique ; absent ou 0 = plafond de la plateforme. */
  maxOrder?: number;
  isSponsored?: boolean;
  // Jours et heures d'ouverture
  openingHours?: IOpeningHours[];
  
  status?: string;
  /** Statut mémorisé avant suppression de compte, pour restauration exacte à la réactivation. */
  statusBeforeRemoval?: string;
  suspendedByBlock?: boolean;
  // Validation d'une boutique créée par le marchand (Excel CMS n°14).
  validation?: { status?: 'pending' | 'approved' | 'rejected'; reason?: string; by?: any; at?: Date; submittedAt?: Date };
  user?: any;
  /** Admin (commercial) auteur de l'enrôlement à distance. */
  createdBy?: any;
}
