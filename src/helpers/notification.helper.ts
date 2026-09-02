import coddyger, { LoggerService, LogLevel } from 'coddyger';
// Les énumérations viennent du fichier d'interfaces, sans dépendance : passer par le barrel
// `../services/notification` chargerait PushService, donc `main` puis `router`, donc toutes les
// routes — un cycle, depuis un helper importé par ces mêmes routes.
import { NotificationCategory, NotificationType } from '../services/notification/notification.interface';
import type { NotificationService } from '../modules/notification/notification.service';

const helperLabel = 'NotificationHelper';

/**
 * Notifications « cloche » destinées aux comptes administrateurs (dont les commerciaux).
 *
 * À ne pas confondre avec `MessageHelper`, qui pousse vers l'extérieur (e-mail, SMS, push). Ici on
 * se contente de **persister** la notification : elle est lue par `GET /notifications/me`.
 *
 * Point d'attention : ne pas passer par `NotificationService.send()`, qui bascule le document en
 * `status: 'sent'` après acheminement — une notification purement interne naîtrait alors déjà
 * « lue » côté front. `create()` la laisse en `status: 'active'` et `isRead: false`.
 */
export class NotificationHelper {
	// Instanciation paresseuse : ce helper est importé depuis des contrôleurs qui font eux-mêmes
	// partie du graphe d'imports du module notification. Construire le service au chargement du
	// module le résoudrait alors qu'il n'est pas encore initialisé (`n'est pas un constructeur`).
	// Même précaution que dans `PasswordResetTokenHelper`.
	private static service: NotificationService | null = null;

	private static getService(): NotificationService {
		if (!NotificationHelper.service) {
			// `require` différé, à l'image de `TokenMiddleware.can` : la résolution n'a lieu qu'au
			// premier envoi, une fois tous les modules chargés.
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { NotificationService } = require('../modules/notification/notification.service');
			NotificationHelper.service = new NotificationService();
		}

		return NotificationHelper.service!;
	}

	/**
	 * Dépose une notification dans la cloche d'un compte admin.
	 *
	 * L'échec est journalisé mais jamais propagé : une notification manquée ne doit pas faire
	 * échouer l'action métier qui l'a déclenchée (un enrôlement réussi le reste).
	 *
	 * @param payload.to Identifiant du destinataire (admin). Déduit côté serveur, jamais du client.
	 * @param payload.title Titre affiché dans la cloche
	 * @param payload.message Corps du message
	 * @param payload.category INFO | SUCCESS | WARNING | ERROR — pilote la pastille côté front
	 * @param payload.metadata Données de navigation au clic (type, ids…)
	 */
	static async notifyAdminInApp(payload: {
		to: any;
		title: string;
		message: string;
		category?: NotificationCategory;
		metadata?: any;
	}): Promise<void> {
		try {
			if (!payload?.to) {
				return;
			}

			await NotificationHelper.getService().create({
				_id: coddyger.string.generateObjectId(),
				// Le schéma exige un `type` ; `PUSH` est le canal neutre pour une notification
				// interne. Le front affiche `category` en priorité, donc c'est bien INFO/SUCCESS
				// qui remonte à l'utilisateur.
				type: NotificationType.PUSH,
				category: payload.category ?? NotificationCategory.INFO,
				// `to` doit rester une chaîne : `getUserNotifications` filtre sur `{ to: userId }`
				// avec un identifiant issu du jeton, donc une chaîne. Un ObjectId ne matcherait pas.
				to: String(payload.to),
				data: {
					title: payload.title,
					message: payload.message,
					data: payload.metadata
				},
				status: 'active',
				isRead: false
			} as any);
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: helperLabel,
				method: 'notifyAdminInApp'
			});
		}
	}

	/**
	 * Diffuse une notification à tous les super-administrateurs (profil disposant de manage/all),
	 * en excluant éventuellement l'auteur de l'action (déjà notifié par ailleurs).
	 * Permet à l'admin de suivre l'activité (ex. un marchand enrôlé par un commercial).
	 */
	static async notifySuperAdmins(payload: {
		title: string;
		message: string;
		category?: NotificationCategory;
		metadata?: any;
		exclude?: any;
	}): Promise<void> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const mongoose = require('mongoose');
			const Profile = mongoose.model('Profile');
			const Admin = mongoose.model('Admin');

			const superProfiles = await Profile.find(
				{ 'ability.subject': 'all', 'ability.action': 'manage', status: { $ne: 'removed' } },
				{ _id: 1 }
			);
			const profileIds = superProfiles.map((p: any) => p._id);
			if (profileIds.length === 0) return;

			const admins = await Admin.find(
				{ profile: { $in: profileIds }, status: { $ne: 'removed' } },
				{ _id: 1 }
			);

			const excludeId = payload.exclude ? String(payload.exclude) : null;

			for (const admin of admins) {
				if (excludeId && String(admin._id) === excludeId) continue;

				await NotificationHelper.notifyAdminInApp({
					to: admin._id,
					title: payload.title,
					message: payload.message,
					category: payload.category,
					metadata: payload.metadata
				});
			}
		} catch (error) {
			LoggerService.log({
				type: LogLevel.Error,
				content: error,
				location: helperLabel,
				method: 'notifySuperAdmins'
			});
		}
	}
}
