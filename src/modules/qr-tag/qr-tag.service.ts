import coddyger, { LoggerService, LogLevel } from 'coddyger';
import { randomCode } from '../../helpers/code-generator';
import { QrTagModel, QrTagBatchModel } from './qr-tag.model';
import { IQrTag, IQrTagBatch, QrTagStatus } from './qr-tag.interface';
import { PartnerSet } from '../partner/partner.model';

const serviceLabel = 'QrTagService';

/** Longueur de la partie aléatoire du code imprimé. */
const CODE_LENGTH = 8;
/** Taille maximale d'un lot (impression). */
export const QR_BATCH_MAX = 2000;

/** Base de l'URL encodée dans le QR (résolution côté app). Repli sur l'app Pro, puis chaîne vide. */
const qrPublicBase = (): string =>
	(process.env.QR_PUBLIC_BASE || process.env.PRO_APP_URL || '').trim().replace(/\/+$/, '');

export class QrTagService {
	private readonly partners = new PartnerSet();

	/** Valeur encodée dans le QR du sticker (URL de résolution, ou le code brut si base non configurée). */
	qrValue(code: string): string {
		const base = qrPublicBase();
		return base ? `${base}/q/${code}` : code;
	}

	/** Codes uniques `PRÉFIXE-XXXXXXXX`, vérifiés contre la base avant insertion. */
	private async generateCodes(count: number, prefix?: string): Promise<string[]> {
		const p = (prefix || 'YQ').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'YQ';
		const result = new Set<string>();

		for (let round = 0; round < 12 && result.size < count; round++) {
			const candidates: string[] = [];
			while (candidates.length < count - result.size) candidates.push(`${p}-${randomCode(CODE_LENGTH)}`);

			const taken: any[] = await QrTagModel.find({ code: { $in: candidates } }, 'code').lean();
			const takenSet = new Set(taken.map((t: any) => t.code));
			for (const c of candidates) if (!takenSet.has(c)) result.add(c);
		}

		if (result.size < count) throw new Error('Impossible de générer des codes uniques, réessayez.');
		return [...result].slice(0, count);
	}

	/** Produit un lot de stickers vierges. */
	async generateBatch(
		input: { label: string; count: number; prefix?: string },
		adminId?: string
	): Promise<{ batch: IQrTagBatch; codes: string[] } | { error: string }> {
		const label = String(input.label ?? '').trim();
		const count = Number(input.count);

		if (!label) return { error: 'Le libellé du lot est requis.' };
		if (!Number.isInteger(count) || count < 1 || count > QR_BATCH_MAX) {
			return { error: `Le lot doit compter entre 1 et ${QR_BATCH_MAX} stickers.` };
		}

		const codes = await this.generateCodes(count, input.prefix);

		const batch: IQrTagBatch = {
			_id: coddyger.string.generateObjectId(),
			label,
			prefix: input.prefix ? String(input.prefix).trim() : undefined,
			count: codes.length,
			createdBy: adminId
		};
		await QrTagBatchModel.create(batch as any);
		await QrTagModel.insertMany(
			codes.map((code) => ({
				_id: coddyger.string.generateObjectId(),
				code,
				batch: batch._id,
				boutique: null,
				status: 'vierge' as QrTagStatus,
				createdBy: adminId
			}))
		);

		return { batch, codes };
	}

	/** Liste paginée des stickers (filtre statut, lot, recherche par code). */
	async list(payload: { page?: number; pageSize?: number; q?: string; status?: string; batch?: string }): Promise<any> {
		const page = Math.max(1, Number(payload.page) || 1);
		const pageSize = Math.min(2000, Math.max(1, Number(payload.pageSize) || 50));
		const params: any = {};

		if (payload.status && ['vierge', 'affecte', 'desactive'].includes(payload.status)) params.status = payload.status;
		if (payload.batch && coddyger.string.isValidObjectId(payload.batch)) params.batch = payload.batch;
		if (payload.q && payload.q.trim()) params.code = { $regex: payload.q.trim(), $options: 'i' };

		const [rows, totalRows] = await Promise.all([
			QrTagModel.find(params)
				.sort({ createdAt: -1 })
				.skip((page - 1) * pageSize)
				.limit(pageSize)
				.populate({ path: 'boutique', select: 'name ville status' })
				.lean(),
			QrTagModel.countDocuments(params)
		]);

		const data = rows.map((t: any) => ({ ...t, qrValue: this.qrValue(t.code) }));
		const totalPages = Math.ceil(totalRows / pageSize);
		return { rows: data, totalRows, totalPages, countRowsPerPage: pageSize, page };
	}

	/** Lots, du plus récent au plus ancien, avec le décompte par statut. */
	async listBatches(): Promise<any[]> {
		const batches: any[] = await QrTagBatchModel.find().sort({ createdAt: -1 }).lean();
		if (!batches.length) return [];

		const counts: any[] = await QrTagModel.aggregate([
			{ $match: { batch: { $in: batches.map((b: any) => b._id) } } },
			{ $group: { _id: { batch: '$batch', status: '$status' }, n: { $sum: 1 } } }
		]);

		const byBatch: Record<string, any> = {};
		for (const c of counts) {
			const key = String(c._id.batch);
			byBatch[key] = byBatch[key] || { vierge: 0, affecte: 0, desactive: 0 };
			byBatch[key][c._id.status] = c.n;
		}

		return batches.map((b: any) => ({ ...b, stats: byBatch[String(b._id)] || { vierge: 0, affecte: 0, desactive: 0 } }));
	}

	/** Retrouve un sticker par son id ou son code. */
	private async findTag(idOrCode: string): Promise<any | null> {
		const by = coddyger.string.isValidObjectId(idOrCode) ? { _id: idOrCode } : { code: String(idOrCode ?? '').trim() };
		return QrTagModel.findOne(by).lean();
	}

	/** Affecte un sticker à une boutique (au moment de l'enrôlement, sur place). */
	async assign(
		idOrCode: string,
		boutiqueId: string,
		adminId?: string,
		opts?: { reassign?: boolean }
	): Promise<{ ok: true; tag: any } | { ok: false; status: number; message: string }> {
		const tag = await this.findTag(idOrCode);
		if (!tag) return { ok: false, status: 404, message: 'Ce code QR est introuvable.' };
		if (tag.status === 'desactive') return { ok: false, status: 409, message: 'Ce code QR est désactivé.' };
		if (!coddyger.string.isValidObjectId(boutiqueId)) return { ok: false, status: 400, message: 'Boutique invalide.' };

		if (tag.status === 'affecte' && String(tag.boutique) !== String(boutiqueId) && !opts?.reassign) {
			return { ok: false, status: 409, message: 'Ce code QR est déjà affecté à une autre boutique.' };
		}

		const boutique: any = await this.partners.selectOne(
			{ _id: boutiqueId, status: { $nin: ['removed', 'archived'] } },
			'name ville status'
		);
		if (!boutique || boutique.error) return { ok: false, status: 404, message: "Cette boutique n'existe pas." };

		await QrTagModel.updateOne(
			{ _id: tag._id },
			{ $set: { boutique: boutiqueId, status: 'affecte', assignedBy: adminId ?? null, assignedAt: new Date(), deactivatedAt: null } }
		);
		const updated: any = await QrTagModel.findById(tag._id).populate({ path: 'boutique', select: 'name ville status' }).lean();
		return { ok: true, tag: { ...updated, qrValue: this.qrValue(updated.code) } };
	}

	/** Détache un sticker de sa boutique (redevient vierge, réutilisable). */
	async unassign(id: string): Promise<{ ok: boolean; status?: number; message?: string }> {
		if (!coddyger.string.isValidObjectId(id)) return { ok: false, status: 400, message: 'Identifiant invalide.' };
		const res = await QrTagModel.updateOne(
			{ _id: id, status: { $ne: 'desactive' } },
			{ $set: { boutique: null, status: 'vierge', assignedBy: null, assignedAt: null } }
		);
		if (!res.matchedCount) return { ok: false, status: 404, message: 'Code QR introuvable ou désactivé.' };
		return { ok: true };
	}

	/** Active/désactive un sticker (perte, réimpression). */
	async setActive(id: string, active: boolean): Promise<{ ok: boolean; status?: number; message?: string }> {
		if (!coddyger.string.isValidObjectId(id)) return { ok: false, status: 400, message: 'Identifiant invalide.' };
		const set = active
			? { status: 'vierge', deactivatedAt: null, boutique: null, assignedBy: null, assignedAt: null }
			: { status: 'desactive', deactivatedAt: new Date() };
		const res = await QrTagModel.updateOne({ _id: id }, { $set: set });
		if (!res.matchedCount) return { ok: false, status: 404, message: 'Code QR introuvable.' };
		return { ok: true };
	}

	/**
	 * Résout un code scanné → boutique cible. Utilisé par l'app cliente : le résultat se comporte
	 * ensuite comme le scan d'un QR de boutique classique (le `boutiqueId` alimente le flux redeem).
	 */
	async resolve(code: string): Promise<
		| { status: 'affecte'; boutiqueId: string; boutique: any }
		| { status: 'vierge' | 'desactive' | 'inconnu' }
	> {
		const tag = await QrTagModel.findOne({ code: String(code ?? '').trim() })
			.populate({ path: 'boutique', select: 'name ville status thumbnail' })
			.lean();

		if (!tag) return { status: 'inconnu' };
		if (tag.status === 'desactive') return { status: 'desactive' };
		if (tag.status !== 'affecte' || !tag.boutique) return { status: 'vierge' };

		const boutique: any = tag.boutique;
		if (['removed', 'archived'].includes(boutique.status)) return { status: 'desactive' };

		return { status: 'affecte', boutiqueId: String(boutique._id), boutique };
	}
}

export const qrTagService = new QrTagService();
