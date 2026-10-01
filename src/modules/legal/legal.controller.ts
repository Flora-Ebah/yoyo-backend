import coddyger, { IErrorObject, defines } from 'coddyger';
import { LegalService } from './legal.service';
import { ILegal } from './legal.interface';

const controllerLabel: string = 'LegalController';

export class LegalController {
	private readonly service: LegalService;

	constructor() {
		this.service = new LegalService();
	}

	/** Liste publique des pages légales publiées. */
	list() {
		return new Promise(async (resolve, reject) => {
			try {
				const data = await this.service.listPublic();
				resolve({ status: defines.status.requestOK, message: 'OK', data });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
	}

	/** Lecture publique d'une page légale par slug. 404 si inconnue ou non publiée. */
	get(slug: string) {
		return new Promise(async (resolve, reject) => {
			try {
				const data = await this.service.getPublic(slug);
				if (!data) {
					resolve({ status: defines.status.notFound, message: 'Page légale introuvable.', data: null });
					return;
				}
				resolve({ status: defines.status.requestOK, message: 'OK', data });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'get'));
	}

	/** Upsert admin d'une page légale. */
	upsert(slug: string, item: Partial<ILegal>) {
		return new Promise(async (resolve, reject) => {
			try {
				const contentType = (item as any)?.contentType ?? 'sections';
				if (contentType === 'sections') {
					if (!Array.isArray((item as any)?.sections) || (item as any).sections.length === 0) {
						resolve({
							status: defines.status.badRequest,
							message: 'Le champ "sections" est requis lorsque contentType vaut "sections".',
							data: null
						});
						return;
					}
				} else if (coddyger.string.isEmpty((item as any)?.content)) {
					resolve({
						status: defines.status.badRequest,
						message: 'Le champ "content" est requis pour ce contentType.',
						data: null
					});
					return;
				}
				const data = await this.service.upsert(slug, item);
				resolve({ status: defines.status.requestOK, message: 'Page légale enregistrée.', data });
			} catch (error) {
				reject(error);
			}
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'upsert'));
	}
}
