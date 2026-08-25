import { LoggerService, LogLevel } from 'coddyger';

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

	const publicKey = source.JWT_PUBLIC;
	if (!publicKey) {
		issues.push("JWT_PUBLIC n'est pas défini : la délivrance des jetons publics est impossible.");
	} else if (PUBLISHED_VALUES.has(publicKey)) {
		issues.push(
			'JWT_PUBLIC utilise la clé technique publiée dans la documentation et embarquée dans les applications mobiles. À révoquer et à séparer par application (F-07b).'
		);
	}

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
 * Arrête le démarrage en production si la configuration expose la plateforme. Ailleurs, avertit.
 */
export const assertSecureConfiguration = (): void => {
	const issues = collectConfigurationIssues();

	if (issues.length === 0) {
		return;
	}

	const production = isProduction();
	const heading = production
		? 'Démarrage refusé — configuration non sécurisée :'
		: 'Configuration non sécurisée (tolérée hors production) :';

	LoggerService.log({
		type: production ? LogLevel.Error : LogLevel.Warn,
		content: [heading, ...issues.map(issue => `  - ${issue}`)].join('\n'),
		location: label,
		method: 'assertSecureConfiguration'
	});

	if (production) {
		process.exit(1);
	}
};
