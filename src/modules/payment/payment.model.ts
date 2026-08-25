import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IPayment } from './payment.interface';

const schema = new mongoose.Schema<IPayment>({
  _id: Schema.Types.ObjectId,
  from: { type: Schema.Types.ObjectId, ref: 'Client' },
  to: { type: Schema.Types.ObjectId, ref: 'Partner' },
  amount: { type: Number },
  discountPercentage: { type: Number, default: 0 },
  completedAt: { type: Date },
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed', 'refunded', 'expired', 'cancelled', 'rejected'], 
    default: 'pending' 
  },
  deniedAt: { type: Date },
  deniedReason: { type: String },
  deniedBy: { type: Schema.Types.ObjectId, ref: 'Client' },
},
{ timestamps: true });

const model = mongoose.model<IPayment>('Payment', schema);
const userProps = '_id lastname firstname email contact';

export class PaymentSet extends MongoDbDao<IPayment & Document> implements IData<IPayment & Document> {
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
					.find(payloads.params)
					.sort(sortObject)
					.skip(startIndex)
					.limit(pageSize)
					.populate('from', userProps)
					.populate('to', '_id name')
					.populate('deniedBy', userProps)
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
			let doc = await this.defaultModel.find(params).populate('from', userProps).populate('to', '_id name').populate('deniedBy', userProps).lean();

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
		return Promise.resolve(this.defaultModel.findOne(params, fields).populate('from', userProps).populate('to', '_id name').populate('deniedBy', userProps).lean()).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}