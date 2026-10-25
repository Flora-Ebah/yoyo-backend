import mongoose, { Schema, Document } from 'mongoose';
import { IData, MongoDbDao } from 'coddyger';

/**
 * Alertes fraude (Excel CMS n°3) :
 *  - `multi-account-device` : plusieurs comptes inscrits depuis le même appareil (clé = appareil) ;
 *  - `flagged-scan` : réduction au montant inhabituel pour la boutique (clé = ticket) ;
 *  - `scan-velocity` : client qui valide trop de réductions en 24 h (clé = client) ;
 *  - `boutique-spike` : volume du jour d'une boutique très au-dessus de sa moyenne (clé = boutique).
 * Une seule alerte ouverte par couple (type, clé) : une nouvelle détection la met à jour.
 */
export type FraudAlertType = 'multi-account-device' | 'flagged-scan' | 'scan-velocity' | 'boutique-spike';
export const FRAUD_ALERT_TYPES: FraudAlertType[] = ['multi-account-device', 'flagged-scan', 'scan-velocity', 'boutique-spike'];
export type FraudAlertAction = 'dismiss' | 'blocked' | 'invalidate-ticket';

export interface IFraudAlert {
	_id?: any;
	type: FraudAlertType;
	subjectType: 'client' | 'boutique' | 'device' | 'payment';
	subjectKey: string;
	// Comptes et boutique concernés (liens du CMS, blocage).
	clients?: any[];
	boutique?: any;
	payment?: any;
	details?: any;
	occurrences?: number;
	lastSeenAt?: Date;
	status?: 'open' | 'actioned' | 'dismissed';
	action?: FraudAlertAction;
	note?: string;
	handledBy?: any;
	handledAt?: Date;
	createdAt?: Date;
}

const schema = new mongoose.Schema<IFraudAlert>(
	{
		_id: Schema.Types.ObjectId,
		type: { type: String, enum: FRAUD_ALERT_TYPES, required: true },
		subjectType: { type: String, enum: ['client', 'boutique', 'device', 'payment'], required: true },
		subjectKey: { type: String, required: true },
		clients: [{ type: Schema.Types.ObjectId, ref: 'Client' }],
		boutique: { type: Schema.Types.ObjectId, ref: 'Partner' },
		payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
		details: { type: Schema.Types.Mixed },
		occurrences: { type: Number, default: 1 },
		lastSeenAt: { type: Date },
		status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
		action: { type: String },
		note: { type: String },
		handledBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		handledAt: { type: Date }
	},
	{ timestamps: true, minimize: false }
);

schema.index({ type: 1, subjectKey: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
schema.index({ status: 1, lastSeenAt: -1 });

export const FraudAlertModel = mongoose.model<IFraudAlert>('FraudAlert', schema);

export class FraudAlertSet extends MongoDbDao<IFraudAlert & Document> implements IData<IFraudAlert & Document> {
	defaultModel = FraudAlertModel;

	constructor() {
		super();
	}

	selectOne(params: object, fields?: string): Promise<Document | any> {
		return Promise.resolve(this.defaultModel.findOne(params, fields).lean()).catch((e: any) => ({ error: true, data: e }));
	}

	selectHug(params?: any): Promise<Array<Document> | any> {
		return Promise.resolve(this.defaultModel.find(params ?? {}).lean()).catch((e: any) => ({ error: true, data: e }));
	}
}
