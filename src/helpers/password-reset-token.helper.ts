import jwt from 'jsonwebtoken';
import coddyger, { env, IData, LoggerService, LogLevel } from 'coddyger';
import { IToken, TokenSet } from '../shared/models';

/**
 * [SÉCURITÉ F-03] Jeton de réinitialisation de mot de passe.
 *
 * Avant correctif, `PUT /clients/updatePassword` acceptait un `_id` arbitraire dans le corps de la
 * requête, sous le seul couvert du jeton public embarqué dans l'application. N'importe qui pouvant
 * extraire ce jeton du binaire pouvait donc redéfinir le mot de passe de n'importe quel compte,
 * administrateurs compris : prise de contrôle complète.
 *
 * Le parcours « mot de passe oublié » reste possible sans être connecté, mais l'autorisation ne
 * vient plus du corps de la requête : elle vient d'un jeton court, signé par le serveur, émis
 * uniquement après vérification réussie du code OTP, et valable une seule fois.
 */

const PURPOSE = 'password_reset';
const TTL_SECONDS = 15 * 60;
const helperLabel = 'PasswordResetTokenHelper';

let daoToken: IData<IToken> | null = null;

// Instanciation paresseuse : le module est importé par les routes, donc aussi par les tests.
const getDao = (): IData<IToken> => {
	if (!daoToken) {
		daoToken = new TokenSet();
	}
	return daoToken;
};

export class PasswordResetTokenHelper {
	/**
	 * Émet un jeton lié à un compte, après vérification de l'OTP.
	 */
	static issue(userId: string): string {
		return jwt.sign({ sub: String(userId), purpose: PURPOSE }, env.jwt.secret!, {
			expiresIn: TTL_SECONDS
		});
	}

	/**
	 * Valide un jeton et le consomme. Renvoie l'identifiant du compte visé, ou `null` si le jeton
	 * est absent, mal signé, expiré, d'un autre usage, ou déjà utilisé.
	 *
	 * La consommation réutilise la table des jetons désactivés, déjà interrogée par
	 * `TokenMiddleware.isTokenDeactivated` : un rejeu est donc rejeté même si le jeton n'a pas
	 * encore expiré.
	 */
	static async consume(token: string): Promise<string | null> {
		if (!token) {
			return null;
		}

		let payload: any;
		try {
			payload = jwt.verify(token, env.jwt.secret!);
		} catch (error: any) {
			LoggerService.log({
				type: LogLevel.Warn,
				content: `Jeton de réinitialisation refusé : ${error.message}`,
				location: helperLabel,
				method: 'consume'
			});
			return null;
		}

		// Un jeton de session ne doit pas pouvoir servir de jeton de réinitialisation.
		if (payload?.purpose !== PURPOSE || !payload?.sub) {
			LoggerService.log({
				type: LogLevel.Warn,
				content: 'Jeton présenté avec un usage incorrect',
				location: helperLabel,
				method: 'consume'
			});
			return null;
		}

		const dao = getDao();

		// Rejeu : le jeton a déjà servi. Le DAO rejette lorsqu'il ne trouve rien, d'où le try/catch
		// — même forme que `TokenMiddleware.isTokenDeactivated`.
		let alreadyUsed: any = null;
		try {
			alreadyUsed = await dao.selectOne({ token });
		} catch (error) {
			alreadyUsed = null;
		}

		if (alreadyUsed) {
			LoggerService.log({
				type: LogLevel.Warn,
				content: `Rejeu d'un jeton de réinitialisation pour le compte ${payload.sub}`,
				location: helperLabel,
				method: 'consume'
			});
			return null;
		}

		await dao.save({
			_id: coddyger.string.generateObjectId(),
			token,
			deactivatedAt: new Date(),
			status: 'inactive'
		} as any);

		return String(payload.sub);
	}
}
