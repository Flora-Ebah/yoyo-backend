import coddyger, { IErrorObject, defines } from 'coddyger';
import { InfluencerSet } from './influencer.model';
import { ClientSet } from '../client/client.model';

const controllerLabel: string = 'InfluencerClientsController';

/**
 * Contrôleur dédié (fichier neuf) : liste des clients ramenés par un influenceur.
 *
 * Volontairement isolé de `influencer.controller.ts` pour un déploiement fiable sur dev
 * (les fichiers existants modifiés n'étaient pas toujours recompilés). Réutilise la même
 * logique que `InfluencerService.getStats` : on résout le code de l'influenceur, puis on
 * récupère les clients dont `influencerCode` correspond.
 */
export class InfluencerClientsController {
  private readonly influencerDao: InfluencerSet;

  constructor() {
    this.influencerDao = new InfluencerSet();
  }

  list(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const inf: any = await this.influencerDao.selectOne({ _id: id, status: { $nin: ['removed', 'archived'] } });
        if (!inf || inf.error) {
          resolve({ status: defines.status.requestNotFound, message: 'Influenceur introuvable.', data: [] });
          return;
        }

        const clientDao = new ClientSet();
        const clients: any = await clientDao.selectHug({
          influencerCode: inf.code,
          status: { $nin: ['removed', 'anonymized'] }
        });

        const rows = (Array.isArray(clients) ? clients : []).map((c: any) => ({
          _id: c._id,
          firstname: c.firstname ?? '',
          lastname: c.lastname ?? '',
          email: c.email ?? '',
          contact: c.contact ?? '',
          isPartner: !!c.isPartner,
          status: c.status,
          createdAt: c.createdAt
        }));

        resolve({ status: defines.status.requestOK, message: 'OK', data: rows });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
  }
}
