import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IEnrolment } from './enrolment.interface';

const schema = new mongoose.Schema<IEnrolment>({
  _id: Schema.Types.ObjectId,

  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
  commercial: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },

  // Instantané figé : voir la justification dans enrolment.interface.ts
  merchantName: { type: String, required: true },
  merchantEmail: { type: String, required: true },
  merchantPhone: { type: String, required: true },
  shopName: { type: String, required: true },
  ville: { type: String },
  category: { type: String },
  commercialName: { type: String, required: true },

  enrolmentStatus: {
    type: String,
    enum: ['pending', 'activated'],
    default: 'pending'
  },

  activationTokenHash: { type: String, default: null },
  activationTokenExpiresAt: { type: Date, default: null },
  activationTokenUsedAt: { type: Date, default: null },

  activationChannels: [{ type: String }],
  activationSentAt: { type: Date },
  activationAttempts: { type: Number, default: 0 },
  activatedAt: { type: Date },

  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'removed'],
    default: 'active'
  }
},
{ timestamps: true });

// Les trois filtres de la vue admin : par commercial, par statut métier, et par date.
schema.index({ commercial: 1, createdAt: -1 });
schema.index({ enrolmentStatus: 1, createdAt: -1 });
schema.index({ client: 1 });
// Recherche du jeton à l'activation (`consumeActivationToken`).
schema.index({ activationTokenHash: 1 });

const model = mongoose.model<IEnrolment>('Enrolment', schema);

export class EnrolmentSet extends MongoDbDao<IEnrolment & Document> implements IData<IEnrolment & Document> {
  defaultModel = model;

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
			if (coddyger.string.isEmpty(payloads.params.status)) {
				payloads.params = { ...payloads.params, status: { $nin: ['removed', 'archived'] } };
			}

			let page: number = Number(payloads.page) || 1;
			const pageSize: number = Number(payloads.pageSize) || 10;

			page = page === 0 ? 1 : page;

			const startIndex = (page - 1) * pageSize;
			const model = this.defaultModel;
			let sortBy: string = payloads.sort ?? 'createdAt';
			let orderBy: string = payloads.orderBy ?? 'desc';

			let sortObject: any = {};
			if (sortBy) {
				sortObject = {
					[sortBy]: orderBy === 'desc' ? -1 : 1
				};
			} else {
				sortObject = { createdAt: -1 };
			}

			const [rows, totalRows] = await Promise.all([
				model
					// L'empreinte du jeton n'a aucune raison de sortir du serveur.
					.find(payloads.params, '-activationTokenHash -__v')
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

				resolve({
					rows,
					totalRows,
					totalPages,
					countRowsPerPage,
					totalPagesPerQuery
				});
			} else {
				reject({ rows, totalRows });
			}
		}).catch((e: any) => {
			return { error: true, data: e };
		});
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return new Promise(async (resolve, reject) => {
			let doc = await this.defaultModel.find(params, '-activationTokenHash -__v').lean();

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
