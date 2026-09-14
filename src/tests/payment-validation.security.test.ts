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
 * Validation d'une demande de réduction par le commerçant.
 *
 * Avant correctif, `PUT /payments` et `POST /payments/validate/:partnerId` ne portaient que
 * `TokenMiddleware.verify` — qui prouve seulement qu'un compte est connecté, jamais qu'il possède
 * la boutique concernée. **N'importe quel compte connaissant l'identifiant d'une demande pouvait
 * la marquer `success`**, donc s'accorder une réduction ou valider les demandes d'un concurrent.
 * Le montant de la facture, lui, n'était soumis à aucun contrôle, et sur `validatePayment` il
 * était validé dans le contrôleur puis jamais écrit dans le document.
 *
 * Ces tests verrouillent les quatre garanties : propriété, montant, non-rejouabilité, atomicité.
 */
describe('[Sécurité] Validation des demandes de réduction', () => {
  let mongod: MongoMemoryServer;
  let service: PaymentService;
  let notifyStub: sinon.SinonStub;

  /** Le commerçant, propriétaire de la boutique. */
  const OWNER_ID = '507f1f77bcf86cd799439031';
  /** Le client qui scanne. */
  const CLIENT_ID = '507f1f77bcf86cd799439032';
  /** Un autre compte connecté, ni client ni propriétaire. */
  const ATTACKER_ID = '507f1f77bcf86cd799439033';
  const PARTNER_ID = '507f1f77bcf86cd799439034';

  const MIN_ORDER = 5000;

  const paymentModel = () => (new PaymentSet() as any).defaultModel;
  const partnerModel = () => (new PartnerSet() as any).defaultModel;

  /** Insère une demande en attente et renvoie son identifiant. */
  const givenPendingPayment = async (): Promise<string> => {
    const id = new mongoose.Types.ObjectId();
    await paymentModel().create({
      _id: id,
      from: new mongoose.Types.ObjectId(CLIENT_ID),
      to: new mongoose.Types.ObjectId(PARTNER_ID),
      status: 'pending',
      discountPercentage: 20
    });
    return String(id);
  };

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
      maxDiscount: 30,
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
      userId: { _id: CLIENT_ID, firstname: 'Awa', lastname: 'Diallo' },
      planId: { discountPercentage: 20 }
    } as any);

    notifyStub = sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Contrôle de propriété', () => {
    it("refuse la validation par un compte qui ne possède pas la boutique", async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: 10000 }, ATTACKER_ID);

      expect(result.error).to.be.true;
      expect(result.forbidden, 'doit produire un 403, pas un 400').to.be.true;

      // Et surtout : rien n'a changé en base.
      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('pending');
      expect(payment.amount).to.be.undefined;
    });

    it("refuse la validation par le client lui-même", async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: 10000 }, CLIENT_ID);

      expect(result.forbidden, "le bénéficiaire ne valide pas sa propre réduction").to.be.true;
    });

    it("refuse la validation sans appelant identifié", async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: 10000 });

      expect(result.forbidden).to.be.true;
    });

    it('autorise le propriétaire de la boutique', async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: 10000 }, OWNER_ID);

      expect(result.error, JSON.stringify(result.data)).to.not.equal(true);

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('success');
      expect(payment.amount).to.equal(10000);
      // `completedAt` n'était posé que par l'autre route de validation.
      expect(payment.completedAt, 'completedAt doit être renseigné').to.be.instanceOf(Date);
    });
  });

  describe('Montant de la facture', () => {
    it('refuse un montant nul, négatif ou absent', async () => {
      for (const amount of [0, -100, undefined, null, 'abc']) {
        // Une seule demande en attente par couple (client, partenaire) : l'index unique partiel
        // refuserait la seconde insertion. On repart donc d'une base propre à chaque itération.
        await paymentModel().deleteMany({});

        const id = await givenPendingPayment();
        const result: any = await service.update(id, { status: 'success', amount } as any, OWNER_ID);

        expect(result.error, `le montant ${String(amount)} doit être refusé`).to.be.true;
        expect(result.forbidden).to.not.be.true;

        const payment: any = await paymentModel().findById(id).lean();
        expect(payment.status).to.equal('pending');
      }
    });

    it('refuse un montant inférieur au minimum de commande de la boutique', async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: MIN_ORDER - 1 }, OWNER_ID);

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain(String(MIN_ORDER));
    });

    it('accepte un montant égal au minimum de commande', async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(id, { status: 'success', amount: MIN_ORDER }, OWNER_ID);

      expect(result.error).to.not.equal(true);
      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.amount).to.equal(MIN_ORDER);
    });

    it("n'exige pas de montant pour un rejet", async () => {
      const id = await givenPendingPayment();

      const result: any = await service.update(
        id,
        { status: 'rejected', deniedReason: 'Boutique fermée' },
        OWNER_ID
      );

      expect(result.error).to.not.equal(true);

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('rejected');
      // Ces deux champs étaient affectés APRÈS l'appel au DAO et n'atteignaient jamais la base ;
      // une chaîne anglaise codée en dur écrasait de plus le motif fourni.
      expect(payment.deniedAt).to.be.instanceOf(Date);
      expect(payment.deniedReason).to.equal('Boutique fermée');
    });
  });

  describe('Non-rejouabilité', () => {
    it('refuse de traiter deux fois la même demande', async () => {
      const id = await givenPendingPayment();

      const first: any = await service.update(id, { status: 'success', amount: 10000 }, OWNER_ID);
      expect(first.error).to.not.equal(true);

      const second: any = await service.update(id, { status: 'success', amount: 999999 }, OWNER_ID);

      expect(second.error).to.be.true;
      expect(second.conflict, 'doit produire un 409').to.be.true;

      // Le montant initial n'a pas été réécrit.
      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.amount).to.equal(10000);
    });

    it('ne renotifie pas le client lors du rejeu', async () => {
      const id = await givenPendingPayment();

      await service.update(id, { status: 'success', amount: 10000 }, OWNER_ID);
      await service.update(id, { status: 'success', amount: 10000 }, OWNER_ID);
      await service.update(id, { status: 'success', amount: 10000 }, OWNER_ID);

      expect(notifyStub.callCount, 'une seule notification pour un seul traitement').to.equal(1);
    });

    it('deux validations simultanées ne valident pas deux fois', async () => {
      const id = await givenPendingPayment();

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.update(id, { status: 'success', amount: 10000 }, OWNER_ID))
      );

      const succeeded = results.filter((r: any) => r.error !== true);
      expect(succeeded).to.have.length(1);
      expect(notifyStub.callCount).to.equal(1);
    });
  });

  describe('validatePayment (route alternative)', () => {
    it("refuse un appelant qui ne possède pas la boutique", async () => {
      const id = await givenPendingPayment();

      const result: any = await service.validatePayment(PARTNER_ID, 10000, ATTACKER_ID);

      expect(result.error).to.be.true;
      expect(result.forbidden).to.be.true;

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('pending');
    });

    it('écrit enfin le montant dans le document', async () => {
      const id = await givenPendingPayment();

      const result: any = await service.validatePayment(PARTNER_ID, 12000, OWNER_ID);
      expect(result.error).to.not.equal(true);

      const payment: any = await paymentModel().findById(id).lean();
      expect(payment.status).to.equal('success');
      // Le montant était validé dans le contrôleur puis perdu : jamais écrit.
      expect(payment.amount).to.equal(12000);
      expect(payment.completedAt).to.be.instanceOf(Date);
    });

    it('applique le minimum de commande', async () => {
      await givenPendingPayment();

      const result: any = await service.validatePayment(PARTNER_ID, MIN_ORDER - 1, OWNER_ID);

      expect(result.error).to.be.true;
      expect(String(result.data)).to.contain(String(MIN_ORDER));
    });

    it('deux appels simultanés ne valident pas la même demande deux fois', async () => {
      await givenPendingPayment();
      await paymentModel().create({
        _id: new mongoose.Types.ObjectId(),
        from: new mongoose.Types.ObjectId(ATTACKER_ID),
        to: new mongoose.Types.ObjectId(PARTNER_ID),
        status: 'pending',
        discountPercentage: 10
      });

      const results = await Promise.all([
        service.validatePayment(PARTNER_ID, 10000, OWNER_ID),
        service.validatePayment(PARTNER_ID, 10000, OWNER_ID)
      ]);

      // Deux demandes en attente, deux validations : chacune doit en prendre une DIFFÉRENTE.
      // Le code précédent lisait la dernière en attente avant de l'écrire, donc les deux appels
      // résolvaient la même ligne.
      const validated = await paymentModel().countDocuments({ to: PARTNER_ID, status: 'success' });
      expect(results.filter((r: any) => r.error !== true)).to.have.length(2);
      expect(validated).to.equal(2);
    });
  });
});
