import coddyger, { IErrorObject, defines } from 'coddyger';
import { PartnerEngagementService } from './partner-engagement.service';

const controllerLabel: string = 'PartnerEngagementController';
const COMMENT_MAX_LENGTH = 500;

export class PartnerEngagementController {
  private readonly service: PartnerEngagementService;

  constructor() {
    this.service = new PartnerEngagementService();
  }

  /** POST /partners/:id/like — toggle. */
  toggleLike(partnerId: string, userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }
        if (!userId) {
          return resolve({ status: defines.status.badRequest, message: 'Utilisateur non identifié.', data: null });
        }
        if (!(await this.service.partnerExists(partnerId))) {
          return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
        }
        const data = await this.service.toggleLike(partnerId, userId);
        resolve({ status: defines.status.requestOK, message: data.liked ? 'Boutique aimée.' : 'Like retiré.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'toggleLike'));
  }

  /** GET /partners/:id/engagement. */
  engagement(partnerId: string, userId?: string | null) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }
        if (!(await this.service.partnerExists(partnerId))) {
          return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
        }
        const data = await this.service.getEngagement(partnerId, userId);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'engagement'));
  }

  /** GET /partners/:id/comments. */
  listComments(partnerId: string, page: number, limit: number) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }
        if (!(await this.service.partnerExists(partnerId))) {
          return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
        }
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
        const data = await this.service.getComments(partnerId, safePage, safeLimit);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listComments'));
  }

  /** POST /partners/:id/comments. */
  addComment(partnerId: string, userId: string, text: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }
        if (!userId) {
          return resolve({ status: defines.status.badRequest, message: 'Utilisateur non identifié.', data: null });
        }
        const value = typeof text === 'string' ? text.trim() : '';
        if (value.length === 0) {
          return resolve({ status: defines.status.badRequest, message: 'Le commentaire ne peut pas être vide.', data: null });
        }
        if (value.length > COMMENT_MAX_LENGTH) {
          return resolve({ status: defines.status.badRequest, message: `Le commentaire ne peut pas dépasser ${COMMENT_MAX_LENGTH} caractères.`, data: null });
        }
        if (!(await this.service.partnerExists(partnerId))) {
          return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
        }
        const comment = await this.service.addComment(partnerId, userId, value);
        resolve({ status: defines.status.requestOK, message: 'Commentaire publié.', data: { comment } });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'addComment'));
  }

  /** POST /partners/:id/share. */
  share(partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }
        if (!(await this.service.partnerExists(partnerId))) {
          return resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null });
        }
        const data = await this.service.share(partnerId);
        resolve({ status: defines.status.requestOK, message: 'Partage enregistré.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'share'));
  }
}
