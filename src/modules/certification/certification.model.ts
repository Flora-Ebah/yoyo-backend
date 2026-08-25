import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger';

export interface IDocumentType {
	slug: string;
	title: string;
	description?: string;
}

export const DOCUMENT_TYPES: IDocumentType[] = [
	{
		slug: 'passeport',
		title: 'Passeport',
		description: 'Passeport en cours de validité'
	},
	{
		slug: 'carte-identite',
		title: "Carte Nationale d'Identité",
		description: "Carte nationale d'identité en cours de validité"
	},
	{
		slug: 'permis-conduire',
		title: 'Permis de Conduire',
		description: 'Permis de conduire en cours de validité'
	},
	{
		slug: 'carte-consulaire',
		title: 'Carte Consulaire',
		description: 'Carte consulaire en cours de validité'
	}
];

export interface IVerificationStatus {
	slug: string;
	title: string;
	description?: string;
}

export const VERIFICATION_STATUSES: IVerificationStatus[] = [
	{
		slug: 'en-attente',
		title: 'En attente',
		description: 'Document en attente de vérification'
	},
	{
		slug: 'en-cours',
		title: 'En cours',
		description: 'Document en cours de vérification'
	},
	{
		slug: 'verifie',
		title: 'Vérifié',
		description: 'Document vérifié et validé'
	},
	{
		slug: 'rejete',
		title: 'Rejeté',
		description: 'Document rejeté'
	}
];

export interface IRejectionReason {
	slug: string;
	title: string;
	description?: string;
}

export const REJECTION_REASONS: IRejectionReason[] = [
	{
		slug: 'document-expire',
		title: 'Document expiré',
		description: 'Le document fourni a expiré'
	},
	{
		slug: 'document-illisible',
		title: 'Document illisible',
		description: 'Le document fourni est illisible'
	},
	{
		slug: 'document-incomplet',
		title: 'Document incomplet',
		description: 'Le document fourni est incomplet'
	},
	{
		slug: 'document-invalide',
		title: 'Document invalide',
		description: "Le document fourni n'est pas valide"
	}
];

export interface ICertification {
	_id?: string;
	slug?: string;
	documentType?: string; // Type de document d'identité
	documentFile?: string[]; // tableau de noms de fichiers
	status?: string;
	user?: any;
	reviewedBy?: any; // Admin qui a vérifié le document
	reviewNotes?: string; // Notes de vérification
	rejectionReason?: string; // Raison du rejet si applicable
	verificationStatus?: string; // Statut de la vérification
	metadata?: {
		ipAddress?: string;
		userAgent?: string;
		fileSize?: number;
		mimeType?: string;
		uploadedAt?: Date;
		documentType?: string;
	};
	history?: Array<{
		action: string;
		performedBy: any;
		timestamp: Date;
		details: string;
	}>;
}

const schema = new mongoose.Schema<ICertification>(
	{
		_id: Schema.Types.ObjectId,
		slug: String,
		documentType: {
			type: String,
			required: true
		},
		documentFile: {
			type: [String],
			required: true
		},
		status: {
			type: String,
			enum: ['active', 'archived', 'removed'],
			default: 'active'
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Client'
		},
		reviewedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Admin'
		},
		reviewNotes: String,
		rejectionReason: {
			type: String,
			required: false
		},
		verificationStatus: {
			type: String,
			required: false,
			default: 'en-attente'
		},
		metadata: {
			ipAddress: String,
			userAgent: String,
			fileSize: Number,
			mimeType: String,
			uploadedAt: {
				type: Date,
				default: Date.now
			},
			documentType: {
				type: String
			}
		},
		history: [
			{
				action: {
					type: String,
					enum: ['SOUMIS', 'EXAMINE', 'STATUT_MODIFIE', 'INFORMATIONS_DEMANDEES']
				},
				performedBy: {
					type: mongoose.Schema.Types.ObjectId,
					ref: 'Admin'
				},
				timestamp: {
					type: Date,
					default: Date.now
				},
				details: String
			}
		]
	},
	{ timestamps: true }
);

const model = mongoose.model<ICertification>('Certification', schema);

export class CertificationSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	props: string = 'slug title';
	userProps: string = 'slug login lastname firstname';
	setTitle: string = 'CertificationSet';

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
					.lean()
					.populate('user', 'slug email lastname firstname')
					.populate('reviewedBy', 'slug email lastname firstname')
					.populate('history.performedBy', 'slug email lastname firstname'),
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
			LoggerService.log({
				type: LogLevel.Error,
				content: JSON.stringify(e),
				location: this.setTitle,
				method: 'select'
			});
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return new Promise(async (resolve, reject) => {
			let doc = await this.defaultModel
				.find(params)
				.lean()
				.populate({
					path: 'user',
					select: this.userProps,
					options: { sort: { createdAt: -1 } }
				});

			if (!doc) {
				reject(doc);
			} else {
				resolve(doc);
			}
		}).catch((e: any) => {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.setTitle, method: 'selectHug' });
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return new Promise(async (resolve, reject) => {
			resolve(
				await this.defaultModel.findOne(params, fields).lean()
				//.populate({
				//	path: 'user',
				//	select: this.userProps,
				//	options: { sort: { createdAt: -1 } }
				//})
			);
		}).catch((e: any) => {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.setTitle, method: 'selectOne' });
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}
}
