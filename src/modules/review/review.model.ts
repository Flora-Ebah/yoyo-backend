import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IReview } from './review.interface';

const schema = new mongoose.Schema<IReview>({
  _id: Schema.Types.ObjectId,
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true, index: true },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  emoji: { type: Number, required: true, min: 1, max: 5 },
  status: {
    type: String,
    enum: ['active', 'hidden', 'removed'],
    default: 'active'
  },
},
{ timestamps: true });

// Un seul avis par (partner, client) — modifiable.
schema.index({ partner: 1, client: 1 }, { unique: true });

const model = mongoose.model<IReview>('Review', schema);

export class ReviewSet extends MongoDbDao<IReview & Document> implements IData<IReview & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  select(payloads: {
    params?: any;
    excludes?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    orderBy?: string;
  }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      if (coddyger.string.isEmpty(payloads.params?.status)) {
        payloads.params = { ...payloads.params, status: { $nin: ['removed'] } };
      }

      let page: number = Number(payloads.page) || 1;
      const pageSize: number = Number(payloads.pageSize) || 10;
      page = page === 0 ? 1 : page;

      const startIndex = (page - 1) * pageSize;
      const model = this.defaultModel;
      const sortBy: string = payloads.sort ?? 'createdAt';
      const orderBy: string = payloads.orderBy ?? 'desc';
      const sortObject: any = { [sortBy]: orderBy === 'desc' ? -1 : 1 };

      const [rows, totalRows] = await Promise.all([
        model.find(payloads.params)
          .sort(sortObject).skip(startIndex).limit(pageSize)
          .populate('partner', '_id name')
          .populate('client', '_id firstname lastname')
          .lean(),
        model.countDocuments(payloads.params)
      ]);

      if (rows) {
        const totalPages = Math.ceil(totalRows / pageSize);
        resolve({ rows, totalRows, totalPages, countRowsPerPage: rows.length, totalPagesPerQuery: totalPages });
      } else {
        reject({ rows, totalRows });
      }
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
