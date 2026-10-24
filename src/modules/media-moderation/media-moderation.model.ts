import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IMediaModeration } from './media-moderation.interface';

const schema = new mongoose.Schema<IMediaModeration>(
	{
		_id: Schema.Types.ObjectId,
		fileName: { type: String, index: true, sparse: true },
		posterName: { type: String },
		originalName: { type: String },
		mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
		uploaderId: { type: Schema.Types.ObjectId },
		uploaderType: { type: String, enum: ['client', 'partner', 'admin'] },
		labels: [{ _id: false, name: String, parent: String, confidence: Number }],
		maxConfidence: { type: Number, default: 0 },
		status: { type: String, enum: ['approved', 'flagged', 'rejected', 'unchecked'], default: 'unchecked' },
		note: { type: String },
		reviewedBy: { type: Schema.Types.ObjectId },
		reviewedAt: { type: Date }
	},
	{ timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });

const model = mongoose.model<IMediaModeration>('MediaModeration', schema);

export class MediaModerationSet extends MongoDbDao<IMediaModeration & Document> implements IData<IMediaModeration & Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	select(payloads: { params?: any; page?: number; pageSize?: number }): Promise<any> {
		return (async () => {
			const params = payloads.params ?? {};
			const page = Math.max(1, Number(payloads.page) || 1);
			const pageSize = Math.min(100, Number(payloads.pageSize) || 24);

			const [rows, totalRows] = await Promise.all([
				this.defaultModel
					.find(params, '-__v')
					.sort({ createdAt: -1 })
					.skip((page - 1) * pageSize)
					.limit(pageSize)
					.lean(),
				this.defaultModel.countDocuments(params)
			]);
			const totalPages = Math.ceil(totalRows / pageSize);
			return { rows, totalRows, totalPages, countRowsPerPage: rows.length, totalPagesPerQuery: totalPages };
		})().catch((e: any) => ({ error: true, data: e }));
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(this.defaultModel.find(params ?? {}).lean()).catch((e: any) => ({ error: true, data: e }));
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
