const mongoose = require('mongoose');
const { LoggerService, LogLevel } = require('coddyger');

class PlanSeeder {
  constructor() {
    this.seederLabel = 'PlanSeeder';
    this.Plan = null;
  }

  /**
   * Initialise la connexion à la base de données et le modèle
   */
  async init() {
    try {
      // Connexion à MongoDB (dbName doit être passé explicitement,
      // sinon Mongoose se connecte par défaut à la base "test")
      const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'yoyo';
      await mongoose.connect(mongoUri, { dbName });
      console.log('📡 Connexion à la base de données établie');

      // Définition du schéma Plan
      const planSchema = new mongoose.Schema({
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, required: true },
        durationDays: { type: Number, required: true },
        discountPercentage: { type: Number, default: 0 },
        maxScansPerDay: { type: Number },
        maxScansPerMonth: { type: Number },
        features: [{ type: String }],
        partnerCategories: [{ type: String }],
        maxCashbackAmount: { type: Number },
        isPopular: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        trialDays: { type: Number },
        metadata: { type: mongoose.Schema.Types.Mixed },
        status: { 
          type: String, 
          enum: ['active', 'inactive', 'removed', 'archived'], 
          default: 'active' 
        }
      }, { timestamps: true });

      this.Plan = mongoose.model('Plan', planSchema);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation:', error);
      throw error;
    }
  }

  /**
   * Ferme la connexion à la base de données
   */
  async close() {
    try {
      await mongoose.connection.close();
      console.log('📡 Connexion à la base de données fermée');
    } catch (error) {
      console.error('❌ Erreur lors de la fermeture:', error);
    }
  }

  /**
   * Données de base pour les plans d'abonnement
   */
  getPlanData() {
    return [
      // Plan Gratuit
      {
        name: 'Gratuit',
        description: 'Plan d\'essai gratuit pour découvrir YoYo. Accès limité aux fonctionnalités de base.',
        price: 0,
        currency: 'XOF',
        durationDays: 7,
        discountPercentage: 0,
        maxScansPerDay: 5,
        maxScansPerMonth: 50,
        features: [
          '5 scans QR par jour',
          '50 scans par mois maximum',
          'Accès aux commerces partenaires',
          'Support client de base',
          'Notifications push'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté'],
        maxCashbackAmount: 100,
        isPopular: false,
        isActive: true,
        trialDays: 7,
        status: 'active',
        metadata: {
          planType: 'trial',
          recommendedFor: 'nouveaux utilisateurs'
        }
      },

      // Plan Basic
      {
        name: 'Basic',
        description: 'Plan essentiel pour les utilisateurs occasionnels. Parfait pour commencer avec YoYo.',
        price: 2500,
        currency: 'XOF',
        durationDays: 30,
        discountPercentage: 5,
        maxScansPerDay: 20,
        maxScansPerMonth: 200,
        features: [
          '20 scans QR par jour',
          '200 scans par mois',
          '5% de réduction chez les partenaires',
          'Accès à toutes les catégories',
          'Cashback jusqu\'à 500 XOF',
          'Support client prioritaire',
          'Historique des transactions',
          'Notifications push avancées'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté', 'Électronique', 'Santé & Bien-être'],
        maxCashbackAmount: 500,
        isPopular: false,
        isActive: true,
        status: 'active',
        metadata: {
          planType: 'basic',
          recommendedFor: 'utilisateurs occasionnels'
        }
      },

      // Plan Premium (Populaire)
      {
        name: 'Premium',
        description: 'Plan recommandé pour les utilisateurs réguliers. Maximum d\'avantages et d\'économies.',
        price: 5000,
        currency: 'XOF',
        durationDays: 30,
        discountPercentage: 10,
        maxScansPerDay: 50,
        maxScansPerMonth: 500,
        features: [
          '50 scans QR par jour',
          '500 scans par mois',
          '10% de réduction chez les partenaires',
          'Accès à toutes les catégories',
          'Cashback jusqu\'à 2000 XOF',
          'Support client prioritaire 24/7',
          'Historique détaillé des transactions',
          'Statistiques personnalisées',
          'Notifications push intelligentes',
          'Accès aux offres exclusives',
          'Programme de fidélité avancé'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté', 'Électronique', 'Santé & Bien-être', 'Transport', 'Divertissement'],
        maxCashbackAmount: 2000,
        isPopular: true,
        isActive: true,
        status: 'active',
        metadata: {
          planType: 'premium',
          recommendedFor: 'utilisateurs réguliers',
          bestValue: true
        }
      },

      // Plan Gold
      {
        name: 'Gold',
        description: 'Plan premium pour les utilisateurs intensifs. Maximum d\'avantages et de privilèges.',
        price: 10000,
        currency: 'XOF',
        durationDays: 30,
        discountPercentage: 15,
        maxScansPerDay: 100,
        maxScansPerMonth: 1000,
        features: [
          '100 scans QR par jour',
          '1000 scans par mois',
          '15% de réduction chez les partenaires',
          'Accès à toutes les catégories',
          'Cashback jusqu\'à 5000 XOF',
          'Support client VIP 24/7',
          'Historique complet des transactions',
          'Analytics avancées',
          'Notifications push personnalisées',
          'Accès aux offres VIP exclusives',
          'Programme de fidélité premium',
          'Invitations à des événements spéciaux',
          'Conseiller personnel YoYo'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté', 'Électronique', 'Santé & Bien-être', 'Transport', 'Divertissement', 'Voyage & Tourisme', 'Services Financiers'],
        maxCashbackAmount: 5000,
        isPopular: false,
        isActive: true,
        status: 'active',
        metadata: {
          planType: 'gold',
          recommendedFor: 'utilisateurs intensifs',
          vip: true
        }
      },

      // Plan Annuel Premium (Économie)
      {
        name: 'Premium Annuel',
        description: 'Plan Premium avec engagement annuel. Économisez 2 mois gratuits !',
        price: 50000,
        currency: 'XOF',
        durationDays: 365,
        discountPercentage: 10,
        maxScansPerDay: 50,
        maxScansPerMonth: 500,
        features: [
          '50 scans QR par jour',
          '500 scans par mois',
          '10% de réduction chez les partenaires',
          'Accès à toutes les catégories',
          'Cashback jusqu\'à 2000 XOF',
          'Support client prioritaire 24/7',
          'Historique détaillé des transactions',
          'Statistiques personnalisées',
          'Notifications push intelligentes',
          'Accès aux offres exclusives',
          'Programme de fidélité avancé',
          '2 mois gratuits (économie de 10 000 XOF)',
          'Renouvellement automatique'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté', 'Électronique', 'Santé & Bien-être', 'Transport', 'Divertissement'],
        maxCashbackAmount: 2000,
        isPopular: true,
        isActive: true,
        status: 'active',
        metadata: {
          planType: 'premium_annual',
          recommendedFor: 'utilisateurs réguliers',
          savings: 10000,
          autoRenew: true
        }
      },

      // Plan Entreprise
      {
        name: 'Entreprise',
        description: 'Plan spécialement conçu pour les entreprises et organisations. Gestion multi-utilisateurs.',
        price: 25000,
        currency: 'XOF',
        durationDays: 30,
        discountPercentage: 12,
        maxScansPerDay: 200,
        maxScansPerMonth: 2000,
        features: [
          '200 scans QR par jour',
          '2000 scans par mois',
          '12% de réduction chez les partenaires',
          'Accès à toutes les catégories',
          'Cashback jusqu\'à 10000 XOF',
          'Support client dédié',
          'Gestion multi-utilisateurs',
          'Rapports d\'utilisation détaillés',
          'API d\'intégration',
          'Formation et support technique',
          'Offres négociées spéciales',
          'Compte manager dédié'
        ],
        partnerCategories: ['Alimentation', 'Mode & Beauté', 'Électronique', 'Santé & Bien-être', 'Transport', 'Divertissement', 'Services Financiers', 'Technologie & Informatique'],
        maxCashbackAmount: 10000,
        isPopular: false,
        isActive: true,
        status: 'active',
        metadata: {
          planType: 'enterprise',
          recommendedFor: 'entreprises',
          multiUser: true,
          apiAccess: true
        }
      }
    ];
  }

  /**
   * Exécute le seeding des plans
   */
  async seed() {
    try {
      await this.init();
      
      const plans = this.getPlanData();
      let createdCount = 0;
      let skippedCount = 0;

      for (const planData of plans) {
        try {
          // Vérifier si le plan existe déjà
          const existingPlan = await this.Plan.findOne({ 
            name: planData.name 
          });

          if (existingPlan) {
            console.log(`⏭️  Plan "${planData.name}" existe déjà, ignoré`);
            skippedCount++;
            continue;
          }

          // Créer le plan
          const plan = new this.Plan({
            ...planData,
            _id: new mongoose.Types.ObjectId()
          });
          await plan.save();

          console.log(`✅ Plan "${planData.name}" créé avec succès`);
          createdCount++;

        } catch (error) {
          console.error(`❌ Erreur lors de la création du plan "${planData.name}":`, error);
        }
      }

      console.log(`\n📊 Résumé du seeding des plans:`);
      console.log(`   - Créés: ${createdCount}`);
      console.log(`   - Ignorés: ${skippedCount}`);
      console.log(`   - Total: ${plans.length}`);

      // Logger l'opération
      LoggerService.log({
        type: LogLevel.Info,
        content: `Seeder des plans exécuté: ${createdCount} créés, ${skippedCount} ignorés`,
        location: this.seederLabel,
        method: 'seed'
      });

      await this.close();

    } catch (error) {
      console.error('❌ Erreur lors du seeding des plans:', error);
      
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.seederLabel,
        method: 'seed'
      });
      
      await this.close();
      throw error;
    }
  }

  /**
   * Nettoie les données seedées
   */
  async clean() {
    try {
      await this.init();
      
      const plans = this.getPlanData();
      let deletedCount = 0;

      for (const planData of plans) {
        try {
          const existingPlan = await this.Plan.findOne({ 
            name: planData.name 
          });

          if (existingPlan) {
            await this.Plan.findByIdAndDelete(existingPlan._id);
            console.log(`🗑️  Plan "${planData.name}" supprimé`);
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Erreur lors de la suppression du plan "${planData.name}":`, error);
        }
      }

      console.log(`✅ ${deletedCount} plan(s) supprimé(s)`);

      LoggerService.log({
        type: LogLevel.Info,
        content: `Nettoyage des plans: ${deletedCount} supprimés`,
        location: this.seederLabel,
        method: 'clean'
      });

      await this.close();

    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des plans:', error);
      await this.close();
      throw error;
    }
  }
}

module.exports = { PlanSeeder };