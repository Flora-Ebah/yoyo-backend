import coddyger, { defines } from 'coddyger';
import { TransactionSet } from '../transaction/transaction.model';
import { PaymentService } from '../payment/payment.service';
import { SupportService } from '../support/support.service';

type Result = { status: number; message: any; data: any };

const pageOf = (page?: number, pageSize?: number) => {
	const p = Math.max(1, Number(page) || 1);
	const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
	return { page: p, pageSize: size, skip: (p - 1) * size };
};

/**
 * Fiche utilisateur 360 du back-office (Excel CMS n°11) : paiements en ligne, achats en boutique
 * et tickets d'un compte, lus avec les services existants. Lecture seule.
 * Convention liste du projet : métadonnées de pagination dans `message`, lignes dans `data`.
 */
export class ClientRecordService {
	private invalid(): Result {
		return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
	}

	/** Paiements en ligne (abonnements, YO Boost), y compris en attente ou échoués. */
	async transactions(userId: string, payload: { page?: number; pageSize?: number }): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) return this.invalid();
		const { page, pageSize, skip } = pageOf(payload.page, payload.pageSize);
		const model: any = new TransactionSet().defaultModel;
		const params = { user: userId, status: { $nin: ['removed'] } };
		const [rows, totalRows] = await Promise.all([
			model
				.find(params, '-paymentUrl -notifyToken -returnToken -__v')
				.populate('plan', 'name price currency')
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(pageSize)
				.lean(),
			model.countDocuments(params)
		]);
		return { status: defines.status.requestOK, message: { totalRows, totalPages: Math.ceil(totalRows / pageSize), page, pageSize }, data: rows };
	}

	/** Achats en boutique (tickets de réduction scannés). */
	async payments(userId: string, payload: { page?: number; pageSize?: number }): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) return this.invalid();
		const { page, pageSize } = pageOf(payload.page, payload.pageSize);
		const result: any = await new PaymentService().getClientTransactions(userId, { page, pageSize });
		if (result?.error) {
			return { status: defines.status.notFound, message: typeof result.data === 'string' ? result.data : 'Client introuvable', data: null };
		}
		const { rows, ...meta } = result.data ?? {};
		return { status: defines.status.requestOK, message: meta, data: result.rows ?? [] };
	}

	/** Tickets de support, appli Client et appli Pro confondues. */
	async tickets(userId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) return this.invalid();
		const rows: any = await new SupportService().listClientTickets(userId);
		if (rows?.error) return { status: defines.status.serverError, message: 'Tickets indisponibles', data: null };
		return { status: defines.status.requestOK, message: { totalRows: rows.length }, data: rows };
	}
}

export const clientRecordService = new ClientRecordService();
