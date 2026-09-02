import { LogLevel } from 'coddyger';
import { logEvent } from './logger';

/**
 * [SÉCURITÉ B-05 / F-08] Contrôle de la configuration au démarrage.
 *
 * Le dépôt publiait ses propres secrets : `SEEDERS_SETUP.md` donnait la clé de signature des
 * jetons, la clé technique partagée par les 4 applications, la clé des jetons de rafraîchissement
 * et le compte administrateur par défaut (`admin@yoyocarte.com:admin`) ; la documentation Swagger
 * affichait la clé technique en valeur par défaut ; et l'image Docker copiait le fichier d'exemple
 * comme configuration réelle. Un déploiement partait donc avec des secrets connus de tous, et la
 * clé de signature suffit à forger un jeton `isAdmin: true`.
 *
 * Retirer ces valeurs de la documentation ne protège pas un environnement déjà configuré avec
 * elles : ce contrôle refuse le démarrage tant qu'un secret publié, absent ou trop court est en
 * place. Hors production, il se contente d'avertir, pour ne pas bloquer un poste de développement.
 */

const label = 'SecurityCheck';

/** Valeurs publiées dans le dépôt ou sa documentation. Aucune ne doit jamais servir. */
const PUBLISHED_VALUES = new Set([
	'TrQpAbG2tByxw0eS',
	'x6HGDgknDsMWc01XTrQpAbG2tByxw0eS',
	'852e8e4e063bd63513aa28fdf3244f4',
	'your-secret-jwt-key-minimum-32-characters-long',
	'your-public-jwt-key',
	'your-auth-secret-key',
	'your-password',
	'admin',
	'changeme',
	'secret'
]);

const MIN_SIGNING_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 8;

/**
 * `ENV` porte parfois un commentaire en ligne (`dev # dev | prod`) : on ne compare donc pas la
 * valeur brute.
 */
export const isProduction = (raw = process.env.ENV): boolean =>
	(raw ?? '').split('#')[0].trim().toLowerCase().startsWith('prod');

/**
 * Renvoie la liste des problèmes de configuration. Vide = configuration saine.
 * Exportée séparément du garde pour être vérifiable sans arrêter le processus.
 */
export const collectConfigurationIssues = (source: NodeJS.ProcessEnv = process.env): string[] => {
	const issues: string[] = [];

	const signingSecrets: Array<[string, string | undefined]> = [
		['JWT_SECRET', source.JWT_SECRET],
		['JWT_AUTH_SECRET', source.JWT_AUTH_SECRET]
	];

	signingSecrets.forEach(([name, value]) => {
		if (!value) {
			issues.push(`${name} n'est pas défini : les jetons ne peuvent pas être signés.`);
			return;
		}
		if (PUBLISHED_VALUES.has(value)) {
			issues.push(
				`${name} utilise une valeur publiée dans le dépôt : n'importe qui peut forger un jeton administrateur.`
			);
			return;
		}
		if (value.length < MIN_SIGNING_SECRET_LENGTH) {
			issues.push(`${name} fait ${value.length} caractères, il en faut au moins ${MIN_SIGNING_SECRET_LENGTH}.`);
		}
	});

	// Ce compte est créé au démarrage par `MainHelper.generateDefaultAdmin`.
	const defaultAccount = source.DEFAULT_ACCOUNT;
	if (defaultAccount) {
		const [email, ...rest] = defaultAccount.split(':');
		const password = rest.join(':');

		if (!email || !password) {
			issues.push('DEFAULT_ACCOUNT est mal formé : le format attendu est `email:mot-de-passe`.');
		} else if (PUBLISHED_VALUES.has(password)) {
			issues.push(
				`DEFAULT_ACCOUNT utilise un mot de passe publié dans le dépôt pour le compte administrateur ${email}.`
			);
		} else if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
			issues.push(
				`Le mot de passe de DEFAULT_ACCOUNT fait ${password.length} caractères, il en faut au moins ${MIN_ADMIN_PASSWORD_LENGTH}.`
			);
		}
	}

	return issues;
};

/**
 * [SÉCURITÉ C-01] Posture de l'attestation d'application.
 *
 * Distincte de `collectConfigurationIssues` — et **jamais bloquante** — parce que la nature du
 * problème est différente. Un secret publié est une faute : il n'existe aucune raison légitime de
 * démarrer avec. Une attestation en mode observation est une **étape de déploiement** délibérée :
 * on mesure le taux d'échec avant de couper, sous peine de fermer l'accès aux versions de
 * l'application déjà installées chez les utilisateurs. Refuser de démarrer pour cela provoquerait
 * précisément la panne qu'on cherche à éviter.
 *
 * Mais l'état ne doit pas s'installer en silence : depuis la suppression du jeton public, les
 * 8 routes d'avant-connexion — inscription, connexion, OTP, mot de passe oublié, activation d'un
 * compte marchand — n'ont plus aucun autre garde. D'où un avertissement à chaque démarrage.
 *
 * (Ce n'est pas une régression : la clé partagée s'extrayait de n'importe quel binaire et ne
 * prouvait rien. C'est le même niveau de protection, sans le secret à faire fuiter.)
 */
export const collectAppCheckWarnings = (source: NodeJS.ProcessEnv = process.env): string[] => {
	const warnings: string[] = [];

	// `POST /get-token` supprimée : plus rien ne lit `JWT_PUBLIC`. Une variable morte finit par être
	// recopiée dans le prochain environnement, puis par justifier qu'on « rebranche » la route.
	if (source.JWT_PUBLIC) {
		warnings.push(
			'JWT_PUBLIC est encore défini alors que la clé technique partagée a été supprimée (C-01). Retirer la variable de la configuration.'
		);
	}

	if (source.APP_CHECK_ENABLED !== 'true') {
		warnings.push(
			"APP_CHECK_ENABLED n'est pas à `true` : les 8 routes d'avant-connexion n'ont plus aucun contrôle d'origine depuis la suppression du jeton public (C-01)."
		);
		return warnings;
	}

	const credentials: Array<[string, string | undefined]> = [
		['FIREBASE_PROJECT_ID', source.FIREBASE_PROJECT_ID],
		['FIREBASE_CLIENT_EMAIL', source.FIREBASE_CLIENT_EMAIL],
		['FIREBASE_PRIVATE_KEY', source.FIREBASE_PRIVATE_KEY]
	];

	const missing = credentials.filter(([, value]) => !value).map(([name]) => name);
	if (missing.length > 0) {
		warnings.push(
			`App Check est activé mais ne peut vérifier aucune attestation : ${missing.join(', ')} manque${
				missing.length > 1 ? 'nt' : ''
			}. Toutes les requêtes seront traitées comme non attestées.`
		);
	}

	const enforcing = source.APP_CHECK_ENFORCE === 'true';
	const enforcedRoutes = (source.APP_CHECK_ENFORCE_ROUTES ?? '')
		.split(',')
		.map(route => route.trim())
		.filter(route => route.length > 0);

	if (!enforcing && enforcedRoutes.length === 0) {
		warnings.push(
			"App Check est en observation pure : il journalise sans rien rejeter, et aucune route n'est fermée par APP_CHECK_ENFORCE_ROUTES. Les routes d'avant-connexion restent donc ouvertes. Fermer route par route dès que les journaux d'observation le permettent."
		);
	}

	return warnings;
};

/**
 * Arrête le démarrage en production si la configuration expose la plateforme. Ailleurs, avertit.
 * La posture App Check est signalée dans tous les cas, sans jamais bloquer.
 */
export const assertSecureConfiguration = (): void => {
	const warnings = collectAppCheckWarnings();

	if (warnings.length > 0) {
		logEvent({
			type: LogLevel.Warn,
			content: [
				"Attestation d'application — points de vigilance :",
				...warnings.map(warning => `  - ${warning}`)
			].join('\n'),
			location: label,
			method: 'assertSecureConfiguration'
		});
	}

	const issues = collectConfigurationIssues();

	if (issues.length === 0) {
		return;
	}

	const production = isProduction();
	const heading = production
		? 'Démarrage refusé — configuration non sécurisée :'
		: 'Configuration non sécurisée (tolérée hors production) :';

	// [dette] `LoggerService` n'écrit nulle part (cf. `src/config/logger.ts`) : ce contrôle était
	// donc muet, y compris quand il refusait le démarrage. Il passe par `logEvent`.
	logEvent({
		type: production ? LogLevel.Error : LogLevel.Warn,
		content: [heading, ...issues.map(issue => `  - ${issue}`)].join('\n'),
		location: label,
		method: 'assertSecureConfiguration'
	});

	if (production) {
		process.exit(1);
	}
};
