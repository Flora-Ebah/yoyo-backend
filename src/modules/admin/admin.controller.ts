import coddyger, { IData, IErrorObject, defines, env } from 'coddyger';
import { locale } from '../../public';
import { IAdmin, AdminSet } from './';
import { IProfile, ProfileSet } from '../profile';
import { TokenMiddleware } from '../../api/middleware';
import { AdminService } from './admin.service';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';

const controllerLabel: string = 'AdminController';

export class AdminController {
	private readonly dao: IData<IAdmin>;
	private readonly daoProfile: IData<IProfile>;

	constructor() {
		this.dao = new AdminSet();
		this.daoProfile = new ProfileSet();
	}

	// Function to login Admin
	login(item: IAdmin) {
		return new Promise(async (resolve, reject) => {
			const { email, password }: any = item;
			const defaultAccount: any = process.env.DEFAULT_ACCOUNT?.split(':');

			if ((env.mode === 'dev' || env.mode === 'DEV') && defaultAccount.includes(email)) {
				return resolve(this.loginDemo(item));
			}

			const isData: any = await this.dao.selectOne({ email });

			if (!isData) {
				return resolve({
					status: defines.status.badRequest,
					message: locale.notfound('cet email'),
					data: null
				});
			}

			let user: any = await this.dao.selectOne({ email }, '-__v');
			let verifyPassword: any = await coddyger.string.decryptPassword(password, user.password);

			if (verifyPassword === false) {
				resolve({
					status: defines.status.badRequest,
					message: locale.controller.loginFailed,
					data: 'wrongway'
				});

				return;
			}

			if (isData.profile.status !== 'active') {
				return resolve({ status: defines.status.badRequest, message: locale.controller.disabledProfile, data: null });
			}

			const accessToken: any = await TokenMiddleware.generate(
				{ _id: isData._id, email: email, isAdmin: true },
				'accessToken'
			);
			const refreshToken: any = await TokenMiddleware.generate(
				{ _id: isData._id, email: email, isAdmin: true },
				'refreshToken'
			);

			return resolve({
				status: defines.status.requestOK,
				message: locale.controller.done,
				data: {
					accessToken,
					refreshToken,
					user
				}
			});
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'login');
		});
	}

	private loginDemo(item: IAdmin) {
		return new Promise(async (resolve, reject) => {
			console.log('loggin in demo...');
			const { email, password }: any = item;
			const localAuth: any = await this.dao.selectOne({ email });
			if (!localAuth) {
				return resolve({
					status: defines.status.badRequest,
					message: locale.notfound('cet email'),
					data: null
				});
			}

			const isPassword: any = await coddyger.string.decryptPassword(password, localAuth.password);
			if (isPassword === false) {
				return resolve({
					status: defines.status.badRequest,
					message: locale.controller.loginFailed,
					data: null
				});
			}

			await this.dao.update({ email }, { lastLogin: new Date() });

			const accessToken: any = await TokenMiddleware.generate(
				{ _id: localAuth._id, email: localAuth.email, isAdmin: true },
				'accessToken'
			);
			const refreshToken: any = await TokenMiddleware.generate(
				{ _id: localAuth._id, email: localAuth.email, isAdmin: true },
				'refreshToken'
			);

			delete localAuth.password;

			resolve({
				status: defines.status.requestOK,
				message: 'ok',
				data: {
					accessToken,
					refreshToken,
					user: localAuth
				}
			});
		});
	}

	// Function to save Admin
	save(item: IAdmin) {
		return new Promise(async (resolve, reject) => {
			const { email, profile, password }: any = item;

			const isEmailExists: any = await this.dao.exist({ email });
			const isProfileExists: any = await this.daoProfile.exist({ _id: profile });

			if (isEmailExists) {
				resolve({
					status: defines.status.badRequest,
					message: locale.exist('cet email'),
					data: null
				});
			} else if (!isProfileExists) {
				resolve({
					status: defines.status.badRequest,
					message: locale.notfound('Profil'),
					data: null
				});
			} else if (coddyger.string.isEmpty(password)) {
				resolve({
					status: defines.status.badRequest,
					message: locale.required('mot de passe'),
					data: null
				});
			} else {
				const theLast: any = await this.dao.selectLatest();
				item._id = coddyger.string.generateObjectId();
				item.slug = coddyger.buildSlug('ADM', theLast ? theLast.slug : null);
				item.password = await coddyger.string.encryptPassword(password);
				item.type = item.type || 'interne';
				item.status = item.status || 'active';

				const save: any | IErrorObject = await this.dao.save(item);

				if (save.error) {
					reject(save);
				} else {
					const updatedItem: any = await this.dao.selectOne({ _id: item._id });

					// Message d'accueil déposé dans la cloche : le titulaire le découvrira à sa
					// première connexion. Ne peut pas faire échouer la création du compte.
					await NotificationHelper.notifyAdminInApp({
						to: item._id,
						title: 'Bienvenue sur YoYo',
						message: 'Votre compte a été créé. Vous pouvez commencer à utiliser la plateforme.',
						category: NotificationCategory.INFO,
						metadata: { type: 'admin', adminId: String(item._id) }
					});

					resolve({
						status: defines.status.requestOK,
						message: locale.controller.successSave,
						data: updatedItem
					});
				}
			}
		}).catch((e: IErrorObject) => {
			return coddyger.catchReturn(e, controllerLabel, 'save');
		});
	}

	// Function to update Admin
	update(item: IAdmin) {
		return new Promise(async (resolve, reject) => {
			const _id: string = item._id!;
			const { email, profile, password } = item;

			if (!coddyger.string.isValidObjectId(_id)) {
				return resolve(AdminService.invalidIdResponse());
			}

			try {
				const isData: any = await this.dao.exist({ _id });
				if (isData.error) {
					return reject(isData);
				}
				if (isData === false) {
					return resolve(AdminService.notFoundResponse('Enregistrement'));
				}

				const isEmailExists: any = await this.dao.exist({ email });
				const ownEmail: any = await this.dao.exist({ $and: [{ email }, { _id }] });
				if (isEmailExists && !ownEmail) {
					return resolve(AdminService.emailExistsResponse());
				}

				if (profile) {
					const isProfileExists: any = await this.daoProfile.exist({ _id: profile });
					if (!isProfileExists) {
						return resolve({
							status: defines.status.badRequest,
							message: locale.notfound('Profil'),
							data: null
						});
					}
				}

				if (!coddyger.string.isEmpty((password || '') as string)) {
					item.password = await coddyger.string.encryptPassword(password as string);
				} else {
					delete item.password;
				}

				const update: any = await this.dao.update({ _id }, item);
				if (update.error) {
					return reject(update);
				}

				const updatedItem: any = await this.dao.selectOne({ _id }, '-__v');
				return resolve(AdminService.successResponse(updatedItem));
			} catch (e) {
				return coddyger.catchReturn(e, controllerLabel, 'update');
			}
		});
	}

	// Function to remove Admin
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

	// Function to restore Admin
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

	// Function to select with parameters Admin
	select(payloads: {
		page?: number;
		pageSize?: number;
		query?: string;
		date?: string;
		params?: any;
		sortBy?: string;
		orderBy?: string;
		status?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			const page: number = payloads.page ?? 1;
			const pageSize: number = payloads.pageSize!;
			const query: string = payloads.query!;
			const status: any = payloads.status!;
			const sortBy: string = payloads.sortBy ?? '';
			const orderBy: string = payloads.orderBy ?? '';

			let data: any | IErrorObject = {};

			if (coddyger.string.isEmpty(query) && coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: {}, page, pageSize });
			} else if (!coddyger.string.isEmpty(sortBy) || !coddyger.string.isEmpty(orderBy)) {
				data = await this.dao.select({ params: {}, page, pageSize, sort: sortBy, orderBy });
			} else if (!coddyger.string.isEmpty(status)) {
				data = await this.dao.select({ params: { status }, page, pageSize, sort: sortBy, orderBy });
			} else {
				data = await this.dao.select({
					params: {
						$or: [
							{ slug: { $regex: query || '', $options: 'i' } },
							{ email: { $regex: query || '', $options: 'i' } },
							{ lastname: { $regex: query || '', $options: 'i' } },
							{ firstname: { $regex: query || '', $options: 'i' } },
							{ matricule: { $regex: query || '', $options: 'i' } }
						]
					},
					page,
					pageSize,
					sort: sortBy,
					orderBy
				});
			}

			if (data.error) {
				reject(data);
				return;
			}

			const rows: IAdmin[] = data.rows;
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

	// Function to select all Admin
	selectAll() {
		return new Promise(async (resolve, reject) => {
			const data: any | IErrorObject = await this.dao.selectHug();
			if (data.error) {
				reject(data);
				return;
			}

			const rows: IAdmin[] = data;

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

	// Function to select detail of Admin by id
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

	// Function to select current admin from token payload
	selectMe(payload: { _id?: string; email?: string }) {
		return new Promise(async (resolve, reject) => {
			try {
				const adminId = payload?._id;
				const adminEmail = payload?.email;

				if (!adminId && !adminEmail) {
					return resolve({
						status: defines.status.badRequest,
						message: locale.notfound('Administrateur'),
						data: null
					});
				}

				// Le compte doit encore être en vigueur : un admin archivé ou supprimé dont le jeton
				// n'a pas expiré ne doit plus pouvoir recharger son profil (donc ses permissions).
				const query: any = adminId ? { _id: adminId } : { email: adminEmail };
				query.status = { $nin: ['removed', 'archived'] };

				// `-password` : l'empreinte du mot de passe n'a rien à faire dans une réponse HTTP,
				// même adressée au titulaire du compte. Le front ne consomme que `profile.ability`.
				const local: any | IErrorObject = await this.dao.selectOne(query, '-password -__v');

				if (local) {
					return resolve({
						status: defines.status.requestOK,
						message: 'OK',
						data: local
					});
				}

				return resolve({
					status: defines.status.notFound,
					message: locale.notfound('Administrateur'),
					data: null
				});
			} catch (e: any) {
				return coddyger.catchReturn(e, controllerLabel, 'selectMe');
			}
		});
	}

	selectByStatus(payloads: { page?: number; pageSize?: number; status: string }) {
		return new Promise(async (resolve, reject) => {
			let page: number = payloads.page ?? 1;
			let pageSize: number = payloads.pageSize!;
			let status: any = payloads.status;

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

			const rows: IAdmin[] = data.rows;
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

	// Function to select admins by date range
	selectByDateRange(payloads: {
		startDate: string;
		endDate: string;
		page?: number;
		pageSize?: number;
		sortBy?: string;
		orderBy?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			try {
				const page: number = payloads.page ?? 1;
				const pageSize: number = payloads.pageSize ?? 10;
				const startDate = new Date(payloads.startDate);
				const endDate = new Date(payloads.endDate);

				// Validate dates
				if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
					resolve({
						status: defines.status.badRequest,
						message: locale.controller.invalidDate,
						data: null
					});
					return;
				}

				// Set time to start and end of day
				startDate.setHours(0, 0, 0, 0);
				endDate.setHours(23, 59, 59, 999);

				const data: any | IErrorObject = await this.dao.select({
					params: {
						createdAt: {
							$gte: startDate,
							$lte: endDate
						},
						status: { $nin: ['removed', 'archived'] }
					},
					page,
					pageSize,
					sort: payloads.sortBy,
					orderBy: payloads.orderBy
				});

				if (data.error) {
					reject(data);
					return;
				}

				const rows: IAdmin[] = data.rows;
				delete data.rows;

				resolve({
					status: defines.status.requestOK,
					message: data,
					data: rows
				});
			} catch (error) {
				return coddyger.catchReturn(error, controllerLabel, 'selectByDateRange');
			}
		});
	}

	// Function to select admins by last login date range
	selectByLastLoginRange(payloads: {
		startDate: string;
		endDate: string;
		page?: number;
		pageSize?: number;
		sortBy?: string;
		orderBy?: string;
	}) {
		return new Promise(async (resolve, reject) => {
			try {
				const page: number = payloads.page ?? 1;
				const pageSize: number = payloads.pageSize ?? 10;
				const startDate = new Date(payloads.startDate);
				const endDate = new Date(payloads.endDate);

				// Validate dates
				if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
					resolve({
						status: defines.status.badRequest,
						message: locale.controller.invalidDate,
						data: null
					});
					return;
				}

				// Set time to start and end of day
				startDate.setHours(0, 0, 0, 0);
				endDate.setHours(23, 59, 59, 999);

				const data: any | IErrorObject = await this.dao.select({
					params: {
						lastLogin: {
							$gte: startDate,
							$lte: endDate
						},
						status: { $nin: ['removed', 'archived'] }
					},
					page,
					pageSize,
					sort: payloads.sortBy,
					orderBy: payloads.orderBy
				});

				if (data.error) {
					reject(data);
					return;
				}

				const rows: IAdmin[] = data.rows;
				delete data.rows;

				resolve({
					status: defines.status.requestOK,
					message: data,
					data: rows
				});
			} catch (error) {
				return coddyger.catchReturn(error, controllerLabel, 'selectByLastLoginRange');
			}
		});
	}
}

