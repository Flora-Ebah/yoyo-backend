import coddyger from 'coddyger';
import { NotificationBroadcastController } from '../../modules/notification-broadcast';
import { TokenMiddleware } from '../middleware';

const routePath = '/notifications/broadcast';
const Controller: NotificationBroadcastController = new NotificationBroadcastController();
const tags: string[] = ['Notifications — diffusion'];

/**
 * Diffusion d'une notification PUSH à un segment d'utilisateurs (tous / clients / partenaires).
 * Fichier/route/module NEUFS (déploiement fiable). Réservé à l'administrateur.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: {
      tags,
      summary: 'Diffuser une notification à un segment',
      body: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR', 'SUCCESS'], default: 'INFO' },
          segment: { type: 'string', enum: ['all', 'clients', 'partners'], default: 'all' },
          title: { type: 'string', maxLength: 120 },
          message: { type: 'string', minLength: 1, maxLength: 1000 }
        },
        required: ['segment', 'message'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.broadcast(request.body))
  });

  done();
};

export default defaultRoute;
