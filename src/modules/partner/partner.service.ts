import { IPartner, IOpeningHours } from './partner.interface';
import { PartnerSet } from './partner.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';
import { CategoryService } from '../category/category.service';
import { ClientSet } from '../client';
import { SettingsService } from '../settings';

export class PartnerService {
  private readonly dao: IData<IPartner>;
  private readonly categoryService: CategoryService;
  private readonly settingsService: SettingsService;
  private readonly serviceLabel = 'PartnerService';

  constructor() {
    this.dao = new PartnerSet();
    this.categoryService = new CategoryService();
    this.settingsService = new SettingsService();
  }

  /**
   * Valide l'existence des catégories
   * @param categories Tableau d'IDs de catégories
   * @returns Objet d'erreur ou null si toutes les catégories existent
   */
  async validateCategoriesExist(categories: string[]): Promise<IErrorObject | null> {
    try {
      if (!categories || !Array.isArray(categories) || categories.length === 0) {
        return null;
      }

      // Vérifier que tous les IDs sont valides
      for (const categoryId of categories) {
        if (!coddyger.string.isValidObjectId(categoryId)) {
          return {
            error: true,
            data: `L'ID de catégorie '${categoryId}' n'est pas valide`
          };
        }
      }

      // Vérifier l'existence de chaque catégorie
      for (const categoryId of categories) {
        const category = await this.categoryService.getById(categoryId);
        if (!category) {
          return {
            error: true,
            data: `La catégorie avec l'ID ${categoryId} n'existe pas`
          };
        }
      }

      return null;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'validateCategoriesExist' 
      });
      return { error: true, data: error };
    }
  }

  /**
   * Valide les heures d'ouverture
   * @param openingHours Tableau des heures d'ouverture
   * @returns Objet d'erreur ou null si aucune erreur
   */
  validateOpeningHours(openingHours: IOpeningHours[]): IErrorObject | null {
    try {
      if (!openingHours || !Array.isArray(openingHours)) {
        return null;
      }

      // Vérifier que chaque jour n'apparaît qu'une seule fois
      const days = openingHours.map(hour => hour.day);
      const uniqueDays = new Set(days);
      if (days.length !== uniqueDays.size) {
        return {
          error: true,
          data: "Chaque jour ne peut apparaître qu'une seule fois dans les horaires d'ouverture"
        };
      }

      // Vérifier que les horaires sont cohérents (openTime < closeTime)
      for (const hour of openingHours) {
        if (hour.isOpen && hour.openTime && hour.closeTime) {
          // if (hour.openTime >= hour.closeTime) {
          //   return {
          //     error: true,
          //     data: `L'heure d'ouverture doit être antérieure à l'heure de fermeture pour le jour: ${hour.day}`
          //   };
          // }

          // Vérifier la cohérence des pauses
          if (hour.breaks && Array.isArray(hour.breaks)) {
            for (const breakTime of hour.breaks) {
              // Vérifier que la pause est comprise dans les heures d'ouverture
              // if (breakTime.startTime < hour.openTime || breakTime.endTime > hour.closeTime) {
              //   return {
              //     error: true,
              //     data: `Les pauses doivent être comprises dans les heures d'ouverture pour le jour: ${hour.day}`
              //   };
              // }
              // Vérifier que l'heure de début de pause est antérieure à l'heure de fin
              if (breakTime.startTime >= breakTime.endTime) {
                return {
                  error: true,
                  data: `L'heure de début de pause doit être antérieure à l'heure de fin pour le jour: ${hour.day}`
                };
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'validateOpeningHours' 
      });
      return { error: true, data: error };
    }
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; category?: string; createdBy?: string }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';
			let category: any = payloads.category ?? '';
			let createdBy: any = payloads.createdBy ?? '';

      let data: any | IErrorObject = {};

			// Filtre d'attribution (vue commerciale) : il se cumule avec les critères ci-dessous
			// plutôt que de constituer une branche de plus.
			const base: any = {};
			if (!coddyger.string.isEmpty(createdBy) && coddyger.string.isValidObjectId(createdBy)) {
				base.createdBy = createdBy;
			}

      if (!coddyger.string.isEmpty(category) && coddyger.string.isValidObjectId(category)) {
				data = await this.dao.select({ params: { ...base, categories:category }, page, pageSize });
			} else if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { ...base }, page, pageSize });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { ...base, status }, page, pageSize });
			} else {
				data = await this.dao.select({
					params: {
						...base,
						$or: [
							{ slug: { $regex: query || '', $options: 'i' } },
							{ name: { $regex: query || '', $options: 'i' } },
              { description: { $regex: query || '', $options: 'i' } },
              { ville: { $regex: query || '', $options: 'i' } },
              { address: { $regex: query || '', $options: 'i' } },
              { phone: { $regex: query || '', $options: 'i' } },
              { email: { $regex: query || '', $options: 'i' } }
						]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

      const rows: IPartner[] = data.rows;
			delete data.rows;

      return {
        data,
        rows
      };
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getAll' 
      });
      throw error;
    }
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getHug(params?: any): Promise<IPartner[]> {
    try {
      const result:any = await this.dao.selectHug(params);
      return result;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getAll' 
      });
      throw error;
    }
  }

  /**
   * Récupère un élément par son ID
   * @param id ID de l'élément
   * @returns Élément trouvé ou null
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
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  async create(item: IPartner): Promise<IPartner | IErrorObject> {
    try {
      // Validation des catégories
      if (item.categories && Array.isArray(item.categories)) {
        const categoriesError = await this.validateCategoriesExist(item.categories);
        if (categoriesError) {
          return categoriesError;
        }
      }

      // Validation des horaires d'ouverture
      if (item.openingHours) {
        const validationError = this.validateOpeningHours(item.openingHours);
        if (validationError) {
          return validationError;
        }
      }

      // Multi-boutiques : un marchand peut posséder plusieurs boutiques. On ne bloque plus la 2ᵉ,
      // mais on applique la limite paramétrable depuis le CMS (0 = illimité). On compte les
      // boutiques encore en service (hors retirées/archivées) du propriétaire.
      const maxBoutiques = await this.settingsService.getMaxBoutiquesPerMerchant();
      if (maxBoutiques > 0) {
        const model: any = (this.dao as any).defaultModel;
        const current: number = await model.countDocuments({
          user: item.user,
          status: { $nin: ['removed', 'archived'] }
        });

        if (current >= maxBoutiques) {
          return {
            error: true,
            data: `Ce marchand a atteint la limite de ${maxBoutiques} boutique(s) autorisée(s).`
          };
        }
      }

      const latestPartner:any = await this.dao.selectLatest();

      item.slug = coddyger.buildSlug(item.name, latestPartner ? latestPartner.slug : '');
      item._id = coddyger.string.generateObjectId()

      const result:any = await this.dao.save(item);
      return result;
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
   * Met à jour un élément existant
   * @param id ID de l'élément
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  async update(id: string, item: Partial<IPartner>): Promise<IPartner | IErrorObject> {
    try {
      // Validation des catégories
      if (item.categories && Array.isArray(item.categories)) {
        const categoriesError = await this.validateCategoriesExist(item.categories);
        if (categoriesError) {
          return categoriesError;
        }
      }

      // Validation des horaires d'ouverture
      if (item.openingHours) {
        const validationError = this.validateOpeningHours(item.openingHours);
        if (validationError) {
          return validationError;
        }
      }

      const result:any = await this.dao.update({_id: id}, item);
      return result;
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
   * Supprime un élément (mise à jour du statut)
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  async delete(id: string): Promise<void> {
    try {
      const result:any = await this.dao.update({ _id: id }, { status: 'removed' });
      if (result.error) {
        throw new Error(result);
      }
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'delete' 
      });
      throw error;
    }
  }

  /**
   * Récupère les partenaires par ID utilisateur
   * @param userId ID de l'utilisateur
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires
   */
  async getByUserId(userId: string, payloads: { page?: number; pageSize?: number; status?: string }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let status: any = payloads.status ?? '';

      let query: any = { user: userId };
      if (status) {
        query.status = status;
      }

      const data:any = await this.dao.select({ params: query, page, pageSize });

      if (data.error) {
        throw data;
      }

      const rows: IPartner[] = data.rows;
      delete data.rows;

      return {
        data,
        rows
      };
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getByUserId' 
      });
      throw error;
    }
  }

  /**
   * Récupère tous les partenaires par ID utilisateur
   * @param userId ID de l'utilisateur
   * @returns Liste des partenaires
   */
  async getPartnersByUserId(userId: string): Promise<any> {
    try {
      const result:any = await this.dao.selectHug({ user: userId });
      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Supprime tous les partenaires par ID utilisateur
   * @param userId ID de l'utilisateur
   * @returns Résultat de l'opération
   */
  async removePartnersByUserId(userId: string): Promise<any> {
    try {
      // Pipeline de mise à jour : on mémorise le statut courant dans `statusBeforeRemoval` (sauf s'il
      // est déjà `removed`, pour ne pas écraser une mémorisation antérieure) puis on passe en `removed`.
      await this.dao.updateMany({ user: userId }, [
        {
          $set: {
            statusBeforeRemoval: {
              $cond: [{ $ne: ['$status', 'removed'] }, '$status', '$statusBeforeRemoval']
            },
            status: 'removed'
          }
        }
      ] as any);
      // Retour explicite : sans lui, la méthode renvoyait `undefined` et l'appelant
      // (`client.service.delete`) plantait sur `partners.error` alors que la suppression
      // avait réussi — d'où une erreur affichée bien que le compte/la boutique soient supprimés.
      return { error: false };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Restaure les boutiques d'un utilisateur qui avaient été retirées lors de la suppression de son
   * compte (statut `removed` → `active`). Utilisé à la réactivation du compte (DCP/RGPD) pour que le
   * marchand retrouve la boutique qu'il avait créée. N'affecte pas les boutiques anonymisées.
   */
  async restorePartnersByUserId(userId: string): Promise<any> {
    try {
      // Restaure le statut mémorisé (repli sur `active` pour les suppressions antérieures au champ)
      // puis retire le champ de mémorisation.
      await this.dao.updateMany({ user: userId, status: 'removed' }, [
        { $set: { status: { $ifNull: ['$statusBeforeRemoval', 'active'] } } },
        { $unset: 'statusBeforeRemoval' }
      ] as any);
      return { error: false };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Anonymise (DCP/RGPD) les boutiques d'un utilisateur : retire les données nominatives du
   * marchand (email, téléphone) tout en conservant l'enregistrement (nom commercial, statistiques
   * de transactions) pour ne pas fausser les données de l'application.
   */
  async anonymizePartnersByUserId(userId: string): Promise<any> {
    try {
      await this.dao.updateMany({ user: userId }, { email: null, phone: null, status: 'removed' });
      return { error: false };
    } catch (error) {
      return { error: true, data: error };
    }
  }
  /**
   * Récupère les partenaires ouverts à la date actuelle
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires ouverts
   */
  async getOpenPartners(payloads: { page?: number; pageSize?: number; ville?: string }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let ville: string = payloads.ville ?? '';

      // Obtenir la date et l'heure actuelles
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
      const currentTime = now.getHours() * 60 + now.getMinutes();

      // Construire la requête
      let query: any = {
        status: 'active',
        openingHours: {
          $elemMatch: {
            day: currentDay,
            isOpen: true,
            openTime: { $lte: currentTime },
            closeTime: { $gt: currentTime }
          }
        }
      };

      // Ajouter le filtre par ville si spécifié
      if (ville) {
        query.ville = ville;
      }

      const data:any = await this.dao.select({ params: query, page, pageSize });

      if (data.error) {
        throw data;
      }

      const rows: IPartner[] = data.rows;
      delete data.rows;

      return {
        data,
        rows
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les partenaires sponsorisés
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des partenaires sponsorisés
   */
  async getSponsoredPartners(payloads: { page?: number; pageSize?: number; ville?: string }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
      let pageSize: number = payloads.pageSize ?? 10;
      let ville: string = payloads.ville ?? '';

      // Construire la requête
      let query: any = {
        status: 'active',
        isSponsored: true
      };

      // Ajouter le filtre par ville si spécifié
      if (ville) {
        query.ville = ville;
      }

      const data:any = await this.dao.select({ params: query, page, pageSize });

      if (data.error) {
        throw data;
      }

      const rows: IPartner[] = data.rows;
      delete data.rows;

      return {
        data,
        rows
      };
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Résout les identifiants des partenaires selon le statut de certification (KYC) de leur
   * propriétaire (Client.isDocumentVerified). Sert au filtre « Pro : certifiés / non certifiés ».
   * @returns liste d'ObjectId de partenaires, ou null si aucun filtre de certification n'est demandé
   */
  private async getPartnerIdsByCertification(certified?: string): Promise<any[] | null> {
    const value = (certified ?? '').toLowerCase();

    if (value !== 'certified' && value !== 'uncertified') {
      return null;
    }

    const clientDao: any = new ClientSet();
    const clientFilter =
      value === 'certified'
        ? { isDocumentVerified: true }
        : { $or: [{ isDocumentVerified: { $ne: true } }, { isDocumentVerified: { $exists: false } }] };

    const clients: any = await clientDao.selectHug(clientFilter);
    const clientIds = Array.isArray(clients) ? clients.map((c: any) => c._id) : [];

    const model: any = (this.dao as any).defaultModel;
    const partners = await model
      .find({ status: { $nin: ['removed', 'archived'] }, user: { $in: clientIds } }, '_id')
      .lean();

    return Array.isArray(partners) ? partners.map((p: any) => p._id) : [];
  }

  /**
   * Répartition géographique des partenaires par ville (widget carte du dashboard admin).
   * @returns [{ ville, pros, lat, lng }] — lat/lng = moyenne des coordonnées connues, sinon null
   */
  async getGeoDistribution(filters?: { certified?: string }): Promise<any> {
    try {
      const model: any = (this.dao as any).defaultModel;

      const match: any = { status: { $nin: ['removed', 'archived'] }, ville: { $type: 'string', $ne: '' } };

      const certifiedIds = await this.getPartnerIdsByCertification(filters?.certified);

      if (certifiedIds !== null) {
        match._id = { $in: certifiedIds };
      }

      const rows = await model.aggregate([
        { $match: match },
        { $group: { _id: '$ville', pros: { $sum: 1 }, lat: { $avg: '$latitude' }, lng: { $avg: '$longitude' } } },
        { $sort: { pros: -1 } }
      ]);

      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        ville: r._id,
        pros: r.pros,
        lat: typeof r.lat === 'number' && !isNaN(r.lat) ? r.lat : null,
        lng: typeof r.lng === 'number' && !isNaN(r.lng) ? r.lng : null
      }));
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error || 'Erreur inconnue',
        location: this.serviceLabel,
        method: 'getGeoDistribution'
      });

      return { error: true, data: error };
    }
  }

  /**
   * Statistiques des partenaires : total actif et nouveaux sur la période avec tendance
   * (widget KPI « Nouveaux pros » du dashboard admin).
   * @returns { total, newInPeriod, trend }
   */
  async getStats(filters?: { from?: string; to?: string; certified?: string }): Promise<any> {
    try {
      const model: any = (this.dao as any).defaultModel;
      const base: any = { status: { $nin: ['removed', 'archived'] } };

      const certifiedIds = await this.getPartnerIdsByCertification(filters?.certified);

      if (certifiedIds !== null) {
        base._id = { $in: certifiedIds };
      }

      const total = await model.countDocuments(base);

      const from = filters?.from ?? '';
      const to = filters?.to ?? '';
      let newInPeriod: number | null = null;
      let trend: number | null = null;

      if (!coddyger.string.isEmpty(from) && !coddyger.string.isEmpty(to)) {
        const startDate = new Date(from);
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);

        const rangeMs = endDate.getTime() - startDate.getTime();
        const prevEnd = new Date(startDate.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - rangeMs);

        const created: number = await model.countDocuments({ ...base, createdAt: { $gte: startDate, $lte: endDate } });
        const previous: number = await model.countDocuments({ ...base, createdAt: { $gte: prevStart, $lte: prevEnd } });

        newInPeriod = created;
        trend = previous === 0 ? (created === 0 ? 0 : null) : Math.round(((created - previous) / previous) * 1000) / 10;
      }

      // Répartitions GLOBALES (pour les cartes de stats admin), indépendantes de la pagination.
      const [active, suspended, inactive, pending, cities] = await Promise.all([
        model.countDocuments({ ...base, status: 'active' }),
        model.countDocuments({ ...base, status: 'suspended' }),
        model.countDocuments({ ...base, status: 'inactive' }),
        model.countDocuments({ ...base, status: 'pending' }),
        model.distinct('ville', base).then((v: any[]) => v.filter(Boolean).length)
      ]);

      return { total, newInPeriod, trend, active, suspended, inactive, pending, cities };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error || 'Erreur inconnue',
        location: this.serviceLabel,
        method: 'getStats'
      });

      return { error: true, data: error };
    }
  }
}