import jwt from 'jsonwebtoken';
import coddyger, { env, LoggerService, LogLevel } from 'coddyger';

/**
 * [SÉCURITÉ] Jetons de scan du QR marchand (niveau 2).
 *
 * Problème couvert : jusqu'ici le QR affiché par le commerçant encodait l'`id` de boutique en clair
 * et de façon STATIQUE, et `POST /payments/redeem` acceptait `{ to: boutiqueId, amount }` sans
 * aucune preuve de scan. Une simple photo du QR suffisait donc à consommer une réduction à distance,
 * sans jamais se trouver dans la boutique.
 *
 * La parade : deux jetons courts signés par le serveur, enchaînés au moment du scan.
 *  - `scan`   : affiché par l'app Pro dans le QR, régénéré toutes les 30 s. Il ne prouve que la
 *               présence devant un écran frais. Payload `{ typ:'scan', boutiqueId }`, TTL 30 s.
 *  - `redeem` : émis UNE FOIS que le client a scanné un `scan` valide (`POST /payments/scan-verify`).
 *               Il lie la boutique au client et ouvre une fenêtre de validation. Payload
 *               `{ typ:'redeem', boutiqueId, userId }`, TTL 10 min.
 *
 * Le claim `typ` est OBLIGATOIRE et vérifié : un jeton `scan` ne peut pas servir de session `redeem`
 * (ni l'inverse), ni un jeton de session utilisateur servir de jeton de scan. On réutilise le même
 * secret que l'application (`env.jwt.secret`) — aucun secret en dur.
 */

const SCAN_TTL_SECONDS = 30;
const REDEEM_TTL_SECONDS = 10 * 60;
const helperLabel = 'ScanTokenHelper';

export type ScanTokenType = 'scan' | 'redeem';

/** Résultat de vérification : soit le payload validé, soit le motif du rejet (expiré vs invalide). */
export type ScanTokenVerifyResult =
	| { payload: any; expired?: false; invalid?: false }
	| { payload?: undefined; expired: true; invalid?: false }
	| { payload?: undefined; expired?: false; invalid: true };

export class ScanTokenHelper {
	static readonly SCAN_TTL_SECONDS = SCAN_TTL_SECONDS;
	static readonly REDEEM_TTL_SECONDS = REDEEM_TTL_SECONDS;

	/**
	 * Signe un jeton `scan` (QR marchand), valable 30 s.
	 * @param boutiqueId Boutique propriétaire du QR
	 */
	static signScan(boutiqueId: string): string {
		return jwt.sign({ typ: 'scan', boutiqueId: String(boutiqueId) }, env.jwt.secret!, {
			expiresIn: SCAN_TTL_SECONDS
		});
	}

	/**
	 * Signe une session `redeem`, valable 10 min, liant la boutique scannée au client.
	 * @param boutiqueId Boutique issue du jeton `scan` (jamais du client)
	 * @param userId Client authentifié qui a scanné
	 */
	static signRedeem(boutiqueId: string, userId: string): string {
		return jwt.sign({ typ: 'redeem', boutiqueId: String(boutiqueId), userId: String(userId) }, env.jwt.secret!, {
			expiresIn: REDEEM_TTL_SECONDS
		});
	}

	/**
	 * Vérifie la signature, l'expiration et le type (`typ`) attendu d'un jeton.
	 *
	 * Distingue l'expiration (jeton valide mais périmé → 410, l'app re-scanne) de l'invalidité
	 * (signature fausse, `typ` incorrect, jeton d'un autre usage → 400). Un `typ` qui ne correspond
	 * pas est traité comme invalide : c'est la garde anti-réutilisation croisée.
	 *
	 * @param token Jeton présenté
	 * @param expectedType `scan` ou `redeem`
	 */
	static verify(token: string, expectedType: ScanTokenType): ScanTokenVerifyResult {
		if (!token || typeof token !== 'string') {
			return { invalid: true };
		}

		let payload: any;
		try {
			payload = jwt.verify(token, env.jwt.secret!);
		} catch (error: any) {
			if (error?.name === 'TokenExpiredError') {
				return { expired: true };
			}
			LoggerService.log({
				type: LogLevel.Warn,
				content: `Jeton de scan refusé : ${error?.message}`,
				location: helperLabel,
				method: 'verify'
			});
			return { invalid: true };
		}

		// Anti-réutilisation croisée : le `typ` doit correspondre exactement à l'usage attendu.
		if (payload?.typ !== expectedType) {
			LoggerService.log({
				type: LogLevel.Warn,
				content: `Jeton de scan présenté avec un type incorrect (attendu '${expectedType}', reçu '${payload?.typ}')`,
				location: helperLabel,
				method: 'verify'
			});
			return { invalid: true };
		}

		if (!coddyger.string.isValidObjectId(payload?.boutiqueId)) {
			return { invalid: true };
		}

		if (expectedType === 'redeem' && !coddyger.string.isValidObjectId(payload?.userId)) {
			return { invalid: true };
		}

		return { payload };
	}
}
