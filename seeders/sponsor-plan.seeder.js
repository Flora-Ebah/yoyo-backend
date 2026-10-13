const mongoose = require('mongoose');
const { LoggerService, LogLevel } = require('coddyger');

/**
 * Seeder des formules de mise en avant (module sponsor-plan).
 *
 * Objectif : garantir la présence de la formule unique « YO Boost (1 semaine) »
 * (prix 9900, durée 7 jours, active) afin que `GET /sponsor-plans/active` la renvoie
 * à l'app Pro. Idempotent : filtre par `name`, ne duplique jamais une formule déjà présente.
 */
class SponsorPlanSeeder {
  constructor() {
    this.seederLabel = 'SponsorPlanSeeder';
    this.SponsorPlan = null;
  }

  /**
   * Initialise la connexion à la base de données et le modèle.
   * Le schéma reproduit celui de `src/modules/sponsor-plan/sponsor-plan.model.ts`.
   */
  async init() {
    try {
      const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'yoyo';
      await mongoose.connect(mongoUri, { dbName });
      console.log('📡 Connexion à la base de données établie');

      const sponsorPlanSchema = new mongoose.Schema({
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String },
        description: { type: String },
        price: { type: Number, default: 0 },
        durationDays: { type: Number, default: 30 },
        position: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        status: { type: String, enum: ['active', 'inactive', 'removed'], default: 'active' }
      }, { timestamps: true, minimize: false });

      // Réutilise le modèle déjà enregistré si présent (cas d'un re-seed dans le même process).
      this.SponsorPlan = mongoose.models.SponsorPlan || mongoose.model('SponsorPlan', sponsorPlanSchema);
    } catch (error) {
      console.error('❌ Erreur lors de l\'initialisation:', error);
      throw error;
    }
  }

  async close() {
    try {
      await mongoose.connection.close();
      console.log('📡 Connexion à la base de données fermée');
    } catch (error) {
      console.error('❌ Erreur lors de la fermeture:', error);
    }
  }

  /**
   * Formules de mise en avant de référence.
   */
  getSponsorPlanData() {
    return [
      {
        name: 'YO Boost (1 semaine)',
        description: 'Mise en avant de votre boutique pendant 7 jours : elle remonte en tête du feed Découvrir.',
        price: 9900,
        durationDays: 7,
        position: 0,
        isActive: true,
        status: 'active'
      }
    ];
  }

  /**
   * Exécute le seeding des formules de mise en avant (idempotent par `name`).
   */
  async seed() {
    try {
      await this.init();

      const plans = this.getSponsorPlanData();
      let createdCount = 0;
      let skippedCount = 0;

      for (const planData of plans) {
        try {
          const existing = await this.SponsorPlan.findOne({ name: planData.name });

          if (existing) {
            console.log(`⏭️  Formule « ${planData.name} » existe déjà, ignorée`);
            skippedCount++;
            continue;
          }

          const plan = new this.SponsorPlan({
            ...planData,
            _id: new mongoose.Types.ObjectId()
          });
          await plan.save();

          console.log(`✅ Formule « ${planData.name} » créée avec succès`);
          createdCount++;
        } catch (error) {
          console.error(`❌ Erreur lors de la création de la formule « ${planData.name} »:`, error);
        }
      }

      console.log(`\n📊 Résumé du seeding des formules de mise en avant:`);
      console.log(`   - Créées: ${createdCount}`);
      console.log(`   - Ignorées: ${skippedCount}`);
      console.log(`   - Total: ${plans.length}`);

      LoggerService.log({
        type: LogLevel.Info,
        content: `Seeder des formules de mise en avant exécuté: ${createdCount} créées, ${skippedCount} ignorées`,
        location: this.seederLabel,
        method: 'seed'
      });

      await this.close();
    } catch (error) {
      console.error('❌ Erreur lors du seeding des formules de mise en avant:', error);

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
   * Nettoie les formules seedées.
   */
  async clean() {
    try {
      await this.init();

      const plans = this.getSponsorPlanData();
      let deletedCount = 0;

      for (const planData of plans) {
        try {
          const existing = await this.SponsorPlan.findOne({ name: planData.name });
          if (existing) {
            await this.SponsorPlan.findByIdAndDelete(existing._id);
            console.log(`🗑️  Formule « ${planData.name} » supprimée`);
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Erreur lors de la suppression de la formule « ${planData.name} »:`, error);
        }
      }

      console.log(`✅ ${deletedCount} formule(s) supprimée(s)`);
      await this.close();
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des formules de mise en avant:', error);
      await this.close();
      throw error;
    }
  }
}

module.exports = { SponsorPlanSeeder };
