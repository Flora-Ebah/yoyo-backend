/**
 * Script principal pour exécuter les seeders
 * Usage: node seed.js [options]
 * 
 * Options:
 *   --all, -a          Exécuter tous les seeders (défaut)
 *   --categories, -c   Exécuter seulement le seeder des catégories
 *   --plans, -p        Exécuter seulement le seeder des plans
 *   --clean, -clean    Nettoyer toutes les données seedées
 *   --help, -h         Afficher l'aide
 */

// Charger les variables d'environnement
require('./load-env');

const { SeederRunner } = require('./seeders');

async function main() {
  const args = process.argv.slice(2);
  const seederRunner = new SeederRunner();

  // Afficher l'aide
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🌱 YoYo Seeders

Usage: node seed.js [options]

Options:
  --all, -a          Exécuter tous les seeders (défaut)
  --categories, -c   Exécuter seulement le seeder des catégories
  --plans, -p        Exécuter seulement le seeder des plans
  --clean, -clean    Nettoyer toutes les données seedées
  --help, -h         Afficher cette aide

Options propres aux catégories (à combiner avec --categories):
  --report           Inventaire, sans aucune modification
  --prune            Archiver les catégories hors référentiel sans boutique rattachée
  --hard             Avec --prune: supprimer définitivement au lieu d'archiver

Exemples:
  node seed.js                            # Exécuter tous les seeders
  node seed.js --categories               # Aligner la base sur le référentiel
  node seed.js --categories --report      # Voir l'état sans rien changer
  node seed.js --categories --prune       # Retirer les catégories obsolètes inutilisées
  node seed.js --plans                    # Seeder des plans seulement
  node seed.js --clean                    # Nettoyer les données
    `);
    return;
  }

  try {
    console.log('🚀 Démarrage des seeders YoYo...\n');

    // Nettoyage
    if (args.includes('--clean') || args.includes('-clean')) {
      console.log('🧹 Mode nettoyage activé\n');
      await seederRunner.cleanAll();
      return;
    }

    // Exécution des seeders
    if (args.includes('--categories') || args.includes('-c')) {
      // `--report` inspecte sans rien modifier ; `--prune` retire les catégories hors
      // référentiel qu'aucune boutique n'utilise (archivage, ou suppression avec `--hard`).
      if (args.includes('--report')) {
        await seederRunner.reportCategories();
      } else if (args.includes('--prune')) {
        await seederRunner.pruneCategories({ hard: args.includes('--hard') });
      } else {
        await seederRunner.runCategories();
      }
    } else if (args.includes('--plans') || args.includes('-p')) {
      await seederRunner.runPlans();
    } else if (args.includes('--admin')) {
      await seederRunner.runAdmin();
    } else {
      // Par défaut, exécuter tous les seeders
      await seederRunner.runAll();
    }

    console.log('\n🎉 Script terminé avec succès!');

  } catch (error) {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  }
}

// Exécuter le script
main();
