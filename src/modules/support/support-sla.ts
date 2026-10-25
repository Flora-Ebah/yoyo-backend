import { IPlatformConfig } from '../platform-config/platform-config.interface';
import { isPaymentCategory } from './support.interface';

type Sla = NonNullable<IPlatformConfig['supportSla']>;

const HOUR = 3_600_000;

/**
 * Ajoute `hours` heures OUVRÉES à `from`. Les heures ouvrées sont lues en UTC, qui est l'heure
 * d'Abidjan (pas d'heure d'été). Un ticket ouvert hors heures ouvrées commence à compter à
 * l'ouverture suivante.
 */
export function addBusinessHours(from: Date, hours: number, sla: Pick<Sla, 'businessStartHour' | 'businessEndHour' | 'businessDays'>): Date {
	let remaining = hours * HOUR;
	let cursor = new Date(from.getTime());

	// Garde-fou : au plus un an de jours parcourus (configuration incohérente).
	for (let guard = 0; guard < 400 && remaining > 0; guard++) {
		const dayStart = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate());
		const open = dayStart + sla.businessStartHour * HOUR;
		const close = dayStart + sla.businessEndHour * HOUR;
		const nextDay = new Date(dayStart + 24 * HOUR);

		if (!sla.businessDays.includes(cursor.getUTCDay()) || cursor.getTime() >= close) {
			cursor = nextDay;
			continue;
		}
		const start = Math.max(cursor.getTime(), open);
		const available = close - start;
		if (remaining <= available) {
			return new Date(start + remaining);
		}
		remaining -= available;
		cursor = nextDay;
	}
	return cursor;
}

/**
 * Échéances d'un ticket (décision Support n°8) : 1re réponse en heures ouvrées pour un sujet
 * d'argent, en heures calendaires sinon ; résolution en heures calendaires.
 */
export function computeDueDates(createdAt: Date, category: string, sla: Sla): { firstResponseDueAt: Date; resolutionDueAt: Date } {
	const firstResponseDueAt = isPaymentCategory(category)
		? addBusinessHours(createdAt, sla.paymentFirstResponseHours, sla)
		: new Date(createdAt.getTime() + sla.firstResponseHours * HOUR);
	return {
		firstResponseDueAt,
		resolutionDueAt: new Date(createdAt.getTime() + sla.resolutionHours * HOUR)
	};
}

/**
 * Filtre Mongo des tickets en retard : non résolus, et soit sans 1re réponse après l'échéance,
 * soit au-delà de l'échéance de résolution.
 */
export function overdueFilter(now = new Date()): any {
	return {
		status: { $ne: 'resolved' },
		$or: [
			{ firstResponseAt: null, firstResponseDueAt: { $lt: now } },
			{ resolutionDueAt: { $lt: now } }
		]
	};
}

/** Même règle que `overdueFilter`, sur un ticket déjà chargé. */
export function isOverdue(ticket: any, now = new Date()): boolean {
	if (!ticket || ticket.status === 'resolved') return false;
	const t = now.getTime();
	const firstLate = !ticket.firstResponseAt && ticket.firstResponseDueAt && new Date(ticket.firstResponseDueAt).getTime() < t;
	const resolutionLate = ticket.resolutionDueAt && new Date(ticket.resolutionDueAt).getTime() < t;
	return Boolean(firstLate || resolutionLate);
}
