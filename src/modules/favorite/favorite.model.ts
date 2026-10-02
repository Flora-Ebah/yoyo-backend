import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IFavorite } from './favorite.interface';

const schema = new mongoose.Schema<IFavorite>({
  _id: Schema.Types.ObjectId,
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
},
{ timestamps: true });

// Un seul favori par (boutique, utilisateur).
schema.index({ partnerId: 1, userId: 1 }, { unique: true });

const model = mongoose.model<IFavorite>('PartnerFavorite', schema, 'partner_favorites');

export class FavoriteSet extends MongoDbDao<IFavorite & Document> implements IData<IFavorite & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
