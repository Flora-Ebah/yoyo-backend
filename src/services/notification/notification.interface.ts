/**
 * Interface pour les notifications
 */

// Types de notification
export enum NotificationType {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH'
}

// Catégories de notification
export enum NotificationCategory {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

// Interface pour les options de notification
export interface INotificationOptions {
  category: NotificationCategory | string;
  type: NotificationType | string;
  to: string | string[];
  data: any;
  template?: string;
  templateData?: any;
  attachments?: Array<{
    filename: string;
    path: string;
    contentType?: string;
  }>;
}

// Interface pour le résultat de l'envoi de notification
export interface INotificationResult {
  success: boolean;
  message: string;
  data?: any;
  error?: any;
} 