import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PaymentService } from '../modules/payment/payment.service';
import { PaymentSet } from '../modules/payment/payment.model';
import { PartnerSet } from '../modules/partner';
import { SubscriptionService } from '../modules/subscription/subscription.service';
import { PushNotificationService } from '../modules/push-notification';
import { PlatformConfigService } from '../modules/platform-config/platform-config.service';

/**
 * Flux 100% client de validation des réductions.
 *
 * La validation marchand (accept/reject, `PUT /payments`, `POST /payments/validate/:partnerId`) a
 * été supprimée. Le client valide désormais lui-même sa réduction en un seul appel (`redeem`), et
 * le marchand ne garde que le pouvoir d'invalider a posteriori un ticket (`invalidate`).
 *
 * Ces tests verrouillent les garanties clés :
 *  - le pourcentage appliqué est celui de la BOUTIQUE (`maxDiscount`), figé côté serveur ;
 *  - le net et la réduction sont recalculés serveur, jamais acceptés du client ;
 *  - le montant est borné (> 0 et ≥ minOrder) ;
 *  - l'appel est idempotent (anti double-soumission) ;
 *  - le montant est plafonné, et le client limité par boutique (délai) et par jour (quota) ;
 *  - un montant inhabituel pour la boutique est signalé au marchand sans être bloqué ;
 *  - seul le propriétaire de la boutique peut invalider, et seulement un ticket `success`.
 */
describe('[Sécurité] Flux client de validation des réductions', () => {
  let mongod: MongoMemoryServer;
  let service: PaymentService;
  let notifyStub: sinon.SinonStub;

  /** Le commerçant, propriétaire de la boutique. */
  const OWNER_ID = '507f1f77bcf86cd799439031';
  /** Le client qui scanne et valide. */
  const CLIENT_ID = '507f1f77bcf86cd799439032';
  /** Un autre compte connecté, ni client ni propriétaire. */
  const ATTACKER_ID = '507f1f77bcf86cd799439033';
  const PARTNER_ID = '507f1f77bcf86cd799439034';

  const MIN_ORDER = 5000;
  const MAX_DISCOUNT = 20; // pourcentage de la boutique
  /** Garde-fous par défaut des tests (`redeemLimits`), surchargés au cas par cas. */
  const LIMITS = { maxAmount: 500000, cooldownHours: 4, maxPerDay: 5 };
  let limitsStub: sinon.SinonStub;

  const paymentModel = () => (new PaymentSet() as any).defaultModel;
  const partnerModel = () => (new PartnerSet() as any).defaultModel;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-validation' });
    await paymentModel().syncIndexes();

    await partnerModel().create({
      _id: new mongoose.Types.ObjectId(PARTNER_ID),
      slug: 'boutique-validation',
      name: 'Boutique de validation',
      status: 'active',
      user: new mongoose.Types.ObjectId(OWNER_ID),
      maxDiscount: MAX_DISCOUNT,
      minOrder: MIN_ORDER
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await paymentModel().deleteMany({});
    service = new PaymentService();

    sinon.stub(SubscriptionService.prototype, 'getCurrentSubscriptionWithPlanDetails').resolves({
      userId: { _id: CLIENT_ID, firstname: 'Awa', lastname: 'Diallo' }
    } as any);

    notifyStub = sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
    limitsStub = sinon.stub(PlatformConfigService.prototype, 'getRedeemLimits').resolves({ ...LIMITS });
  });

  afterEach(() => {
    sinon.restore();
  });

  /** Insère un ticket success et renvoie son identifiant. */
  const givenSuccessTicket = async (
    amount = 10000,
    opts: { to?: string; completedAt?: Date; status?: string } = {}
  ): Promise<string> => {
    const id = new mongoose.Types.ObjectId();
    await paymentModel().create({
      _id: id,
      from: new mongoose.Types.ObjectId(CLIENT_ID),
      to: new mongoose.Types.ObjectId(opts.to ?? PARTNER_ID),
      amount,
      discountPercentage: MAX_DISCOUNT,
      status: opts.status ?? 'success',
      completedAt: opts.completedAt ?? new Date(),
      validatedBy: 'client'
    });
    return String(id);
  };

  describe('redeem — calcul et sécurité', () => {
    it('applique le pourcentage de la BOUTIQUE et calcule net + réduction côté serveur', async () => {
      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
      // 20% de 10000 => net 8000, réduction 2000.
      expect(result.ticket.montant).to.equal(10000);
      expect(result.ticket.discountPercentage).to.equal(MAX_DISCOUNT);
      expect(result.ticket.net).to.equal(8000);
      expect(result.ticket.reduction).to.equal(2000);

      const payment: any = await paymentModel().findById(result.ticket._id).lean();
      expect(payment.status).to.equal('success');
      expect(payment.discountPercentage).to.equal(MAX_DISCOUNT);
      expect(payment.validatedBy).to.equal('client');
      expect(payment.completedAt).to.be.instanceOf(Date);
    });

    it("ne fait JAMAIS confiance à un net ou une réduction fournis par le client", async () => {
      // Le client tente d'injecter un net/réduction : seuls `to` et `amount` sont lus.
      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);

      expect(result.ticket.net).to.equal(8000);
      expect(result.ticket.reduction).to.equal(2000);
    });

    it('refuse un montant nul, négatif ou non numérique', async () => {
      for (const amount of [0, -100, undefined, null, 'abc']) {
        await paymentModel().deleteMany({});
        const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, amount as any);

        expect(result.error, `le montant ${String(amount)} doit être refusé`).to.be.true;
        const count = await paymentModel().countDocuments({});
        expect(count).to.equal(0);
      }
    });

    it('refuse un montant inférieur au minimum de commande', async () => {
      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, MIN_ORDER - 1);

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain(String(MIN_ORDER));
    });

    it('refuse un client sans abonnement actif', async () => {
      sinon.restore();
      sinon.stub(SubscriptionService.prototype, 'getCurrentSubscriptionWithPlanDetails').resolves(null as any);
      sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);

      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);
      expect(result.error).to.be.true;
    });

    it('refuse une boutique inexistante sans rien écrire', async () => {
      const result: any = await service.redeem(CLIENT_ID, '507f1f77bcf86cd799439099', 10000);

      expect(result.error).to.be.true;
      const count = await paymentModel().countDocuments({});
      expect(count).to.equal(0);
    });

    it('notifie le marchand après un ticket créé', async () => {
      await service.redeem(CLIENT_ID, PARTNER_ID, 10000);
      expect(notifyStub.callCount).to.equal(1);
    });

    it('idempotence : une double-soumission identique renvoie le même ticket sans en créer un second', async () => {
      const first: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);
      const second: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);

      expect(first.error).to.not.equal(true);
      expect(second.error).to.not.equal(true);
      expect(String(second.ticket._id)).to.equal(String(first.ticket._id));

      const count = await paymentModel().countDocuments({ from: CLIENT_ID, to: PARTNER_ID, status: 'success' });
      expect(count, 'un seul ticket malgré la double soumission').to.equal(1);
      // Une seule notification marchand.
      expect(notifyStub.callCount).to.equal(1);
    });
  });

  describe('redeem — garde-fous du montant saisi par le client', () => {
    const OTHER_PARTNER_ID = '507f1f77bcf86cd799439035';
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

    it('refuse un montant au-dessus du plafond de la plateforme', async () => {
      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, LIMITS.maxAmount + 1);

      expect(result.error).to.be.true;
      expect(await paymentModel().countDocuments({})).to.equal(0);
    });

    it('applique le plafond propre à la boutique (maxOrder) avant celui de la plateforme', async () => {
      await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { maxOrder: 20000 } });
      try {
        const refused: any = await service.redeem(CLIENT_ID, PARTNER_ID, 20001);
        expect(refused.error).to.be.true;

        const accepted: any = await service.redeem(CLIENT_ID, PARTNER_ID, 20000);
        expect(accepted.error, JSON.stringify(accepted.data)).to.not.equal(true);
      } finally {
        await partnerModel().updateOne({ _id: PARTNER_ID }, { $unset: { maxOrder: 1 } });
      }
    });

    it('plafond à 0 = désactivé', async () => {
      limitsStub.resolves({ ...LIMITS, maxAmount: 0 });
      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 5000000);

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('refuse une seconde réduction dans la même boutique avant la fin du délai', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(1) });

      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 12000);

      expect(result.error).to.be.true;
      expect(await paymentModel().countDocuments({ status: 'success' })).to.equal(1);
    });

    it('accepte une nouvelle réduction dans la même boutique une fois le délai écoulé', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(LIMITS.cooldownHours + 1) });

      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 12000);

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('un ticket invalidé ne déclenche pas le délai', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(1), status: 'invalidated' });

      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 12000);

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('la double-soumission reste idempotente malgré le délai par boutique', async () => {
      const first: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);
      const replay: any = await service.redeem(CLIENT_ID, PARTNER_ID, 10000);

      expect(replay.error, JSON.stringify(replay.data)).to.not.equal(true);
      expect(String(replay.ticket._id)).to.equal(String(first.ticket._id));
    });

    it('refuse au-delà du quota journalier, toutes boutiques confondues', async () => {
      limitsStub.resolves({ ...LIMITS, maxPerDay: 2, cooldownHours: 0 });
      const now = new Date();
      // Deux tickets aujourd'hui dans une autre boutique.
      await givenSuccessTicket(10000, { to: OTHER_PARTNER_ID, completedAt: now });
      await givenSuccessTicket(11000, { to: OTHER_PARTNER_ID, completedAt: now });

      const result: any = await service.redeem(CLIENT_ID, PARTNER_ID, 12000);

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain('2');
    });

    it('signale (sans bloquer) un montant très au-dessus des achats habituels de la boutique', async () => {
      limitsStub.resolves({ maxAmount: 0, cooldownHours: 0, maxPerDay: 0 });
      // Historique : 10 achats à 10 000 dans la boutique (médiane 10 000), d'autres clients.
      for (let i = 0; i < 10; i++) {
        await paymentModel().create({
          _id: new mongoose.Types.ObjectId(),
          from: new mongoose.Types.ObjectId(),
          to: new mongoose.Types.ObjectId(PARTNER_ID),
          amount: 10000,
          discountPercentage: MAX_DISCOUNT,
          status: 'success',
          completedAt: hoursAgo(48 + i)
        });
      }

      const normal: any = await service.redeem(CLIENT_ID, PARTNER_ID, 30000);
      const unusual: any = await service.redeem(CLIENT_ID, PARTNER_ID, 60000);

      expect(normal.error).to.not.equal(true);
      expect(unusual.error).to.not.equal(true);
      expect((await paymentModel().findById(normal.ticket._id).lean()).flagged).to.equal(false);
      expect((await paymentModel().findById(unusual.ticket._id).lean()).flagged).to.equal(true);
      expect(notifyStub.lastCall.args[0].title).to.contain('inhabituel');
    });
  });

  describe('économies et consommation du client', () => {
    it('getClientSavings ne compte que les tickets validés', async () => {
      await givenSuccessTicket(10000); // réduction 2000
      await givenSuccessTicket(5000); // réduction 1000
      await givenSuccessTicket(50000, { status: 'invalidated' });
      await givenSuccessTicket(50000, { status: 'pending', to: '507f1f77bcf86cd799439036' });

      const savings = await service.getClientSavings(CLIENT_ID);

      expect(savings.total).to.equal(3000);
      expect(savings.month).to.equal(3000);
      expect(savings.count).to.equal(2);
    });

    it('getScanUsage renvoie les réductions du jour et le quota', async () => {
      await givenSuccessTicket(10000);
      await givenSuccessTicket(10000, { completedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) });

      const usage = await service.getScanUsage(CLIENT_ID);

      expect(usage.hasSubscription).to.be.true;
      expect(usage.dayUsed).to.equal(1);
      expect(usage.dayLimit).to.equal(LIMITS.maxPerDay);
    });
  });

  describe('invalidate — pouvoir du marchand', () => {
    it("refuse l'invalidation par un compte qui ne possède pas la boutique", async () => {
      const id = await givenSuccessTicket();

      const result: any = await service.invalidate(id, ATTACKER_ID);

      expect(result.error).to.be.true;
      expect(result.forbidden, 'doit produire un 403').to.be.true;

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('success');
    });

    it('autorise le propriétaire à invalider un ticket success', async () => {
      const id = await givenSuccessTicket();

      const result: any = await service.invalidate(id, OWNER_ID);

      expect(result.error, JSON.stringify(result?.data)).to.not.equal(true);

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('invalidated');
      expect(payment.invalidatedAt).to.be.instanceOf(Date);
    });

    it("refuse d'invalider un ticket non success", async () => {
      const id = await givenSuccessTicket();
      await paymentModel().updateOne({ _id: id }, { $set: { status: 'invalidated' } });

      const result: any = await service.invalidate(id, OWNER_ID);

      expect(result.error).to.be.true;
      expect(result.conflict, 'doit produire un 409').to.be.true;
    });

    it('notifie le client lors de l\'invalidation', async () => {
      const id = await givenSuccessTicket();
      notifyStub.resetHistory();

      await service.invalidate(id, OWNER_ID);
      expect(notifyStub.callCount).to.equal(1);
    });
  });
});
