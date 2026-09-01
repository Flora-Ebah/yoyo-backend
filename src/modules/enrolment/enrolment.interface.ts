/**
 * Interface pour le module Enrolment
 *
 * Un enrôlement trace l'acte commercial : « tel commercial a créé tel marchand et telle boutique,
 * tel jour ». C'est la base de calcul des commissions, donc une donnée financière : les champs
 * `merchantName`, `shopName`, `ville`, `category` et `commercialName` sont un **instantané figé**
 * au moment de la création, et non des jointures. Renommer la boutique ou supprimer le compte
 * marchand plus tard ne doit pas réécrire l'historique d'une commission déjà due.
 *
 * Les références vivantes (`client`, `partner`, `commercial`) restent stockées pour pouvoir
 * re-consulter la donnée à jour lorsque c'est elle qu'on veut.
 */
export interface IEnrolment {
  _id?: string;

  client: any; // ObjectId ref Client — le compte marchand créé
  partner: any; // ObjectId ref Partner — la boutique créée
  commercial: any; // ObjectId ref Admin — déduit du jeton, jamais du corps de la requête

  // --- Instantané figé à l'enrôlement -------------------------------------------------
  merchantName: string;
  merchantEmail: string;
  merchantPhone: string;
  shopName: string;
  ville?: string;
  category?: string; // libellé de la catégorie, pas son identifiant
  commercialName: string;

  /**
   * Statut métier de l'enrôlement.
   *
   * Volontairement distinct de `status` : `MongoDbDao.select` injecte
   * `status: { $nin: ['removed', 'archived'] }` dès que `params.status` est vide, ce qui écraserait
   * un filtre métier porté par le même champ.
   */
  enrolmentStatus?: 'pending' | 'activated';

  // --- Jeton d'activation --------------------------------------------------------------
  /** Empreinte SHA-256 du jeton. Le jeton en clair n'existe que dans le lien envoyé au marchand. */
  activationTokenHash?: string;
  activationTokenExpiresAt?: Date;
  /** Horodatage de consommation : sert de verrou d'usage unique. */
  activationTokenUsedAt?: Date;

  /** Canaux par lesquels le lien est réellement parti (`['email']`, `['email', 'sms']`, `[]`). */
  activationChannels?: string[];
  activationSentAt?: Date;
  activationAttempts?: number;
  activatedAt?: Date;

  /** Cycle de vie technique (suppression logique) — convention du projet. */
  status?: string;
}

/**
 * Forme d'un enrôlement telle que le front admin la consomme
 * (vues `/commercial` et `/enrolments`).
 */
export interface IEnrolmentPublic {
  id: string;
  merchantName: string;
  merchantEmail: string;
  merchantPhone: string;
  shopName: string;
  ville: string;
  category: string;
  commercialId: string;
  commercialName: string;
  status: string;
  createdAt: any;
  activatedAt: any;
}

/** Ligne du récapitulatif par commercial (base de commission). */
export interface IEnrolmentSummary {
  commercialId: string;
  commercialName: string;
  total: number;
  activated: number;
  pending: number;
}
