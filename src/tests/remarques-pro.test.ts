import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import partnerRoute from '../api/routes/partner.route';
import { PartnerSet } from '../modules/partner';
import { BoutiqueManagerSet } from '../modules/boutique-manager/boutique-manager.model';
import { CategorySet } from '../modules/category/category.model';
import { PaymentService } from '../modules/payment/payment.service';
import { SettingsService } from '../modules/settings';
import { PartnerAccessHelper } from '../helpers/partner-access.helper';
import { PartnerMediaHelper } from '../helpers/partner-media.helper';

/**
 * Correctifs issus des remarques des testeurs de l'app Pro (octobre 2026) :
 *  - n°1 : le gérant obtient le QR de sa boutique ;
 *  - n°4 : la vidéo est réservée aux boutiques boostées ;
 *  - n°5 : commande minimale limitée aux catégories éligibles ;
 *  - et la faille découverte au passage : `PUT /partners` sans contrôle de propriété.
 */

/** Faux `reply` : `sent` se résout quand la réponse part (`coddyger.api` ne renvoie pas sa promesse). */
const fakeReply = () => {
	const state: any = { code: 200 };
	let resolveSent: (v?: any) => void = () => {};
	const reply: any = {
		state,
		sent: new Promise((r) => (resolveSent = r)),
		code(value: number) { state.code = value; return reply; },
		status(value: number) { state.code = value; return reply; },
		header() { return reply; },
		send(body: any) { state.body = body; resolveSent(); return reply; }
	};
	return reply;
};

/** Récupère le handler d'une route déclarée par un module de routes. */
const handlerOf = (method: string, url: string) => {
	let found: any;
	const fakeFastify: any = {
		addContentTypeParser: () => {},
		route: (def: any) => {
			if (def.method === method && def.url === url) found = def.handler;
		}
	};
	partnerRoute(fakeFastify, {}, () => {});
	return found;
};

describe('Remarques testeurs — app Pro', () => {
	let mongod: MongoMemoryServer;

	const OWNER_ID = '507f1f77bcf86cd799439041';
	const MANAGER_ID = '507f1f77bcf86cd799439042';
	const REVOKED_ID = '507f1f77bcf86cd799439043';
	const STRANGER_ID = '507f1f77bcf86cd799439044';
	const PARTNER_ID = '507f1f77bcf86cd799439045';
	const ELIGIBLE_CAT = '507f1f77bcf86cd799439046';
	const OTHER_CAT = '507f1f77bcf86cd799439047';

	const partnerModel = () => (new PartnerSet() as any).defaultModel;
	const managerModel = () => (new BoutiqueManagerSet() as any).defaultModel;
	const categoryModel = () => (new CategorySet() as any).defaultModel;
	const oid = (id: string) => new mongoose.Types.ObjectId(id);

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-remarques-pro' });

		await categoryModel().create([
			{ _id: oid(ELIGIBLE_CAT), name: 'Cafés, Glaciers & Pâtisseries', status: 'active' },
			{ _id: oid(OTHER_CAT), name: 'Mode & Habillement', status: 'active' }
		]);

		const link = { boutique: oid(PARTNER_ID), owner: oid(OWNER_ID), managerName: 'Gérant', managerPhone: '0700000000' };
		await managerModel().create([
			{ _id: new mongoose.Types.ObjectId(), ...link, manager: oid(MANAGER_ID), status: 'active' },
			{ _id: new mongoose.Types.ObjectId(), ...link, manager: oid(REVOKED_ID), status: 'removed' }
		]);
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		await partnerModel().deleteMany({});
		await partnerModel().create({
			_id: oid(PARTNER_ID),
			slug: 'boutique-pro',
			name: 'Boutique Pro',
			status: 'active',
			user: oid(OWNER_ID),
			maxDiscount: 10,
			categories: [oid(OTHER_CAT)]
		});
		sinon.stub(SettingsService.prototype, 'getDiscountBounds').resolves({ min: 5, max: 50 } as any);
	});

	afterEach(() => sinon.restore());

	describe('QR code du gérant (n°1)', () => {
		it('émet un jeton de scan au gérant actif', async () => {
			const result: any = await new PaymentService().issueScanToken(PARTNER_ID, MANAGER_ID);
			expect(result.error, JSON.stringify(result.data)).to.not.equal(true);
			expect(result.token).to.be.a('string');
		});

		it('refuse un gérant révoqué et un tiers', async () => {
			for (const actor of [REVOKED_ID, STRANGER_ID]) {
				const result: any = await new PaymentService().issueScanToken(PARTNER_ID, actor);
				expect(result.forbidden, actor).to.equal(true);
			}
		});
	});

	describe('PUT /partners — contrôle d’accès', () => {
		const handler = handlerOf('PUT', '/partners');
		const put = async (request: any, reply: any) => {
			await handler(request, reply);
			await reply.sent;
			return reply.state;
		};

		it('refuse un compte qui ne gère pas la boutique', async () => {
			const reply = fakeReply();
			const state = await put({ body: { _id: PARTNER_ID, name: 'Piratée' }, user: { _id: STRANGER_ID } }, reply);
			expect(state.code).to.equal(403);

			const p: any = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.name).to.equal('Boutique Pro');
		});

		it('autorise le gérant sans changer le propriétaire', async () => {
			const reply = fakeReply();
			await put({ body: { _id: PARTNER_ID, latitude: 5.35, longitude: -4.0 }, user: { _id: MANAGER_ID } }, reply);

			const p: any = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.latitude).to.equal(5.35);
			expect(String(p.user)).to.equal(OWNER_ID);
		});

		it('refuse une nouvelle vidéo sur une boutique non boostée (n°4), mais permet de la retirer', async () => {
			const refused = fakeReply();
			const state = await put({ body: { _id: PARTNER_ID, video: 'clip.mp4' }, user: { _id: OWNER_ID } }, refused);
			expect(state.code).to.equal(403);
			expect((await partnerModel().findById(PARTNER_ID).lean()).video).to.not.equal('clip.mp4');

			await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { video: 'ancienne.mp4' } });
			await put({ body: { _id: PARTNER_ID, video: '' }, user: { _id: OWNER_ID } }, fakeReply());
			expect((await partnerModel().findById(PARTNER_ID).lean()).video).to.equal('');
		});

		it('accepte une vidéo sur une boutique boostée', async () => {
			await partnerModel().updateOne({ _id: PARTNER_ID }, { $set: { isSponsored: true } });
			await put({ body: { _id: PARTNER_ID, video: 'clip.mp4' }, user: { _id: OWNER_ID } }, fakeReply());
			expect((await partnerModel().findById(PARTNER_ID).lean()).video).to.equal('clip.mp4');
		});

		it('ignore maxOrder et la commande minimale hors catégorie éligible (n°5)', async () => {
			await put({ body: { _id: PARTNER_ID, minOrder: 2000, maxOrder: 9000 }, user: { _id: OWNER_ID } }, fakeReply());
			let p: any = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.minOrder).to.equal(0);
			expect(p.maxOrder).to.equal(undefined);

			await put(
				{ body: { _id: PARTNER_ID, categories: [ELIGIBLE_CAT], minOrder: 2000 }, user: { _id: OWNER_ID } },
				fakeReply()
			);
			p = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.minOrder).to.equal(2000);
		});
	});

	describe('Autres écritures sur une boutique', () => {
		const call = async (method: string, url: string, request: any) => {
			const reply = fakeReply();
			await handlerOf(method, url)(request, reply);
			await reply.sent;
			return reply.state;
		};

		it('DELETE /partners/remove/:id : refusé au tiers et au gérant', async () => {
			for (const actor of [STRANGER_ID, MANAGER_ID]) {
				const state = await call('DELETE', '/partners/remove/:id', { params: { id: PARTNER_ID }, user: { _id: actor } });
				expect(state.code, actor).to.equal(403);
			}
			const p: any = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.status).to.equal('active');
		});

		it('PUT /partners/:id/opening-hours : refusé au tiers', async () => {
			const state = await call('PUT', '/partners/:id/opening-hours', {
				params: { id: PARTNER_ID },
				body: { openingHours: [] },
				user: { _id: STRANGER_ID }
			});
			expect(state.code).to.equal(403);
		});

		it('PUT /partners : ignore les champs hors liste et les opérateurs Mongo', async () => {
			await call('PUT', '/partners', {
				body: { _id: PARTNER_ID, name: 'Renommée', verified: true, slug: 'pirate', $set: { user: STRANGER_ID } },
				user: { _id: OWNER_ID }
			});
			const p: any = await partnerModel().findById(PARTNER_ID).lean();
			expect(p.name).to.equal('Renommée');
			expect(p.slug).to.equal('boutique-pro');
			expect(p.verified).to.equal(undefined);
			expect(String(p.user)).to.equal(OWNER_ID);
		});

		it('PUT /partners : identifiant invalide refusé', async () => {
			const state = await call('PUT', '/partners', { body: { _id: 'abc' }, user: { _id: OWNER_ID } });
			expect(state.code).to.equal(400);
		});
	});

	describe('Accès et vidéo', () => {
		it('canManage : propriétaire, gérant actif et admin uniquement', async () => {
			const partner = { _id: PARTNER_ID, user: OWNER_ID };
			expect(await PartnerAccessHelper.canManage(partner, { _id: OWNER_ID })).to.equal(true);
			expect(await PartnerAccessHelper.canManage(partner, { _id: MANAGER_ID })).to.equal(true);
			expect(await PartnerAccessHelper.canManage(partner, { _id: 'x', isAdmin: true })).to.equal(true);
			expect(await PartnerAccessHelper.canManage(partner, { _id: REVOKED_ID })).to.equal(false);
		});

		it('le gérant voit la vidéo de sa boutique non boostée, pas un client', async () => {
			const res = { status: 200, data: { _id: PARTNER_ID, user: OWNER_ID, video: 'v.mp4', isSponsored: false } };
			const forManager: any = await PartnerMediaHelper.apply(Promise.resolve(res), { _id: MANAGER_ID });
			const forClient: any = await PartnerMediaHelper.apply(Promise.resolve(res), { _id: STRANGER_ID });
			expect(forManager.data.video).to.equal('v.mp4');
			expect(forClient.data.video).to.equal(null);
		});
	});
});
