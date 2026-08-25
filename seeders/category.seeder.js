const mongoose = require('mongoose');
const { LoggerService, LogLevel } = require('coddyger');

class CategorySeeder {
  constructor() {
    this.seederLabel = 'CategorySeeder';
    this.Category = null;
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

      // Définition du schéma Category
      const categorySchema = new mongoose.Schema({
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String, required: true },
        description: { type: String },
        parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
        status: { 
          type: String, 
          enum: ['active', 'inactive', 'suspended', 'removed'], 
          default: 'active' 
        },
        icon: { type: String },
        color: { type: String }
      }, { timestamps: true });

      this.Category = mongoose.model('Category', categorySchema);
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
   * Données de base pour les catégories
   */
  getCategoryData() {
    return [
      // Catégories principales
      {
        name: 'Alimentation',
        description: 'Restaurants, épiceries, supermarchés et commerces alimentaires',
        icon: 'restaurant',
        color: '#FF6B6B',
        status: 'active'
      },
      {
        name: 'Mode & Beauté',
        description: 'Vêtements, chaussures, cosmétiques et accessoires de mode',
        icon: 'shopping-bag',
        color: '#4ECDC4',
        status: 'active'
      },
      {
        name: 'Électronique',
        description: 'Appareils électroniques, smartphones, ordinateurs et gadgets',
        icon: 'smartphone',
        color: '#45B7D1',
        status: 'active'
      },
      {
        name: 'Santé & Bien-être',
        description: 'Pharmacies, cliniques, salles de sport et services de santé',
        icon: 'heart',
        color: '#96CEB4',
        status: 'active'
      },
      {
        name: 'Transport',
        description: 'Taxi, bus, location de véhicules et services de transport',
        icon: 'car',
        color: '#FFEAA7',
        status: 'active'
      },
      {
        name: 'Divertissement',
        description: 'Cinémas, théâtres, parcs d\'attractions et loisirs',
        icon: 'film',
        color: '#DDA0DD',
        status: 'active'
      },
      {
        name: 'Éducation',
        description: 'Écoles, universités, formations et services éducatifs',
        icon: 'book',
        color: '#98D8C8',
        status: 'active'
      },
      {
        name: 'Services Financiers',
        description: 'Banques, assurances, microfinance et services financiers',
        icon: 'credit-card',
        color: '#F7DC6F',
        status: 'active'
      },
      {
        name: 'Immobilier',
        description: 'Agences immobilières, location et vente de biens',
        icon: 'home',
        color: '#BB8FCE',
        status: 'active'
      },
      {
        name: 'Automobile',
        description: 'Concessionnaires, garages, pièces détachées et services auto',
        icon: 'car-sport',
        color: '#85C1E9',
        status: 'active'
      },
      {
        name: 'Voyage & Tourisme',
        description: 'Agences de voyage, hôtels, réservations et services touristiques',
        icon: 'airplane',
        color: '#F8C471',
        status: 'active'
      },
      {
        name: 'Sport & Fitness',
        description: 'Équipements sportifs, salles de sport et activités physiques',
        icon: 'fitness',
        color: '#82E0AA',
        status: 'active'
      },
      {
        name: 'Art & Culture',
        description: 'Galerie d\'art, musées, expositions et événements culturels',
        icon: 'palette',
        color: '#F1948A',
        status: 'active'
      },
      {
        name: 'Jardinage & Bricolage',
        description: 'Outils, plantes, matériaux de construction et DIY',
        icon: 'hammer',
        color: '#7DCEA0',
        status: 'active'
      },
      {
        name: 'Animaux & Vétérinaires',
        description: 'Soins vétérinaires, animaleries et services pour animaux',
        icon: 'paw',
        color: '#D7BDE2',
        status: 'active'
      },
      {
        name: 'Technologie & Informatique',
        description: 'Services IT, développement, maintenance et support technique',
        icon: 'laptop',
        color: '#5DADE2',
        status: 'active'
      },
      {
        name: 'Événements & Cérémonies',
        description: 'Organisation d\'événements, mariages, anniversaires et fêtes',
        icon: 'gift',
        color: '#F9E79F',
        status: 'active'
      },
      {
        name: 'Loisirs & Hobbies',
        description: 'Jeux, puzzles, collections et activités de loisir',
        icon: 'game-controller',
        color: '#AED6F1',
        status: 'active'
      },
      {
        name: 'Services à Domicile',
        description: 'Ménage, réparation, livraison et services à domicile',
        icon: 'home-outline',
        color: '#A9DFBF',
        status: 'active'
      },
      {
        name: 'Autres',
        description: 'Autres catégories de commerces et services',
        icon: 'more-horizontal',
        color: '#BDC3C7',
        status: 'active'
      },

      // Catégories YOYO PRO
      {
        name: 'Restaurants & Maquis',
        description: 'Restaurants, maquis et lieux de restauration',
        icon: 'restaurant',
        color: '#FF6B6B',
        status: 'active'
      },
      {
        name: 'Cafés & Pâtisseries',
        description: 'Cafés, salons de thé et pâtisseries',
        icon: 'cafe',
        color: '#D9A066',
        status: 'active'
      },
      {
        name: 'Beauté & Coiffure',
        description: 'Salons de beauté, coiffure et esthétique',
        icon: 'cut',
        color: '#E17AA1',
        status: 'active'
      },
      {
        name: 'Mode & Boutiques',
        description: 'Vêtements, chaussures et boutiques de mode',
        icon: 'shirt',
        color: '#4ECDC4',
        status: 'active'
      },
      {
        name: 'Sport & Loisirs',
        description: 'Équipements sportifs, salles de sport et loisirs',
        icon: 'fitness',
        color: '#82E0AA',
        status: 'active'
      },
      {
        name: 'Auto & Services',
        description: 'Garages, concessionnaires et services automobiles',
        icon: 'car-sport',
        color: '#85C1E9',
        status: 'active'
      },
      {
        name: 'Hôtel/Hébergement',
        description: 'Hôtels, résidences meublées et hébergements',
        icon: 'bed',
        color: '#F5CBA7',
        status: 'active'
      }
    ];
  }

  /**
   * Exécute le seeding des catégories
   */
  async seed() {
    try {
      await this.init();
      
      const categories = this.getCategoryData();
      let createdCount = 0;
      let skippedCount = 0;

      for (const categoryData of categories) {
        try {
          // Vérifier si la catégorie existe déjà
          const existingCategory = await this.Category.findOne({ 
            name: categoryData.name 
          });

          if (existingCategory) {
            console.log(`⏭️  Catégorie "${categoryData.name}" existe déjà, ignorée`);
            skippedCount++;
            continue;
          }

          // Créer la catégorie
          const category = new this.Category({
            ...categoryData,
            _id: new mongoose.Types.ObjectId()
          });
          await category.save();

          console.log(`✅ Catégorie "${categoryData.name}" créée avec succès`);
          createdCount++;

        } catch (error) {
          console.error(`❌ Erreur lors de la création de la catégorie "${categoryData.name}":`, error);
        }
      }

      console.log(`\n📊 Résumé du seeding des catégories:`);
      console.log(`   - Créées: ${createdCount}`);
      console.log(`   - Ignorées: ${skippedCount}`);
      console.log(`   - Total: ${categories.length}`);

      // Logger l'opération
      LoggerService.log({
        type: LogLevel.Info,
        content: `Seeder des catégories exécuté: ${createdCount} créées, ${skippedCount} ignorées`,
        location: this.seederLabel,
        method: 'seed'
      });

      await this.close();

    } catch (error) {
      console.error('❌ Erreur lors du seeding des catégories:', error);
      
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
      
      const categories = this.getCategoryData();
      let deletedCount = 0;

      for (const categoryData of categories) {
        try {
          const existingCategory = await this.Category.findOne({ 
            name: categoryData.name 
          });

          if (existingCategory) {
            await this.Category.findByIdAndDelete(existingCategory._id);
            console.log(`🗑️  Catégorie "${categoryData.name}" supprimée`);
            deletedCount++;
          }
        } catch (error) {
          console.error(`❌ Erreur lors de la suppression de la catégorie "${categoryData.name}":`, error);
        }
      }

      console.log(`✅ ${deletedCount} catégorie(s) supprimée(s)`);

      LoggerService.log({
        type: LogLevel.Info,
        content: `Nettoyage des catégories: ${deletedCount} supprimées`,
        location: this.seederLabel,
        method: 'clean'
      });

      await this.close();

    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des catégories:', error);
      await this.close();
      throw error;
    }
  }
}

module.exports = { CategorySeeder };