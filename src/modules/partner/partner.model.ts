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
  socials: {
    facebook: { type: String },
    instagram: { type: String },
    tiktok: { type: String },
    twitter: { type: String },
    whatsapp: { type: String },
    website: { type: String }
  },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  thumbnail: { type: String },
  photos: [{ type: String }],
  // Vidéo de présentation facultative + image d'aperçu (voir POST /upload). Chaîne vide = retirée.
  video: { type: String },
  videoPoster: { type: String },
  maxDiscount: { type: Number },
  minOrder: { type: Number },
  // Plafond par achat (FCFA) ; absent ou 0 = plafond de la plateforme (`redeemLimits.maxAmount`).
  maxOrder: { type: Number },
  isSponsored: { type: Boolean, default: false },
  // Jours et heures d'ouverture
  openingHours: [openingHoursSchema],
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'removed', 'pending'],
    default: 'active'
  },
  // Validation par l'équipe YoYo d'une boutique créée par le marchand lui-même (Excel CMS n°14).
  // Contrôle a posteriori : `pending` n'empêche pas la boutique d'être en ligne (`status: 'active'`) ;
  // seul un refus (`rejected`) la masque (`status: 'pending'`). Voir `PartnerValidationService`.
  // Absent sur les boutiques antérieures ou enrôlées par un commercial (créées directement actives).
  validation: {
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    reason: { type: String },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    at: { type: Date },
    submittedAt: { type: Date }
  },
  // Statut mémorisé avant une suppression de compte, pour le restaurer à l'identique lors d'une
  // réactivation (évite qu'une boutique suspendue/non validée ne revienne en `active`).
  statusBeforeRemoval: { type: String },
  // Boutique suspendue par le blocage du compte de son propriétaire : seule celle-ci est rétablie au déblocage.
  suspendedByBlock: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  // Admin (commercial) qui a enrôlé cette boutique à distance. Posé depuis le jeton, jamais du
  // corps de la requête. Absent sur les boutiques créées par le marchand lui-même.
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
},
{ timestamps: true });

// Index (la collection est lue bien plus souvent qu'écrite). Sans eux, chaque liste boutiques, le
// feed Découvrir, les stats, la géo et les contrôles de propriété balayaient toute la collection.
// Chemin chaud : liste admin + feed (filtre statut, boutiques mises en avant d'abord, puis récentes).
schema.index({ status: 1, isSponsored: -1, createdAt: -1 });
schema.index({ user: 1 });                 // boutiques d'un marchand, contrôle de propriété
schema.index({ createdBy: 1 });            // boutiques enrôlées par un commercial (attribution)
schema.index({ categories: 1 });           // filtre par catégorie (multikey)
schema.index({ ville: 1 });                // filtre ville, distinct(ville), répartition géo
schema.index({ 'validation.status': 1 });  // file des boutiques à valider / refusées

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

			// [YO Boost] Les boutiques mises en avant (isSponsored) remontent EN TÊTE du feed Découvrir.
			// L'ordre des clés compte : isSponsored:-1 d'abord, puis le tri courant comme départage.
			sortObject = { isSponsored: -1, ...sortObject };

			const [rows, totalRows] = await Promise.all([
				model
					.find(payloads.params, '-password -__v')
					.sort(sortObject)
					.skip(startIndex)
					.limit(pageSize)
					.populate('user', 'firstname lastname email isDocumentVerified')
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
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean().populate('user', 'firstname lastname email isDocumentVerified').populate('categories')).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}