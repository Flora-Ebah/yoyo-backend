/**
 * Interfaces du module Support (Assistance & messagerie intégrée)
 *
 * Deux collections : `supporttickets` (le fil de support) et `supportmessages` (les messages du
 * fil). Un ticket est une demande d'assistance asynchrone (pas de chat temps réel) : le client
 * ouvre une demande, échange avec le support en fil, le support répond depuis YOYO ADMIN.
 */

/** Appli d'où vient un ticket : appli Client (utilisateur) ou appli Pro (marchand, gérant). */
export type SupportApp = 'client' | 'pro';

/**
 * Catégories de demande, par appli (menu « Contacter YOYO »). Seule source des catégories : les
 * routes, le service et l'assistant IA en dérivent leurs listes.
 * `payment` : sujet d'argent (paiement, abonnement, revenus), au délai de 1re réponse le plus court
 * (décision Support n°8 : 2 h ouvrées).
 */
export const SUPPORT_CATEGORIES: ReadonlyArray<{ value: string; label: string; apps: SupportApp[]; payment?: boolean }> = [
	{ value: 'scan', label: 'Problème de scan', apps: ['client'] },
	{ value: 'abonnement_paiement', label: 'Abonnement / paiement', apps: ['client'], payment: true },
	{ value: 'marchand', label: 'Problème marchand', apps: ['client'] },
	{ value: 'qr_scan', label: 'QR code et scans', apps: ['pro'] },
	{ value: 'boost', label: 'YO Boost', apps: ['pro'] },
	{ value: 'paiement_revenus', label: 'Paiements et revenus', apps: ['pro'], payment: true },
	{ value: 'boutique_horaires', label: 'Boutique et horaires', apps: ['pro'] },
	{ value: 'compte', label: 'Compte', apps: ['client', 'pro'] },
	{ value: 'autre', label: 'Autre', apps: ['client', 'pro'] }
];

export const SUPPORT_CATEGORY_VALUES: string[] = SUPPORT_CATEGORIES.map((c) => c.value);

/** Catégories proposées dans une appli. */
export const categoriesFor = (app: SupportApp): string[] =>
	SUPPORT_CATEGORIES.filter((c) => c.apps.includes(app)).map((c) => c.value);

export const isPaymentCategory = (category: string): boolean =>
	SUPPORT_CATEGORIES.some((c) => c.value === category && c.payment === true);

export type SupportCategory = string;

/** Cycle de vie d'un ticket. */
export type SupportStatus = 'open' | 'in_progress' | 'resolved';

/** Auteur d'un message du fil. */
export type SupportSender = 'client' | 'support' | 'bot';

export interface ISupportTicket {
	_id?: string;
	/** Référence courte lisible, unique (ex. « A1B2C3 »), générée à la création. */
	reference?: string;
	/** Client propriétaire du ticket (réf. collection Client). */
	userId: any;
	category: SupportCategory;
	status?: SupportStatus;
	/** Admin en charge du ticket (optionnel). */
	assignedTo?: any;
	/** Ticket basculé automatiquement par l'assistant IA (en attente d'un conseiller tant que non attribué). */
	escalated?: boolean;
	/** Appli d'origine : `pro` pour un marchand ou un gérant (défaut `client`). */
	source?: SupportApp;
	/** Dernier message client resté sans réponse du support (null une fois répondu). */
	awaitingSince?: Date | null;
	/** Première réponse d'un conseiller. */
	firstResponseAt?: Date | null;
	/** Échéances fixées à la création selon les délais du CMS (Paramètres › Support). */
	firstResponseDueAt?: Date;
	resolutionDueAt?: Date;
	/** Alerte de retard déjà envoyée (une seule par échéance). */
	slaAlertedAt?: Date | null;
	resolutionAlertedAt?: Date | null;
	createdAt?: Date;
	updatedAt?: Date;
}

export interface ISupportMessage {
	_id?: string;
	/** Ticket parent (réf. SupportTicket). */
	ticketId: any;
	sender: SupportSender;
	/** Identifiant de l'auteur (client ou admin) ; absent pour le bot. */
	senderId?: any;
	body: string;
	/** Nom du fichier joint (servi par la route publique `/file/`). */
	attachment?: string;
	/** Lu par le destinataire. */
	read?: boolean;
	createdAt?: Date;
}
