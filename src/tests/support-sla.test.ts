import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ClientSet } from '../modules/client/client.model';
import { PlatformConfigSet } from '../modules/platform-config/platform-config.model';
import { DEFAULT_SUPPORT_SLA } from '../modules/platform-config/platform-config.service';
import { SupportMessageSet, SupportTicketSet } from '../modules/support/support.model';
import { SupportService } from '../modules/support/support.service';
import { addBusinessHours, computeDueDates } from '../modules/support/support-sla';
import { categoriesFor } from '../modules/support/support.interface';
import { FaqSet } from '../modules/support/faq.model';
import { FaqService, PRO_FAQ_SEED, SUPPORT_FAQ } from '../modules/support/faq.service';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { NotificationHelper } from '../helpers/notification.helper';
import { _alertOverdue } from '../cron/support-sla.cron';

/**
 * Centre d'aide marchand (Excel CMS n°6) et délais de réponse du support (Excel CMS n°5,
 * décision Support n°8 : paiement 2 h ouvrées, sinon 24 h ; résolution 48 h).
 */
describe('Support : tickets Pro, délais et FAQ', () => {
	let mongod: MongoMemoryServer;
	const service = new SupportService();
	const HOUR = 3_600_000;
	const model = (Set: any) => (new Set() as any).defaultModel;
	let seq = 0;

	const newClient = async (extra: any = {}) =>
		model(ClientSet).create({
			_id: new mongoose.Types.ObjectId(),
			email: `s${++seq}@yoyo.ci`,
			contact: `07200${String(seq).padStart(5, '0')}`,
			status: 'active',
			password: 'hash',
			firstname: 'Awa',
			lastname: 'Koné',
			...extra
		});

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-support' });
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [ClientSet, PlatformConfigSet, SupportTicketSet, SupportMessageSet, FaqSet]) {
			await model(Set).deleteMany({});
		}
		sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
	});

	afterEach(() => sinon.restore());

	describe('Échéances', () => {
		it('heures ouvrées : samedi 17 h 30 + 2 h = lundi 9 h 30 (dimanche fermé)', () => {
			const due = addBusinessHours(new Date('2026-10-24T17:30:00Z'), 2, DEFAULT_SUPPORT_SLA);
			expect(due.toISOString()).to.equal('2026-10-26T09:30:00.000Z');
		});

		it('heures ouvrées : ticket ouvert la nuit, le délai court dès l’ouverture', () => {
			const due = addBusinessHours(new Date('2026-10-27T03:00:00Z'), 2, DEFAULT_SUPPORT_SLA);
			expect(due.toISOString()).to.equal('2026-10-27T10:00:00.000Z');
		});

		it('paiement : 2 h ouvrées ; autre sujet : 24 h ; résolution : 48 h', () => {
			const at = new Date('2026-10-27T10:00:00Z');
			const payment = computeDueDates(at, 'paiement_revenus', DEFAULT_SUPPORT_SLA);
			const other = computeDueDates(at, 'boost', DEFAULT_SUPPORT_SLA);
			expect(payment.firstResponseDueAt.toISOString()).to.equal('2026-10-27T12:00:00.000Z');
			expect(other.firstResponseDueAt.getTime() - at.getTime()).to.equal(24 * HOUR);
			expect(payment.resolutionDueAt.getTime() - at.getTime()).to.equal(48 * HOUR);
		});
	});

	describe('Tickets Pro', () => {
		it('catégories propres à chaque appli', () => {
			expect(categoriesFor('pro')).to.include.members(['qr_scan', 'boost', 'paiement_revenus', 'boutique_horaires', 'compte', 'autre']);
			expect(categoriesFor('pro')).to.not.include('scan');
			expect(categoriesFor('client')).to.not.include('boost');
		});

		it('un compte non marchand ne peut pas ouvrir de ticket Pro', async () => {
			const user = await newClient();
			const result: any = await service.createTicket({ userId: String(user._id), category: 'boost', message: 'Aide', app: 'pro' });
			expect(result.error).to.equal(true);
			expect(await model(SupportTicketSet).countDocuments()).to.equal(0);
		});

		it('une catégorie Client est refusée dans l’appli Pro', async () => {
			const merchant = await newClient({ isPartner: true });
			const result: any = await service.createTicket({ userId: String(merchant._id), category: 'scan', message: 'Aide', app: 'pro' });
			expect(result.data).to.match(/Catégorie/);
		});

		it('ticket marchand : source pro, échéances posées, visible seulement dans l’appli Pro', async () => {
			const merchant = await newClient({ isPartner: true });
			const before = Date.now();
			const result: any = await service.createTicket({
				userId: String(merchant._id),
				category: 'paiement_revenus',
				message: 'Montant incorrect',
				app: 'pro'
			});
			expect(result.error).to.equal(undefined);
			const ticket = await model(SupportTicketSet).findById(result.ticket._id).lean();
			expect(ticket.source).to.equal('pro');
			expect(ticket.awaitingSince).to.be.instanceOf(Date);
			expect(ticket.firstResponseDueAt.getTime()).to.be.greaterThan(before);
			expect(ticket.resolutionDueAt.getTime() - ticket.createdAt.getTime()).to.be.closeTo(48 * HOUR, 5000);

			await service.createTicket({ userId: String(merchant._id), category: 'scan', message: 'Côté client' });
			expect((await service.listClientTickets(String(merchant._id), 'pro')).map((t: any) => t.source)).to.deep.equal(['pro']);
			expect((await service.listClientTickets(String(merchant._id), 'client')).map((t: any) => t.source)).to.deep.equal(['client']);
		});

		it('un gérant peut ouvrir un ticket Pro', async () => {
			const manager = await newClient({ isManager: true });
			const result: any = await service.createTicket({ userId: String(manager._id), category: 'qr_scan', message: 'QR', app: 'pro' });
			expect(result.error).to.equal(undefined);
		});

		it('la réponse du support date la 1re réponse et part sur l’appli Pro', async () => {
			const merchant = await newClient({ isPartner: true });
			const { ticket }: any = await service.createTicket({ userId: String(merchant._id), category: 'boost', message: 'Boost', app: 'pro' });
			await service.adminReply({ ticketId: String(ticket._id), adminId: String(new mongoose.Types.ObjectId()), body: 'Bonjour' });

			const saved = await model(SupportTicketSet).findById(ticket._id).lean();
			expect(saved.firstResponseAt).to.be.instanceOf(Date);
			expect(saved.awaitingSince).to.equal(null);
			expect(saved.status).to.equal('in_progress');
			const push = (PushNotificationService.prototype.create as sinon.SinonStub).firstCall.args[0] as any;
			expect(push.data.app).to.equal('pro');
			expect(push.data.url).to.equal(`/help/${ticket._id}`);

			// Nouveau message du marchand : de nouveau en attente, sans effacer la 1re réponse.
			await service.addClientMessage({ ticketId: String(ticket._id), userId: String(merchant._id), body: 'Merci' });
			const again = await model(SupportTicketSet).findById(ticket._id).lean();
			expect(again.awaitingSince).to.be.instanceOf(Date);
			expect(again.firstResponseAt.getTime()).to.equal(saved.firstResponseAt.getTime());
		});
	});

	describe('Liste du CMS et retards', () => {
		const overdueTicket = async (userId: any, extra: any = {}) =>
			model(SupportTicketSet).create({
				_id: new mongoose.Types.ObjectId(),
				reference: `R${++seq}`,
				userId,
				category: 'compte',
				status: 'open',
				source: 'pro',
				firstResponseDueAt: new Date(Date.now() - HOUR),
				resolutionDueAt: new Date(Date.now() + HOUR),
				...extra
			});

		it('filtres serveur : source, en retard, et compteurs', async () => {
			const merchant = await newClient({ isPartner: true });
			const user = await newClient();
			await overdueTicket(merchant._id);
			await overdueTicket(merchant._id, { firstResponseAt: new Date() }); // répondu : pas en retard
			await service.createTicket({ userId: String(user._id), category: 'scan', message: 'Scan' });

			const pro: any = await service.listAdminTickets({ source: 'pro' });
			expect(pro.rows).to.have.length(2);
			expect(pro.rows[0].user.isPartner).to.equal(true);

			const late: any = await service.listAdminTickets({ view: 'overdue' });
			expect(late.rows).to.have.length(1);
			expect(late.rows[0].overdue).to.equal(true);

			const client: any = await service.listAdminTickets({ source: 'client' });
			expect(client.rows).to.have.length(1);

			const { stats }: any = await service.adminStats();
			expect(stats.overdue).to.equal(1);
			expect(stats.bySource).to.deep.equal({ client: 1, pro: 2 });
		});

		it('recherche : une saisie avec caractères spéciaux ne casse pas la requête', async () => {
			const result: any = await service.listAdminTickets({ q: '(*[' });
			expect(result.error).to.equal(undefined);
		});

		it('une seule alerte par échéance dépassée, à l’agent assigné', async () => {
			const notify = sinon.stub(NotificationHelper, 'notifyAdminInApp').resolves();
			const merchant = await newClient({ isPartner: true });
			const agent = new mongoose.Types.ObjectId();
			await overdueTicket(merchant._id, { assignedTo: agent });
			await overdueTicket(merchant._id, { status: 'resolved' });

			const agents = async () => ['ne-doit-pas-servir'];
			expect(await _alertOverdue('first', new Date(), agents)).to.equal(1);
			expect(await _alertOverdue('first', new Date(), agents)).to.equal(0);
			expect(notify.calledOnce).to.equal(true);
			expect(notify.firstCall.args[0].to).to.equal(String(agent));
		});

		it('ticket non attribué : alerte aux agents du support', async () => {
			const notify = sinon.stub(NotificationHelper, 'notifyAdminInApp').resolves();
			const merchant = await newClient({ isPartner: true });
			await overdueTicket(merchant._id, { resolutionDueAt: new Date(Date.now() - HOUR), firstResponseAt: new Date() });
			expect(await _alertOverdue('resolution', new Date(), async () => ['a1', 'a2'])).to.equal(1);
			expect(notify.callCount).to.equal(2);
		});
	});

	describe('FAQ', () => {
		const faq = new FaqService();

		it('FAQ Client et Pro copiées en base au premier accès, puis séparées', async () => {
			const client = await faq.listPublished('client');
			const pro = await faq.listPublished('pro');
			expect(client).to.have.length(SUPPORT_FAQ.length);
			expect(pro).to.have.length(PRO_FAQ_SEED.length);
			expect(pro.map((f) => f.theme)).to.include.members(['QR code et scans', 'YO Boost', 'Boutique et horaires', 'Paiements et revenus']);
			expect(await model(FaqSet).countDocuments()).to.equal(SUPPORT_FAQ.length + PRO_FAQ_SEED.length);
		});

		it('brouillons et questions supprimées absents des applis', async () => {
			const draft = await faq.create({ app: 'pro', theme: 'Test', question: 'Brouillon ?', answer: 'Oui', status: 'draft' });
			const removed = await faq.create({ app: 'pro', theme: 'Test', question: 'Supprimée ?', answer: 'Oui' });
			await faq.remove(String(removed._id));
			const questions = (await faq.listPublished('pro')).map((f) => f.q);
			expect(questions).to.not.include('Brouillon ?');
			expect(questions).to.not.include('Supprimée ?');

			await faq.update(String(draft._id), { status: 'published' });
			expect((await faq.listPublished('pro')).map((f) => f.q)).to.include('Brouillon ?');
			expect((await faq.adminList('pro')).some((f) => f.question === 'Supprimée ?')).to.equal(false);
		});
	});
});
