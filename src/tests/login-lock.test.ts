import { expect } from 'chai';
import sinon from 'sinon';
import { LoginService } from '../modules/login/login.service';
import { LoginSet } from '../modules/login/login.model';

/**
 * Verrou de connexion (3 échecs ⇒ 30 minutes).
 *
 * Trois défauts corrigés et verrouillés ici :
 * - le verrou était lu dans un document au hasard du compte, alors que les tentatives sont
 *   enregistrées par appareil ;
 * - à l'expiration du verrou, le compteur restait à 3 : une seule erreur reverrouillait 30 minutes ;
 * - la réinitialisation du mot de passe par OTP ne levait pas le verrou (voir `clearLoginLock`).
 */
describe('Verrou de connexion', () => {
	const clientId = '507f1f77bcf86cd799439012';
	const inMinutes = (m: number) => new Date(Date.now() + m * 60_000);

	afterEach(() => sinon.restore());

	describe('checkAccountLock', () => {
		it('cherche un verrou actif sur tous les appareils du compte', async () => {
			const selectOne = sinon.stub(LoginSet.prototype, 'selectOne').callsFake((params: any) =>
				params.locked ? Promise.resolve({ locked: true, lockExpiration: inMinutes(12) }) : Promise.resolve(null)
			);

			const result = await new LoginService().checkAccountLock(clientId, 'okhttp/4');

			expect(result.isLocked).to.be.true;
			expect(result.message).to.contain('12 minutes');
			const lockQuery: any = selectOne.firstCall.args[0];
			expect(lockQuery).to.include({ user: clientId, locked: true });
			expect(lockQuery).to.not.have.property('userAgent');
			expect(lockQuery.lockExpiration.$gt).to.be.instanceOf(Date);
		});

		it("renvoie les tentatives de l'appareil courant quand rien n'est verrouillé", async () => {
			const mine = { attempts: 1, userAgent: 'okhttp/4' };
			const selectOne = sinon
				.stub(LoginSet.prototype, 'selectOne')
				.callsFake((params: any) => Promise.resolve(params.locked ? null : mine));

			const result = await new LoginService().checkAccountLock(clientId, 'okhttp/4');

			expect(result.isLocked).to.be.false;
			expect(result.loginAttempts).to.equal(mine);
			expect(selectOne.secondCall.args[0]).to.deep.equal({ user: clientId, userAgent: 'okhttp/4' });
		});
	});

	describe('handleFailedLogin', () => {
		const stubWrites = () => {
			sinon.stub(LoginSet.prototype, 'selectOne').resolves({ _id: 'x' } as any);
			return sinon.stub(LoginSet.prototype, 'update').resolves({} as any);
		};

		it('verrouille 30 minutes au 3ᵉ échec', async () => {
			const update = stubWrites();

			const data = await new LoginService().handleFailedLogin({ _id: clientId }, { attempts: 2 } as any, 'ua');

			expect(data.attempts).to.equal(3);
			expect(data.locked).to.be.true;
			const minutes = (data.lockExpiration!.getTime() - Date.now()) / 60_000;
			expect(minutes).to.be.within(29.9, 30);
			expect(update.firstCall.args[1]).to.include({ locked: true });
		});

		it("repart de zéro après l'expiration du verrou", async () => {
			const update = stubWrites();
			const expired = { attempts: 3, locked: true, lockExpiration: inMinutes(-1) } as any;

			const data = await new LoginService().handleFailedLogin({ _id: clientId }, expired, 'ua');

			expect(data.attempts).to.equal(1);
			expect(data.locked).to.be.false;
			// Effacé explicitement : `undefined` serait ignoré par Mongoose et laisserait la vieille date.
			expect(update.firstCall.args[1]).to.have.property('lockExpiration', null);
		});
	});

	describe('clearLoginLock', () => {
		it('lève le verrou sur tous les appareils du compte', async () => {
			const updateMany = sinon.stub(LoginSet.prototype, 'updateMany').resolves({} as any);

			await new LoginService().clearLoginLock(clientId);

			expect(updateMany.calledOnce).to.be.true;
			expect(updateMany.firstCall.args[0]).to.deep.equal({ user: clientId });
			expect(updateMany.firstCall.args[1]).to.deep.equal({ attempts: 0, locked: false, lockExpiration: null });
		});

		it("signale l'erreur du DAO", async () => {
			sinon.stub(LoginSet.prototype, 'updateMany').resolves({ error: true, data: 'boom' } as any);

			let thrown: any = null;
			try {
				await new LoginService().clearLoginLock(clientId);
			} catch (e) {
				thrown = e;
			}
			expect(thrown).to.deep.include({ error: true });
		});
	});
});
