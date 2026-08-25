import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { ITransaction } from './transaction.interface';

const schema = new mongoose.Schema<ITransaction>({
  _id: Schema.Types.ObjectId,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  plan: { type: Schema.Types.ObjectId, ref: 'Plan' },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed', 'archived'], 
    default: 'active' 
  },
  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, enum: ['pending', 'success', 'failed', 'refunded', 'expired', 'cancelled', 'initiated'], default: 'pending' },
  paymentDate: { type: Date, required: true },
  paymentId: { type: String, required: true },
  paymentUrl: { type: String, required: true },
  paymentToken: { type: String },
  notifyToken: { type: String },
  txnId: { type: String },
  isScheduledRenewal: { type: Boolean, default: false },
  currentSubscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
},
{ timestamps: true });

const model = mongoose.model<ITransaction>('Transaction', schema);

schema.index({ user: 1, paymentDate: -1 });
schema.index({ paymentDate: -1 });
schema.index({ paymentStatus: 1 });
schema.index({ paymentMethod: 1 });
schema.index({ paymentId: 1 });
schema.index({ paymentUrl: 1 });

export class TransactionSet extends MongoDbDao<ITransaction & Document> implements IData<ITransaction & Document> {
  defaultModel = model;

  constructor() {
    super();
  }
}
