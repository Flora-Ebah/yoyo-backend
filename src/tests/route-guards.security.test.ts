import { expect } from 'chai';
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
		 */
		it('impose une longueur minimale de mot de passe', () => {
			const body = find(routes, 'PUT', '/clients/updatePassword')!.schema.body;
			expect(body.properties.newPassword.minLength).to.be.at.least(8);
			expect(body.properties.confirmPassword.minLength).to.be.at.least(8);

			const selfBody = find(routes, 'PUT', '/clients/resetPassword/me')!.schema.body;
			expect(selfBody.properties.newPassword.minLength).to.be.at.least(8);
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
			expect(route.preHandler, 'doit rester appelable sans jeton').to.be.undefined;
			expect(route.config?.rateLimit?.max).to.be.a('number');
			expect(route.config.rateLimit.max).to.be.at.most(20);
		});

		it("F-04 — verify-login est la seule route du module sans garde", () => {
			const unguarded = routes
				.filter(route => !route.preHandler)
				.map(route => `${route.method} ${route.url}`);

			expect(unguarded).to.deep.equal(['POST /clients/verify-login']);
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
	 * [B-05 / F-08] La clé technique partagée par les 4 applications était placée en valeur par
	 * défaut du schéma : la documentation Swagger la publiait en clair.
	 */
	describe('B-05 / F-08 — Délivrance des jetons', () => {
		const routes = collectRoutes(mainRoute);

		it("la documentation ne publie plus la clé technique", () => {
			const body = find(routes, 'POST', '/get-token')!.schema.body;

			expect(body.properties.apikey).to.not.have.property('default');
			expect(JSON.stringify(body)).to.not.contain('TrQpAbG2tByxw0eS');
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
