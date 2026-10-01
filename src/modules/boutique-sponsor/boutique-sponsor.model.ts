import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IBoutiqueSponsor } from './boutique-sponsor.interface';

const schema = new mongoose.Schema<IBoutiqueSponsor>({
  _id: Schema.Types.ObjectId,
  boutiqueId: { type: String, index: true },
  sponsorPlanId: { type: String },
  startDate: { type: Date },
  endDate: { type: Date },
  price: { type: Number },
  durationDays: { type: Number },
  createdBy: { type: String },
  status: { type: String, enum: ['active', 'expired', 'cancelled', 'removed'], default: 'active' }
},
{ timestamps: true, minimize: false });

const model = mongoose.model<IBoutiqueSponsor>('BoutiqueSponsor', schema);

export class BoutiqueSponsorSet extends MongoDbDao<IBoutiqueSponsor & Document> implements IData<IBoutiqueSponsor & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  select(payloads: { params?: any; page?: number; pageSize?: number; sort?: string; orderBy?: string }): Promise<any> {
    return new Promise(async (resolve) => {
      const [rows, totalRows] = await Promise.all([
        this.defaultModel.find(payloads.params || {}).sort({ createdAt: -1 }).lean(),
        this.defaultModel.countDocuments(payloads.params || {})
      ]);
      resolve({ rows, totalRows, totalPages: 1, countRowsPerPage: rows.length, totalPagesPerQuery: 1 });
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
