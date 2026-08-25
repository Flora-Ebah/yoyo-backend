import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, LoggerService, LogLevel, MongoDbDao } from 'coddyger';
import { ISubscription } from './subscription.interface';

const schema = new mongoose.Schema<ISubscription>(
  {
    _id: Schema.Types.ObjectId,
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Client'
    },
    planId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Plan'
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'expired', 'cancelled', 'pending', 'trial'],
      default: 'pending'
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ['paid', 'pending', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentMethod: {
      type: String
    },
    transactionId: {
      type: String
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    price: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      required: true
    },
    metadata: {
      type: Schema.Types.Mixed
    },
    // Champs pour le renouvellement anticipé
    pendingRenewal: {
      planId: {
        type: Schema.Types.ObjectId,
        ref: 'Plan'
      },
      startDate: {
        type: Date
      },
      endDate: {
        type: Date
      },
      price: {
        type: Number
      },
      paymentMethod: {
        type: String
      },
      transactionId: {
        type: String
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  },
  { 
    timestamps: true,
    versionKey: false
  }
);

// Index pour optimiser les recherches
schema.index({ userId: 1 });
schema.index({ planId: 1 });
schema.index({ status: 1 });
schema.index({ endDate: 1 });
schema.index({ startDate: 1 });

const model = mongoose.model<ISubscription>('Subscription', schema);

export class SubscriptionSet extends MongoDbDao<any> implements IData<any> {
  defaultModel = model;

  constructor() {
    super();
  }

  props: string = 'userId planId startDate endDate status paymentStatus paymentMethod transactionId autoRenew price currency';
  userProps: string = '_id slug lastname firstname contact';
  setTitle: string = 'SubscriptionSet';

  /**
   * Vérifie si un utilisateur a un abonnement actif
   * @param userId ID de l'utilisateur
   * @returns Vrai si l'utilisateur a un abonnement actif
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    try {
      const now = new Date();
      const count = await this.defaultModel.countDocuments({
        userId,
        status: 'active',
        endDate: { $gt: now }
      });
      
      return count > 0;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'hasActiveSubscription'
      });
      throw error;
    }
  }

  /**
   * Récupère l'abonnement actif d'un utilisateur
   * @param userId ID de l'utilisateur
   * @returns L'abonnement actif ou null
   */
  async getActiveSubscription(userId: string): Promise<any> {
    try {
      const now = new Date();
      return await this.selectOne({
        userId,
        status: 'active',
        endDate: { $gt: now }
      });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getActiveSubscription'
      });
      throw error;
    }
  }

  /**
   * Crée un nouvel abonnement
   * @param userId ID de l'utilisateur
   * @param planId ID du plan
   * @param price Prix de l'abonnement
   * @param currency Devise
   * @param durationMonths Durée en mois (par défaut: 1)
   * @returns Le nouvel abonnement
   */
  async createSubscription(
    userId: string,
    planId: string,
    price: number,
    currency: string,
    durationMonths: number = 1
  ): Promise<ISubscription> {
    try {
      // Date de début = date actuelle
      const startDate = new Date();
      
      // Date de fin = date de début + durée en mois
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      
      const subscriptionData: ISubscription = {
        userId,
        planId,
        startDate,
        endDate,
        status: 'pending',
        paymentStatus: 'pending',
        autoRenew: false,
        price,
        currency
      };
      
      const result = await this.save(subscriptionData);
      
      // Vérifier si le résultat est une erreur
      if ('error' in result) {
        throw new Error(`Erreur lors de la création de l'abonnement: ${result.message}`);
      }
      
      return result as ISubscription;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'createSubscription'
      });
      throw error;
    }
  }

  /**
   * Active un abonnement après paiement réussi
   * @param subscriptionId ID de l'abonnement
   * @param transactionId ID de la transaction
   * @param paymentMethod Méthode de paiement
   * @returns L'abonnement mis à jour
   */
  async activateSubscription(
    subscriptionId: string,
    transactionId: string,
    paymentMethod: string
  ): Promise<ISubscription | null> {
    try {
      await this.update(
        { _id: subscriptionId },
        {
          status: 'active',
          paymentStatus: 'paid',
          transactionId,
          paymentMethod
        }
      );
      
      return await this.selectOne({ _id: subscriptionId }) as ISubscription;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'activateSubscription'
      });
      throw error;
    }
  }

  /**
   * Annule un abonnement
   * @param subscriptionId ID de l'abonnement
   * @param reason Raison de l'annulation
   * @returns L'abonnement mis à jour
   */
  async cancelSubscription(
    subscriptionId: string,
    reason?: string
  ): Promise<ISubscription | null> {
    try {
      await this.update(
        { _id: subscriptionId },
        {
          status: 'cancelled',
          autoRenew: false,
          metadata: { cancellationReason: reason, cancelledAt: new Date() }
        }
      );
      
      return await this.selectOne({ _id: subscriptionId }) as ISubscription;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'cancelSubscription'
      });
      throw error;
    }
  }

  /**
   * Récupère les abonnements qui expirent bientôt
   * @param daysThreshold Nombre de jours avant expiration
   * @returns Liste des abonnements qui expirent bientôt
   */
  async getExpiringSubscriptions(daysThreshold: number = 7): Promise<ISubscription[]> {
    try {
      const now = new Date();
      const thresholdDate = new Date(now);
      thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
      
      return await this.defaultModel.find({
        status: 'active',
        endDate: { $gt: now, $lte: thresholdDate }
      }).populate('userId planId');
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getExpiringSubscriptions'
      });
      throw error;
    }
  }

  /**
   * Marque les abonnements expirés comme tels
   * @returns Nombre d'abonnements mis à jour
   */
  async markExpiredSubscriptions(): Promise<number> {
    try {
      const now = new Date();
      const result = await this.defaultModel.updateMany(
        {
          status: 'active',
          endDate: { $lte: now }
        },
        {
          status: 'expired'
        }
      );
      
      return result.modifiedCount;
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'markExpiredSubscriptions'
      });
      throw error;
    }
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
					.populate('userId', this.userProps)
					.populate('planId')
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
			let doc = await this.defaultModel.find(params).populate('userId', this.userProps).populate('planId').lean();

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
		return Promise.resolve(this.defaultModel.findOne(params, fields).populate('userId', this.userProps).populate('planId').lean()).catch((e: any) => {
			return { error: true, data: e };
		});
	}
}