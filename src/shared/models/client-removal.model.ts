import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, IErrorObject, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger'

export interface IClientRemoval {
	_id?: string; // MongoDB generated id
	reason?: string; // Reason of the removal
	reasonOther?: string; // Reason of the removal
	status?: string; // Status of the document - active - removed - archived
	client?: any; // The id of the user that owns or created the document
	removedAt?: Date; // Date of the removal
}

const schema = new mongoose.Schema<IClientRemoval>(
	{
		_id: Schema.Types.ObjectId,
		reason: { type: mongoose.Schema.Types.ObjectId, ref: 'MotifSuppression' },
		reasonOther: String,
		client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
		removedAt: { type: Date, default: null },
		status: { type: String, enum: ['active', 'removed'], default: 'active' }
	},
	{ timestamps: true }
);

const model = mongoose.model<IClientRemoval>('ClientRemoval', schema);

export class ClientRemovalSet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	props: string = 'slug title';
	userProps: string = 'slug login lastname firstname';
	setTitle: string = 'ClientRemovalSet';

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
					.populate({
						path: 'client',
						select: this.userProps,
						options: { sort: { createdAt: -1 } }
					}).
					populate({
						path: 'reason',
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
					path: 'client',
					select: this.userProps,
					options: { sort: { createdAt: -1 } }
				})
				.populate({
					path: 'reason'
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
						path: 'client',
						select: this.userProps,
						options: { sort: { createdAt: -1 } }
					})
					.populate({
						path: 'reason'
					})
			);
		}).catch((e: any) => {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.setTitle, method: 'selectOne' });
			return { error: true, data: e, message: defines.message.tryCatch };
		});
	}
}