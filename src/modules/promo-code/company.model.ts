import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/** Entreprise cliente YOYO Business (Excel Codes n°4) : facturée hors appli, au forfait. */
export interface ICompany {
  _id?: any;
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  status: 'active' | 'archived';
  createdBy?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const schema = new mongoose.Schema<ICompany>(
  {
    _id: Schema.Types.ObjectId,
    name: { type: String, required: true, trim: true },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    notes: { type: String },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

const model = mongoose.model<ICompany>('Company', schema);

export class CompanySet extends MongoDbDao<ICompany & Document> implements IData<ICompany & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).sort({ name: 1 }).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
