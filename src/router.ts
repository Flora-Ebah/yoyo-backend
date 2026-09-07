import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import fs from 'fs';
import coddyger, { defines, env } from 'coddyger';
import { swaggerConfig, swaggerUiConfig, isSwaggerEnabled } from './config/swagger.config';
import { FileUpload } from './api/middleware';
import { getSocketIO } from './main';

const packageJsonPath = path.join(__dirname, '.', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const prefix = `/${env.server.apiVersion}${env.server.serverPath}`;

export default class Router {
	public router: FastifyInstance;

	constructor(logger?: boolean) {
		this.router = Fastify({
			logger: logger ? { level: 'info' } : false, // Logging can be configured per your needs
			keepAliveTimeout: 45000, // Adjust based on your needs
			ignoreTrailingSlash: true
		});
		this.config();
		this.routes();
		this.notFoundHandler();
		this.errorHandling();
	}

	private config() {
		// Security: Helmet helps with setting various HTTP headers to secure your app
		this.router.register(helmet);

		// CORS: Enable CORS with specific origins and methods
		this.router.register(cors, {
			origin: env.server.origins.split(','),
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
			exposedHeaders: ['Content-Range', 'X-Content-Range'],
			credentials: true
		});

		// Rate Limiting: Prevent abuse by limiting the number of requests
		this.router.register(rateLimit, {
			max: 100, // Max requests per IP per time window
			timeWindow: '1 minute' // Time window for rate limiting
		});

		// Swagger: API documentation setup
		if (isSwaggerEnabled) {
			this.router.register(swagger, swaggerConfig);
			this.router.register(swaggerUI, swaggerUiConfig);
		}

		this.router.register(require('@fastify/multipart'), { addToBody: true });
		
		// Décorateur pour accéder à Socket.IO dans les routes
		this.router.decorateRequest('io', {
			getter: function() {
				const socketHelper = getSocketIO();
				return socketHelper ? socketHelper.getIo() : null;
			}
		});
	}

	private routes(): void {
		this.router.register(require('@fastify/static'), {
			root: FileUpload.uploadPath,
			prefix: prefix + '/file/'
			// constraints: { host: 'example.com' } // optional: default {}
		});
		// Assets publics des e-mails (logo, favicon…) : fichiers versionnés dans le dépôt
		// (`src/public/mail-template/images/`), servis en lecture seule. C'est la cible de
		// `MAIL_ASSETS_URL` (voir `email-theme.ts` → `logoSrc`), qui vaut donc `<host>${prefix}/assets`.
		// `decorateReply: false` est obligatoire : @fastify/static est déjà enregistré ci-dessus pour
		// `/file/` et il ne peut décorer `reply.sendFile` qu'une seule fois.
		this.router.register(require('@fastify/static'), {
			root: path.join(coddyger.root() + '/src/public/mail-template/images/'),
			prefix: prefix + '/assets/',
			decorateReply: false
		});
		// Log requests
		this.router.addHook('onResponse', (request, reply, done) => {
			console.log(`${request.method} ${request.url} :: ${reply.statusCode}`);
			done();
		});

		// Sonde de disponibilité du conteneur (healthcheck Docker). Volontairement hors du préfixe
		// versionné : elle doit rester joignable à la même adresse quelles que soient les valeurs
		// de API_VERSION et SERVER_PATH.
		this.router.get('/health', async (request, reply) => {
			return reply.status(defines.status.requestOK).send({
				status: 'ok',
				uptime: process.uptime()
			});
		});

		// Android App Links : Android télécharge ce fichier pour vérifier que l'app peut ouvrir les
		// liens https du domaine (ex. le lien d'activation marchand `/activation?token=…`). DOIT être
		// servi à `/.well-known/assetlinks.json` (racine, hors préfixe versionné), en JSON, 200.
		// Le(s) SHA-256 de la clé de signature viennent de `ANDROID_CERT_SHA256` (séparés par des
		// virgules) — récupérables via `eas credentials`. Sans la variable, la liste est vide.
		this.router.get('/.well-known/assetlinks.json', async (request, reply) => {
			const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '')
				.split(',')
				.map(s => s.trim())
				.filter(Boolean);

			return reply.status(defines.status.requestOK).send([
				{
					relation: ['delegate_permission/common.handle_all_urls'],
					target: {
						namespace: 'android_app',
						package_name: process.env.ANDROID_PACKAGE_NAME ?? 'com.yoyopro.yoyoafrica',
						sha256_cert_fingerprints: fingerprints
					}
				}
			]);
		});

		// Page de repli d'activation marchand. Le lien `/activation?token=…` est un App Link : quand
		// l'app YoYo Pro est installée (et la vérification Android/iOS OK), le système ouvre l'app
		// AVANT que le navigateur ne charge cette page. Sinon (app absente), le navigateur affiche
		// cette page qui invite à installer l'application (Play Store / App Store) — au lieu du 404 JSON.
		this.router.get('/activation', async (request, reply) => {
			const androidUrl = (process.env.PRO_ANDROID_STORE_URL ?? '').trim()
				|| `https://play.google.com/store/apps/details?id=${process.env.ANDROID_PACKAGE_NAME ?? 'com.yoyopro.yoyoafrica'}`;
			const iosUrl = (process.env.PRO_IOS_STORE_URL ?? '').trim();

			const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activer votre boutique YoYo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap">
<style>
  :root{--brand:#FF6100;--brand2:#FF904B;--ink:#1F2933;--muted:#78868F;--paper:#fff;--sand:#F1EDE7}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--sand);
    font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);padding:20px}
  .card{background:var(--paper);max-width:420px;width:100%;padding:34px 26px;text-align:center}
  .logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,var(--brand),var(--brand2));
    display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:#fff;font-weight:800;font-size:26px}
  h1{font-size:22px;font-weight:800;margin:0 0 8px}
  p{color:var(--muted);font-size:15px;line-height:1.55;margin:0 0 22px}
  .btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 18px;margin:10px 0;
    border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;border:1px solid #E6E1D9;color:var(--ink)}
  .btn.primary{background:var(--brand);color:#fff;border-color:var(--brand)}
  .note{font-size:13px;color:var(--muted);margin-top:18px;line-height:1.5}
  .b{font-weight:700;color:var(--ink)}
</style></head><body>
  <div class="card">
    <div class="logo">Y</div>
    <h1>Installez YoYo Pro</h1>
    <p>Pour activer votre boutique, installez l'application <span class="b">YoYo Pro</span> sur votre téléphone.</p>
    <a class="btn primary" href="${androidUrl}">📱 Télécharger sur Google Play</a>
    ${iosUrl ? `<a class="btn" href="${iosUrl}">🍎 Télécharger sur l'App Store</a>` : ''}
    <p class="note">Une fois l'application installée, <span class="b">rouvrez le lien « Activer ma boutique »</span> reçu par e-mail : il ouvrira directement l'application.</p>
  </div>
</body></html>`;

			return reply.status(defines.status.requestOK).type('text/html; charset=utf-8').send(html);
		});

		this.router.get(`${prefix}/container`, async (request, reply) => {
			let Q = Promise.resolve({
					status: defines.status.created,
					message: 'Service is Up',
					data: {
						name: packageJson.name,
						version: packageJson.version,
						description: packageJson.description
					}
				});
			return coddyger.api(reply, Q);
		});

		const exportedFiles: any = coddyger.filesInclude(__dirname + '/api/routes', 'route');

		for (const file of exportedFiles) {
			this.router.register(file, { prefix });
		}
	}

	private notFoundHandler(): void {
		this.router.setNotFoundHandler((request, reply) => {
			reply.status(defines.status.notFound).send({ message: 'Ressource indisponible/introuvable' });
		});
	}

	private errorHandling(): void {
		this.router.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
			if (error.validation) {
				const validationErrors = error.validation;
				const customErrors = validationErrors.map((err: any) => {
					if (err.keyword === 'required') {
						return {
							message: `Le champ "${err.params.missingProperty}" est requis`,
							field: err.params.missingProperty
						};
					}
					if (err.keyword === 'additionalProperties') {
						return {
							message: 'Les propriétés supplémentaires ne sont pas autorisées',
							field: err.params.additionalProperty
						};
					}
					return {
						message: err.message,
						data: err
						// field: err.dataPath.slice(1), // Removing the leading dot from the data path
					};
				});
				reply.status(defines.status.badRequest).send({
					error: 'Validation Error',
					message: customErrors.length >= 1 ? customErrors[0].message : defines.message.tryCatch,
					data: env.mode === 'dev' || env.mode === 'DEV' ? customErrors : null
				});
			} else {
				console.error(error);
				reply.status(error.statusCode ?? defines.status.serverError).send({
					message: defines.message.tryCatch,
					data: env.mode === 'dev' || env.mode === 'DEV' ? error : null
				});
			}
		});
	}
}
