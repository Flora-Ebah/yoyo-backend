/**
 * Nettoyage des enrôlements orphelins.
 *
 * Contexte : avant le correctif, supprimer/anonymiser un compte marchand côté admin ne touchait
 * pas la collection `enrolment` — la boutique supprimée restait donc visible dans la vue du
 * commercial (alimentée par les enrôlements). Ce script rattrape l'existant : tout enrôlement dont
 * le compte client est `removed` / `anonymized` / `archived` est passé en `status: 'removed'`.
 *
 * Usage :
 *   node scripts/cleanup-orphan-enrolments.js            # DRY-RUN : compte seulement
 *   node scripts/cleanup-orphan-enrolments.js --apply    # applique les mises à jour
 */

require('../load-env');

const mongoose = require('mongoose');

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.DB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'yoyo';

  await mongoose.connect(mongoUri, { dbName });
  console.log(`📡 Connecté à ${dbName} — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`);

  const clients = mongoose.connection.collection('clients');
  const enrolments = mongoose.connection.collection('enrolments');

  // Comptes clients hors service.
  const deadStatuses = ['removed', 'anonymized', 'archived'];
  const deadClientIds = await clients
    .find({ status: { $in: deadStatuses } }, { projection: { _id: 1 } })
    .map(d => d._id)
    .toArray();

  console.log(`   • ${deadClientIds.length} compte(s) client supprimé/anonymisé/archivé`);

  if (deadClientIds.length === 0) {
    console.log('ℹ️  Rien à nettoyer.');
    await mongoose.disconnect();
    return;
  }

  const filter = { client: { $in: deadClientIds }, status: { $ne: 'removed' } };
  const count = await enrolments.countDocuments(filter);

  console.log(`   • ${count} enrôlement(s) encore actif(s) à retirer`);

  if (!apply) {
    console.log('ℹ️  Dry-run terminé. Relancez avec --apply pour écrire les modifications.');
    await mongoose.disconnect();
    return;
  }

  const res = await enrolments.updateMany(filter, { $set: { status: 'removed' } });
  console.log(`✅ ${res.modifiedCount} enrôlement(s) retiré(s).`);

  await mongoose.disconnect();
  console.log('🏁 Terminé.');
}

main().catch(async err => {
  console.error('❌ Échec du nettoyage :', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
