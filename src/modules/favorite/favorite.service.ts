import coddyger from 'coddyger';
import { FavoriteSet } from './favorite.model';
import { IFavorite } from './favorite.interface';
import { PartnerService } from '../partner/partner.service';

export class FavoriteService {
  private readonly dao: FavoriteSet;
  private readonly partnerService: PartnerService;

  constructor() {
    this.dao = new FavoriteSet();
    this.partnerService = new PartnerService();
  }

  /**
   * Bascule le favori d'un client sur une boutique : s'il existe on le retire, sinon on le pose.
   * @returns { favorited: boolean } — état final.
   */
  async toggle(partnerId: string, userId: string): Promise<{ favorited: boolean }> {
    const existing: any = await this.dao.selectOne({ partnerId, userId });
    if (existing && !existing.error) {
      await this.dao.remove({ _id: existing._id });
      return { favorited: false };
    }
    await this.dao.save({
      _id: coddyger.string.generateObjectId(),
      partnerId,
      userId
    } as IFavorite);
    return { favorited: true };
  }

  /**
   * Liste des boutiques favorites d'un client, sous forme d'OBJETS Partner complets (mêmes champs
   * que la fiche publique). Réutilise la sérialisation publique du partner (`PartnerService.getByIds`,
   * qui renvoie les documents complets hors boutiques retirées/archivées). Tri : favoris les plus
   * récents d'abord.
   */
  async listForUser(userId: string): Promise<any[]> {
    const favorites: any = await this.dao.selectHug({ userId });
    const rows: IFavorite[] = Array.isArray(favorites) ? favorites : [];
    if (rows.length === 0) return [];

    // Ordre d'ajout (plus récent d'abord) préservé : `selectHug` trie déjà par createdAt desc.
    const orderedIds: string[] = rows.map((f) => String(f.partnerId));

    const partners: any[] = await this.partnerService.getByIds(orderedIds);
    const byId = new Map<string, any>((partners || []).map((p: any) => [String(p._id), p]));

    // On réapplique l'ordre des favoris : `$in` ne garantit pas l'ordre, et une boutique
    // retirée/archivée est simplement absente (filtrée par getByIds).
    return orderedIds.map((id) => byId.get(id)).filter((p) => !!p);
  }

  /** Indique si une boutique est en favori pour un utilisateur (utilitaire réutilisable). */
  async isFavorited(partnerId: string, userId: string): Promise<boolean> {
    const existing: any = await this.dao.selectOne({ partnerId, userId });
    return !!(existing && !existing.error);
  }
}
