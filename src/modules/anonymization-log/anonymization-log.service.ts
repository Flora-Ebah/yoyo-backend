import coddyger, { IData, LoggerService, LogLevel } from 'coddyger';
import { IAnonymizationLog } from './anonymization-log.interface';
import { AnonymizationLogSet } from './anonymization-log.model';

export class AnonymizationLogService {
  private readonly dao: IData<IAnonymizationLog>;
  private readonly serviceLabel = 'AnonymizationLogService';

  constructor() {
    this.dao = new AnonymizationLogSet();
  }

  /**
   * Enregistre un acte d'anonymisation. Best-effort : une erreur d'écriture du journal ne doit
   * jamais faire échouer l'anonymisation elle-même (l'appelant ignore le retour en cas d'échec).
   */
  async record(entry: { clientId: string; trigger: 'cron' | 'admin'; performedBy?: any }): Promise<{ error: boolean }> {
    try {
      const doc: IAnonymizationLog = {
        _id: coddyger.string.generateObjectId(),
        clientId: entry.clientId,
        trigger: entry.trigger,
        performedBy: entry.performedBy,
        status: 'active'
      };

      const result: any = await this.dao.save(doc);
      if (result && result.error) {
        throw result;
      }
      return { error: false };
    } catch (error) {
      LoggerService.log({ type: LogLevel.Error, content: error, location: this.serviceLabel, method: 'record' });
      return { error: true };
    }
  }

  /** Liste paginée du journal (administration). */
  async list(payloads: { page?: number; pageSize?: number }): Promise<any> {
    return this.dao.select({ page: payloads.page, pageSize: payloads.pageSize, params: { status: { $ne: 'removed' } } });
  }
}
