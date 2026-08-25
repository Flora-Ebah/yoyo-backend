import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger'
import { QuestionConstants, QuestionCategory, QuestionStatus, SecurityLevel } from './question.constants';

export interface IQuestion {
	_id?: string; // MongoDB generated id
	slug?: string; // Reference of the document
	questionText: string;
	languageCode?: string;
	category?: QuestionCategory;
	status?: QuestionStatus;
	securityLevel?: SecurityLevel;
	isCustomizable?: boolean;
	minAnswerLength?: number;
	maxAnswerLength?: number;
	createdBy?: string;
	updatedBy?: string;
	deletedAt?: Date;
	deletedBy?: string;
	version?: number;
	displayOrder?: number;
	guidelines?: string;
	validationRegex?: string;
	user?: any; // The id of the user that owns or created the document
}

const schema = new mongoose.Schema<IQuestion>(
	{
		_id: Schema.Types.ObjectId,
		slug: String,
		questionText: { type: String, required: true },
		languageCode: { type: String, maxlength: 5 },

		category: { 
			type: String, 
			enum: Object.values(QuestionConstants.CATEGORIES),
			default: QuestionConstants.CATEGORIES.PERSONNEL,
			required: true
		},
		status: { 
			type: String, 
			enum: Object.values(QuestionConstants.STATUS), 
			default: QuestionConstants.STATUS.ACTIVE
		},
		securityLevel: { 
			type: String, 
			enum: Object.values(QuestionConstants.SECURITY_LEVELS), 
			default: QuestionConstants.SECURITY_LEVELS.MEDIUM
		},
		isCustomizable: { type: Boolean, default: false },
		minAnswerLength: { type: Number, default: 3 },
		maxAnswerLength: { type: Number, default: 100 },
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		deletedAt: Date,
		deletedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		version: { type: Number, default: 1 },

		displayOrder: Number,
		guidelines: String,
		validationRegex: String,
		user: { type: Schema.Types.ObjectId, ref: 'Admin' }
	},
	{ 
		timestamps: true,
		versionKey: false
	}
);

const model = mongoose.model<IQuestion>('Question', schema);

export class QuestionSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	props: string = 'slug title';
	userProps: string = 'slug email lastname firstname';
	setTitle: string = 'QuestionSet';

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
					.find(payloads.params, '-password -__v')
					.sort(sortObject)
					.skip(startIndex)
					.limit(pageSize)
					.lean()
					.populate({
						path: 'user',
						select: this.userProps,
						options: { sort: { createdAt: -1 } }
					}),
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
					.populate({
						path: 'user',
						select: this.userProps,
						options: { sort: { createdAt: -1 } }
					})
			);
		}).catch((e: any) => {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.setTitle, method: 'selectOne' });
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}
}