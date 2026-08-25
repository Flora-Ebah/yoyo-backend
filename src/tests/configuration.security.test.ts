import { expect } from 'chai';
import { collectConfigurationIssues, isProduction } from '../config/security-check';

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
		JWT_PUBLIC: 'c'.repeat(24),
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

	/**
	 * Cette clé est embarquée en dur dans les 4 applications et franchit `TokenMiddleware.verify`.
	 */
	it('refuse la clé technique partagée par les applications', () => {
		const issues = issuesFor({ JWT_PUBLIC: 'TrQpAbG2tByxw0eS' });
		expect(issues).to.have.lengthOf(1);
		expect(issues[0]).to.contain('F-07b');
	});

	it("refuse les valeurs d'exemple du fichier de configuration", () => {
		expect(issuesFor({ JWT_SECRET: 'your-secret-jwt-key-minimum-32-characters-long' })).to.have.lengthOf(1);
		expect(issuesFor({ JWT_PUBLIC: 'your-public-jwt-key' })).to.have.lengthOf(1);
	});

	it('refuse un secret de signature trop court', () => {
		const issues = issuesFor({ JWT_SECRET: 'trop-court' });
		expect(issues[0]).to.contain('au moins 32');
	});

	it('refuse un secret de signature absent', () => {
		expect(issuesFor({ JWT_SECRET: undefined })).to.have.lengthOf(1);
		expect(issuesFor({ JWT_AUTH_SECRET: undefined })).to.have.lengthOf(1);
		expect(issuesFor({ JWT_PUBLIC: undefined })).to.have.lengthOf(1);
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
			JWT_PUBLIC: 'TrQpAbG2tByxw0eS',
			DEFAULT_ACCOUNT: 'admin@yoyocarte.com:admin'
		} as any);

		expect(issues).to.have.lengthOf(4);
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
