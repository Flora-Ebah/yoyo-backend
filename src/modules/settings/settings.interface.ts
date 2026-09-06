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
  status?: string;
}
