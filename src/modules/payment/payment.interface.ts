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
  status?: string; // pending, success, failed, refunded, expired, cancelled, rejected,
  deniedAt?: Date;
  deniedReason?: string;
  deniedBy?: string;
}
