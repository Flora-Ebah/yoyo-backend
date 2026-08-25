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
