import coddyger, { IData, IErrorObject, defines } from 'coddyger'
import { locale } from "../../public";
import { IQuestion, QuestionSet } from "./question.model";
import { QuestionService } from './question.service';

const controllerLabel: string = 'QuestionController';

export class QuestionController {
	private readonly dao: IData<IQuestion>;
	private readonly service: QuestionService;

	constructor() {
		this.dao = new QuestionSet();
		this.service = new QuestionService();
	}

	// Function to save Question
	save(item: IQuestion) {
		return new Promise(async (resolve, reject) => {
			try {
				// Validate question
				const validationError = this.service.validateQuestion(item);
				if (validationError) {
					resolve({
						status: defines.status.badRequest,
						message: validationError,
						data: null
					});
					return;
				}

				// Check if question already exists
				const exists = await this.service.checkQuestionExists(item.questionText);
				if (exists) {
					resolve({
						status: defines.status.badRequest,
						message: locale.exist('cette question'),
						data: null
					});
					return;
				}

				// Calculate security level automatically
				item.securityLevel = this.service.calculateSecurityLevel(item);

				// Generate ID and slug
				item._id = coddyger.string.generateObjectId();
				item.slug = await this.service.generateSlug();
				
				// Set default values
				item.status = 'active';
				item.version = 1;
				item.createdBy = item.user; // Assuming user is the current authenticated user

				// Save the item
				const save: any | IErrorObject = await this.dao.save(item);
				if (save.error) {
					reject(save);
					return;
				}

				// Retrieve and return the saved item
				const updatedItem: any = await this.dao.selectOne({ _id: item._id });
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.successSave,
					data: updatedItem
				});

			} catch (e: any) {
				reject(coddyger.catchReturn(e, controllerLabel, 'save'));
			}
		});
	}

	// Function to save multiple Questions
	saveMany(items: IQuestion[]) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!Array.isArray(items) || items.length === 0) {
					resolve({
						status: defines.status.badRequest,
						message: 'Un tableau de questions est requis',
						data: null
					});
					return;
				}

				console.log(`Tentative d'enregistrement de ${items.length} questions`);

				interface ErrorItem {
					question: string;
					error: string;
					details?: any;
				}

				interface SuccessItem {
					_id?: string;
					slug?: string;
					questionText: string;
				}

				const results: {
					success: SuccessItem[];
					errors: ErrorItem[];
				} = {
					success: [],
					errors: []
				};

				// Process each question
				for (let i = 0; i < items.length; i++) {
					const item = items[i];
					try {
						console.log(`Traitement de la question ${i+1}/${items.length}: "${item.questionText?.substring(0, 30)}..."`);
						
						// Vérifier les champs obligatoires
						if (!item.questionText) {
							results.errors.push({
								question: `Question #${i+1}`,
								error: 'Le texte de la question est requis',
								details: item
							});
							continue;
						}

						// Vérification du code de langue supprimée car maintenant facultatif
						// Ajouter un code de langue par défaut si non fourni
						if (!item.languageCode) {
							item.languageCode = 'fr-FR';
						}

						if (!item.category) {
							results.errors.push({
								question: item.questionText,
								error: 'La catégorie est requise',
								details: { category: item.category }
							});
							continue;
						}

						// Validate question
						const validationError = this.service.validateQuestion(item);
						if (validationError) {
							results.errors.push({
								question: item.questionText,
								error: validationError,
								details: item
							});
							continue;
						}

						// Check if question already exists
						const exists = await this.service.checkQuestionExists(item.questionText);
						if (exists) {
							results.errors.push({
								question: item.questionText,
								error: locale.exist('cette question')
							});
							continue;
						}

						// Calculate security level automatically
						item.securityLevel = this.service.calculateSecurityLevel(item);

						// Generate ID and slug
						item._id = coddyger.string.generateObjectId();
						item.slug = await this.service.generateSlug();
						
						// Set default values
						item.status = 'active';
						item.version = 1;
						item.createdBy = item.user; // Assuming user is the current authenticated user

						// Save the item
						const save: any | IErrorObject = await this.dao.save(item);
						if (save.error) {
							results.errors.push({
								question: item.questionText,
								error: save.message || 'Erreur lors de l\'enregistrement',
								details: save
							});
							continue;
						}

						// Add to success list
						results.success.push({
							_id: item._id,
							slug: item.slug,
							questionText: item.questionText
						});
						console.log(`Question "${item.questionText?.substring(0, 30)}..." enregistrée avec succès`);
					} catch (itemError) {
						console.error('Erreur lors du traitement de la question:', itemError);
						results.errors.push({
							question: item.questionText || `Question #${i+1}`,
							error: 'Erreur interne lors du traitement',
							details: itemError
						});
					}
				}

				// Return results
				resolve({
					status: defines.status.requestOK,
					message: `${results.success.length} question(s) enregistrée(s) avec succès, ${results.errors.length} erreur(s)`,
					data: results
				});

			} catch (e: any) {
				reject(coddyger.catchReturn(e, controllerLabel, 'saveMany'));
			}
		});
	}

	// Function to update Question
	update(item: IQuestion) {
		return new Promise(async (resolve, reject) => {
			try {
				const _id = item._id!;

				// Validate ObjectId
				if (!coddyger.string.isValidObjectId(_id)) {
					resolve({ 
						status: defines.status.badRequest, 
						message: locale.wrongObjectId("de l'enregistrement"), 
						data: null 
					});
					return;
				}

				// Validate question
				const validationError = this.service.validateQuestion(item);
				if (validationError) {
					resolve({
						status: defines.status.badRequest,
						message: validationError,
						data: null
					});
					return;
				}

				// Check if question exists
				const exists = await this.dao.exist({ _id });
				if (!exists) {
					resolve({ 
						status: defines.status.badRequest, 
						message: locale.notfound('Question'), 
						data: null 
					});
					return;
				}

				// Check for duplicate question text
				const isDuplicate = await this.service.checkQuestionExists(item.questionText, _id);
				if (isDuplicate) {
					resolve({ 
						status: defines.status.badRequest, 
						message: locale.exist('cette question'), 
						data: null 
					});
					return;
				}

				// Recalculate security level
				item.securityLevel = this.service.calculateSecurityLevel(item);

				// Update metadata
				item.updatedBy = item.user;
				item.version = (item.version || 1) + 1;

				// Update the item
				const update: any = await this.dao.update({ _id }, item);
				if (update.error) {
					reject(update);
					return;
				}

				// Retrieve and return the updated item
				const updatedItem: any = await this.dao.selectOne({ _id }, '-__v');
				resolve({
					status: defines.status.requestOK,
					message: locale.controller.done,
					data: updatedItem
				});

			} catch (e: any) {
				reject(coddyger.catchReturn(e, controllerLabel, 'update'));
			}
		});
	}

	// Function to remove Question
	remove(_id: string, erase?: boolean) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(_id)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				// Controller l'existence de l'élément
				let isData: any = await this.dao.exist({ _id });

				if (isData.error) {
					reject(isData);
				} else if (isData === false) {
					resolve({ status: defines.status.notFound, message: locale.notfound('Enregistrement'), data: null });
				} else {
					const remove: any = erase ? await this.dao.remove({ _id }) : await this.dao.update({ _id }, { status: 'removed' });

					if (remove.error) {
						reject(remove);
					} else {
						// Retrieve the updated demand item from the database
						const updatedItem: any = await this.dao.selectOne({ _id });
						// Resolve with a success response and the updated demand item
						resolve({
							status: defines.status.requestOK,
							message: locale.controller.done,
							data: updatedItem
						});
					}
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'remove');
		});
	}

	// Function to restore Question
	restore(_id: string) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(_id)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				// Controller l'existence de l'élément
				let isData: any = await this.dao.exist({ _id });

				if (isData.error) {
					reject(isData);
				} else if (isData === false) {
					resolve({ status: defines.status.notFound, message: locale.notfound('Enregistrement'), data: null });
				} else {
					const remove: any = await this.dao.update({ _id }, { status: 'active' });

					if (remove.error) {
						reject(remove);
					} else {
						// Retrieve the updated demand item from the database
						const updatedItem: any = await this.dao.selectOne({ _id });
						// Resolve with a success response and the updated demand item
						resolve({
							status: defines.status.requestOK,
							message: locale.controller.done,
							data: updatedItem
						});
					}
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'remove');
		});
	}

	// Function to select with parameters Question
	select(payloads: { page?: number; pageSize?: number; query?: string; date?: string, params?: any, sortBy?:string, orderBy?:string, status?:string, from?: string, to?: string}) {
		return new Promise(async (resolve, reject) => {
			const page: number = payloads.page || 1;
			const pageSize: number = payloads.pageSize!;
			const query: string = payloads.query!;
			const status: any = payloads.status!;
			const sortBy: string = payloads.sortBy ?? ''
      const orderBy: string = payloads.orderBy ?? ''
			const from: string = payloads.from ?? ''
			const to: string = payloads.to ?? ''

			let data: any | IErrorObject = {};

			// Filtres combinés (statut, plage de dates sur createdAt, recherche texte).
			const params: any = {};

			if (!coddyger.string.isEmpty(status)) {
				params.status = status;
			}

			if (!coddyger.string.isEmpty(from) || !coddyger.string.isEmpty(to)) {
				params.createdAt = {};

				if (!coddyger.string.isEmpty(from)) {
					params.createdAt.$gte = new Date(from);
				}

				if (!coddyger.string.isEmpty(to)) {
					const end = new Date(to);
					end.setHours(23, 59, 59, 999);
					params.createdAt.$lte = end;
				}
			}

			if (!coddyger.string.isEmpty(query)) {
				params.$or = [
					{ questionText: { $regex: query, $options: 'i' } },
					{ category: { $regex: query, $options: 'i' } },
					{ languageCode: { $regex: query, $options: 'i' } }
				];
			}

			data = await this.dao.select({ params, page, pageSize, sort: sortBy || 'createdAt', orderBy: orderBy || 'desc' });

			if (data.error) {
				reject(data);
				return;
			}

			const rows: IQuestion[] = data.rows;
			delete data.rows;

			resolve({
				status: defines.status.requestOK,
				message: data,
				data: rows
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'select');
		});
	}

	// Function to select all Question
	selectAll() {
		return new Promise(async (resolve, reject) => {
			const data: any | IErrorObject = await this.dao.selectHug();
			if (data.error) {
				reject(data);
				return;
			}

			const rows: IQuestion[] = data;

			resolve({
				status: defines.status.requestOK,
				message: {
					totalRows: rows.length
				},
				data: rows || []
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectAll');
		});
	}

	// Function to select detail of Question by id
	selectOne(payload: string) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(payload)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				const local: any | IErrorObject = await this.dao.selectOne({ _id: payload });

				if (local) {
					resolve({
						status: defines.status.requestOK,
						message: 'OK',
						data: local
					});
				} else {
					resolve({
						status: defines.status.notFound,
						message: locale.notfound('Enregistrement'),
						data: null
					});
					return;
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectOne');
		});
	}

	selectByStatus(payloads: { page?: number; pageSize?: number; status: string }) {
		return new Promise(async (resolve, reject) => {
			let page: number = payloads.page || 1;
			let pageSize: number = payloads.pageSize!;
			let status: any = payloads.status!;

			const data: any | IErrorObject = await this.dao.select({ params: {
				status
			}, page,
			pageSize});

			if (data.error) {
				reject(data);
				return;
			}

			const rows: IQuestion[] = data.rows;
			delete data.rows;

			resolve({
				status: defines.status.requestOK,
				message: data,
				data: rows
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectByStatus');
		});
	}
}
