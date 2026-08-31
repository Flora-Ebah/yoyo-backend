const mongoose = require('mongoose');
const coddyger = require('coddyger').default || require('coddyger');

/**
 * Seeder d'un compte administrateur "Commercial" de test, lié au rôle Commercial
 * (voir roles.seeder.js). Sert à tester le flux : login -> redirection vers la vue commerciale.
 *
 * Identifiants configurables :
 *   COMMERCIAL_SEED_EMAIL    (défaut: commercial@yoyo.ci)
 *   COMMERCIAL_SEED_PASSWORD (défaut: Commercial@1234)
 */
class CommercialSeeder {
  constructor() {
    this.seederLabel = 'CommercialSeeder';
    this.Admin = null;
    this.Profile = null;
  }

  async init() {
    const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.DB_NAME || 'yoyo';

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUri, { dbName });
      console.log('📡 Connexion à la base de données établie');
    }

    const profileSchema = new mongoose.Schema(
      {
        _id: mongoose.Schema.Types.ObjectId,
        slug: { type: String, required: true },
        name: { type: String, required: true },
        description: String,
        ability: { type: [mongoose.Schema.Types.Mixed], default: [] },
        status: { type: String, enum: ['active', 'inactive', 'suspended', 'removed'], default: 'active' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
      },
      { timestamps: true }
    );

    const adminSchema = new mongoose.Schema(
      {
        _id: mongoose.Schema.Types.ObjectId,
        slug: String,
        email: String,
        password: String,
        matricule: String,
        phone: String,
        lastname: String,
        firstname: String,
        type: { type: String, enum: ['externe', 'interne'], default: 'interne' },
        status: { type: String, enum: ['active', 'archived', 'removed'], default: 'active' },
        profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },
        lastLogin: Date
      },
      { timestamps: true }
    );

    this.Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
    this.Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
  }

  async ensureCommercialProfile() {
    let profile = await this.Profile.findOne({ name: 'Commercial', status: { $ne: 'removed' } });

    if (profile) return profile;

    profile = await this.Profile.create({
      _id: coddyger.string.generateObjectId(),
      slug: coddyger.buildSlug('PRF', null),
      name: 'Commercial',
      description: 'Agent terrain : enrôle et gère les marchands (partenaires) et leurs boutiques.',
      ability: [
        { name: 'Professionnels · voir', subject: 'pros', action: 'read' },
        { name: 'Professionnels · créer', subject: 'pros', action: 'create' },
        { name: 'Professionnels · modifier', subject: 'pros', action: 'update' }
      ],
      status: 'active'
    });
    console.log('✅ Rôle "Commercial" créé');

    return profile;
  }

  async seed() {
    await this.init();

    const email = process.env.COMMERCIAL_SEED_EMAIL || 'commercial@yoyo.ci';
    const password = process.env.COMMERCIAL_SEED_PASSWORD || 'Commercial@1234';

    const existing = await this.Admin.findOne({ email, status: { $ne: 'removed' } });

    if (existing) {
      console.log(`ℹ️  Un admin ${email} existe déjà — rien à faire`);

      return existing;
    }

    const profile = await this.ensureCommercialProfile();
    const theLast = await this.Admin.findOne().sort({ createdAt: -1 });

    const admin = await this.Admin.create({
      _id: coddyger.string.generateObjectId(),
      slug: coddyger.buildSlug('ADM', theLast ? theLast.slug : null),
      email,
      password: await coddyger.string.encryptPassword(password),
      firstname: 'Agent',
      lastname: 'Commercial',
      type: 'externe',
      status: 'active',
      profile: profile._id
    });

    console.log(`✅ Admin commercial créé: ${email}`);

    if (!process.env.COMMERCIAL_SEED_PASSWORD) {
      console.log('⚠️  Mot de passe par défaut (Commercial@1234) — à changer.');
    }

    return admin;
  }

  async clean() {
    await this.init();
    const email = process.env.COMMERCIAL_SEED_EMAIL || 'commercial@yoyo.ci';

    await this.Admin.deleteOne({ email });
    console.log(`🧹 Admin commercial ${email} supprimé`);
  }
}

module.exports = { CommercialSeeder };
