import coddyger from 'coddyger';
import { TransactionController } from '../../modules/transaction/transaction.controller';
import { WaveWebhookMiddleware } from '../middleware';

const routePath = '/transactions';
const Controller: TransactionController = new TransactionController();
const tags: string[] = ['Transactions'];

/**
 * Webhook Wave, dans son propre fichier de routes : Fastify encapsule chaque fichier enregistré,
 * ce qui permet de remplacer ICI SEULEMENT le parseur JSON pour conserver le corps brut
 * (`request.rawBody`), indispensable à la vérification de la signature `Wave-Signature`.
 *
 * À déclarer dans le portail Wave Business (Developer → Webhooks), stratégie « Signing Secret »,
 * événements `checkout.session.completed` et `checkout.session.payment_failed`.
 */
const defaultRoute: any = (fastify: any, options, done) => {
	fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, parsed) => {
		request.rawBody = body ?? '';

		if (!body) {
			return parsed(null, {});
		}

		try {
			parsed(null, JSON.parse(body));
		} catch (error: any) {
			error.statusCode = 400;
			parsed(error, undefined);
		}
	});

	// [SÉCURITÉ F-01] Comme `payment-notify`, cette route ne croit pas le statut annoncé :
	// la signature authentifie l'émetteur, puis la session est relue chez Wave avant activation.
	fastify.route({
		schema: {
			tags,
			summary: 'Notification de paiement Wave',
			description:
				"Webhook Wave signé (en-tête Wave-Signature). Le statut annoncé est systématiquement " +
				'revalidé auprès de Wave avant toute activation.',
			body: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					type: { type: 'string' },
					data: { type: 'object' }
				},
				required: ['type'],
				additionalProperties: true
			}
		},
		method: 'POST',
		url: `${routePath}/wave-webhook`,
		preHandler: WaveWebhookMiddleware.verify,
		config: {
			rateLimit: {
				max: 60,
				timeWindow: '1 minute'
			}
		},
		handler: (request, reply) => {
			return coddyger.api(reply, Controller.waveWebhook(request.body));
		}
	});

	done();
};

export default defaultRoute;
