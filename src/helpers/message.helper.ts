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
