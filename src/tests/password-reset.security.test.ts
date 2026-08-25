import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import { MongoDbDao, env } from 'coddyger';
import { PasswordResetTokenHelper } from '../helpers/password-reset-token.helper';

/**
 * [SÉCURITÉ F-03] Non-régression sur la réinitialisation de mot de passe.
 *
 * Avant correctif, `PUT /clients/updatePassword` acceptait un `_id` arbitraire dans le corps de la
 * requête. Appelée avec le jeton public embarqué dans l'application, la route permettait de
 * redéfinir le mot de passe de n'importe quel compte, administrateurs compris.
 *
 * Ces tests verrouillent le remplaçant : la cible vient d'un jeton signé par le serveur, à usage
 * unique, et rien d'autre ne fait autorité.
 */
describe('[F-03] Jeton de réinitialisation de mot de passe', () => {
	const userId = '507f1f77bcf86cd799439012';

	// `selectOne` cherche un jeton déjà consommé ; le DAO coddyger rejette quand il ne trouve rien.
	const stubStore = (alreadyUsed: boolean) => {
		const selectOne = sinon
			.stub(MongoDbDao.prototype, 'selectOne')
			.callsFake(() => (alreadyUsed ? Promise.resolve({} as any) : Promise.reject(null)));
		const save = sinon.stub(MongoDbDao.prototype, 'save').resolves({} as any);
		return { selectOne, save };
	};

	afterEach(() => sinon.restore());

	it('émet un jeton portant le compte visé et son usage', () => {
		const token = PasswordResetTokenHelper.issue(userId);
		const payload: any = jwt.verify(token, env.jwt.secret!);

		expect(payload.sub).to.equal(userId);
		expect(payload.purpose).to.equal('password_reset');
		expect(payload.exp - payload.iat).to.equal(15 * 60);
	});

	it('accepte un jeton légitime et renvoie le compte visé', async () => {
		const { save } = stubStore(false);
		const token = PasswordResetTokenHelper.issue(userId);

		const result = await PasswordResetTokenHelper.consume(token);

		expect(result).to.equal(userId);
		// La consommation est enregistrée, sans quoi le jeton resterait rejouable.
		expect(save.calledOnce).to.be.true;
		expect(save.firstCall.args[0]).to.include({ token, status: 'inactive' });
	});

	it('refuse un jeton déjà utilisé (rejeu)', async () => {
		const { save } = stubStore(true);
		const token = PasswordResetTokenHelper.issue(userId);

		const result = await PasswordResetTokenHelper.consume(token);

		expect(result).to.be.null;
		expect(save.called).to.be.false;
	});

	it('refuse un jeton signé avec une autre clé', async () => {
		stubStore(false);
		const forged = jwt.sign({ sub: userId, purpose: 'password_reset' }, 'clé-de-l-attaquant', {
			expiresIn: 900
		});

		expect(await PasswordResetTokenHelper.consume(forged)).to.be.null;
	});

	/**
	 * Le point central du correctif : un jeton de session est signé avec la même clé. S'il était
	 * accepté ici, tout utilisateur connecté pourrait de nouveau viser un compte tiers.
	 */
	it("refuse un jeton de session, signé avec la même clé mais d'un autre usage", async () => {
		stubStore(false);
		const sessionToken = jwt.sign({ _id: userId, isAdmin: false }, env.jwt.secret!, {
			expiresIn: 900
		});

		expect(await PasswordResetTokenHelper.consume(sessionToken)).to.be.null;
	});

	it('refuse un jeton expiré', async () => {
		stubStore(false);
		const expired = jwt.sign({ sub: userId, purpose: 'password_reset' }, env.jwt.secret!, {
			expiresIn: -10
		});

		expect(await PasswordResetTokenHelper.consume(expired)).to.be.null;
	});

	it('refuse une valeur vide', async () => {
		stubStore(false);

		expect(await PasswordResetTokenHelper.consume('')).to.be.null;
		expect(await PasswordResetTokenHelper.consume(undefined as any)).to.be.null;
	});

	it("refuse un jeton dont le sujet est absent", async () => {
		stubStore(false);
		const noSubject = jwt.sign({ purpose: 'password_reset' }, env.jwt.secret!, {
			expiresIn: 900
		});

		expect(await PasswordResetTokenHelper.consume(noSubject)).to.be.null;
	});
});
