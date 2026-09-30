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
  status?: string;
}
