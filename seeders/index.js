/**
 * Point d'entrée pour tous les seeders
 */

const { CategorySeeder } = require('./category.seeder');
const { PlanSeeder } = require('./plan.seeder');
const { AdminSeeder } = require('./admin.seeder');
const { RolesSeeder } = require('./roles.seeder');
const { CommercialSeeder } = require('./commercial.seeder');
const { DemoSeeder } = require('./demo.seeder');

class SeederRunner {
  constructor() {
    this.categorySeeder = new CategorySeeder();
    this.planSeeder = new PlanSeeder();
    this.adminSeeder = new AdminSeeder();
    this.rolesSeeder = new RolesSeeder();
    this.commercialSeeder = new CommercialSeeder();
    this.demoSeeder = new DemoSeeder();
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

      // 4. Seed des rôles métier (Commercial, ...)
      console.log('🛡️  Seeding des rôles...');
      await this.rolesSeeder.seed();
      console.log('✅ Rôles seedés avec succès\n');

      // Les données de démonstration ne sont PAS incluses ici : elles se lancent
      // explicitement via `node seed.js --demo` (évite de créer des données de test
      // par mégarde sur un environnement réel).

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
   * Retire les catégories hors référentiel qui ne sont utilisées par aucune boutique
   */
  async pruneCategories(options = {}) {
    console.log('🧹 Nettoyage des catégories hors référentiel...');
    await this.categorySeeder.prune(options);
  }

  /**
   * Affiche l'état de la taxonomie sans rien modifier
   */
  async reportCategories() {
    console.log('📋 Inventaire des catégories...');
    await this.categorySeeder.report();
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
   * Exécute seulement le seeder des rôles métier
   */
  async runRoles() {
    console.log('🛡️  Seeding des rôles...');
    await this.rolesSeeder.seed();
    console.log('✅ Rôles seedés avec succès!');
  }

  /**
   * Exécute seulement le seeder du compte commercial de test
   */
  async runCommercial() {
    console.log('🧑‍💼 Seeding du compte commercial...');
    await this.commercialSeeder.seed();
    console.log('✅ Compte commercial seedé avec succès!');
  }

  /**
   * Exécute seulement le seeder des données de démonstration
   */
  async runDemo() {
    console.log('🎭 Seeding des données de démonstration...');
    await this.demoSeeder.seed();
    console.log('✅ Données de démonstration seedées avec succès!');
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
  AdminSeeder,
  RolesSeeder,
  CommercialSeeder,
  DemoSeeder
};
