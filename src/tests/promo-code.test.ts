import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TokenMiddleware } from '../api/middleware';
import promoCodeRoute from '../api/routes/promo-code.route';
import { ClientSet } from '../modules/client/client.model';
import { SubscriptionSet } from '../modules/subscription/subscription.model';
import { PlanSet } from '../modules/plan/plan.model';
import { PlatformConfigSet } from '../modules/platform-config/platform-config.model';
import { FreeMonthGrantSet } from '../modules/subscription/free-month.model';
import { CompanySet } from '../modules/promo-code/company.model';
import { PromoBatchSet, PromoCodeSet, PromoRedemptionSet } from '../modules/promo-code/promo-code.model';
import {
	PromoCodeError,
	PromoCodeService,
	PROMO_MAX_FAILURES,
	isPromoCodeFormat
} from '../modules/promo-code/promo-code.service';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { CODE_ALPHABET, phoneKey } from '../helpers/code-generator';

/**
 * Codes & promotions (Excel Codes n°3, 4, 10, 13) : codes cadeaux et lots YOYO Business, activés
 * en jours d'abonnement offerts, avec code nominatif, usage unique et anti-devinette.
 */
describe('Codes cadeaux et YOYO Business', () => {
	let mongod: MongoMemoryServer;
	const service = new PromoCodeService();

	const PLAN = '507f1f77bcf86cd799439310';
	const PREMIUM = '507f1f77bcf86cd799439311';
	const DAY = 24 * 60 * 60 * 1000;
	const model = (Set: any) => (new Set() as any).defaultModel;
	const oid = (id: string) => new mongoose.Types.ObjectId(id);
	let seq = 0;

	const newClient = async (extra: any = {}) =>
		model(ClientSet).create({
			_id: new mongoose.Types.ObjectId(),
			email: `p${++seq}@yoyo.ci`,
			contact: `07100${String(seq).padStart(5, '0')}`,
			status: 'active',
			password: 'hash',
			firstname: 'Awa',
			lastname: 'Koné',
			...extra
		});

	/** Crée un lot et renvoie ses codes. */
	const batch = async (input: any = {}) => {
		const result: any = await service.createBatch({ type: 'gift', label: 'Staff', count: 1, ...input });
		expect(result.error).to.equal(undefined);
		return model(PromoCodeSet).find({ batch: result.batch._id }).sort({ createdAt: 1 }).lean();
	};

	const activeSub = (userId: any) => model(SubscriptionSet).findOne({ userId, status: 'active' }).lean();

	const rejects = async (promise: Promise<any>, reason: string) => {
		try {
			await promise;
		} catch (error) {
			expect(error).to.be.instanceOf(PromoCodeError);
			expect((error as PromoCodeError).reason).to.equal(reason);
			return;
		}
		expect.fail(`refus « ${reason} » attendu`);
	};

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-promo' });
		for (const Set of [FreeMonthGrantSet, PromoCodeSet, PromoRedemptionSet]) await model(Set).syncIndexes();
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [ClientSet, SubscriptionSet, PlanSet, PlatformConfigSet, FreeMonthGrantSet, CompanySet, PromoBatchSet, PromoCodeSet, PromoRedemptionSet]) {
			await model(Set).deleteMany({});
		}
		const plan = { description: 'Plan', currency: 'XOF', durationDays: 30, features: ['x'], isActive: true };
		await model(PlanSet).create([
			{ _id: oid(PLAN), name: 'Essentiel', price: 2000, ...plan },
			{ _id: oid(PREMIUM), name: 'Premium', price: 5000, ...plan }
		]);
		sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
	});

	afterEach(() => sinon.restore());

	describe('Format', () => {
		it('codes GIFT- / BIZ- sur 4 caractères sans caractères ambigus', async () => {
			const gifts = await batch({ count: 20 });
			const company = await service.createCompany({ name: 'Orange CI' });
			const biz = await batch({ type: 'business', companyId: String(company._id), count: 5 });
			gifts.forEach((c: any) => expect(c.code).to.match(new RegExp(`^GIFT-[${CODE_ALPHABET}]{4}$`)));
			biz.forEach((c: any) => expect(c.code).to.match(new RegExp(`^BIZ-[${CODE_ALPHABET}]{4}$`)));
			expect(new Set(gifts.map((c: any) => c.code)).size).to.equal(20);
			expect(isPromoCodeFormat(' gift-abc234 ')).to.equal(true);
			expect(isPromoCodeFormat('ABC234')).to.equal(false);
			expect(phoneKey('+225 07 08 09 10 11')).to.equal(phoneKey('0708091011'));
		});

		it('lot Business : entreprise obligatoire', async () => {
			const result: any = await service.createBatch({ type: 'business', label: 'Lot', count: 2 });
			expect(result.error).to.match(/entreprise/i);
		});
	});

	describe('Activation', () => {
		it('sans abonnement : abonnement créé sur le plan et la durée du lot', async () => {
			const user = await newClient();
			const [code] = await batch({ planId: PREMIUM, days: 60 });
			const result = await service.redeem(String(user._id), code.code.toLowerCase());
			expect(result).to.include({ type: 'gift', days: 60, mode: 'created' });
			const sub = await activeSub(user._id);
			expect(String(sub.planId)).to.equal(PREMIUM);
			expect(sub.price).to.equal(0);
			expect(Math.round((new Date(sub.endDate).getTime() - Date.now()) / DAY)).to.equal(60);
			const used = await model(PromoCodeSet).findById(code._id).lean();
			expect(used).to.include({ uses: 1, status: 'used' });
		});

		it('avec abonnement actif : prolongé de 30 jours', async () => {
			const user = await newClient();
			const end = new Date(Date.now() + 10 * DAY);
			await model(SubscriptionSet).create({
				_id: new mongoose.Types.ObjectId(),
				userId: user._id,
				planId: oid(PLAN),
				startDate: new Date(),
				endDate: end,
				status: 'active',
				price: 2000,
				currency: 'XOF'
			});
			const [code] = await batch();
			const result = await service.redeem(String(user._id), code.code);
			expect(result.mode).to.equal('extended');
			const sub = await activeSub(user._id);
			expect(new Date(sub.endDate).getTime() - end.getTime()).to.equal(30 * DAY);
		});

		it('code nominatif : réservé au numéro importé', async () => {
			const owner = await newClient({ contact: '0708091011' });
			const other = await newClient();
			const [code] = await batch({ rows: [{ name: 'Awa', phone: '+225 07 08 09 10 11' }] });
			await rejects(service.redeem(String(other._id), code.code), 'code-invalid');
			const result = await service.redeem(String(owner._id), code.code);
			expect(result.type).to.equal('gift');
		});

		it('code expiré, désactivé ou déjà utilisé : refusé', async () => {
			const [a, b, c] = await batch({ count: 3 });
			await model(PromoCodeSet).updateOne({ _id: a._id }, { expiresAt: new Date(Date.now() - DAY) });
			await service.setCodeStatus(String(b._id), 'disabled');
			const first = await newClient();
			await service.redeem(String(first._id), c.code);
			const user = await newClient();
			await rejects(service.redeem(String(user._id), a.code), 'code-expired');
			await rejects(service.redeem(String(user._id), b.code), 'code-invalid');
			await rejects(service.redeem(String(user._id), c.code), 'code-used');
			await rejects(service.redeem(String(user._id), 'GIFT-ZZZZ'), 'code-invalid');
		});

		it('deux activations simultanées du même code : une seule réussit', async () => {
			const [code] = await batch();
			const users = await Promise.all([newClient(), newClient(), newClient()]);
			const results = await Promise.allSettled(users.map((u: any) => service.redeem(String(u._id), code.code)));
			expect(results.filter((r) => r.status === 'fulfilled')).to.have.length(1);
			expect(await model(FreeMonthGrantSet).countDocuments({})).to.equal(1);
			expect(await model(PromoRedemptionSet).countDocuments({})).to.equal(1);
		});

		it('un seul code par lot et par compte', async () => {
			const user = await newClient();
			const [a, b] = await batch({ count: 2 });
			await service.redeem(String(user._id), a.code);
			await rejects(service.redeem(String(user._id), b.code), 'already-redeemed');
			const untouched = await model(PromoCodeSet).findById(b._id).lean();
			expect(untouched.uses).to.equal(0);
		});

		it(`anti-devinette : bloqué après ${PROMO_MAX_FAILURES} codes refusés`, async () => {
			const user = await newClient();
			const [code] = await batch();
			for (let i = 0; i < PROMO_MAX_FAILURES; i++) {
				await rejects(service.redeem(String(user._id), `GIFT-AAAAA${i + 2}`), 'code-invalid');
			}
			await rejects(service.redeem(String(user._id), code.code), 'too-many-attempts');
		});

		it('anti-devinette : des essais simultanés ne dépassent pas la limite', async () => {
			const user = await newClient();
			const tries = Array.from({ length: 12 }, (_, i) => service.redeem(String(user._id), `GIFT-BBB${'23456789ACDEFGH'[i]}`));
			const reasons = (await Promise.allSettled(tries)).map((r: any) => r.reason?.reason);
			expect(reasons.filter((r) => r === 'code-invalid')).to.have.length(PROMO_MAX_FAILURES);
			expect(reasons.filter((r) => r === 'too-many-attempts')).to.have.length(12 - PROMO_MAX_FAILURES);
		});

		it('un code activé ne consomme pas d’essai', async () => {
			const user = await newClient();
			const [code] = await batch();
			await service.redeem(String(user._id), code.code);
			expect((await model(ClientSet).findById(user._id).lean()).promoFailures).to.equal(0);
		});
	});

	describe('Inscription', () => {
		it('code saisi à l’inscription : seul le format est contrôlé, activé à la vérification du compte', async () => {
			const [code] = await batch();
			expect(service.forSignup(code.code.toLowerCase())).to.deep.equal({ type: 'gift', code: code.code });
			// Un code inexistant reçoit la même réponse : l'inscription ne révèle rien.
			expect(service.forSignup('BIZ-ZZZZ')).to.deep.equal({ type: 'business', code: 'BIZ-ZZZZ' });
			expect(service.forSignup('YO-ABCD')).to.equal(null);
			expect((await model(PromoCodeSet).findById(code._id).lean()).uses).to.equal(0);

			const user = await newClient({ pendingPromoCode: code.code });
			await service.redeemPending(String(user._id));
			expect(await activeSub(user._id)).to.not.equal(null);
			expect((await model(ClientSet).findById(user._id).lean()).pendingPromoCode).to.equal(undefined);
			// Un second passage (OTP renvoyé) ne fait rien.
			await service.redeemPending(String(user._id));
			expect(await model(FreeMonthGrantSet).countDocuments({})).to.equal(1);
		});

		it('code invalide saisi à l’inscription : refusé à l’activation, échec compté, utilisateur prévenu', async () => {
			const user = await newClient({ pendingPromoCode: 'GIFT-ZZZZ' });
			await service.redeemPending(String(user._id));
			const after = await model(ClientSet).findById(user._id).lean();
			expect(after.promoFailures).to.equal(1);
			expect(after.pendingPromoCode).to.equal(undefined);
			expect(await activeSub(user._id)).to.equal(null);
			expect((PushNotificationService.prototype.create as sinon.SinonStub).calledOnce).to.equal(true);
		});
	});

	describe('Administration', () => {
		it('réattribution : seulement un code jamais utilisé, avec un nouveau délai', async () => {
			const [free, used] = await batch({ count: 2 });
			await model(PromoCodeSet).updateOne({ _id: free._id }, { expiresAt: new Date(Date.now() - DAY) });
			const reassigned: any = await service.reassign(String(free._id), { name: 'Yao', phone: '0102030405' });
			expect(reassigned.holderPhone).to.equal('0102030405');
			expect(new Date(reassigned.expiresAt).getTime()).to.be.greaterThan(Date.now() + 29 * DAY);

			await service.redeem(String((await newClient())._id), used.code);
			expect(await service.reassign(String(used._id), { name: 'Yao' })).to.equal(null);
		});

		it('annulation d’une activation : jours retirés', async () => {
			const user = await newClient();
			const [code] = await batch();
			await service.redeem(String(user._id), code.code);
			const redemption = await model(PromoRedemptionSet).findOne({ user: user._id }).lean();
			expect(await service.revokeRedemption(String(redemption._id), 'Fraude')).to.equal(true);
			const sub = await model(SubscriptionSet).findOne({ userId: user._id }).lean();
			expect(sub.status).to.equal('expired');
			expect(await service.revokeRedemption(String(redemption._id), 'Fraude')).to.equal(false);
		});

		it('statistiques par lot et activations par entreprise', async () => {
			const company = await service.createCompany({ name: 'MTN CI' });
			const codes = await batch({ type: 'business', companyId: String(company._id), count: 3, label: 'MTN Q4' });
			await service.redeem(String((await newClient())._id), codes[0].code);
			await service.setCodeStatus(String(codes[1]._id), 'disabled');
			const [row] = await service.listBatches();
			expect(row.stats).to.deep.equal({ total: 3, used: 1, disabled: 1, expired: 0, available: 1 });
			expect(row.companyName).to.equal('MTN CI');
			const detail = await service.companyDetail(String(company._id));
			expect(detail.redemptions).to.have.length(1);
			const [listed] = await service.listCompanies();
			expect(listed).to.include({ codes: 3, activations: 1 });
		});

		it('routes : client connecté pour l’activation, permission « promotions » pour le CMS', () => {
			const can = sinon.stub(TokenMiddleware, 'can').callsFake((action: string, subject: string) => `${action}:${subject}` as any);
			const routes: any[] = [];
			promoCodeRoute({ route: (definition: any) => routes.push(definition) }, {}, () => {});
			const redeem = routes.find((r) => r.url === '/clients/me/promo-codes/redeem');
			expect(redeem.preHandler).to.equal(TokenMiddleware.verify);
			const admin = routes.filter((r) => r !== redeem);
			expect(admin.length).to.be.greaterThan(8);
			admin.forEach((r) => expect(r.preHandler).to.match(/^(read|create|update):promotions$/));
			expect(can.called).to.equal(true);
		});
	});
});
