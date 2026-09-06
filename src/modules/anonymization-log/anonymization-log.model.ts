import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IAnonymizationLog } from './anonymization-log.interface';

const schema = new mongoose.Schema<IAnonymizationLog>(
  {
    _id: Schema.Types.ObjectId,
    clientId: { type: String, required: true },
    trigger: { type: String, enum: ['cron', 'admin'], required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    status: { type: String, enum: ['active', 'removed'], default: 'active' }
  },
  { timestamps: true }
);

const model = mongoose.model<IAnonymizationLog>('AnonymizationLog', schema);

export class AnonymizationLogSet extends MongoDbDao<IAnonymizationLog & Document> implements IData<IAnonymizationLog & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  select(payloads: { page?: number; pageSize?: number; params?: any }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const page = payloads.page && payloads.page > 0 ? payloads.page : 1;
        const pageSize = payloads.pageSize && payloads.pageSize > 0 ? payloads.pageSize : 20;
        const params = payloads.params ?? {};

        const totalRows = await model.countDocuments(params);
        const rows = await model
          .find(params)
          .sort({ createdAt: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .populate('performedBy', '_id email firstname lastname')
          .lean();

        const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
        resolve({ rows, totalRows, totalPages, countRowsPerPage: rows.length, totalPagesPerQuery: totalPages });
      } catch (e) {
        reject({ error: true, data: e });
      }
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(model.find(params ?? {}).sort({ createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(model.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
