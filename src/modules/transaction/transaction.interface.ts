/**
 * Interface pour le module Transaction
 */
export interface ITransaction {
  _id?: string;
  user?: any;
  plan?: any;
  amount?: number;
  currency?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paymentDate?: Date;
  paymentId?: string;
  paymentUrl?: string;
  paymentToken?: string;
  notifyToken?: string;
  txnId?: string;
  isScheduledRenewal?: boolean;
  currentSubscriptionId?: string;
}
