/**
 * Rattrapage du parrainage : applique le mois offert aux parrains qui avaient déjà atteint
 * l'objectif avant le correctif.
 *
 * Contexte : l'ancien code (`creditReferrerForPaidReferral`) incrémentait seulement le compteur
 * `freeMonthsGranted` tous les 3 filleuls validés ; aucun abonnement n'était créé ni prolongé.
 * Les parrains concernés n'ont donc jamais reçu leur mois.
 *
 * Ce script applique les règles actuelles (`modules/referral`, `modules/subscription/free-month`) :
 *  - une seule récompense par parrain, dans la limite des places du programme (« 3 000 ») ;
 *  - abonnement actif → fin reculée de 30 jours (renouvellement programmé décalé d'autant) ;
 *  - sans abonnement → abonnement de 30 jours sur le plan offert ;
 *  - octroi tracé dans `freemonthgrants` (source `referral`, ref = id du parrain).
 * Les parrains en revue (`referralReview`) ou bloqués pour fraude sont ignorés. Aucune push n'est
 * envoyée.
 *
 * ⚠️ Logique dupliquée de `FreeMonthService.grant` (les services TypeScript démarrent le serveur à
 * l'import) : la garder alignée si cette règle change.
 *
 * Usage :
 *   node scripts/backfill-referral-grants.js            # DRY-RUN : liste seulement, n'écrit rien
 *   node scripts/backfill-referral-grants.js --apply    # applique réellement les récompenses
 */

require('../load-env');

const mongoose = require('mongoose');

const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const shift = (date, days) => (date ? new Date(new Date(date).getTime() + days * DAY_MS) : date);

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.DB_URI || 'mongodb://localhost:27017', { dbName: process.env.DB_NAME || 'yoyo' });
  console.log(`📡 Connecté — mode : ${apply ? 'APPLICATION' : 'DRY-RUN (aucune écriture)'}`);

  const db = mongoose.connection;
  const clients = db.collection('clients');
  const configs = db.collection('platformconfigs');
  const subscriptions = db.collection('subscriptions');
  const plans = db.collection('plans');
  const grants = db.collection('freemonthgrants');

  const config = (await configs.findOne({ status: { $ne: 'removed' } })) || {};
  const program = config.referralProgram || {};
  const goal = Number.isInteger(program.referralsPerReward) && program.referralsPerReward > 0 ? program.referralsPerReward : 3;
  const cap = Number.isInteger(program.rewardCap) && program.rewardCap > 0 ? program.rewardCap : 3000;
  let granted = Number(config.referralRewardsGranted) || 0;

  if (!config._id) {
    console.log('⛔ Configuration plateforme absente : ouvrez une fois Paramètres dans le CMS (ou lancez l’API), puis relancez.');
    return mongoose.disconnect();
  }
  if (program.enabled === false) {
    console.log('⛔ Programme désactivé dans le CMS : rien à faire.');
    return mongoose.disconnect();
  }

  const plan =
    (program.planId && (await plans.findOne({ _id: program.planId, isActive: true }))) ||
    (await plans.findOne({ isActive: true, price: 2000 })) ||
    (await plans.find({ isActive: true, price: { $gt: 0 } }).sort({ price: 1 }).limit(1).next());

  const eligible = await clients
    .find({
      referredCount: { $gte: goal },
      referralRewardId: { $exists: false },
      referralReview: { $ne: true },
      referralRewardBlocked: { $ne: true },
      status: { $nin: ['removed', 'archived', 'anonymized'] }
    })
    .sort({ updatedAt: 1 })
    .toArray();

  console.log(`   • ${eligible.length} parrain(s) éligible(s), ${Math.max(0, cap - granted)} place(s) restante(s), plan offert : ${plan ? plan.name : 'AUCUN'}`);

  let applied = 0;
  for (const referrer of eligible) {
    if (granted >= cap) {
      console.log('⚠️  Plafond atteint : les parrains suivants ne sont pas récompensés.');
      break;
    }
    const ref = String(referrer._id);
    if (await grants.findOne({ source: 'referral', ref })) continue;

    const now = new Date();
    const active = await subscriptions.find({ userId: referrer._id, status: 'active', endDate: { $gt: now } }).sort({ endDate: -1 }).limit(1).next();
    console.log(`   → ${referrer.email || ref} (${referrer.referredCount} filleuls) : ${active ? `prolongé jusqu'au ${shift(active.endDate, DAYS).toISOString().slice(0, 10)}` : 'abonnement de 30 jours créé'}`);
    if (!apply) {
      granted++;
      continue;
    }
    if (!active && !plan) {
      console.log('     ✗ aucun plan actif à offrir, ignoré');
      continue;
    }

    const grantId = new mongoose.Types.ObjectId();
    const grant = { _id: grantId, user: referrer._id, source: 'referral', ref, days: DAYS, status: 'applied', createdAt: now, updatedAt: now };
    if (active) {
      const set = { endDate: shift(active.endDate, DAYS) };
      if (active.pendingRenewal && active.pendingRenewal.startDate) {
        set['pendingRenewal.startDate'] = shift(active.pendingRenewal.startDate, DAYS);
        set['pendingRenewal.endDate'] = shift(active.pendingRenewal.endDate, DAYS);
      }
      await subscriptions.updateOne({ _id: active._id }, { $set: set });
      Object.assign(grant, { subscriptionId: active._id, mode: 'extended', planId: active.planId });
    } else {
      const subscriptionId = new mongoose.Types.ObjectId();
      await subscriptions.insertOne({
        _id: subscriptionId, userId: referrer._id, planId: plan._id, startDate: now, endDate: shift(now, DAYS),
        status: 'active', paymentStatus: 'paid', paymentMethod: 'free-month', autoRenew: false, price: 0,
        currency: plan.currency || 'XOF', metadata: { source: 'free-month', grantSource: 'referral', grantId: String(grantId) },
        createdAt: now, updatedAt: now
      });
      Object.assign(grant, { subscriptionId, mode: 'created', planId: plan._id });
    }
    await grants.insertOne(grant);
    await clients.updateOne({ _id: referrer._id }, { $set: { referralRewardId: grantId, freeMonthsGranted: 1 } });
    await configs.updateOne({ _id: config._id }, { $inc: { referralRewardsGranted: 1 } });
    granted++;
    applied++;
  }

  console.log(apply ? `✅ ${applied} récompense(s) appliquée(s).` : 'ℹ️  Dry-run terminé. Relancez avec --apply pour écrire.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌', error);
  await mongoose.disconnect();
  process.exit(1);
});
