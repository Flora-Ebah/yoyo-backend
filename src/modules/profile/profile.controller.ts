import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { ProfileService } from './profile.service';
import { IProfile } from './profile.interface';

const controllerLabel: string = 'ProfileController';

export class ProfileController {
  private readonly service: ProfileService;

  constructor() {
    this.service = new ProfileService();
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
            message: locale.notfound('Profile'),
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
  create(item: IProfile) {
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
  update(id: string, item: Partial<IProfile>) {
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
            message: locale.notfound('Profile'),
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
            message: locale.notfound('Profile'),
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
}