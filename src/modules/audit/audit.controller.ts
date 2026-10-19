import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { AuditService } from './audit.service';

const controllerLabel = 'AuditController';

export class AuditController {
	private readonly service = new AuditService();

	/** Liste paginée + filtrée du journal d'audit (admin). */
	list(payloads: { page?: number; pageSize?: number; subject?: string; method?: string; success?: string; q?: string; from?: string; to?: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const result: any = await this.service.list(payloads);
				if (result.error) throw result;
				const { rows, ...meta } = result;
				// Convention projet : métadonnées de pagination dans `message`, lignes dans `data`.
				resolve({ status: defines.status.requestOK, message: meta, data: rows });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
	}

	/** Domaines distincts (pour le filtre). */
	subjects() {
		return new Promise(async (resolve, reject) => {
			try {
				const data = await this.service.subjects();
				resolve({ status: defines.status.requestOK, message: locale.controller.done, data });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'subjects'));
	}
}
