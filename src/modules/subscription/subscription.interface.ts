/**
 * Interface pour les abonnements
 */
export interface ISubscription {
  _id?: string;
  userId: any;              // ID de l'utilisateur abonné
  planId: any;              // ID du plan souscrit
  startDate: Date;             // Date de début de l'abonnement
  endDate: Date;               // Date de fin de l'abonnement
  status: 'active' | 'expired' | 'cancelled' | 'pending' | 'trial';  // Statut de l'abonnement
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded';         // Statut du paiement
  paymentMethod?: string;      // Méthode de paiement utilisée
  transactionId?: string;      // ID de la transaction de paiement
  autoRenew: boolean;          // Renouvellement automatique activé
  price: number;               // Prix payé
  currency: string;            // Devise
  metadata?: any;              // Données supplémentaires
  // Champs pour le renouvellement anticipé
  pendingRenewal?: {           // Renouvellement en attente
    planId: any;               // ID du nouveau plan
    startDate: Date;           // Date de début du nouveau plan
    endDate: Date;             // Date de fin du nouveau plan
    price: number;             // Prix du nouveau plan
    paymentMethod?: string;    // Méthode de paiement
    transactionId?: string;    // ID de la transaction
    createdAt: Date;           // Date de création du renouvellement
  };
}