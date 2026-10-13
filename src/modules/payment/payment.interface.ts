/**
 * Interface pour le module Payment
 */
export interface IPayment {
  _id?: string;
  from: any;
  to: any;
  amount?: number;
  discountPercentage?: number;
  completedAt?: Date;
  status?: string; // pending, success, failed, refunded, expired, cancelled, rejected, invalidated
  deniedAt?: Date;
  deniedReason?: string;
  deniedBy?: string;
  // Auteur de la validation du ticket. Flux 100% client : toujours 'client'.
  validatedBy?: string;
  // Invalidation a posteriori par le marchand (seul pouvoir restant sur un ticket).
  invalidatedAt?: Date;
  invalidatedBy?: string;
  // Montant inhabituel pour la boutique : signalé au marchand, qui peut invalider le ticket.
  flagged?: boolean;
}
