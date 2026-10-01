import coddyger from 'coddyger';
import { LegalSet } from './legal.model';
import { ILegal, LegalContentType, ILegalSection } from './legal.interface';

const CONTENT_TYPES: LegalContentType[] = ['sections', 'text', 'html', 'markdown'];

/** Vue publique d'une page légale (sans champs internes). */
export interface ILegalPublic {
	slug: string;
	title: string;
	contentType: LegalContentType;
	sections?: ILegalSection[];
	content?: string;
	version?: string;
	updatedAt?: Date;
}

/** Entrée d'index publique (liste des pages publiées). */
export interface ILegalSummary {
	slug: string;
	title: string;
	version?: string;
	updatedAt?: Date;
}

export class LegalService {
	private readonly dao: LegalSet;

	constructor() {
		this.dao = new LegalSet();
	}

	/** Projette un document Mongo vers la vue publique. */
	private toPublic(doc: any): ILegalPublic {
		const contentType: LegalContentType = CONTENT_TYPES.includes(doc.contentType) ? doc.contentType : 'sections';
		const out: ILegalPublic = {
			slug: doc.slug,
			title: doc.title,
			contentType,
			version: doc.version,
			updatedAt: doc.updatedAt
		};
		if (contentType === 'sections') {
			out.sections = Array.isArray(doc.sections) ? doc.sections : [];
		} else {
			out.content = doc.content ?? '';
		}
		return out;
	}

	/** Récupère une page légale publiée (status 'active'). `null` si inconnue ou non publiée. */
	async getPublic(slug: string): Promise<ILegalPublic | null> {
		if (coddyger.string.isEmpty(slug)) return null;
		let doc: any = await this.dao.selectOne({ slug, status: 'active' });
		if (doc && doc.error) doc = null;
		if (!doc) return null;
		return this.toPublic(doc);
	}

	/** Liste des pages légales publiées (status 'active'). */
	async listPublic(): Promise<ILegalSummary[]> {
		const rows: any = await this.dao.selectHug({ status: 'active' });
		if (!Array.isArray(rows)) return [];
		return rows.map((doc: any) => ({
			slug: doc.slug,
			title: doc.title,
			version: doc.version,
			updatedAt: doc.updatedAt
		}));
	}

	/**
	 * Upsert d'une page légale (crée si le slug n'existe pas). `updatedAt` est posé par le serveur
	 * (timestamps Mongoose). La validation contentType/sections/content est faite par l'appelant.
	 */
	async upsert(slug: string, data: Partial<ILegal>): Promise<ILegalPublic> {
		const contentType: LegalContentType = CONTENT_TYPES.includes(data.contentType as LegalContentType)
			? (data.contentType as LegalContentType)
			: 'sections';

		const next: any = {
			slug,
			title: String(data.title),
			contentType
		};

		if (contentType === 'sections') {
			next.sections = Array.isArray(data.sections)
				? data.sections
						.filter((s: any) => s && typeof s.body === 'string')
						.map((s: any) => ({
							...(typeof s.heading === 'string' ? { heading: String(s.heading) } : {}),
							body: String(s.body)
						}))
				: [];
			next.content = undefined;
		} else {
			next.content = String(data.content);
			next.sections = [];
		}

		if (typeof data.version === 'string') next.version = data.version;
		if (typeof data.status === 'string') next.status = data.status;

		let existing: any = await this.dao.selectOne({ slug });
		if (existing && existing.error) existing = null;

		if (existing) {
			const res: any = await this.dao.update({ _id: existing._id }, next);
			if (res && res.error) throw res;
		} else {
			const created: ILegal = {
				_id: coddyger.string.generateObjectId(),
				status: 'active',
				...next
			};
			const res: any = await this.dao.save(created);
			if (res && res.error) throw res;
		}

		const saved: any = await this.dao.selectOne({ slug });
		return this.toPublic(saved);
	}
}
