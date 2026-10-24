/**
 * Config plateforme étendue (#3 couleurs, #2 abo mise en avant, #1 push proximité).
 * Module DÉDIÉ (collection propre `platformconfigs`) : les modifications du module `settings`
 * existant n'étaient pas prises en compte par le déploiement dev (route + schéma Mongoose périmés).
 * Singleton.
 */
export interface IPlatformConfig {
  _id?: string;
  discountColors?: { threshold: number; color: string }[];
  sponsorPlan?: { price: number; durationDays: number };
  proximityPush?: { radiusMeters: number; minIntervalHours: number; target: 'all' | 'sponsored' };
  /**
   * Vidéo de présentation d'une boutique : durée (s) et poids (Mo) maximum. Contrôlés par le
   * serveur à l'envoi (`ffprobe`, `POST /upload`), lus par l'app Pro pour guider le marchand.
   */
  media?: { maxVideoSeconds: number; maxVideoSizeMb: number };
  /**
   * Garde-fous du flux « le client saisit lui-même le montant » (`PaymentService.redeem`), sans
   * validation manuelle du marchand. 0 = garde-fou désactivé.
   *  - `maxAmount` : plafond par achat (FCFA), commun à toutes les boutiques ;
   *  - `cooldownHours` : délai minimum entre deux réductions d'un même client dans une même boutique ;
   *  - `maxPerDay` : nombre maximum de réductions par client et par jour, toutes boutiques confondues.
   *  - `requireScanToken` : si `true`, `POST /payments/redeem` exige une session de scan fraîche
   *    (QR à jeton court échangé via `scan-verify`) ; le `to` legacy en clair n'est plus accepté.
   */
  redeemLimits?: { maxAmount: number; cooldownHours: number; maxPerDay: number; requireScanToken: boolean };
  status?: string;
}
