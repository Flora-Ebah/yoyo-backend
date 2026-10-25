import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/**
 * Question de la FAQ du centre d'aide, par appli (Excel CMS n°6). Modifiable dans le CMS
 * (Paramètres › FAQ) : les applis la lisent à l'ouverture du centre d'aide, sans mise à jour.
 */
export interface IFaq {
	_id?: string;
	app: 'client' | 'pro';
	/** Thème affiché en intertitre (ex. « QR code », « YO Boost »). */
	theme: string;
	question: string;
	answer: string;
	/** Ordre croissant d'affichage. */
	order: number;
	status: 'published' | 'draft' | 'removed';
	createdAt?: Date;
	updatedAt?: Date;
}

const schema = new mongoose.Schema<IFaq>(
	{
		_id: Schema.Types.ObjectId,
		app: { type: String, enum: ['client', 'pro'], required: true },
		theme: { type: String, default: '' },
		question: { type: String, required: true },
		answer: { type: String, required: true },
		order: { type: Number, default: 0 },
		status: { type: String, enum: ['published', 'draft', 'removed'], default: 'published' }
	},
	{ timestamps: true }
);
schema.index({ app: 1, status: 1, order: 1 });

const model = mongoose.model<IFaq>('Faq', schema);

export class FaqSet extends MongoDbDao<IFaq & Document> implements IData<IFaq & Document> {
	defaultModel = model;

	constructor() {
		super();
	}

	select(payloads: { params?: any }): Promise<any> {
		return Promise.resolve(this.selectHug(payloads.params)).then((rows: any) =>
			rows?.error ? rows : { rows, totalRows: rows.length, totalPages: 1, countRowsPerPage: rows.length, totalPagesPerQuery: 1 }
		);
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(this.defaultModel.find(params, '-__v').sort({ order: 1, createdAt: 1 }).lean()).catch((e: any) => ({
			error: true,
			data: e
		}));
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
