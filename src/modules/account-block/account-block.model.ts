import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/**
 * Historique des blocages et déblocages de comptes (Excel CMS n°2).
 * `auto` : déblocage fait par le cron à la date de fin, sans administrateur.
 */
export interface IAccountBlock {
	_id?: string;
	user: any;
	action: 'block' | 'unblock';
	reason?: string;
	until?: Date | null;
	by?: any;
	auto?: boolean;
	createdAt?: Date;
}

const schema = new mongoose.Schema<IAccountBlock>(
	{
		_id: Schema.Types.ObjectId,
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
		action: { type: String, enum: ['block', 'unblock'], required: true },
		reason: { type: String },
		until: { type: Date, default: null },
		by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
		auto: { type: Boolean, default: false }
	},
	{ timestamps: true }
);

schema.index({ user: 1, createdAt: -1 });

export const AccountBlockModel = mongoose.model<IAccountBlock>('AccountBlock', schema);

export class AccountBlockSet extends MongoDbDao<IAccountBlock & Document> implements IData<IAccountBlock & Document> {
	defaultModel = AccountBlockModel;

	constructor() {
		super();
	}
}
