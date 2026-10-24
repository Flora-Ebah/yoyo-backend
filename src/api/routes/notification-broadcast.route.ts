import coddyger from 'coddyger';
import { NotificationBroadcastController } from '../../modules/notification-broadcast';
import { TokenMiddleware } from '../middleware';

const routePath = '/notifications/broadcast';
const Controller: NotificationBroadcastController = new NotificationBroadcastController();
const tags: string[] = ['Notifications — diffusion'];

/** Cible d'une diffusion (Excel CMS n°15) : segment + filtres abonnement / plan / ville / boost. */
const audienceProperties = {
  segment: { type: 'string', enum: ['all', 'clients', 'partners'], default: 'all' },
  subscription: { type: 'string', enum: ['active', 'none'] },
  planId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  ville: { type: 'string', minLength: 1, maxLength: 80 },
  sponsored: { type: 'boolean' }
};

/**
 * Diffusion d'une notification (socket, section Notifications et push FCM) à un segment
 * d'utilisateurs. Réservé à l'administrateur. `preview` renvoie le nombre de destinataires,
 * affiché par le CMS avant confirmation.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: {
      tags,
      summary: 'Compter les destinataires d’une diffusion',
      body: {
        type: 'object',
        properties: audienceProperties,
        required: ['segment'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/preview`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.preview(request.body))
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Diffuser une notification à un segment',
      body: {
        type: 'object',
        properties: {
          ...audienceProperties,
          category: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR', 'SUCCESS'], default: 'INFO' },
          title: { type: 'string', maxLength: 120 },
          message: { type: 'string', minLength: 1, maxLength: 1000 },
          destination: { type: 'string', enum: ['home', 'subscription', 'notifications', 'partner'], default: 'home' },
          partnerId: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
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
