import mongoose from 'mongoose';
import { BoutiqueManagerSet } from '../modules/boutique-manager/boutique-manager.model';
import { CategorySet } from '../modules/category/category.model';

/**
 * Catégories où le marchand peut fixer une commande minimale (remarques testeurs Pro n°5) :
 * petits paniers où la réduction ne doit pas s'appliquer à un achat symbolique.
 */
export const MIN_ORDER_CATEGORIES: string[] = ['Cafés, Glaciers & Pâtisseries', 'Supérettes & Alimentation'];

/**
 * Droits d'un compte sur une boutique : propriétaire (`partner.user`), gérant actif (lien
 * `boutique-manager`) ou admin. On passe par les DAO pour éviter un cycle d'imports entre services.
 */
export class PartnerAccessHelper {
	/** Identifiant du propriétaire, que `user` soit peuplé ou non. */
	static ownerIdOf(partner: any): string {
		const u = partner?.user;
		if (!u) return '';
		return String(typeof u === 'object' ? u._id ?? '' : u);
	}

	static isOwner(partner: any, userId: any): boolean {
		const owner = PartnerAccessHelper.ownerIdOf(partner);
		return !!owner && !!userId && owner === String(userId);
	}

	/** Vrai si `userId` est gérant ACTIF de la boutique. */
	static async isActiveManager(partnerId: any, userId: any): Promise<boolean> {
		if (!partnerId || !userId) return false;
		const model: any = (new BoutiqueManagerSet() as any).defaultModel;
		const link = await model.exists({ boutique: partnerId, manager: userId, status: 'active' });
		return !!link;
	}

	/** Propriétaire, gérant actif ou admin. */
	static async canManage(partner: any, user: any): Promise<boolean> {
		if (!partner || !user) return false;
		if (user.isAdmin) return true;
		if (PartnerAccessHelper.isOwner(partner, user._id)) return true;
		return PartnerAccessHelper.isActiveManager(partner._id, user._id);
	}

	/** Vrai si l'une des catégories (ids ou documents peuplés) autorise une commande minimale. */
	static async isMinOrderEligible(categories: any[] | undefined): Promise<boolean> {
		if (!Array.isArray(categories) || categories.length === 0) return false;

		const names = categories.map((c: any) => (c && typeof c === 'object' ? c.name : undefined)).filter(Boolean);
		if (names.length === categories.length) {
			return names.some((n: string) => MIN_ORDER_CATEGORIES.includes(n));
		}

		const ids = categories
			.map((c: any) => (c && typeof c === 'object' ? c._id : c))
			.filter((id: any) => !!id && mongoose.isValidObjectId(id));
		if (ids.length === 0) return false;
		const model: any = (new CategorySet() as any).defaultModel;
		const found = await model.exists({ _id: { $in: ids }, name: { $in: MIN_ORDER_CATEGORIES } });
		return !!found;
	}
}
