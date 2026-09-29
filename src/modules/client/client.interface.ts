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
  /** Parrainage — code influenceur (#17) saisi à l'inscription (distinct du parrainage utilisateur). */
  influencerCode?: string;
}

export interface IRegister {
  email: string;
  password: string;
  lastname: string;
  firstname: string;
  contact: string;
  birthdate: Date;
  country: string;
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
