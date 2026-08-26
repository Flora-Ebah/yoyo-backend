const mongoose = require('mongoose');
const { LoggerService, LogLevel } = require('coddyger');

/**
 * Seeder de la taxonomie des métiers de commerçants.
 *
 * Cette liste n'est pas un jeu de démonstration : c'est le référentiel que voient les commerçants
 * à la création d'une boutique (app Partenaire) et qui alimente la barre de filtres de l'app
 * Client. `partner.categories` référence ces documents.
 *
 * Contraintes qui expliquent la forme du fichier :
 *  - il n'existe **aucune clé stable** dans le modèle (pas de `slug`) : le seul rapprochement
 *    possible se fait sur `name`. Renommer une entrée créerait donc un doublon et laisserait
 *    l'ancienne en place, avec ses boutiques rattachées. D'où la table `RENAMES`, appliquée
 *    **avant** l'insertion : renommer conserve le `_id`, donc les rattachements ;
 *  - supprimer une catégorie ne détache pas les boutiques (aucune cascade). Le nettoyage des
 *    entrées obsolètes est donc une opération distincte (`prune`), qui refuse de toucher à une
 *    catégorie encore utilisée.
 *
 * `icon` attend un nom du jeu **Ionicons** — c'est celui des deux applications mobiles. Les
 * valeurs de l'ancienne liste (`smartphone`, `credit-card`, `shopping-bag`, `film`…) venaient de
 * jeux différents (Feather / Material) et n'auraient rien affiché.
 */

/**
 * Source de vérité unique du référentiel, partagée avec les tests (`category-taxonomy.test.ts`).
 *
 * `renames` liste les anciens noms à faire converger vers la nomenclature actuelle, appliqué
 * **avant** l'insertion. Un renommage préserve l'identifiant, donc les boutiques déjà rattachées :
 * c'est toujours préférable à « supprimer puis recréer », qui décatégoriserait les commerçants.
 * Seuls les rapprochements qui ne prêtent pas à interprétation y figurent ; tout le reste est
 * traité comme obsolète et laissé à l'arbitrage humain via `prune`.
 */
const taxonomy = require('../src/config/category-taxonomy.json');

/** Liste de référence, dans l'ordre d'affichage voulu. */
const FINAL_CATEGORIES = taxonomy.categories;
const RENAMES = taxonomy.renames;

class CategorySeeder {
  constructor() {
    this.seederLabel = 'CategorySeeder';
    this.Category = null;
    this.Partner = null;
  }

  /**
   * Initialise la connexion à la base de données et les modèles
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
      const categorySchema = new mongoose.Schema(
        {
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
          color: { type: String },
          position: { type: Number, default: 0 }
        },
        { timestamps: true }
      );

      this.Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

      // Schéma minimal, uniquement pour compter les boutiques rattachées à une catégorie
      // avant d'envisager sa suppression.
      const partnerSchema = new mongoose.Schema(
        {
          _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
          name: { type: String },
          categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }]
        },
        { timestamps: true, strict: false }
      );

      this.Partner = mongoose.models.Partner || mongoose.model('Partner', partnerSchema);
    } catch (error) {
      console.error("❌ Erreur lors de l'initialisation:", error);
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
    return FINAL_CATEGORIES;
  }

  /**
   * Applique les renommages de l'ancienne nomenclature vers la nouvelle.
   *
   * Refuse de renommer lorsque le nom cible existe déjà : la source devient alors un doublon,
   * signalé dans l'audit plutôt que fusionné en silence (fusionner supposerait de réaffecter les
   * boutiques, ce qui n'est pas au seeder d'en décider).
   */
  async applyRenames() {
    let renamedCount = 0;
    const conflicts = [];

    for (const [from, to] of Object.entries(RENAMES)) {
      const source = await this.Category.findOne({ name: from });
      if (!source) {
        continue;
      }

      const target = await this.Category.findOne({ name: to });
      if (target && String(target._id) !== String(source._id)) {
        conflicts.push({ from, to });
        console.warn(`⚠️  "${from}" non renommée : "${to}" existe déjà (doublon à arbitrer)`);
        continue;
      }

      await this.Category.updateOne({ _id: source._id }, { $set: { name: to } });
      console.log(`♻️  "${from}" renommée en "${to}" (identifiant conservé)`);
      renamedCount++;
    }

    return { renamedCount, conflicts };
  }

  /**
   * Liste les catégories présentes en base qui ne font pas partie de la liste de référence,
   * avec le nombre de boutiques encore rattachées à chacune.
   */
  async audit() {
    const expected = FINAL_CATEGORIES.map(category => category.name);
    const obsolete = await this.Category.find({ name: { $nin: expected } }).lean();

    const report = [];
    for (const category of obsolete) {
      const partnerCount = await this.Partner.countDocuments({ categories: category._id });
      report.push({
        _id: category._id,
        name: category.name,
        status: category.status,
        partnerCount
      });
    }

    return report.sort((a, b) => b.partnerCount - a.partnerCount);
  }

  /**
   * Affiche le rapport d'audit
   */
  printAudit(report) {
    if (report.length === 0) {
      console.log('\n✅ Aucune catégorie hors référentiel.');
      return;
    }

    console.log(`\n⚠️  ${report.length} catégorie(s) hors référentiel :`);
    for (const entry of report) {
      const attached =
        entry.partnerCount === 0
          ? 'aucune boutique'
          : `${entry.partnerCount} boutique(s) rattachée(s) — à réaffecter avant suppression`;
      console.log(`   - "${entry.name}" [${entry.status}] : ${attached}`);
    }

    const removable = report.filter(entry => entry.partnerCount === 0).length;
    console.log(
      `\n   ${removable} supprimable(s) sans impact. Lancer \`node seed.js --categories --prune\` pour les retirer.`
    );
  }

  /**
   * Exécute le seeding des catégories.
   *
   * Idempotent : une entrée existante est mise à jour (description, icône, couleur, rang), pas
   * dupliquée. Relancer le seeder après avoir modifié la liste corrige la base au lieu de
   * l'empiler.
   */
  async seed() {
    try {
      await this.init();

      const { renamedCount, conflicts } = await this.applyRenames();

      const categories = this.getCategoryData();
      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const categoryData of categories) {
        try {
          const existingCategory = await this.Category.findOne({ name: categoryData.name });

          if (existingCategory) {
            const needsUpdate =
              existingCategory.description !== categoryData.description ||
              existingCategory.icon !== categoryData.icon ||
              existingCategory.color !== categoryData.color ||
              existingCategory.position !== categoryData.position ||
              existingCategory.status !== 'active';

            if (!needsUpdate) {
              unchangedCount++;
              continue;
            }

            await this.Category.updateOne(
              { _id: existingCategory._id },
              {
                $set: {
                  description: categoryData.description,
                  icon: categoryData.icon,
                  color: categoryData.color,
                  position: categoryData.position,
                  status: 'active'
                }
              }
            );

            console.log(`🔄 Catégorie "${categoryData.name}" mise à jour`);
            updatedCount++;
            continue;
          }

          const category = new this.Category({
            ...categoryData,
            status: 'active',
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
      console.log(`   - Renommées: ${renamedCount}`);
      console.log(`   - Créées: ${createdCount}`);
      console.log(`   - Mises à jour: ${updatedCount}`);
      console.log(`   - Inchangées: ${unchangedCount}`);
      console.log(`   - Total référentiel: ${categories.length}`);

      if (conflicts.length > 0) {
        console.log(`   - Renommages empêchés par un doublon: ${conflicts.length}`);
      }

      const report = await this.audit();
      this.printAudit(report);

      // Logger l'opération
      LoggerService.log({
        type: LogLevel.Info,
        content: `Seeder des catégories exécuté: ${createdCount} créées, ${updatedCount} mises à jour, ${renamedCount} renommées, ${report.length} hors référentiel`,
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
   * Retire les catégories hors référentiel **qui ne sont rattachées à aucune boutique**.
   *
   * Suppression logique par défaut (`status: 'removed'`), comme le fait la route
   * `DELETE /category/remove/:id` : réversible. `--hard` supprime définitivement.
   * Les catégories encore utilisées ne sont jamais touchées : les décatégoriser en masse est une
   * décision produit, pas une opération de maintenance.
   */
  async prune(options = {}) {
    const hard = options.hard === true;

    try {
      await this.init();

      const report = await this.audit();
      const removable = report.filter(entry => entry.partnerCount === 0);
      const retained = report.filter(entry => entry.partnerCount > 0);

      if (report.length === 0) {
        console.log('✅ Aucune catégorie hors référentiel à retirer.');
        await this.close();
        return;
      }

      for (const entry of removable) {
        if (hard) {
          await this.Category.deleteOne({ _id: entry._id });
          console.log(`🗑️  "${entry.name}" supprimée définitivement`);
        } else {
          await this.Category.updateOne({ _id: entry._id }, { $set: { status: 'removed' } });
          console.log(`🗄️  "${entry.name}" archivée (status: removed)`);
        }
      }

      if (retained.length > 0) {
        console.log(`\n⚠️  ${retained.length} catégorie(s) conservée(s), encore utilisée(s) :`);
        for (const entry of retained) {
          console.log(`   - "${entry.name}" : ${entry.partnerCount} boutique(s)`);
        }
        console.log(
          '\n   Réaffecter ces boutiques depuis l\'espace d\'administration avant de relancer le nettoyage.'
        );
      }

      console.log(`\n✅ ${removable.length} catégorie(s) retirée(s), ${retained.length} conservée(s).`);

      LoggerService.log({
        type: LogLevel.Info,
        content: `Nettoyage des catégories: ${removable.length} retirées (${hard ? 'définitif' : 'logique'}), ${retained.length} conservées car utilisées`,
        location: this.seederLabel,
        method: 'prune'
      });

      await this.close();
    } catch (error) {
      console.error('❌ Erreur lors du nettoyage des catégories:', error);
      await this.close();
      throw error;
    }
  }

  /**
   * Affiche l'état de la taxonomie sans rien modifier
   */
  async report() {
    try {
      await this.init();

      const expected = FINAL_CATEGORIES.map(category => category.name);
      const present = await this.Category.find({ name: { $in: expected } })
        .sort({ position: 1 })
        .lean();

      console.log(`\n📋 Référentiel (${present.length}/${expected.length} présentes) :`);
      for (const category of present) {
        const partnerCount = await this.Partner.countDocuments({ categories: category._id });
        console.log(
          `   ${String(category.position).padStart(2)}. ${category.name} — ${category.icon} ${category.color} — ${partnerCount} boutique(s)`
        );
      }

      const missing = expected.filter(name => !present.some(category => category.name === name));
      if (missing.length > 0) {
        console.log(`\n⚠️  Absentes de la base : ${missing.join(', ')}`);
      }

      this.printAudit(await this.audit());

      await this.close();
    } catch (error) {
      console.error("❌ Erreur lors de l'inventaire des catégories:", error);
      await this.close();
      throw error;
    }
  }

  /**
   * Retire les catégories du référentiel (utilisé par `--clean`).
   *
   * Suppression logique, et uniquement pour celles qu'aucune boutique n'utilise.
   */
  async clean() {
    try {
      await this.init();

      const categories = this.getCategoryData();
      let removedCount = 0;
      let retainedCount = 0;

      for (const categoryData of categories) {
        try {
          const existingCategory = await this.Category.findOne({ name: categoryData.name });

          if (!existingCategory) {
            continue;
          }

          const partnerCount = await this.Partner.countDocuments({ categories: existingCategory._id });

          if (partnerCount > 0) {
            console.warn(
              `⚠️  "${categoryData.name}" conservée : ${partnerCount} boutique(s) y sont rattachées`
            );
            retainedCount++;
            continue;
          }

          await this.Category.updateOne({ _id: existingCategory._id }, { $set: { status: 'removed' } });
          console.log(`🗄️  Catégorie "${categoryData.name}" archivée`);
          removedCount++;
        } catch (error) {
          console.error(`❌ Erreur lors du nettoyage de la catégorie "${categoryData.name}":`, error);
        }
      }

      console.log(`✅ ${removedCount} catégorie(s) archivée(s), ${retainedCount} conservée(s)`);

      LoggerService.log({
        type: LogLevel.Info,
        content: `Nettoyage des catégories: ${removedCount} archivées, ${retainedCount} conservées`,
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

module.exports = { CategorySeeder, FINAL_CATEGORIES, RENAMES };
