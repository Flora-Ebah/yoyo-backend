import { NotificationService } from './notification.service';
import { INotificationOptions, INotificationResult } from './notification.interface';
import coddyger, { LoggerService, LogLevel } from 'coddyger';
import axios from 'axios';
import { MessageTypes } from './constants/message-types';

/**
 * Service d'envoi de SMS — fournisseur **Orange SMS Côte d'Ivoire** (api.orange.com).
 *
 * Le flux est identique à celui d'Orange Money déjà en place dans `PaymentHelper` : un jeton
 * OAuth2 `client_credentials` obtenu sur `/oauth/v3/token`, mis en cache jusqu'à son expiration,
 * puis présenté en `Bearer` sur l'API métier.
 *
 * Le service se déclare **indisponible** tant que la configuration Orange est absente. C'est
 * volontaire : `NotificationManager` l'écarte alors proprement, et les appelants (l'onboarding
 * marchand notamment) n'annoncent pas un SMS parti alors que rien n'a quitté le serveur.
 */
export class SmsService extends NotificationService {
  private readonly serviceLabel = 'SmsService';

  private host: string = '';
  /** En-tête `Authorization` complet de l'appel OAuth, ex. `Basic <base64(id:secret)>`. */
  private authHeader: string = '';
  /** Numéro émetteur enregistré auprès d'Orange, au format `tel:+225XXXXXXXXXX`. */
  private senderAddress: string = '';
  private senderName: string = '';
  private initialized: boolean = false;

  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /**
   * Initialise le service SMS
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.host = process.env.ORANGE_SMS_HOST || 'https://api.orange.com';
      this.authHeader = process.env.ORANGE_SMS_AUTH_HEADER || '';
      this.senderAddress = process.env.ORANGE_SMS_SENDER_ADDRESS || '';
      this.senderName = process.env.ORANGE_SMS_SENDER_NAME || 'YoYo';

      if (!this.authHeader || !this.senderAddress) {
        throw new Error('Configuration Orange SMS manquante (ORANGE_SMS_AUTH_HEADER, ORANGE_SMS_SENDER_ADDRESS)');
      }

      this.initialized = true;
      LoggerService.log({
        type: LogLevel.Info,
        content: 'Service SMS Orange initialisé avec succès',
        location: this.serviceLabel,
        method: 'init'
      });
    } catch (error) {
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
   *
   * Appelé avant tout envoi par les chemins qui rendent compte des canaux réellement utilisés.
   */
  public async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      try {
        await this.init();
      } catch (error) {
        return false;
      }
    }

    return !!(this.authHeader && this.senderAddress);
  }

  /**
   * Obtient un jeton OAuth2, en réutilisant celui en cache tant qu'il est valide.
   *
   * Même mécanique que `PaymentHelper.ensureValidToken` : Orange facture ces appels et limite leur
   * fréquence, on ne redemande donc un jeton qu'à son expiration.
   */
  private async ensureValidToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await axios.post(
      `${this.host}/oauth/v3/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      }
    );

    this.accessToken = response.data.access_token;
    // Marge de 60 s pour ne pas présenter un jeton qui expire pendant le vol.
    this.tokenExpiry = Date.now() + Math.max(0, (response.data.expires_in ?? 3600) - 60) * 1000;

    return this.accessToken!;
  }

  /**
   * Remet un SMS à la passerelle Orange
   * @param to Numéro destinataire au format E.164 (`+225…`)
   * @param message Contenu du message
   */
  private async dispatch(to: string, message: string): Promise<any> {
    const token = await this.ensureValidToken();

    // Le numéro émetteur fait partie du chemin et doit être encodé (`tel:+225…` contient `:` et `+`).
    const url = `${this.host}/smsmessaging/v1/outbound/${encodeURIComponent(this.senderAddress)}/requests`;

    const response = await axios.post(
      url,
      {
        outboundSMSMessageRequest: {
          address: `tel:${to}`,
          senderAddress: this.senderAddress,
          senderName: this.senderName,
          outboundSMSTextMessage: { message }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return response.data;
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
      const formattedMessage = this.formatSmsMessage(message ?? '', options.category.toString());

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

            const data = await this.dispatch(formattedPhone, formattedMessage);

            LoggerService.log({
              type: LogLevel.Info,
              content: `SMS envoyé à ${formattedPhone}`,
              location: this.serviceLabel,
              method: 'send'
            });

            return {
              recipient: formattedPhone,
              success: true,
              data
            };
          } catch (error: any) {
            // La réponse d'erreur d'Orange porte le motif utile ; le message d'axios seul ne dit
            // que « Request failed with status code 4xx ».
            const detail = error?.response?.data ?? error?.message ?? error;

            console.error(`Erreur lors de l'envoi du SMS à ${recipient}:`, detail);
            LoggerService.log({
              type: LogLevel.Error,
              content: `Erreur lors de l'envoi du SMS à ${recipient}: ${JSON.stringify(detail)}`,
              location: this.serviceLabel,
              method: 'send'
            });
            return {
              recipient,
              success: false,
              error: detail
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
      if (!(await this.isAvailable())) {
        return {
          success: false,
          message: 'Service SMS non configuré'
        };
      }

      // Récupérer le template SMS en fonction du purpose
      const smsMessage = MessageTypes.getSmsTemplate(purpose, code);

      await this.dispatch(this.formatPhoneNumber(phoneNumber), smsMessage);

      // Le code n'est jamais journalisé : c'est un secret à usage unique.
      LoggerService.log({
        type: LogLevel.Info,
        content: `SMS OTP envoyé à ${phoneNumber} pour ${purpose}`,
        location: this.serviceLabel,
        method: 'sendOtpSms'
      });

      return {
        success: true,
        message: 'SMS envoyé avec succès'
      };
    } catch (error: any) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error?.response?.data ?? error,
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
