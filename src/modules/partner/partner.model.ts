import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IPartner, IOpeningHours } from './partner.interface';

// Sous-schéma pour les pauses
const breakSchema = new mongoose.Schema({
  startTime: { type: String, required: true },
  endTime: { type: String, required: true }
}, { _id: false });

// Sous-schéma pour les heures d'ouverture
const openingHoursSchema = new mongoose.Schema<IOpeningHours>({
  day: { 
    type: String, 
    required: true,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  isOpen: { type: Boolean, default: false },
  openTime: { type: String },
  closeTime: { type: String },
  breaks: [breakSchema]
}, { _id: false });

const schema = new mongoose.Schema<IPartner>({
  _id: Schema.Types.ObjectId,
  slug: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  ville: { type: String },
  address: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  phone: { type: String },
  email: { type: String },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  thumbnail: { type: String },
  photos: [{ type: String }],
  maxDiscount: { type: Number },
  minOrder: { type: Number },
  isSponsored: { type: Boolean, default: false },
  // Jours et heures d'ouverture
  openingHours: [openingHoursSchema],
  
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed'], 
    default: 'active' 
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  // Admin (commercial) qui a enrôlé cette boutique à distance. Posé depuis le jeton, jamais du
  // corps de la requête. Absent sur les boutiques créées par le marchand lui-même.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
},
{ timestamps: true });

const model = mongoose.model<IPartner>('Partner', schema);

export class PartnerSet extends MongoDbDao<IPartner & Document> implements IData<IPartner & Document> {
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

			// Create sort object
			let sortObject: any = {};
			if (sortBy) {
				sortObject = {
					[sortBy]: orderBy === 'desc' ? -1 : 1
				};
			} else {
				// Default sort by createdAt in descending order if no sortBy is provided
				sortObject = { createdAt: -1 };
			}

			const [rows, totalRows] = await Promise.all([
				model
					.find(payloads.params, '-password -__v')
					.sort(sortObject)
					.skip(startIndex)
					.limit(pageSize)
					.populate('user', 'firstname lastname email')
					.populate('categories')
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
			let doc = await this.defaultModel.find(params).lean().populate('user', 'firstname lastname email').populate('categories');

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
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean().populate('user', 'firstname lastname email').populate('categories')).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}