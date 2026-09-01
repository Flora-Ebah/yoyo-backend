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

import { LoggerService, LogLevel } from 'coddyger';
import { NotificationManager } from './notification.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { PushService } from './push.service';
import { NotificationType } from './notification.interface';

/**
 * Indique si le fournisseur SMS (Orange CI) est configuré.
 *
 * Sert de garde à l'enregistrement du service : `SmsService.init()` lève si la configuration est
 * absente, et `initNotificationServices()` est appelé au démarrage du serveur — enregistrer le
 * service à l'aveugle exposerait le boot à un échec pour une simple variable manquante.
 */
export function isSmsConfigured(): boolean {
  return !!(process.env.ORANGE_SMS_AUTH_HEADER && process.env.ORANGE_SMS_SENDER_ADDRESS);
}

/**
 * Initialise le gestionnaire de notifications avec tous les services disponibles
 */
export function initNotificationServices(): NotificationManager {
  const notificationManager = NotificationManager.getInstance();
  
  // Enregistrer les services
  notificationManager.registerService(NotificationType.EMAIL, new EmailService());
  notificationManager.registerService(NotificationType.PUSH, new PushService());

  if (isSmsConfigured()) {
    notificationManager.registerService(NotificationType.SMS, new SmsService());
  } else {
    LoggerService.log({
      type: LogLevel.Warn,
      content:
        'Service SMS non configuré (ORANGE_SMS_AUTH_HEADER / ORANGE_SMS_SENDER_ADDRESS absents) — le canal SMS est désactivé.',
      location: 'initNotificationServices',
      method: 'init'
    });
  }

  return notificationManager;
}

// Exporter une instance du gestionnaire de notifications
export const notificationManager = NotificationManager.getInstance(); 
