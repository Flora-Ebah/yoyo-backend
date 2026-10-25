import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { env } from 'coddyger';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TransactionSet } from '../modules/transaction/transaction.model';
import { TransactionService } from '../modules/transaction/transaction.service';
import { TransactionAdminService } from '../modules/transaction/transaction-admin.service';
import { SubscriptionService, SubscriptionSet } from '../modules/subscription';
import { PartnerSet } from '../modules/partner/partner.model';
import { PartnerService } from '../modules/partner/partner.service';
import { BoutiqueManagerSet } from '../modules/boutique-manager/boutique-manager.model';
import { BoutiqueManagerService } from '../modules/boutique-manager/boutique-manager.service';
import { AuditLogSet } from '../modules/audit/audit.model';
import { AuditService } from '../modules/audit/audit.service';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { TokenMiddleware } from '../api/middleware';
import transactionAdminRoute from '../api/routes/transaction-admin.route';
import transactionRoute from '../api/routes/transaction.route';
import paymentRoute from '../api/routes/payment.route';
import clientRecordRoute from '../api/routes/client-record.route';
import auditRoute from '../api/routes/audit.route';
import boutiqueManagerRoute from '../api/routes/boutique-manager.route';

/**
 * Lot 3 de la feuille CMS : paiements en ligne (n°12 : activation manuelle, remboursement,
 * rapprochement), filtres cumulés et exports tracés (n°4, n°9), fiche 360 (n°11).
 */
describe('CMS lot 3 : paiements, filtres, exports, fiche 360', () => {
	let mongod: MongoMemoryServer;
	const model = (Set: any) => (new Set() as any).defaultModel;
	const adminId = String(new mongoose.Types.ObjectId());
	let seq = 0;

	const newTx = async (extra: any = {}) => {
		const _id = new mongoose.Types.ObjectId();
		await model(TransactionSet).create({
			_id,
			user: new mongoose.Types.ObjectId(),
			plan: new mongoose.Types.ObjectId(),
			amount: 1000,
			currency: 'XOF',
			paymentMethod: 'wave',
			paymentStatus: 'pending',
			paymentDate: new Date('2026-10-10T10:00:00Z'),
			paymentId: `p${++seq}`,
			paymentUrl: 'https://pay',
			paymentToken: `cos-${seq}`,
			...extra
		});
		return model(TransactionSet).findById(_id).lean();
	};

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-cms-lot3' });
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [TransactionSet, SubscriptionSet, PartnerSet, BoutiqueManagerSet, AuditLogSet]) {
			await model(Set).deleteMany({});
		}
		sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
		sinon.stub(console, 'log');
	});

	afterEach(() => sinon.restore());

	describe('Activation manuelle (n°12)', () => {
		it('force une seule activation, tracée, même avec deux clics simultanés', async () => {
			sinon.stub(TransactionService.prototype, 'resettle').resolves({ found: true, providerStatus: 'pending' });
			const create = sinon.stub(SubscriptionService.prototype, 'createSubscription').resolves({ success: true, message: 'ok' });
			const tx: any = await newTx();
			const service = new TransactionAdminService();

			const [a, b] = await Promise.all([
				service.activate(String(tx._id), { ref: 'T_WAVE_1', reason: 'Payé, webhook perdu' }, adminId),
				service.activate(String(tx._id), { ref: 'T_WAVE_1' }, adminId)
			]);

			expect([a.status, b.status].sort()).to.deep.equal([200, 409]);
			const saved: any = await model(TransactionSet).findById(tx._id).lean();
			expect(saved.paymentStatus).to.equal('success');
			expect(saved.manualActivation.ref).to.equal('T_WAVE_1');
			expect(String(saved.manualActivation.by)).to.equal(adminId);
			expect(saved.txnId).to.equal('T_WAVE_1');
			expect(create.calledOnce).to.equal(true);
			expect(create.firstCall.args[2]).to.include({ transactionId: String(tx._id), paymentMethod: 'wave' });
		});

		it('règle normalement quand le prestataire confirme le paiement', async () => {
			const tx: any = await newTx();
			sinon.stub(TransactionService.prototype, 'resettle').resolves({ found: true, providerStatus: 'success', transaction: { ...tx, paymentStatus: 'success' } });
			const res = await new TransactionAdminService().activate(String(tx._id), { ref: 'T_WAVE_2' }, adminId);
			expect(res.status).to.equal(200);
			expect(res.data.via).to.equal('provider');
			const saved: any = await model(TransactionSet).findById(tx._id).lean();
			expect(saved.manualActivation?.at).to.equal(undefined);
		});

		it('refuse une transaction déjà réglée', async () => {
			const tx: any = await newTx({ paymentStatus: 'success' });
			const res = await new TransactionAdminService().activate(String(tx._id), { ref: 'T_WAVE_3' }, adminId);
			expect(res.status).to.equal(409);
		});

		it("un rejeu de règlement ne recrée pas l'abonnement", async () => {
			const create = sinon.stub(SubscriptionService.prototype, 'createSubscription').resolves({ success: true, message: 'ok' });
			const tx: any = await newTx();
			const service = new TransactionService();
			await service.updateTransactionStatus(String(tx._id), 'success');
			await service.updateTransactionStatus(String(tx._id), 'success');
			expect(create.calledOnce).to.equal(true);
		});
	});

	describe('Remboursement (n°12)', () => {
		it("consigne le remboursement, annule l'abonnement lié et refuse un second remboursement", async () => {
			const tx: any = await newTx({ paymentStatus: 'success', txnId: 'T_OK' });
			const subId = new mongoose.Types.ObjectId();
			await model(SubscriptionSet).collection.insertOne({ _id: subId, userId: tx.user, planId: tx.plan, status: 'active', transactionId: String(tx._id) });
			const service = new TransactionAdminService();

			const res = await service.refund(String(tx._id), { amount: 1000, ref: 'R_1', reason: 'Double paiement', cancelSubscription: true }, adminId);
			expect(res.status).to.equal(200);
			expect(res.data.subscriptionCancelled).to.equal(true);
			const saved: any = await model(TransactionSet).findById(tx._id).lean();
			expect(saved.paymentStatus).to.equal('refunded');
			expect(saved.refund).to.include({ amount: 1000, ref: 'R_1' });
			const sub: any = await model(SubscriptionSet).findById(subId).lean();
			expect(sub.status).to.equal('cancelled');

			const again = await service.refund(String(tx._id), { amount: 1000, ref: 'R_2', reason: 'Encore' }, adminId);
			expect(again.status).to.equal(409);
		});

		it('refuse un montant supérieur au paiement', async () => {
			const tx: any = await newTx({ paymentStatus: 'success' });
			const res = await new TransactionAdminService().refund(String(tx._id), { amount: 5000, ref: 'R_3', reason: 'Trop' }, adminId);
			expect(res.status).to.equal(400);
		});
	});

	describe('Rapprochement Wave (n°12)', () => {
		it('classe concordants, écarts, non activés, inconnus et absents du relevé', async () => {
			const ok: any = await newTx({ paymentStatus: 'success', txnId: 'T1' });
			const gap: any = await newTx({ paymentStatus: 'success', txnId: 'T2' });
			const pending: any = await newTx({ paymentStatus: 'pending' });
			const missing: any = await newTx({ paymentStatus: 'success', txnId: 'T4', paymentDate: new Date('2026-10-11T09:00:00Z') });
			await newTx({ paymentStatus: 'success', txnId: 'T5', paymentDate: new Date('2026-09-01T09:00:00Z') }); // hors période

			const res = await new TransactionAdminService().reconcile({
				rows: [
					{ ref: 'T1', amount: 1000, date: '2026-10-10' },
					{ ref: 'T2', amount: 900, date: '2026-10-10' },
					{ ref: pending.paymentToken, amount: 1000, date: '2026-10-10' },
					{ ref: 'T_INCONNU', amount: 2000, date: '2026-10-12' }
				]
			});

			expect(res.status).to.equal(200);
			expect(res.data.counts).to.deep.equal({ rows: 4, matched: 1, amountMismatch: 1, notActivated: 1, unknown: 1, missingFromStatement: 1 });
			expect(res.data.matched[0]._id).to.equal(String(ok._id));
			expect(res.data.amountMismatch[0]._id).to.equal(String(gap._id));
			expect(res.data.notActivated[0]._id).to.equal(String(pending._id));
			expect(res.data.missingFromStatement[0]._id).to.equal(String(missing._id));
		});

		it('refuse un relevé vide', async () => {
			const res = await new TransactionAdminService().reconcile({ rows: [{ ref: '  ' }] });
			expect(res.status).to.equal(400);
		});
	});

	describe('Filtres boutiques cumulés (n°4)', () => {
		it('catégorie, statut, ville et recherche se combinent', async () => {
			const cat = new mongoose.Types.ObjectId();
			const other = new mongoose.Types.ObjectId();
			const shop = (name: string, status: string, ville: string, categories: any[]) =>
				model(PartnerSet).collection.insertOne({ _id: new mongoose.Types.ObjectId(), name, status, ville, categories, createdAt: new Date() });
			await shop('Maquis Awa', 'active', 'Abidjan', [cat]);
			await shop('Maquis Bintou', 'inactive', 'Abidjan', [cat]);
			await shop('Maquis Chloé', 'active', 'Bouaké', [cat]);
			await shop('Maquis Dédé', 'active', 'Abidjan', [other]);
			await shop('Salon Awa', 'active', 'Abidjan', [cat]);

			const res = await new PartnerService().getAll({ category: String(cat), status: 'active', ville: 'abidjan', query: 'maquis', pageSize: 50 });
			expect(res.rows.map((r: any) => r.name)).to.deep.equal(['Maquis Awa']);
		});

		it('liste les villes sans doublon de casse', async () => {
			for (const ville of ['Abidjan', 'abidjan', 'Bouaké', ' ']) {
				await model(PartnerSet).collection.insertOne({ _id: new mongoose.Types.ObjectId(), name: 'x', status: 'active', ville });
			}
			expect(await new PartnerService().villes()).to.deep.equal(['Abidjan', 'Bouaké']);
		});
	});

	describe('Gérants (n°4)', () => {
		it('liste paginée filtrée par nom ou téléphone', async () => {
			const insert = (managerName: string, managerPhone: string, status = 'active') =>
				model(BoutiqueManagerSet).collection.insertOne({
					_id: new mongoose.Types.ObjectId(),
					boutique: new mongoose.Types.ObjectId(),
					owner: new mongoose.Types.ObjectId(),
					manager: new mongoose.Types.ObjectId(),
					managerName,
					managerPhone,
					status,
					createdAt: new Date()
				});
			await insert('Koffi', '0700000001');
			await insert('Aya', '0700000002');
			await insert('Koffi retiré', '0700000003', 'removed');

			const res = await new BoutiqueManagerService().adminList({ q: 'koffi' });
			expect(res.data.totalRows).to.equal(1);
			expect(res.rows[0].managerName).to.equal('Koffi');
		});
	});

	describe('Exports tracés (n°9)', () => {
		it("enregistre l'auteur, la liste, les filtres et le nombre de lignes", async () => {
			const previous = env.database.useDatabase;
			(env.database as any).useDatabase = 'yes';
			try {
				await new AuditService().recordExport({ _id: adminId, email: 'admin@yoyo.ci' }, { entity: 'boutiques', filters: { status: 'active' }, count: 42 }, { path: '/audit/export' });
			} finally {
				(env.database as any).useDatabase = previous;
			}
			const log: any = await model(AuditLogSet).findOne({ action: 'export' }).lean();
			expect(log.subject).to.equal('exports');
			expect(log.actorEmail).to.equal('admin@yoyo.ci');
			expect(log.meta).to.deep.include({ entity: 'boutiques', count: 42 });
			expect(log.meta.filters).to.deep.equal({ status: 'active' });
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

		it('activation et remboursement exigent la modification des transactions', () => {
			const routes = collect(transactionAdminRoute);
			expect(perms(routes, 'POST', '/transactions/:id/activate')).to.deep.equal([['update', 'transactions']]);
			expect(perms(routes, 'POST', '/transactions/:id/refund')).to.deep.equal([['update', 'transactions']]);
			expect(perms(routes, 'POST', '/transactions/reconcile')).to.deep.equal([['read', 'transactions']]);
		});

		it("update-status n'accepte plus `success` ni `refunded`", () => {
			const route = collect(transactionRoute).find((r) => r.method === 'PUT' && r.url === '/transactions/update-status');
			const values = route.schema.body.properties.paymentStatus.enum;
			expect(values).to.not.include('success');
			expect(values).to.not.include('refunded');
		});

		it('les routes transactions et tickets globales sont réservées au back-office', () => {
			const tx = collect(transactionRoute);
			expect(perms(tx, 'GET', '/transactions/details/:id')).to.deep.equal([['read', 'transactions']]);
			expect(perms(tx, 'DELETE', '/transactions/remove/:id')).to.deep.equal([['delete', 'transactions']]);
			const pay = collect(paymentRoute);
			expect(perms(pay, 'GET', '/payments')).to.deep.equal([['read', 'transactions'], ['read', 'pros']]);
			expect(perms(pay, 'GET', '/payments/details/:id')).to.deep.equal([['read', 'transactions']]);
			expect(perms(pay, 'DELETE', '/payments/remove/:id')).to.deep.equal([['delete', 'transactions']]);
		});

		it('fiche 360 et liste des gérants exigent la lecture du domaine', () => {
			const rec = collect(clientRecordRoute);
			for (const url of ['/clients/:id/transactions', '/clients/:id/payments', '/clients/:id/tickets']) {
				expect(perms(rec, 'GET', url)).to.deep.equal([['read', 'clients']]);
			}
			expect(perms(collect(boutiqueManagerRoute), 'GET', '/boutique-managers/admin')).to.deep.equal([['read', 'pros']]);
		});

		it("la trace d'export est ouverte à tout admin, lecture seule comprise", () => {
			const route = collect(auditRoute).find((r) => r.method === 'POST' && r.url === '/audit/export');
			expect(route.preHandler).to.equal(TokenMiddleware.verifyAdmin);
			expect(route.config?.allowReadOnly).to.equal(true);
		});
	});
});
