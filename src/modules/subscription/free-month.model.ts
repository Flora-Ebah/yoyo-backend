import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/** Origine d'un mois offert. `gift` et `business` serviront au module « Codes & promotions ». */
export type FreeMonthSource = 'referral' | 'gift' | 'business';

export interface IFreeMonthGrant {
  _id?: any;
  user: any;
  source: FreeMonthSource;
  /** Événement à l'origine de l'octroi (parrainage : le parrain lui-même, une seule récompense). */
  ref: string;
  days: number;
  /** Abonnement prolongé (`extended`) ou créé pour l'occasion (`created`). */
  subscriptionId?: any;
  mode?: 'extended' | 'created';
  planId?: any;
  status: 'applied' | 'revoked';
  revokedAt?: Date;
  revokedReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const schema = new mongoose.Schema<IFreeMonthGrant>(
  {
    _id: Schema.Types.ObjectId,
    user: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    source: { type: String, enum: ['referral', 'gift', 'business'], required: true },
    ref: { type: String, required: true },
    days: { type: Number, required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    mode: { type: String, enum: ['extended', 'created'] },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    status: { type: String, enum: ['applied', 'revoked'], default: 'applied' },
    revokedAt: { type: Date },
    revokedReason: { type: String }
  },
  { timestamps: true }
);

// Un même événement ne crédite jamais deux fois, même sur deux requêtes simultanées.
schema.index({ source: 1, ref: 1 }, { unique: true });

const model = mongoose.model<IFreeMonthGrant>('FreeMonthGrant', schema);

export class FreeMonthGrantSet extends MongoDbDao<IFreeMonthGrant & Document> implements IData<IFreeMonthGrant & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
