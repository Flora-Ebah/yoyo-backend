import coddyger, { IData, LoggerService, LogLevel } from 'coddyger'
import { IOtp, OtpSet } from './';
import { randomInt } from 'crypto';
import { notificationManager, NotificationCategory, NotificationType, EmailService, SmsService, MessageTypes } from '../../services/notification';

export class OtpService {
	private readonly dao: IData<IOtp>;
	private readonly serviceLabel = 'OtpService';
	private readonly DEFAULT_OTP_EXPIRY_MINUTES = 10; // Durée de validité par défaut des codes OTP (10 minutes)
	private readonly DEFAULT_MAX_ATTEMPTS = 3; // Nombre maximum de tentatives par défaut
	private readonly emailService: EmailService;
	private readonly smsService: SmsService;

	constructor() {
		this.dao = new OtpSet();
		this.emailService = new EmailService();
		this.smsService = new SmsService();
	}

	// Fonction pour détecter le type de login
	static detectLoginType(login: string): 'email' | 'phone' {
		// Regex pour numéro de téléphone (format international)
		const phoneRegex = /^\+?[1-9]\d{1,14}$/;

		if (coddyger.string.isEmailAddress(login)) {
			return 'email';
		} else if (phoneRegex.test(login)) {
			return 'phone';
		} else {
			throw new Error('Format de login invalide');
		}
	}

	// Fonction pour générer un code OTP à 4 chiffres
	static generateCode(): string {
		return randomInt(1000, 10000).toString();
	}

	// Fonction pour envoyer le code OTP
	static async sendOtp(login: string, code: string, purpose: string, type: 'email' | 'phone'): Promise<void> {
		// Créer une instance des services
		const emailService = new EmailService();
		const smsService = new SmsService();
		
		if(type === 'email') {
			// Utiliser le service d'email pour envoyer l'OTP
			const result = await emailService.sendOtpEmail(
				login, 
				code, 
				purpose === 'Code de vérification' ? MessageTypes.TYPES.ACCOUNT_VERIFICATION : purpose
			);
			
			if (!result.success) {
				LoggerService.log({
					type: LogLevel.Error,
					content: `Échec de l'envoi d'email OTP à ${login}`,
					location: 'OtpService',
					method: 'sendOtp'
				});
			}
		} else {
			// Utiliser le service SMS pour envoyer l'OTP
			const result = await smsService.sendOtpSms(
				login, 
				code, 
				purpose === 'Code de vérification' ? MessageTypes.TYPES.ACCOUNT_VERIFICATION : purpose
			);
			
			if (!result.success) {
				LoggerService.log({
					type: LogLevel.Error,
					content: `Échec de l'envoi de SMS OTP à ${login}`,
					location: 'OtpService',
					method: 'sendOtp'
				});
			}
		}
	}

	static generateOTP(length: number = 4): string {
		// Génère un OTP de la longueur spécifiée de manière cryptographiquement sûre
		let otp = '';
		for (let i = 0; i < length; i++) {
			otp += randomInt(0, 10).toString();
		}
		return otp;
	}

	/**
	 * Crée un nouvel OTP dans la base de données
	 * @param userId ID de l'utilisateur
	 * @param type Type d'OTP (email/phone)
	 * @param login Email ou numéro de téléphone
	 * @param purpose Objectif de l'OTP
	 * @param options Options supplémentaires
	 * @returns L'objet OTP créé
	 */
	async createOtp(
		userId: string,
		type: 'email' | 'phone',
		login: string,
		purpose: string,
		options?: {
			expiryMinutes?: number;
			maxAttempts?: number;
			purposeDetails?: string;
			metadata?: { ip?: string; userAgent?: string; [key: string]: any };
			codeLength?: number;
		}
	): Promise<IOtp> {
		// Cette méthode crée un nouvel OTP pour un utilisateur
		try {
			// Générer un nouveau code OTP
			const code = OtpService.generateCode();
			
			// Calculer la date d'expiration
			const expiryMinutes = options?.expiryMinutes || this.DEFAULT_OTP_EXPIRY_MINUTES;
			const expiresAt = new Date();
			expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);
			
			// Créer l'objet OTP
			const otpData: IOtp = {
				_id: coddyger.string.generateObjectId(),
				type,
				code,
				login,
				purpose,
				status: 'active',
				expiresAt,
				attempts: 0
			};
			
			// Stocker dans la base de données
			const result = await this.dao.save(otpData);
			
			// Vérifier si le résultat est une erreur
			if ('error' in result) {
				throw new Error(`Erreur lors de la création de l'OTP: ${result.message}`);
			}
			
			const otp = result as IOtp;
			
			// Journaliser la création
			LoggerService.log({
				type: LogLevel.Info,
				content: `Nouvel OTP créé pour ${login} avec expiration dans ${expiryMinutes} minutes`,
				location: this.serviceLabel,
				method: 'createOtp'
			});
			
			// Envoyer une notification avec le code OTP
			const notificationResult:any = await notificationManager.sendNotification({
				category: NotificationCategory.INFO,
				type: NotificationType.PUSH,
				to: userId,
				data: {
					title: "Code OTP",
					message: `Votre code OTP est : ${code}`,
					data: {
						type: 'otp',
						otp: code,
						expiresAt: otp.expiresAt
					}
				}
			});

			if (notificationResult.error) {
				LoggerService.log({ 
					type: LogLevel.Error, 
					content: notificationResult.error, 
					location: this.serviceLabel, 
					method: 'createOtp' 
				});
			}

			return otp;
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'createOtp'
			});
			throw error;
		}
	}

	/**
	 * Crée un nouvel OTP pour un utilisateur et l'envoie par email
	 * @param userId ID de l'utilisateur
	 * @param email Adresse email
	 * @param purpose Objectif de l'OTP
	 * @param options Options supplémentaires
	 * @returns Résultat de l'opération
	 */
	async createAndSendEmailOtp(
		userId: string,
		email: string,
		purpose: 'account_verification' | 'password_reset' | 'login_verification' | 'transaction_confirmation' | 'other',
		options?: {
			expiryMinutes?: number;
			maxAttempts?: number;
			purposeDetails?: string;
			metadata?: { ip?: string; userAgent?: string; [key: string]: any };
			codeLength?: number;
			userName?: string;
		}
	): Promise<{ success: boolean; message: string; otpId?: string }> {
		try {
			// Récupérer la configuration pour ce type de message
			const messageConfig = MessageTypes.getMessageConfig(purpose);
			
			// Vérifier si l'utilisateur peut demander un nouveau code
			const cooldownMinutes = options?.expiryMinutes || messageConfig.cooldownMinutes;
			const canRequest = await this.canRequestNewOtp(userId, email, purpose, cooldownMinutes);
			
			if (!canRequest.canRequest) {
				return {
					success: false,
					message: canRequest.message || 'Vous devez attendre avant de demander un nouveau code'
				};
			}

			// Créer un nouvel OTP avec les paramètres de configuration du type de message
			const otp = await this.createOtp(userId, 'email', email, purpose, {
				...options,
				expiryMinutes: options?.expiryMinutes || messageConfig.expiryMinutes,
				maxAttempts: options?.maxAttempts || messageConfig.maxAttempts
			});
			
			// Envoyer l'OTP par email
			const emailResult = await this.emailService.sendOtpEmail(
				email, 
				otp.code, 
				purpose,
				options?.userName,
				options?.purposeDetails ? { details: options.purposeDetails } : undefined
			);
			
			if (!emailResult.success) {
				// Si l'envoi échoue, désactiver l'OTP
				await this.dao.update({ _id: otp._id }, { status: 'cancelled' });
				return {
					success: false,
					message: 'Échec de l\'envoi de l\'email. Veuillez réessayer.'
				};
			}
			
			return {
				success: true,
				message: 'Code OTP envoyé avec succès à votre adresse email.',
				otpId: otp._id
			};
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'createAndSendEmailOtp'
			});
			
			return {
				success: false,
				message: 'Une erreur est survenue lors de l\'envoi du code OTP.'
			};
		}
	}

	/**
	 * Crée un nouvel OTP pour un utilisateur et l'envoie par SMS
	 * @param userId ID de l'utilisateur
	 * @param phoneNumber Numéro de téléphone
	 * @param purpose Objectif de l'OTP
	 * @param options Options supplémentaires
	 * @returns Résultat de l'opération
	 */
	async createAndSendSmsOtp(
		userId: string,
		phoneNumber: string,
		purpose: 'account_verification' | 'password_reset' | 'login_verification' | 'transaction_confirmation' | 'other',
		options?: {
			expiryMinutes?: number;
			maxAttempts?: number;
			purposeDetails?: string;
			metadata?: { ip?: string; userAgent?: string; [key: string]: any };
			codeLength?: number;
		}
	): Promise<{ success: boolean; message: string; otpId?: string }> {
		try {
			// Valider le numéro de téléphone
			if (!this.smsService.validatePhoneNumber(phoneNumber)) {
				return {
					success: false,
					message: 'Numéro de téléphone invalide.'
				};
			}
			
			// Récupérer la configuration pour ce type de message
			const messageConfig = MessageTypes.getMessageConfig(purpose);
			
			// Vérifier si l'utilisateur peut demander un nouveau code
			const cooldownMinutes = options?.expiryMinutes || messageConfig.cooldownMinutes;
			const canRequest = await this.canRequestNewOtp(userId, phoneNumber, purpose, cooldownMinutes);
			
			if (!canRequest.canRequest) {
				return {
					success: false,
					message: canRequest.message || 'Vous devez attendre avant de demander un nouveau code'
				};
			}

			// Créer un nouvel OTP avec les paramètres de configuration du type de message
			const otp = await this.createOtp(userId, 'phone', phoneNumber, purpose, {
				...options,
				expiryMinutes: options?.expiryMinutes || messageConfig.expiryMinutes,
				maxAttempts: options?.maxAttempts || messageConfig.maxAttempts
			});
			
			// Envoyer l'OTP par SMS
			const smsResult = await this.smsService.sendOtpSms(phoneNumber, otp.code, purpose);
			
			if (!smsResult.success) {
				// Si l'envoi échoue, désactiver l'OTP
				await this.dao.update({ _id: otp._id }, { status: 'cancelled' });
				return {
					success: false,
					message: 'Échec de l\'envoi du SMS. Veuillez réessayer.'
				};
			}
			
			return {
				success: true,
				message: 'Code OTP envoyé avec succès à votre numéro de téléphone.',
				otpId: otp._id
			};
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: this.serviceLabel,
				method: 'createAndSendSmsOtp'
			});
			
			return {
				success: false,
				message: 'Une erreur est survenue lors de l\'envoi du code OTP.'
			};
		}
	}

	async canRequestNewOtp(
    userId: string,
    destination: string,
    purpose: string,
    cooldownMinutes: number = 1
  ): Promise<{ canRequest: boolean; message?: string; timeToWait?: number }> {
    try {
      // Rechercher le dernier OTP créé pour cet utilisateur, cette destination et ce but
      const lastOtp: any = await this.dao.selectLatestWithParams({
        userId,
        destination,
        purpose
      });

      // Si aucun OTP n'a été trouvé, l'utilisateur peut en demander un nouveau
      if (!lastOtp) {
        return { canRequest: true };
      }

      // Calculer le temps écoulé depuis la création du dernier OTP (en minutes)
      const now = new Date();
      const lastCreationTime = new Date(lastOtp.createdAt);
      const elapsedMinutes = (now.getTime() - lastCreationTime.getTime()) / (1000 * 60);

      // Vérifier si le temps d'attente minimum est écoulé
      if (elapsedMinutes < cooldownMinutes) {
        const timeToWait = Math.ceil(cooldownMinutes - elapsedMinutes);
        return {
          canRequest: false,
          message: `Veuillez attendre ${timeToWait} minute(s) avant de demander un nouveau code.`,
          timeToWait
        };
      }

      return { canRequest: true };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'canRequestNewOtp'
      });
      throw error;
    }
  }

	/**
	 * Vérifie un code OTP
	 * @param userId ID de l'utilisateur
	 * @param code Code OTP à vérifier
	 * @param type Type d'OTP
	 * @returns Résultat de la vérification
	 */
	async verifyOTP(userId: string, code: string, type: string): Promise<any> {
		try {
			// Récupérer le dernier OTP valide pour cet utilisateur
			const otp:any = await this.dao.selectLatestWithParams({
				userId,
				type,
				status: 'pending',
				expiresAt: { $gt: new Date() }
			});

			if (!otp) {
				return { error: true, data: "Code OTP invalide ou expiré" };
			}

			if (otp.code !== code) {
				return { error: true, data: "Code OTP incorrect" };
			}

			// Marquer l'OTP comme utilisé
			const result:any = await this.dao.update(
				{ _id: otp._id },
				{ 
					status: 'used',
					usedAt: new Date()
				}
			);

			if (result.error) {
				throw new Error(result);
			}

			// Envoyer une notification de confirmation
			const notificationResult:any = await notificationManager.sendNotification({
				category: NotificationCategory.SUCCESS,
				type: NotificationType.PUSH,
				to: userId,
				data: {
					title: "Vérification OTP",
					message: "Code OTP vérifié avec succès",
					data: {
						type: 'otp_verified',
						verifiedAt: new Date()
					}
				}
			});

			if (notificationResult.error) {
				LoggerService.log({ 
					type: LogLevel.Error, 
					content: notificationResult.error, 
					location: this.serviceLabel, 
					method: 'verifyOTP' 
				});
			}

			return { success: true };
		} catch (error) {
			LoggerService.log({ 
				type: LogLevel.Error, 
				content: error, 
				location: this.serviceLabel, 
				method: 'verifyOTP' 
			});
			return { error: true, data: error };
		}
	}

	/**
	 * Récupère tous les OTP d'un utilisateur
	 * @param userId ID de l'utilisateur
	 * @returns Liste des OTP
	 */
	async getUserOTPs(userId: string): Promise<any> {
		try {
			const result:any = await this.dao.select({
				params: { 
					userId,
					status: { $nin: ['removed', 'archived'] }
				},
				sort: { createdAt: -1 }
			});

			if (result.error) {
				throw new Error(result);
			}

			return result;
		} catch (error) {
			LoggerService.log({ 
				type: LogLevel.Error, 
				content: error, 
				location: this.serviceLabel, 
				method: 'getUserOTPs' 
			});
			return { error: true, data: error };
		}
	}

	/**
	 * Supprime un OTP
	 * @param id ID de l'OTP
	 * @returns Résultat de l'opération
	 */
	async delete(id: string): Promise<void> {
		try {
			const result:any = await this.dao.update({ _id: id }, { status: 'removed' });
			if (result.error) {
				throw new Error(result);
			}
		} catch (error) {
			LoggerService.log({ 
				type: LogLevel.Error, 
				content: error, 
				location: this.serviceLabel, 
				method: 'delete' 
			});
			throw error;
		}
	}
}
