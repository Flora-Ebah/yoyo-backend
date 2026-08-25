import coddyger, { IData, defines } from 'coddyger'
import { IAdmin, AdminSet } from './';
import { locale } from '../../public';

const dao: IData<IAdmin> = new AdminSet();

export class AdminService {
	static sampleMethod(apikey: string, controllerLabel: string) {
		return new Promise(async (resolve, reject) => {

		}).catch((err: any) => {
			return coddyger.catchReturn(err, 'AdminService', 'sampleMethod');
		});
	}

	/**
	 * Génère une réponse pour un ID invalide
	 * @returns Réponse formatée
	 */
	static invalidIdResponse() {
		return {
			status: defines.status.badRequest,
			message: locale.wrongObjectId("de l'enregistrement"),
			data: null
		};
	}
	
	/**
	 * Génère une réponse pour un élément non trouvé
	 * @param entity Nom de l'entité non trouvée
	 * @returns Réponse formatée
	 */
	static notFoundResponse(entity: string) {
		return { 
			status: defines.status.badRequest, 
			message: locale.notfound(entity), 
			data: null 
		};
	}
	
	/**
	 * Génère une réponse pour un email déjà existant
	 * @returns Réponse formatée
	 */
	static emailExistsResponse() {
		return { 
			status: defines.status.badRequest, 
			message: locale.exist('cet email'), 
			data: null 
		};
	}
	
	/**
	 * Génère une réponse de succès
	 * @param data Données à inclure dans la réponse
	 * @returns Réponse formatée
	 */
	static successResponse(data: any) {
		return {
			status: defines.status.requestOK,
			message: locale.controller.done,
			data
		};
	}
}
