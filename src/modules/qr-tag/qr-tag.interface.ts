/**
 * QR Tags (stickers physiques) — Excel CMS « génération de QR en lot façon Wave ».
 *
 * Un QR Tag est un sticker imprimé portant un code opaque. Il est d'abord « vierge » (produit en lot,
 * distribué aux équipes terrain), puis « affecté » à une boutique au moment de l'enrôlement (le code
 * est collé sur place). Au scan, le code est résolu vers la boutique : c'est une simple couche
 * d'indirection au-dessus du flux de scan/redeem existant — les boutiques qui possèdent déjà un QR
 * (encodant l'id de boutique) continuent de fonctionner sans changement.
 */

export type QrTagStatus = 'vierge' | 'affecte' | 'desactive';

/** Lot de production d'une série de stickers. */
export interface IQrTagBatch {
	_id?: any;
	/** Libellé lisible (ex. « Impression terrain Abidjan - nov. 2026 »). */
	label: string;
	/** Préfixe des codes du lot (lisibilité à l'impression). */
	prefix?: string;
	/** Nombre de stickers produits dans le lot. */
	count: number;
	createdBy?: any;
	createdAt?: Date;
	updatedAt?: Date;
}

/** Sticker individuel. */
export interface IQrTag {
	_id?: any;
	/** Code imprimé (unique). */
	code: string;
	/** Lot de production. */
	batch?: any;
	/** Boutique affectée (null tant que le sticker est vierge). */
	boutique?: any | null;
	status: QrTagStatus;
	/** Admin/commercial ayant affecté le sticker, et quand. */
	assignedBy?: any;
	assignedAt?: Date | null;
	/** Désactivation (sticker perdu, réimprimé…). */
	deactivatedAt?: Date | null;
	createdBy?: any;
	createdAt?: Date;
	updatedAt?: Date;
}
