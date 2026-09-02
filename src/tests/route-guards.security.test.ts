import { expect } from 'chai';
import sinon from 'sinon';
import { TokenMiddleware, PaymentNotifyMiddleware } from '../api/middleware';
import categoryRoute from '../api/routes/category.route';
import certificationRoute from '../api/routes/certification.route';
import clientRoute from '../api/routes/client.route';
import mainRoute from '../api/routes/main.route';
import otpRoute from '../api/routes/otp.route';
import paymentMethodRoute from '../api/routes/payment-method.route';
import { PAYMENT_METHOD_SECRET_PROJECTION } from '../modules/payment-method/payment-method.model';
import profileRoute from '../api/routes/profile.route';
import transactionRoute from '../api/routes/transaction.route';

type RecordedRoute = { method: string; url: string; preHandler?: any; schema?: any; config?: any };

/**
 * Enregistre un module de routes contre un faux Fastify afin d'inspecter les gardes déclarés,
 * sans démarrer de serveur ni de base de données.
 */
const collectRoutes = (routeModule: any): RecordedRoute[] => {
	const routes: RecordedRoute[] = [];
	const fakeFastify = {
		route: (definition: any) =>
			routes.push({
				method: definition.method,
				url: definition.url,
				preHandler: definition.preHandler,
				schema: definition.schema,
				config: definition.config
			})
	};

	routeModule(fakeFastify, {}, () => {});
	return routes;
};

const find = (routes: RecordedRoute[], method: string, url: string): RecordedRoute | undefined =>
	routes.find(route => route.method === method && route.url === url);

describe('[Sécurité] Gardes des routes', () => {
	/**
	 * [F-02] Avant correctif, les 13 routes de certification étaient en `TokenMiddleware.verify`.
	 * Tout utilisateur connecté pouvait donc valider sa propre pièce d'identité et lister les
	 * dossiers de tous les clients (PII).
	 */
	describe('F-02 — Certification (KYC)', () => {
		const routes = collectRoutes(certificationRoute);

		const moderationRoutes: Array<[string, string]> = [
			['PUT', '/certification'],
			['GET', '/certification'],
			['GET', '/certification/findByStatus'],
			['GET', '/certification/details/:id'],
			['DELETE', '/certification/remove/:id'],
			['DELETE', '/certification/erase/:id'],
			['PUT', '/certification/restore/:id']
		];

		moderationRoutes.forEach(([method, url]) => {
			it(`${method} ${url} est réservée aux administrateurs`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verifyAdmin);
			});
		});

		const clientRoutes: Array<[string, string]> = [
			['POST', '/certification'],
			['GET', '/certification/me'],
			['PUT', '/certification/complete-phone-verification'],
			['GET', '/certification/document-types'],
			['GET', '/certification/rejection-reasons'],
			['GET', '/certification/verification-statuses']
		];

		clientRoutes.forEach(([method, url]) => {
			it(`${method} ${url} reste accessible au client connecté`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verify);
			});
		});

		it('aucune route de certification n\'est laissée sans garde', () => {
			const unguarded = routes.filter(route => !route.preHandler);
			expect(unguarded.map(r => `${r.method} ${r.url}`)).to.deep.equal([]);
		});
	});

	/**
	 * [F-01] Avant correctif, `payment-webhook`, `payment-callback` et `payment-notify` étaient
	 * déclarées sans aucun `preHandler` : une requête forgée activait un abonnement.
	 */
	describe('F-01 — Transactions', () => {
		const routes = collectRoutes(transactionRoute);

		it('aucune route de transaction n\'est laissée sans garde', () => {
			const unguarded = routes.filter(route => !route.preHandler);
			expect(unguarded.map(r => `${r.method} ${r.url}`)).to.deep.equal([]);
		});

		it('les webhooks non authentifiés ont été supprimés', () => {
			expect(find(routes, 'POST', '/transactions/payment-webhook')).to.be.undefined;
			expect(find(routes, 'POST', '/transactions/payment-callback')).to.be.undefined;
		});

		it('payment-notify est filtrée par le middleware dédié', () => {
			const route = find(routes, 'POST', '/transactions/payment-notify');
			expect(route).to.not.be.undefined;
			expect(route!.preHandler).to.equal(PaymentNotifyMiddleware.verifySource);
		});

		it('les routes de pilotage restent réservées aux administrateurs', () => {
			expect(find(routes, 'PUT', '/transactions/update-status')!.preHandler)
				.to.equal(TokenMiddleware.verifyAdmin);
			expect(find(routes, 'GET', '/transactions/stats')!.preHandler)
				.to.equal(TokenMiddleware.verifyAdmin);
		});
	});

	/**
	 * [F-03] Avant correctif, toute route désignant sa cible par un identifiant fourni par
	 * l'appelant était ouverte à n'importe quel compte connecté.
	 */
	describe('F-03 — Compte client', () => {
		const routes = collectRoutes(clientRoute);

		const adminRoutes: Array<[string, string]> = [
			['PUT', '/clients'],
			['PATCH', '/clients/remove/:id']
		];

		adminRoutes.forEach(([method, url]) => {
			it(`${method} ${url} désigne une cible et est réservée aux administrateurs`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verifyAdmin);
			});
		});

		const selfRoutes: Array<[string, string]> = [
			['PUT', '/clients/me'],
			['GET', '/clients/me'],
			['POST', '/clients/remove/me'],
			['PUT', '/clients/resetPassword/me'],
			['PATCH', '/clients/update-phone/me'],
			['PATCH', '/clients/update-email/me']
		];

		selfRoutes.forEach(([method, url]) => {
			it(`${method} ${url} reste accessible au client connecté`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verify);
			});
		});

		it("updatePassword n'accepte plus d'identifiant de compte dans le corps de la requête", () => {
			const route = find(routes, 'PUT', '/clients/updatePassword');
			expect(route).to.not.be.undefined;

			const body = route!.schema.body;
			expect(body.properties).to.not.have.property('_id');
			expect(body.required).to.include('resetToken');
			expect(body.additionalProperties).to.be.false;
		});

		/**
		 * Le contrôleur ne comparait que `newPassword` et `confirmPassword` : deux chaînes vides
		 * étant égales, le parcours acceptait de poser un mot de passe vide.
		 *
		 * Le seuil retenu est 6, la longueur du code que les applications Client et Partenaire
		 * font saisir au clavier numérique. Porté à 8, il fermait la réinitialisation à tous les
		 * comptes, puisque `POST /clients/register` les crée sans contrainte de longueur.
		 */
		it('impose une longueur minimale de mot de passe', () => {
			const body = find(routes, 'PUT', '/clients/updatePassword')!.schema.body;
			expect(body.properties.newPassword.minLength).to.equal(6);
			expect(body.properties.confirmPassword.minLength).to.equal(6);

			const selfBody = find(routes, 'PUT', '/clients/resetPassword/me')!.schema.body;
			expect(selfBody.properties.newPassword.minLength).to.equal(6);
		});

		/**
		 * `PUT /clients/me` était en `additionalProperties: true` : un client pouvait écrire
		 * n'importe quel champ du modèle sur son propre compte, dont `isCertified`, ce qui
		 * contournait la validation KYC verrouillée par F-02.
		 */
		it('la mise à jour de son propre compte est limitée à une liste blanche', () => {
			const route = find(routes, 'PUT', '/clients/me');
			const body = route!.schema.body;

			expect(body.additionalProperties).to.be.false;
			['isCertified', 'isDocumentVerified', 'status', 'isPartner', 'password', 'email'].forEach(
				field => expect(body.properties).to.not.have.property(field)
			);
		});

		/**
		 * [F-04] L'annuaire complet des clients (email, nom, prénom, téléphone) était accessible à
		 * tout compte connecté : fuite de la base clients, enjeu RGPD.
		 */
		const directoryRoutes: Array<[string, string]> = [
			['GET', '/clients'],
			['GET', '/clients/findByStatus'],
			['GET', '/clients/details/:id']
		];

		directoryRoutes.forEach(([method, url]) => {
			it(`F-04 — ${method} ${url} est réservée aux administrateurs`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verifyAdmin);
			});
		});

		/**
		 * `verify-login` doit rester ouverte : l'application Partenaire l'appelle avant connexion,
		 * donc sans jeton. Le plafond de débit est le seul frein à l'énumération de comptes — s'il
		 * disparaît, la faille revient en silence.
		 */
		it('F-04 — verify-login reste publique mais plafonnée en débit', () => {
			const route: any = find(routes, 'POST', '/clients/verify-login');
			expect(route).to.not.be.undefined;

			// La route porte désormais l'attestation d'application (App Check), qui n'exige aucun
			// compte : ce qui doit rester absent, c'est la vérification d'un **jeton utilisateur**.
			const handlers = Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler];
			expect(handlers, 'doit rester appelable sans jeton').to.not.include(TokenMiddleware.verify);
			expect(handlers, 'doit rester appelable sans jeton').to.not.include(TokenMiddleware.verifyAdmin);

			expect(route.config?.rateLimit?.max).to.be.a('number');
			expect(route.config.rateLimit.max).to.be.at.most(20);
		});

		/**
		 * [C-01, 02/09/2026] La liste s'est allongée de deux entrées, et c'est voulu.
		 *
		 * `register` et `updatePassword` réclamaient un jeton — mais le **jeton public**, obtenu
		 * contre une clé en dur dans les binaires. Elles avaient l'apparence de routes
		 * authentifiées sans l'être. Elles rejoignent `verify-login` dans la catégorie à laquelle
		 * elles ont toujours appartenu : les routes d'avant-connexion, gardées par l'attestation
		 * d'application (`app-check.security.test.ts`).
		 *
		 * Ce test reste utile en sens inverse : il verrouille la liste, pour qu'aucune route
		 * nominative n'y tombe par inadvertance.
		 */
		it("seules les routes d'avant-connexion sont sans jeton utilisateur", () => {
			const withoutUserToken = routes
				.filter(route => {
					const handlers = Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler];
					return !handlers.includes(TokenMiddleware.verify) && !handlers.includes(TokenMiddleware.verifyAdmin);
				})
				.map(route => `${route.method} ${route.url}`);

			expect(withoutUserToken).to.deep.equal([
				'POST /clients/register',
				'PUT /clients/updatePassword',
				'POST /clients/verify-login'
			]);
		});

		it('la suppression administrateur lit son motif dans le corps de la requête', () => {
			// Déclaré en `params`, `reason` était exigé dans l'URL : la validation échouait à chaque
			// appel alors que le gestionnaire le lit dans le corps.
			const route = find(routes, 'PATCH', '/clients/remove/:id');
			expect(route!.schema.params.required).to.deep.equal(['id']);
			expect(route!.schema.body.required).to.deep.equal(['reason']);
		});
	});

	/**
	 * Depuis F-03, `POST /otp/verify` émet le jeton qui autorise la réinitialisation d'un mot de
	 * passe : c'est le dernier obstacle avant une prise de contrôle de compte. Le quota de
	 * tentatives est appliqué dans le contrôleur ; ce plafond de débit ferme le balayage
	 * automatisé d'un code à 6 chiffres. S'il disparaît, la faille revient en silence.
	 */
	describe('OTP — Vérification du code', () => {
		const routes = collectRoutes(otpRoute);

		it('la vérification du code est plafonnée en débit', () => {
			const route: any = find(routes, 'POST', '/otp/verify');
			expect(route, 'route POST /otp/verify introuvable').to.not.be.undefined;
			expect(route.config?.rateLimit?.max).to.be.a('number');
			expect(route.config.rateLimit.max).to.be.at.most(20);
		});

		it("la réponse documentée n'expose plus l'identifiant du compte", () => {
			const response: any = find(routes, 'POST', '/otp/verify')!.schema.response;
			const data = response[200].properties.data;

			expect(data.properties).to.have.property('resetToken');
			expect(data.properties).to.not.have.property('userId');
		});
	});

	/**
	 * [F-05 / B-07] Les documents de ce module portent les identifiants des prestataires de paiement
	 * et le secret de signature des webhooks. Les 13 routes étaient en `TokenMiddleware.verify`,
	 * que le jeton public embarqué dans les applications mobiles franchit (C-01).
	 */
	describe('F-05 / B-07 — Configuration des prestataires de paiement', () => {
		const routes = collectRoutes(paymentMethodRoute);

		it('toutes les routes du module sont réservées aux administrateurs', () => {
			const nonAdmin = routes
				.filter(route => route.preHandler !== TokenMiddleware.verifyAdmin)
				.map(route => `${route.method} ${route.url}`);

			expect(nonAdmin).to.deep.equal([]);
		});

		/**
		 * Cette route existait pour renvoyer `apiConfig` tel quel — identifiants compris. Aucune
		 * application ne la consommait.
		 */
		it("la route qui servait la configuration des prestataires a été supprimée", () => {
			expect(find(routes, 'GET', '/payment-method/config/:id')).to.be.undefined;
		});

		it('les secrets sont exclus de toutes les lectures de la collection', () => {
			expect(PAYMENT_METHOD_SECRET_PROJECTION).to.contain('-apiConfig.credentials');
			expect(PAYMENT_METHOD_SECRET_PROJECTION).to.contain('-webhookConfig.secret');
		});
	});

	/**
	 * [C-01] La clé technique partagée par les 4 applications a d'abord cessé d'être **publiée**
	 * (B-05 : elle figurait en valeur par défaut du schéma, donc dans Swagger), puis d'**exister** :
	 * la route qui l'échangeait contre un jeton a été supprimée le 02/09/2026.
	 *
	 * Ce jeton était signé avec le secret des jetons utilisateur et ne désignait personne. Il
	 * franchissait `TokenMiddleware.verify` sur toutes les routes — c'est le mécanisme qui a rendu
	 * F-03 et F-05 exploitables sans compte.
	 */
	describe('C-01 — Délivrance des jetons publics', () => {
		const routes = collectRoutes(mainRoute);

		// La liste de révocation vit en base ; ces tests portent sur la **charge utile** du jeton,
		// pas sur son état de révocation. On neutralise donc la consultation.
		beforeEach(() => sinon.stub(TokenMiddleware, 'isTokenDeactivated').resolves(false));
		afterEach(() => sinon.restore());

		/** Réponse Fastify minimale : `coddyger.api` écrit dedans, on veut seulement savoir s'il l'a fait. */
		const fakeReply = () => {
			const state = { refused: false };
			const reply: any = {
				status: () => reply,
				code: () => reply,
				header: () => reply,
				send: () => {
					state.refused = true;
					return reply;
				}
			};

			return { reply, state };
		};

		it('la route qui échangeait la clé partagée contre un jeton a été supprimée', () => {
			expect(find(routes, 'POST', '/get-token')).to.be.undefined;
		});

		it("aucune route du module ne réclame plus de clé d'API", () => {
			expect(JSON.stringify(routes)).to.not.contain('apikey');
			expect(JSON.stringify(routes)).to.not.contain('TrQpAbG2tByxw0eS');
		});

		/**
		 * La suppression de la route ne révoque rien : la clé est dans l'historique Git et dans
		 * chaque binaire déjà publié, et les jetons émis restent valides jusqu'à leur expiration.
		 * C'est ce contrôle-ci qui les invalide, tous, immédiatement.
		 */
		it('un jeton sans `_id` est refusé par la vérification utilisateur', async () => {
			// La charge utile exacte que produisait `MainController.generateToken`.
			const token = TokenMiddleware.generate({ data: 'TrQpAbG2tByxw0eS', reg: new Date() }, 'accessToken');
			const request: any = { headers: { authorization: `Bearer ${token}` } };
			const { reply, state } = fakeReply();

			await TokenMiddleware.verify(request, reply, () => {});

			expect(request.user, "le jeton public ne doit jamais peupler `request.user`").to.be.undefined;
			expect(state.refused, 'la requête aurait dû être refusée').to.be.true;
		});

		it('un jeton nominatif reste accepté', async () => {
			const token = TokenMiddleware.generate({ _id: '507f1f77bcf86cd799439011', email: 'a@b.c' }, 'accessToken');
			const request: any = { headers: { authorization: `Bearer ${token}` } };
			const { reply, state } = fakeReply();

			await TokenMiddleware.verify(request, reply, () => {});

			expect(state.refused, 'un jeton nominatif ne doit pas être refusé').to.be.false;
			expect(request.user?._id).to.equal('507f1f77bcf86cd799439011');
		});
	});

	/**
	 * [Taxonomie] Les catégories classent les boutiques partenaires : `partner.categories` y fait
	 * référence, l'app Partenaire y puise sa liste de choix et l'app Client sa barre de filtres.
	 * L'écriture était en `TokenMiddleware.verify`, franchi par le jeton public embarqué dans les
	 * binaires mobiles : n'importe qui pouvait renommer ou supprimer une catégorie.
	 */
	describe('Catégories — écriture réservée aux administrateurs', () => {
		const routes = collectRoutes(categoryRoute);

		const writeRoutes: Array<[string, string]> = [
			['POST', '/category'],
			['PUT', '/category'],
			['DELETE', '/category/remove/:id']
		];

		writeRoutes.forEach(([method, url]) => {
			it(`${method} ${url} est réservée aux administrateurs`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verifyAdmin);
			});
		});

		/**
		 * Les deux applications mobiles lisent cette liste sans être administrateur : la
		 * verrouiller casserait la création de boutique et le filtrage des partenaires.
		 */
		const readRoutes: Array<[string, string]> = [
			['GET', '/category'],
			['GET', '/category/findByStatus'],
			['GET', '/category/details/:id']
		];

		readRoutes.forEach(([method, url]) => {
			it(`${method} ${url} reste lisible par les applications`, () => {
				const route = find(routes, method, url);
				expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;
				expect(route!.preHandler).to.equal(TokenMiddleware.verify);
			});
		});

		it("le rang d'affichage est modifiable via l'API", () => {
			expect(find(routes, 'POST', '/category')!.schema.body.properties).to.have.property('position');
			expect(find(routes, 'PUT', '/category')!.schema.body.properties).to.have.property('position');
		});

		/**
		 * Le service pagine par défaut à 10 : avec 13 catégories, un appel sans pagination
		 * tronquait la liste et rendait les dernières inatteignables dans les applications.
		 */
		it('la liste est triable et non tronquée par défaut', () => {
			const query = find(routes, 'GET', '/category')!.schema.query;

			expect(query.properties.sort.enum).to.include('position');
			expect(query.properties.sort.default).to.equal('position');
			expect(query.properties.orderBy.default).to.equal('asc');
		});
	});

	/**
	 * [B-04] Le module de gestion des droits était ouvert à tout compte connecté : n'importe quel
	 * client pouvait se créer un profil tout-pouvoir.
	 */
	describe('B-04 — Profils de droits (RBAC)', () => {
		const routes = collectRoutes(profileRoute);

		it('toutes les routes du module sont réservées aux administrateurs', () => {
			const nonAdmin = routes
				.filter(route => route.preHandler !== TokenMiddleware.verifyAdmin)
				.map(route => `${route.method} ${route.url}`);

			expect(nonAdmin).to.deep.equal([]);
		});

		it('le module expose bien les 6 routes attendues', () => {
			expect(routes).to.have.lengthOf(6);
		});
	});
});
