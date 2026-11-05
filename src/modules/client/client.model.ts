import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IClient } from './client.interface';

const schema = new mongoose.Schema<IClient>({
  _id: Schema.Types.ObjectId,
  // Facultatif : un marchand enrôlé sur le terrain peut n'avoir qu'un téléphone (activation sur
  // place). Les parcours grand public continuent d'exiger l'e-mail via leur validation applicative.
  email: { type: String },
  firstname: { type: String, required: true },
  lastname: { type: String, required: true },
  password: { type: String, required: true },
  contact: { type: String },
  address: { type: String },
  birthdate: { type: Date },
  country: { type: String },
  gender: { type: String },
  isEmailConfirmed: { type: Boolean, default: false },
  isPhoneConfirmed: { type: Boolean, default: false },
  isDocumentVerified: { type: Boolean, default: false },
  documents: { type: [Schema.Types.Mixed] },
  isCertified: { type: Boolean, default: false },
  documentVerificationStatus: { type: String, default: null },
  avatar: { type: String },
  secretQuestion: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  secretResponse: { type: String },
  notificationPreferences: {
		email: { type: Boolean, default: true },
		push: { type: Boolean, default: true },
		sms: { type: Boolean, default: false },
		frequency: { 
			type: String, 
			enum: ['immediate', 'daily', 'weekly'], 
			default: 'immediate' 
		},
		types: {
			news: { type: Boolean, default: true },
			updates: { type: Boolean, default: true },
			security: { type: Boolean, default: true },
			marketing: { type: Boolean, default: false }
		}
	},
  securityPreferences: {
		twoFactorEnabled: { type: Boolean, default: false },
		twoFactorMethod: { 
			type: String, 
			enum: ['email', 'sms', 'authenticator'], 
			default: 'email' 
		},
		loginNotifications: { type: Boolean, default: false },
		sessionTimeout: { type: Number, default: 60 },
		ipWhitelist: [{ type: String }]
	},
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed', 'locked', 'pending', 'anonymized'],
    default: 'pending'
  },
  isPartner: { type: Boolean, default: false },
  // Compte GÉRANT (créé par un partenaire pour gérer une boutique) : ce n'est ni un client de
  // l'app ni un partenaire — il ne doit pas apparaître dans la liste « Utilisateurs » du CMS.
  isManager: { type: Boolean, default: false },
  // Onboarding à distance : le compte est créé par un commercial avec un mot de passe aléatoire
  // jamais communiqué. Le marchand définit le sien via le lien d'activation.
  mustChangePassword: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  activatedAt: { type: Date },
	removedReason: { type: String },
	removedAt: { type: Date },
	removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
	// Anonymisation DCP/RGPD (cf. IClient).
	anonymizedAt: { type: Date },
	// Blocage par un administrateur (Excel CMS n°2) : motif, fin (null = définitif), auteur, date.
	// `statusBeforeBlock` permet de rendre au compte son statut d'origine au déblocage.
	block: {
		reason: { type: String },
		until: { type: Date, default: null },
		by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
		at: { type: Date }
	},
	statusBeforeBlock: { type: String },
	reactivatedAt: { type: Date },
	// Parrainage (#6/#7) + attribution influenceur (#17).
	referralCode: { type: String, index: true },
	referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
	referredCount: { type: Number, default: 0 },
	freeMonthsGranted: { type: Number, default: 0 },
	referralCredited: { type: Boolean, default: false },
	// Parrainage : anti-fraude, revue et relances (cf. IClient).
	signupDeviceId: { type: String, index: true, sparse: true },
	// Dernier export des données personnelles demandé par l'utilisateur (1 par 24 h, Excel CMS n°16).
	lastDataExportAt: { type: Date },
	referralValidatedAt: { type: Date },
	referralRejected: { type: String },
	referralReview: { type: Boolean, default: false },
	referralReviewClearedAt: { type: Date },
	referralRewardId: { type: mongoose.Schema.Types.ObjectId, ref: 'FreeMonthGrant' },
	referralRewardBlocked: { type: Boolean, default: false },
	referralWarnings: { type: Number, default: 0 },
	referralNudges: { type: Number, default: 0 },
	referralLastNudgeAt: { type: Date },
	// Codes & promotions : code saisi à l'inscription, anti-devinette.
	pendingPromoCode: { type: String },
	promoFailures: { type: Number, default: 0 },
	promoFailuresAt: { type: Date },
	influencerCode: { type: String },
	// Push proximité (#1).
	lastLocation: { lat: { type: Number }, lng: { type: Number }, at: { type: Date } },
	lastProximityPushAt: { type: Date },
},
{ timestamps: true });

// Index : les lookups par e-mail/téléphone sont sur le chemin critique (connexion à chaque requête
// mobile, contrôle d'unicité à l'enrôlement) et balayaient toute la collection. Non uniques : un
// compte anonymisé libère son e-mail/numéro, des doublons « vides » peuvent coexister.
schema.index({ email: 1 });
schema.index({ contact: 1 });
schema.index({ status: 1, createdAt: -1 });   // liste utilisateurs (tri récent)
schema.index({ isPartner: 1, status: 1 });     // marchands vs clients (listes + stats dashboard)
schema.index({ createdBy: 1 });                // marchands enrôlés par un commercial

const model = mongoose.model<IClient>('Client', schema);

export class ClientSet extends MongoDbDao<IClient & Document> implements IData<IClient & Document> {
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
				payloads.params = { ...payloads.params, status: { $nin: ['removed', 'archived', 'anonymized'] } };
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
					.lean()
					.populate('secretQuestion', 'questionText category')
					.populate('removedBy', '_id email firstname lastname'),
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
			let doc = await this.defaultModel.find(params).lean().populate('secretQuestion', 'questionText category').populate('removedBy', '_id email firstname lastname');

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
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean().populate('secretQuestion', 'questionText category').populate('removedBy', '_id email firstname lastname')).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}