import { expect } from 'chai';
import sinon from 'sinon';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { TokenMiddleware } from '../api/middleware';
import deviceTokenRoute from '../api/routes/device-token.route';
import broadcastRoute from '../api/routes/notification-broadcast.route';
import pushNotificationRoute from '../api/routes/push-notification.route';
import { DeviceTokenService } from '../modules/device-token/device-token.service';
import { DeviceTokenSet } from '../modules/device-token/device-token.model';
import { FcmService } from '../services/notification/fcm.service';
import { notificationManager } from '../services/notification';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { Events } from '../modules/push-notification/push-notification.model';
import { NotificationBroadcastService, BROADCAST_HOURLY_LIMIT } from '../modules/notification-broadcast/notification-broadcast.service';
import { ClientSet } from '../modules/client/client.model';
import { PartnerSet } from '../modules/partner/partner.model';
import { SubscriptionSet } from '../modules/subscription/subscription.model';
import { BoutiqueManagerSet } from '../modules/boutique-manager/boutique-manager.model';
import { NotificationSet } from '../modules/notification';

/**
 * Push FCM (Android + iOS) : jetons d'appareils, envoi via `PushNotificationService`, gérants,
 * segments de diffusion du CMS (Excel CMS n°15) et garde-fous. `getMessaging` est simulé.
 */
describe('Push FCM et diffusions CMS', () => {
	let mongod: MongoMemoryServer;
	let multicast: sinon.SinonStub;

	const OWNER = '507f1f77bcf86cd799439101';
	const MANAGER = '507f1f77bcf86cd799439102';
	const CLIENT_A = '507f1f77bcf86cd799439103';
	const CLIENT_B = '507f1f77bcf86cd799439104';
	const BOUTIQUE = '507f1f77bcf86cd799439105';
	const PLAN = '507f1f77bcf86cd799439106';
	const TOKEN = (name: string) => `tok-${name}-${'x'.repeat(30)}`;

	const oid = (id: string) => new mongoose.Types.ObjectId(id);
	const model = (Set: any) => (new Set() as any).defaultModel;
	const sentTokens = (): string[] => multicast.getCalls().flatMap(c => c.args[0].tokens);

	before(async () => {
		mongod = await MongoMemoryServer.create();
		await mongoose.connect(mongod.getUri(), { dbName: 'yoyo-test-push-fcm' });
	});

	after(async () => {
		await mongoose.disconnect();
		await mongod.stop();
	});

	beforeEach(async () => {
		for (const Set of [DeviceTokenSet, ClientSet, PartnerSet, SubscriptionSet, BoutiqueManagerSet, NotificationSet]) {
			await model(Set).deleteMany({});
		}
		const base = { email: 'x@yoyo.ci', status: 'active', password: 'hash', firstname: 'Test', lastname: 'YoYo' };
		await model(ClientSet).create([
			{ _id: oid(OWNER), ...base, email: 'owner@yoyo.ci', isPartner: true },
			{ _id: oid(MANAGER), ...base, email: 'manager@yoyo.ci', isManager: true },
			{ _id: oid(CLIENT_A), ...base, email: 'a@yoyo.ci', isPartner: false },
			{
				_id: oid(CLIENT_B),
				...base,
				email: 'b@yoyo.ci',
				isPartner: false,
				notificationPreferences: { types: { news: false } }
			}
		]);
		await model(PartnerSet).create({
			_id: oid(BOUTIQUE),
			name: 'Boutique Abidjan',
			slug: 'boutique-abidjan',
			status: 'active',
			user: oid(OWNER),
			ville: 'Abidjan'
		});
		await model(BoutiqueManagerSet).create({
			_id: new mongoose.Types.ObjectId(),
			boutique: oid(BOUTIQUE),
			owner: oid(OWNER),
			manager: oid(MANAGER),
			managerName: 'Gérant',
			managerPhone: '0700000000',
			status: 'active'
		});

		const tokens = new DeviceTokenService();
		await tokens.register(OWNER, { token: TOKEN('owner-pro'), app: 'pro', platform: 'android' });
		await tokens.register(OWNER, { token: TOKEN('owner-client'), app: 'client', platform: 'ios' });
		await tokens.register(MANAGER, { token: TOKEN('manager-pro'), app: 'pro', platform: 'ios' });
		await tokens.register(CLIENT_A, { token: TOKEN('a'), app: 'client', platform: 'android' });
		await tokens.register(CLIENT_B, { token: TOKEN('b'), app: 'client', platform: 'android' });

		multicast = sinon.stub().callsFake(async (message: any) => ({
			successCount: message.tokens.length,
			failureCount: 0,
			responses: message.tokens.map(() => ({ success: true }))
		}));
		sinon.stub(FcmService.prototype as any, 'messaging').returns({ sendEachForMulticast: multicast });
		// Le socket n'existe pas en test : on simule l'acheminement temps réel.
		sinon.stub(notificationManager, 'sendNotification').resolves({ success: true } as any);
	});

	afterEach(() => sinon.restore());

	describe('Jetons d’appareils', () => {
		it('réattribue un jeton au dernier compte connecté sur l’appareil', async () => {
			await new DeviceTokenService().register(CLIENT_A, { token: TOKEN('owner-pro'), app: 'pro', platform: 'android' });
			const rows: any[] = await model(DeviceTokenSet).find({ token: TOKEN('owner-pro') }).lean();
			expect(rows).to.have.length(1);
			expect(String(rows[0].user)).to.equal(CLIENT_A);
		});

		it('ne retire un jeton que pour son propriétaire', async () => {
			const service = new DeviceTokenService();
			expect(await service.unregister(CLIENT_A, TOKEN('owner-pro'))).to.equal(false);
			expect(await service.unregister(OWNER, TOKEN('owner-pro'))).to.equal(true);
		});

		it('purge les appareils inactifs depuis plus de 60 jours', async () => {
			await model(DeviceTokenSet).updateOne({ token: TOKEN('a') }, { $set: { lastSeenAt: new Date('2020-01-01') } });
			expect(await new DeviceTokenService().purgeStale()).to.equal(1);
		});
	});

	describe('Envoi via PushNotificationService', () => {
		it('demande de réduction : Pro du propriétaire ET du gérant, jamais l’appli Client', async () => {
			await new PushNotificationService().create({
				title: 'Réduction validée',
				body: 'Une réduction vient d’être validée',
				data: { userId: OWNER, boutiqueId: BOUTIQUE, demand: 'd1', url: '/payment/d1' },
				target: Events.PUSH_DEMANDE,
				status: 'pending'
			} as any);

			expect(sentTokens()).to.have.members([TOKEN('owner-pro'), TOKEN('manager-pro')]);
			const message = multicast.firstCall.args[0];
			expect(message.data).to.include({ event: Events.PUSH_DEMANDE, boutiqueId: BOUTIQUE, demand: 'd1' });
			expect(message.android.notification.channelId).to.equal('default');
		});

		it('proximité : pas de push FCM (la tâche de fond du Client l’affiche déjà)', async () => {
			await new PushNotificationService().create({
				title: 'Une bonne affaire près de vous',
				body: 'Boutique proche',
				data: { userId: CLIENT_A, kind: 'proximity', partnerId: BOUTIQUE },
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as any);
			expect(multicast.called).to.equal(false);
		});

		it('notification ciblée sans destinataire : aucune push FCM (jamais « tous » par défaut)', async () => {
			await new PushNotificationService().create({
				title: 'Statut de la demande',
				body: 'Sans userId',
				data: { demand: 'd1' },
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as any);
			expect(multicast.called).to.equal(false);
		});

		it('compte supprimé ou anonymisé : ses appareils ne reçoivent plus rien', async () => {
			await model(ClientSet).updateOne({ _id: oid(CLIENT_A) }, { status: 'anonymized' });
			await new FcmService().sendToUsers('all', { title: 't', body: 'b' }, { app: 'client' });
			expect(sentTokens()).to.not.include(TOKEN('a'));
			expect(sentTokens()).to.include(TOKEN('b'));
		});

		it('notification de groupe : seulement les destinataires listés', async () => {
			await new PushNotificationService().publishFromAdmin({ message: 'Bonjour', to: [CLIENT_A] });
			expect(sentTokens()).to.deep.equal([TOKEN('a')]);
		});

		it('supprime un jeton que FCM déclare invalide', async () => {
			multicast.callsFake(async (message: any) => ({
				successCount: 0,
				failureCount: message.tokens.length,
				responses: message.tokens.map(() => ({
					success: false,
					error: { code: 'messaging/registration-token-not-registered' }
				}))
			}));
			await new FcmService().sendToUsers([CLIENT_A], { title: 't', body: 'b' });
			expect(await model(DeviceTokenSet).countDocuments({ token: TOKEN('a') })).to.equal(0);
		});

		it('diffusion éditoriale : respecte la désactivation des actualités', async () => {
			await new FcmService().sendToUsers([CLIENT_A, CLIENT_B], { title: 't', body: 'b' }, { editorial: true });
			expect(sentTokens()).to.deep.equal([TOKEN('a')]);
		});

		it('sans configuration Firebase, n’envoie rien et ne lève pas', async () => {
			(FcmService.prototype as any).messaging.returns(null);
			const result = await new FcmService().sendToUsers([CLIENT_A], { title: 't', body: 'b' });
			expect(result.skipped).to.equal(true);
		});
	});

	describe('Segments de diffusion du CMS', () => {
		const service = () => new NotificationBroadcastService();

		it('clients : exclut marchands et gérants', async () => {
			expect(await service().recipients({ segment: 'clients' })).to.have.members([CLIENT_A, CLIENT_B]);
		});

		it('clients abonnés actifs, au plan choisi', async () => {
			await model(SubscriptionSet).create({
				_id: new mongoose.Types.ObjectId(),
				userId: oid(CLIENT_A),
				planId: oid(PLAN),
				price: 2000,
				currency: 'XOF',
				status: 'active',
				startDate: new Date(),
				endDate: new Date(Date.now() + 86400000)
			});
			expect(await service().recipients({ segment: 'clients', planId: PLAN })).to.deep.equal([CLIENT_A]);
			expect(await service().recipients({ segment: 'clients', subscription: 'none' })).to.deep.equal([CLIENT_B]);
		});

		it('marchands par ville : propriétaire + gérants actifs', async () => {
			expect(await service().recipients({ segment: 'partners', ville: 'abidjan' })).to.have.members([OWNER, MANAGER]);
			expect(await service().recipients({ segment: 'partners', ville: 'Bouaké' })).to.deep.equal([]);
		});

		it('aperçu : renvoie le nombre de destinataires', async () => {
			expect(await service().preview({ segment: 'partners' })).to.deep.equal({ recipients: 2 });
		});

		it(`refuse au-delà de ${BROADCAST_HOURLY_LIMIT} diffusions par heure`, async () => {
			for (let i = 0; i < BROADCAST_HOURLY_LIMIT; i++) {
				const result = await service().broadcast({ segment: 'clients', category: 'INFO', message: `n°${i}` });
				expect(result.limited).to.equal(undefined);
			}
			const blocked = await service().broadcast({ segment: 'clients', category: 'INFO', message: 'trop' });
			expect(blocked.limited).to.equal(true);
		});
	});

	describe('Gardes des routes', () => {
		const collect = (routeModule: any) => {
			const routes: any[] = [];
			routeModule({ route: (definition: any) => routes.push(definition) }, {}, () => {});
			return routes;
		};

		it('jetons push : utilisateur connecté requis', () => {
			const routes = collect(deviceTokenRoute);
			expect(routes.map(r => r.method)).to.have.members(['POST', 'DELETE']);
			routes.forEach(r => expect(r.preHandler).to.equal(TokenMiddleware.verify));
		});

		it('diffusion et aperçu : administrateur requis', () => {
			const routes = collect(broadcastRoute);
			expect(routes).to.have.length(2);
			routes.forEach(r => expect(r.preHandler).to.equal(TokenMiddleware.verifyAdmin));
		});

		it('notifications : création, liste globale, lecture et modification par ID réservées aux administrateurs', () => {
			const routes = collect(pushNotificationRoute);
			const guard = (method: string, url: string) => routes.find(r => r.method === method && r.url === url)?.preHandler;
			expect(guard('POST', '/push-notifications')).to.equal(TokenMiddleware.verifyAdmin);
			expect(guard('GET', '/push-notifications')).to.equal(TokenMiddleware.verifyAdmin);
			expect(guard('GET', '/push-notifications/:id')).to.equal(TokenMiddleware.verifyAdmin);
			expect(guard('PUT', '/push-notifications/:id')).to.equal(TokenMiddleware.verifyAdmin);
			// Utilisées par l'appli Client pour ses propres notifications.
			expect(guard('GET', '/push-notifications/me')).to.equal(TokenMiddleware.verify);
		});
	});
});
