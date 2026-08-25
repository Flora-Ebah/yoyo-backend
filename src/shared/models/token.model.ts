import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger'

export interface IToken {
	_id?: string,
	status?: string,
	token?: string,
	deactivatedAt?: Date,
}

const schema = new mongoose.Schema<IToken>({
	_id: Schema.Types.ObjectId,
	status: { type: String, enum: ['active', 'inactive', 'suspended', 'removed'], default: 'active' },
	token: { type: String, index: true },
	deactivatedAt: { type: Date },
},
{timestamps: true});

const model = mongoose.model<IToken>('Token', schema);

export class TokenSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}
}
