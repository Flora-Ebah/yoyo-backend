/**
 * Module de notification
 * @description Module pour l'envoi de notifications (email, SMS, push)
 */

export * from './notification.interface';
export * from './notification.service';
export * from './email.service';
export * from './sms.service';
export * from './push.service';
export * from './constants/message-types';

import { NotificationManager } from './notification.service';
import { EmailService } from './email.service';
// import { SmsService } from './sms.service';
import { PushService } from './push.service';
import { NotificationType } from './notification.interface';

/**
 * Initialise le gestionnaire de notifications avec tous les services disponibles
 */
export function initNotificationServices(): NotificationManager {
  const notificationManager = NotificationManager.getInstance();
  
  // Enregistrer les services
  notificationManager.registerService(NotificationType.EMAIL, new EmailService());
  // notificationManager.registerService(NotificationType.SMS, new SmsService());
  notificationManager.registerService(NotificationType.PUSH, new PushService());
  
  return notificationManager;
}

// Exporter une instance du gestionnaire de notifications
export const notificationManager = NotificationManager.getInstance(); 
