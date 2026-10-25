import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TokenMiddleware } from '../api/middleware';
import referralRoute from '../api/routes/referral.route';
import { ClientSet } from '../modules/client/client.model';
import { SubscriptionSet } from '../modules/subscription/subscription.model';
import { SubscriptionService } from '../modules/subscription/subscription.service';
import { PlanSet } from '../modules/plan/plan.model';
import { PlatformConfigSet } from '../modules/platform-config/platform-config.model';
import { FreeMonthGrantSet } from '../modules/subscription/free-month.model';
import { FreeMonthService, FREE_MONTH_DAYS } from '../modules/subscription/free-month.service';
import { ReferralService, REFERRAL_VELOCITY_MAX } from '../modules/referral/referral.service';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { REFERRAL_CODE_PATTERN, renderReferralLanding } from '../helpers/referral-landing.view';
import { CODE_ALPHABET } from '../helpers/code-generator';
import { ClientService } from '../modules/client/client.service';
import { isPromoCodeFormat } from '../modules/promo-code/promo-code.service';

/**
 * Parrainage (Excel Parrainage n°2, 5, 6, 9, 11, 12) : validation au 1er abonnement payé, mois
 * offert réellement appliqué, une récompense par parrain, plafond du programme, anti-fraude.
 */
describe('Parrainage et mois offert', () => {
	let mongod: MongoMemoryServer;
	let pushes: sinon.SinonStub;

	const REFERRER = '507f1f77bcf86cd799439201';
	const PAID_PLAN = '507f1f77bcf86cd799439210';
	const FREE_PLAN = '507f1f77bcf86cd799439211';
	const DAY = 24 * 60 * 60 * 1000;
	const model = (Set: any) => (new Set() as any).defaultModel;
	const oid = (id: string) => new mongoose.Types.ObjectId(id);
	let seq = 0;

	const base = (extra: any = {}) => ({
		_id: new mongoose.Types.ObjectId(),
		email: `u${++seq}@yoyo.ci`,
		contact: `07000${String(seq).padStart(5, '0')}`,
		status: 'active',
		password: 'hash',
		firstname: 'Awa',
		lastname: 'Koné',
		...extra
	});

	/** Crée un filleul du parrain et le fait s'abonner au plan payant. */
	const referAndPay = async (extra: any = {}) => {
		const referred = await model(ClientSet).create(base({ referredBy: oid(REFERRER), ...extra }));
		await new SubscriptionService().createSubscription(String(referred._id), PAID_PLAN);
		return referred;
	};

	const referrer = () => model(ClientSet).findById(REFERRER).lean();
	const activeSub = (userId: string) => model(SubscriptionSet).findOne({ userId, status: 'active' }).lean();

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-referral' });
		await model(FreeMonthGrantSet).syncIndexes();
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [ClientSet, SubscriptionSet, PlanSet, PlatformConfigSet, FreeMonthGrantSet]) {
			await model(Set).deleteMany({});
		}
		const plan = { description: 'Plan', currency: 'XOF', durationDays: 30, features: ['x'], isActive: true };
		await model(PlanSet).create([
			{ _id: oid(PAID_PLAN), name: 'Essentiel', price: 2000, ...plan },
			{ _id: oid(FREE_PLAN), name: 'Découverte', price: 0, ...plan }
		]);
		await model(ClientSet).create(base({ _id: oid(REFERRER), referralCode: 'ABC234', signupDeviceId: 'device-parrain' }));
		pushes = sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
	});

	afterEach(() => sinon.restore());

	describe('Validation des filleuls', () => {
		it('un plan gratuit ne valide pas le filleul', async () => {
			const referred = await model(ClientSet).create(base({ referredBy: oid(REFERRER) }));
			await new SubscriptionService().createSubscription(String(referred._id), FREE_PLAN);
			expect((await referrer()).referredCount).to.equal(0);
		});

		it('un filleul ne compte qu’une fois, même avec deux paiements simultanés', async () => {
			const referred = await model(ClientSet).create(base({ referredBy: oid(REFERRER) }));
			const service = new ReferralService();
			await Promise.all([service.onPaidSubscription(String(referred._id)), service.onPaidSubscription(String(referred._id))]);
			expect((await referrer()).referredCount).to.equal(1);
		});

		it('même appareil que le parrain : refusé, jamais compté', async () => {
			const referred = await referAndPay({ signupDeviceId: 'device-parrain' });
			expect((await referrer()).referredCount).to.equal(0);
			expect((await model(ClientSet).findById(referred._id).lean()).referralRejected).to.equal('same-device');
		});
	});

	describe('Récompense', () => {
		it('3ᵉ filleul payé, parrain abonné : sa fin d’abonnement recule de 30 jours, renouvellement décalé', async () => {
			const end = new Date(Date.now() + 10 * DAY);
			await model(SubscriptionSet).create({
				_id: new mongoose.Types.ObjectId(), userId: oid(REFERRER), planId: oid(PAID_PLAN), startDate: new Date(), endDate: end,
				status: 'active', paymentStatus: 'paid', price: 2000, currency: 'XOF',
				pendingRenewal: { planId: oid(PAID_PLAN), startDate: end, endDate: new Date(end.getTime() + 30 * DAY) }
			});
			for (let i = 0; i < 3; i++) await referAndPay();

			const sub = await activeSub(REFERRER);
			expect(new Date(sub.endDate).getTime()).to.equal(end.getTime() + FREE_MONTH_DAYS * DAY);
			expect(new Date(sub.pendingRenewal.startDate).getTime()).to.equal(end.getTime() + FREE_MONTH_DAYS * DAY);
			expect((await referrer()).referralRewardId).to.exist;
			expect(pushes.lastCall.args[0].title).to.match(/mois offert/);
		});

		it('parrain sans abonnement : un abonnement de 30 jours est créé sur le plan offert', async () => {
			for (let i = 0; i < 3; i++) await referAndPay();
			const sub = await activeSub(REFERRER);
			expect(String(sub.planId)).to.equal(PAID_PLAN);
			expect(sub.price).to.equal(0);
			expect(sub.paymentMethod).to.equal('free-month');
		});

		it('une seule récompense par parrain : rien de plus au 6ᵉ filleul', async () => {
			for (let i = 0; i < 6; i++) await referAndPay();
			expect(await model(FreeMonthGrantSet).countDocuments({ user: oid(REFERRER) })).to.equal(1);
			expect((await referrer()).referredCount).to.equal(6);
		});

		it('mois offert : ne redéclenche jamais le parrainage du bénéficiaire', async () => {
			await model(ClientSet).updateOne({ _id: oid(REFERRER) }, { referredBy: new mongoose.Types.ObjectId() });
			await new FreeMonthService().grant(REFERRER, 'referral', REFERRER);
			expect((await referrer()).referralCredited).to.not.equal(true);
		});

		it('plafond du programme : deux parrains simultanés pour la dernière place, un seul gagne', async () => {
			await model(PlatformConfigSet).create({
				_id: new mongoose.Types.ObjectId(), status: 'active',
				referralProgram: { enabled: true, referralsPerReward: 1, rewardCap: 1 }
			});
			const other = await model(ClientSet).create(base({ referralCode: 'XYZ789' }));
			const a = await model(ClientSet).create(base({ referredBy: oid(REFERRER) }));
			const b = await model(ClientSet).create(base({ referredBy: other._id }));
			const service = new ReferralService();
			await Promise.all([service.onPaidSubscription(String(a._id)), service.onPaidSubscription(String(b._id))]);
			expect(await model(FreeMonthGrantSet).countDocuments({})).to.equal(1);
			const info = await service.info(String(other._id));
			const info2 = await service.info(REFERRER);
			expect([info.rewardStatus, info2.rewardStatus]).to.have.members(['applied', 'closed']);
			expect(info.placesLeft).to.equal(0);
		});
	});

	describe('Anti-fraude', () => {
		it(`plus de ${REFERRAL_VELOCITY_MAX} filleuls en 24 h : en revue, récompense en attente`, async () => {
			const service = new ReferralService();
			for (let i = 0; i <= REFERRAL_VELOCITY_MAX; i++) {
				await model(ClientSet).create(base({ referredBy: oid(REFERRER), status: 'pending' }));
			}
			await service.onRegistered(REFERRER);
			expect((await referrer()).referralReview).to.equal(true);

			for (let i = 0; i < 3; i++) await referAndPay();
			expect(await model(FreeMonthGrantSet).countDocuments({})).to.equal(0);
			expect((await service.info(REFERRER)).rewardStatus).to.equal('pending-review');

			expect(await service.approve(REFERRER)).to.equal('applied');
		});

		it('fraude confirmée : jours retirés, avertissement, suspension à la récidive', async () => {
			for (let i = 0; i < 3; i++) await referAndPay();
			const before = await activeSub(REFERRER);
			const service = new ReferralService();

			const first = await service.markFraud(REFERRER, 'faux comptes');
			expect(first).to.deep.equal({ revoked: true, suspended: false });
			const after = await model(SubscriptionSet).findById(before._id).lean();
			expect(after.status).to.equal('expired');
			expect((await model(FreeMonthGrantSet).findOne({}).lean()).status).to.equal('revoked');
			expect((await service.info(REFERRER)).rewardStatus).to.equal('revoked');

			const second = await service.markFraud(REFERRER, 'récidive');
			expect(second.suspended).to.equal(true);
			expect((await referrer()).status).to.equal('suspended');
		});
	});

	describe('Écran « Mes parrainages » et relances', () => {
		it('liste les filleuls sans e-mail ni téléphone', async () => {
			await referAndPay();
			await model(ClientSet).create(base({ referredBy: oid(REFERRER), firstname: 'Yao', lastname: 'Bamba' }));
			const info = await new ReferralService().info(REFERRER);
			expect(info).to.include({ code: 'ABC234', validated: 1, goal: 3, rewardStatus: 'none' });
			expect(info.referred.map((r: any) => r.status)).to.have.members(['validated', 'registered']);
			expect(info.referred.find((r: any) => r.status === 'registered').name).to.equal('Yao B.');
			expect(JSON.stringify(info.referred)).to.not.match(/@yoyo\.ci|07000/);
		});

		it('relance : une par semaine, deux au plus', async () => {
			await referAndPay();
			const service = new ReferralService();
			expect(await service.nudgeStalled()).to.equal(1);
			expect(await service.nudgeStalled()).to.equal(0); // moins d'une semaine
			await model(ClientSet).updateOne({ _id: oid(REFERRER) }, { referralLastNudgeAt: new Date(Date.now() - 8 * DAY) });
			expect(await service.nudgeStalled()).to.equal(1);
			await model(ClientSet).updateOne({ _id: oid(REFERRER) }, { referralLastNudgeAt: new Date(Date.now() - 8 * DAY) });
			expect(await service.nudgeStalled()).to.equal(0); // deux relances déjà envoyées
		});
	});

	describe('Lien et routes', () => {
		it('page /r/CODE : code affiché et transmis au Play Store', () => {
			expect(REFERRAL_CODE_PATTERN.test('ABC234')).to.equal(true);
			expect(REFERRAL_CODE_PATTERN.test('<script>')).to.equal(false);
			const html = renderReferralLanding({ code: 'ABC234', androidHref: 'https://play/x?referrer=code%3DABC234', iosUrl: '', logoUrl: '' });
			expect(html).to.contain('ABC234').and.to.contain('referrer=code%3DABC234').and.not.contain('App Store');
		});

		it('nouveaux codes au format YO-XXXX, anciens codes de 6 caractères toujours reconnus', async () => {
			const service = new ClientService();
			const code = await service.generateUniqueReferralCode();
			expect(code).to.match(new RegExp(`^YO-[${CODE_ALPHABET}]{4}$`));
			expect(REFERRAL_CODE_PATTERN.test(code)).to.equal(true);
			expect(isPromoCodeFormat(code)).to.equal(false);
			await model(ClientSet).create(base({ referralCode: code }));
			expect(await service.resolveReferrer(code.toLowerCase())).to.not.equal(null);
			const legacy = await service.resolveReferrer('abc234');
			expect(String(legacy._id)).to.equal(REFERRER);
		});

		it('routes du parrainage : administrateur requis', () => {
			const routes: any[] = [];
			referralRoute({ route: (definition: any) => routes.push(definition) }, {}, () => {});
			expect(routes).to.have.length(4);
			routes.forEach(r => expect(r.preHandler).to.equal(TokenMiddleware.verifyAdmin));
		});
	});
});
