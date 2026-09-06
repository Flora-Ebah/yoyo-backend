import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { ISettings } from './settings.interface';

const schema = new mongoose.Schema<ISettings>(
  {
    _id: Schema.Types.ObjectId,
    // Bornes de la remise marchand (cf. ISettings). Valeurs par défaut : min 10 %, max 50 %.
    discountMin: { type: Number, default: 10 },
    discountMax: { type: Number, default: 50 },
    // Délai de grâce avant anonymisation d'un compte supprimé (cf. ISettings). Défaut : 90 jours.
    accountDeletionGraceDays: { type: Number, default: 90 },
    status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' }
  },
  { timestamps: true }
);

const model = mongoose.model<ISettings>('Settings', schema);

export class SettingsSet extends MongoDbDao<ISettings & Document> implements IData<ISettings & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  // Le module n'expose pas de liste paginée (document unique), mais l'interface `IData` l'exige :
  // on fournit des implémentations minimales, seul `selectOne` est réellement utilisé.
  select(payloads: { params?: any }): Promise<any> {
    return new Promise(async (resolve) => {
      const rows = await this.defaultModel.find(payloads.params ?? {}).lean();
      resolve({ rows, totalRows: rows.length, totalPages: 1, countRowsPerPage: rows.length, totalPagesPerQuery: 1 });
    }).catch((e: any) => ({ error: true, data: e }));
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params ?? {}).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
