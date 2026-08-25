import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger'

export interface IAdmin {
	_id?: string; // MongoDB generated id
	slug?: string; // Reference of the document
	email?: string; // Title of the document
	password?: string; // Title of the document
	matricule?: string; // Content of the document
	phone?: string; // Content of the document
	phoneOffice?: string; // Content of the document
	lastname?: string; // Content of the document
	firstname?: string; // Content of the document
	address?: string; // Content of the document
	office?: string; // Content of the document
	photo?: string; // Content of the document
	type?: string; // externe - interne
	status?: string; // Status of the document - active - removed - archived
	user?: any; // The id of the user that owns or created the document
	profile?: any; // The id of the user that owns or created the document
	lastLogin?: Date; // The last login date
}


const schema = new mongoose.Schema<IAdmin>(
	{
		_id: Schema.Types.ObjectId,
		slug: String,
		email: String,
		password: String,
		matricule: String,
		phone: String,
		phoneOffice: String,
		lastname: String,
		firstname: String,
		address: String,
		office: String,
		photo: String,
		type: { type: String, enum: ['externe', 'interne'], default: 'interne' },
		status: { type: String, enum: ['active', 'archived', 'removed'], default: 'active' },
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
		profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
		lastLogin: Date
	},
	{ timestamps: true }
);

const model = mongoose.model<IAdmin>('Admin', schema);

export class AdminSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	props: string = 'slug title';
	userProps: string = 'slug email lastname firstname';
	setTitle: string = 'AdminSet';

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
					.populate({
						path: 'user',
						select: this.userProps,
						options: { sort: { createdAt: -1 } }
					}).populate({
						path: 'profile',
					})
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
				}).populate({
					path: 'profile',
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
					}).populate({
						path: 'profile',
					})
			);
		}).catch((e: any) => {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.setTitle, method: 'selectOne' });
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}
}