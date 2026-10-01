import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { ILegal } from './legal.interface';

const schema = new mongoose.Schema<ILegal>(
	{
		_id: Schema.Types.ObjectId,
		slug: { type: String, required: true, unique: true, index: true, trim: true },
		title: { type: String, required: true },
		contentType: { type: String, enum: ['sections', 'text', 'html', 'markdown'], default: 'sections' },
		sections: [{ heading: { type: String }, body: { type: String }, _id: false }],
		content: { type: String },
		version: { type: String },
		status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' }
	},
	{ timestamps: true, minimize: false }
);

const model = mongoose.model<ILegal>('Legal', schema);

export class LegalSet extends MongoDbDao<ILegal & Document> implements IData<ILegal & Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	select(payloads: { params?: any; page?: number; pageSize?: number; sort?: string; orderBy?: string }): Promise<any> {
		return new Promise(async (resolve, reject) => {
			const [rows, totalRows] = await Promise.all([
				this.defaultModel.find(payloads.params || {}).lean(),
				this.defaultModel.countDocuments(payloads.params || {})
			]);
			resolve({ rows, totalRows, totalPages: 1, countRowsPerPage: rows.length, totalPagesPerQuery: 1 });
		}).catch((e: any) => ({ error: true, data: e }));
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(this.defaultModel.find(params).lean()).catch((e: any) => ({ error: true, data: e }));
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
