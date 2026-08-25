import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger'

export interface IActivity {
	_id?: string; // MongoDB generated id
	slug?: string; // Reference of the document
	title?: string; // Title of the document
	content?: string; // Content of the document
	status?: string; // Status of the document - active - removed - archived
	item?: any; // L'objet concerné par l'activité
	itemType: string; // Champ dynamique pour indiquer le type de l'objet référencé
	user?: any; // Owner of the document
}

const schema = new mongoose.Schema<IActivity>(
	{
		_id: Schema.Types.ObjectId,
		slug: String,
		title: String,
		content: String,
		status: { type: String, enum: ['active', 'archived', 'removed'], default: 'active' },
		item: { type: Schema.Types.ObjectId, refPath: 'itemType' },
		itemType: { type: String, required: true },
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

const model = mongoose.model<IActivity>('Activity', schema);

export class ActivitySet extends MongoDbDao<Document> implements IData<Document> {
	defaultModel = model;

	constructor() {
		super();
	}

}
