import coddyger, { IErrorObject, defines } from 'coddyger';
import { MediaModerationService } from './media-moderation.service';

const controllerLabel = 'MediaModerationController';

/** Revue admin des médias modérés (scores de confiance, validation / rejet). */
export class MediaModerationController {
	private readonly service = new MediaModerationService();

	list(payloads: { status?: string; page?: number; pageSize?: number }) {
		return new Promise(async (resolve, reject) => {
			try {
				const items = await this.service.list(payloads);
				// Convention des listes : pagination dans `message`, lignes dans `data`.
				resolve({ status: defines.status.requestOK, message: items.data, data: items.rows });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
	}

	stats() {
		return new Promise(async (resolve, reject) => {
			try {
				resolve({ status: defines.status.requestOK, message: 'Statistiques', data: await this.service.stats() });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'stats'));
	}

	preview(id: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!coddyger.string.isValidObjectId(id)) {
					return resolve({ status: defines.status.badRequest, message: 'Identifiant invalide', data: null });
				}
				const url = await this.service.previewUrl(id);
				resolve(
					url
						? { status: defines.status.requestOK, message: 'Aperçu', data: { url } }
						: { status: defines.status.notFound, message: 'Fichier introuvable', data: null }
				);
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'preview'));
	}

	review(id: string, action: 'approve' | 'reject', adminId: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!coddyger.string.isValidObjectId(id)) {
					return resolve({ status: defines.status.badRequest, message: 'Identifiant invalide', data: null });
				}
				const doc = await this.service.review(id, action, adminId);
				resolve(
					doc
						? {
								status: defines.status.requestOK,
								message: action === 'approve' ? 'Média approuvé : il est de nouveau visible.' : 'Média rejeté et supprimé.',
								data: doc
							}
						: { status: defines.status.notFound, message: 'Média introuvable', data: null }
				);
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'review'));
	}

	rescan(id: string) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!coddyger.string.isValidObjectId(id)) {
					return resolve({ status: defines.status.badRequest, message: 'Identifiant invalide', data: null });
				}
				const doc = await this.service.rescan(id);
				resolve(
					doc
						? { status: defines.status.requestOK, message: 'Analyse relancée', data: doc }
						: { status: defines.status.notFound, message: 'Média introuvable', data: null }
				);
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'rescan'));
	}
}
