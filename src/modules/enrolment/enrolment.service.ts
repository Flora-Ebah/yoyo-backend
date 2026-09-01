import crypto from 'crypto';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { IEnrolment, IEnrolmentPublic, IEnrolmentSummary } from './enrolment.interface';
import { EnrolmentSet } from './enrolment.model';

/** Durée de validité du lien d'activation, en heures. 72 h par défaut (décision produit). */
const DEFAULT_TTL_HOURS = 72;

export class EnrolmentService {
  private readonly dao: IData<IEnrolment>;
  private readonly serviceLabel = 'EnrolmentService';

  constructor() {
    this.dao = new EnrolmentSet();
  }

  /**
   * Crée un enrôlement
   * @param item Données de l'enrôlement
   * @returns Enrôlement créé ou objet d'erreur
   */
  async create(item: IEnrolment): Promise<any> {
    try {
      item._id ??= coddyger.string.generateObjectId();
      item.status ??= 'active';
      item.enrolmentStatus ??= 'pending';

      return await this.dao.save(item);
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'create'
      });
      return { error: true, data: error };
    }
  }

  /**
   * Met à jour un enrôlement
   * @param id ID de l'enrôlement
   * @param item Nouvelles données
   */
  async update(id: string, item: Partial<IEnrolment>): Promise<any> {
    try {
      return await this.dao.update({ _id: id }, item);
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'update'
      });
      return { error: true, data: error };
    }
  }

  /**
   * Récupère un enrôlement par son ID
   * @param id ID de l'enrôlement
   */
  async getById(id: string): Promise<any> {
    try {
      return await this.dao.selectOne({ _id: id, status: { $nin: ['removed', 'archived'] } });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'getById'
      });
      throw error;
    }
  }

  /**
   * Construit le filtre Mongo commun aux vues liste et récapitulatif.
   * @param filters Critères issus de la requête (déjà arbitrés côté route pour `commercialId`)
   */
  private buildParams(filters: {
    commercialId?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
  }): any {
    const params: any = {};

    const commercialId: string = filters.commercialId ?? '';

    if (!coddyger.string.isEmpty(commercialId) && coddyger.string.isValidObjectId(commercialId)) {
      params.commercial = commercialId;
    }

    if (filters.status === 'pending' || filters.status === 'activated') {
      params.enrolmentStatus = filters.status;
    }

    const from: string = filters.from ?? '';
    const to: string = filters.to ?? '';

    if (!coddyger.string.isEmpty(from) || !coddyger.string.isEmpty(to)) {
      const range: any = {};

      if (!coddyger.string.isEmpty(from)) {
        range.$gte = new Date(from);
      }

      if (!coddyger.string.isEmpty(to)) {
        // La borne haute est une date « jour » : on l'étend à la fin de journée, sinon un
        // enrôlement de 14 h le dernier jour de la période serait exclu.
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }

      params.createdAt = range;
    }

    const q: string = filters.q ?? '';
    if (!coddyger.string.isEmpty(q)) {
      // La recherche porte sur l'instantané, donc sur cette seule collection : pas de jointure.
      params.$or = [
        { merchantName: { $regex: q, $options: 'i' } },
        { merchantEmail: { $regex: q, $options: 'i' } },
        { merchantPhone: { $regex: q, $options: 'i' } },
        { shopName: { $regex: q, $options: 'i' } },
        { ville: { $regex: q, $options: 'i' } }
      ];
    }

    return params;
  }

  /**
   * Liste paginée des enrôlements
   * @param filters Filtres et pagination
   * @returns { data: métadonnées de pagination, rows: enrôlements au format front }
   */
  async list(filters: {
    commercialId?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<any> {
    try {
      const page: number = filters.page ?? 1;
      const pageSize: number = filters.pageSize ?? 10;

      const data: any = await this.dao.select({ params: this.buildParams(filters), page, pageSize });

      if (data.error) {
        throw data;
      }

      const rows: any[] = data.rows;
      delete data.rows;

      return {
        data,
        rows: (rows ?? []).map((row: any) => this.toPublic(row))
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'list'
      });
      throw error;
    }
  }

  /**
   * Récapitulatif par commercial (base de calcul des commissions)
   * @param filters Bornes de période
   * @returns Une ligne par commercial ayant enrôlé sur la période
   */
  async summary(filters: { from?: string; to?: string }): Promise<IEnrolmentSummary[] | IErrorObject> {
    try {
      const model: any = (this.dao as any).defaultModel;
      const match: any = this.buildParams(filters);

      match.status = { $nin: ['removed', 'archived'] };

      const rows = await model.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$commercial',
            commercialName: { $first: '$commercialName' },
            total: { $sum: 1 },
            activated: {
              $sum: { $cond: [{ $eq: ['$enrolmentStatus', 'activated'] }, 1, 0] }
            }
          }
        },
        { $addFields: { pending: { $subtract: ['$total', '$activated'] } } },
        { $sort: { total: -1 } }
      ]);

      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        commercialId: String(r._id),
        commercialName: r.commercialName ?? '',
        total: r.total,
        activated: r.activated,
        pending: r.pending
      }));
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'summary'
      });
      return { error: true, data: error };
    }
  }

  /**
   * Génère un jeton d'activation à usage unique.
   *
   * Volontairement court (32 caractères) et non un JWT : le lien part aussi par SMS, où un jeton
   * signé de ~220 caractères ferait basculer le message sur 2 à 3 segments facturés et serait
   * tronqué par certains clients. Seule l'empreinte est stockée — un accès en lecture à la base
   * ne permet donc pas de fabriquer un lien valide.
   *
   * @returns Le jeton en clair (à mettre dans le lien), son empreinte et sa date d'expiration
   */
  issueActivationToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = crypto.randomBytes(16).toString('hex');
    const ttlHours = Number(process.env.ACTIVATION_TOKEN_TTL_HOURS) || DEFAULT_TTL_HOURS;

    return {
      raw,
      hash: EnrolmentService.hashToken(raw),
      expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000)
    };
  }

  /** Empreinte d'un jeton d'activation. */
  static hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Consomme un jeton d'activation et bascule l'enrôlement en `activated`.
   *
   * L'opération est un unique `findOneAndUpdate` : le filtre exige un jeton non encore consommé et
   * non expiré, et la mise à jour pose `activationTokenUsedAt` dans le même tour. MongoDB garantit
   * l'atomicité au niveau du document, donc deux appels concurrents avec le même jeton ne peuvent
   * pas réussir tous les deux. C'est ce qui rend l'activation idempotente — et, par conséquent, la
   * notification « Boutique activée » envoyée une seule fois.
   *
   * @param raw Jeton en clair reçu du marchand
   * @returns L'enrôlement basculé, ou `null` si le jeton est inconnu, expiré ou déjà utilisé
   */
  async consumeActivationToken(raw: string): Promise<any | null> {
    try {
      if (coddyger.string.isEmpty(raw ?? '')) {
        return null;
      }

      const model: any = (this.dao as any).defaultModel;
      const now = new Date();

      return await model.findOneAndUpdate(
        {
          activationTokenHash: EnrolmentService.hashToken(raw),
          activationTokenUsedAt: null,
          activationTokenExpiresAt: { $gt: now },
          status: { $nin: ['removed', 'archived'] }
        },
        {
          $set: {
            activationTokenUsedAt: now,
            enrolmentStatus: 'activated',
            activatedAt: now
          }
        },
        { new: true }
      ).lean();
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: this.serviceLabel,
        method: 'consumeActivationToken'
      });
      return null;
    }
  }

  /**
   * Projette un enrôlement vers la forme attendue par le front admin
   * @param e Document d'enrôlement
   */
  toPublic(e: any): IEnrolmentPublic {
    return {
      id: String(e._id),
      merchantName: e.merchantName ?? '',
      merchantEmail: e.merchantEmail ?? '',
      merchantPhone: e.merchantPhone ?? '',
      shopName: e.shopName ?? '',
      ville: e.ville ?? '',
      category: e.category ?? '',
      commercialId: String(e.commercial ?? ''),
      commercialName: e.commercialName ?? '',
      status: e.enrolmentStatus ?? 'pending',
      createdAt: e.createdAt ?? null,
      activatedAt: e.activatedAt ?? null
    };
  }
}
