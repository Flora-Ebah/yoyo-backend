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
  // Jeton aléatoire transporté dans `return_url` / `cancel_url` : il identifie la transaction
  // sur la page de retour publique sans exposer son `_id` (devinable) ni le `notifyToken`.
  returnToken: { type: String },
  txnId: { type: String },
  isScheduledRenewal: { type: Boolean, default: false },
  currentSubscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  // Nature de la transaction : 'subscription' (achat de plan client, défaut historique) ou
  // 'boutique-sponsor' (mise en avant d'une boutique par son marchand, flux self-service payant).
  kind: { type: String, enum: ['subscription', 'boutique-sponsor'], default: 'subscription' },
  // Métadonnées de mise en avant (uniquement pour kind === 'boutique-sponsor').
  boutiqueId: { type: String },
  sponsorPlanId: { type: String },
},
{ timestamps: true });

const model = mongoose.model<ITransaction>('Transaction', schema);

schema.index({ user: 1, paymentDate: -1 });
schema.index({ paymentDate: -1 });
schema.index({ paymentStatus: 1 });
schema.index({ paymentMethod: 1 });
schema.index({ paymentId: 1 });
schema.index({ paymentUrl: 1 });
schema.index({ returnToken: 1 });

export class TransactionSet extends MongoDbDao<ITransaction & Document> implements IData<ITransaction & Document> {
  defaultModel = model;

  constructor() {
    super();
  }
}
