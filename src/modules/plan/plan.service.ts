import { IPlan } from './plan.interface';
import { PlanSet } from './plan.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class PlanService {
  private readonly dao: IData<IPlan>;
  private readonly serviceLabel = 'PlanService';

  constructor() {
    this.dao = new PlanSet();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }): Promise<any> {
    try {
      let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize ?? 10;
			let query: string = payloads.query ?? '';
			let status: any = payloads.status ?? '';

      let data: any | IErrorObject = {};

      if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: {}, page, pageSize });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { status }, page, pageSize });
			} else {
				data = await this.dao.select({
					params: {
						$or: [
							{ slug: { $regex: query || '', $options: 'i' } },
							{ title: { $regex: query || '', $options: 'i' } },
						]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

      const rows: IPlan[] = data.rows;
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
  async getHug(params?: any): Promise<IPlan[]> {
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
  async create(item: IPlan): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      
      return await this.dao.save(item);
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'create' 
      });
      throw error;
    }
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  async update(id: string, item: Partial<IPlan>): Promise<IPlan | null> {
    try {
      const result:any = await this.dao.update({ _id: id }, item);
      if (result.error) {
        throw new Error(result);
      }
      return this.getById(id);
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'update' 
      });
      throw error;
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
   * Récupère tous les plans actifs
   * @returns Liste des plans actifs
   */
  async getActivePlans(): Promise<IPlan[]> {
    try {
      const planSet = this.dao as PlanSet;
      return await planSet.getActivePlans();
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getActivePlans' 
      });
      throw error;
    }
  }

  /**
   * Récupère le plan populaire/recommandé
   * @returns Le plan populaire
   */
  async getPopularPlan(): Promise<IPlan | null> {
    try {
      const planSet = this.dao as PlanSet;
      return await planSet.getPopularPlan();
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getPopularPlan' 
      });
      throw error;
    }
  }

  /**
   * Calcule le prix total pour une durée spécifique
   * @param planId ID du plan
   * @param months Nombre de mois
   * @returns Prix total
   */
  async calculatePrice(planId: string, months: number = 1): Promise<{ basePrice: number; totalPrice: number; discount: number; currency: string }> {
    try {
      const planSet = this.dao as PlanSet;
      return await planSet.calculatePrice(planId, months);
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'calculatePrice' 
      });
      throw error;
    }
  }

  /**
   * Récupère les plans disponibles pour une catégorie spécifique de partenaires
   * @param category Catégorie de partenaire
   * @returns Liste des plans disponibles pour cette catégorie
   */
  async getPlansByCategory(category: string): Promise<IPlan[]> {
    try {
      // Si la catégorie est 'all', retourner tous les plans actifs
      if (category === 'all') {
        return await this.getActivePlans();
      }
      
      // Sinon, filtrer les plans qui incluent cette catégorie
      const allPlans = await this.getActivePlans();
      return allPlans.filter(plan => {
        // Si le plan a des catégories spécifiques et inclut 'all', il est disponible pour toutes les catégories
        if (plan.partnerCategories && 
            (plan.partnerCategories.includes('all') || plan.partnerCategories.includes(category))) {
          return true;
        }
        return false;
      });
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getPlansByCategory' 
      });
      throw error;
    }
  }

  /**
   * Récupère les détails de plusieurs plans pour comparaison
   * @param planIds Liste des IDs des plans à comparer
   * @returns Détails des plans pour comparaison
   */
  async getPlansForComparison(planIds: string[]): Promise<IPlan[]> {
    try {
      const plans: IPlan[] = [];
      
      // Récupérer chaque plan individuellement
      for (const planId of planIds) {
        const plan = await this.getById(planId);
        if (plan && plan.status !== 'removed') {
          plans.push(plan);
        }
      }
      
      return plans;
    } catch (error) {
      LoggerService.log({ 
        type: LogLevel.Error, 
        content: error, 
        location: this.serviceLabel, 
        method: 'getPlansForComparison' 
      });
      throw error;
    }
  }
}