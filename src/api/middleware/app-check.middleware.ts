import coddyger, { defines, LogLevel } from 'coddyger';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { config } from '../../config/env';
import { logEvent } from '../../config/logger';

const middlewareLabel = 'AppCheckMiddleware';

/**
 * En-tête porteur de l'attestation. Nom imposé par la convention Firebase, repris tel quel par
 * les SDK clients ; Fastify normalise les en-têtes en minuscules.
 */
const APP_CHECK_HEADER = 'x-firebase-appcheck';

/**
 * Nom de l'application Firebase Admin, distinct de l'application par défaut : le processus
 * n'utilise Firebase que pour App Check, et un nom explicite évite tout conflit si une autre
 * intégration Firebase arrivait un jour.
 */
const FIREBASE_APP_NAME = 'yoyo-app-check';

let firebaseApp: App | null = null;
let initializationAttempted = false;

/**
 * Verrou posé après un premier échec de la consommation de jeton.
 *
 * La consommation exige que le compte de service porte le rôle *Firebase App Check Token
 * Verifier*, accordé séparément. Sans lui, chaque requête paierait un aller-retour réseau perdu :
 * on cesse d'essayer dès qu'on a la preuve que c'est la consommation, et non le jeton, qui échoue.
 */
let consumptionUnavailable = false;

/**
 * Initialise l'application Firebase Admin à la première requête, jamais au chargement du module.
 *
 * Le démarrage du serveur ne doit pas dépendre de la présence de la configuration Firebase :
 * en mode observation, une configuration absente est une information à journaliser, pas une
 * raison de refuser de démarrer.
 */
const getFirebaseApp = (): App | null => {
	if (firebaseApp) return firebaseApp;
	if (initializationAttempted) return null;

	initializationAttempted = true;

	const { projectId, clientEmail, privateKey } = config.appCheck;

	if (!projectId || !clientEmail || !privateKey) {
		logEvent({
			type: LogLevel.Error,
			content:
				'Configuration Firebase incomplète : FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et ' +
				"FIREBASE_PRIVATE_KEY sont requis pour vérifier les attestations. Aucune requête ne sera attestée.",
			location: middlewareLabel,
			method: 'getFirebaseApp'
		});
		return null;
	}

	try {
		const existing = getApps().find(app => app.name === FIREBASE_APP_NAME);
		firebaseApp = existing ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, FIREBASE_APP_NAME);
		return firebaseApp;
	} catch (error) {
		logEvent({
			type: LogLevel.Error,
			content: `Initialisation de Firebase Admin impossible : ${error}`,
			location: middlewareLabel,
			method: 'getFirebaseApp'
		});
		return null;
	}
};

/**
 * Vrai si la route figure dans la liste de rejet anticipé.
 *
 * Comparaison par fragment, en minuscules : la liste porte des chemins courts
 * (`/clients/register`) tandis que Fastify expose l'URL préfixée (`/v1/yoyo/clients/register`).
 *
 * Exporté pour être testé sans dépendre de la configuration du processus.
 */
export const matchesEnforcedRoute = (routeUrl: string, patterns: string[]): boolean => {
	if (!routeUrl || patterns.length === 0) return false;
	const normalized = routeUrl.toLowerCase();

	return patterns.some(pattern => normalized.includes(pattern));
};

type AttestationOutcome = { attested: true; replayed: boolean } | { attested: false; reason: string };

/**
 * Vérifie l'attestation portée par la requête, sans jamais lever.
 *
 * `consume` demande en plus la détection du rejeu : Google marque le jeton comme utilisé et
 * signale toute présentation ultérieure du **même** jeton. Cela suppose que le client ait envoyé
 * un jeton à usage unique (`getLimitedUseToken()`), sans quoi le jeton mis en cache par le SDK
 * serait signalé comme rejoué dès le deuxième appel légitime.
 */
const evaluate = async (request: any, { consume }: { consume: boolean }): Promise<AttestationOutcome> => {
	const token = request.headers[APP_CHECK_HEADER];

	if (!token || typeof token !== 'string') {
		return { attested: false, reason: 'en-tête absent' };
	}

	const app = getFirebaseApp();
	if (!app) {
		return { attested: false, reason: 'configuration Firebase absente côté serveur' };
	}

	const wantsConsumption = consume && config.appCheck.consume && !consumptionUnavailable;
	let consumptionError: any = null;

	if (wantsConsumption) {
		try {
			const { alreadyConsumed } = await getAppCheck(app).verifyToken(token, { consume: true });
			return { attested: true, replayed: alreadyConsumed === true };
		} catch (error) {
			// Deux causes possibles, indiscernables ici : le jeton est mauvais, ou la consommation
			// est refusée faute de rôle IAM. La vérification simple ci-dessous tranche — plutôt que
			// de deviner à partir d'un code d'erreur dont le libellé n'est pas contractuel.
			consumptionError = error;
		}
	}

	try {
		await getAppCheck(app).verifyToken(token);

		if (consumptionError) {
			// Le jeton est valide : c'est donc bien la consommation qui est indisponible. On le dit
			// une fois, puis on cesse d'essayer.
			consumptionUnavailable = true;
			logEvent({
				type: LogLevel.Error,
				content:
					'Détection du rejeu désactivée : la consommation de jeton a échoué alors que le jeton ' +
					'est valide. Le compte de service doit porter le rôle « Firebase App Check Token ' +
					`Verifier ». Motif : ${consumptionError?.code ?? consumptionError?.message ?? 'inconnu'}`,
				location: middlewareLabel,
				method: 'evaluate'
			});
		}

		return { attested: true, replayed: false };
	} catch (error: any) {
		return { attested: false, reason: `jeton refusé (${error?.code ?? error?.message ?? 'motif inconnu'})` };
	}
};

/**
 * Corps commun de `verify` et `verifyLimitedUse`.
 */
const run = async (request: any, reply: any, { consume }: { consume: boolean }) => {
	if (!config.appCheck.enabled) return;

	const outcome = await evaluate(request, { consume });
	// `request.routerPath` est déprécié et disparaît dans Fastify 5 ; `routeOptions.url` est son
	// remplaçant. Le repli sur `url` couvre les requêtes sans route déclarée.
	const routeUrl = request.routeOptions?.url ?? request.url ?? '';
	const route = `${request.method} ${routeUrl}`;

	// Rejet global, ou rejet anticipé sur cette route précise. Le second permet de fermer les
	// routes qu'aucune application en retard n'appelle, sans attendre la migration de toutes.
	const enforced = config.appCheck.enforce || matchesEnforcedRoute(routeUrl, config.appCheck.enforceRoutes);

	if (outcome.attested) {
		if (!outcome.replayed) {
			// En observation, le succès est journalisé lui aussi : sans cela, « aucune requête
			// refusée » et « aucune requête reçue » produiraient la même trace — c'est-à-dire
			// aucune. Or la décision d'activer le rejet se prend sur un **taux**, pas sur un
			// silence. Cette ligne disparaît d'elle-même une fois `APP_CHECK_ENFORCE=true`.
			if (!enforced) {
				logEvent({
					type: LogLevel.Info,
					content: `[Observation] Requête attestée sur ${route}`,
					location: middlewareLabel,
					method: 'verify'
				});
			}
			return;
		}

		// Le jeton est authentique mais déjà présenté : quelqu'un rejoue une requête capturée.
		// Toujours journalisé, y compris en mode rejet — c'est un signal d'attaque, pas du bruit.
		logEvent({
			type: LogLevel.Warn,
			content: `${enforced ? 'Rejeu bloqué' : '[Observation] Rejeu détecté'} sur ${route}`,
			location: middlewareLabel,
			method: 'verify'
		});

		if (!enforced) return;

		return coddyger.api(
			reply,
			Promise.resolve({
				status: defines.status.authError,
				message: 'Requête déjà traitée. Recommencez la procédure depuis le début.',
				data: null
			})
		);
	}

	if (!enforced) {
		// Mode observation : on mesure avant de couper. Le jeton lui-même n'est jamais
		// journalisé, seulement le motif du refus.
		logEvent({
			type: LogLevel.Warn,
			content: `[Observation] Requête non attestée sur ${route} — ${outcome.reason}`,
			location: middlewareLabel,
			method: 'verify'
		});
		return;
	}

	logEvent({
		type: LogLevel.Warn,
		content: `Requête rejetée sur ${route} — ${outcome.reason}`,
		location: middlewareLabel,
		method: 'verify'
	});

	return coddyger.api(
		reply,
		Promise.resolve({
			status: defines.status.authError,
			message: "Requête non attestée. Utilisez l'application officielle YoYo.",
			data: null
		})
	);
};

export class AppCheckMiddleware {
	/**
	 * Atteste que la requête provient d'une instance authentique d'une application YoYo.
	 *
	 * Remplace la clé d'API partagée qui était codée en dur dans les applications mobiles : une
	 * chaîne embarquée dans un binaire s'en extrait, elle ne prouvait donc rien — et le jeton
	 * qu'elle permettait d'obtenir franchissait `TokenMiddleware.verify` sur **toutes** les routes.
	 *
	 * Ce contrôle est **orthogonal** à l'authentification : il dit d'où vient la requête, pas qui
	 * la fait. Il ne remplace jamais `TokenMiddleware.verify` sur une route qui manipule les
	 * données d'un utilisateur ; il protège les routes qu'aucune identité ne peut protéger, parce
	 * qu'elles servent justement à s'inscrire ou à récupérer son accès.
	 *
	 * Trois comportements, pilotés par la configuration :
	 *  - `APP_CHECK_ENABLED=false` (défaut) : ne fait rien du tout ;
	 *  - `APP_CHECK_ENABLED=true`, `APP_CHECK_ENFORCE=false` : vérifie et journalise, laisse passer ;
	 *  - les deux à `true` : rejette en 401 les requêtes non attestées.
	 *
	 * `APP_CHECK_ENFORCE_ROUTES` ouvre une quatrième voie : rejeter sur certaines routes seulement,
	 * avant l'interrupteur global. Les applications ne migrent pas toutes en même temps, et
	 * attendre la dernière pour protéger les premières laisse ouvertes des routes déjà couvertes.
	 */
	static async verify(request: any, reply: any, done?: any) {
		return run(request, reply, { consume: false });
	}

	/**
	 * Comme `verify`, plus la **détection du rejeu**.
	 *
	 * À réserver aux routes dont la ré-exécution a une conséquence : `POST /otp/verify`, qui émet
	 * le jeton de réinitialisation, et `PUT /clients/updatePassword`, qui le consomme. Ailleurs
	 * elle serait payée sans contrepartie — la consommation coûte un aller-retour supplémentaire
	 * vers Google et interdit toute mise en cache du jeton côté client.
	 *
	 * Une attestation est un jeton signé : interceptée, elle est rejouable jusqu'à son expiration
	 * (30 minutes par défaut). Google la marque ici comme utilisée et signale toute présentation
	 * ultérieure du même jeton.
	 *
	 * ⚠️ **Contrat côté client** : ces routes doivent recevoir un jeton **à usage unique**
	 * (`getLimitedUseToken()`), pas le jeton mis en cache par le SDK — sans quoi le deuxième appel
	 * légitime serait signalé comme un rejeu.
	 *
	 * ⚠️ **Contrat côté infrastructure** : `APP_CHECK_CONSUME=true` et le rôle IAM *Firebase App
	 * Check Token Verifier* sur le compte de service. À défaut, la détection se désactive d'elle-même
	 * après un échec, en le journalisant : la route reste attestée, simplement sans contrôle de rejeu.
	 */
	static async verifyLimitedUse(request: any, reply: any, done?: any) {
		return run(request, reply, { consume: true });
	}
}
