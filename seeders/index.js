/**
 * Point d'entrée pour tous les seeders
 */

const { CategorySeeder } = require('./category.seeder');
const { PlanSeeder } = require('./plan.seeder');
const { AdminSeeder } = require('./admin.seeder');

class SeederRunner {
  constructor() {
    this.categorySeeder = new CategorySeeder();
    this.planSeeder = new PlanSeeder();
    this.adminSeeder = new AdminSeeder();
  }

  /**
   * Exécute tous les seeders
   */
  async runAll() {
    console.log('🌱 Démarrage des seeders...\n');

    try {
      // 1. Seed des catégories (doit être fait en premier car les plans peuvent en dépendre)
      console.log('📂 Seeding des catégories...');
      await this.categorySeeder.seed();
      console.log('✅ Catégories seedées avec succès\n');

      // 2. Seed des plans d'abonnement
      console.log('💳 Seeding des plans d\'abonnement...');
      await this.planSeeder.seed();
      console.log('✅ Plans d\'abonnement seedés avec succès\n');

      // 3. Seed du compte administrateur par défaut
      console.log('👤 Seeding du compte admin...');
      await this.adminSeeder.seed();
      console.log('✅ Compte admin seedé avec succès\n');

      console.log('🎉 Tous les seeders ont été exécutés avec succès!');
    } catch (error) {
      console.error('❌ Erreur lors de l\'exécution des seeders:', error);
      throw error;
    }
  }

  /**
   * Exécute seulement le seeder des catégories
   */
  async runCategories() {
    console.log('📂 Seeding des catégories...');
    await this.categorySeeder.seed();
    console.log('✅ Catégories seedées avec succès!');
  }

  /**
   * Exécute seulement le seeder des plans
   */
  async runPlans() {
    console.log('💳 Seeding des plans d\'abonnement...');
    await this.planSeeder.seed();
    console.log('✅ Plans d\'abonnement seedés avec succès!');
  }

  /**
   * Exécute seulement le seeder du compte admin
   */
  async runAdmin() {
    console.log('👤 Seeding du compte admin...');
    await this.adminSeeder.seed();
    console.log('✅ Compte admin seedé avec succès!');
  }

  /**
   * Nettoie toutes les données seedées
   */
  async cleanAll() {
    console.log('🧹 Nettoyage des données seedées...\n');

    try {
      await this.planSeeder.clean();
      console.log('✅ Plans nettoyés');

      await this.categorySeeder.clean();
      console.log('✅ Catégories nettoyées');

      console.log('🎉 Nettoyage terminé!');
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
      throw error;
    }
  }
}

module.exports = {
  SeederRunner,
  CategorySeeder,
  PlanSeeder,
  AdminSeeder
};
