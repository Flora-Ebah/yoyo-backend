const mongoose = require('mongoose');
const coddyger = require('coddyger').default || require('coddyger');

/**
 * Seeder de DONNÉES DE DÉMONSTRATION.
 *
 * Objectif : peupler le tableau de bord admin avec un jeu réaliste et cohérent :
 *   - ~15 clients (utilisateurs finaux, noms ivoiriens),
 *   - ~18 partenaires (boutiques) répartis sur des villes de Côte d'Ivoire pour que
 *     la carte « Répartition par ville » affiche des points,
 *   - ~20 transactions (facturation) rattachées aux clients et à un plan existant,
 *   - ~12 certifications (modération / KYC) rattachées aux clients.
 *
 * IDEMPOTENT : toutes les insertions sont gardées par une clé stable (email de client,
 * slug de partenaire, paymentId de transaction, slug de certification). Relancer le
 * seeder ne crée pas de doublons. Aucune donnée réelle n'est jamais supprimée.
 *
 * Les modèles sont redéfinis ici (comme dans admin.seeder.js / category.seeder.js) avec
 * les mêmes noms de collection, champs et enums que les modèles TypeScript de l'app, afin
 * que les documents seedés soient lus correctement par l'application en fonctionnement.
 *
 * Mot de passe des clients de démo : Demo@1234 (hashé comme dans le contrôleur).
 */

// Villes de Côte d'Ivoire à répartir sur les partenaires (certaines répétées pour
// que quelques villes aient 2-3 boutiques sur la carte).
const VILLES = [
  'cocody', 'yopougon', 'abobo', 'plateau', 'marcory', 'treichville',
  'adjame', 'koumassi', 'port-bouet', 'attecoube', 'abidjan', 'bouake',
  'yamoussoukro', 'san-pedro', 'korhogo', 'daloa', 'man', 'gagnoa',
  // répétitions volontaires -> villes avec plusieurs boutiques
  'cocody', 'yopougon', 'plateau', 'abidjan'
];

// Coordonnées approximatives (lat, lng) par ville, pour que la carte place un point.
const VILLE_COORDS = {
  cocody: [5.3599, -3.9957],
  yopougon: [5.3456, -4.0808],
  abobo: [5.4321, -4.0159],
  plateau: [5.3247, -4.0206],
  marcory: [5.3018, -3.9869],
  treichville: [5.2933, -4.0083],
  adjame: [5.3646, -4.0270],
  koumassi: [5.2889, -3.9481],
  'port-bouet': [5.2558, -3.9264],
  attecoube: [5.3400, -4.0430],
  abidjan: [5.3599, -4.0083],
  bouake: [7.6906, -5.0304],
  yamoussoukro: [6.8276, -5.2893],
  'san-pedro': [4.7485, -6.6363],
  korhogo: [9.4580, -5.6296],
  daloa: [6.8770, -6.4502],
  man: [7.4125, -7.5538],
  gagnoa: [6.1319, -5.9506]
};

// Prénoms / noms ivoiriens réalistes pour composer les clients.
const FIRSTNAMES = [
  'Kouadio', 'Aya', 'Yao', 'Adjoua', 'Konan', 'Affoue', 'Kouassi', 'Amenan',
  'Koffi', 'Akissi', 'N\'Guessan', 'Mariam', 'Ibrahim', 'Fatou', 'Seydou',
  'Awa', 'Bakary', 'Rokia'
];
const LASTNAMES = [
  'Kouame', 'Traore', 'Bamba', 'Coulibaly', 'Kone', 'Ouattara', 'Diomande',
  'Gnahore', 'Yeboua', 'Assemian', 'Toure', 'Diallo', 'Cisse', 'Fofana', 'Sanogo'
];

const DEMO_PASSWORD = 'Demo@1234';
const CLIENT_STATUSES = ['active', 'active', 'active', 'inactive', 'suspended', 'pending'];
const PARTNER_STATUSES = ['active', 'active', 'active', 'active', 'inactive', 'suspended'];
const PAYMENT_STATUSES = ['success', 'success', 'success', 'pending', 'failed', 'refunded'];
const PAYMENT_METHODS = ['orange-money', 'mtn-money', 'moov-money', 'wave'];
const DOC_TYPES = ['carte-identite', 'passeport', 'permis-conduire', 'carte-consulaire'];
const VERIF_STATUSES = ['en-attente', 'en-cours', 'verifie', 'rejete'];

class DemoSeeder {
  constructor() {
    this.seederLabel = 'DemoSeeder';
    this.Client = null;
    this.Partner = null;
    this.Transaction = null;
    this.Certification = null;
    this.Plan = null;
    this.Category = null;
  }

  /**
   * Initialise la connexion à la base de données et les modèles.
   * On réutilise les modèles déjà enregistrés par mongoose si présents.
   */
  async init() {
    try {
      const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
      const dbName = process.env.DB_NAME || 'yoyo';
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri, { dbName });
        console.log('📡 Connexion à la base de données établie');
      }

      const clientSchema = new mongoose.Schema(
        {
          _id: mongoose.Schema.Types.ObjectId,
          email: { type: String, required: true },
          firstname: { type: String, required: true },
          lastname: { type: String, required: true },
          password: { type: String, required: true },
          contact: { type: String },
          address: { type: String },
          country: { type: String },
          gender: { type: String },
          isEmailConfirmed: { type: Boolean, default: false },
          isPhoneConfirmed: { type: Boolean, default: false },
          isDocumentVerified: { type: Boolean, default: false },
          isCertified: { type: Boolean, default: false },
          documentVerificationStatus: { type: String, default: null },
          status: {
            type: String,
            enum: ['active', 'inactive', 'suspended', 'removed', 'locked', 'pending'],
            default: 'pending'
          },
          isPartner: { type: Boolean, default: false }
        },
        { timestamps: true, strict: false }
      );

      const partnerSchema = new mongoose.Schema(
        {
          _id: mongoose.Schema.Types.ObjectId,
          slug: { type: String, required: true },
          name: { type: String, required: true },
          description: { type: String },
          ville: { type: String },
          address: { type: String },
          latitude: { type: Number },
          longitude: { type: Number },
          phone: { type: String },
          email: { type: String },
          categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
          maxDiscount: { type: Number },
          minOrder: { type: Number },
          isSponsored: { type: Boolean, default: false },
          status: {
            type: String,
            enum: ['active', 'inactive', 'suspended', 'removed'],
            default: 'active'
          },
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' }
        },
        { timestamps: true, strict: false }
      );

      const transactionSchema = new mongoose.Schema(
        {
          _id: mongoose.Schema.Types.ObjectId,
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
          amount: { type: Number, required: true },
          currency: { type: String, required: true },
          status: {
            type: String,
            enum: ['active', 'inactive', 'suspended', 'removed', 'archived'],
            default: 'active'
          },
          paymentMethod: { type: String, required: true },
          paymentStatus: {
            type: String,
            enum: ['pending', 'success', 'failed', 'refunded', 'expired', 'cancelled', 'initiated'],
            default: 'pending'
          },
          paymentDate: { type: Date, required: true },
          paymentId: { type: String, required: true },
          paymentUrl: { type: String, required: true },
          txnId: { type: String }
        },
        { timestamps: true, strict: false }
      );

      const certificationSchema = new mongoose.Schema(
        {
          _id: mongoose.Schema.Types.ObjectId,
          slug: String,
          documentType: { type: String, required: true },
          documentFile: { type: [String], required: true },
          status: { type: String, enum: ['active', 'archived', 'removed'], default: 'active' },
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
          reviewNotes: String,
          rejectionReason: { type: String, required: false },
          verificationStatus: { type: String, required: false, default: 'en-attente' }
        },
        { timestamps: true, strict: false }
      );

      // Schémas minimaux en lecture seule pour retrouver les refs existantes.
      const planSchema = new mongoose.Schema(
        { _id: mongoose.Schema.Types.ObjectId, name: String, price: Number, currency: String, isActive: Boolean, status: String },
        { timestamps: true, strict: false }
      );
      const categorySchema = new mongoose.Schema(
        { _id: mongoose.Schema.Types.ObjectId, name: String, status: String },
        { timestamps: true, strict: false }
      );

      this.Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
      this.Partner = mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
      this.Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
      this.Certification = mongoose.models.Certification || mongoose.model('Certification', certificationSchema);
      this.Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
      this.Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation:", error);
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
   * Récupère un plan existant, ou en crée un de démonstration si aucun n'existe.
   */
  async ensurePlan() {
    let plan = await this.Plan.findOne({ status: { $ne: 'removed' } }).sort({ price: 1 });
    if (plan) {
      return plan;
    }

    plan = await this.Plan.create({
      _id: coddyger.string.generateObjectId(),
      name: 'Demo Plan',
      description: 'Plan de démonstration',
      price: 5000,
      currency: 'XOF',
      durationDays: 30,
      discountPercentage: 10,
      features: ['Réductions chez les partenaires'],
      partnerCategories: ['all'],
      isActive: true,
      status: 'active'
    });
    console.log('✅ Plan de démonstration créé (aucun plan existant)');
    return plan;
  }

  /**
   * Seed idempotent de tout le jeu de démonstration.
   */
  async seed() {
    await this.init();

    const hashedPassword = await coddyger.string.encryptPassword(DEMO_PASSWORD);

    // ---------------------------------------------------------------------
    // 1. Clients (~15)
    // ---------------------------------------------------------------------
    const CLIENT_COUNT = 15;
    const clients = [];
    let clientsCreated = 0;

    for (let i = 1; i <= CLIENT_COUNT; i++) {
      const email = `demo.client${i}@yoyo.ci`;
      let client = await this.Client.findOne({ email });

      if (!client) {
        const firstname = FIRSTNAMES[(i - 1) % FIRSTNAMES.length];
        const lastname = LASTNAMES[(i - 1) % LASTNAMES.length];
        const status = CLIENT_STATUSES[(i - 1) % CLIENT_STATUSES.length];
        const isVerified = i % 3 === 0;

        client = await this.Client.create({
          _id: coddyger.string.generateObjectId(),
          email,
          firstname,
          lastname,
          password: hashedPassword,
          contact: `+2250700${String(100000 + i).slice(-6)}`,
          address: 'Abidjan, Côte d\'Ivoire',
          country: 'Côte d\'Ivoire',
          gender: i % 2 === 0 ? 'female' : 'male',
          isEmailConfirmed: true,
          isPhoneConfirmed: i % 2 === 0,
          isDocumentVerified: isVerified,
          isCertified: isVerified,
          documentVerificationStatus: isVerified ? 'verifie' : i % 4 === 0 ? 'en-attente' : null,
          status
        });
        clientsCreated++;
      }
      clients.push(client);
    }
    console.log(`✅ Clients: ${clientsCreated} créé(s), ${CLIENT_COUNT - clientsCreated} déjà présent(s)`);

    // ---------------------------------------------------------------------
    // 2. Partenaires (~18) — répartis sur les villes de Côte d'Ivoire
    // ---------------------------------------------------------------------
    const categoryIds = (await this.Category.find({ status: { $ne: 'removed' } }).limit(20).lean()).map((c) => c._id);
    const villeCount = {};
    let partnersCreated = 0;
    const PARTNER_COUNT = VILLES.length; // 22 -> couvre le « ~18 » avec quelques doublons de ville

    for (let i = 0; i < PARTNER_COUNT; i++) {
      const ville = VILLES[i];
      villeCount[ville] = (villeCount[ville] || 0) + 1;
      const nth = villeCount[ville];
      const slug = `demo-partner-${ville}-${nth}`;

      let partner = await this.Partner.findOne({ slug });
      if (!partner) {
        const coords = VILLE_COORDS[ville] || [5.3599, -4.0083];
        const status = PARTNER_STATUSES[i % PARTNER_STATUSES.length];
        // Nom lisible : « Boutique Cocody 1 »
        const villeLabel = ville.charAt(0).toUpperCase() + ville.slice(1);
        const cats = categoryIds.length > 0 ? [categoryIds[i % categoryIds.length]] : [];

        partner = await this.Partner.create({
          _id: coddyger.string.generateObjectId(),
          slug,
          name: `Boutique ${villeLabel} ${nth}`,
          description: `Commerce partenaire de démonstration à ${villeLabel}.`,
          ville,
          address: `Quartier ${villeLabel}, Côte d'Ivoire`,
          latitude: coords[0],
          longitude: coords[1],
          phone: `+2252700${String(200000 + i).slice(-6)}`,
          email: `${slug}@yoyo.ci`,
          categories: cats,
          maxDiscount: 5 + ((i * 5) % 26), // 5..30
          minOrder: 1000 * (1 + (i % 5)),
          isSponsored: i % 5 === 0,
          status,
          user: clients[i % clients.length]._id
        });
        partnersCreated++;
      }
    }
    console.log(`✅ Partenaires: ${partnersCreated} créé(s) sur ${PARTNER_COUNT}`);
    console.log(`   Répartition par ville: ${JSON.stringify(villeCount)}`);

    // ---------------------------------------------------------------------
    // 3. Transactions (~20) — rattachées aux clients et à un plan existant
    // ---------------------------------------------------------------------
    const plan = await this.ensurePlan();
    const TXN_COUNT = 20;
    let txnCreated = 0;
    const now = Date.now();

    for (let i = 1; i <= TXN_COUNT; i++) {
      const paymentId = `DEMO-TXN-${String(i).padStart(4, '0')}`;
      let txn = await this.Transaction.findOne({ paymentId });
      if (!txn) {
        const paymentStatus = PAYMENT_STATUSES[(i - 1) % PAYMENT_STATUSES.length];
        // Étale les dates sur ~90 jours pour donner de la matière aux graphiques.
        const paymentDate = new Date(now - (i * 4 + (i % 7)) * 24 * 60 * 60 * 1000);

        txn = await this.Transaction.create({
          _id: coddyger.string.generateObjectId(),
          user: clients[(i - 1) % clients.length]._id,
          plan: plan._id,
          amount: [3000, 5000, 10000, 15000][(i - 1) % 4],
          currency: 'XOF',
          status: 'active',
          paymentMethod: PAYMENT_METHODS[(i - 1) % PAYMENT_METHODS.length],
          paymentStatus,
          paymentDate,
          paymentId,
          paymentUrl: `https://demo.yoyo.ci/pay/${paymentId}`,
          txnId: `DEMOTXNID${String(i).padStart(4, '0')}`
        });
        txnCreated++;
      }
    }
    console.log(`✅ Transactions: ${txnCreated} créée(s) sur ${TXN_COUNT}`);

    // ---------------------------------------------------------------------
    // 4. Certifications (~12) — modération / KYC
    // ---------------------------------------------------------------------
    const CERT_COUNT = 12;
    let certCreated = 0;

    for (let i = 1; i <= CERT_COUNT; i++) {
      const slug = `demo-cert-${String(i).padStart(3, '0')}`;
      let cert = await this.Certification.findOne({ slug });
      if (!cert) {
        const documentType = DOC_TYPES[(i - 1) % DOC_TYPES.length];
        const verificationStatus = VERIF_STATUSES[(i - 1) % VERIF_STATUSES.length];
        const rejectionReason = verificationStatus === 'rejete' ? 'document-illisible' : undefined;

        cert = await this.Certification.create({
          _id: coddyger.string.generateObjectId(),
          slug,
          documentType,
          documentFile: [`${slug}-recto.jpg`, `${slug}-verso.jpg`],
          status: 'active',
          user: clients[(i - 1) % clients.length]._id,
          verificationStatus,
          rejectionReason,
          reviewNotes: verificationStatus === 'verifie' ? 'Document conforme (démo)' : undefined
        });
        certCreated++;
      }
    }
    console.log(`✅ Certifications: ${certCreated} créée(s) sur ${CERT_COUNT}`);

    console.log('\n🎉 Jeu de données de démonstration prêt.');
    return { clientsCreated, partnersCreated, txnCreated, certCreated, villeCount };
  }

  /**
   * Supprime uniquement les données de démonstration (jamais les données réelles).
   * Cible les clés stables des documents seedés.
   */
  async clean() {
    await this.init();

    await this.Certification.deleteMany({ slug: { $regex: '^demo-cert-' } });
    await this.Transaction.deleteMany({ paymentId: { $regex: '^DEMO-TXN-' } });
    await this.Partner.deleteMany({ slug: { $regex: '^demo-partner-' } });
    await this.Client.deleteMany({ email: { $regex: '^demo\\.client[0-9]+@yoyo\\.ci$' } });
    await this.Plan.deleteMany({ name: 'Demo Plan' });

    console.log('🧹 Données de démonstration supprimées');
  }
}

module.exports = { DemoSeeder };
