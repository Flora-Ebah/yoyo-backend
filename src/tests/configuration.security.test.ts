import { expect } from 'chai';
import { collectAppCheckWarnings, collectConfigurationIssues, isProduction } from '../config/security-check';

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
			APP_CHECK_ENABLED: 'true',
			APP_CHECK_ENFORCE: 'true',
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
			const warnings = warningsFor({ APP_CHECK_ENABLED: 'false' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('APP_CHECK_ENABLED');
		});

		it('signale des identifiants Firebase incomplets', () => {
			const warnings = warningsFor({ FIREBASE_PRIVATE_KEY: undefined });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('FIREBASE_PRIVATE_KEY');
		});

		it("signale l'observation pure, où rien n'est rejeté", () => {
			const warnings = warningsFor({ APP_CHECK_ENFORCE: 'false' });
			expect(warnings).to.have.lengthOf(1);
			expect(warnings[0]).to.contain('observation');
		});

		/**
		 * Le rejet route par route est l'étape intermédiaire prévue : il ferme ce qu'aucune
		 * application en retard n'appelle. Une liste non vide vaut donc protection.
		 */
		it("ne signale rien quand des routes sont fermées une à une", () => {
			expect(
				warningsFor({ APP_CHECK_ENFORCE: 'false', APP_CHECK_ENFORCE_ROUTES: '/clients/register,/otp/verify' })
			).to.deep.equal([]);
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
			expect(collectConfigurationIssues({ ...sound, APP_CHECK_ENABLED: 'false' })).to.deep.equal([]);
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
