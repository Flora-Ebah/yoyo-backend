import coddyger from 'coddyger';
import { GeoController } from '../../modules/geo/geo.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/geo';
const Controller: GeoController = new GeoController();
const tags: string[] = ['Géolocalisation (#1)'];

/**
 * Push par proximité : l'app cliente remonte périodiquement sa position (y compris en arrière-plan).
 * Le serveur mémorise la dernière position, cherche un partenaire proche (rayon configuré au BO) et
 * envoie une notification FCM, avec un anti-spam par intervalle. Réservé à l'utilisateur connecté.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: {
      tags,
      summary: 'Remonter la position (push proximité)',
      body: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        },
        required: ['lat', 'lng'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/ping`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.ping(user?._id, Number(body?.lat), Number(body?.lng)));
    }
  });

  done();
};

export default defaultRoute;
