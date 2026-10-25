import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/** Type de code : cadeau (familles et amis du staff, n°3) ou YOYO Business (lot d'entreprise, n°4). */
export type PromoCodeType = 'gift' | 'business';

/** Préfixe lisible par type (Excel n°13). */
export const PROMO_CODE_PREFIX: Record<PromoCodeType, string> = { gift: 'GIFT', business: 'BIZ' };

// ===================== Lot =====================

export interface IPromoBatch {
  _id?: any;
  type: PromoCodeType;
  label: string;
  /** Entreprise YOYO Business (obligatoire pour `business`). */
  company?: any;
  /** Référence de la facture du forfait entreprise (décision n°7 : facturation hors appli). */
  invoiceRef?: string;
  /** Plan offert ; à défaut, le plan offert du programme (`FreeMonthService.offeredPlan`). */
  planId?: any;
  /** Jours offerts à l'activation (multiple de 30). */
  days: number;
  /** Date limite d'activation des codes du lot. */
  expiresAt: Date;
  count: number;
  createdBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const batchSchema = new mongoose.Schema<IPromoBatch>(
  {
    _id: Schema.Types.ObjectId,
    type: { type: String, enum: ['gift', 'business'], required: true, index: true },
    label: { type: String, required: true, trim: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    invoiceRef: { type: String, trim: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    days: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
    count: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

const batchModel = mongoose.model<IPromoBatch>('PromoBatch', batchSchema);

// ===================== Code =====================

export interface IPromoCode {
  _id?: any;
  code: string;
  type: PromoCodeType;
  batch: any;
  company?: any;
  /** Titulaire importé (CSV). Un code avec téléphone n'est utilisable que par ce numéro. */
  holderName?: string;
  holderPhone?: string;
  maxUses: number;
  uses: number;
  expiresAt: Date;
  /** « Expiré » ne se stocke pas : il se déduit de `expiresAt` à la lecture. */
  status: 'active' | 'disabled' | 'used';
  createdAt?: Date;
  updatedAt?: Date;
}

const codeSchema = new mongoose.Schema<IPromoCode>(
  {
    _id: Schema.Types.ObjectId,
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ['gift', 'business'], required: true },
    batch: { type: Schema.Types.ObjectId, ref: 'PromoBatch', required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    holderName: { type: String, trim: true },
    holderPhone: { type: String, trim: true },
    maxUses: { type: Number, default: 1, min: 1 },
    uses: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: ['active', 'disabled', 'used'], default: 'active' }
  },
  { timestamps: true }
);

const codeModel = mongoose.model<IPromoCode>('PromoCode', codeSchema);

// ===================== Activation =====================

/** Historique des activations : qui, quand, quel compte (Excel n°10). */
export interface IPromoRedemption {
  _id?: any;
  code: any;
  batch: any;
  company?: any;
  user: any;
  /** Mois offert accordé (`FreeMonthGrant`). */
  grantId?: any;
  status: 'applied' | 'revoked';
  revokedAt?: Date;
  revokedReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const redemptionSchema = new mongoose.Schema<IPromoRedemption>(
  {
    _id: Schema.Types.ObjectId,
    code: { type: Schema.Types.ObjectId, ref: 'PromoCode', required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: 'PromoBatch', required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    grantId: { type: Schema.Types.ObjectId, ref: 'FreeMonthGrant' },
    status: { type: String, enum: ['applied', 'revoked'], default: 'applied' },
    revokedAt: { type: Date },
    revokedReason: { type: String }
  },
  { timestamps: true }
);

// Un seul code par lot et par compte, même sur deux requêtes simultanées.
redemptionSchema.index({ batch: 1, user: 1 }, { unique: true });

const redemptionModel = mongoose.model<IPromoRedemption>('PromoRedemption', redemptionSchema);

// ===================== DAO =====================

export class PromoBatchSet extends MongoDbDao<IPromoBatch & Document> implements IData<IPromoBatch & Document> {
  defaultModel = batchModel;

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

export class PromoCodeSet extends MongoDbDao<IPromoCode & Document> implements IData<IPromoCode & Document> {
  defaultModel = codeModel;

  constructor() {
    super();
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ code: 1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}

export class PromoRedemptionSet extends MongoDbDao<IPromoRedemption & Document> implements IData<IPromoRedemption & Document> {
  defaultModel = redemptionModel;

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
