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
 * Non-régression sur la simultanéité des demandes de réduction.
 *
 * Avant correctif, `PaymentService.create` lisait la demande `pending` existante, la supprimait,
 * puis en écrivait une nouvelle. Deux scans rapprochés lisaient tous les deux « aucune demande en
 * cours » et en créaient donc deux. Ces tests verrouillent les deux garanties du correctif :
 * l'unicité par couple (client, partenaire) et l'idempotence de l'appel.
 *
 * Ils tournent sur un MongoDB en mémoire, parce que c'est précisément le comportement atomique du
 * moteur — `findOneAndUpdate` en upsert et l'index unique partiel — qui est testé ici. Des stubs
 * ne prouveraient rien.
 */
describe('Demandes de réduction concurrentes', () => {
  let mongod: MongoMemoryServer;
  let service: PaymentService;

  const CLIENT_ID = '507f1f77bcf86cd799439021';
  const PARTNER_ID = '507f1f77bcf86cd799439022';
  const OTHER_CLIENT_ID = '507f1f77bcf86cd799439023';

  const paymentModel = () => (new PaymentSet() as any).defaultModel;
  const partnerModel = () => (new PartnerSet() as any).defaultModel;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test' });

    // Construit les index déclarés dans `payment.model.ts`, dont `uniq_pending_from_to`.
    await paymentModel().syncIndexes();

    await partnerModel().create({
      _id: new mongoose.Types.ObjectId(PARTNER_ID),
      slug: 'boutique-test',
      name: 'Boutique de test',
      status: 'active',
      user: new mongoose.Types.ObjectId(CLIENT_ID),
      maxDiscount: 30
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await paymentModel().deleteMany({});

    service = new PaymentService();

    // Abonnement actif avec 20 % de réduction : hors sujet ici, on le neutralise.
    sinon.stub(SubscriptionService.prototype, 'getCurrentSubscriptionWithPlanDetails').resolves({
      userId: { _id: CLIENT_ID, firstname: 'Awa', lastname: 'Diallo' },
      planId: { discountPercentage: 20 }
    } as any);

    // La notification part désormais dans la file d'événements ; on la neutralise pour que le test
    // ne dépende ni de Socket.IO ni du gestionnaire de notifications.
    sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("l'index unique partiel uniq_pending_from_to est en place", async () => {
    const indexes = await paymentModel().collection.indexes();
    const unique = indexes.find((index: any) => index.name === 'uniq_pending_from_to');

    expect(unique, 'index uniq_pending_from_to absent').to.exist;
    expect(unique.unique).to.be.true;
    expect(unique.partialFilterExpression).to.deep.equal({ status: 'pending' });
  });

  it('50 appels simultanés du même client ne créent qu’une seule demande', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => service.create({ from: CLIENT_ID, to: PARTNER_ID } as any))
    );

    const errors = results.filter((r: any) => r.error);
    expect(errors, `des appels ont échoué : ${JSON.stringify(errors[0]?.message)}`).to.have.length(0);

    // Une seule création, 49 réutilisations.
    const created = results.filter((r: any) => r.created);
    expect(created).to.have.length(1);

    // Et surtout : une seule ligne en base.
    const pending = await paymentModel().countDocuments({ from: CLIENT_ID, to: PARTNER_ID, status: 'pending' });
    expect(pending).to.equal(1);

    // Tous les appels renvoient la même demande, pour que l'app affiche un état cohérent.
    const ids = new Set(results.map((r: any) => String(r.demande._id)));
    expect(ids.size).to.equal(1);
  });

  it('la réduction est figée à la création et n’est pas révisée par un rescan', async () => {
    const first: any = await service.create({ from: CLIENT_ID, to: PARTNER_ID } as any);
    expect(first.demande.discountPercentage).to.equal(20);

    // Le plan du client change entre les deux scans.
    sinon.restore();
    sinon.stub(SubscriptionService.prototype, 'getCurrentSubscriptionWithPlanDetails').resolves({
      userId: { _id: CLIENT_ID, firstname: 'Awa', lastname: 'Diallo' },
      planId: { discountPercentage: 50 }
    } as any);
    sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);

    const second: any = await service.create({ from: CLIENT_ID, to: PARTNER_ID } as any);

    expect(second.created).to.be.false;
    // La demande déjà soumise au partenaire ne doit pas changer de valeur sous ses pieds.
    expect(second.demande.discountPercentage).to.equal(20);
  });

  it('deux clients différents chez le même partenaire obtiennent chacun leur demande', async () => {
    const [a, b] = await Promise.all([
      service.create({ from: CLIENT_ID, to: PARTNER_ID } as any),
      service.create({ from: OTHER_CLIENT_ID, to: PARTNER_ID } as any)
    ]);

    expect((a as any).created).to.be.true;
    expect((b as any).created).to.be.true;

    const pending = await paymentModel().countDocuments({ to: PARTNER_ID, status: 'pending' });
    expect(pending).to.equal(2);
  });

  it('une demande traitée ne bloque pas une nouvelle demande du même client', async () => {
    const first: any = await service.create({ from: CLIENT_ID, to: PARTNER_ID } as any);

    // Le partenaire valide la demande : elle quitte l'état « pending ».
    await paymentModel().updateOne({ _id: first.demande._id }, { $set: { status: 'success' } });

    const second: any = await service.create({ from: CLIENT_ID, to: PARTNER_ID } as any);

    // L'index unique étant PARTIEL (status: 'pending'), le client peut revenir.
    expect(second.created).to.be.true;
    expect(String(second.demande._id)).to.not.equal(String(first.demande._id));
  });

  it('refuse une demande vers un partenaire inexistant sans rien écrire', async () => {
    const result: any = await service.create({
      from: CLIENT_ID,
      to: '507f1f77bcf86cd799439099'
    } as any);

    expect(result.error).to.be.true;
    // L'ancien code écrivait la demande AVANT de vérifier le partenaire.
    const count = await paymentModel().countDocuments({});
    expect(count).to.equal(0);
  });
});
