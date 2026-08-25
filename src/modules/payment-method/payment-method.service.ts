import { IPaymentMethod } from './payment-method.interface';
import { PaymentMethodSet } from './payment-method.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class PaymentMethodService {
  private readonly dao: IData<IPaymentMethod>;
  private readonly serviceLabel = 'PaymentMethodService';

  constructor() {
    this.dao = new PaymentMethodSet();
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
						$or: [{ slug: { $regex: query || '', $options: 'i' } }, { title: { $regex: query || '', $options: 'i' } }]
					},
					page,
					pageSize
				});
			}

			if (data.error) {
				throw data;
			}

			const rows: IPaymentMethod[] = data.rows;
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
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  async getHug(params?: any): Promise<IPaymentMethod[] | IErrorObject> {
    try {
      const result:any = await this.dao.selectHug(params);
      return result;
    } catch (error) {
      return { error: true, data: error };
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
      return { error: true, data: error };
    }
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  async create(item: IPaymentMethod): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      
      return await this.dao.save(item);
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Met à jour un élément existant
   * @param id ID de l'élément à mettre à jour
   * @param item Nouvelles données
   * @returns Élément mis à jour
   */
  async update(id: string, item: Partial<IPaymentMethod>): Promise<IPaymentMethod | IErrorObject> {
    try {
      const result:any = await this.dao.update({ _id: id }, item);
      if (result.error) {
        throw new Error(result);
      }
      return this.getById(id);
    } catch (error) {
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
	 * Récupère le dernier élément
	 * @returns Dernier élément
	 */
	async selectLatest(): Promise<IPaymentMethod | null> {
		try {
			const result: any = await this.dao.selectLatest();
			return result;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Récupère le dernier élément avec des paramètres
	 * @param params Paramètres de la requête
	 * @returns Dernier élément
	 */
	async selectLatestWithParams(params: any): Promise<IPaymentMethod | null> {
		try {
			const result: any = await this.dao.selectLatestWithParams(params);
			return result;
		} catch (error) {
			return null;
		}
	}

  /**
   * Récupère un élément par ses paramètres
   * @param params Paramètres de la requête
   * @returns Élément trouvé ou null
   */
  async getOne(params: any, fields: string = ""): Promise<any> {
    try {
      return await this.dao.selectOne(params, fields);
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les méthodes de paiement actives par type
   * @param type Type de méthode de paiement
   * @returns Liste des méthodes de paiement
   */
  async getByType(type: string): Promise<any> {
    try {
      const result = await this.dao.selectHug({ 
        type, 
        status: 'active' 
      });
      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les méthodes de paiement actives par provider
   * @param provider Provider de paiement
   * @returns Liste des méthodes de paiement
   */
  async getByProvider(provider: string): Promise<any> {
    try {
      const result = await this.dao.selectHug({ 
        provider, 
        status: 'active' 
      });
      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère toutes les méthodes de paiement actives
   * @returns Liste des méthodes de paiement actives
   */
  async getActiveMethods(): Promise<any> {
    try {
      const result = await this.dao.selectHug({ 
        status: 'active' 
      });
      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Récupère les méthodes de paiement par type et provider
   * @param type Type de méthode de paiement
   * @param provider Provider de paiement
   * @returns Liste des méthodes de paiement
   */
  async getByTypeAndProvider(type: string, provider: string): Promise<any> {
    try {
      const result = await this.dao.selectHug({ 
        type, 
        provider, 
        status: 'active' 
      });
      return result;
    } catch (error) {
      return { error: true, data: error };
    }
  }

  /**
   * Vérifie si une méthode de paiement existe et est active
   * @param id ID de la méthode de paiement
   * @returns true si la méthode existe et est active
   */
  async isMethodActive(id: string): Promise<boolean> {
    try {
      const method = await this.dao.selectOne({ 
        _id: id, 
        status: 'active' 
      });
      return !!method;
    } catch (error) {
      return false;
    }
  }

  /**
   * Met à jour le statut d'une méthode de paiement
   * @param id ID de la méthode de paiement
   * @param status Nouveau statut
   * @returns Résultat de l'opération
   */
  async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended' | 'removed'): Promise<any> {
    try {
      const result: any = await this.dao.update({ _id: id }, { status });
      if (result.error) {
        throw new Error(result);
      }
      return this.getById(id);
    } catch (error) {
      return { error: true, data: error };
    }
  }
}