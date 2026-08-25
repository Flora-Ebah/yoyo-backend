import { expect } from 'chai';
import sinon from 'sinon';
import { MongoDbDao } from 'coddyger';
import { OtpController, OtpSet } from '../modules/otp';
import { ClientService } from '../modules/client/client.service';
import { MessageHelper } from '../helpers';

/**
 * [SÉCURITÉ] Vérification d'un code OTP.
 *
 * Depuis F-03, c'est cette méthode qui émet le jeton autorisant la réinitialisation d'un mot de
 * passe : elle est le dernier obstacle avant une prise de contrôle de compte. Or elle n'en était
 * pas un. La recherche filtrait déjà sur le code, donc la comparaison qui suivait était toujours
 * vraie et la branche d'échec — celle qui compte les tentatives — n'était jamais atteinte.
 * `maxAttempts: 3` n'était donc jamais appliqué : un code à 6 chiffres se devinait.
 *
 * Ces tests verrouillent le décompte des tentatives, l'invalidation du code au-delà du quota, et
 * le fait que le jeton n'est émis que pour un parcours « mot de passe oublié ».
 */
describe('[Sécurité] Vérification du code OTP', () => {
	const controller = new OtpController();
	const userId = '507f1f77bcf86cd799439012';

	const activeOtp = (overrides: any = {}) => ({
		_id: '507f1f77bcf86cd799439011',
		code: '123456',
		login: 'user@example.com',
		type: 'email',
		purpose: 'password_reset',
		status: 'active',
		attempts: 0,
		...overrides
	});

	let selectOne: sinon.SinonStub;
	let update: sinon.SinonStub;
	let getOne: sinon.SinonStub;

	beforeEach(() => {
		selectOne = sinon.stub(OtpSet.prototype, 'selectOne');
		update = sinon.stub(MongoDbDao.prototype, 'update').resolves({} as any);
		getOne = sinon.stub(ClientService.prototype, 'getOne').resolves({ _id: userId } as any);
		sinon.stub(ClientService.prototype, 'update').resolves({} as any);
		sinon.stub(MessageHelper, 'welcomeClient').resolves();
	});

	afterEach(() => sinon.restore());

	/**
	 * `generate()` enregistre l'OTP sous un login formaté (minuscules, espaces retirés). La
	 * vérification interrogeait avec le login brut : une adresse saisie avec une majuscule ne
	 * retrouvait jamais son code, et le parcours échouait en boucle.
	 */
	it('normalise le login avant de chercher le code', async () => {
		selectOne.resolves(activeOtp());

		await controller.verify('User@Example.COM', '123456');

		expect(selectOne.firstCall.args[0]).to.include({ login: 'user@example.com' });
	});

	it('normalise aussi un numéro de téléphone saisi avec des espaces', async () => {
		selectOne.resolves(activeOtp({ login: '0701020304', type: 'phone' }));

		await controller.verify('07 01 02 03 04', '123456');

		expect(selectOne.firstCall.args[0]).to.include({ login: '0701020304' });
	});

	it('ignore les codes déjà utilisés ou périmés', async () => {
		selectOne.resolves(null);

		const result: any = await controller.verify('user@example.com', '123456');

		const params = selectOne.firstCall.args[0];
		expect(params.status).to.equal('active');
		expect(params.expiresAt, "l'expiration doit être filtrée en base").to.have.property('$gt');
		expect(result.status).to.equal(400);
		// Message indifférencié : il ne doit pas révéler si le login existe.
		expect(result.message).to.equal('Code OTP invalide ou expiré');
	});

	it('compte les tentatives sur un code erroné', async () => {
		selectOne.resolves(activeOtp({ attempts: 0 }));

		const result: any = await controller.verify('user@example.com', '000000');

		expect(result.status).to.equal(400);
		expect(result.message).to.equal('Code OTP incorrect');
		expect(result.data).to.deep.equal({ verified: false, attempts: 1 });
		expect(update.calledOnce).to.be.true;
		expect(update.firstCall.args[1]).to.deep.equal({ attempts: 1 });
	});

	/**
	 * Le point central : sans ce plafond, le code se devine par balayage.
	 */
	it('invalide le code une fois le quota de tentatives épuisé', async () => {
		// `password_reset` autorise 3 tentatives : celle-ci est la troisième.
		selectOne.resolves(activeOtp({ attempts: 2 }));

		const result: any = await controller.verify('user@example.com', '000000');

		expect(result.message).to.equal('Trop de tentatives. Demandez un nouveau code.');
		expect(update.firstCall.args[1]).to.include({ status: 'expired' });
	});

	it("n'émet aucun jeton tant que le code n'est pas exact", async () => {
		selectOne.resolves(activeOtp());

		const result: any = await controller.verify('user@example.com', '000000');

		expect(result.data).to.not.have.property('resetToken');
	});

	it('émet le jeton de réinitialisation pour un code exact', async () => {
		selectOne.resolves(activeOtp());

		const result: any = await controller.verify('user@example.com', '123456');

		expect(result.status).to.equal(200);
		expect(result.data.resetToken).to.be.a('string');
		expect(update.firstCall.args[1]).to.include({ status: 'used' });
	});

	/**
	 * Un code de vérification de compte ne doit pas ouvrir la porte au changement de mot de passe.
	 */
	it("n'émet aucun jeton pour un OTP d'un autre motif", async () => {
		selectOne.resolves(activeOtp({ purpose: 'account_verification' }));

		const result: any = await controller.verify('user@example.com', '123456');

		expect(result.status).to.equal(200);
		expect(result.data.resetToken).to.be.null;
	});

	it("n'émet aucun jeton lorsque le login ne correspond à aucun compte", async () => {
		selectOne.resolves(activeOtp());
		getOne.resolves(null);

		const result: any = await controller.verify('user@example.com', '123456');

		expect(result.data.resetToken).to.be.null;
	});

	/**
	 * `userId` n'autorise plus rien depuis F-03 ; le laisser exposé invite à réintroduire le schéma
	 * « l'appelant annonce sa cible », qui était précisément la faille.
	 */
	it("ne renvoie plus l'identifiant du compte", async () => {
		selectOne.resolves(activeOtp());

		const result: any = await controller.verify('user@example.com', '123456');

		expect(result.data).to.not.have.property('userId');
	});
});
