import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, MongoDbDao } from 'coddyger';
import { IPaymentMethod } from './payment-method.interface';

const schema = new mongoose.Schema<IPaymentMethod>({
  _id: Schema.Types.ObjectId,
  name: { type: String, required: true },
  description: { type: String },
  type: { 
    type: String, 
    enum: ['mobile_money', 'card', 'bank_transfer', 'crypto', 'other'],
    required: true 
  },
  provider: { 
    type: String, 
    enum: ['orange_money', 'mtn_momo', 'wave', 'moov_money', 'visa', 'mastercard', 'paypal', 'stripe', 'other'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'removed'], 
    default: 'active' 
  },
  
  // Configuration API
  apiConfig: {
    baseUrl: { type: String, required: true },
    environment: { 
      type: String, 
      enum: ['dev', 'test', 'prod'],
      default: 'dev'
    },
    credentials: {
      apiKey: String,
      secretKey: String,
      merchantId: String,
      consumerKey: String,
      basicAuth: String,
    },
    endpoints: {
      payment: String,
      status: String,
      refund: String,
      webhook: String,
    },
    headers: Schema.Types.Mixed,
  },
  
  // Configuration des frais
  fees: {
    percentage: Number,
    fixed: Number,
    currency: { type: String, default: 'XOF' }
  },
  
  // Limites de transaction
  limits: {
    minAmount: Number,
    maxAmount: Number,
    currency: { type: String, default: 'XOF' }
  },
  
  // Configuration des webhooks
  webhookConfig: {
    url: String,
    secret: String,
    events: [String]
  },
  
  // Métadonnées spécifiques au provider
  metadata: Schema.Types.Mixed,
  
  // Configuration de l'interface utilisateur
  uiConfig: {
    logo: String,
    color: String,
    displayName: String,
    instructions: String
  }
},
{ timestamps: true });

const model = mongoose.model<IPaymentMethod>('PaymentMethod', schema);

/**
 * [SÉCURITÉ F-05] Projection appliquée à **toutes** les lectures de la collection.
 *
 * Ce document porte les identifiants des prestataires de paiement — clé d'API, clé secrète,
 * identifiant marchand, authentification de base — ainsi que le secret de signature des webhooks.
 * Rien, ni dans la plateforme ni dans les applications, n'a besoin de les relire : le paiement
 * Orange Money est configuré par variables d'environnement (`payment.helper.ts`). Ils ne doivent
 * donc jamais quitter le processus, y compris vers un administrateur.
 *
 * Conséquence assumée : cette collection ne se lit pas avec une projection d'inclusion, sans quoi
 * un appelant pourrait re-sélectionner un secret. Mongoose rejette explicitement le mélange des
 * deux formes, l'erreur est donc visible et non silencieuse.
 */
export const PAYMENT_METHOD_SECRET_PROJECTION = '-apiConfig.credentials -webhookConfig.secret';

export class PaymentMethodSet extends MongoDbDao<IPaymentMethod & Document> implements IData<IPaymentMethod & Document> {
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
					.find(payloads.params, `-password -__v ${PAYMENT_METHOD_SECRET_PROJECTION}`)
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
			let doc = await this.defaultModel.find(params, PAYMENT_METHOD_SECRET_PROJECTION).lean();

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
		const projection = [fields, PAYMENT_METHOD_SECRET_PROJECTION].filter(Boolean).join(' ');

		return Promise.resolve(this.defaultModel.findOne(params, projection).lean()).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}