import coddyger from 'coddyger';
import { DeviceTokenController } from '../../modules/device-token/device-token.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/push-tokens';
const Controller: DeviceTokenController = new DeviceTokenController();
const tags: string[] = ['Push FCM'];

const tokenProperty = { type: 'string', minLength: 20, maxLength: 4096 };

/**
 * Jetons FCM des appareils de l'utilisateur connecté : enregistrés à la connexion (et à chaque
 * rafraîchissement du jeton), retirés à la déconnexion. Sans jeton, aucune push n'arrive appli fermée.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: {
      tags,
      summary: "Enregistrer le jeton push de l'appareil",
      body: {
        type: 'object',
        properties: {
          token: tokenProperty,
          app: { type: 'string', enum: ['client', 'pro'] },
          platform: { type: 'string', enum: ['ios', 'android'] }
        },
        required: ['token', 'app', 'platform'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: routePath,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.register(user?._id, body));
    }
  });

  fastify.route({
    schema: {
      tags,
      summary: "Retirer le jeton push de l'appareil (déconnexion)",
      body: {
        type: 'object',
        properties: { token: tokenProperty },
        required: ['token'],
        additionalProperties: false
      }
    },
    method: 'DELETE',
    url: routePath,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.unregister(user?._id, body?.token));
    }
  });

  done();
};

export default defaultRoute;
