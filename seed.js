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

Exemples:
  node seed.js                    # Exécuter tous les seeders
  node seed.js --categories       # Seeder des catégories seulement
  node seed.js --plans            # Seeder des plans seulement
  node seed.js --clean            # Nettoyer les données
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
      await seederRunner.runCategories();
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
