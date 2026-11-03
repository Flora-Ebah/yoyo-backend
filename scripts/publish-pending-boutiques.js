/**
 * Mise en ligne des boutiques bloquées en attente de validation (Excel CMS n°14).
 *
 * Contexte : jusqu'ici, une boutique créée depuis l'appli Pro naissait `status: 'pending'` et
 * restait invisible des clients, sans réduction possible, tant que l'équipe YoYo ne l'avait pas
 * validée. La validation est désormais un contrôle a posteriori : la boutique naît `active` avec
 * `validation.status: 'pending'`, et seul un refus la masque.
 *
 * Ce script aligne l'existant : toute boutique `pending` dont la validation est encore `pending` et
 * qui n'a jamais été refusée passe en `active`. Elle reste dans la file « À valider » du CMS.
 *
 * Non touchées (seulement comptées) :
 *   - les boutiques refusées (`validation.status: 'rejected'`) : elles restent masquées ;
 *   - les boutiques renvoyées après refus (`validation.reason` encore présent) : elles restent
 *     masquées jusqu'à la décision de l'équipe, comme le veut la nouvelle règle ;
 *   - les boutiques `pending` sans validation (origine inconnue) : à examiner.
 *
 * À exécuter APRÈS le déploiement du correctif (sinon les nouvelles créations repartiraient en
 * `pending` entre-temps — sans gravité, il suffit de le relancer).
 *
 * Usage :
 *   node scripts/publish-pending-boutiques.js            # DRY-RUN : liste seulement, n'écrit rien
 *   node scripts/publish-pending-boutiques.js --apply    # applique réellement les mises à jour
 */

require('../load-env');

const mongoose = require('mongoose');

async function main() {
  const apply = process.argv.includes('--apply');
  const mongoUri = process.env.DB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || 'yoyo';

  await mongoose.connect(mongoUri, { dbName });
  console.log(`📡 Connecté à ${dbName} — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`);

  const partners = mongoose.connection.collection('partners');

  const filter = { status: 'pending', 'validation.status': 'pending', 'validation.reason': { $in: [null, ''] } };
  const toPublish = await partners.find(filter, { projection: { name: 1, ville: 1 } }).toArray();
  const rejected = await partners.countDocuments({ status: 'pending', 'validation.status': 'rejected' });
  const resubmitted = await partners.countDocuments({
    status: 'pending',
    'validation.status': 'pending',
    'validation.reason': { $nin: [null, ''] }
  });
  const orphans = await partners.countDocuments({ status: 'pending', 'validation.status': { $exists: false } });

  console.log(`   • ${toPublish.length} boutique(s) en attente à mettre en ligne`);
  for (const p of toPublish) console.log(`     - ${p._id} · ${p.name || '—'} · ${p.ville || '—'}`);
  console.log(`   • ${rejected} boutique(s) refusée(s) : laissées masquées`);
  console.log(`   • ${resubmitted} boutique(s) renvoyée(s) après refus : laissées masquées jusqu'à décision`);
  console.log(`   • ${orphans} boutique(s) en attente sans validation : non touchées, à examiner`);

  if (!apply) {
    console.log('ℹ️  Dry-run terminé. Relancez avec --apply pour écrire les modifications.');
    await mongoose.disconnect();
    return;
  }

  const res = await partners.updateMany(filter, { $set: { status: 'active' } });
  console.log(`✅ ${res.modifiedCount} boutique(s) mise(s) en ligne`);

  await mongoose.disconnect();
  console.log('🏁 Terminé.');
}

main().catch(async err => {
  console.error('❌ Échec :', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
