/**
 * Déduplication des demandes de réduction en cours, puis création des index de `payments`.
 *
 * Contexte : `PaymentService.create` lisait la demande `pending` existante, la supprimait, puis en
 * écrivait une nouvelle. Deux scans rapprochés pouvaient donc créer deux demandes en cours pour le
 * même couple (client, partenaire). Le correctif remplace cette séquence par un `findOneAndUpdate`
 * atomique, adossé à un index UNIQUE PARTIEL `uniq_pending_from_to`.
 *
 * Cet index refusera de se construire tant que des doublons subsistent en base — d'où ce script, à
 * exécuter AVANT de déployer le correctif. Les doublons ne sont jamais supprimés : on conserve la
 * demande la plus récente et les autres passent en `status: 'cancelled'`, ce qui préserve
 * l'historique (l'ancien code, lui, les effaçait avec un `deleteOne`).
 *
 * Usage :
 *   node scripts/dedupe-pending-payments.js            # DRY-RUN : compte seulement
 *   node scripts/dedupe-pending-payments.js --apply    # applique, puis synchronise les index
 */

require('../load-env');

const mongoose = require('mongoose');

const CANCEL_REASON = 'Demande en double annulée automatiquement (déduplication technique)';

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'yoyo';

  await mongoose.connect(mongoUri, { dbName });
  console.log(`📡 Connecté à ${dbName} — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`);

  const payments = mongoose.connection.collection('payments');

  // Groupes (from, to) comptant plus d'une demande « pending ».
  const duplicates = await payments
    .aggregate([
      { $match: { status: 'pending' } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: { from: '$from', to: '$to' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

  const totalPending = await payments.countDocuments({ status: 'pending' });
  // La première de chaque groupe est la plus récente : on la garde.
  const toCancel = duplicates.flatMap(group => group.ids.slice(1));

  console.log(`   • ${totalPending} demande(s) « pending » au total`);
  console.log(`   • ${duplicates.length} couple(s) (client, partenaire) en doublon`);
  console.log(`   • ${toCancel.length} demande(s) à annuler (la plus récente de chaque couple est conservée)`);

  if (!apply) {
    if (duplicates.length > 0) {
      console.log('\n   Aperçu des 10 premiers couples concernés :');
      duplicates.slice(0, 10).forEach(group => {
        console.log(`     - client ${group._id.from} / partenaire ${group._id.to} : ${group.count} demandes`);
      });
    }
    console.log('\nℹ️  Dry-run terminé. Relancez avec --apply pour écrire les modifications.');
    await mongoose.disconnect();
    return;
  }

  if (toCancel.length > 0) {
    const res = await payments.updateMany(
      { _id: { $in: toCancel } },
      { $set: { status: 'cancelled', deniedAt: new Date(), deniedReason: CANCEL_REASON } }
    );
    console.log(`✅ ${res.modifiedCount} demande(s) en double annulée(s)`);
  } else {
    console.log('ℹ️  Aucun doublon à traiter.');
  }

  // Création des index déclarés dans `payment.model.ts`. Mongoose les construit au démarrage, mais
  // `main.ts` n'attend pas la connexion : on les pose explicitement ici pour pouvoir vérifier le
  // résultat avant le déploiement.
  console.log('\n🔧 Création des index de la collection payments…');

  await payments.createIndex(
    { from: 1, to: 1 },
    { unique: true, partialFilterExpression: { status: 'pending' }, name: 'uniq_pending_from_to' }
  );
  await payments.createIndex({ to: 1, status: 1, createdAt: -1 });
  await payments.createIndex({ from: 1, createdAt: -1 });
  await payments.createIndex({ status: 1, createdAt: -1 });

  const indexes = await payments.indexes();
  console.log(`✅ ${indexes.length} index en place :`);
  indexes.forEach(index => console.log(`     - ${index.name}${index.unique ? ' (unique)' : ''}`));

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('❌ Échec du script :', error.message);
  if (error.code === 11000) {
    console.error(
      "   L'index unique a été refusé : des doublons subsistent. Relancez le script — il annule les\n" +
        '   doublons avant de créer les index, mais une écriture concurrente a pu en introduire un.'
    );
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
