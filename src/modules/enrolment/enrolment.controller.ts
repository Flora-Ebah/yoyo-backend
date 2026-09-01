import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { EnrolmentService } from './enrolment.service';

const controllerLabel: string = 'EnrolmentController';

export class EnrolmentController {
  private readonly service: EnrolmentService;

  constructor() {
    this.service = new EnrolmentService();
  }

  /**
   * Liste des enrôlements
   *
   * `commercialId` est arbitré par la route : sur `scope=me` le serveur impose l'admin appelant et
   * ignore ce que le client a envoyé. Le contrôleur ne fait que consommer la valeur déjà décidée.
   *
   * @param payloads Filtres et pagination
   */
  list(payloads: {
    commercialId?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.list(payloads);

        resolve({
          status: defines.status.requestOK,
          message: items.data,
          data: items.rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'list');
    });
  }

  /**
   * Récapitulatif des enrôlements par commercial
   * @param payloads Bornes de période
   */
  summary(payloads: { from?: string; to?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const data: any = await this.service.summary(payloads);

        if (data.error) {
          return reject(data);
        }

        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'summary');
    });
  }
}
