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
  removedReason?: string;
  removedAt?: Date;
  removedBy?: any;
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
