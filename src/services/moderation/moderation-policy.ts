import { ModerationLabel } from './rekognition.service';

/**
 * Politique de modération des médias : contenu sexuel et pédopornographique.
 *
 * Rekognition ne fournit pas d'étiquette dédiée aux abus sur mineurs : on bloque donc TOUTE
 * nudité explicite ou activité sexuelle, quel que soit l'âge apparent. Les catégories suivent
 * les taxonomies v6 et v7 de Rekognition (les noms ont changé entre les deux).
 */

export type ModerationStatus = 'approved' | 'flagged' | 'rejected' | 'unchecked';

/** Catégories qui entraînent le refus pur et simple au-delà du seuil de rejet. */
const REJECT_CATEGORIES = [
	'Explicit',
	'Explicit Nudity',
	'Explicit Sexual Activity',
	'Sexual Activity',
	'Exposed Female Genitalia',
	'Exposed Male Genitalia',
	'Exposed Buttocks or Anus',
	'Exposed Female Nipple',
	'Graphic Female Nudity',
	'Graphic Male Nudity',
	'Sex Toys'
];

/** Catégories qui, au-delà du seuil de signalement, masquent le média jusqu'à revue admin. */
const FLAG_CATEGORIES = [
	...REJECT_CATEGORIES,
	'Non-Explicit Nudity of Intimate parts and Kissing',
	'Non-Explicit Nudity',
	'Obstructed Intimate Parts',
	'Implied Nudity',
	'Sexual Situations',
	'Partially Exposed Female Breast'
];

/** Libellés rangés sous une catégorie surveillée mais sans caractère sexuel (photos de boutique). */
const EXEMPT_LABELS = ['Kissing on the Lips'];

const matches = (label: ModerationLabel, categories: string[]): boolean =>
	!EXEMPT_LABELS.includes(label.name) &&
	(categories.includes(label.name) || (!!label.parent && categories.includes(label.parent)));

export const moderationThresholds = () => ({
	reject: Number(process.env.MODERATION_REJECT_THRESHOLD) || 80,
	flag: Number(process.env.MODERATION_FLAG_THRESHOLD) || 50
});

/**
 * Décide du sort d'un média à partir de ses libellés.
 * @returns le statut et le score le plus élevé parmi les libellés à caractère sexuel
 */
export const decideModeration = (
	labels: ModerationLabel[],
	thresholds = moderationThresholds()
): { status: ModerationStatus; score: number } => {
	const rejectScore = Math.max(0, ...labels.filter((l) => matches(l, REJECT_CATEGORIES)).map((l) => l.confidence));
	const flagScore = Math.max(0, ...labels.filter((l) => matches(l, FLAG_CATEGORIES)).map((l) => l.confidence));

	if (rejectScore >= thresholds.reject) return { status: 'rejected', score: rejectScore };
	if (flagScore >= thresholds.flag) return { status: 'flagged', score: flagScore };
	return { status: 'approved', score: flagScore };
};

/**
 * Registre en mémoire des fichiers à ne jamais servir publiquement (`flagged` / `rejected`).
 * Chargé au démarrage puis tenu à jour à chaque décision : la route `/file/` le consulte sans
 * requête en base (elle sert des dizaines d'images par écran).
 */
const blocked = new Set<string>();

export const blockedMedia = {
	isBlocked: (key: string): boolean => blocked.has(key),
	block: (keys: Array<string | undefined | null>) => keys.forEach((k) => k && blocked.add(k)),
	unblock: (keys: Array<string | undefined | null>) => keys.forEach((k) => k && blocked.delete(k)),
	reset: (keys: string[]) => {
		blocked.clear();
		keys.forEach((k) => blocked.add(k));
	}
};
