/**
 * Interfaces du module Support (Assistance & messagerie intégrée)
 *
 * Deux collections : `supporttickets` (le fil de support) et `supportmessages` (les messages du
 * fil). Un ticket est une demande d'assistance asynchrone (pas de chat temps réel) : le client
 * ouvre une demande, échange avec le support en fil, le support répond depuis YOYO ADMIN.
 */

/** Catégories de demande proposées au client (menu « Contacter YOYO »). */
export type SupportCategory = 'scan' | 'abonnement_paiement' | 'marchand' | 'compte' | 'autre';

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
