import coddyger, { IData, IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { ICertification, CertificationSet } from './';
import { CertificationService } from './certification.service';
// import { ClientService, ClientSet, IClient } from '../client';

const controllerLabel: string = 'CertificationController';

export class CertificationController {
	private readonly dao: IData<ICertification>;
	// private readonly serviceClient: ClientService;

	constructor() {
		this.dao = new CertificationSet();
		// this.serviceClient = new ClientService();
	}

	// Function to get document types
	getDocumentTypes() {
		return CertificationService.getDocumentTypes();
	}

	// Function to save Certification
	save(item: ICertification) {
		return new Promise(async (resolve, reject) => {
			try {
				// Vérifier les champs requis
				if (!item.documentType || !Array.isArray(item.documentFile) || item.documentFile.length === 0 || !item.user) {
					resolve({
						status: defines.status.badRequest,
						message:
							'Champs requis manquants ou invalides (documentType, documentFile doit être un tableau non vide, user)',
						data: null
					});
					return;
				}

				// Sauvegarder le document via le service
				const savedDoc = await CertificationService.saveDocument(item);

				if (savedDoc.error) {
					reject(savedDoc);
				} else {
					resolve({
						status: defines.status.requestOK,
						message: locale.controller.successSave,
						data: savedDoc
					});
				}
			} catch (error: any) {
				reject(coddyger.catchReturn(error, controllerLabel, 'save'));
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'save');
		});
	}

	// Function to update Certification
	update(item: ICertification) {
		return new Promise(async (resolve, reject) => {
			try {
				if (!item._id || !coddyger.string.isValidObjectId(item._id)) {
					resolve({
						status: defines.status.badRequest,
						message: locale.wrongObjectId("de l'enregistrement"),
						data: null
					});
					return;
				}

				// Mettre à jour le document via le service
				const updatedDoc = await CertificationService.updateDocument(item);

				if (updatedDoc.error) {
					reject(updatedDoc);
				} else {
					resolve({
						status: defines.status.requestOK,
						message: locale.controller.done,
						data: updatedDoc
					});
				}
			} catch (error: any) {
				reject(coddyger.catchReturn(error, controllerLabel, 'update'));
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'update');
		});
	}

	completePhoneVerification(item: { contact: string, client: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const { contact, client } = item;

				if (coddyger.string.isValidObjectId(client) === false) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.wrongObjectId('client'),
						data: null
					});
				}

				// Validate phone number format
				// const phoneValidation = this.serviceClient.validateIvorianPhoneNumber(contact);
				// if (!phoneValidation.isValid) {
				// 	return resolve({
				// 		status: defines.status.badRequest,
				// 		message: locale.controller.client.invalidPhoneFormat,
				// 		data: null
				// 	});
				// }

				// // Check if phone number is already used
				// const existingClient = await this.daoClient.selectOne({ contact, _id: { $ne: client } });
				// if (existingClient) {
				// 	return resolve({
				// 		status: defines.status.badRequest,
				// 		message: locale.controller.client.phoneNumberAlreadyUsed,
				// 		data: null
				// 	});
				// }

				// Update client
				// const updatedClient:any = await this.daoClient.update(
				// 	{ _id: client },
				// 	{ contact: contact, isContactVerified: true }
				// );

				// if (updatedClient.error) {
				// 	return reject(updatedClient);
				// }

				resolve({
					status: defines.status.requestOK,
					message: locale.controller.client.phoneNumberUpdated,
					data: null
				});
			} catch (error: any) {
				reject(error);
			}
		}).catch((e: IErrorObject) => {
			console.log(e);
			return coddyger.catchReturn(e, controllerLabel, 'completePhoneVerification');
		});
	}

	// Function to remove Certification
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
					const remove: any = erase
						? await this.dao.remove({ _id })
						: await this.dao.update({ _id }, { status: 'removed' });

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

	// Function to restore Certification
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

	// Function to select with parameters Certification
	select(payloads: {
		page?: number;
		pageSize?: number;
		query?: string;
		date?: string;
		params?: any;
		sortBy?: string;
		orderBy?: string;
		status?: string;
		from?: string;
		to?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			const page: number = payloads.page || 1;
			const pageSize: number = payloads.pageSize!;
			const query: string = payloads.query!;
			const status: any = payloads.status!;
			const sortBy: string = payloads.sortBy ?? '';
			const orderBy: string = payloads.orderBy ?? '';
			const from: string = payloads.from ?? '';
			const to: string = payloads.to ?? '';

			let data: any | IErrorObject = {};

			// Filtres combinés (statut, plage de dates sur createdAt, recherche type).
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
				params.$or = [{ documentType: { $regex: query, $options: 'i' } }];
			}

			data = await this.dao.select({ params, page, pageSize, sort: sortBy || 'createdAt', orderBy: orderBy || 'desc' });

			if (data.error) {
				reject(data);
				return;
			}

			const rows: ICertification[] = data.rows;
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

	// Function to select all Certification
	selectAll() {
		return new Promise(async (resolve, reject) => {
			const data: any | IErrorObject = await this.dao.selectHug();
			if (data.error) {
				reject(data);
				return;
			}

			const rows: ICertification[] = data;

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

	// Function to select detail of Certification by id
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

	// select one by user
	selectByUser(payload: string) {
		return new Promise(async (resolve, reject) => {
			if (!coddyger.string.isValidObjectId(payload)) {
				resolve({ status: defines.status.badRequest, message: locale.controller.wrongObjectId, data: null });
			} else {
				const local: any | IErrorObject = await this.dao.selectOne({ user: payload });

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
			return coddyger.catchReturn(e, controllerLabel, 'selectByUser');
		});
	}

	selectByStatus(payloads: { page?: number; pageSize?: number; status: string }) {
		return new Promise(async (resolve, reject) => {
			let page: number = payloads.page || 1;
			let pageSize: number = payloads.pageSize!;
			let status: any = payloads.status!;

			const data: any | IErrorObject = await this.dao.select({
				params: {
					status
				},
				page,
				pageSize
			});

			if (data.error) {
				reject(data);
				return;
			}

			const rows: ICertification[] = data.rows;
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

	selectDocumentTypes() {
		return new Promise(async (resolve, reject) => {
			const data: any = CertificationService.getDocumentTypes().data;

			resolve({
				status: defines.status.requestOK,
				message: 'Ok',
				data: data
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectDocumentTypes');
		});
	}

	selectRejectionReasons() {
		return new Promise(async (resolve, reject) => {
			const data: any = CertificationService.getRejectionReasons().data;

			resolve({
				status: defines.status.requestOK,
				message: 'Ok',
				data: data
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectRejectionReasons');
		});
	}

	selectVerificationStatuses() {
		return new Promise(async (resolve, reject) => {
			const data: any = CertificationService.getVerificationStatuses().data;

			resolve({
				status: defines.status.requestOK,
				message: 'Ok',
				data: data
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'selectVerificationStatuses');
		});
	}
}
