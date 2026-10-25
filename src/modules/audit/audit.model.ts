import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IAuditLog } from './audit.interface';

const schema = new mongoose.Schema<IAuditLog>(
	{
		_id: Schema.Types.ObjectId,
		actorId: { type: Schema.Types.ObjectId, ref: 'Admin', index: true },
		actorEmail: { type: String },
		actorType: { type: String, enum: ['admin', 'client', 'system'], default: 'admin' },
		method: { type: String, required: true },
		path: { type: String, required: true },
		subject: { type: String, index: true },
		targetId: { type: String },
		statusCode: { type: Number },
		success: { type: Boolean, default: true },
		ip: { type: String },
		userAgent: { type: String },
		action: { type: String },
		meta: { type: Schema.Types.Mixed }
	},
	{ timestamps: true }
);

// Rétention automatique (TTL) : MongoDB purge les entrées plus vieilles que
// `AUDIT_RETENTION_DAYS` (défaut 365 j). L'index ascendant sur `createdAt` sert
// aussi au tri décroissant de la lecture (parcours inversé), donc un seul index suffit.
const RETENTION_DAYS = Math.max(1, Number(process.env.AUDIT_RETENTION_DAYS) || 365);
schema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 60 * 60 });

const model = mongoose.model<IAuditLog>('AuditLog', schema);

export class AuditLogSet extends MongoDbDao<IAuditLog & Document> implements IData<IAuditLog & Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	/** Liste paginée, récents d'abord. Renvoie `{ rows, totalRows, totalPages, page, pageSize }`. */
	select(payloads: { params?: any; page?: number; pageSize?: number }): Promise<any> {
		return new Promise(async (resolve) => {
			try {
				const page = Math.max(1, Number(payloads.page) || 1);
				const pageSize = Math.min(200, Number(payloads.pageSize) || 50);
				const startIndex = (page - 1) * pageSize;
				const params = payloads.params ?? {};
				const [rows, totalRows] = await Promise.all([
					model.find(params, '-__v').sort({ createdAt: -1 }).skip(startIndex).limit(pageSize).lean(),
					model.countDocuments(params)
				]);
				resolve({ rows, totalRows, totalPages: Math.ceil(totalRows / pageSize), page, pageSize });
			} catch (e: any) {
				resolve({ error: true, data: e });
			}
		});
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(model.find(params).sort({ createdAt: -1 }).lean()).catch((e: any) => ({ error: true, data: e }));
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(model.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
