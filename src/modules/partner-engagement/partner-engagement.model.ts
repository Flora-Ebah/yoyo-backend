import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IPartnerLike, IPartnerComment, IPartnerStats } from './partner-engagement.interface';

/* ------------------------------------------------------------------------------------------------ */
/* LIKES — collection `partner_likes`                                                               */
/* ------------------------------------------------------------------------------------------------ */

const likeSchema = new mongoose.Schema<IPartnerLike>({
  _id: Schema.Types.ObjectId,
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true }
},
{ timestamps: { createdAt: true, updatedAt: false }, collection: 'partner_likes' });

// Un seul like par (boutique, client).
likeSchema.index({ partnerId: 1, userId: 1 }, { unique: true });

const likeModel = mongoose.model<IPartnerLike>('PartnerLike', likeSchema);

export class PartnerLikeSet extends MongoDbDao<IPartnerLike & Document> implements IData<IPartnerLike & Document> {
  defaultModel = likeModel;
  constructor() { super(); }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  // Le `count` hérité de MongoDbDao fait `doc || Promise.reject(doc)` : il REJETTE quand le total
  // vaut 0 (après un unlike, ou pour une boutique sans like). On surcharge pour renvoyer 0 sans rejet.
  count(params: object): Promise<number | any> {
    return Promise.resolve(this.defaultModel.countDocuments(params)).catch((e: any) => ({ error: true, data: e }));
  }

  /** Liste paginée des clients ayant liké une boutique (récents d'abord), auteur peuplé. */
  listLikersByPartner(partnerId: string, page: number, limit: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const startIndex = (page - 1) * limit;
      const params = { partnerId };
      const [rows, total] = await Promise.all([
        this.defaultModel.find(params)
          .sort({ createdAt: -1 }).skip(startIndex).limit(limit)
          .populate('userId', '_id firstname lastname avatar')
          .lean(),
        this.defaultModel.countDocuments(params)
      ]);
      resolve({ rows, total });
    }).catch((e: any) => ({ error: true, data: e }));
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* COMMENTAIRES — collection `partner_comments`                                                     */
/* ------------------------------------------------------------------------------------------------ */

const commentSchema = new mongoose.Schema<IPartnerComment>({
  _id: Schema.Types.ObjectId,
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  status: { type: String, enum: ['active', 'removed'], default: 'active' }
},
{ timestamps: true, collection: 'partner_comments' });

const commentModel = mongoose.model<IPartnerComment>('PartnerComment', commentSchema);

export class PartnerCommentSet extends MongoDbDao<IPartnerComment & Document> implements IData<IPartnerComment & Document> {
  defaultModel = commentModel;
  constructor() { super(); }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  // Idem PartnerLikeSet : le `count` hérité rejette quand le total vaut 0 (boutique sans commentaire).
  count(params: object): Promise<number | any> {
    return Promise.resolve(this.defaultModel.countDocuments(params)).catch((e: any) => ({ error: true, data: e }));
  }

  /** Liste paginée des commentaires actifs d'une boutique (récents d'abord), auteur peuplé. */
  listByPartner(partnerId: string, page: number, limit: number): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const startIndex = (page - 1) * limit;
      const params = { partnerId, status: 'active' };
      const [rows, total] = await Promise.all([
        this.defaultModel.find(params)
          .sort({ createdAt: -1 }).skip(startIndex).limit(limit)
          .populate('userId', '_id firstname lastname avatar')
          .lean(),
        this.defaultModel.countDocuments(params)
      ]);
      resolve({ rows, total });
    }).catch((e: any) => ({ error: true, data: e }));
  }

  /**
   * Liste paginée des commentaires d'une boutique pour la MODÉRATION (récents d'abord),
   * auteur peuplé. `includeRemoved=true` renvoie aussi les commentaires supprimés
   * (status 'removed') ; sinon seuls les 'active' sont renvoyés.
   */
  listByPartnerForAdmin(partnerId: string, page: number, limit: number, includeRemoved: boolean): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const startIndex = (page - 1) * limit;
      const params: any = includeRemoved ? { partnerId } : { partnerId, status: 'active' };
      const [rows, total] = await Promise.all([
        this.defaultModel.find(params)
          .sort({ createdAt: -1 }).skip(startIndex).limit(limit)
          .populate('userId', '_id firstname lastname avatar')
          .lean(),
        this.defaultModel.countDocuments(params)
      ]);
      resolve({ rows, total });
    }).catch((e: any) => ({ error: true, data: e }));
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* PARTAGES — collection `partner_stats` (compteur shareCount)                                       */
/* ------------------------------------------------------------------------------------------------ */

const statsSchema = new mongoose.Schema<IPartnerStats>({
  _id: Schema.Types.ObjectId,
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, unique: true, index: true },
  shareCount: { type: Number, default: 0 }
},
{ timestamps: true, collection: 'partner_stats' });

const statsModel = mongoose.model<IPartnerStats>('PartnerStats', statsSchema);

export class PartnerStatsSet extends MongoDbDao<IPartnerStats & Document> implements IData<IPartnerStats & Document> {
  defaultModel = statsModel;
  constructor() { super(); }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  /** Incrémente atomiquement le compteur de partages (création du doc si absent). */
  incrementShare(partnerId: string, by: number = 1): Promise<any> {
    return Promise.resolve(
      this.defaultModel.findOneAndUpdate(
        { partnerId },
        { $inc: { shareCount: by }, $setOnInsert: { _id: new mongoose.Types.ObjectId() } },
        { upsert: true, new: true }
      ).lean()
    ).catch((e: any) => ({ error: true, data: e }));
  }
}
