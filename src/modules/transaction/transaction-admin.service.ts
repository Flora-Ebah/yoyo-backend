import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import '../client/client.model'; // enregistre le modèle « Client » (référence `user` des transactions)
import { TransactionSet } from './transaction.model';
import { TransactionService } from './transaction.service';
import { SubscriptionService, SubscriptionSet } from '../subscription';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';

type Result = { status: number; message: string; data: any };

/** Nombre maximal de lignes d'un relevé envoyé au rapprochement. */
export const RECONCILE_MAX_ROWS = 5000;

/** Ligne de relevé prestataire, colonnes déjà choisies côté CMS. */
export type StatementRow = { ref: string; amount?: number | null; date?: string | null };

const NOT_ACTIVATABLE = ['success', 'refunded'];

/** Résumé d'une transaction pour les écrans de rapprochement. */
const summarize = (t: any, statement?: StatementRow) => ({
	_id: String(t._id),
	user: t.user && typeof t.user === 'object'
		? { _id: String(t.user._id), name: `${t.user.firstname ?? ''} ${t.user.lastname ?? ''}`.trim(), email: t.user.email, contact: t.user.contact }
		: t.user ? { _id: String(t.user) } : null,
	amount: t.amount,
	currency: t.currency,
	kind: t.kind ?? 'subscription',
	paymentMethod: t.paymentMethod,
	paymentStatus: t.paymentStatus,
	paymentDate: t.paymentDate,
	txnId: t.txnId,
	manual: !!t.manualActivation?.at,
	...(statement ? { statementRef: statement.ref, statementAmount: statement.amount ?? null, statementDate: statement.date ?? null } : {})
});

/**
 * Actions admin sur les paiements en ligne (Excel CMS n°12) : activation manuelle d'un paiement
 * constaté chez le prestataire, remboursement consigné, rapprochement avec un relevé Wave.
 * L'intégration Wave elle-même (paiement, webhook, page de retour) n'est pas modifiée.
 */
export class TransactionAdminService {
	private readonly serviceLabel = 'TransactionAdminService';
	private readonly transactions = new TransactionService();

	private get model(): any {
		return new TransactionSet().defaultModel;
	}

	/**
	 * Active un paiement resté en attente. Le prestataire est d'abord ré-interrogé : s'il confirme,
	 * la transaction est réglée normalement. Sinon l'activation est forcée et tracée
	 * (`manualActivation`). Une seule activation possible, même si deux admins cliquent ensemble.
	 */
	async activate(id: string, payload: { ref: string; reason?: string }, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) {
			return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		}
		const ref = String(payload.ref ?? '').trim();
		if (ref.length < 3) {
			return { status: defines.status.badRequest, message: 'Indiquez la référence du paiement chez le prestataire.', data: null };
		}

		const transaction: any = await this.model.findById(id).lean();
		if (!transaction) return { status: defines.status.notFound, message: 'Transaction introuvable', data: null };
		if (NOT_ACTIVATABLE.includes(transaction.paymentStatus)) {
			return { status: defines.status.conflict, message: 'Cette transaction est déjà réglée ou remboursée.', data: null };
		}

		// 1. Le prestataire a peut-être bien reçu le paiement (webhook perdu) : règlement normal.
		try {
			const settled: any = await this.transactions.resettle(transaction);
			if (settled?.providerStatus === 'success' || settled?.transaction?.paymentStatus === 'success') {
				return { status: defines.status.requestOK, message: 'Paiement confirmé par le prestataire, abonnement activé.', data: { via: 'provider', transaction: summarize(settled.transaction ?? transaction) } };
			}
		} catch (e) {
			LoggerService.log({ type: LogLevel.Warn, content: e, location: this.serviceLabel, method: 'activate:resettle' });
		}

		// 2. Activation forcée : réservation atomique, puis règlement par le chemin habituel.
		const reserved = await this.model.findOneAndUpdate(
			{ _id: id, paymentStatus: { $nin: NOT_ACTIVATABLE }, 'manualActivation.at': { $exists: false } },
			{
				$set: {
					manualActivation: { by: adminId, at: new Date(), reason: String(payload.reason ?? '').trim() || undefined, ref },
					...(transaction.txnId ? {} : { txnId: ref })
				}
			},
			{ new: true }
		).lean();
		if (!reserved) {
			return { status: defines.status.conflict, message: 'Cette transaction vient déjà d’être activée.', data: null };
		}

		const updated: any = await this.transactions.updateTransactionStatus(id, 'success');
		return { status: defines.status.requestOK, message: 'Transaction activée manuellement.', data: { via: 'manual', transaction: summarize(updated ?? reserved) } };
	}

	/**
	 * Consigne un remboursement effectué chez le prestataire. La transaction passe à `refunded` ;
	 * l'abonnement lié peut être annulé ; l'utilisateur reçoit une push.
	 */
	async refund(
		id: string,
		payload: { amount: number; ref: string; reason: string; cancelSubscription?: boolean },
		adminId: string
	): Promise<Result> {
		if (!coddyger.string.isValidObjectId(id)) {
			return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		}
		const ref = String(payload.ref ?? '').trim();
		const reason = String(payload.reason ?? '').trim();
		const amount = Math.round(Number(payload.amount));
		if (ref.length < 3 || reason.length < 3) {
			return { status: defines.status.badRequest, message: 'Indiquez la référence du remboursement et son motif.', data: null };
		}

		const transaction: any = await this.model.findById(id).lean();
		if (!transaction) return { status: defines.status.notFound, message: 'Transaction introuvable', data: null };
		if (transaction.paymentStatus !== 'success') {
			return { status: defines.status.conflict, message: 'Seul un paiement réussi peut être remboursé.', data: null };
		}
		if (!Number.isFinite(amount) || amount < 1 || amount > Number(transaction.amount)) {
			return { status: defines.status.badRequest, message: `Montant invalide (1 à ${transaction.amount} ${transaction.currency ?? ''}).`.trim(), data: null };
		}

		const cancel = payload.cancelSubscription === true && (transaction.kind ?? 'subscription') === 'subscription';
		const refunded = await this.model.findOneAndUpdate(
			{ _id: id, paymentStatus: 'success' },
			{ $set: { paymentStatus: 'refunded', refund: { amount, ref, reason, by: adminId, at: new Date(), subscriptionCancelled: cancel } } },
			{ new: true }
		).lean();
		if (!refunded) {
			return { status: defines.status.conflict, message: 'Cette transaction vient déjà d’être remboursée.', data: null };
		}

		let subscriptionCancelled = false;
		if (cancel) {
			const subscription = await this.findSubscription(transaction);
			if (subscription) {
				const res = await new SubscriptionService().cancelSubscription(String(subscription._id), `Remboursement ${ref} : ${reason}`);
				subscriptionCancelled = !!res?.success;
			}
		}

		await this.notifyRefund(transaction, amount);
		return {
			status: defines.status.requestOK,
			message: subscriptionCancelled ? 'Remboursement enregistré, abonnement annulé.' : 'Remboursement enregistré.',
			data: { transaction: summarize(refunded), subscriptionCancelled }
		};
	}

	/**
	 * Abonnement payé par cette transaction : lien direct `transactionId` (depuis ce lot), sinon
	 * l'abonnement actif du même client et du même plan démarré après le paiement.
	 */
	private async findSubscription(transaction: any): Promise<any> {
		const subscriptions: any = new SubscriptionSet().defaultModel;
		const linked = await subscriptions.findOne({ transactionId: String(transaction._id) }).lean();
		if (linked) return linked;
		const since = new Date(new Date(transaction.paymentDate ?? transaction.createdAt).getTime() - 60_000);
		return subscriptions
			.findOne({ userId: transaction.user, planId: transaction.plan, status: 'active', startDate: { $gte: since } })
			.sort({ startDate: 1 })
			.lean();
	}

	private async notifyRefund(transaction: any, amount: number): Promise<void> {
		if (!transaction.user) return;
		try {
			await new PushNotificationService().create({
				title: 'Remboursement effectué',
				body: `Votre paiement a été remboursé : ${amount.toLocaleString('fr-FR')} ${transaction.currency ?? 'XOF'}.`,
				type: 'info',
				priority: 'high',
				data: { userId: String(transaction.user), type: 'payment_refunded', transactionId: String(transaction._id) },
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as IPushNotification);
		} catch (e) {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.serviceLabel, method: 'notifyRefund' });
		}
	}

	/**
	 * Rapproche un relevé du prestataire avec nos transactions. Une référence du relevé peut être
	 * l'identifiant de paiement (`txnId`), l'identifiant de session (`paymentToken`) ou notre
	 * référence (`_id`, transmise à Wave comme `client_reference`).
	 *
	 * Renvoie : les concordants, les écarts de montant, les paiements reçus chez le prestataire
	 * mais pas activés chez nous, les références inconnues, et nos paiements réussis absents du
	 * relevé sur sa période.
	 */
	async reconcile(payload: { rows: StatementRow[]; paymentMethod?: string; from?: string; to?: string }): Promise<Result> {
		const rows = (Array.isArray(payload.rows) ? payload.rows : [])
			.map((r) => ({
				ref: String(r?.ref ?? '').trim(),
				amount: r?.amount === null || r?.amount === undefined || (r.amount as any) === '' ? null : Number(r.amount),
				date: r?.date ? String(r.date) : null
			}))
			.filter((r) => r.ref);
		if (!rows.length) return { status: defines.status.badRequest, message: 'Le relevé ne contient aucune référence.', data: null };
		if (rows.length > RECONCILE_MAX_ROWS) {
			return { status: defines.status.badRequest, message: `Relevé trop long (${RECONCILE_MAX_ROWS} lignes au maximum).`, data: null };
		}
		const paymentMethod = payload.paymentMethod || 'wave';

		const refs = [...new Set(rows.map((r) => r.ref))];
		const ids = refs.filter((r) => coddyger.string.isValidObjectId(r));
		const found: any[] = await this.model
			.find({ paymentMethod, $or: [{ txnId: { $in: refs } }, { paymentToken: { $in: refs } }, ...(ids.length ? [{ _id: { $in: ids } }] : [])] })
			.populate({ path: 'user', model: 'Client', select: 'firstname lastname email contact' })
			.lean();

		const byRef = new Map<string, any>();
		for (const t of found) {
			for (const key of [t.txnId, t.paymentToken, String(t._id)]) if (key) byRef.set(String(key), t);
		}

		const matched: any[] = [];
		const amountMismatch: any[] = [];
		const notActivated: any[] = [];
		const unknown: StatementRow[] = [];
		const seen = new Set<string>();

		for (const row of rows) {
			const t = byRef.get(row.ref);
			if (!t) {
				unknown.push(row);
				continue;
			}
			seen.add(String(t._id));
			const item = summarize(t, row);
			if (t.paymentStatus === 'success') {
				if (row.amount !== null && Number.isFinite(row.amount) && Number(row.amount) !== Number(t.amount)) amountMismatch.push(item);
				else matched.push(item);
			} else if (t.paymentStatus === 'refunded') {
				matched.push(item);
			} else {
				notActivated.push(item);
			}
		}

		// Période du relevé : bornes fournies, sinon dates min / max des lignes.
		const dates = rows.map((r) => (r.date ? new Date(r.date).getTime() : NaN)).filter((d) => Number.isFinite(d));
		const from = payload.from ? new Date(payload.from) : dates.length ? new Date(Math.min(...dates)) : null;
		const to = payload.to ? new Date(payload.to) : dates.length ? new Date(Math.max(...dates)) : null;
		let missingFromStatement: any[] = [];
		if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
			const end = new Date(to);
			if (!payload.to) end.setHours(23, 59, 59, 999);
			const ours: any[] = await this.model
				.find({ paymentMethod, paymentStatus: 'success', paymentDate: { $gte: from, $lte: end } })
				.populate({ path: 'user', model: 'Client', select: 'firstname lastname email contact' })
				.limit(RECONCILE_MAX_ROWS)
				.lean();
			missingFromStatement = ours.filter((t) => !seen.has(String(t._id))).map((t) => summarize(t));
		}

		return {
			status: defines.status.requestOK,
			message: 'Rapprochement effectué.',
			data: {
				period: from && to ? { from, to } : null,
				counts: {
					rows: rows.length,
					matched: matched.length,
					amountMismatch: amountMismatch.length,
					notActivated: notActivated.length,
					unknown: unknown.length,
					missingFromStatement: missingFromStatement.length
				},
				matched,
				amountMismatch,
				notActivated,
				unknown,
				missingFromStatement
			}
		};
	}
}

export const transactionAdminService = new TransactionAdminService();
