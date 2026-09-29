import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IHomeSlide } from './home-slide.interface';

const schema = new mongoose.Schema<IHomeSlide>({
  _id: Schema.Types.ObjectId,
  title: { type: String },
  image: { type: String, required: true },
  link: { type: String },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  startsAt: { type: Date },
  endsAt: { type: Date },
  status: {
    type: String,
    enum: ['active', 'inactive', 'removed'],
    default: 'active'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
},
{ timestamps: true });

const model = mongoose.model<IHomeSlide>('HomeSlide', schema);

export class HomeSlideSet extends MongoDbDao<IHomeSlide & Document> implements IData<IHomeSlide & Document> {
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
      const pageSize: number = Number(payloads.pageSize) || 50;
      page = page === 0 ? 1 : page;

      const startIndex = (page - 1) * pageSize;
      const model = this.defaultModel;
      const sortBy: string = payloads.sort ?? 'order';
      const orderBy: string = payloads.orderBy ?? 'asc';
      const sortObject: any = { [sortBy]: orderBy === 'desc' ? -1 : 1 };

      const [rows, totalRows] = await Promise.all([
        model.find(payloads.params).sort(sortObject).skip(startIndex).limit(pageSize).lean(),
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
    return Promise.resolve(this.defaultModel.find(params).sort({ order: 1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
