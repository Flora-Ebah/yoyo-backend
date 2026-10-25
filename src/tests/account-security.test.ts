import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import coddyger, { env } from 'coddyger';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ClientSet } from '../modules/client/client.model';
import { PartnerSet } from '../modules/partner/partner.model';
import { LoginSet } from '../modules/login/login.model';
import { TokenSet } from '../shared';
import { AdminModel } from '../modules/admin/admin.model';
import { ProfileSet } from '../modules/profile';
import { AccountBlockSet, AccountBlockService, blockedLoginMessage } from '../modules/account-block';
import { AdminAuthService, MAX_CODE_ATTEMPTS, MAX_FAILED_LOGINS } from '../modules/admin/admin-auth.service';
import { MainController } from '../modules/main/main.controller';
import { TokenMiddleware } from '../api/middleware';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { EmailService } from '../services/notification';

/**
 * Lot 2 de la feuille CMS : blocage des comptes (n°2), connexion au CMS en deux étapes (n°10),
 * profil « Lecture seule » (n°8) et renouvellement de session (failles corrigées).
 */
describe('Comptes : blocage, 2FA admin et sessions', () => {
	let mongod: MongoMemoryServer;
	const model = (Set: any) => (new Set() as any).defaultModel;
	let seq = 0;
	let sentCodes: string[] = [];

	const newClient = async (extra: any = {}) =>
		model(ClientSet).create({
			_id: new mongoose.Types.ObjectId(),
			email: `b${++seq}@yoyo.ci`,
			contact: `07300${String(seq).padStart(5, '0')}`,
			status: 'active',
			password: 'hash',
			firstname: 'Awa',
			lastname: 'Koné',
			...extra
		});

	// Boutique minimale : insérée sans la validation du modèle (champs métier hors sujet ici).
	const newShop = async (user: any, status: string) => {
		const _id = new mongoose.Types.ObjectId();
		await model(PartnerSet).collection.insertOne({ _id, name: 'Boutique', user, status });
		return { _id };
	};

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-account-security' });
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [ClientSet, PartnerSet, LoginSet, TokenSet, AccountBlockSet, ProfileSet]) {
			await model(Set).deleteMany({});
		}
		await AdminModel.deleteMany({});
		sentCodes = [];
		sinon.stub(PushNotificationService.prototype, 'create').resolves({} as any);
		sinon.stub(EmailService.prototype, 'send').resolves({ success: true, message: 'ok' } as any);
		sinon.stub(EmailService.prototype, 'sendOtpEmail').callsFake(async (_email: string, code: string) => {
			sentCodes.push(code);
			return { success: true, message: 'ok' };
		});
		sinon.stub(console, 'log');
	});

	afterEach(() => sinon.restore());

	describe('Blocage (n°2)', () => {
		const service = new AccountBlockService();
		const adminId = String(new mongoose.Types.ObjectId());

		it('bloque : statut suspendu, sessions révoquées, boutiques actives suspendues, historique', async () => {
			const client = await newClient({ isPartner: true });
			await model(LoginSet).create({ _id: new mongoose.Types.ObjectId(), user: client._id, success: true, token: 'jeton-actif', status: 'active' });
			const shop = await newShop(client._id, 'active');
			const closed = await newShop(client._id, 'inactive');

			const res = await service.block(String(client._id), { reason: 'Fraude au scan', days: 7 }, adminId);

			expect(res.status).to.equal(200);
			const saved: any = await model(ClientSet).findById(client._id).lean();
			expect(saved.status).to.equal('suspended');
			expect(saved.statusBeforeBlock).to.equal('active');
			expect(saved.block.reason).to.equal('Fraude au scan');
			expect(new Date(saved.block.until).getTime()).to.be.greaterThan(Date.now() + 6 * 86_400_000);
			expect(await TokenMiddleware.isTokenDeactivated('jeton-actif')).to.equal(true);
			expect((await model(LoginSet).findOne({ token: 'jeton-actif' }).lean()).status).to.equal('ended');
			expect((await model(PartnerSet).findById(shop._id).lean()).status).to.equal('suspended');
			expect((await model(PartnerSet).findById(closed._id).lean()).status).to.equal('inactive');
			expect(await model(AccountBlockSet).countDocuments({ user: client._id, action: 'block' })).to.equal(1);
		});

		it('débloque : statut d’origine rendu, seules les boutiques suspendues par le blocage reviennent', async () => {
			const client = await newClient({ isPartner: true });
			const shop = await newShop(client._id, 'active');
			await service.block(String(client._id), { reason: 'Contrôle', days: null }, adminId);
			// Suspendue à la main pendant le blocage : ne doit pas revenir.
			const manual = await newShop(client._id, 'suspended');

			const res = await service.unblock(String(client._id), adminId);

			expect(res.status).to.equal(200);
			const saved: any = await model(ClientSet).findById(client._id).lean();
			expect(saved.status).to.equal('active');
			expect(saved.block).to.equal(undefined);
			expect((await model(PartnerSet).findById(shop._id).lean()).status).to.equal('active');
			expect((await model(PartnerSet).findById(manual._id).lean()).status).to.equal('suspended');
			expect((await service.unblock(String(client._id), adminId)).status).to.equal(400);
		});

		it('fin automatique : seuls les blocages échus sont levés', async () => {
			const due = await newClient();
			const later = await newClient();
			const forever = await newClient();
			await service.block(String(due._id), { reason: 'Test', days: 1 }, adminId);
			await service.block(String(later._id), { reason: 'Test', days: 30 }, adminId);
			await service.block(String(forever._id), { reason: 'Test', days: null }, adminId);

			const count = await service.expireBlocks(new Date(Date.now() + 2 * 86_400_000));

			expect(count).to.equal(1);
			expect((await model(ClientSet).findById(due._id).lean()).status).to.equal('active');
			expect((await model(ClientSet).findById(later._id).lean()).status).to.equal('suspended');
			expect((await model(ClientSet).findById(forever._id).lean()).status).to.equal('suspended');
			expect(await model(AccountBlockSet).countDocuments({ user: due._id, action: 'unblock', auto: true })).to.equal(1);
		});

		it('refuse un motif vide et une durée invalide', async () => {
			const client = await newClient();
			expect((await service.block(String(client._id), { reason: ' ', days: 1 }, adminId)).status).to.equal(400);
			expect((await service.block(String(client._id), { reason: 'Motif', days: 0 }, adminId)).status).to.equal(400);
		});

		it('message de connexion : date de fin, ou blocage définitif', () => {
			expect(blockedLoginMessage({ block: { until: new Date('2026-11-01T10:30:00Z') } })).to.contain('01/11/2026');
			expect(blockedLoginMessage({ block: { until: null } })).to.equal('Compte suspendu. Pour contester, écrivez au support YoYo.');
		});
	});

	describe('Connexion au CMS (n°10)', () => {
		const auth = new AdminAuthService();

		const newAdmin = async (extra: any = {}) => {
			const profile = await model(ProfileSet).create({
				_id: new mongoose.Types.ObjectId(),
				slug: `PRF-${++seq}`,
				name: 'Support',
				ability: [{ name: 'Assistance', subject: 'support', action: 'read' }],
				status: 'active'
			});
			return AdminModel.create({
				_id: new mongoose.Types.ObjectId(),
				email: `admin${++seq}@yoyo.ci`,
				password: await coddyger.string.encryptPassword('Secret#2026'),
				status: 'active',
				profile: profile._id,
				...extra
			} as any);
		};

		it('mot de passe correct : pas de jeton, un code et un challenge', async () => {
			const admin = await newAdmin();
			const res = await auth.login(admin.email!, 'Secret#2026');

			expect(res.status).to.equal(200);
			expect(res.data.accessToken).to.equal(undefined);
			expect(res.data.challenge).to.be.a('string');
			expect(sentCodes).to.have.lengthOf(1);
			expect(sentCodes[0]).to.match(/^\d{6}$/);
		});

		it('même message pour un e-mail inconnu et un mauvais mot de passe', async () => {
			const admin = await newAdmin();
			const unknown = await auth.login('personne@yoyo.ci', 'x');
			const wrong = await auth.login(admin.email!, 'mauvais');
			expect(unknown.message).to.equal(wrong.message);
			expect(sentCodes).to.have.lengthOf(0);
		});

		it(`verrouille après ${MAX_FAILED_LOGINS} échecs, même avec le bon mot de passe ensuite`, async () => {
			const admin = await newAdmin();
			for (let i = 0; i < MAX_FAILED_LOGINS; i++) await auth.login(admin.email!, 'mauvais');
			const res = await auth.login(admin.email!, 'Secret#2026');
			expect(res.status).to.equal(400);
			expect(res.message).to.contain('Trop de tentatives');
			expect(sentCodes).to.have.lengthOf(0);
		});

		it('refuse un compte désactivé', async () => {
			const admin = await newAdmin({ status: 'archived' });
			const res = await auth.login(admin.email!, 'Secret#2026');
			expect(res.status).to.equal(400);
			expect(sentCodes).to.have.lengthOf(0);
		});

		it('bon code : jetons émis une seule fois, sans mot de passe dans la réponse', async () => {
			const admin = await newAdmin();
			const { data } = await auth.login(admin.email!, 'Secret#2026');

			const ok = await auth.verify(data.challenge, sentCodes[0]);
			expect(ok.status).to.equal(200);
			expect(ok.data.accessToken).to.be.a('string');
			expect(ok.data.user.password).to.equal(undefined);
			expect(ok.data.user.loginChallenge).to.equal(undefined);

			const replay = await auth.verify(data.challenge, sentCodes[0]);
			expect(replay.status).to.equal(400);
		});

		it(`code faux : ${MAX_CODE_ATTEMPTS} essais puis le challenge est annulé`, async () => {
			const admin = await newAdmin();
			const { data } = await auth.login(admin.email!, 'Secret#2026');
			const wrong = sentCodes[0] === '000000' ? '111111' : '000000';

			for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) {
				const res = await auth.verify(data.challenge, wrong);
				expect(res.message).to.contain('Code incorrect');
			}
			const last = await auth.verify(data.challenge, wrong);
			expect(last.data?.code).to.equal('CHALLENGE_EXPIRED');
			expect((await auth.verify(data.challenge, sentCodes[0])).status).to.equal(400);
		});

		it('challenge expiré ou d’un autre usage : refusé', async () => {
			const admin = await newAdmin();
			await auth.login(admin.email!, 'Secret#2026');
			const expired = jwt.sign({ sub: String(admin._id), nonce: 'x', purpose: 'admin-2fa' }, env.jwt.secretAuth!, { expiresIn: -10 });
			const otherUse = jwt.sign({ sub: String(admin._id), nonce: 'x' }, env.jwt.secretAuth!, { expiresIn: '5m' });
			expect((await auth.verify(expired, sentCodes[0])).data.code).to.equal('CHALLENGE_EXPIRED');
			expect((await auth.verify(otherUse, sentCodes[0])).data.code).to.equal('CHALLENGE_EXPIRED');
		});

		it('renvoi : délai d’attente, puis l’ancien code ne vaut plus', async () => {
			const admin = await newAdmin();
			const { data } = await auth.login(admin.email!, 'Secret#2026');
			expect((await auth.resend(data.challenge)).message).to.contain('Patientez');

			await AdminModel.updateOne({ _id: admin._id }, { $set: { 'loginChallenge.sentAt': new Date(Date.now() - 120_000) } });
			const res = await auth.resend(data.challenge);
			expect(res.status).to.equal(200);
			expect(sentCodes).to.have.lengthOf(2);
			if (sentCodes[0] !== sentCodes[1]) {
				expect((await auth.verify(data.challenge, sentCodes[0])).status).to.equal(400);
			}
			expect((await auth.verify(data.challenge, sentCodes[1])).status).to.equal(200);
		});

		it('déconnexion : le jeton rejoint la liste noire', async () => {
			await auth.logout('jeton-admin');
			expect(await TokenMiddleware.isTokenDeactivated('jeton-admin')).to.equal(true);
		});
	});

	describe('Renouvellement de session', () => {
		const controller = new MainController();

		it('refuse un jeton admin (le CMS repasse par le 2FA)', async () => {
			const res: any = await controller.verifyToken({ _id: String(new mongoose.Types.ObjectId()), isAdmin: true });
			expect(res.status).to.equal(401);
		});

		it('refuse un compte bloqué, renouvelle un compte actif', async () => {
			const blocked = await newClient({ status: 'suspended' });
			const active = await newClient();
			expect(((await controller.verifyToken({ _id: String(blocked._id) })) as any).status).to.equal(401);
			const ok: any = await controller.verifyToken({ _id: String(active._id) });
			expect(ok.status).to.equal(200);
			expect(ok.data.accessToken).to.be.a('string');
		});
	});

	describe('Profil « Lecture seule » (n°8)', () => {
		it('reconnu seulement quand toutes les permissions sont des lectures', () => {
			expect(TokenMiddleware.isReadOnly([{ subject: 'clients', action: 'read' }, { subject: 'audit', action: 'read' }])).to.equal(true);
			expect(TokenMiddleware.isReadOnly([{ subject: 'clients', action: 'read' }, { subject: 'transactions', action: 'update' }])).to.equal(false);
			expect(TokenMiddleware.isReadOnly([])).to.equal(false);
		});

		it('les guards RBAC portent le marqueur de route admin', () => {
			const guards: any[] = [
				TokenMiddleware.can('read', 'clients'),
				TokenMiddleware.canStrict('read', 'enrolments'),
				TokenMiddleware.canAny([['read', 'clients'], ['read', 'dashboard']])
			];
			guards.forEach((g) => expect(g.adminGuard).to.equal(true));
		});
	});
});
