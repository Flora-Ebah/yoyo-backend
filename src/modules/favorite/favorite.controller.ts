import coddyger, { IErrorObject, defines } from 'coddyger';
import { FavoriteService } from './favorite.service';
import { PartnerService } from '../partner/partner.service';

const controllerLabel: string = 'FavoriteController';

export class FavoriteController {
  private readonly service: FavoriteService;
  private readonly partnerService: PartnerService;

  constructor() {
    this.service = new FavoriteService();
    this.partnerService = new PartnerService();
  }

  /** Toggle du favori de l'utilisateur courant sur une boutique. */
  toggle(partnerId: string, userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!userId) {
          return resolve({ status: defines.status.badRequest, message: 'Utilisateur manquant.', data: null });
        }
        if (!partnerId || !coddyger.string.isValidObjectId(partnerId)) {
          return resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null });
        }

        const partner: any = await this.partnerService.getById(partnerId);
        if (!partner || partner.error) {
          return resolve({ status: defines.status.notFound, message: "Boutique introuvable.", data: null });
        }

        const result = await this.service.toggle(partnerId, userId);
        resolve({
          status: defines.status.requestOK,
          message: result.favorited ? 'Boutique ajoutée aux favoris.' : 'Boutique retirée des favoris.',
          data: result
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'toggle'));
  }

  /** Liste des boutiques favorites de l'utilisateur courant (objets Partner complets). */
  listForUser(userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!userId) {
          return resolve({ status: defines.status.badRequest, message: 'Utilisateur manquant.', data: null });
        }
        const data = await this.service.listForUser(userId);
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listForUser'));
  }
}
