import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IInfluencer } from './influencer.interface';

const schema = new mongoose.Schema<IInfluencer>({
  _id: Schema.Types.ObjectId,
  name: { type: String, required: true },
  contact: { type: String },
  code: { type: String, required: true, index: true },
  active: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'removed'],
    default: 'active'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
},
{ timestamps: true });

const model = mongoose.model<IInfluencer>('Influencer', schema);

export class InfluencerSet extends MongoDbDao<IInfluencer & Document> implements IData<IInfluencer & Document> {
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
        payloads.params = { ...payloads.params, status: { $nin: ['removed', 'archived'] } };
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
        model.find(payloads.params).sort(sortObject).skip(startIndex).limit(pageSize).lean(),
        model.countDocuments(payloads.params)
      ]);

      if (rows) {
        const totalPages = Math.ceil(totalRows / pageSize);
        resolve({
          rows,
          totalRows,
          totalPages,
          countRowsPerPage: rows.length,
          totalPagesPerQuery: totalPages
        });
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
