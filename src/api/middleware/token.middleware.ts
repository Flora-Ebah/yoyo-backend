import jwt from 'jsonwebtoken';
import coddyger, { defines, env } from 'coddyger';
import { TokenSet } from '../../shared';

const secretKey: string = env.jwt.secret!;
const secretAuthKey: string = env.jwt.secretAuth!;

const daoToken: any = new TokenSet();

export class TokenMiddleware {
	static async verify(request, reply, done) {
		try {
			const authorization = request.headers.authorization;
			if (!authorization) {
				throw new Error('No authorization header');
			}

			const token = authorization.split(' ')[1];

			// Check if token is deactivated
			const isDeactivated = await TokenMiddleware.isTokenDeactivated(token);
			if (isDeactivated) {
				throw new Error('Votre session a expiré');
			}

			const user: any = await new Promise((resolve, reject) => {
				jwt.verify(token, secretKey, (err, user) => {
					if (err) {
						let errLabel = 'Authentication error';
						if (err.name === 'TokenExpiredError') {
							errLabel = 'Session expired';
						} else if (err.name === 'JsonWebTokenError') {
							errLabel = 'Invalid token';
						}
						reject(new Error(errLabel));
					} else {
						resolve(user);
					}
				});
			});

			request.user = user;
		} catch (error: any) {
			return coddyger.api(
				reply,
				Promise.resolve({
					status: defines.status.authError,
					message: error.message,
					data: null
				})
			);
		}
	}

	static async verifyAdmin(request, reply, done) {
		try {
			const authorization = request.headers.authorization;

			if (!authorization) {
				throw new Error('No authorization header');
			}

			const token = authorization.split(' ')[1];

			// Check if token is deactivated
			const isDeactivated = await TokenMiddleware.isTokenDeactivated(token);
			if (isDeactivated) {
				throw new Error('Votre session a expiré');
			}

			const user: any = await new Promise((resolve, reject) => {
				jwt.verify(token, secretKey, async (err, user) => {
					if (err) {
						let errLabel = 'Authentication error';
						if (err.name === 'TokenExpiredError') {
							errLabel = 'Session expired';
						} else if (err.name === 'JsonWebTokenError') {
							errLabel = 'Invalid token';
						}
						reject(new Error(errLabel));
					} else {
						if (!user.isAdmin) {
							reject(new Error('Unauthorized'));
						}

						resolve(user);
					}
				});
			});

			request.user = user;
		} catch (error: any) {
			return coddyger.api(
				reply,
				Promise.resolve({
					status: defines.status.authError,
					message: error.message,
					data: null
				})
			);
		}
	}

	static async verifyRefreshToken(request, reply, done) {
		try {
			const authorization = request.headers.authorization;
			if (!authorization) {
				throw new Error('No authorization header');
			}

			const token = authorization.split(' ')[1];

			const user: any = await new Promise((resolve, reject) => {
				jwt.verify(token, secretAuthKey, (err, user) => {
					if (err) {
						let errLabel = 'Authentication error';
						if (err.name === 'TokenExpiredError') {
							errLabel = 'Session expired';
						} else if (err.name === 'JsonWebTokenError') {
							errLabel = 'Invalid token';
						}
						reject(new Error(errLabel));
					} else {
						resolve(user);
					}
				});
			});

			request.user = user;
		} catch (error: any) {
			return coddyger.api(
				reply,
				Promise.resolve({
					status: defines.status.authError,
					message: error.message,
					data: null
				})
			);
		}
	}

	/**
	 * Vérifie qu'un `ability` (liste de { subject, action }) autorise l'action demandée.
	 * Convention :
	 *  - `subject: 'all'` ou `action: 'manage'` = joker (super-admin).
	 *  - liste vide / profil absent = accès complet (compat : profils non encore configurés).
	 */
	static abilityAllows(ability: any[], action: string, subject: string): boolean {
		if (!Array.isArray(ability) || ability.length === 0) {
			return true;
		}

		return ability.some((a: any) => {
			const subjectOk = a?.subject === subject || a?.subject === 'all';
			const actionOk = a?.action === action || a?.action === 'manage';

			return subjectOk && actionOk;
		});
	}

	/**
	 * PreHandler RBAC : exige un admin authentifié disposant de la permission (action, subject)
	 * dans l'`ability` de son profil (rôle). À utiliser en `preHandler` sur les routes admin.
	 */
	static can(action: string, subject: string) {
		return async (request: any, reply: any) => {
			// 1) Authentification admin (réutilise verifyAdmin ; en cas d'échec il répond déjà).
			await TokenMiddleware.verifyAdmin(request, reply, () => {});

			if (reply.sent) {
				return;
			}

			try {
				// 2) Charge l'admin + son profil (ability) depuis la base.
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { AdminSet } = require('../../modules/admin');
				const adminDao: any = new AdminSet();
				const admin: any = await adminDao.selectOne({ _id: request.user?._id });
				const ability: any[] = admin?.profile?.ability || [];

				if (TokenMiddleware.abilityAllows(ability, action, subject)) {
					return;
				}

				return coddyger.api(
					reply,
					Promise.resolve({
						status: 403,
						message: "Accès refusé : permission insuffisante.",
						data: null
					})
				);
			} catch (error: any) {
				return coddyger.api(
					reply,
					Promise.resolve({
						status: defines.status.authError,
						message: error?.message || 'Erreur de vérification des permissions',
						data: null
					})
				);
			}
		};
	}

	/**
	 * Variante stricte de `can` : une `ability` vide ou un profil absent **refusent** l'accès.
	 *
	 * `can` accorde tout dans ce cas, par compatibilité avec les profils créés avant l'arrivée du
	 * RBAC. Ce repli est acceptable sur des routes déjà en production, mais pas sur celles qui
	 * doivent cloisonner (activité commerciale, base des commissions) : un profil resté à
	 * `ability: []` y obtiendrait une vue globale. À réserver aux routes nouvelles, où aucun compte
	 * ne peut régresser.
	 */
	static canStrict(action: string, subject: string) {
		return async (request: any, reply: any) => {
			await TokenMiddleware.verifyAdmin(request, reply, () => {});

			if (reply.sent) {
				return;
			}

			try {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				const { AdminSet } = require('../../modules/admin');
				const adminDao: any = new AdminSet();
				const admin: any = await adminDao.selectOne({ _id: request.user?._id });
				const ability: any[] = admin?.profile?.ability || [];

				if (Array.isArray(ability) && ability.length > 0 && TokenMiddleware.abilityAllows(ability, action, subject)) {
					return;
				}

				return coddyger.api(
					reply,
					Promise.resolve({
						status: 403,
						message: "Accès refusé : permission insuffisante.",
						data: null
					})
				);
			} catch (error: any) {
				return coddyger.api(
					reply,
					Promise.resolve({
						status: defines.status.authError,
						message: error?.message || 'Erreur de vérification des permissions',
						data: null
					})
				);
			}
		};
	}

	/**
	 * Indique si un admin détient une permission, sans court-circuiter la requête.
	 *
	 * Utile lorsqu'un droit ne conditionne pas l'accès mais l'étendue de ce qui est permis (par
	 * exemple : relancer l'activation d'un enrôlement qui n'est pas le sien). Prend un identifiant
	 * plutôt qu'une requête, pour rester appelable depuis un service — un handler de route doit
	 * rester synchrone, `coddyger.api` écrivant lui-même dans la réponse.
	 */
	static async hasAbility(adminId: string, action: string, subject: string): Promise<boolean> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			const { AdminSet } = require('../../modules/admin');
			const adminDao: any = new AdminSet();
			const admin: any = await adminDao.selectOne({ _id: adminId });
			const ability: any[] = admin?.profile?.ability || [];

			return Array.isArray(ability) && ability.length > 0 && TokenMiddleware.abilityAllows(ability, action, subject);
		} catch (error) {
			return false;
		}
	}

	static generate(data: any, type: string, expiresIn?: string) {
		if (type === 'accessToken') {
			// [SÉCURITÉ B-05] `expiresIn: undefined` signe un jeton **sans expiration**. La valeur
			// venait du fichier de configuration copié dans l'image Docker ; celle-ci ne portant
			// plus de configuration, une variable oubliée dans l'environnement de déploiement
			// produirait des jetons éternels, en silence. D'où ce repli explicite.
			return jwt.sign(data, secretKey, {
				expiresIn: expiresIn ?? process.env.JWT_TOKEN_EXPIRE ?? '7d'
			});
		} else {
			return jwt.sign(data, secretAuthKey, { expiresIn: '7d' });
		}
	}

	static async isTokenDeactivated(token: string): Promise<boolean> {
		try {
			const deactivatedToken: any = await daoToken.selectOne({ token });
			return deactivatedToken !== null;
		} catch (error) {
			return false;
		}
	}
}
