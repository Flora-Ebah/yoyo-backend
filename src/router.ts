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

			const googlePlaySvg = `<svg viewBox="0 0 512 512" width="26" height="26" aria-hidden="true"><path fill="#00A1FF" d="M40 40 300 256 40 472z"/><path fill="#00E676" d="M40 40 470 150 300 256z"/><path fill="#FFC900" d="M470 150 470 362 300 256z"/><path fill="#FF3A44" d="M40 472 300 256 470 362z"/></svg>`;
			const appleSvg = `<svg viewBox="0 0 384 512" width="24" height="24" aria-hidden="true"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.1 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`;

			const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Activer votre boutique YoYo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>
  :root{--brand:#FF6100;--brand2:#FF904B;--ink:#1F2933;--body:#454F59;--muted:#78868F;--paper:#fff;--sand:#F1EDE7}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--sand);
    font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);padding:20px}
  .card{background:var(--paper);max-width:440px;width:100%;padding:40px 30px}
  .logo{width:60px;height:60px;background:linear-gradient(135deg,var(--brand),var(--brand2));
    display:flex;align-items:center;justify-content:center;margin-bottom:22px;color:#fff;font-weight:800;font-size:26px}
  h1{font-size:24px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px;line-height:1.2}
  .lead{color:var(--body);font-size:15px;line-height:1.6;margin:0 0 26px}
  .stores{display:flex;flex-direction:column;gap:12px}
  .store{display:flex;align-items:center;gap:14px;width:100%;padding:14px 18px;background:#000;color:#fff;
    text-decoration:none;border:0;border-radius:0}
  .store .ico{flex:none;display:flex;align-items:center;justify-content:center}
  .store .txt{display:flex;flex-direction:column;line-height:1.15;text-align:left}
  .store .txt small{font-size:11px;font-weight:500;letter-spacing:.04em;opacity:.85;text-transform:uppercase}
  .store .txt strong{font-size:18px;font-weight:700}
  .note{font-size:13px;color:var(--muted);margin:26px 0 0;line-height:1.55}
  .note b{color:var(--ink);font-weight:700}
</style></head><body>
  <div class="card">
    <div class="logo">Y</div>
    <h1>Activez votre boutique</h1>
    <p class="lead">L'application <b>YoYo Pro</b> n'est pas encore installée sur ce téléphone. Installez-la pour activer votre boutique et suivre vos encaissements.</p>
    <div class="stores">
      <a class="store" href="${androidUrl}">
        <span class="ico">${googlePlaySvg}</span>
        <span class="txt"><small>Disponible sur</small><strong>Google Play</strong></span>
      </a>
      ${iosUrl ? `<a class="store" href="${iosUrl}">
        <span class="ico">${appleSvg}</span>
        <span class="txt"><small>Télécharger dans</small><strong>App Store</strong></span>
      </a>` : ''}
    </div>
    <p class="note">Une fois l'application installée, <b>rouvrez le lien « Activer ma boutique »</b> reçu par e-mail : il ouvrira directement l'application.</p>
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
