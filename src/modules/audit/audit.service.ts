import coddyger, { env, LoggerService, LogLevel } from 'coddyger';
import { IAuditLog } from './audit.interface';
import { AuditLogSet } from './audit.model';

/**
 * Service du journal d'audit centralisé.
 *
 * `record` est appelé par le hook global `onResponse` (cf. `router.ts`) pour chaque mutation
 * administrateur. Best-effort : encapsulé dans un try/catch, il n'interrompt jamais la requête.
 */
export class AuditService {
	private readonly logs = new AuditLogSet();
	private readonly serviceLabel = 'AuditService';

	/** Enregistre une entrée d'audit (sans bloquer : aucune exception ne doit remonter). */
	async record(entry: IAuditLog): Promise<void> {
		try {
			if (env.database.useDatabase !== 'yes') return; // pas de base (tests) → on n'enregistre rien
			await this.logs.save({ _id: coddyger.string.generateObjectId(), ...entry } as any);
		} catch (error) {
			LoggerService.log({ type: LogLevel.Warn, content: error, location: this.serviceLabel, method: 'record' });
		}
	}

	/** Liste paginée + filtrée pour l'écran d'administration. */
	async list(payloads: {
		page?: number;
		pageSize?: number;
		subject?: string;
		action?: string;
		method?: string;
		success?: string;
		q?: string;
		from?: string;
		to?: string;
	}): Promise<any> {
		try {
			const params: any = {};
			if (payloads.subject) params.subject = payloads.subject;
			if (payloads.action) params.action = payloads.action;
			if (payloads.method) params.method = payloads.method.toUpperCase();
			if (payloads.success === 'true') params.success = true;
			if (payloads.success === 'false') params.success = false;
			if (payloads.q) {
				const rx = { $regex: payloads.q, $options: 'i' };
				params.$or = [{ actorEmail: rx }, { path: rx }, { targetId: rx }];
			}
			if (payloads.from || payloads.to) {
				params.createdAt = {};
				if (payloads.from) params.createdAt.$gte = new Date(payloads.from);
				if (payloads.to) params.createdAt.$lte = new Date(payloads.to);
			}
			const result: any = await this.logs.select({ params, page: payloads.page, pageSize: payloads.pageSize });
			if (result.error) throw result;
			return result;
		} catch (error) {
			return { error: true, data: error };
		}
	}

	/**
	 * Trace un export de données du back-office (Excel CMS n°9) : qui, quelle liste, quels filtres,
	 * combien de lignes. Appelé par le CMS après la génération du fichier.
	 */
	async recordExport(
		actor: { _id: string; email?: string },
		payload: { entity: string; filters?: Record<string, any>; count?: number; format?: string },
		request: { ip?: string; userAgent?: string; path: string }
	): Promise<void> {
		await this.record({
			actorId: actor._id,
			actorEmail: actor.email,
			actorType: 'admin',
			method: 'EXPORT',
			path: request.path,
			subject: 'exports',
			targetId: payload.entity,
			action: 'export',
			statusCode: 200,
			success: true,
			ip: request.ip,
			userAgent: request.userAgent,
			meta: { entity: payload.entity, filters: payload.filters ?? {}, count: payload.count ?? 0, format: payload.format ?? 'csv' }
		});
	}

	/** Liste des domaines distincts présents dans le journal (pour le filtre). */
	async subjects(): Promise<string[]> {
		try {
			const model: any = (this.logs as any).defaultModel;
			const values: string[] = await model.distinct('subject');
			return values.filter(Boolean).sort();
		} catch {
			return [];
		}
	}
}
