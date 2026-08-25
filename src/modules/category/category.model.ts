import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { ICategory } from './category.interface';

const schema = new mongoose.Schema<ICategory>({
  _id: Schema.Types.ObjectId,
  name: { type: String, required: true },
  description: { type: String },
  parent: { type: Schema.Types.ObjectId, ref: 'Category' },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed'], 
    default: 'active' 
  },
  icon: { type: String },
  color: { type: String },
},
{ timestamps: true });

const model = mongoose.model<ICategory>('Category', schema);

export class CategorySet extends MongoDbDao<ICategory & Document> implements IData<ICategory & Document> {
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