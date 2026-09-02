import { expect } from 'chai';
import { AppCheckMiddleware, TokenMiddleware, matchesEnforcedRoute } from '../api/middleware';
import clientRoute from '../api/routes/client.route';
import loginRoute from '../api/routes/login.route';
import otpRoute from '../api/routes/otp.route';
import partnerRoute from '../api/routes/partner.route';

type RecordedRoute = { method: string; url: string; preHandler?: any };

const collectRoutes = (routeModule: any): RecordedRoute[] => {
	const routes: RecordedRoute[] = [];
	const fakeFastify = {
		route: (definition: any) =>
			routes.push({ method: definition.method, url: definition.url, preHandler: definition.preHandler }),
		// `partner.route.ts` enregistre un parseur de contenu (upload de photos de boutique) avant
		// de déclarer ses routes. Sans ce bouchon, le module lève avant d'en déclarer une seule.
		addContentTypeParser: () => undefined
	};

	routeModule(fakeFastify, {}, () => {});
	return routes;
};

const find = (routes: RecordedRoute[], method: string, url: string): RecordedRoute | undefined =>
	routes.find(route => route.method === method && route.url === url);

/** Normalise `preHandler`, qui peut être une fonction seule ou un tableau. */
const handlersOf = (route?: RecordedRoute): any[] => {
	if (!route || !route.preHandler) return [];
	return Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler];
};

/**
 * [App Check] L'attestation d'application couvre les routes qu'aucune identité utilisateur ne peut
 * protéger, parce qu'elles servent justement à s'inscrire ou à récupérer son accès. Elle remplace
 * la clé d'API partagée qui était codée en dur dans les binaires mobiles et s'en extrayait.
 *
 * Ces tests verrouillent deux propriétés :
 *  - la couverture : aucune route d'avant-connexion ne doit être oubliée ;
 *  - la nature du contrôle : App Check atteste l'**application**, jamais l'**utilisateur**. Il ne
 *    remplace donc jamais `TokenMiddleware.verify` là où celui-ci est présent, sous peine de
 *    reconstruire C-01 — un jeton d'application ouvrant toutes les routes.
 */
describe("[Sécurité] Attestation d'application (App Check)", () => {
	const clientRoutes = collectRoutes(clientRoute);
	const otpRoutes = collectRoutes(otpRoute);
	const loginRoutes = collectRoutes(loginRoute);
	const partnerRoutes = collectRoutes(partnerRoute);

	const preAuthRoutes: Array<[string, RecordedRoute[], string, string]> = [
		["inscription", clientRoutes, 'POST', '/clients/register'],
		["fin du parcours mot de passe oublié", clientRoutes, 'PUT', '/clients/updatePassword'],
		["oracle d'existence de compte", clientRoutes, 'POST', '/clients/verify-login'],
		["envoi d'un code OTP", otpRoutes, 'POST', '/otp/generate'],
		["vérification d'un code OTP", otpRoutes, 'POST', '/otp/verify'],
		['demande de réinitialisation', otpRoutes, 'POST', '/otp/password-reset/request'],
		['connexion', loginRoutes, 'POST', '/client/login'],
		// Arrivée avec l'onboarding marchand à distance (contrat du 28/08/2026). Le marchand enrôlé
		// par un commercial n'a ni session ni mot de passe : seul le jeton reçu par e-mail/SMS
		// l'autorise. C'est la définition même d'une route d'avant-connexion.
		["activation d'un compte marchand", partnerRoutes, 'POST', '/partners/activate']
	];

	/**
	 * Les deux routes du parcours « mot de passe oublié » dont la ré-exécution a une conséquence :
	 * l'une émet le `resetToken`, l'autre le consomme. Elles sont couvertes par la variante qui
	 * détecte le rejeu, pas par `verify`.
	 */
	const limitedUseRoutes: Array<[string, string]> = [
		['POST', '/otp/verify'],
		['PUT', '/clients/updatePassword']
	];

	const isLimitedUse = (method: string, url: string): boolean =>
		limitedUseRoutes.some(([m, u]) => m === method && u === url);

	preAuthRoutes.forEach(([label, routes, method, url]) => {
		it(`${method} ${url} (${label}) est couverte par l'attestation`, () => {
			const route = find(routes, method, url);
			expect(route, `route ${method} ${url} introuvable`).to.not.be.undefined;

			const expected = isLimitedUse(method, url)
				? AppCheckMiddleware.verifyLimitedUse
				: AppCheckMiddleware.verify;

			expect(handlersOf(route)).to.include(expected);
		});
	});

	/**
	 * [Anti-rejeu] Une attestation est un jeton signé : interceptée, elle reste rejouable jusqu'à
	 * son expiration. Sur ces deux routes, rejouer une requête capturée permettrait de refaire
	 * émettre un jeton de réinitialisation, ou de reposer un mot de passe. `verifyLimitedUse`
	 * demande à Google de marquer le jeton comme consommé et refuse toute seconde présentation.
	 */
	limitedUseRoutes.forEach(([method, url]) => {
		it(`${method} ${url} exige un jeton d'attestation à usage unique`, () => {
			const routes = url.startsWith('/otp') ? otpRoutes : clientRoutes;
			const handlers = handlersOf(find(routes, method, url));

			expect(handlers, `${method} ${url} devrait porter verifyLimitedUse`).to.include(
				AppCheckMiddleware.verifyLimitedUse
			);
		});
	});

	/**
	 * La consommation coûte un aller-retour supplémentaire vers Google et interdit toute mise en
	 * cache du jeton côté client. Elle ne doit donc pas déborder sur les routes où elle serait
	 * payée sans contrepartie : rejouer une inscription ou une demande d'OTP ne donne rien à
	 * l'attaquant.
	 */
	it("n'impose pas de jeton à usage unique aux routes qui n'en ont pas besoin", () => {
		preAuthRoutes
			.filter(([, , method, url]) => !isLimitedUse(method, url))
			.forEach(([, routes, method, url]) => {
				const handlers = handlersOf(find(routes, method, url));

				expect(handlers, `${method} ${url} ne devrait pas consommer de jeton`).to.not.include(
					AppCheckMiddleware.verifyLimitedUse
				);
			});
	});

	/**
	 * [C-01, 02/09/2026] Le jeton que ces routes exigeaient n'était pas celui d'un utilisateur.
	 *
	 * C'était le **jeton public** : `POST /get-token` l'échangeait contre une clé en dur dans les
	 * binaires, et sa charge utile ne désignait personne. Sa présence en `preHandler` donnait
	 * l'apparence d'une route authentifiée alors qu'elle était ouverte à quiconque décompilait
	 * l'application — et le handler d'inscription lisait `request.user._id` sur un jeton qui n'en
	 * a jamais porté, donc toujours `undefined`.
	 *
	 * Ces routes n'ont plus de `TokenMiddleware.verify` : elles servent à s'inscrire, se connecter
	 * ou récupérer son accès, donc à un moment où l'appelant n'a par construction aucun compte.
	 * L'attestation d'application les garde seule.
	 */
	it("n'exige plus le jeton public sur les routes d'avant-connexion", () => {
		preAuthRoutes.forEach(([label, routes, method, url]) => {
			const handlers = handlersOf(find(routes, method, url));

			expect(handlers, `${method} ${url} (${label}) exige encore un jeton`).to.not.include(
				TokenMiddleware.verify
			);
		});
	});

	/**
	 * Le pendant du test précédent, et le point le plus important du lot : App Check ne dit pas
	 * *qui* appelle. Là où une identité utilisateur est nécessaire, l'attestation ne la remplace
	 * pas — sinon on reconstruirait C-01, un laissez-passer d'application ouvrant les données de
	 * tout le monde.
	 */
	it("n'a évincé la vérification du jeton d'aucune route nominative", () => {
		const routesNominatives: Array<[RecordedRoute[], string, string]> = [
			[clientRoutes, 'PUT', '/clients/me'],
			[clientRoutes, 'PUT', '/clients/resetPassword/me'],
			[clientRoutes, 'GET', '/clients/me'],
			[loginRoutes, 'POST', '/client/logout'],
			[loginRoutes, 'GET', '/client/logins/me']
		];

		routesNominatives.forEach(([routes, method, url]) => {
			const handlers = handlersOf(find(routes, method, url));
			expect(handlers, `${method} ${url} a perdu sa vérification de jeton`).to.include(
				TokenMiddleware.verify
			);
		});
	});

	/**
	 * `verify-login` (F-04) et `partners/activate` sont les deux routes qui n'ont **jamais** porté
	 * de jeton, même public. La première est un oracle d'énumération que seule l'attestation peut
	 * fermer ; la seconde est autorisée par le jeton d'activation de son corps de requête, à usage
	 * unique et expirant. Elles étaient la préfiguration de ce que sont devenues les six autres.
	 */
	it("garde par la seule attestation les routes qui n'ont jamais eu de jeton", () => {
		[
			handlersOf(find(clientRoutes, 'POST', '/clients/verify-login')),
			handlersOf(find(partnerRoutes, 'POST', '/partners/activate'))
		].forEach(handlers => {
			expect(handlers).to.include(AppCheckMiddleware.verify);
			expect(handlers).to.not.include(TokenMiddleware.verify);
		});
	});

	/**
	 * [Déploiement progressif] `APP_CHECK_ENFORCE` est global : il attend que la dernière
	 * application ait migré. `APP_CHECK_ENFORCE_ROUTES` permet de fermer les routes qu'aucune
	 * application en retard n'appelle, sans attendre.
	 *
	 * La correspondance se fait par fragment, parce que la liste porte des chemins courts alors
	 * que Fastify expose l'URL préfixée. C'est commode et c'est exactement pour cela que ça mérite
	 * un test : un fragment trop court fermerait des routes qu'on ne visait pas.
	 */
	describe('Rejet anticipé, route par route', () => {
		it('reconnaît une route malgré le préfixe de montage', () => {
			expect(matchesEnforcedRoute('/v1/yoyo/clients/register', ['/clients/register'])).to.be.true;
		});

		it('ignore la casse', () => {
			expect(matchesEnforcedRoute('/v1/yoyo/clients/updatePassword', ['/clients/updatepassword'])).to.be.true;
		});

		it('ne ferme rien quand la liste est vide', () => {
			expect(matchesEnforcedRoute('/v1/yoyo/clients/register', [])).to.be.false;
		});

		it("ne ferme pas une route absente de la liste", () => {
			expect(matchesEnforcedRoute('/v1/yoyo/client/login', ['/clients/register', '/otp/verify'])).to.be.false;
		});

		/**
		 * Le risque propre au filtrage par fragment : `/otp/verify` ne doit pas emporter
		 * `/otp/verify-something`, et surtout `/client/login` et `/clients/...` sont deux préfixes
		 * distincts qu'une correspondance approximative confondrait.
		 */
		it('ne déborde pas sur une route au chemin voisin', () => {
			expect(matchesEnforcedRoute('/v1/yoyo/clients/verify-login', ['/client/login'])).to.be.false;
			expect(matchesEnforcedRoute('/v1/yoyo/otp/password-reset/request', ['/otp/verify'])).to.be.false;
		});

		it('accepte plusieurs routes à la fois', () => {
			const patterns = ['/clients/verify-login', '/otp/password-reset/request'];

			expect(matchesEnforcedRoute('/v1/yoyo/clients/verify-login', patterns)).to.be.true;
			expect(matchesEnforcedRoute('/v1/yoyo/otp/password-reset/request', patterns)).to.be.true;
			expect(matchesEnforcedRoute('/v1/yoyo/clients/register', patterns)).to.be.false;
		});
	});

	/**
	 * Là où l'attestation cohabite avec un autre contrôle, elle passe en premier : inutile
	 * d'interroger la base pour une requête dont on va refuser l'origine. Aucune des 8 routes
	 * d'avant-connexion n'est dans ce cas depuis C-01, mais la propriété doit tenir pour celles
	 * qui le deviendraient.
	 */
	it("place l'attestation en tête des preHandlers", () => {
		preAuthRoutes.forEach(([label, routes, method, url]) => {
			const handlers = handlersOf(find(routes, method, url));
			const attestations = [AppCheckMiddleware.verify, AppCheckMiddleware.verifyLimitedUse];

			expect(attestations, `${method} ${url} (${label}) n'ouvre pas par une attestation`).to.include(
				handlers[0]
			);
		});
	});
});
