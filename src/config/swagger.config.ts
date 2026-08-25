import coddyger, { env } from 'coddyger';
import path from 'path';
import fs from 'fs';
import { config } from './env';

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Flag pour activer/désactiver la documentation
export const isSwaggerEnabled = config.swagger.enabled;

const faviconPath = path.join(coddyger.root() + '/src/public/logo.png');
const favicon = coddyger.file.toBase64(faviconPath);

export const swaggerConfig: any = {
	openapi: {
		openapi: '3.0.0',
		info: {
			title: env.appName,
			description: packageJson.description,
			version: packageJson.version
		},
		servers: [
			{
				url: process.env.SERVER_HOST,
				description: env.mode === 'dev' ? 'Development server' : 'Remote server'
			}
		],
		consumes: ['application/json', 'multipart/form-data'],
		produces: ['application/json'],
		tags: [],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'apiKey',
					name: 'Authorization',
					in: 'header'
				}
			}
		},
		security: [{ bearerAuth: [] }],
		externalDocs: {
			url: 'https://swagger.io',
			description: 'Find more info here'
		}
	}
};

export const swaggerUiConfig: any = {
	title: env.appName,
	routePrefix: '/',
	uiConfig: {
		docExpansion: 'none',
		deepLinking: false,
		persistAuthorization: true,
		displayRequestDuration: true,
		tryItOutEnabled: true,
		filter: true
	},
	onComplete: () => {
		// Additional Swagger UI customization
	},
	exposeRoute: true,
	uiHooks: {
		onRequest: function (request, reply, next) {
			reply.header('Access-Control-Allow-Origin', '*');
			reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
			reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
			next();
		},
		preHandler: function (request, reply, next) {
			next();
		}
	},
	staticCSP: false,
	transformStaticCSP: (header) => {
		return "default-src * 'unsafe-inline' 'unsafe-eval'; img-src * data: blob: 'unsafe-inline'; connect-src * 'unsafe-inline';";
	},
	transformSpecification: (swaggerObject, request, reply) => {
		// Trier les tags alphabétiquement
		if (swaggerObject.tags) {
			swaggerObject.tags.sort((a, b) => a.name.localeCompare(b.name, 'fr')); // Tri selon les règles françaises
		}
		
		// Vous pouvez également trier les opérations par tag si nécessaire
		if (swaggerObject.paths) {
			// Logique pour réorganiser les opérations par tag si nécessaire
		}
		
		return swaggerObject;
	},
	transformSpecificationClone: true,
	logo: {
		type: 'image/png',
		content: Buffer.from(favicon, 'base64'),
		href: '/documentation',
		target: '_blank'
	},
	theme: {
		title: `${env.appName} API Documentation`,
		favicon: [
			{
				filename: 'logo.png',
				rel: 'icon',
				sizes: '16x16',
				type: 'image/png',
				content: Buffer.from(favicon, 'base64')
			}
		],
		colors: {
			primary: {
				main: '#bf3013'
			}
		}
	}
};
