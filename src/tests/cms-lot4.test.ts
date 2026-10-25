import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ClientSet } from '../modules/client/client.model';
import { ClientService } from '../modules/client/client.service';
import { ClientDataExportService } from '../modules/client/client-data-export.service';
import { PartnerSet } from '../modules/partner/partner.model';
import { PartnerValidationService } from '../modules/partner/partner-validation.service';
import { PartnerCommentSet } from '../modules/partner-engagement/partner-engagement.model';
import { PaymentSet } from '../modules/payment/payment.model';
import { DeviceTokenSet } from '../modules/device-token/device-token.model';
import { ReportSet, ReportService } from '../modules/report';
import { FraudAlertSet, FraudAlertService } from '../modules/fraud-alert';
import { PlatformConfigSet } from '../modules/platform-config/platform-config.model';
import { MediaModerationService } from '../modules/media-moderation/media-moderation.service';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { NotificationHelper } from '../helpers/notification.helper';
import { EmailService } from '../services/notification';
import reportRoute from '../api/routes/report.route';
import partnerValidationRoute from '../api/routes/partner-validation.route';
import fraudAlertRoute from '../api/routes/fraud-alert.route';
import clientDataExportRoute from '../api/routes/client-data-export.route';

/**
 * Lot 4 de la feuille CMS : signalements (n°13), validation des boutiques (n°14), alertes
 * fraude (n°3), export des données personnelles (n°16).
 */
describe('CMS lot 4 : signalements, validation, fraude, données personnelles', () => {
	let mongod: MongoMemoryServer;
	const model = (Set: any) => (new Set() as any).defaultModel;
	const oid = () => new mongoose.Types.ObjectId();
	const adminId = String(oid());
	let notify: sinon.SinonStub;
	let seq = 0;

	const newClient = async (extra: any = {}) => {
		const _id = oid();
		await model(ClientSet).create({
			_id,
			email: `c${++seq}@test.ci`,
			firstname: 'Awa',
			lastname: 'Koné',
			password: 'hash-secret',
			status: 'active',
			...extra
		});
		return String(_id);
	};

	const newPartner = async (extra: any = {}) => {
		const _id = oid();
		await model(PartnerSet).create({ _id, slug: `b-${++seq}`, name: `Boutique ${seq}`, status: 'active', user: oid(), ...extra });
		return model(PartnerSet).findById(_id).lean();
	};

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-cms-lot4' });
		await model(ReportSet).syncIndexes();
		await model(FraudAlertSet).syncIndexes();
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [ClientSet, PartnerSet, PartnerCommentSet, PaymentSet, DeviceTokenSet, ReportSet, FraudAlertSet, PlatformConfigSet]) {
			await model(Set).deleteMany({});
		}
		sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
		notify = sinon.stub(NotificationHelper, 'notifyAdminsWithPermission').resolves();
		sinon.stub(console, 'log');
	});

	afterEach(() => sinon.restore());

	describe('Signalements (n°13)', () => {
		it("enregistre un signalement, refuse le doublon et son propre contenu", async () => {
			const service = new ReportService();
			const shop: any = await newPartner();
			const reporter = await newClient();

			const ok = await service.create(reporter, { targetType: 'boutique', targetId: String(shop._id), reason: 'arnaque' });
			expect(ok.status).to.equal(201);
			const dup = await service.create(reporter, { targetType: 'boutique', targetId: String(shop._id), reason: 'spam' });
			expect(dup.status).to.equal(409);
			const own = await service.create(String(shop.user), { targetType: 'boutique', targetId: String(shop._id), reason: 'spam' });
			expect(own.status).to.equal(400);
		});

		it('refuse une boutique en attente de validation et un motif inconnu', async () => {
			const service = new ReportService();
			const shop: any = await newPartner({ status: 'pending' });
			const reporter = await newClient();
			expect((await service.create(reporter, { targetType: 'boutique', targetId: String(shop._id), reason: 'arnaque' })).status).to.equal(404);
			expect((await service.create(reporter, { targetType: 'boutique', targetId: String(oid()), reason: 'nope' })).status).to.equal(400);
		});

		it('limite à 10 signalements par compte et par 24 h', async () => {
			const service = new ReportService();
			const reporter = await newClient();
			for (let i = 0; i < 10; i++) {
				const shop: any = await newPartner();
				expect((await service.create(reporter, { targetType: 'boutique', targetId: String(shop._id), reason: 'spam' })).status).to.equal(201);
			}
			const shop: any = await newPartner();
			expect((await service.create(reporter, { targetType: 'boutique', targetId: String(shop._id), reason: 'spam' })).status).to.equal(429);
		});

		it('alerte les modérateurs une seule fois, au 3e signalement', async () => {
			const service = new ReportService();
			const shop: any = await newPartner();
			for (let i = 0; i < 4; i++) {
				await service.create(await newClient(), { targetType: 'boutique', targetId: String(shop._id), reason: 'arnaque' });
			}
			expect(notify.callCount).to.equal(1);
			expect(notify.firstCall.args[0]).to.equal('moderation');
		});

		it('regroupe par contenu et supprime le commentaire signalé', async () => {
			const service = new ReportService();
			const shop: any = await newPartner();
			const commentId = oid();
			await model(PartnerCommentSet).create({ _id: commentId, partnerId: shop._id, userId: oid(), text: 'insulte', status: 'active' });
			await service.create(await newClient(), { targetType: 'comment', targetId: String(commentId), reason: 'offensant' });
			await service.create(await newClient(), { targetType: 'comment', targetId: String(commentId), reason: 'spam' });

			const list = await service.adminList({});
			expect(list.data).to.have.length(1);
			expect(list.data[0].count).to.equal(2);
			expect(list.data[0].reasons).to.deep.equal({ offensant: 1, spam: 1 });
			expect(list.data[0].comment.text).to.equal('insulte');
			expect(list.message.counts.comment).to.equal(1);

			expect((await service.resolve({ targetType: 'comment', targetId: String(commentId), action: 'suspend-boutique' }, adminId)).status).to.equal(400);
			const res = await service.resolve({ targetType: 'comment', targetId: String(commentId), action: 'remove-comment' }, adminId);
			expect(res.status).to.equal(200);
			const comment: any = await model(PartnerCommentSet).findById(commentId).lean();
			expect(comment.status).to.equal('removed');
			expect(await model(ReportSet).countDocuments({ status: 'actioned', action: 'remove-comment' })).to.equal(2);
			expect((await service.adminList({})).data).to.have.length(0);
		});

		it("retire un média signalé par son URL : rejet en modération et retrait de la fiche", async () => {
			const review = sinon.stub(MediaModerationService.prototype, 'review').resolves({});
			const service = new ReportService();
			const shop: any = await newPartner({ photos: ['a.jpg', 'b.jpg'] });
			const res = await service.create(await newClient(), { targetType: 'media', targetId: 'https://api.yoyo.ci/v1/file/b.jpg', reason: 'inapproprie' });
			expect(res.status).to.equal(201);
			const report: any = await model(ReportSet).findOne({}).lean();
			expect(report.targetId).to.equal('b.jpg');

			await service.resolve({ targetType: 'media', targetId: 'b.jpg', action: 'remove-media' }, adminId);
			expect(review.calledOnce).to.equal(true);
			const updated: any = await model(PartnerSet).findById(shop._id).lean();
			expect(updated.photos).to.deep.equal(['a.jpg']);
		});
	});

	describe('Validation des boutiques (n°14)', () => {
		it('valide une boutique en attente puis refuse une seconde décision', async () => {
			const service = new PartnerValidationService();
			const shop: any = await newPartner(PartnerValidationService.pendingFields());
			expect((await service.counts()).pending).to.equal(1);

			const ok = await service.validate(String(shop._id), adminId);
			expect(ok.status).to.equal(200);
			const updated: any = await model(PartnerSet).findById(shop._id).lean();
			expect(updated.status).to.equal('active');
			expect(updated.validation.status).to.equal('approved');
			expect((await service.validate(String(shop._id), adminId)).status).to.equal(409);
		});

		it('un refus garde la boutique invisible ; une modification la renvoie en validation', async () => {
			const service = new PartnerValidationService();
			const shop: any = await newPartner(PartnerValidationService.pendingFields());
			expect((await service.reject(String(shop._id), 'x', adminId)).status).to.equal(400);
			expect((await service.reject(String(shop._id), 'Photos floues', adminId)).status).to.equal(200);

			let doc: any = await model(PartnerSet).findById(shop._id).lean();
			expect(doc.status).to.equal('pending');
			expect(doc.validation).to.include({ status: 'rejected', reason: 'Photos floues' });
			expect((await service.list({ tab: 'rejected' })).data).to.have.length(1);
			expect((await service.list({})).data).to.have.length(0);

			expect(await service.resubmitIfRejected(String(shop._id))).to.equal(true);
			doc = await model(PartnerSet).findById(shop._id).lean();
			expect(doc.validation.status).to.equal('pending');
			expect(notify.calledWith('pros')).to.equal(true);
			expect(await service.resubmitIfRejected(String(shop._id))).to.equal(false);
		});
	});

	describe('Alertes fraude (n°3)', () => {
		it("ouvre une alerte au 3e compte d'un appareil, puis la met à jour sans nouvelle notification", async () => {
			const service = new FraudAlertService();
			for (let i = 0; i < 2; i++) await newClient({ signupDeviceId: 'dev-1' });
			await service.checkDevice('dev-1');
			expect(await model(FraudAlertSet).countDocuments({})).to.equal(0);

			await newClient({ signupDeviceId: 'dev-1' });
			await service.checkDevice('dev-1');
			await newClient({ signupDeviceId: 'dev-1' });
			await service.checkDevice('dev-1');

			const alerts: any[] = await model(FraudAlertSet).find({}).lean();
			expect(alerts).to.have.length(1);
			expect(alerts[0]).to.include({ type: 'multi-account-device', status: 'open', occurrences: 2 });
			expect(alerts[0].clients).to.have.length(4);
			expect(notify.callCount).to.equal(1);
			expect(notify.firstCall.args[0]).to.equal('clients');
		});

		it('repère un client trop actif et une boutique en pic', async () => {
			const service = new FraudAlertService();
			const now = new Date('2026-10-25T06:00:00Z');
			const client = oid();
			const shop = oid();
			const docs: any[] = [];
			for (let i = 0; i < 20; i++) {
				docs.push({ _id: oid(), from: i < 15 ? client : oid(), to: shop, amount: 1000, status: 'success', completedAt: new Date(now.getTime() - (i + 1) * 60_000) });
			}
			// Moyenne de la boutique : 30 réductions sur les 30 jours précédents (1 par jour).
			for (let d = 2; d < 32; d++) docs.push({ _id: oid(), from: oid(), to: shop, amount: 1000, status: 'success', completedAt: new Date(now.getTime() - d * 86_400_000) });
			await model(PaymentSet).insertMany(docs);

			const res = await service.scanVolumes(now);
			expect(res).to.deep.equal({ clients: 1, boutiques: 1 });
			expect(await model(FraudAlertSet).countDocuments({ type: 'scan-velocity', subjectKey: String(client) })).to.equal(1);
			expect(await model(FraudAlertSet).countDocuments({ type: 'boutique-spike', subjectKey: String(shop) })).to.equal(1);
		});

		it("invalide le ticket d'une alerte de montant inhabituel", async () => {
			const service = new FraudAlertService();
			const paymentId = oid();
			await model(PaymentSet).create({ _id: paymentId, from: oid(), to: oid(), amount: 500000, status: 'success', completedAt: new Date(), flagged: true });
			await service.flaggedScan({ _id: paymentId, from: oid(), to: oid(), amount: 500000, boutiqueName: 'Chez Awa' });
			const alert: any = await model(FraudAlertSet).findOne({}).lean();

			const res = await service.resolve(String(alert._id), { action: 'invalidate-ticket' }, adminId);
			expect(res.status).to.equal(200);
			expect((await model(PaymentSet).findById(paymentId).lean()).status).to.equal('invalidated');
			expect((await service.resolve(String(alert._id), { action: 'dismiss' }, adminId)).status).to.equal(409);
		});
	});

	describe('Données personnelles (n°16)', () => {
		it("exporte le compte sans secret, une fois par 24 h pour l'utilisateur", async () => {
			const userId = await newClient({ secretResponse: 'chat' });
			await newPartner({ user: userId });
			await model(PaymentSet).create({ _id: oid(), from: userId, to: oid(), amount: 2000, status: 'success', completedAt: new Date() });

			const service = new ClientDataExportService();
			const first = await service.exportForSelf(userId);
			expect(first.status).to.equal(200);
			expect(first.data.profile.password).to.equal(undefined);
			expect(first.data.profile.secretResponse).to.equal(undefined);
			expect(first.data.boutiques).to.have.length(1);
			expect(first.data.purchasesInShops).to.have.length(1);

			expect((await service.exportForSelf(userId)).status).to.equal(429);
			expect((await service.exportForAdmin(userId)).status).to.equal(200);
		});

		it("envoie l'export par e-mail en pièce jointe, et libère le délai si l'envoi échoue", async () => {
			const userId = await newClient({ email: 'awa.kone@test.ci' });
			const send = sinon.stub(EmailService.prototype, 'send').resolves({ success: false, message: 'smtp' } as any);
			const service = new ClientDataExportService();

			const failed = await service.emailForSelf(userId);
			expect(failed.status).to.equal(500);

			send.resolves({ success: true, message: 'ok' } as any);
			const ok = await service.emailForSelf(userId);
			expect(ok.status).to.equal(200);
			expect(ok.message).to.include('aw•••@test.ci');
			const mail: any = send.lastCall.args[0];
			expect(mail.to).to.equal('awa.kone@test.ci');
			expect(JSON.parse(mail.attachments[0].content).profile.email).to.equal('awa.kone@test.ci');
			expect((await service.emailForSelf(userId)).status).to.equal(429);
		});

		it("l'anonymisation efface l'appareil d'inscription, les jetons push et les commentaires", async () => {
			const userId = await newClient({ signupDeviceId: 'dev-9' });
			await model(DeviceTokenSet).create({ _id: oid(), user: userId, token: 'tok-1', app: 'client', platform: 'android' });
			const commentId = oid();
			await model(PartnerCommentSet).create({ _id: commentId, partnerId: oid(), userId, text: 'mon avis', status: 'active' });

			const res = await new ClientService().anonymize(userId, { trigger: 'admin' });
			expect(res.error).to.equal(false);
			const client: any = await model(ClientSet).findById(userId).lean();
			expect(client.signupDeviceId ?? null).to.equal(null);
			expect(await model(DeviceTokenSet).countDocuments({ user: userId })).to.equal(0);
			const comment: any = await model(PartnerCommentSet).findById(commentId).lean();
			expect(comment).to.include({ text: '[supprimé]', status: 'removed' });
		});
	});

	describe('Gardes des nouvelles routes', () => {
		const collect = (routeModule: any) => {
			const routes: any[] = [];
			routeModule({ route: (d: any) => routes.push(d) }, {}, () => {});
			return routes;
		};
		const perms = (routes: any[], method: string, url: string) => {
			const route = routes.find((r) => r.method === method && r.url === url);
			expect(route, `${method} ${url}`).to.not.equal(undefined);
			expect(route.preHandler?.adminGuard, `${method} ${url}`).to.equal(true);
			return route.preHandler.permissions;
		};

		it('chaque file du back-office exige la permission de son domaine', () => {
			const reports = collect(reportRoute);
			expect(perms(reports, 'GET', '/admin/reports')).to.deep.equal([['read', 'moderation']]);
			expect(perms(reports, 'POST', '/admin/reports/resolve')).to.deep.equal([['update', 'moderation']]);
			const validation = collect(partnerValidationRoute);
			expect(perms(validation, 'GET', '/partners/validation')).to.deep.equal([['read', 'pros']]);
			expect(perms(validation, 'POST', '/partners/:id/validate')).to.deep.equal([['update', 'pros']]);
			expect(perms(validation, 'POST', '/partners/:id/reject')).to.deep.equal([['update', 'pros']]);
			const fraud = collect(fraudAlertRoute);
			expect(perms(fraud, 'GET', '/fraud-alerts')).to.deep.equal([['read', 'clients']]);
			expect(perms(fraud, 'POST', '/fraud-alerts/:id/resolve')).to.deep.equal([['update', 'clients']]);
			expect(perms(collect(clientDataExportRoute), 'GET', '/clients/:id/data-export')).to.deep.equal([['read', 'clients']]);
		});
	});
});
