import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IDeviceToken } from './device-token.interface';

const schema = new mongoose.Schema<IDeviceToken>(
  {
    _id: Schema.Types.ObjectId,
    user: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    // Unique : un appareil passé à un autre compte garde le même jeton, qui est alors réattribué
    // plutôt que dupliqué (sinon l'ancien compte recevrait les push du nouveau).
    token: { type: String, required: true, unique: true },
    app: { type: String, enum: ['client', 'pro'], required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const model = mongoose.model<IDeviceToken>('DeviceToken', schema);

export class DeviceTokenSet extends MongoDbDao<IDeviceToken & Document> implements IData<IDeviceToken & Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  selectHug(params?: any): Promise<Array<Document> | any> {
    return Promise.resolve(this.defaultModel.find(params).lean()).catch((e: any) => ({ error: true, data: e }));
  }

  selectOne(params: object, fields?: string): Promise<Document | any> {
    return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
  }
}
