import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IPlatformConfig } from './platform-config.interface';

const schema = new mongoose.Schema<IPlatformConfig>({
  _id: Schema.Types.ObjectId,
  discountColors: [{ threshold: { type: Number }, color: { type: String }, _id: false }],
  sponsorPlan: { price: { type: Number }, durationDays: { type: Number } },
  proximityPush: {
    radiusMeters: { type: Number },
    minIntervalHours: { type: Number },
    target: { type: String, enum: ['all', 'sponsored'] }
  },
  status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' }
},
{ timestamps: true, minimize: false });

const model = mongoose.model<IPlatformConfig>('PlatformConfig', schema);

export class PlatformConfigSet extends MongoDbDao<IPlatformConfig & Document> implements IData<IPlatformConfig & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  select(payloads: { params?: any; page?: number; pageSize?: number; sort?: string; orderBy?: string }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const [rows, totalRows] = await Promise.all([
        this.defaultModel.find(payloads.params || {}).lean(),
        this.defaultModel.countDocuments(payloads.params || {})
      ]);
      resolve({ rows, totalRows, totalPages: 1, countRowsPerPage: rows.length, totalPagesPerQuery: 1 });
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
