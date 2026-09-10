/**
 * Backfill des drapeaux de confirmation de contact (isEmailConfirmed / isPhoneConfirmed).
 *
 * Contexte : avant le correctif, la vérification OTP d'activation activait le compte
 * (status: 'active') sans jamais positionner isEmailConfirmed / isPhoneConfirmed. Les comptes
 * activés avant ce correctif affichent donc « non confirmé » dans l'admin alors que leur contact
 * a bien été vérifié à l'inscription.
 *
 * Ce script rattrape l'existant : pour tout client ACTIF (donc ayant franchi l'activation),
 * il marque comme confirmé le(s) canal(aux) effectivement renseigné(s) — email et/ou téléphone —
 * lorsque le drapeau correspondant est encore à false.
 *
 * Prudence : on se limite au status 'active'. Les comptes 'pending' (jamais activés) ne sont
 * pas touchés. On ne confirme un canal que s'il porte une valeur non vide.
 *
 * Usage :
 *   node scripts/backfill-confirmations.js            # DRY-RUN : compte seulement, n'écrit rien
 *   node scripts/backfill-confirmations.js --apply    # applique réellement les mises à jour
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

  // Un email/contact « renseigné » = champ présent, chaîne non vide.
  const nonEmpty = field => ({ [field]: { $exists: true, $nin: [null, ''] } });

  const emailFilter = { status: 'active', isEmailConfirmed: { $ne: true }, ...nonEmpty('email') };
  const phoneFilter = { status: 'active', isPhoneConfirmed: { $ne: true }, ...nonEmpty('contact') };

  const emailCount = await clients.countDocuments(emailFilter);
  const phoneCount = await clients.countDocuments(phoneFilter);

  console.log(`   • ${emailCount} compte(s) actif(s) avec email à confirmer`);
  console.log(`   • ${phoneCount} compte(s) actif(s) avec téléphone à confirmer`);

  if (!apply) {
    console.log('ℹ️  Dry-run terminé. Relancez avec --apply pour écrire les modifications.');
    await mongoose.disconnect();
    return;
  }

  const emailRes = await clients.updateMany(emailFilter, { $set: { isEmailConfirmed: true } });
  const phoneRes = await clients.updateMany(phoneFilter, { $set: { isPhoneConfirmed: true } });

  console.log(`✅ Email confirmé : ${emailRes.modifiedCount} compte(s) mis à jour`);
  console.log(`✅ Téléphone confirmé : ${phoneRes.modifiedCount} compte(s) mis à jour`);

  await mongoose.disconnect();
  console.log('🏁 Terminé.');
}

main().catch(async err => {
  console.error('❌ Échec du backfill :', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
