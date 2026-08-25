import mongoose, { Schema, Document } from 'mongoose';
import coddyger, { IData, defines, LoggerService, LogLevel, MongoDbDao } from 'coddyger';
import { IPlan } from './plan.interface';

const schema = new mongoose.Schema<IPlan>(
  {
    _id: Schema.Types.ObjectId,
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true,
      default: 'XOF',
      enum: ['XOF', 'EUR', 'USD', 'GBP']
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      default: 30
    },
    discountPercentage: {
      type: Number,
      required: true,
      min: 1,
      max: 100
    },
    maxScansPerDay: {
      type: Number,
      min: 1,
      default: 5
    },
    maxScansPerMonth: {
      type: Number,
      min: 1,
      default: 100
    },
    features: [{
      type: String,
      required: true
    }],
    partnerCategories: {
      type: [String],
      default: ['all']
    },
    maxCashbackAmount: {
      type: Number,
      min: 0
    },
    isPopular: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    trialDays: {
      type: Number,
      default: 0
    },
    metadata: {
      type: Schema.Types.Mixed
    },
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'removed']
    }
  },
  { 
    timestamps: true,
    versionKey: false
  }
);

// Index pour optimiser les recherches
schema.index({ name: 1 });
schema.index({ price: 1 });
schema.index({ isActive: 1 });
schema.index({ isPopular: 1 });
schema.index({ discountPercentage: 1 });
schema.index({ partnerCategories: 1 });

const model = mongoose.model<IPlan>('Plan', schema);

export class PlanSet extends MongoDbDao<Document> implements IData<Document> {
  defaultModel = model;

  constructor() {
    super();
  }

  props: string = 'name description price currency durationDays discountPercentage maxScansPerDay maxScansPerMonth features partnerCategories maxCashbackAmount isPopular isActive trialDays';
  setTitle: string = 'PlanSet';

  /**
   * Récupère tous les plans actifs
   * @returns Liste des plans actifs
   */
  async getActivePlans(): Promise<IPlan[]> {
    try {
      return await this.defaultModel.find({ isActive: true }).sort({ price: 1 });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getActivePlans'
      });
      throw error;
    }
  }

  /**
   * Récupère le plan populaire/recommandé
   * @returns Le plan populaire
   */
  async getPopularPlan(): Promise<IPlan | null> {
    try {
      return await this.defaultModel.findOne({ isPopular: true, isActive: true });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getPopularPlan'
      });
      throw error;
    }
  }

  /**
   * Calcule le prix total pour une durée spécifique
   * @param planId ID du plan
   * @param months Nombre de mois
   * @returns Prix total
   */
  async calculatePrice(planId: string, months: number = 1): Promise<{ basePrice: number; totalPrice: number; discount: number; currency: string }> {
    try {
      const plan = await this.defaultModel.findById(planId);
      
      if (!plan) {
        throw new Error('Plan non trouvé');
      }
      
      const basePrice = plan.price;
      let discount = 0;
      
      // Appliquer des remises pour les abonnements de longue durée
      if (months >= 12) {
        discount = 0.20; // 20% de remise pour 1 an ou plus
      } else if (months >= 6) {
        discount = 0.10; // 10% de remise pour 6 mois ou plus
      } else if (months >= 3) {
        discount = 0.05; // 5% de remise pour 3 mois ou plus
      }
      
      const totalPrice = basePrice * months * (1 - discount);
      
      return {
        basePrice,
        totalPrice,
        discount: discount * 100, // Convertir en pourcentage
        currency: plan.currency
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'calculatePrice'
      });
      throw error;
    }
  }

  /**
   * Récupère les plans disponibles pour une catégorie spécifique de partenaires
   * @param category Catégorie de partenaire
   * @returns Liste des plans disponibles pour cette catégorie
   */
  async getPlansByCategory(category: string): Promise<IPlan[]> {
    try {
      // Si la catégorie est 'all', retourner tous les plans actifs
      if (category === 'all') {
        return await this.getActivePlans();
      }
      
      // Sinon, filtrer les plans qui incluent cette catégorie
      return await this.defaultModel.find({
        isActive: true,
        $or: [
          { partnerCategories: 'all' },
          { partnerCategories: category }
        ]
      }).sort({ price: 1 });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getPlansByCategory'
      });
      throw error;
    }
  }

  /**
   * Récupère les détails de plusieurs plans pour comparaison
   * @param planIds Liste des IDs des plans à comparer
   * @returns Détails des plans pour comparaison
   */
  async getPlansForComparison(planIds: string[]): Promise<IPlan[]> {
    try {
      return await this.defaultModel.find({
        _id: { $in: planIds.map(id => new mongoose.Types.ObjectId(id)) },
        status: { $ne: 'removed' }
      }).sort({ price: 1 });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.setTitle,
        method: 'getPlansForComparison'
      });
      throw error;
    }
  }
}