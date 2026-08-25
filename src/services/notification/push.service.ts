import { NotificationService } from './notification.service';
import { INotificationOptions, INotificationResult } from './notification.interface';
import { LoggerService, LogLevel } from 'coddyger';
import { getSocketIO } from '../../main';

/**
 * Service d'envoi de notifications push
 * Cette implémentation utilise Socket.IO pour envoyer des notifications en temps réel
 */
export class PushService extends NotificationService {
  private readonly serviceLabel = 'PushService';
  private initialized: boolean = false;

  /**
   * Initialise le service de notification push
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Vérifier que Socket.IO est disponible
      const socketIO = getSocketIO();
      if (!socketIO) {
        throw new Error('Socket.IO n\'est pas initialisé');
      }

      this.initialized = true;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du service de notification push:', error);
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'init'
      });
      throw error;
    }
  }

  /**
   * Vérifie si le service est disponible
   */
  public async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      try {
        await this.init();
        return true;
      } catch (error) {
        return false;
      }
    }

    return !!getSocketIO();
  }

  /**
   * Envoie une notification push via Socket.IO
   * @param options Options de notification
   */
  public async send(options: INotificationOptions): Promise<INotificationResult> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const { to, data, category } = options;
      
      // Récupérer l'instance Socket.IO
      const socketHelper = getSocketIO();
      if (!socketHelper) {
        throw new Error('Socket.IO n\'est pas disponible');
      }
      
      const io = socketHelper.getIo();
      
      // Préparer le contenu de la notification
      let title = '';
      let body = '';
      let eventName = 'notification';
      let additionalData = {};
      
      if (typeof data === 'string') {
        // Si data est une chaîne simple, l'utiliser comme corps de la notification
        title = `Notification de YoYo`;
        body = data;
      } else {
        // Si data est un objet, extraire les propriétés
        title = data.title ?? `Notification de YoYo`;
        body = data.message ?? '';
        eventName = (data.data && data.data.event) ? data.data.event : 'notification';
        additionalData = data.data || {};
      }
      
      // Préparer le payload de la notification
      const notificationPayload = {
        title,
        body,
        category: category?.toString() || 'INFO',
        timestamp: new Date().toISOString(),
        ...additionalData
      };
      
      // Si 'to' est spécifié, envoyer à des rooms spécifiques
      if (to && to !== 'all') {
        const rooms = Array.isArray(to) ? to : [to];
        
        // Envoyer à chaque room spécifiée
        rooms.forEach(room => {
          io.to(room).emit(eventName, notificationPayload);
          
          LoggerService.log({
            type: LogLevel.Info,
            content: `Notification push envoyée à la room ${room} via l'événement ${eventName}`,
            location: this.serviceLabel,
            method: 'send'
          });
        });
        
        return {
          success: true,
          message: `Notifications push envoyées aux rooms spécifiées via l'événement ${eventName}`,
          data: {
            rooms,
            payload: notificationPayload
          }
        };
      } else {
        // Envoyer à tous les clients connectés
        io.emit(eventName, notificationPayload);
        
        LoggerService.log({
          type: LogLevel.Info,
          content: `Notification push envoyée à tous les clients via l'événement ${eventName}`,
          location: this.serviceLabel,
          method: 'send'
        });
        
        return {
          success: true,
          message: `Notification push envoyée à tous les clients via l'événement ${eventName}`,
          data: {
            broadcast: true,
            payload: notificationPayload
          }
        };
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi de la notification push:', error);
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'send'
      });
      return {
        success: false,
        message: 'Erreur lors de l\'envoi de la notification push',
        error
      };
    }
  }
} 