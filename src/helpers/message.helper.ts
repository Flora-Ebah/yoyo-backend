import { Events } from "../modules/push-notification";
import { EmailService, MessageTypes, NotificationCategory, notificationManager, NotificationType, SmsService } from "../services/notification";

const emailService = new EmailService();
const smsService = new SmsService();

export class MessageHelper {
	static async loginNotify(data: any) {
		try {
			await emailService.send({
				category: NotificationCategory.INFO,
				type: NotificationType.EMAIL,
				to: data.login,
				data: {
					name: data.name,
				},
				template: MessageTypes.TYPES.LOGIN_NOTIFICATION,
				templateData: {
					date: new Date().toLocaleString(),
					ip: data.ip,
					device: data.userAgent,
					location: data.userAgent,
				}
			});
		} catch (error) {
			return { success: false, error };
		}
	}

	static async sendOtp(data: any) {
		try {
			// await smsService.send(data.contact, data.otp);
			await emailService.send({
				category: NotificationCategory.INFO,
				type: NotificationType.EMAIL,
				to: data.login,
				data: {
					name: data.name,
				},
				template: MessageTypes.TYPES.ACCOUNT_VERIFICATION,
				templateData: {
					date: new Date().toLocaleString(),
					ip: data.ip,
					device: data.userAgent,
					location: data.userAgent,
				}
			});
		} catch (error) {
			return { success: false, error };
		}
	}

	static async welcomeClient(data: any) {
		try {
			await emailService.send({
				category: NotificationCategory.INFO,
				type: NotificationType.EMAIL,
				to: data.email,
				data: {
					name: data.firstname + ' ' + data.lastname,
				},
				template: MessageTypes.TYPES.ACCOUNT_CREATED,
				templateData: {
					date: new Date().toLocaleString(),
					ip: data.ip,
					device: data.userAgent,
					location: data.userAgent,
				}
			});
		} catch (error) {
			return { success: false, error };
		}
	}

	// Certification notify
	static async certificationNotify(data: any, status: string) {
		try {
			await notificationManager.sendNotification({
        category: NotificationCategory.INFO,
        type: NotificationType.PUSH,
        to: 'all',
        data: {
          title: 'Notification de certification',
          message: status === 'verifie' ? 'Vos documents ont été vérifiés avec succès.' : 'Vos documents ont été refusés. Motif: ' + data.reason,
          data: {
            event: Events.USER_NOTIFICATION,
            additionalData: {
              url: '/profile/document/history',
              user: data._id
            }
          }
        }
      });
		} catch (error) {
			return { success: false, error };
		}
	}

	static async deleteAccountNotify(data: any) {
		try {
			await notificationManager.sendNotification({
        category: NotificationCategory.INFO,
        type: NotificationType.PUSH,
        to: 'all',
        data: {
          title: 'Notification de suppression de compte',
          message: 'Un compte a été supprimé par le possesseur.',
          data: {
            event: Events.NOTIFY_DELETE_ACCOUNT,
            additionalData: {
              user: data._id
            }
          }
        }
      });
		} catch (error) {
			return { success: false, error };
		}
	}

	/**
	 * Envoie le lien d'activation à un marchand enrôlé à distance par un commercial.
	 *
	 * Les deux canaux sont indépendants : l'échec de l'un n'empêche pas l'autre, et chacun rapporte
	 * son propre résultat pour que l'appelant sache quels canaux sont réellement partis.
	 *
	 * @param data.email Adresse du marchand
	 * @param data.contact Téléphone du marchand (format local, formaté en +225 par le service SMS)
	 * @param data.name Nom complet du marchand
	 * @param data.shopName Nom de la boutique créée
	 * @param data.commercialName Nom du commercial à l'origine de l'enrôlement
	 * @param data.activationUrl Lien d'activation à usage unique
	 * @param data.expiresInHours Durée de validité du lien
	 * @param channels Canaux demandés
	 * @returns Les canaux par lesquels le message est réellement parti
	 */
	static async merchantActivationNotify(
		data: {
			email: string;
			contact?: string;
			name: string;
			shopName?: string;
			commercialName?: string;
			activationUrl: string;
			expiresInHours?: number;
		},
		channels: { email?: boolean; sms?: boolean } = { email: true, sms: true }
	): Promise<{ sent: string[]; errors: Record<string, any> }> {
		const sent: string[] = [];
		const errors: Record<string, any> = {};

		if (channels.email !== false && data.email) {
			try {
				// `send()` ne lève pas sur un échec d'envoi : il renvoie `{ success: false }`. Seul
				// `init()` peut lever (configuration SMTP absente), d'où le try/catch en plus du test.
				const result = await emailService.send({
					category: NotificationCategory.INFO,
					type: NotificationType.EMAIL,
					to: data.email,
					// `EmailService.send` lit le nom dans `data.userName` (et non `data.name`).
					data: {
						userName: data.name
					},
					template: MessageTypes.TYPES.MERCHANT_ACTIVATION,
					templateData: {
						activationUrl: data.activationUrl,
						shopName: data.shopName,
						commercialName: data.commercialName,
						expiresInHours: data.expiresInHours ?? 72
					}
				});

				if (result?.success) {
					sent.push('email');
				} else {
					errors.email = result?.error ?? result?.message ?? 'Envoi e-mail impossible';
				}
			} catch (error) {
				errors.email = error;
			}
		}

		if (channels.sms !== false && data.contact) {
			try {
				// Le canal n'est utilisé que s'il est réellement configuré : sans cela on annoncerait
				// au commercial un SMS parti alors que rien n'a quitté le serveur.
				const available = await smsService.isAvailable();

				if (!available) {
					errors.sms = 'Service SMS non configuré';
				} else {
					const result = await smsService.send({
						category: NotificationCategory.INFO,
						type: NotificationType.SMS,
						to: data.contact,
						data: {
							message: MessageTypes.getSmsTemplate(MessageTypes.TYPES.MERCHANT_ACTIVATION, data.activationUrl)
						}
					});

					if (result?.success) {
						sent.push('sms');
					} else {
						errors.sms = result?.error ?? result?.message ?? 'Envoi SMS impossible';
					}
				}
			} catch (error) {
				errors.sms = error;
			}
		}

		return { sent, errors };
	}

	static async deleteAccountClientNotify(data: any) {
		try {
			await emailService.send({
				category: NotificationCategory.INFO,
				type: NotificationType.EMAIL,
				to: data.email,
				data: {
					name: data.firstname + ' ' + data.lastname,
				},
				template: MessageTypes.TYPES.ACCOUNT_DELETED,
				templateData: {
					date: new Date().toLocaleString(),
					ip: data.ip,
					device: data.userAgent,
					location: data.userAgent,
				}
			});
		} catch (error) {
			return { success: false, error };
		}
	}
}
