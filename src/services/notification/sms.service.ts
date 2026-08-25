import { NotificationService } from './notification.service';
import { INotificationOptions, INotificationResult } from './notification.interface';
import coddyger, { LoggerService, LogLevel } from 'coddyger';
import axios from 'axios';
import { MessageTypes } from './constants/message-types';

/**
 * Service d'envoi de SMS
 * Cette implémentation utilise un service SMS générique via API REST
 * Vous devrez adapter cette classe à votre fournisseur de SMS spécifique
 */
export class SmsService extends NotificationService {
  private readonly serviceLabel = 'SmsService';
  private apiKey: string = '';
  private apiUrl: string = '';
  private initialized: boolean = false;

  /**
   * Initialise le service SMS
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Récupérer les informations de configuration
      this.apiKey = process.env.SMS_API_KEY || '';
      this.apiUrl = process.env.SMS_API_URL || '';

      if (!this.apiKey || !this.apiUrl) {
        throw new Error('Configuration SMS manquante');
      }

      this.initialized = true;
      LoggerService.log({
        type: LogLevel.Info,
        content: 'Service SMS initialisé avec succès',
        location: this.serviceLabel,
        method: 'init'
      });
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du service SMS:', error);
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
      } catch (error) {
        return false;
      }
    }

    return !!(this.apiKey && this.apiUrl);
  }

  /**
   * Envoie un SMS
   * @param options Options de notification
   */
  public async send(options: INotificationOptions): Promise<INotificationResult> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const { to, data } = options;
      
      // Préparer les destinataires
      const recipients = Array.isArray(to) ? to : [to];
      
      // Préparer le contenu du SMS
      const message = typeof data === 'string' ? data : data.message;
      
      // Formater le message SMS
      const formattedMessage = this.formatSmsMessage(message ??'', options.category.toString());
      
      // Envoyer le SMS à chaque destinataire
      const results = await Promise.all(
        recipients.map(async (recipient) => {
          try {
            // Formater le numéro de téléphone si nécessaire
            const formattedPhone = this.formatPhoneNumber(recipient);
            
            if (!this.validatePhoneNumber(formattedPhone)) {
              return {
                recipient,
                success: false,
                error: new Error('Numéro de téléphone invalide')
              };
            }
            
            // Pour l'instant, on simule l'envoi comme dans le module OTP
            console.log(`SMS envoyé à ${formattedPhone}: ${formattedMessage}`);
            
            // Journaliser l'envoi
            LoggerService.log({
              type: LogLevel.Info,
              content: `SMS envoyé à ${formattedPhone}`,
              location: this.serviceLabel,
              method: 'send'
            });
            
            // Décommenter ce code pour l'envoi réel via API
            /*
            // Envoyer le SMS via l'API
            const response = await axios.post(
              this.apiUrl,
              {
                to: formattedPhone,
                message: formattedMessage,
                // Ajouter d'autres paramètres selon votre fournisseur de SMS
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.apiKey}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            */
            
            return {
              recipient: formattedPhone,
              success: true,
              // data: response.data
              data: { message: 'SMS envoyé avec succès (simulation)' }
            };
          } catch (error) {
            console.error(`Erreur lors de l'envoi du SMS à ${recipient}:`, error);
            LoggerService.log({
              type: LogLevel.Error,
              content: `Erreur lors de l'envoi du SMS à ${recipient}: ${error}`,
              location: this.serviceLabel,
              method: 'send'
            });
            return {
              recipient,
              success: false,
              error
            };
          }
        })
      );
      
      // Vérifier si tous les SMS ont été envoyés avec succès
      const allSuccessful = results.every(result => result.success);
      
      return {
        success: allSuccessful,
        message: allSuccessful 
          ? 'Tous les SMS ont été envoyés avec succès' 
          : 'Certains SMS n\'ont pas pu être envoyés',
        data: results
      };
    } catch (error) {
      console.error('Erreur lors de l\'envoi des SMS:', error);
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'send'
      });
      return {
        success: false,
        message: 'Erreur lors de l\'envoi des SMS',
        error
      };
    }
  }

  /**
   * Envoie un SMS contenant un code OTP
   * @param phoneNumber Numéro de téléphone du destinataire
   * @param code Code OTP à envoyer
   * @param purpose Objectif de l'OTP
   * @returns Résultat de l'envoi
   */
  async sendOtpSms(
    phoneNumber: string,
    code: string,
    purpose: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Récupérer le template SMS en fonction du purpose
      const smsMessage = MessageTypes.getSmsTemplate(purpose, code);
      
      // TODO: Implémenter l'envoi de SMS avec le code OTP
      // Exemple avec Twilio:
      // const result = await this.twilioClient.messages.create({
      //   body: smsMessage,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: phoneNumber
      // });
      
      // Pour l'instant, on simule l'envoi
      console.log(`SMS OTP envoyé à ${phoneNumber} avec le code ${code} pour ${purpose}`);
      console.log(`Message: ${smsMessage}`);
      
      // Journaliser l'envoi
      LoggerService.log({
        type: LogLevel.Info,
        content: `SMS OTP envoyé à ${phoneNumber} avec le code ${code} pour ${purpose}`,
        location: this.serviceLabel,
        method: 'sendOtpSms'
      });

      return {
        success: true,
        message: 'SMS envoyé avec succès'
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'sendOtpSms'
      });

      return {
        success: false,
        message: 'Erreur lors de l\'envoi du SMS'
      };
    }
  }

  /**
   * Formate le message SMS en fonction de la catégorie
   * @param message Message à envoyer
   * @param category Catégorie du message
   * @returns Message SMS formaté
   */
  private formatSmsMessage(message: string, category: string): string {
    const appName = 'YoYo';
    
    // Si le message est déjà formaté, le retourner tel quel
    if (message.startsWith(`[${appName}]`)) {
      return message;
    }
    
    // Sinon, formater le message selon la catégorie
    switch (category) {
      case 'INFO':
        return `[${appName}] Info: ${message}`;
      case 'WARNING':
        return `[${appName}] Attention: ${message}`;
      case 'ERROR':
        return `[${appName}] Erreur: ${message}`;
      case 'SUCCESS':
        return `[${appName}] Succès: ${message}`;
      default:
        return `[${appName}] ${message}`;
    }
  }

  /**
   * Vérifie si un numéro de téléphone est valide
   * @param phoneNumber Numéro de téléphone à vérifier
   * @returns Résultat de la vérification
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // Validation de base pour les numéros internationaux
    // Format E.164 recommandé pour les services SMS
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    
    // Si le numéro ne commence pas par +, on vérifie s'il s'agit d'un numéro local
    if (!phoneNumber.startsWith('+')) {
      // Pour les numéros locaux (par exemple, numéros ivoiriens)
      const localPhoneRegex = /^0[1-9]\d{8}$/;
      if (localPhoneRegex.test(phoneNumber)) {
        return true;
      }
      return false;
    }
    
    return phoneRegex.test(phoneNumber);
  }

  /**
   * Formate un numéro de téléphone pour l'envoi de SMS
   * @param phoneNumber Numéro de téléphone à formater
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Supprimer les espaces, tirets et parenthèses
    let formatted = phoneNumber.replace(/[\s\-()]/g, '');
    
    // Ajouter le préfixe international si nécessaire
    if (formatted.startsWith('0')) {
      formatted = '+225' + formatted.substring(1);
    }
    
    return formatted;
  }
} 