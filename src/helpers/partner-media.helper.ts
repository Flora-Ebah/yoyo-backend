/**
 * Règle métier « vidéo = avantage YO Boost » : la vidéo d'une boutique n'est visible des clients
 * que si la boutique est boostée (`isSponsored`). Sinon seules ses photos sont exposées.
 *
 * Appliqué à la sortie des routes de lecture partagées entre apps : l'admin et le propriétaire de
 * la boutique (app Pro) voient toujours la vidéo, pour pouvoir la gérer.
 */
export class PartnerMediaHelper {
	/** Masque `video` / `videoPoster` d'une boutique non boostée pour cet appelant. */
	static hideVideoIfNotBoosted<T = any>(partner: T, caller: any): T {
		const p: any = partner;
		if (!p || typeof p !== 'object' || !p.video || p.isSponsored) return partner;
		if (caller?.isAdmin) return partner;

		const ownerId = p.user && typeof p.user === 'object' ? p.user._id : p.user;
		if (ownerId && caller?._id && String(ownerId) === String(caller._id)) return partner;

		// Copie : les documents peuvent provenir d'un cache partagé entre requêtes.
		return { ...p, video: null, videoPoster: null };
	}

	/**
	 * Applique la règle à une réponse de contrôleur `{ status, message, data }` dont `data` est une
	 * boutique, une liste de boutiques ou une page `{ rows }`.
	 */
	static async apply<R = any>(response: Promise<R>, caller: any): Promise<R> {
		const res: any = await response;
		if (!res || typeof res !== 'object' || !res.data) return res;

		const map = (p: any) => PartnerMediaHelper.hideVideoIfNotBoosted(p, caller);
		const data = res.data;
		let next = data;
		if (Array.isArray(data)) next = data.map(map);
		else if (Array.isArray(data.rows)) next = { ...data, rows: data.rows.map(map) };
		else next = map(data);

		return { ...res, data: next };
	}
}
