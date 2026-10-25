/**
 * Interface pour le module Client
 */
export interface IClient {
  _id?: string;
  email?: string;
  password?: string;
  firstname?: string;
  lastname?: string;
  contact?: string;
  address?: string;
  birthdate?: Date;
  country?: string;
  gender?: string;
  isEmailConfirmed?: boolean;
  isPhoneConfirmed?: boolean;
  isDocumentVerified?: boolean;
  documents?: any[];
  documentVerificationStatus?: string;
  avatar?: string;
  secretQuestion?: any;
  secretResponse?: string;
  isCertified?: boolean;
  securityPreferences?: ISecurityPreferences;
  notificationPreferences?: INotificationPreferences;
  status?: string;
  isPartner?: boolean;
  isManager?: boolean;
  /** Le marchand n'a pas encore défini son mot de passe (compte créé par un commercial). */
  mustChangePassword?: boolean;
  /** Admin (commercial) auteur de la création à distance. Posé depuis le jeton, jamais du corps. */
  createdBy?: any;
  activatedAt?: Date;
  removedReason?: string;
  removedAt?: Date;
  removedBy?: any;
  /** Anonymisation DCP/RGPD : horodatage du retrait définitif des données nominatives. */
  anonymizedAt?: Date;
  /** Réactivation d'un compte supprimé avant la fin du délai de grâce (relance le délai). */
  reactivatedAt?: Date;
  /** Parrainage (#6/#7) — code de parrainage propre à l'utilisateur (unique). */
  referralCode?: string;
  /** Parrainage — client qui a parrainé celui-ci (résolu depuis le code saisi à l'inscription). */
  referredBy?: any;
  /** Parrainage — nombre de filleuls VALIDÉS (inscrits ET abonnés payants). */
  referredCount?: number;
  /** Parrainage — nombre de mois gratuits déjà crédités au parrain. */
  freeMonthsGranted?: number;
  /** Parrainage — vrai une fois que ce filleul a été comptabilisé chez son parrain (idempotence). */
  referralCredited?: boolean;
  /** Identifiant de l'appareil à l'inscription (Android ID / identifiant iOS) : anti auto-parrainage. */
  signupDeviceId?: string;
  /** Filleul : date de validation (1er abonnement payé). */
  referralValidatedAt?: Date;
  /** Filleul : motif de refus (`same-device`, `same-phone`) — il ne comptera jamais. */
  referralRejected?: string;
  /** Parrain : trop de filleuls en 24 h, la récompense attend une vérification dans le CMS. */
  referralReview?: boolean;
  /** Parrain : date de la dernière revue levée (la règle de vitesse ne compte qu'après). */
  referralReviewClearedAt?: Date;
  /** Parrain : octroi du mois offert (`FreeMonthGrant`) — une seule récompense par parrain. */
  referralRewardId?: any;
  /** Parrain : fraude confirmée, plus aucune récompense. */
  referralRewardBlocked?: boolean;
  /** Parrain : avertissements pour fraude (blocage du compte à la récidive). */
  referralWarnings?: number;
  /** Parrain : relances envoyées (2 au plus) et date de la dernière. */
  referralNudges?: number;
  referralLastNudgeAt?: Date;
  /** Code cadeau / YOYO Business saisi à l'inscription, activé à la vérification du compte. */
  pendingPromoCode?: string;
  /** Anti-devinette des codes : échecs dans l'heure en cours. */
  promoFailures?: number;
  promoFailuresAt?: Date;
  /** Parrainage — code influenceur (#17) saisi à l'inscription (distinct du parrainage utilisateur). */
  influencerCode?: string;
  /** Push proximité (#1) — dernière position connue remontée par l'app (background). */
  lastLocation?: { lat: number; lng: number; at?: Date };
  /** Push proximité (#1) — dernier envoi de notif de proximité (anti-spam). */
  lastProximityPushAt?: Date;
}

export interface IRegister {
  email: string;
  password: string;
  lastname: string;
  firstname: string;
  contact: string;
  birthdate: Date;
  country: string;
  // Code promo unifié (facultatif) : résolu automatiquement en code influenceur ou parrainage à l'inscription.
  promoCode?: string;
  // Rétro-compat (anciennes versions app) : codes envoyés séparément, toujours tolérés.
  referralCode?: string;
  influencerCode?: string;
  agentMatricule?: string;
  // Envoyé par l'app Client à partir de la version qui sait saisir le code : le compte reste
  // `pending` jusqu'à la vérification de l'OTP email. Absent (anciennes versions, app Pro) ⇒ actif.
  emailVerification?: boolean;
}

export interface ISecurityPreferences {
  deviceLogin: boolean;
  twoFactorEnabled: boolean;
  twoFactorMethod: 'email' | 'sms' | 'authenticator';
  loginNotifications: boolean;
  sessionTimeout: number; // en minutes
  ipWhitelist?: string[];
  ipBlacklist?: string[];
}

export interface INotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  frequency: 'immediate' | 'daily' | 'weekly';
  types: {
    news: boolean;
    updates: boolean;
    security: boolean;
    marketing: boolean;
  };
}

export interface IUpdatePassword {
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
}
