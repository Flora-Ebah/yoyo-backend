import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger'
import { IOtp } from './otp.interface';

const schema = new mongoose.Schema<IOtp>(
	{
		_id: Schema.Types.ObjectId,
		code: {
			type: String,
			required: true
		},
		login: {
			type: String,
			required: true
		},
		type: {
			type: String,
			required: true,
			enum: ['email', 'phone']
		},
		purpose: {
			type: String,
			required: true,
		},
		status: { 
			type: String, 
			enum: ['active', 'used', 'expired'], 
			default: 'active' 
		},
		expiresAt: {
			type: Date,
			required: true,
			default: () => new Date(Date.now() + 15 * 60 * 1000) // Expire après 15 minutes
		},
		usedAt: {
			type: Date,
			default: null
		},
		attempts: {
			type: Number,
			default: 0
		}
	},
	{ timestamps: true }
);

// Ajouter un index pour l'expiration automatique des documents
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index pour optimiser les recherches par login et status
schema.index({ login: 1, status: 1 });

const model = mongoose.model<IOtp>('Otp', schema);

export class OtpSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	props: string = 'code login type status';
	userProps: string = 'email phone';
	setTitle: string = 'OtpSet';

	select(payloads: { 
		params?: any, 
		excludes?: string, 
		page?: number, 
		pageSize?: number,
		sort?: string,
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
					.find(payloads.params, "-password -__v")
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
			LoggerService.log({
				type: LogLevel.Error,
				content: JSON.stringify(e),
				location: this.setTitle,
				method: 'select'
			});
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}

	selectHug(params?:any): Promise<Array<Document> | any> {
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
				await this.defaultModel
					.findOne(params, fields)
					.lean()
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