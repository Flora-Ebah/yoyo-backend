import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { ISponsorPlan } from './sponsor-plan.interface';

const schema = new mongoose.Schema<ISponsorPlan>({
  _id: Schema.Types.ObjectId,
  name: { type: String },
  description: { type: String },
  price: { type: Number, default: 0 },
  durationDays: { type: Number, default: 30 },
  position: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' }
},
{ timestamps: true, minimize: false });

const model = mongoose.model<ISponsorPlan>('SponsorPlan', schema);

export class SponsorPlanSet extends MongoDbDao<ISponsorPlan & Document> implements IData<ISponsorPlan & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  select(payloads: { params?: any; page?: number; pageSize?: number; sort?: string; orderBy?: string }): Promise<any> {
    return new Promise(async (resolve) => {
      const page = Number(payloads.page) > 0 ? Number(payloads.page) : 1;
      const pageSize = Number(payloads.pageSize) > 0 ? Number(payloads.pageSize) : 50;
      const params = payloads.params || {};
      const [rows, totalRows] = await Promise.all([
        this.defaultModel.find(params).sort({ position: 1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
        this.defaultModel.countDocuments(params)
      ]);
      resolve({ rows, totalRows, page, pageSize, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)), countRowsPerPage: rows.length });
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ position: 1, createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
