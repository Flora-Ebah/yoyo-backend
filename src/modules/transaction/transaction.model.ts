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
  // Orange Money : `pay_token`. Wave : identifiant de la session de paiement (`cos-…`).
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
  boutiqueId: { type: String },                 // flux MONO (rétrocompat)
  boutiqueIds: { type: [String], default: undefined }, // flux MULTI (YO Boost) : N boutiques, 1 paiement
  sponsorPlanId: { type: String },
  // Activation forcée par un admin (Excel CMS n°12) : paiement constaté chez Wave mais non
  // confirmé par la session. Tracée pour le rapprochement et l'audit.
  manualActivation: {
    by: { type: Schema.Types.ObjectId, ref: 'Admin' },
    at: { type: Date },
    reason: { type: String },
    ref: { type: String }
  },
  // Remboursement effectué hors plateforme (depuis le compte marchand Wave), consigné ici.
  refund: {
    amount: { type: Number },
    ref: { type: String },
    reason: { type: String },
    by: { type: Schema.Types.ObjectId, ref: 'Admin' },
    at: { type: Date },
    subscriptionCancelled: { type: Boolean }
  },
},
{ timestamps: true });

// Index déclarés AVANT `mongoose.model`, pour qu'ils fassent partie du schéma compilé.
schema.index({ user: 1, paymentDate: -1 });
schema.index({ paymentDate: -1 });
schema.index({ paymentStatus: 1 });
schema.index({ paymentMethod: 1 });
schema.index({ paymentId: 1 });
schema.index({ paymentUrl: 1 });
schema.index({ returnToken: 1 });
// Résolution des webhooks Wave par identifiant de session.
schema.index({ paymentToken: 1 });
// Rapprochement avec le relevé Wave (référence de paiement).
schema.index({ txnId: 1 });

const model = mongoose.model<ITransaction>('Transaction', schema);

export class TransactionSet extends MongoDbDao<ITransaction & Document> implements IData<ITransaction & Document> {
  defaultModel = model;

  constructor() {
    super();
  }
}
