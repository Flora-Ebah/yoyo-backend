import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PaymentService } from '../modules/payment/payment.service';
import { PaymentSet } from '../modules/payment/payment.model';
import { PartnerSet } from '../modules/partner';
import { SubscriptionService } from '../modules/subscription/subscription.service';
import { PushNotificationService } from '../modules/push-notification';

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
  });

  afterEach(() => {
    sinon.restore();
  });

  /** Insère un ticket success et renvoie son identifiant. */
  const givenSuccessTicket = async (amount = 10000): Promise<string> => {
    const id = new mongoose.Types.ObjectId();
    await paymentModel().create({
      _id: id,
      from: new mongoose.Types.ObjectId(CLIENT_ID),
      to: new mongoose.Types.ObjectId(PARTNER_ID),
      amount,
      discountPercentage: MAX_DISCOUNT,
      status: 'success',
      completedAt: new Date(),
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
