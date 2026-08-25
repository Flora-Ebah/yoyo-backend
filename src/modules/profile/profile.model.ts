import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IProfile } from './profile.interface';

const schema = new mongoose.Schema<IProfile>({
  _id: Schema.Types.ObjectId,
  slug: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  ability: { type: [Schema.Types.Mixed], default: [] },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed'], 
    default: 'active' 
  },
  user: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
},
{ timestamps: true });

const model = mongoose.model<IProfile>('Profile', schema);

export class ProfileSet extends MongoDbDao<IProfile & Document> implements IData<IProfile & Document> {
  defaultModel = model;

  constructor() {
    super();
  }
}