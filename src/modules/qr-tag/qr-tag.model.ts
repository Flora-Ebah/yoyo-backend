import mongoose, { Schema } from 'mongoose';
import { IQrTag, IQrTagBatch } from './qr-tag.interface';

// ===================== Lot =====================

const batchSchema = new mongoose.Schema<IQrTagBatch>(
	{
		_id: Schema.Types.ObjectId,
		label: { type: String, required: true, trim: true },
		prefix: { type: String, trim: true },
		count: { type: Number, required: true, min: 0 },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
	},
	{ timestamps: true }
);

export const QrTagBatchModel = mongoose.model<IQrTagBatch>('QrTagBatch', batchSchema);

// ===================== Sticker =====================

const schema = new mongoose.Schema<IQrTag>(
	{
		_id: Schema.Types.ObjectId,
		code: { type: String, required: true, unique: true },
		batch: { type: Schema.Types.ObjectId, ref: 'QrTagBatch', index: true },
		boutique: { type: Schema.Types.ObjectId, ref: 'Partner', default: null, index: true },
		status: { type: String, enum: ['vierge', 'affecte', 'desactive'], default: 'vierge', index: true },
		assignedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		assignedAt: { type: Date, default: null },
		deactivatedAt: { type: Date, default: null },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' }
	},
	{ timestamps: true }
);

export const QrTagModel = mongoose.model<IQrTag>('QrTag', schema);
