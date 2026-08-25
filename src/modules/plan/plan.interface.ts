/**
 * Interface pour le module Plan
 */
export interface IPlan {
  _id?: string;
  name: string;                // Nom du plan (ex: "Basic", "Premium", "Gold")
  description: string;         // Description détaillée du plan
  price: number;               // Prix du plan
  currency: string;            // Devise (ex: "XOF", "EUR", "USD")
  durationDays: number;        // Durée en jours (30, 90, 365, etc.)
  discountPercentage: number;  // Pourcentage de réduction offert chez les commerçants partenaires
  maxScansPerDay?: number;     // Nombre maximum de scans QR par jour
  maxScansPerMonth?: number;   // Nombre maximum de scans QR par mois
  features: string[];          // Liste des fonctionnalités incluses
  partnerCategories?: string[]; // Catégories de partenaires où le plan est applicable
  maxCashbackAmount?: number;  // Montant maximum de cashback par transaction
  isPopular?: boolean;         // Indique si c'est un plan populaire/recommandé
  isActive: boolean;           // Indique si le plan est actif et peut être souscrit
  trialDays?: number;          // Nombre de jours d'essai gratuit
  metadata?: any;              // Données supplémentaires
  status?: string;             // Statut du plan (ex: "active", "removed", "archived")
}
