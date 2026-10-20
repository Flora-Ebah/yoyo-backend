import { expect } from 'chai';
import sinon from 'sinon';
import { defines } from 'coddyger';
import { WaveHelper } from '../helpers/wave.helper';
import { WaveWebhookMiddleware } from '../api/middleware/wave-webhook.middleware';
import { TransactionService } from '../modules/transaction/transaction.service';
import waveWebhookRoute from '../api/routes/wave-webhook.route';

/**
 * [Wave] Intégration du paiement Wave.
 *
 * Verrouille les mêmes garanties que F-01 pour Orange Money : une notification n'active rien
 * par elle-même. La signature authentifie l'émetteur, puis la session est relue chez Wave et
 * contrôlée (référence, montant, devise) avant toute activation.
 */
describe('[Wave] Paiement Wave', () => {
	const SECRET = 'wave_sn_WHS_test_secret_0123456789';
	const NOW = 1_760_000_000;

	afterEach(() => {
		sinon.restore();
		delete process.env.WAVE_WEBHOOK_SECRET;
		delete process.env.WAVE_WEBHOOK_ALLOWED_IPS;
		delete process.env.WAVE_API_KEY;
	});

	const sign = (body: string, timestamp: number = NOW, secret: string = SECRET) =>
		`t=${timestamp},v1=${WaveHelper.computeSignature(secret, timestamp, body)}`;

	describe('WaveHelper.verifySignature', () => {
		const body = '{"id":"EV_1","type":"checkout.session.completed","data":{"id":"cos-1"}}';

		it('accepte une signature valide et récente', () => {
			expect(WaveHelper.verifySignature(sign(body), body, SECRET, NOW)).to.be.true;
		});

		it('rejette un corps modifié', () => {
			const tampered = body.replace('cos-1', 'cos-2');
			expect(WaveHelper.verifySignature(sign(body), tampered, SECRET, NOW)).to.be.false;
		});

		it('rejette un corps re-sérialisé (espacement différent)', () => {
			const reserialized = JSON.stringify(JSON.parse(body), null, 2);
			expect(WaveHelper.verifySignature(sign(body), reserialized, SECRET, NOW)).to.be.false;
		});

		it('rejette un mauvais secret', () => {
			expect(WaveHelper.verifySignature(sign(body, NOW, 'autre-secret'), body, SECRET, NOW)).to.be.false;
		});

		it('rejette un horodatage de plus de 5 minutes (rejeu)', () => {
			expect(WaveHelper.verifySignature(sign(body, NOW - 301), body, SECRET, NOW)).to.be.false;
		});

		it('rejette un horodatage trop loin dans le futur', () => {
			expect(WaveHelper.verifySignature(sign(body, NOW + 120), body, SECRET, NOW)).to.be.false;
		});

		it('accepte plusieurs v1 pendant une rotation de secret', () => {
			const valid = WaveHelper.computeSignature(SECRET, NOW, body);
			const header = `t=${NOW},v1=${'0'.repeat(64)},v1=${valid}`;
			expect(WaveHelper.verifySignature(header, body, SECRET, NOW)).to.be.true;
		});

		it('rejette un en-tête absent ou mal formé', () => {
			expect(WaveHelper.verifySignature(undefined, body, SECRET, NOW)).to.be.false;
			expect(WaveHelper.verifySignature('v1=abc', body, SECRET, NOW)).to.be.false;
			expect(WaveHelper.verifySignature(`t=${NOW}`, body, SECRET, NOW)).to.be.false;
		});
	});

	describe('WaveHelper.toPaymentStatus', () => {
		it('ne tranche le succès que sur complete + succeeded', () => {
			expect(WaveHelper.toPaymentStatus({ checkout_status: 'complete', payment_status: 'succeeded' })).to.equal('success');
		});

		it("laisse en attente un échec sur une session encore ouverte (le client peut retenter)", () => {
			expect(WaveHelper.toPaymentStatus({ checkout_status: 'open', payment_status: 'cancelled' })).to.equal('pending');
		});

		it('marque expirée une session expirée', () => {
			expect(WaveHelper.toPaymentStatus({ checkout_status: 'expired', payment_status: 'processing' })).to.equal('expired');
		});
	});

	describe('WaveHelper.formatAmount', () => {
		it('envoie un entier sous forme de chaîne (XOF sans décimale)', () => {
			expect(WaveHelper.formatAmount(5000)).to.equal('5000');
			expect(WaveHelper.formatAmount(4999.6)).to.equal('5000');
		});
	});

	describe('WaveWebhookMiddleware.verify', () => {
		// `coddyger.api` répond de façon asynchrone : on laisse passer un tick avant d'observer.
		const fakeReply = () => ({ status: sinon.stub().returnsThis(), send: sinon.stub() });
		const flush = () => new Promise(resolve => setImmediate(resolve));
		const body = '{"id":"EV_1","type":"checkout.session.completed","data":{"id":"cos-1"}}';

		const run = async (request: any) => {
			const reply: any = fakeReply();
			await WaveWebhookMiddleware.verify({ ip: '35.233.61.130', ...request }, reply, () => {});
			await flush();
			return reply;
		};

		it('laisse passer une requête correctement signée', async () => {
			process.env.WAVE_WEBHOOK_SECRET = SECRET;
			const timestamp = Math.floor(Date.now() / 1000);
			const reply = await run({ rawBody: body, headers: { 'wave-signature': sign(body, timestamp) } });
			expect(reply.send.called).to.be.false;
		});

		it('refuse une requête non signée', async () => {
			process.env.WAVE_WEBHOOK_SECRET = SECRET;
			const reply = await run({ rawBody: body, headers: {} });
			expect(reply.status.calledWith(defines.status.authError)).to.be.true;
		});

		it('refuse tout quand le secret du webhook n\'est pas configuré', async () => {
			const timestamp = Math.floor(Date.now() / 1000);
			const reply = await run({ rawBody: body, headers: { 'wave-signature': sign(body, timestamp) } });
			expect(reply.status.calledWith(defines.status.authError)).to.be.true;
		});

		it('applique l\'allowlist d\'IP quand elle est renseignée', async () => {
			process.env.WAVE_WEBHOOK_SECRET = SECRET;
			process.env.WAVE_WEBHOOK_ALLOWED_IPS = '35.241.219.1';
			const timestamp = Math.floor(Date.now() / 1000);
			const reply = await run({ rawBody: body, headers: { 'wave-signature': sign(body, timestamp) } });
			expect(reply.status.calledWith(defines.status.authError)).to.be.true;
		});
	});

	describe('TransactionService — règlement Wave', () => {
		const TX_ID = '507f1f77bcf86cd799439021';

		const buildTransaction = (overrides: any = {}) => ({
			_id: TX_ID,
			user: '507f1f77bcf86cd799439022',
			plan: '507f1f77bcf86cd799439023',
			amount: 5000,
			currency: 'XOF',
			paymentMethod: 'wave',
			paymentToken: 'cos-18qq25rgr100a',
			paymentStatus: 'pending',
			...overrides
		});

		const buildSession = (overrides: any = {}) => ({
			id: 'cos-18qq25rgr100a',
			amount: '5000',
			currency: 'XOF',
			client_reference: TX_ID,
			checkout_status: 'complete',
			payment_status: 'succeeded',
			transaction_id: 'TCN4Y4ZC3FM',
			wave_launch_url: 'https://pay.wave.com/c/cos-18qq25rgr100a',
			...overrides
		});

		it('relit la session chez Wave par l\'identifiant stocké, pas celui de l\'événement', async () => {
			const service = new TransactionService();
			const getOne = sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			const sessionStub = sinon.stub(WaveHelper.prototype, 'getCheckoutSession').resolves(buildSession() as any);
			sinon.stub(service, 'update').resolves({} as any);
			const updateStub = sinon.stub(service, 'updateTransactionStatus').resolves(buildTransaction() as any);

			await service.settleWaveEvent({ id: 'EV_1', type: 'checkout.session.completed', data: { id: 'cos-18qq25rgr100a', payment_status: 'succeeded' } });

			expect(getOne.firstCall.args[0]).to.deep.equal({ paymentMethod: 'wave', paymentToken: 'cos-18qq25rgr100a' });
			expect(sessionStub.firstCall.args[0]).to.equal('cos-18qq25rgr100a');
			expect(updateStub.firstCall.args[1]).to.equal('success');
		});

		it('rejette un montant divergent (sous-paiement)', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			sinon.stub(WaveHelper.prototype, 'getCheckoutSession').resolves(buildSession({ amount: '100' }) as any);
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleWaveEvent({ type: 'checkout.session.completed', data: { id: 'cos-18qq25rgr100a' } });

			expect(result.amountMismatch).to.be.true;
			expect(updateStub.called).to.be.false;
		});

		it('rejette une devise divergente', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			sinon.stub(WaveHelper.prototype, 'getCheckoutSession').resolves(buildSession({ currency: 'GMD' }) as any);
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleWaveEvent({ type: 'checkout.session.completed', data: { id: 'cos-18qq25rgr100a' } });

			expect(result.amountMismatch).to.be.true;
			expect(updateStub.called).to.be.false;
		});

		it('rejette une session qui ne porte pas notre référence de transaction', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			sinon.stub(WaveHelper.prototype, 'getCheckoutSession').resolves(buildSession({ client_reference: 'autre' }) as any);
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleWaveEvent({ type: 'checkout.session.completed', data: { id: 'cos-18qq25rgr100a' } });

			expect(result.referenceMismatch).to.be.true;
			expect(updateStub.called).to.be.false;
		});

		it('ne touche pas à la transaction tant que la session est ouverte', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(buildTransaction() as any);
			sinon.stub(WaveHelper.prototype, 'getCheckoutSession').resolves(
				buildSession({ checkout_status: 'open', payment_status: 'cancelled', last_payment_error: { code: 'insufficient-funds', message: '' } }) as any
			);
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleWaveEvent({ type: 'checkout.session.payment_failed', data: { id: 'cos-18qq25rgr100a' } });

			expect(result.providerStatus).to.equal('pending');
			expect(updateStub.called).to.be.false;
		});

		it('est idempotent sur une transaction déjà réglée (événement rejoué)', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(buildTransaction({ paymentStatus: 'success' }) as any);
			const sessionStub = sinon.stub(WaveHelper.prototype, 'getCheckoutSession');
			const updateStub = sinon.stub(service, 'updateTransactionStatus');

			const result: any = await service.settleWaveEvent({ type: 'checkout.session.completed', data: { id: 'cos-18qq25rgr100a' } });

			expect(result.alreadySettled).to.be.true;
			expect(sessionStub.called).to.be.false;
			expect(updateStub.called).to.be.false;
		});

		it('ignore une session inconnue et les événements hors checkout', async () => {
			const service = new TransactionService();
			sinon.stub(service, 'getOne').resolves(null as any);
			const sessionStub = sinon.stub(WaveHelper.prototype, 'getCheckoutSession');

			const unknown: any = await service.settleWaveEvent({ type: 'checkout.session.completed', data: { id: 'cos-inconnue' } });
			const other: any = await service.settleWaveEvent({ type: 'test.test_event', data: {} });

			expect(unknown.found).to.be.false;
			expect(other.ignored).to.be.true;
			expect(sessionStub.called).to.be.false;
		});

		it('refuse un paiement Wave quand Wave n\'est pas configuré', async () => {
			const service = new TransactionService();
			const result: any = await service.createPlanTransaction(
				'507f1f77bcf86cd799439022', '507f1f77bcf86cd799439023', false, undefined, 'wave'
			);

			expect(result.success).to.be.false;
			expect(result.status).to.equal(400);
		});

		it('ne propose Wave que s\'il est configuré', () => {
			expect(TransactionService.availableProviders()).to.deep.equal(['orange-money']);
			process.env.WAVE_API_KEY = 'wave_sn_prod_test';
			expect(TransactionService.availableProviders()).to.deep.equal(['orange-money', 'wave']);
		});
	});

	describe('Route POST /transactions/wave-webhook', () => {
		const routes: any[] = [];
		const parsers: any[] = [];
		waveWebhookRoute(
			{
				route: (definition: any) => routes.push(definition),
				addContentTypeParser: (...args: any[]) => parsers.push(args)
			},
			{},
			() => {}
		);

		const route = routes.find(r => r.method === 'POST' && r.url === '/transactions/wave-webhook');

		it('est authentifiée par le middleware de signature Wave', () => {
			expect(route, 'route wave-webhook introuvable').to.not.be.undefined;
			expect(route.preHandler).to.equal(WaveWebhookMiddleware.verify);
		});

		it('est limitée en débit', () => {
			expect(route.config?.rateLimit).to.not.be.undefined;
		});

		it('conserve le corps brut pour la vérification de signature', () => {
			expect(parsers).to.have.length(1);
			const [contentType, options, parser] = parsers[0];
			expect(contentType).to.equal('application/json');
			expect(options.parseAs).to.equal('string');

			const request: any = {};
			let parsedBody: any;
			parser(request, '{"type":"x"}', (_err: any, value: any) => (parsedBody = value));
			expect(request.rawBody).to.equal('{"type":"x"}');
			expect(parsedBody).to.deep.equal({ type: 'x' });
		});
	});
});
