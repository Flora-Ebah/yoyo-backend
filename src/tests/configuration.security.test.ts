import { expect } from 'chai';
import { collectAppCheckWarnings, collectConfigurationIssues, isProduction } from '../config/security-check';
import { parseAppCheckMode } from '../config/env';

/**
 * [SÉCURITÉ B-05 / F-08] Le dépôt publiait ses propres secrets : `SEEDERS_SETUP.md` donnait la clé
 * de signature des jetons, la clé technique partagée par les 4 applications, la clé des jetons de
 * rafraîchissement et le compte administrateur `admin@yoyocarte.com:admin` ; la documentation
 * Swagger affichait la clé technique en valeur par défaut ; et l'image Docker copiait le fichier
 * d'exemple comme configuration réelle.
 *
 * La clé de signature suffit à forger un jeton `isAdmin: true`. Retirer ces valeurs de la
 * documentation ne protège pas un environnement déjà configuré avec elles : ces tests verrouillent
 * le contrôle qui refuse le démarrage tant qu'un secret publié est en place.
 */
describe('[Sécurité] Configuration au démarrage', () => {
	const sound = {
		JWT_SECRET: 'a'.repeat(48),
		JWT_AUTH_SECRET: 'b'.repeat(48),
		DEFAULT_ACCOUNT: 'admin@yoyocarte.com:un-mot-de-passe-long'
	} as any;

	const issuesFor = (overrides: any) => collectConfigurationIssues({ ...sound, ...overrides });

	it('accepte une configuration saine', () => {
		expect(collectConfigurationIssues(sound)).to.deep.equal([]);
	});

	it('refuse la clé de signature publiée dans la documentation', () => {
		const issues = issuesFor({ JWT_SECRET: 'x6HGDgknDsMWc01XTrQpAbG2tByxw0eS' });
		expect(issues).to.have.lengthOf(1);
		expect(issues[0]).to.contain('JWT_SECRET');
	});

	it('refuse la clé des jetons de rafraîchissement publiée dans la documentation', () => {
		expect(issuesFor({ JWT_AUTH_SECRET: '852e8e4e063bd63513aa28fdf3244f4' })).to.have.lengthOf(1);
	});

	it("refuse les valeurs d'exemple du fichier de configuration", () => {
		expect(issuesFor({ JWT_SECRET: 'your-secret-jwt-key-minimum-32-characters-long' })).to.have.lengthOf(1);
		expect(issuesFor({ JWT_AUTH_SECRET: 'your-auth-secret-key' })).to.have.lengthOf(1);
	});

	it('refuse un secret de signature trop court', () => {
		const issues = issuesFor({ JWT_SECRET: 'trop-court' });
		expect(issues[0]).to.contain('au moins 32');
	});

	it('refuse un secret de signature absent', () => {
		expect(issuesFor({ JWT_SECRET: undefined })).to.have.lengthOf(1);
		expect(issuesFor({ JWT_AUTH_SECRET: undefined })).to.have.lengthOf(1);
	});

	/**
	 * Ce compte est créé au démarrage par `MainHelper.generateDefaultAdmin`.
	 */
	it("refuse le mot de passe administrateur publié dans la documentation", () => {
		const issues = issuesFor({ DEFAULT_ACCOUNT: 'admin@yoyocarte.com:admin' });
		expect(issues).to.have.lengthOf(1);
		expect(issues[0]).to.contain('DEFAULT_ACCOUNT');
	});

	it('refuse un mot de passe administrateur trop court', () => {
		expect(issuesFor({ DEFAULT_ACCOUNT: 'admin@yoyocarte.com:court' })).to.have.lengthOf(1);
	});

	it("tolère l'absence de compte administrateur par défaut", () => {
		expect(issuesFor({ DEFAULT_ACCOUNT: undefined })).to.deep.equal([]);
	});

	it('remonte tous les problèmes à la fois', () => {
		const issues = collectConfigurationIssues({
			JWT_SECRET: 'x6HGDgknDsMWc01XTrQpAbG2tByxw0eS',
			JWT_AUTH_SECRET: 'your-auth-secret-key',
			DEFAULT_ACCOUNT: 'admin@yoyocarte.com:admin'
		} as any);

		expect(issues).to.have.lengthOf(3);
	});

	/**
	 * [C-01] La posture de l'attestation est **séparée** des secrets publiés, et jamais bloquante.
	 *
	 * Un secret publié est une faute : rien ne justifie de démarrer avec. Une attestation en mode
	 * observation est une étape de déploiement délibérée — on mesure le taux d'échec avant de
	 * couper, sous peine de fermer l'accès aux versions déjà installées chez les utilisateurs.
	 * Refuser le démarrage pour cela provoquerait la panne qu'on cherche à éviter. D'où deux
	 * fonctions distinctes, et un `assertSecureConfiguration` qui n'arrête le processus que sur la
	 * première.
	 */
	describe("C-01 — Posture de l'attestation d'application", () => {
		const attested = {
			APP_CHECK: 'enforce',
			FIREBASE_PROJECT_ID: 'yoyo-la-carte',
			FIREBASE_CLIENT_EMAIL: 'sa@yoyo.iam.gserviceaccount.com',
			FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----'
		} as any;

		const warningsFor = (overrides: any) => collectAppCheckWarnings({ ...attested, ...overrides });

		it("ne signale rien quand l'attestation est active et rejette", () => {
			expect(collectAppCheckWarnings(attested)).to.deep.equal([]);
		});

		/**
		 * Le cas qui coûte le plus cher : les 8 routes d'avant-connexion n'ont plus aucun autre
		 * garde depuis la suppression du jeton public.
		 */
		it("signale une attestation désactivée", () => {
			const warnings = warningsFor({ APP_CHECK: 'off' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('APP_CHECK=off');
		});

		it('signale des identifiants Firebase incomplets', () => {
			const warnings = warningsFor({ FIREBASE_PRIVATE_KEY: undefined });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('FIREBASE_PRIVATE_KEY');
		});

		it("signale l'observation, où rien n'est rejeté", () => {
			const warnings = warningsFor({ APP_CHECK: 'observe' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('observe');
		});

		/**
		 * Le comportement est sûr — `enforce` s'applique — mais celui qui a écrit la variable croit
		 * avoir réglé autre chose. Sans cet avertissement, il cherche la panne dans le code.
		 */
		it('signale une valeur non reconnue tout en appliquant le mode strict', () => {
			const warnings = warningsFor({ APP_CHECK: 'true' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('off, observe ou enforce');
		});

		/**
		 * `JWT_PUBLIC` ne sert plus à rien depuis la suppression de `POST /get-token`. Laisser une
		 * variable morte, c'est la voir recopiée dans le prochain environnement — puis servir
		 * d'argument pour « rebrancher » la route.
		 */
		it('demande le retrait de la clé technique devenue inutile', () => {
			const warnings = warningsFor({ JWT_PUBLIC: 'TrQpAbG2tByxw0eS' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('JWT_PUBLIC');
		});

		it("n'est pas comptée parmi les problèmes bloquants", () => {
			expect(collectConfigurationIssues({ ...sound, APP_CHECK: 'off' })).to.deep.equal([]);
		});
	});

	/**
	 * [C-01] `APP_CHECK` a remplacé quatre variables (`APP_CHECK_ENABLED`, `APP_CHECK_ENFORCE`,
	 * `APP_CHECK_ENFORCE_ROUTES`, `APP_CHECK_CONSUME`) dont les combinaisons étaient illisibles —
	 * au point qu'une configuration en place déclarait une liste de routes que le court-circuit du
	 * `||` rendait morte.
	 *
	 * Tout le risque du changement tient désormais dans cet analyseur : c'est lui seul qui décide
	 * si une plateforme rejette ou laisse passer.
	 */
	describe('APP_CHECK — lecture de la posture', () => {
		it('reconnaît les trois valeurs nominales', () => {
			expect(parseAppCheckMode('off')).to.equal('off');
			expect(parseAppCheckMode('observe')).to.equal('observe');
			expect(parseAppCheckMode('enforce')).to.equal('enforce');
		});

		it('ignore la casse et les espaces', () => {
			expect(parseAppCheckMode('  Off ')).to.equal('off');
			expect(parseAppCheckMode('ENFORCE')).to.equal('enforce');
		});

		/**
		 * `.env.sample` documente les valeurs acceptées en commentaire de fin de ligne, et le
		 * fichier réel finit toujours par le recopier — c'est déjà le cas de `ENV`.
		 */
		it('tolère un commentaire en fin de ligne', () => {
			expect(parseAppCheckMode('observe # off | observe | enforce')).to.equal('observe');
		});

		/**
		 * Le cœur du sujet : on échoue **fermé**. Une variable oubliée dans un nouvel environnement
		 * doit protéger, jamais ouvrir — c'était exactement le défaut de C-01.
		 */
		it('applique le mode strict quand la variable est absente', () => {
			expect(parseAppCheckMode(undefined)).to.equal('enforce');
			expect(parseAppCheckMode('')).to.equal('enforce');
		});

		/**
		 * Le piège propre à cette migration : quelqu'un recopie l'ancien `APP_CHECK_ENABLED=true`.
		 * Une lecture permissive ouvrirait alors les 8 routes d'avant-connexion en silence.
		 */
		it("applique le mode strict sur l'ancienne valeur booléenne", () => {
			expect(parseAppCheckMode('true')).to.equal('enforce');
			expect(parseAppCheckMode('false')).to.equal('enforce');
			expect(parseAppCheckMode('yes')).to.equal('enforce');
		});
	});

	/**
	 * `ENV` porte un commentaire en ligne dans les fichiers du projet (`dev # dev | prod`) : une
	 * comparaison sur la valeur brute aurait laissé passer la production en mode permissif.
	 */
	it("reconnaît la production malgré un commentaire en ligne", () => {
		expect(isProduction('prod')).to.be.true;
		expect(isProduction('prod # dev | prod')).to.be.true;
		expect(isProduction('production')).to.be.true;
		expect(isProduction('dev # dev | prod')).to.be.false;
		expect(isProduction(undefined)).to.be.false;
	});
});
