/**
 * Interface du module Settings — paramètres globaux de la plateforme, éditables depuis le CMS.
 *
 * Document unique (singleton) : une seule ligne de configuration pour toute la plateforme.
 */
export interface ISettings {
  _id?: string;
  /**
   * Bornes de la **remise marchand** (`maxDiscount` d'un partenaire), en pourcentage.
   * `discountMin` : remise minimale qu'un marchand doit proposer (ex. 10).
   * `discountMax` : remise maximale autorisée (ex. 50).
   *
   * Auparavant codées en dur (`MIN_MERCHANT_DISCOUNT = 5`, défaut 15) ; désormais paramétrables
   * par l'administrateur. La validation métier côté serveur lit ces valeurs — les formulaires
   * (admin, commercial, app Partenaire) ne font que refléter ces bornes.
   */
  discountMin: number;
  discountMax: number;
  /**
   * Délai de grâce (en jours) entre la suppression d'un compte client (`removed`) et son
   * anonymisation automatique par le cron. Pendant ce délai, une reconnexion/recréation réactive
   * le compte et relance le délai (modèle « soft delete » type Facebook, conformité DCP/RGPD).
   * Défaut : 30 jours (standard de l'industrie, plus défendable en minimisation DCP/RGPD).
   */
  accountDeletionGraceDays: number;
  /**
   * Nombre maximum de boutiques qu'un même marchand peut posséder. `0` = illimité.
   * Vérifié côté serveur à la création d'une boutique (app marchand et CMS). Paramétrable par
   * l'administrateur pour ajuster la politique sans redéploiement.
   */
  maxBoutiquesPerMerchant: number;
  /**
   * Correspondance pourcentage de réduction → couleur d'affichage (#3). Éditable par l'admin,
   * lue par l'app client pour colorer les remises. Aucune couleur codée en dur côté app :
   * ex. [{ threshold: 10, color: '#4CAF50' }, { threshold: 15, color: '#FF9800' }, { threshold: 20, color: '#F44336' }].
   * L'app applique la couleur du plus grand `threshold` ≤ `maxDiscount` du marchand.
   */
  discountColors?: { threshold: number; color: string }[];
  status?: string;
}
