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
  /**
   * Programme de parrainage (Excel Parrainage n°2, décisions 1 et 5) :
   *  - `enabled` : coupe l'attribution de nouvelles récompenses (le comptage des filleuls continue) ;
   *  - `planId` : plan offert pendant le mois gratuit (vide = plan actif à 2 000 F, sinon le moins cher) ;
   *  - `referralsPerReward` : filleuls validés pour débloquer LA récompense (une seule par parrain) ;
   *  - `rewardCap` : nombre total de récompenses du programme (« 3 000 premiers »).
   */
  referralProgram?: { enabled: boolean; planId?: string | null; referralsPerReward: number; rewardCap: number };
  /**
   * Récompenses de parrainage déjà attribuées. Compteur distinct de `referralProgram` : il n'est
   * modifié que par `$inc` atomique (réservation d'une place), jamais par la mise à jour du BO.
   */
  referralRewardsGranted?: number;
  /**
   * Délais cibles du support (décision Support n°8, Excel CMS n°5), en heures :
   *  - `paymentFirstResponseHours` : 1re réponse aux sujets d'argent, en heures OUVRÉES ;
   *  - `firstResponseHours` : 1re réponse aux autres sujets ;
   *  - `resolutionHours` : résolution, tous sujets ;
   *  - `businessStartHour` / `businessEndHour` / `businessDays` : heures ouvrées (heure d'Abidjan,
   *    UTC ; jours 0 = dimanche … 6 = samedi).
   */
  supportSla?: {
    paymentFirstResponseHours: number;
    firstResponseHours: number;
    resolutionHours: number;
    businessStartHour: number;
    businessEndHour: number;
    businessDays: number[];
  };
  /**
   * Seuils des alertes fraude (Excel CMS n°3) :
   *  - `accountsPerDevice` : comptes inscrits depuis un même appareil ;
   *  - `scansPerDay` : réductions validées par un client sur 24 h ;
   *  - `boutiqueSpikeFactor` / `boutiqueSpikeMin` : volume du jour d'une boutique comparé à sa
   *    moyenne quotidienne sur 30 jours (alerte au-delà du facteur, et d'au moins `boutiqueSpikeMin`).
   */
  fraudRules?: {
    accountsPerDevice: number;
    scansPerDay: number;
    boutiqueSpikeFactor: number;
    boutiqueSpikeMin: number;
  };
  /**
   * Interrupteurs des moyens de paiement, pilotés depuis le BO. Un fournisseur coupé reste affiché
   * dans les apps avec la mention « Bientôt disponible » et toute demande de paiement est refusée
   * avant d'appeler son API. Un fournisseur activé sans identifiants serveur reste indisponible
   * (cf. `TransactionService.providersStatus`).
   */
  paymentProviders?: { orangeMoney: boolean; wave: boolean };
  status?: string;
}
