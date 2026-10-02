import coddyger from 'coddyger';
import { PartnerSet } from '../partner/partner.model';
import { PartnerLikeSet, PartnerCommentSet, PartnerStatsSet } from './partner-engagement.model';
import { IPartnerLike, IPartnerComment } from './partner-engagement.interface';

export class PartnerEngagementService {
  private readonly partnerDao: PartnerSet;
  private readonly likeDao: PartnerLikeSet;
  private readonly commentDao: PartnerCommentSet;
  private readonly statsDao: PartnerStatsSet;

  constructor() {
    this.partnerDao = new PartnerSet();
    this.likeDao = new PartnerLikeSet();
    this.commentDao = new PartnerCommentSet();
    this.statsDao = new PartnerStatsSet();
  }

  /** Vérifie l'existence d'une boutique non supprimée. */
  async partnerExists(partnerId: string): Promise<boolean> {
    const doc: any = await this.partnerDao.selectOne({ _id: partnerId, status: { $nin: ['removed'] } });
    return !!(doc && !doc.error && doc._id);
  }

  /** Bascule le like du client sur la boutique → renvoie l'état final + le total. */
  async toggleLike(partnerId: string, userId: string): Promise<any> {
    const existing: any = await this.likeDao.selectOne({ partnerId, userId });
    let liked: boolean;
    if (existing && !existing.error && existing._id) {
      await this.likeDao.remove({ _id: existing._id });
      liked = false;
    } else {
      await this.likeDao.save({
        _id: coddyger.string.generateObjectId(),
        partnerId,
        userId
      } as IPartnerLike);
      liked = true;
    }
    const likeCount: number = await this.likeDao.count({ partnerId });
    return { liked, likeCount };
  }

  /** Compteurs d'engagement d'une boutique + état `liked` du client (si fourni). */
  async getEngagement(partnerId: string, userId?: string | null): Promise<any> {
    const [likeCount, commentCount, stats] = await Promise.all([
      this.likeDao.count({ partnerId }),
      this.commentDao.count({ partnerId, status: 'active' }),
      this.statsDao.selectOne({ partnerId })
    ]);
    const shareCount: number = stats && !stats.error && stats.shareCount ? stats.shareCount : 0;
    let liked = false;
    if (userId) {
      const like: any = await this.likeDao.selectOne({ partnerId, userId });
      liked = !!(like && !like.error && like._id);
    }
    return {
      likeCount: Number(likeCount) || 0,
      commentCount: Number(commentCount) || 0,
      shareCount,
      liked
    };
  }

  /** Liste paginée des commentaires actifs (récents d'abord). */
  async getComments(partnerId: string, page: number, limit: number): Promise<any> {
    const res: any = await this.commentDao.listByPartner(partnerId, page, limit);
    if (res && res.error) throw res;
    const items = (res.rows || []).map((r: any) => this.formatComment(r));
    return { items, total: res.total, page, limit };
  }

  /** Crée un commentaire actif et le renvoie formaté (auteur peuplé). */
  async addComment(partnerId: string, userId: string, text: string): Promise<any> {
    const _id = coddyger.string.generateObjectId();
    const saved: any = await this.commentDao.save({
      _id,
      partnerId,
      userId,
      text: String(text).trim(),
      status: 'active'
    } as IPartnerComment);
    if (saved && saved.error) throw saved;
    const doc: any = await this.commentDao.selectOne({ _id });
    return this.formatComment(doc);
  }

  /** Incrémente atomiquement le compteur de partages → renvoie le total. */
  async share(partnerId: string): Promise<any> {
    const res: any = await this.statsDao.incrementShare(partnerId, 1);
    if (res && res.error) throw res;
    return { shareCount: Number(res?.shareCount) || 0 };
  }

  /** Projection publique d'un commentaire : { _id, author, text, createdAt }. */
  private formatComment(doc: any): any {
    const author = doc?.userId || {};
    const name = [author.firstname, author.lastname].filter(Boolean).join(' ').trim();
    return {
      _id: doc?._id,
      author: {
        _id: author._id ?? doc?.userId ?? null,
        name,
        avatar: author.avatar ?? null
      },
      text: doc?.text,
      createdAt: doc?.createdAt
    };
  }
}
