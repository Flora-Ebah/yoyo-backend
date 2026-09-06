import coddyger, { IErrorObject, defines } from 'coddyger';
import { AnonymizationLogService } from './anonymization-log.service';

const controllerLabel: string = 'AnonymizationLogController';

export class AnonymizationLogController {
  private readonly service: AnonymizationLogService;

  constructor() {
    this.service = new AnonymizationLogService();
  }

  /**
   * Liste paginée du journal d'anonymisation (administration).
   * Suit le contrat de liste du projet : métadonnées de pagination dans `message`, lignes dans `data`.
   */
  list(payloads: { page?: number; pageSize?: number }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.list(payloads);
        if (result && result.error) {
          throw result;
        }

        resolve({
          status: defines.status.requestOK,
          message: {
            totalRows: result.totalRows,
            totalPages: result.totalPages,
            countRowsPerPage: result.countRowsPerPage,
            totalPagesPerQuery: result.totalPagesPerQuery
          },
          data: result.rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'list');
    });
  }
}
