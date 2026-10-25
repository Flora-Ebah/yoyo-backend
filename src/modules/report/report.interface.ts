export type ReportTarget = 'boutique' | 'media' | 'comment';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export type ReportAction = 'dismiss' | 'remove-comment' | 'remove-media' | 'suspend-boutique';

export const REPORT_TARGETS: ReportTarget[] = ['boutique', 'media', 'comment'];

/** Motifs proposés dans l'appli Client (mêmes clés côté appli et CMS). */
export const REPORT_REASONS: { key: string; label: string }[] = [
	{ key: 'inapproprie', label: 'Contenu choquant ou inapproprié' },
	{ key: 'arnaque', label: 'Arnaque ou fraude' },
	{ key: 'trompeur', label: 'Information fausse ou trompeuse' },
	{ key: 'offensant', label: 'Propos haineux ou offensants' },
	{ key: 'spam', label: 'Spam ou publicité' },
	{ key: 'autre', label: 'Autre' }
];

/** Nombre de signalements ouverts d'une même cible qui déclenche l'alerte des modérateurs. */
export const REPORT_ALERT_THRESHOLD = 3;
/** Signalements maximum par compte sur 24 h. */
export const REPORT_DAILY_LIMIT = 10;

export interface IReport {
	_id?: any;
	reporter: any;
	targetType: ReportTarget;
	targetId: string;
	partner?: any;
	reason: string;
	comment?: string;
	status?: ReportStatus;
	action?: ReportAction;
	note?: string;
	handledBy?: any;
	handledAt?: Date;
	createdAt?: Date;
	updatedAt?: Date;
}
