import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { ISupportTicket, ISupportMessage, SUPPORT_CATEGORY_VALUES } from './support.interface';

/* ============================================================================
 * Collection `supporttickets`
 * ========================================================================== */

const ticketSchema = new mongoose.Schema<ISupportTicket>(
	{
		_id: Schema.Types.ObjectId,
		// Référence courte lisible, unique (ex. « A1B2C3 ») : c'est l'identifiant communiqué au
		// client et recherché par le support dans YOYO ADMIN.
		reference: { type: String, required: true, unique: true, index: true },
		userId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
		category: { type: String, enum: SUPPORT_CATEGORY_VALUES, required: true },
		status: {
			type: String,
			enum: ['open', 'in_progress', 'resolved'],
			default: 'open'
		},
		assignedTo: { type: Schema.Types.ObjectId, ref: 'Admin' },
		// Basculé par l'assistant IA : en attente d'attribution tant qu'aucun agent n'a pris la main.
		escalated: { type: Boolean, default: false },
		// Appli d'origine (cf. ISupportTicket) et suivi des délais de réponse (Excel CMS n°5).
		source: { type: String, enum: ['client', 'pro'], default: 'client', index: true },
		awaitingSince: { type: Date, default: null },
		firstResponseAt: { type: Date, default: null },
		firstResponseDueAt: { type: Date },
		resolutionDueAt: { type: Date },
		slaAlertedAt: { type: Date, default: null },
		resolutionAlertedAt: { type: Date, default: null }
	},
	{ timestamps: true }
);

// File du cron des retards : tickets non résolus triés par échéance.
ticketSchema.index({ status: 1, firstResponseDueAt: 1 });
ticketSchema.index({ status: 1, resolutionDueAt: 1 });

const ticketModel = mongoose.model<ISupportTicket>('SupportTicket', ticketSchema);

export class SupportTicketSet extends MongoDbDao<ISupportTicket & Document> implements IData<ISupportTicket & Document> {
	defaultModel = ticketModel;

	constructor() {
		super();
	}

	select(payloads: {
		params?: any;
		excludes?: string;
		page?: number;
		pageSize?: number;
		sort?: string;
		orderBy?: string;
	}): Promise<any> {
		return new Promise(async (resolve, reject) => {
			let page: number = Number(payloads.page) || 1;
			const pageSize: number = Number(payloads.pageSize) || 10;

			page = page === 0 ? 1 : page;

			const startIndex = (page - 1) * pageSize;
			const model = this.defaultModel;
			let sortBy: string = payloads.sort ?? 'updatedAt';
			let orderBy: string = payloads.orderBy ?? 'desc';

			const sortObject: any = { [sortBy]: orderBy === 'desc' ? -1 : 1 };

			const [rows, totalRows] = await Promise.all([
				model
					.find(payloads.params, '-__v')
					.populate('userId', '_id firstname lastname')
					.populate('assignedTo', '_id firstname lastname email')
					.sort(sortObject)
					.skip(startIndex)
					.limit(pageSize)
					.lean(),
				model.countDocuments(payloads.params)
			]);

			if (rows) {
				const totalPages = Math.ceil(totalRows / pageSize);
				const countRowsPerPage = rows.length;
				const totalPagesPerQuery = Math.ceil(totalRows / pageSize);

				resolve({ rows, totalRows, totalPages, countRowsPerPage, totalPagesPerQuery });
			} else {
				reject({ rows, totalRows });
			}
		}).catch((e: any) => {
			return { error: true, data: e };
		});
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return new Promise(async (resolve, reject) => {
			let doc = await this.defaultModel.find(params).lean();

			if (!doc) {
				reject(doc);
			} else {
				resolve(doc);
			}
		}).catch((e: any) => {
			return { error: true, data: e };
		});
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}

/* ============================================================================
 * Collection `supportmessages`
 * ========================================================================== */

const messageSchema = new mongoose.Schema<ISupportMessage>(
	{
		_id: Schema.Types.ObjectId,
		ticketId: { type: Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
		sender: { type: String, enum: ['client', 'support', 'bot'], required: true },
		senderId: { type: Schema.Types.ObjectId },
		body: { type: String, required: true },
		// Nom de fichier servi par la route publique `/file/` (même convention que les autres médias).
		attachment: { type: String },
		read: { type: Boolean, default: false }
	},
	{ timestamps: true }
);

const messageModel = mongoose.model<ISupportMessage>('SupportMessage', messageSchema);

export class SupportMessageSet extends MongoDbDao<ISupportMessage & Document> implements IData<ISupportMessage & Document> {
	defaultModel = messageModel;

	constructor() {
		super();
	}

	select(payloads: {
		params?: any;
		excludes?: string;
		page?: number;
		pageSize?: number;
		sort?: string;
		orderBy?: string;
	}): Promise<any> {
		return new Promise(async (resolve, reject) => {
			let page: number = Number(payloads.page) || 1;
			const pageSize: number = Number(payloads.pageSize) || 50;

			page = page === 0 ? 1 : page;

			const startIndex = (page - 1) * pageSize;
			const model = this.defaultModel;
			let sortBy: string = payloads.sort ?? 'createdAt';
			let orderBy: string = payloads.orderBy ?? 'asc';

			const sortObject: any = { [sortBy]: orderBy === 'desc' ? -1 : 1 };

			const [rows, totalRows] = await Promise.all([
				model.find(payloads.params, '-__v').sort(sortObject).skip(startIndex).limit(pageSize).lean(),
				model.countDocuments(payloads.params)
			]);

			if (rows) {
				const totalPages = Math.ceil(totalRows / pageSize);
				resolve({ rows, totalRows, totalPages, countRowsPerPage: rows.length, totalPagesPerQuery: totalPages });
			} else {
				reject({ rows, totalRows });
			}
		}).catch((e: any) => {
			return { error: true, data: e };
		});
	}

	/** Messages d'un ticket, en ordre chronologique. */
	selectHug(params?: any): Promise<Array<Document> | any> {
		return new Promise(async (resolve, reject) => {
			// Tri stable : `createdAt` puis `_id` (ObjectId monotone croissant) départage les
			// messages créés dans la même milliseconde — p. ex. le transcript importé depuis
			// l'assistant, enregistré en rafale.
			let doc = await this.defaultModel.find(params).sort({ createdAt: 1, _id: 1 }).lean();

			if (!doc) {
				reject(doc);
			} else {
				resolve(doc);
			}
		}).catch((e: any) => {
			return { error: true, data: e };
		});
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}
