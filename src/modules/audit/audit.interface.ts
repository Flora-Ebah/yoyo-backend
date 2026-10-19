/**
 * Journal d'audit centralisé.
 *
 * Trace automatiquement les actions SENSIBLES du back-office (mutations POST/PUT/PATCH/DELETE
 * effectuées par un administrateur authentifié). Enregistrement best-effort, hors du chemin
 * critique de la réponse : une panne du journal ne doit jamais faire échouer l'action.
 */
export interface IAuditLog {
	_id?: string;
	/** Auteur de l'action (admin). */
	actorId?: any;
	actorEmail?: string;
	actorType?: 'admin' | 'client' | 'system';
	/** Méthode HTTP (POST, PUT, PATCH, DELETE). */
	method: string;
	/** Chemin appelé (sans le préfixe versionné), ex. `/clients/123`. */
	path: string;
	/** Domaine déduit du chemin, ex. `clients`, `payments`, `support`. */
	subject?: string;
	/** Identifiant de la cible si présent dans l'URL (`:id`). */
	targetId?: string;
	/** Code HTTP de la réponse. */
	statusCode?: number;
	/** Succès déduit (`statusCode < 400`). */
	success?: boolean;
	ip?: string;
	userAgent?: string;
	createdAt?: Date;
	updatedAt?: Date;
}
