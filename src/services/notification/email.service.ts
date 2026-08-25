import { NotificationService } from './notification.service';
import { INotificationOptions, INotificationResult } from './notification.interface';
import { env, LoggerService, LogLevel } from 'coddyger';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { MessageTypes } from './constants/message-types';

/**
 * Service d'envoi d'emails
 */
export class EmailService extends NotificationService {
  private readonly serviceLabel = 'EmailService';
  private transporter: any;
  private initialized: boolean = false;
  private templatesDir: string = path.join(__dirname, '../../../templates/emails');

  /**
   * Initialise le service d'email
   */
  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Créer le transporteur Nodemailer avec les mêmes paramètres que le module OTP
      this.transporter = nodemailer.createTransport({
        host: process.env.MAILER_HOST,
        port: parseInt(process.env.MAILER_PORT ?? '587'),
        secure: process.env.MAILER_SECURE === 'true',
        auth: {
          user: process.env.MAILER_USER,
          pass: process.env.MAILER_PASSWORD
        },
        tls: {
          // do not fail on invalid certs
          rejectUnauthorized: true,
        },
      });

      // Vérifier la connexion
      await this.verifyConnection();
      this.initialized = true;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du service d\'email:', error);
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
   * Vérifie la connexion au serveur SMTP
   */
  private async verifyConnection(): Promise<boolean> {
    try {
      return await new Promise((resolve) => {
        this.transporter.verify(function (error) {
          if (error) {
            console.error('Erreur de connexion au serveur SMTP:', error);
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'verifyConnection'
      });
      return false;
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
    return await this.verifyConnection();
  }

  /**
   * Envoie un email
   * @param options Options de notification
   */
  public async send(options: INotificationOptions): Promise<INotificationResult> {
    if (!this.initialized) {
      await this.init();
    }

    try {
      const { to, data, template, templateData, attachments } = options;
      
      // Préparer les destinataires
      const recipients = Array.isArray(to) ? to.join(',') : to;
      
      // Préparer le contenu de l'email
      let subject = '';
      let html = '';
      
      // Si un template est spécifié, l'utiliser
      if (template) {
        // Récupérer le template prédéfini
        const emailTemplate = MessageTypes.getEmailTemplate(template, '', data.userName, templateData);
        subject = emailTemplate.subject;
        html = emailTemplate.body;
      } else if (typeof data === 'string') {
        // Si data est une chaîne simple, l'utiliser comme contenu
        subject = `Notification de YoYo`;
        html = data;
      } else {
        // Si data est un objet, extraire le titre et le message
        subject = data.title || `Notification de YoYo`;
        html = data.message ?? '';
      }
      
      // Envoyer l'email
      const mailOptions = {
        from: process.env.MAILER_FROM ?? `${env.appName} <noreply@${env.domain}>`,
        to: recipients,
        subject,
        html,
        attachments: attachments || []
      };
      
      const info = await this.transporter.sendMail(mailOptions);
      
      LoggerService.log({
        type: LogLevel.Info,
        content: `Email envoyé à ${recipients} avec succès. Message ID: ${info.messageId}`,
        location: this.serviceLabel,
        method: 'send'
      });
      
      return {
        success: true,
        message: 'Email envoyé avec succès',
        data: info
      };
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'email:', error);
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'send'
      });
      
      return {
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email',
        error
      };
    }
  }

  /**
   * Envoie un email contenant un code OTP
   * @param email Adresse email du destinataire
   * @param code Code OTP à envoyer
   * @param purpose Objectif de l'OTP
   * @param userName Nom de l'utilisateur (optionnel)
   * @param details Détails supplémentaires (optionnel)
   * @returns Résultat de l'envoi
   */
  public async sendOtpEmail(
    email: string,
    code: string,
    purpose: string,
    userName?: string,
    details?: any
  ): Promise<{ success: boolean; message: string }> {
    if (!this.initialized) {
      await this.init();
    }
    
    try {
      // Récupérer le template d'email en fonction du purpose
      const emailTemplate = MessageTypes.getEmailTemplate(purpose, code, userName, details);
      
      // Configurer les options d'email
      const mailOptions = {
        from: process.env.MAILER_FROM ?? `${env.appName} <noreply@${env.domain}>`,
        to: [email],
        subject: emailTemplate.subject,
        html: emailTemplate.body
      };

      // Envoyer l'email
      const info = await this.transporter.sendMail(mailOptions);
      
      LoggerService.log({
        type: LogLevel.Info,
        content: `Email OTP envoyé à ${email} avec le code ${code} pour ${purpose}. Message ID: ${info.messageId}`,
        location: this.serviceLabel,
        method: 'sendOtpEmail'
      });

      return {
        success: true,
        message: 'Email envoyé avec succès'
      };
    } catch (error) {
      console.log(error)

      return {
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      };
    }
  }

  /**
   * Rend un template avec Handlebars
   * @param templateName Nom du template
   * @param data Données pour le template
   */
  private async renderTemplate(templateName: string, data: any): Promise<string> {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
      
      // Vérifier si le template existe
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template ${templateName} non trouvé`);
      }
      
      // Lire le template
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      
      // Compiler le template
      const template = handlebars.compile(templateContent);
      
      // Rendre le template avec les données
      return template(data);
    } catch (error) {
      console.error('Erreur lors du rendu du template:', error);
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'renderTemplate'
      });
      throw error;
    }
  }
} 