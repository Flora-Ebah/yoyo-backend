import { INotificationOptions, INotificationResult, NotificationType } from './notification.interface';
import coddyger, { IErrorObject } from 'coddyger';

/**
 * Classe abstraite pour les services de notification
 */
export abstract class NotificationService {
  /**
   * Envoie une notification
   * @param options Options de notification
   */
  abstract send(options: INotificationOptions): Promise<INotificationResult>;

  /**
   * Vérifie si le service est disponible
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Initialise le service
   */
  abstract init(): Promise<void>;
}

/**
 * Classe principale pour gérer les notifications
 */
export class NotificationManager {
  private static instance: NotificationManager;
  private services: Map<string, NotificationService> = new Map();
  private initialized: boolean = false;

  /**
   * Constructeur privé pour le singleton
   */
  private constructor() {}

  /**
   * Obtient l'instance unique du gestionnaire de notifications
   */
  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * Initialise tous les services de notification
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialiser tous les services enregistrés
      for (const [_, service] of this.services) {
        await service.init();
      }
      this.initialized = true;
      coddyger.konsole('Services de notification initialisés');
    } catch (error) {
      console.error('Erreur lors de l\'initialisation des services de notification:', error);
      throw error;
    }
  }

  /**
   * Enregistre un service de notification
   * @param type Type de notification
   * @param service Service de notification
   */
  public registerService(type: string, service: NotificationService): void {
    this.services.set(type, service);
  }

  /**
   * Envoie une notification
   * @param options Options de notification
   */
  public async sendNotification(options: INotificationOptions): Promise<INotificationResult> {
    if (!this.initialized) {
      await this.init();
    }

    const service = this.services.get(options.type.toString());
    if (!service) {
      return {
        success: false,
        message: `Service de notification ${options.type} non disponible`,
        error: new Error(`Service de notification ${options.type} non disponible`)
      };
    }

    try {
      const isAvailable = await service.isAvailable();
      if (!isAvailable) {
        return {
          success: false,
          message: `Service de notification ${options.type} non disponible`,
          error: new Error(`Service de notification ${options.type} non disponible`)
        };
      }

      return await service.send(options);
    } catch (error) {
      console.error(`Erreur lors de l'envoi de la notification ${options.type}:`, error);
      return {
        success: false,
        message: `Erreur lors de l'envoi de la notification ${options.type}`,
        error
      };
    }
  }

  /**
   * Vérifie si un service est disponible
   * @param type Type de notification
   */
  public async isServiceAvailable(type: string): Promise<boolean> {
    if (!this.initialized) {
      await this.init();
    }

    const service = this.services.get(type);
    if (!service) {
      return false;
    }

    return await service.isAvailable();
  }
} 