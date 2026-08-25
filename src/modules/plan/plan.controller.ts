import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PlanService } from './plan.service';
import { IPlan } from './plan.interface';

const controllerLabel: string = 'PlanController';

export class PlanController {
  private readonly service: PlanService;

  constructor() {
    this.service = new PlanService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getAll(payloads);
        
        resolve({
          status: defines.status.requestOK,
          message: items.data,
          data: items.rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getAll');
    });
  }

  /**
   * Récupère un élément par son ID
   * @param id ID de l'élément
   * @returns Élément trouvé ou null
   */
  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        
        if (!item) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Plan'),
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: item
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getById');
    });
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  create(item: IPlan) {
    return new Promise(async (resolve, reject) => {
      try {
        const newItem = await this.service.create(item);
        
        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: newItem
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'create');
    });
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  update(id: string, item: Partial<IPlan>) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Plan'),
            data: null
          });
        }
        
        // Mise à jour
        const updatedItem = await this.service.update(id, item);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: updatedItem
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'update');
    });
  }

  /**
   * Supprime un élément
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  delete(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Plan'),
            data: null
          });
        }
        
        // Suppression
        await this.service.delete(id);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'delete');
    });
  }

  /**
   * Récupère tous les plans actifs
   * @returns Liste des plans actifs
   */
  getActivePlans() {
    return new Promise(async (resolve, reject) => {
      try {
        const plans = await this.service.getActivePlans();
        
        resolve({
          status: defines.status.requestOK,
          message: 'Liste des plans actifs',
          data: plans
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getActivePlans');
    });
  }

  /**
   * Récupère le plan populaire/recommandé
   * @returns Le plan populaire
   */
  getPopularPlan() {
    return new Promise(async (resolve, reject) => {
      try {
        const plan = await this.service.getPopularPlan();
        
        if (!plan) {
          return resolve({
            status: defines.status.notFound,
            message: 'Aucun plan populaire trouvé',
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: 'Plan populaire',
          data: plan
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPopularPlan');
    });
  }

  /**
   * Calcule le prix total pour une durée spécifique
   * @param planId ID du plan
   * @param months Nombre de mois
   * @returns Prix total
   */
  calculatePrice(planId: string, months: number = 1) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(planId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.controller.wrongObjectId,
            data: null
          });
        }
        
        const result = await this.service.calculatePrice(planId, months);
        
        resolve({
          status: defines.status.requestOK,
          message: 'Calcul du prix effectué',
          data: result
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'calculatePrice');
    });
  }

  /**
   * Récupère les plans disponibles pour une catégorie spécifique de partenaires
   * @param category Catégorie de partenaire
   * @returns Liste des plans disponibles pour cette catégorie
   */
  getPlansByCategory(category: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const plans = await this.service.getPlansByCategory(category);
        
        resolve({
          status: defines.status.requestOK,
          message: `Plans disponibles pour la catégorie ${category}`,
          data: plans
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPlansByCategory');
    });
  }

  /**
   * Compare plusieurs plans de fidélité
   * @param planIds Liste des IDs des plans à comparer
   * @returns Détails des plans pour comparaison
   */
  comparePlans(planIds: string[]) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier que les IDs sont valides
        const invalidIds = planIds.filter(id => !coddyger.string.isValidObjectId(id));
        if (invalidIds.length > 0) {
          return resolve({
            status: defines.status.badRequest,
            message: 'Certains IDs de plans sont invalides',
            data: { invalidIds }
          });
        }
        
        const plans = await this.service.getPlansForComparison(planIds);
        
        if (!plans || plans.length === 0) {
          return resolve({
            status: defines.status.notFound,
            message: 'Aucun plan trouvé pour la comparaison',
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: 'Comparaison des plans',
          data: plans
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'comparePlans');
    });
  }
}