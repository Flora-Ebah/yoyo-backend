import { IProfile } from './profile.interface';
import { ProfileSet } from './profile.model';
import coddyger, { IData, IErrorObject, LoggerService, LogLevel } from 'coddyger';

export class ProfileService {
  private readonly dao: IData<IProfile>;
  private readonly serviceLabel = 'ProfileService';

  constructor() {
    this.dao = new ProfileSet();
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

      const rows: IProfile[] = data.rows;
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
  async getHug(params?: any): Promise<IProfile[]> {
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
  async create(item: IProfile): Promise<any> {
    try {
      // Génération d'un ID si non fourni
      if (!item._id) {
        item._id = coddyger.string.generateObjectId();
      }
      
      // Ajout du statut par défaut si non fourni
      if (!item.status) {
        item.status = 'active';
      }

      // Génération d'un slug à partir du nom si non fourni (le modèle l'exige).
      if (!item.slug && item.name) {
        item.slug =
          item.name
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') + '-' + Date.now().toString(36);
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
  async update(id: string, item: Partial<IProfile>): Promise<IProfile | null> {
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
}