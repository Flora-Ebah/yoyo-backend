import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';
import { IReport, REPORT_REASONS, REPORT_TARGETS } from './report.interface';

/**
 * Signalement d'un contenu par un utilisateur de l'appli Client (Excel CMS n°13).
 * Un compte ne signale qu'une fois la même cible (index unique).
 */
const schema = new mongoose.Schema<IReport>(
	{
		_id: Schema.Types.ObjectId,
		reporter: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
		targetType: { type: String, enum: REPORT_TARGETS, required: true },
		// Boutique ou commentaire : identifiant ; média : clé du fichier.
		targetId: { type: String, required: true },
		partner: { type: Schema.Types.ObjectId, ref: 'Partner' },
		reason: { type: String, enum: REPORT_REASONS.map((r) => r.key), required: true },
		comment: { type: String, maxlength: 500 },
		status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
		action: { type: String },
		note: { type: String },
		handledBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		handledAt: { type: Date }
	},
	{ timestamps: true }
);

schema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
schema.index({ status: 1, targetType: 1, targetId: 1 });
schema.index({ reporter: 1, createdAt: -1 });

export const ReportModel = mongoose.model<IReport>('Report', schema);

export class ReportSet extends MongoDbDao<IReport & Document> implements IData<IReport & Document> {
	defaultModel = ReportModel;

	constructor() {
		super();
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(this.defaultModel.find(params ?? {}).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
