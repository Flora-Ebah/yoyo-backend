import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { ISpace } from './space.interface';

const schema = new mongoose.Schema<any>(
  {
    _id: Schema.Types.ObjectId,
    label: { type: String, required: true },
    roleLabel: { type: String, default: '' },
    landing: { type: String, required: true },
    requires: { type: [Schema.Types.Mixed], default: [] },
    excludes: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' },
  },
  { timestamps: true },
);

schema.index({ status: 1, order: 1 });

const model = mongoose.model<any>('Space', schema);

export class SpaceSet extends MongoDbDao<ISpace & Document> implements IData<ISpace & Document> {
  defaultModel = model;
  constructor() {
    super();
  }
}
