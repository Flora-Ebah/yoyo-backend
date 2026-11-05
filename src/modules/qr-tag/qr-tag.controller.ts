import coddyger, { IErrorObject, defines } from 'coddyger';
import { qrTagService } from './qr-tag.service';

const controllerLabel = 'QrTagController';
const ok = (message: string, data: any) => ({ status: defines.status.requestOK, message, data });
const bad = (message: string, status = defines.status.badRequest) => ({ status, message, data: null });

export class QrTagController {
	/** Génère un lot de stickers vierges. */
	generateBatch(input: { label: string; count: number; prefix?: string }, adminId?: string) {
		return new Promise(async (resolve) => {
			const res: any = await qrTagService.generateBatch(input, adminId);
			if (res.error) return resolve(bad(res.error));
			resolve({ status: defines.status.created, message: `${res.codes.length} QR générés.`, data: res });
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'generateBatch'));
	}

	list(payload: { page?: number; pageSize?: number; q?: string; status?: string; batch?: string }) {
		return new Promise(async (resolve) => {
			const data: any = await qrTagService.list(payload);
			const rows = data.rows;
			delete data.rows;
			resolve({ status: defines.status.requestOK, message: data, data: rows });
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
	}

	listBatches() {
		return new Promise(async (resolve) => {
			resolve(ok('OK', await qrTagService.listBatches()));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'listBatches'));
	}

	assign(payload: { code?: string; id?: string; boutiqueId: string; reassign?: boolean }, adminId?: string) {
		return new Promise(async (resolve) => {
			const key = payload.id || payload.code || '';
			const res: any = await qrTagService.assign(key, payload.boutiqueId, adminId, { reassign: payload.reassign });
			if (!res.ok) return resolve(bad(res.message, res.status));
			resolve(ok('QR affecté à la boutique.', res.tag));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'assign'));
	}

	claim(payload: { code?: string; id?: string; boutiqueId: string }, userId: string) {
		return new Promise(async (resolve) => {
			const key = payload.id || payload.code || '';
			const res: any = await qrTagService.claim(key, payload.boutiqueId, userId);
			if (!res.ok) return resolve(bad(res.message, res.status));
			resolve(ok('Sticker affecté à votre boutique.', res.tag));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'claim'));
	}

	unassign(id: string) {
		return new Promise(async (resolve) => {
			const res: any = await qrTagService.unassign(id);
			if (!res.ok) return resolve(bad(res.message!, res.status));
			resolve(ok('QR détaché. Il redevient disponible.', null));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'unassign'));
	}

	setActive(id: string, active: boolean) {
		return new Promise(async (resolve) => {
			const res: any = await qrTagService.setActive(id, active);
			if (!res.ok) return resolve(bad(res.message!, res.status));
			resolve(ok(active ? 'QR réactivé.' : 'QR désactivé.', null));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'setActive'));
	}

	resolve(code: string) {
		return new Promise(async (resolve) => {
			const res = await qrTagService.resolve(code);
			if (res.status === 'affecte') return resolve(ok('OK', res));
			if (res.status === 'inconnu') return resolve(bad('Code QR inconnu.', defines.status.notFound));
			if (res.status === 'desactive') return resolve(bad('Ce code QR est désactivé.', defines.status.badRequest));
			// vierge : connu mais pas encore rattaché à une boutique.
			return resolve(bad("Ce QR n'est pas encore affecté à une boutique.", defines.status.badRequest));
		}).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'resolve'));
	}
}
