import { CronJob } from 'cron';
import { LoggerService, LogLevel } from 'coddyger';
import { BoutiqueSponsorSet } from '../modules/boutique-sponsor/boutique-sponsor.model';
import { PartnerSet } from '../modules/partner/partner.model';

/**
 * [YO Boost] Job de cron d'expiration des mises en avant.
 *
 * S'exécute toutes les heures : passe en `expired` les `BoutiqueSponsor` actives dont `endDate`
 * est dépassée, puis remet `isSponsored:false` sur les boutiques qui n'ont plus AUCUNE mise en
 * avant active. But : une boutique expirée ne reste pas en tête du feed Découvrir.
 */
const sponsorExpirationJob = new CronJob('0 * * * *', async () => {
  try {
    console.log('[CRON] Expiration des mises en avant boutiques...');

    const sponsors = new BoutiqueSponsorSet();
    const partners = new PartnerSet();
    const now = new Date();

    // 1. Mises en avant actives dont la fin est dépassée → expired.
    const expired: any = await sponsors.selectHug({ status: 'active', endDate: { $lte: now } });
    const rows: any[] = Array.isArray(expired) ? expired : [];

    if (rows.length === 0) {
      console.log('[CRON] Aucune mise en avant à expirer');
      return;
    }

    console.log(`[CRON] ${rows.length} mise(s) en avant à expirer`);

    // Boutiques impactées (dédoublonnées) pour réaligner isSponsored ensuite.
    const impactedBoutiqueIds = new Set<string>();
    for (const s of rows) {
      try {
        await sponsors.update({ _id: s._id }, { status: 'expired' });
        if (s.boutiqueId) impactedBoutiqueIds.add(String(s.boutiqueId));
      } catch (error) {
        console.error(`[CRON] Erreur lors de l'expiration de la mise en avant ${s._id}:`, error);
      }
    }

    // 2. Réaligner isSponsored : false si la boutique n'a plus de mise en avant active non expirée.
    for (const boutiqueId of impactedBoutiqueIds) {
      try {
        const stillActive: any = await sponsors.selectOne({
          boutiqueId,
          status: 'active',
          endDate: { $gt: now }
        });
        if (!stillActive) {
          await partners.update({ _id: boutiqueId }, { isSponsored: false });
        }
      } catch (error) {
        console.error(`[CRON] Erreur lors du réalignement isSponsored de la boutique ${boutiqueId}:`, error);
      }
    }

    LoggerService.log({
      type: LogLevel.Info,
      content: `Expiration des mises en avant: ${rows.length} expirée(s), ${impactedBoutiqueIds.size} boutique(s) réalignée(s)`,
      location: 'SponsorExpirationCron',
      method: 'sponsorExpirationJob'
    });

    console.log('[CRON] Expiration des mises en avant terminée');
  } catch (error) {
    console.error('[CRON] Erreur lors de l\'expiration des mises en avant:', error);
    LoggerService.log({
      type: LogLevel.Error,
      content: error,
      location: 'SponsorExpirationCron',
      method: 'sponsorExpirationJob'
    });
  }
});

export const startSponsorExpirationCron = () => {
  sponsorExpirationJob.start();
  console.log('[CRON] Job d\'expiration des mises en avant programmé');
};

export const stopSponsorExpirationCron = () => {
  sponsorExpirationJob.stop();
  console.log('[CRON] Job d\'expiration des mises en avant arrêté');
};
