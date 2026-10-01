/**
 * Pages légales dynamiques (CGU, confidentialité, mentions ARTCI, etc.), pilotées depuis le
 * backoffice — AUCUN texte légal codé en dur. Un document par `slug`.
 */
export type LegalContentType = 'sections' | 'text' | 'html' | 'markdown';

export interface ILegalSection {
	heading?: string;
	body: string;
}

export interface ILegal {
	_id?: string;
	/** Identifiant public de la page (unique, indexé) : ex. `cgu`, `confidentialite`, `mentions-artci`. */
	slug: string;
	title: string;
	contentType?: LegalContentType;
	/** Utilisé lorsque `contentType === 'sections'`. */
	sections?: ILegalSection[];
	/** Utilisé lorsque `contentType` vaut `text` / `html` / `markdown`. */
	content?: string;
	version?: string;
	status?: string;
	createdAt?: Date;
	updatedAt?: Date;
}
