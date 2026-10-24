import { promises as fs } from 'fs';
import coddyger, { LoggerService, LogLevel } from 'coddyger';
import { MediaModerationSet } from './media-moderation.model';
import { IMediaModeration } from './media-moderation.interface';
import { ClientSet } from '../client/client.model';
import { storage } from '../../services/storage/storage.service';
import { extractFrame } from '../../helpers/video.helper';
import {
	detectModerationLabels,
	isModerationEnabled,
	ModerationLabel,
	REKOGNITION_MAX_BYTES
} from '../../services/moderation/rekognition.service';
import { blockedMedia, decideModeration, ModerationStatus } from '../../services/moderation/moderation-policy';

const serviceLabel = 'MediaModerationService';

/** Types d'image que Rekognition lit tels quels ; les autres (WebP…) sont convertis en JPEG. */
const NATIVE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export interface ModerationVerdict {
	status: ModerationStatus;
	labels: ModerationLabel[];
	maxConfidence: number;
	note?: string;
}

/**
 * Modération des médias envoyés : analyse avant enregistrement, journal des décisions, registre
 * des fichiers bloqués et revue par l'admin.
 */
export class MediaModerationService {
	private readonly dao = new MediaModerationSet();
	private readonly clients = new ClientSet();

	/** Charge en mémoire les fichiers à ne pas servir (appelé au démarrage, après la connexion base). */
	async warmup(): Promise<void> {
		const rows: any = await this.dao.selectHug({ status: { $in: ['flagged', 'rejected'] } });
		if (!Array.isArray(rows)) return;
		const keys: string[] = [];
		rows.forEach((r: any) => {
			if (r.fileName) keys.push(r.fileName);
			if (r.posterName) keys.push(r.posterName);
		});
		blockedMedia.reset(keys);
	}

	/**
	 * Analyse un fichier temporaire (multer) AVANT son enregistrement.
	 * Ne lève jamais : sans configuration AWS ou en cas d'erreur, le média est accepté en
	 * `unchecked` (l'upload ne doit pas régresser) et reste visible dans l'admin pour revue.
	 * @param duration Durée (s) pour une vidéo : trois images y sont prélevées (10 %, 50 %, 90 %)
	 */
	async analyze(file: { path: string; size: number }, contentType: string, duration?: number): Promise<ModerationVerdict> {
		if (!isModerationEnabled()) {
			return { status: 'unchecked', labels: [], maxConfidence: 0, note: 'Modération désactivée (MODERATION_ENABLED)' };
		}

		const temps: string[] = [];
		try {
			const images: Buffer[] = [];
			if (duration !== undefined) {
				for (const ratio of [0.1, 0.5, 0.9]) {
					const out = `${file.path}-mod-${Math.round(ratio * 100)}.jpg`;
					temps.push(out);
					await extractFrame(file.path, out, duration * ratio);
					images.push(await fs.readFile(out));
				}
			} else if (NATIVE_TYPES.includes(contentType) && file.size <= REKOGNITION_MAX_BYTES) {
				images.push(await fs.readFile(file.path));
			} else {
				const out = `${file.path}-mod.jpg`;
				temps.push(out);
				await extractFrame(file.path, out);
				images.push(await fs.readFile(out));
			}

			return await this.analyzeBuffers(images);
		} catch (error: any) {
			LoggerService.log({
				type: LogLevel.Error,
				content: `Analyse de modération impossible : ${error?.name ?? ''} ${error?.message ?? error}`,
				location: serviceLabel,
				method: 'analyze'
			});
			return { status: 'unchecked', labels: [], maxConfidence: 0, note: `Analyse impossible : ${error?.name || error?.message || 'erreur'}` };
		} finally {
			await Promise.all(temps.map((t) => fs.rm(t, { force: true })));
		}
	}

	/** Analyse une ou plusieurs images et retient le verdict le plus sévère. */
	private async analyzeBuffers(images: Buffer[]): Promise<ModerationVerdict> {
		const labels: ModerationLabel[] = [];
		for (const bytes of images) {
			labels.push(...(await detectModerationLabels(bytes)));
		}
		// Un même libellé peut sortir sur plusieurs images : on garde sa confiance maximale.
		const merged = new Map<string, ModerationLabel>();
		labels.forEach((l) => {
			const prev = merged.get(l.name);
			if (!prev || prev.confidence < l.confidence) merged.set(l.name, l);
		});
		const all = [...merged.values()].sort((a, b) => b.confidence - a.confidence);
		const decision = decideModeration(all);
		return { status: decision.status, labels: all, maxConfidence: decision.score };
	}

	/** Enregistre la décision et tient le registre des fichiers bloqués à jour. */
	async record(entry: Omit<IMediaModeration, '_id'>): Promise<void> {
		try {
			await this.dao.save({ _id: coddyger.string.generateObjectId(), ...entry });
			if (entry.status === 'flagged' || entry.status === 'rejected') {
				blockedMedia.block([entry.fileName, entry.posterName]);
			}
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'record' });
		}
	}

	/** Liste paginée pour l'admin, avec l'identité de l'auteur de l'envoi. */
	async list(payloads: { status?: string; page?: number; pageSize?: number }): Promise<any> {
		const params: any = {};
		if (payloads.status) params.status = payloads.status;
		const data: any = await this.dao.select({ params, page: payloads.page, pageSize: payloads.pageSize });
		if (data.error) throw data;

		const ids = [...new Set(data.rows.map((r: any) => r.uploaderId).filter(Boolean).map(String))];
		const users: any = ids.length
			? await this.clients.selectHug({ _id: { $in: ids } })
			: [];
		const byId = new Map<string, any>((Array.isArray(users) ? users : []).map((u: any) => [String(u._id), u]));

		const rows = data.rows.map((r: any) => {
			const u = r.uploaderId ? byId.get(String(r.uploaderId)) : null;
			return {
				...r,
				uploader: u
					? {
							_id: String(u._id),
							name: `${u.firstname ?? ''} ${u.lastname ?? ''}`.trim() || u.email,
							email: u.email,
							isPartner: !!u.isPartner
						}
					: null
			};
		});
		delete data.rows;
		return { data, rows };
	}

	/** Compteurs par statut (badges de l'écran admin). */
	async stats(): Promise<Record<string, number>> {
		const result: any = await this.dao.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
		const stats: Record<string, number> = { approved: 0, flagged: 0, rejected: 0, unchecked: 0 };
		if (Array.isArray(result)) result.forEach((r: any) => (stats[r._id] = r.count));
		return stats;
	}

	/**
	 * URL d'aperçu pour l'admin, y compris pour un média bloqué (que `/file/` refuse de servir).
	 * S3 : URL signée courte ; stockage local : contenu en data URI.
	 */
	async previewUrl(id: string): Promise<string | null> {
		const doc: any = await this.dao.selectOne({ _id: id });
		const key = doc?.posterName || doc?.fileName;
		if (!key) return null;

		// Même ordre que `sendStoredFile` : disque d'abord (fichier pas encore migré), puis S3.
		const local = await storage.localPath(key);
		if (!local) return storage.signedUrl(key, 600);
		const mime = key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
		return `data:${mime};base64,${(await fs.readFile(local)).toString('base64')}`;
	}

	/**
	 * Décision admin : `approve` rend le média visible ; `reject` le supprime du stockage.
	 * @returns le document mis à jour, ou `null` s'il n'existe pas
	 */
	async review(id: string, action: 'approve' | 'reject', adminId: string): Promise<any> {
		const doc: any = await this.dao.selectOne({ _id: id });
		if (!doc || doc.error) return null;

		const keys = [doc.fileName, doc.posterName];
		if (action === 'approve') {
			blockedMedia.unblock(keys);
		} else {
			blockedMedia.block(keys);
			for (const key of keys) {
				if (key) await storage.delete(key).catch(() => undefined);
			}
		}

		await this.dao.update(
			{ _id: id },
			{ status: action === 'approve' ? 'approved' : 'rejected', reviewedBy: adminId, reviewedAt: new Date() }
		);
		return this.dao.selectOne({ _id: id });
	}

	/**
	 * Relance l'analyse d'un média déjà stocké (ex. `unchecked` envoyé avant l'activation AWS).
	 * Une vidéo est réanalysée sur son aperçu.
	 */
	async rescan(id: string): Promise<any> {
		const doc: any = await this.dao.selectOne({ _id: id });
		if (!doc || doc.error) return null;
		const key = doc.posterName || doc.fileName;
		if (!key) return doc;

		const bytes = await this.readStored(key);
		const temp = `${require('os').tmpdir()}/mod-${coddyger.string.generateObjectId()}`;
		try {
			await fs.writeFile(temp, bytes);
			const contentType = key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
			const verdict = await this.analyze({ path: temp, size: bytes.length }, contentType);

			// Un rejet a posteriori ne supprime pas le fichier : il est bloqué, l'admin tranche.
			const status: ModerationStatus = verdict.status === 'rejected' ? 'flagged' : verdict.status;
			const keys = [doc.fileName, doc.posterName];
			if (status === 'flagged') blockedMedia.block(keys);
			else blockedMedia.unblock(keys);

			await this.dao.update(
				{ _id: id },
				{ status, labels: verdict.labels, maxConfidence: verdict.maxConfidence, note: verdict.note ?? null }
			);
			return this.dao.selectOne({ _id: id });
		} finally {
			await fs.rm(temp, { force: true });
		}
	}

	private async readStored(key: string): Promise<Buffer> {
		const local = await storage.localPath(key);
		if (local) return fs.readFile(local);
		const url = await storage.signedUrl(key, 300);
		if (!url) throw new Error('Fichier introuvable dans le stockage');
		const res = await fetch(url);
		if (!res.ok) throw new Error(`Lecture du fichier impossible (${res.status})`);
		return Buffer.from(await res.arrayBuffer());
	}
}
