const mongoose = require('mongoose');
const coddyger = require('coddyger').default || require('coddyger');

/**
 * Seeder des rôles (profils) métier.
 * Actuellement : le rôle "Commercial" — agent terrain qui enrôle des marchands
 * à distance (voir DEMANDE-ONBOARDING-MARCHAND.md).
 *
 * Idempotent : ne recrée pas un rôle déjà présent (par nom).
 */
class RolesSeeder {
  constructor() {
    this.seederLabel = 'RolesSeeder';
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
        description: { type: String },
        ability: { type: [mongoose.Schema.Types.Mixed], default: [] },
        status: { type: String, enum: ['active', 'inactive', 'suspended', 'removed'], default: 'active' },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
      },
      { timestamps: true }
    );

    this.Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
  }

  /** Définition des rôles seedés. */
  roles() {
    return [
      {
        name: 'Commercial',
        description: 'Agent terrain : enrôle et gère les marchands (partenaires) et leurs boutiques.',
        ability: [
          { name: 'Professionnels · voir', subject: 'pros', action: 'read' },
          { name: 'Professionnels · créer', subject: 'pros', action: 'create' },
          { name: 'Professionnels · modifier', subject: 'pros', action: 'update' }
        ]
      }
    ];
  }

  async seed() {
    await this.init();

    for (const role of this.roles()) {
      const existing = await this.Profile.findOne({ name: role.name, status: { $ne: 'removed' } });

      if (existing) {
        console.log(`ℹ️  Rôle "${role.name}" déjà présent — rien à faire`);
        continue;
      }

      await this.Profile.create({
        _id: coddyger.string.generateObjectId(),
        slug: coddyger.buildSlug('PRF', null),
        name: role.name,
        description: role.description,
        ability: role.ability,
        status: 'active'
      });

      console.log(`✅ Rôle "${role.name}" créé (${role.ability.length} permissions)`);
    }
  }

  async clean() {
    await this.init();

    for (const role of this.roles()) {
      await this.Profile.deleteOne({ name: role.name });
      console.log(`🧹 Rôle "${role.name}" supprimé`);
    }
  }
}

module.exports = { RolesSeeder };
