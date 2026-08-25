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
		// Log requests
		this.router.addHook('onResponse', (request, reply, done) => {
			console.log(`${request.method} ${request.url} :: ${reply.statusCode}`);
			done();
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
