import { expect } from 'chai';
import sinon from 'sinon';
import { defines } from 'coddyger';
import { PaymentNotifyMiddleware } from '../api/middleware/payment-notify.middleware';
import { TransactionService } from '../modules/transaction/transaction.service';
import { PaymentHelper } from '../helpers/payment.helper';

/**
 * [SÉCURITÉ F-01] Non-régression sur l'activation d'abonnement.
 *
 * Avant correctif, `POST /transactions/payment-webhook` activait un abonnement sur simple
 * requête forgée, et `payment-notify` faisait confiance au `status` du corps de la requête.
 * Ces tests verrouillent le comportement attendu : le statut vient toujours du prestataire.
 */
describe('[F-01] Notification de paiement', () => {
	afterEach(() => {
		sinon.restore();
		delete process.env.OM_NOTIFY_ALLOWED_IPS;
	});

	describe('TransactionService.settleNotification', () => {
		const buildTransaction = (overrides: any = {}) => ({
			_id: '507f1f77bcf86cd799439011',
			user: '507f1f77bcf86cd799439012',
			plan: '507f1f77bcf86cd799439013',
			amount: 5000,
			paymentToken: 'pay-token-abc',
			paymentStatus: 'pending',
			...overrides
		});

		it("ignore le statut annoncé et interroge le prestataire", async () => {
			const service = new TransactionService();
			const transaction = buildTransaction();

			sinon.stub(service, 'getOne').resolves(transaction as any);
			const providerStub = sinon
				.stub(PaymentHelper.prototype, 'checkTransactionStatus')
				.resolves({ status: 'FAILED', amount: 5000 });
			const updateStub = sinon
				.stub(service, 'updateTransactionStatus')
				.resolves(transaction as any);

			await service.settleNotification('notif-token-xyz');

			// Le prestataire est bien consulté, avec les valeurs de la BASE (pas du body).
			expect(providerStub.calledOnce).to.be.true;
			expect(providerStub.firstCall.args[0]).to.deep.equal({
				orderId: transaction._id,
				amount: transaction.amount,
				payToken: transaction.paymentToken
			});

			// Le statut retenu est celui du prestataire, pas un 'success' annoncé.
			expect(updateStub.calledOnce).to.be.true;
			expect(updateStub.firstCall.args[1]).to.equal('failed');
		});

		it("n'active pas d'abonnement quand le prestataire refuse", async () => {
			const service = new TransactionService();

			sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			sinon
				.stub(PaymentHelper.prototype, 'checkTransactionStatus')
				.resolves({ status: 'FAILED', amount: 5000 });
			const updateStub = sinon
				.stub(service, 'updateTransactionStatus')
				.resolves({} as any);

			await service.settleNotification('notif-token-xyz');

			expect(updateStub.firstCall.args[1]).to.not.equal('success');
		});

		it('rejette un montant divergent (sous-paiement)', async () => {
			const service = new TransactionService();

			sinon.stub(service, 'getOne').resolves(buildTransaction({ amount: 5000 }) as any);
			sinon
				.stub(PaymentHelper.prototype, 'checkTransactionStatus')
				.resolves({ status: 'SUCCESS', amount: 100 });
			const updateStub = sinon.stub(service, 'updateTransactionStatus').resolves({} as any);

			const result: any = await service.settleNotification('notif-token-xyz');

			expect(result.amountMismatch).to.be.true;
			expect(updateStub.called).to.be.false;
		});

		it('est idempotent sur une transaction déjà réglée', async () => {
			const service = new TransactionService();

			sinon
				.stub(service, 'getOne')
				.resolves(buildTransaction({ paymentStatus: 'success' }) as any);
			const providerStub = sinon.stub(PaymentHelper.prototype, 'checkTransactionStatus');
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleNotification('notif-token-xyz');

			expect(result.alreadySettled).to.be.true;
			expect(providerStub.called).to.be.false;
			expect(updateStub.called).to.be.false;
		});

		it('rejette un notifyToken inconnu', async () => {
			const service = new TransactionService();

			sinon.stub(service, 'getOne').resolves(null as any);
			const providerStub = sinon.stub(PaymentHelper.prototype, 'checkTransactionStatus');

			const result: any = await service.settleNotification('token-inexistant');

			expect(result.found).to.be.false;
			expect(providerStub.called).to.be.false;
		});

		it("active l'abonnement quand le prestataire confirme et que le montant correspond", async () => {
			const service = new TransactionService();
			const transaction = buildTransaction();

			sinon.stub(service, 'getOne').resolves(transaction as any);
			sinon
				.stub(PaymentHelper.prototype, 'checkTransactionStatus')
				.resolves({ status: 'SUCCESS', amount: 5000 });
			const updateStub = sinon
				.stub(service, 'updateTransactionStatus')
				.resolves(transaction as any);

			await service.settleNotification('notif-token-xyz');

			expect(updateStub.calledOnce).to.be.true;
			expect(updateStub.firstCall.args[1]).to.equal('success');
		});
	});

	describe('PaymentNotifyMiddleware.verifySource', () => {
		// `coddyger.api` répond via `reply.status(...).send(...)`, en résolvant de façon
		// asynchrone : on laisse donc passer un tick avant d'observer la réponse.
		const fakeReply = () => ({ status: sinon.stub().returnsThis(), send: sinon.stub() });
		const flush = () => new Promise(resolve => setImmediate(resolve));

		const run = async (ip: string) => {
			const reply: any = fakeReply();
			await PaymentNotifyMiddleware.verifySource({ ip }, reply, () => {});
			await flush();
			return reply;
		};

		it('laisse passer quand aucune allowlist n\'est configurée', async () => {
			process.env.OM_NOTIFY_ALLOWED_IPS = '';
			const reply = await run('1.2.3.4');
			expect(reply.send.called).to.be.false;
		});

		it('laisse passer une IP présente dans l\'allowlist', async () => {
			process.env.OM_NOTIFY_ALLOWED_IPS = '10.0.0.1, 41.66.0.10';
			const reply = await run('41.66.0.10');
			expect(reply.send.called).to.be.false;
		});

		it('normalise les adresses IPv4-mapped', async () => {
			process.env.OM_NOTIFY_ALLOWED_IPS = '41.66.0.10';
			const reply = await run('::ffff:41.66.0.10');
			expect(reply.send.called).to.be.false;
		});

		it('bloque une IP hors allowlist', async () => {
			process.env.OM_NOTIFY_ALLOWED_IPS = '41.66.0.10';
			const reply = await run('1.2.3.4');
			expect(reply.send.called).to.be.true;
			expect(reply.status.calledWith(defines.status.authError)).to.be.true;
		});
	});
});
