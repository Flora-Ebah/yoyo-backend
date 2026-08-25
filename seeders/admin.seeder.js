const mongoose = require('mongoose');
const coddyger = require('coddyger').default || require('coddyger');

/**
 * Seeder pour le compte administrateur par défaut.
 * Crée un profil "Super Admin" et un admin lié, avec le même hash de mot de passe
 * que AdminController.save (coddyger.string.encryptPassword).
 *
 * Identifiants configurables via les variables d'environnement :
 *   ADMIN_SEED_EMAIL    (défaut: admin@yoyo.ci)
 *   ADMIN_SEED_PASSWORD (défaut: Admin@1234)
 */
class AdminSeeder {
  constructor() {
    this.seederLabel = 'AdminSeeder';
    this.Admin = null;
    this.Profile = null;
  }

  /**
   * Initialise la connexion à la base de données et les modèles
   */
  async init() {
    try {
      const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'yoyo';
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri, { dbName });
        console.log('📡 Connexion à la base de données établie');
      }

      const profileSchema = new mongoose.Schema({
        _id: mongoose.Schema.Types.ObjectId,
        slug: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String },
        ability: { type: [mongoose.Schema.Types.Mixed], default: [] },
        status: {
          type: String,
          enum: ['active', 'inactive', 'suspended', 'removed'],
          default: 'active'
        },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
      }, { timestamps: true });

      const adminSchema = new mongoose.Schema({
        _id: mongoose.Schema.Types.ObjectId,
        slug: String,
        email: String,
        password: String,
        matricule: String,
        phone: String,
        phoneOffice: String,
        lastname: String,
        firstname: String,
        address: String,
        office: String,
        photo: String,
        type: { type: String, enum: ['externe', 'interne'], default: 'interne' },
        status: { type: String, enum: ['active', 'archived', 'removed'], default: 'active' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
        lastLogin: Date
      }, { timestamps: true });

      this.Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
      this.Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
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
   * Crée (ou récupère) le profil Super Admin
   */
  async ensureProfile() {
    let profile = await this.Profile.findOne({ name: 'Super Admin', status: 'active' });
    if (profile) {
      console.log('ℹ️  Profil "Super Admin" déjà présent');
      return profile;
    }

    profile = await this.Profile.create({
      _id: coddyger.string.generateObjectId(),
      slug: coddyger.buildSlug('PRF', null),
      name: 'Super Admin',
      description: 'Profil administrateur avec tous les droits',
      ability: [{ action: 'manage', subject: 'all' }],
      status: 'active'
    });
    console.log('✅ Profil "Super Admin" créé');
    return profile;
  }

  /**
   * Seed du compte admin par défaut (idempotent)
   */
  async seed() {
    await this.init();

    const email = process.env.ADMIN_SEED_EMAIL || 'admin@yoyo.ci';
    const password = process.env.ADMIN_SEED_PASSWORD || 'Admin@1234';

    const existing = await this.Admin.findOne({ email, status: { $ne: 'removed' } });
    if (existing) {
      console.log(`ℹ️  Un admin avec l'email ${email} existe déjà — rien à faire`);
      return existing;
    }

    const profile = await this.ensureProfile();
    const theLast = await this.Admin.findOne().sort({ createdAt: -1 });

    const admin = await this.Admin.create({
      _id: coddyger.string.generateObjectId(),
      slug: coddyger.buildSlug('ADM', theLast ? theLast.slug : null),
      email,
      password: await coddyger.string.encryptPassword(password),
      firstname: 'Super',
      lastname: 'Admin',
      type: 'interne',
      status: 'active',
      profile: profile._id
    });

    console.log(`✅ Admin créé: ${email}`);
    if (!process.env.ADMIN_SEED_PASSWORD) {
      console.log('⚠️  Mot de passe par défaut utilisé (Admin@1234) — changez-le immédiatement en production');
    }
    return admin;
  }

  /**
   * Supprime le compte admin seedé et son profil
   */
  async clean() {
    await this.init();
    const email = process.env.ADMIN_SEED_EMAIL || 'admin@yoyo.ci';
    await this.Admin.deleteOne({ email });
    await this.Profile.deleteOne({ name: 'Super Admin' });
    console.log(`🧹 Admin ${email} et profil "Super Admin" supprimés`);
  }
}

module.exports = { AdminSeeder };
