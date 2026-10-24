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
import { CategorySet } from '../modules/category/category.model';

/**
 * Flux 100% client de validation des rÃ©ductions.
 *
 * La validation marchand (accept/reject, `PUT /payments`, `POST /payments/validate/:partnerId`) a
 * Ã©tÃ© supprimÃ©e. Le client valide dÃ©sormais lui-mÃªme sa rÃ©duction en un seul appel (`redeem`), et
 * le marchand ne garde que le pouvoir d'invalider a posteriori un ticket (`invalidate`).
 *
 * Ces tests verrouillent les garanties clÃ©s :
 *  - le pourcentage appliquÃ© est celui de la BOUTIQUE (`maxDiscount`), figÃ© cÃ´tÃ© serveur ;
 *  - le net et la rÃ©duction sont recalculÃ©s serveur, jamais acceptÃ©s du client ;
 *  - le montant est bornÃ© (> 0 et â‰¥ minOrder) ;
 *  - l'appel est idempotent (anti double-soumission) ;
 *  - le montant est plafonnÃ©, et le client limitÃ© par boutique (dÃ©lai) et par jour (quota) ;
 *  - un montant inhabituel pour la boutique est signalÃ© au marchand sans Ãªtre bloquÃ© ;
 *  - seul le propriÃ©taire de la boutique peut invalider, et seulement un ticket `success`.
 */
describe('[SÃ©curitÃ©] Flux client de validation des rÃ©ductions', () => {
  let mongod: MongoMemoryServer;
  let service: PaymentService;
  let notifyStub: sinon.SinonStub;

  /** Le commerÃ§ant, propriÃ©taire de la boutique. */
  const OWNER_ID = '507f1f77bcf86cd799439031';
  /** Le client qui scanne et valide. */
  const CLIENT_ID = '507f1f77bcf86cd799439032';
  /** Un autre compte connectÃ©, ni client ni propriÃ©taire. */
  const ATTACKER_ID = '507f1f77bcf86cd799439033';
  const PARTNER_ID = '507f1f77bcf86cd799439034';

  const MIN_ORDER = 5000;
  const MAX_DISCOUNT = 20; // pourcentage de la boutique
  /** Garde-fous par dÃ©faut des tests (`redeemLimits`), surchargÃ©s au cas par cas. */
  const LIMITS = { maxAmount: 500000, cooldownHours: 4, maxPerDay: 5, requireScanToken: false };
  let limitsStub: sinon.SinonStub;

  const paymentModel = () => (new PaymentSet() as any).defaultModel;
  const partnerModel = () => (new PartnerSet() as any).defaultModel;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-validation' });
    await paymentModel().syncIndexes();

    // Catégorie éligible à la commande minimale (remarques testeurs Pro n°5).
    const categoryId = new mongoose.Types.ObjectId();
    await (new CategorySet() as any).defaultModel.create({ _id: categoryId, name: 'Supérettes & Alimentation', status: 'active' });

    await partnerModel().create({
      _id: new mongoose.Types.ObjectId(PARTNER_ID),
      slug: 'boutique-validation',
      name: 'Boutique de validation',
      status: 'active',
      user: new mongoose.Types.ObjectId(OWNER_ID),
      maxDiscount: MAX_DISCOUNT,
      minOrder: MIN_ORDER,
      categories: [categoryId]
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

  /** InsÃ¨re un ticket success et renvoie son identifiant. */
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

  describe('redeem â€” calcul et sÃ©curitÃ©', () => {
    it('applique le pourcentage de la BOUTIQUE et calcule net + rÃ©duction cÃ´tÃ© serveur', async () => {
      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
      // 20% de 10000 => net 8000, rÃ©duction 2000.
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

    it("ne fait JAMAIS confiance Ã  un net ou une rÃ©duction fournis par le client", async () => {
      // Le client tente d'injecter un net/rÃ©duction : seuls `to` et `amount` sont lus.
      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });

      expect(result.ticket.net).to.equal(8000);
      expect(result.ticket.reduction).to.equal(2000);
    });

    it('refuse un montant nul, nÃ©gatif ou non numÃ©rique', async () => {
      for (const amount of [0, -100, undefined, null, 'abc']) {
        await paymentModel().deleteMany({});
        const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: amount as any });

        expect(result.error, `le montant ${String(amount)} doit Ãªtre refusÃ©`).to.be.true;
        const count = await paymentModel().countDocuments({});
        expect(count).to.equal(0);
      }
    });

    it('refuse un montant infÃ©rieur au minimum de commande', async () => {
      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: MIN_ORDER - 1 });

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain(String(MIN_ORDER));
    });

    it('refuse un client sans abonnement actif', async () => {
      sinon.restore();
      sinon.stub(SubscriptionService.prototype, 'getCurrentSubscriptionWithPlanDetails').resolves(null as any);
      sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);

      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });
      expect(result.error).to.be.true;
    });

    it('refuse une boutique inexistante sans rien Ã©crire', async () => {
      const result: any = await service.redeem(CLIENT_ID, { to: '507f1f77bcf86cd799439099', amount: 10000 });

      expect(result.error).to.be.true;
      const count = await paymentModel().countDocuments({});
      expect(count).to.equal(0);
    });

    it('notifie le marchand aprÃ¨s un ticket crÃ©Ã©', async () => {
      await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });
      expect(notifyStub.callCount).to.equal(1);
    });

    it('idempotence : une double-soumission identique renvoie le mÃªme ticket sans en crÃ©er un second', async () => {
      const first: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });
      const second: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });

      expect(first.error).to.not.equal(true);
      expect(second.error).to.not.equal(true);
      expect(String(second.ticket._id)).to.equal(String(first.ticket._id));

      const count = await paymentModel().countDocuments({ from: CLIENT_ID, to: PARTNER_ID, status: 'success' });
      expect(count, 'un seul ticket malgrÃ© la double soumission').to.equal(1);
      // Une seule notification marchand.
      expect(notifyStub.callCount).to.equal(1);
    });
  });

  describe('redeem â€” garde-fous du montant saisi par le client', () => {
    const OTHER_PARTNER_ID = '507f1f77bcf86cd799439035';
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

    it('refuse un montant au-dessus du plafond de la plateforme', async () => {
      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: LIMITS.maxAmount + 1 });

      expect(result.error).to.be.true;
      expect(await paymentModel().countDocuments({})).to.equal(0);
    });

    it("ignore l'ancien plafond propre à la boutique (maxOrder) : seul celui de la plateforme compte", async () => {
      await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { maxOrder: 20000 } });
      try {
        const accepted: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 30000 });
        expect(accepted.error, JSON.stringify(accepted.data)).to.not.equal(true);
      } finally {
        await partnerModel().updateOne({ _id: PARTNER_ID }, { $unset: { maxOrder: 1 } });
      }
    });

    it("ignore la commande minimale d'une boutique hors catégories éligibles", async () => {
      const original: any = await partnerModel().findById(PARTNER_ID).lean();
      await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { categories: [] } });
      try {
        const accepted: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: MIN_ORDER - 1 });
        expect(accepted.error, JSON.stringify(accepted.data)).to.not.equal(true);
      } finally {
        await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { categories: original.categories } });
      }
    });

    it('plafond Ã  0 = dÃ©sactivÃ©', async () => {
      limitsStub.resolves({ ...LIMITS, maxAmount: 0 });
      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 5000000 });

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('refuse une seconde rÃ©duction dans la mÃªme boutique avant la fin du dÃ©lai', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(1) });

      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 12000 });

      expect(result.error).to.be.true;
      expect(await paymentModel().countDocuments({ status: 'success' })).to.equal(1);
    });

    it('accepte une nouvelle rÃ©duction dans la mÃªme boutique une fois le dÃ©lai Ã©coulÃ©', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(LIMITS.cooldownHours + 1) });

      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 12000 });

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('un ticket invalidÃ© ne dÃ©clenche pas le dÃ©lai', async () => {
      await givenSuccessTicket(10000, { completedAt: hoursAgo(1), status: 'invalidated' });

      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 12000 });

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
    });

    it('la double-soumission reste idempotente malgrÃ© le dÃ©lai par boutique', async () => {
      const first: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });
      const replay: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 10000 });

      expect(replay.error, JSON.stringify(replay.data)).to.not.equal(true);
      expect(String(replay.ticket._id)).to.equal(String(first.ticket._id));
    });

    it('refuse au-delÃ  du quota journalier, toutes boutiques confondues', async () => {
      limitsStub.resolves({ ...LIMITS, maxPerDay: 2, cooldownHours: 0 });
      const now = new Date();
      // Deux tickets aujourd'hui dans une autre boutique.
      await givenSuccessTicket(10000, { to: OTHER_PARTNER_ID, completedAt: now });
      await givenSuccessTicket(11000, { to: OTHER_PARTNER_ID, completedAt: now });

      const result: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 12000 });

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain('2');
    });

    it('signale (sans bloquer) un montant trÃ¨s au-dessus des achats habituels de la boutique', async () => {
      limitsStub.resolves({ maxAmount: 0, cooldownHours: 0, maxPerDay: 0, requireScanToken: false });
      // Historique : 10 achats Ã  10 000 dans la boutique (mÃ©diane 10 000), d'autres clients.
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

      const normal: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 30000 });
      const unusual: any = await service.redeem(CLIENT_ID, { to: PARTNER_ID, amount: 60000 });

      expect(normal.error).to.not.equal(true);
      expect(unusual.error).to.not.equal(true);
      expect((await paymentModel().findById(normal.ticket._id).lean()).flagged).to.equal(false);
      expect((await paymentModel().findById(unusual.ticket._id).lean()).flagged).to.equal(true);
      expect(notifyStub.lastCall.args[0].title).to.contain('inhabituel');
    });
  });

  describe('Ã©conomies et consommation du client', () => {
    it('getClientSavings ne compte que les tickets validÃ©s', async () => {
      await givenSuccessTicket(10000); // rÃ©duction 2000
      await givenSuccessTicket(5000); // rÃ©duction 1000
      await givenSuccessTicket(50000, { status: 'invalidated' });
      await givenSuccessTicket(50000, { status: 'pending', to: '507f1f77bcf86cd799439036' });

      const savings = await service.getClientSavings(CLIENT_ID);

      expect(savings.total).to.equal(3000);
      expect(savings.month).to.equal(3000);
      expect(savings.count).to.equal(2);
    });

    it('getScanUsage renvoie les rÃ©ductions du jour et le quota', async () => {
      await givenSuccessTicket(10000);
      await givenSuccessTicket(10000, { completedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) });

      const usage = await service.getScanUsage(CLIENT_ID);

      expect(usage.hasSubscription).to.be.true;
      expect(usage.dayUsed).to.equal(1);
      expect(usage.dayLimit).to.equal(LIMITS.maxPerDay);
    });
  });

  describe('invalidate â€” pouvoir du marchand', () => {
    it("refuse l'invalidation par un compte qui ne possÃ¨de pas la boutique", async () => {
      const id = await givenSuccessTicket();

      const result: any = await service.invalidate(id, ATTACKER_ID);

      expect(result.error).to.be.true;
      expect(result.forbidden, 'doit produire un 403').to.be.true;

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('success');
    });

    it('autorise le propriÃ©taire Ã  invalider un ticket success', async () => {
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

