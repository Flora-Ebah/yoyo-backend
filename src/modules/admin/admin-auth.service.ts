import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import coddyger, { defines, env, LoggerService, LogLevel } from 'coddyger';
import { AdminModel } from './admin.model';
import { TokenMiddleware } from '../../api/middleware';
import { TokenSet } from '../../shared';
import { EmailService, MessageTypes } from '../../services/notification';
import { isProduction } from '../../config/security-check';

/** Échecs de mot de passe tolérés avant verrouillage, et durée du verrouillage. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
/** Code e-mail : validité (le gabarit annonce 5 minutes), essais, renvois. */
export const CODE_TTL_MINUTES = 5;
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_RESENDS = 3;
/** Durée de vie du `challenge` remis entre les deux étapes. */
const CHALLENGE_TTL = '10m';
const CHALLENGE_PURPOSE = 'admin-2fa';
/**
 * Appareil de confiance (Excel CMS n°10) : après une 2FA réussie, un jeton long est remis au poste.
 * Tant qu'il est valide, une reconnexion sur ce poste n'exige plus le code e-mail (le mot de passe
 * reste requis : le jeton remplace le second facteur, il ne l'offre pas gratuitement). Signé avec le
 * secret des refresh tokens et désigné par `purpose`, il ne vaut que pour cet usage.
 */
const DEVICE_PURPOSE = 'admin-device';
export const DEVICE_TTL_DAYS = Math.max(1, Number(process.env.ADMIN_DEVICE_TTL_DAYS) || 7);

/** Même réponse pour un e-mail inconnu et un mauvais mot de passe : on ne révèle aucun compte. */
const BAD_CREDENTIALS = 'Identifiants incorrects.';

type Result = { status: number; message: string; data: any };

const bad = (message: string, data: any = null): Result => ({ status: defines.status.badRequest, message, data });
const hashCode = (code: string, nonce: string): string => createHash('sha256').update(`${nonce}:${code}`).digest('hex');
const sameHash = (a: string, b: string): boolean =>
	a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/**
 * Connexion au CMS en deux étapes (Excel CMS n°10) : mot de passe, puis code envoyé par e-mail à
 * chaque connexion. Aucun jeton n'est émis tant que le code n'est pas vérifié.
 *
 * Le `challenge` est un JWT court signé avec le secret des refresh tokens, qui désigne l'admin et le
 * `nonce` du code en cours : seule la dernière demande de code est valable, et une fois le code
 * utilisé (ou les essais épuisés) le `challenge` ne sert plus à rien.
 */
export class AdminAuthService {
	private readonly serviceLabel = 'AdminAuthService';

	/** Étape 1 : vérifie le mot de passe, puis envoie le code — ou émet la session si le poste est reconnu. */
	async login(email: string, password: string, deviceToken?: string): Promise<Result> {
		const admin: any = await AdminModel.findOne({ email: String(email ?? '').trim() })
			.populate('profile')
			.lean();
		if (!admin) return bad(BAD_CREDENTIALS);

		if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
			return bad(this.lockMessage(admin.lockedUntil));
		}

		const valid: any = await coddyger.string.decryptPassword(password, admin.password);
		if (valid === false) {
			const failed = (admin.failedLogins ?? 0) + 1;
			const lock = failed >= MAX_FAILED_LOGINS;
			const lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
			await AdminModel.updateOne({ _id: admin._id }, { $set: { failedLogins: lock ? 0 : failed, lockedUntil } });
			return bad(lock ? this.lockMessage(lockedUntil!) : BAD_CREDENTIALS);
		}

		// Compte et profil doivent être actifs. Après le mot de passe seulement : un tiers ne peut pas
		// sonder l'état d'un compte dont il ignore le mot de passe.
		if (admin.status !== 'active' || (admin.profile && admin.profile.status && admin.profile.status !== 'active')) {
			return bad('Ce compte est désactivé. Contactez un administrateur.');
		}

		await AdminModel.updateOne({ _id: admin._id }, { $set: { failedLogins: 0, lockedUntil: null } });

		// Appareil de confiance : la 2FA a déjà été passée sur ce poste. Le mot de passe vient d'être
		// vérifié ci-dessus ; on peut donc émettre directement la session sans renvoyer de code.
		if (this.readDeviceToken(deviceToken) === String(admin._id)) {
			const session = this.issueSession(admin);
			await AdminModel.updateOne({ _id: admin._id }, { $set: { lastLogin: new Date() } });
			return { status: defines.status.requestOK, message: 'Connexion réussie.', data: { step: 'authenticated', ...session } };
		}

		return this.sendCode(admin, null);
	}

	/** Étape 2 : vérifie le code et émet les jetons. */
	async verify(challenge: string, code: string): Promise<Result> {
		const claims = this.readChallenge(challenge);
		if (!claims) return bad('Code expiré : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });

		const admin: any = await AdminModel.findById(claims.sub).select('+loginChallenge').populate('profile').lean();
		const pending = admin?.loginChallenge;
		if (!admin || !pending || pending.nonce !== claims.nonce || new Date(pending.expiresAt) <= new Date()) {
			return bad('Code expiré : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });
		}
		if (admin.status !== 'active') return bad('Ce compte est désactivé. Contactez un administrateur.');

		const attempts = (pending.attempts ?? 0) + 1;
		if (!sameHash(hashCode(String(code ?? '').trim(), pending.nonce), pending.codeHash)) {
			if (attempts >= MAX_CODE_ATTEMPTS) {
				await AdminModel.updateOne({ _id: admin._id }, { $set: { loginChallenge: null } });
				return bad("Trop d'essais : reconnectez-vous pour recevoir un nouveau code.", { code: 'CHALLENGE_EXPIRED' });
			}
			// Garde sur le nonce : un renvoi de code entre-temps n'est pas écrasé.
			await AdminModel.updateOne(
				{ _id: admin._id, 'loginChallenge.nonce': pending.nonce },
				{ $set: { 'loginChallenge.attempts': attempts } }
			);
			const left = MAX_CODE_ATTEMPTS - attempts;
			return bad(`Code incorrect. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`);
		}

		// Usage unique : le code n'est consommé qu'une fois, même en cas de double envoi du formulaire.
		const consumed = await AdminModel.updateOne(
			{ _id: admin._id, 'loginChallenge.nonce': pending.nonce },
			{ $set: { loginChallenge: null, lastLogin: new Date() } }
		);
		if (!consumed.modifiedCount) return bad('Code expiré : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });

		// 2FA réussie : on émet la session et on remet un jeton d'appareil de confiance, que le front
		// conservera pour éviter de redemander un code à la prochaine connexion sur ce poste.
		const session = this.issueSession(admin);
		return { status: defines.status.requestOK, message: 'Connexion réussie.', data: session };
	}

	/**
	 * Émet une session CMS : jetons d'accès/rafraîchissement, profil nettoyé, et un jeton d'appareil
	 * de confiance (frais à chaque émission, pour prolonger la fenêtre de reconnaissance du poste).
	 */
	private issueSession(admin: any): { accessToken: string; refreshToken: string; deviceToken: string; user: any } {
		const claimsOut = { _id: String(admin._id), email: admin.email, isAdmin: true };
		const accessToken = TokenMiddleware.generate(claimsOut, 'accessToken');
		const refreshToken = TokenMiddleware.generate(claimsOut, 'refreshToken');
		const deviceToken = this.mintDeviceToken(String(admin._id));
		const { password, loginChallenge, failedLogins, lockedUntil, __v, ...user } = admin;
		return { accessToken, refreshToken, deviceToken, user };
	}

	/** Jeton d'appareil de confiance pour `adminId` (JWT, secret des refresh tokens, purpose dédié). */
	private mintDeviceToken(adminId: string): string {
		return jwt.sign({ sub: adminId, purpose: DEVICE_PURPOSE }, env.jwt.secretAuth!, {
			expiresIn: `${DEVICE_TTL_DAYS}d` as jwt.SignOptions['expiresIn']
		});
	}

	/** Renvoie l'`adminId` d'un jeton d'appareil valide, sinon `null` (jeton absent, expiré ou falsifié). */
	private readDeviceToken(token?: string): string | null {
		if (!token) return null;
		try {
			const claims: any = jwt.verify(String(token), env.jwt.secretAuth!);
			if (claims?.purpose !== DEVICE_PURPOSE || !claims.sub) return null;
			return String(claims.sub);
		} catch {
			return null;
		}
	}

	/** Renvoi du code (même `challenge`), avec délai d'attente et nombre limité. */
	async resend(challenge: string): Promise<Result> {
		const claims = this.readChallenge(challenge);
		if (!claims) return bad('Code expiré : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });

		const admin: any = await AdminModel.findById(claims.sub).select('+loginChallenge').lean();
		const pending = admin?.loginChallenge;
		if (!admin || !pending || pending.nonce !== claims.nonce || admin.status !== 'active') {
			return bad('Code expiré : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });
		}
		if ((pending.resends ?? 0) >= MAX_RESENDS) {
			return bad('Trop de renvois : reconnectez-vous.', { code: 'CHALLENGE_EXPIRED' });
		}
		const wait = Math.ceil((new Date(pending.sentAt).getTime() + RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000);
		if (wait > 0) return bad(`Patientez ${wait} s avant de demander un nouveau code.`);

		return this.sendCode(admin, pending);
	}

	/** Déconnexion : le jeton du CMS rejoint la liste noire lue par `TokenMiddleware`. */
	async logout(token: string | undefined): Promise<Result> {
		if (token) {
			const blacklist = new TokenSet().defaultModel as any;
			await blacklist.updateOne(
				{ token },
				{ $setOnInsert: { _id: coddyger.string.generateObjectId(), token, deactivatedAt: new Date(), status: 'inactive' } },
				{ upsert: true }
			);
		}
		return { status: defines.status.requestOK, message: 'Déconnexion réussie.', data: null };
	}

	/**
	 * Génère et envoie un code. `previous` : demande en cours, dont on garde le nonce (le
	 * `challenge` déjà remis reste valable) et le compteur de renvois.
	 */
	private async sendCode(admin: any, previous: any | null): Promise<Result> {
		const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
		const nonce = previous?.nonce ?? randomBytes(16).toString('hex');
		const now = new Date();
		await AdminModel.updateOne(
			{ _id: admin._id },
			{
				$set: {
					loginChallenge: {
						nonce,
						codeHash: hashCode(code, nonce),
						expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
						attempts: previous?.attempts ?? 0,
						sentAt: now,
						resends: previous ? (previous.resends ?? 0) + 1 : 0
					}
				}
			}
		);

		const sent = await new EmailService().sendOtpEmail(
			admin.email,
			code,
			MessageTypes.TYPES.TWO_FACTOR_AUTH,
			admin.firstname || undefined
		);
		if (!this.isProduction()) {
			// Hors production seulement : permet de se connecter sans SMTP en développement.
			console.log(`[2FA admin] code de ${admin.email} : ${code}`);
		}
		if (!sent.success && this.isProduction()) {
			LoggerService.log({ type: LogLevel.Error, content: `Code 2FA non envoyé à ${admin.email}`, location: this.serviceLabel, method: 'sendCode' });
			return bad("L'e-mail de vérification n'a pas pu être envoyé. Réessayez.");
		}

		const challenge = jwt.sign({ sub: String(admin._id), nonce, purpose: CHALLENGE_PURPOSE }, env.jwt.secretAuth!, {
			expiresIn: CHALLENGE_TTL
		});
		return {
			status: defines.status.requestOK,
			message: 'Code de vérification envoyé par e-mail.',
			data: { step: 'verify', challenge, email: this.maskEmail(admin.email), expiresInMinutes: CODE_TTL_MINUTES }
		};
	}

	private readChallenge(challenge: string): { sub: string; nonce: string } | null {
		try {
			const claims: any = jwt.verify(String(challenge ?? ''), env.jwt.secretAuth!);
			if (claims?.purpose !== CHALLENGE_PURPOSE || !claims.sub || !claims.nonce) return null;
			return { sub: String(claims.sub), nonce: String(claims.nonce) };
		} catch {
			return null;
		}
	}

	private lockMessage(until: Date): string {
		const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
		return `Trop de tentatives. Réessayez dans ${minutes} min.`;
	}

	private maskEmail(email: string): string {
		const [name, domain] = String(email).split('@');
		if (!domain) return email;
		return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, name.length - 2))}@${domain}`;
	}

	private isProduction(): boolean {
		return isProduction();
	}
}

export const adminAuthService = new AdminAuthService();
