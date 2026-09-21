import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IBoutiqueManager } from './boutique-manager.interface';

const schema = new mongoose.Schema<IBoutiqueManager>(
  {
    _id: Schema.Types.ObjectId,

    boutique: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },

    managerName: { type: String, required: true },
    managerPhone: { type: String, required: true },

    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'removed'],
      default: 'active'
    }
  },
  { timestamps: true }
);

// Accès rapides : gérants d'un propriétaire, gérants d'une boutique, et boutiques d'un gérant.
schema.index({ owner: 1, status: 1 });
schema.index({ boutique: 1, status: 1 });
schema.index({ manager: 1, status: 1 });

const model = mongoose.model<IBoutiqueManager>('BoutiqueManager', schema);

export class BoutiqueManagerSet
  extends MongoDbDao<IBoutiqueManager & Document>
  implements IData<IBoutiqueManager & Document>
{
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
        model
          .find(payloads.params, '-__v')
          .populate('boutique', 'name ville status')
          .populate('manager', 'firstname lastname contact status')
          .sort(sortObject)
          .skip(startIndex)
          .limit(pageSize)
          .lean(),
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
    }).catch((e: any) => {
      return { error: true, data: e };
    });
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return new Promise(async (resolve, reject) => {
      const doc = await this.defaultModel
        .find(params, '-__v')
        .populate('boutique', 'name ville status')
        .populate('manager', 'firstname lastname contact status')
        .lean();

      if (!doc) {
        reject(doc);
      } else {
        resolve(doc);
      }
    }).catch((e: any) => {
      return { error: true, data: e };
    });
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => {
      return { error: true, data: e };
    });
  }
}
