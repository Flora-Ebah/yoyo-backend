import coddyger from 'coddyger';
import { FavoriteController } from '../../modules/favorite/favorite.controller';
import { TokenMiddleware } from '../middleware';

const Controller: FavoriteController = new FavoriteController();
const tags: string[] = ['Favoris'];

/**
 * Favoris boutiques (bookmark) : un client met une boutique en favori.
 * - Toggle : réservé à l'utilisateur connecté.
 * - Liste : boutiques favorites de l'utilisateur connecté (objets Partner complets).
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Toggle du favori de l'utilisateur courant sur une boutique
  fastify.route({
    schema: {
      tags,
      summary: 'Basculer une boutique en favori (toggle)',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `/partners/:id/favorite`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      return coddyger.api(reply, Controller.toggle(String(request.params.id), user?._id));
    }
  });

  // Liste des boutiques favorites de l'utilisateur courant
  fastify.route({
    schema: {
      tags,
      summary: "Liste des boutiques favorites de l'utilisateur courant"
    },
    method: 'GET',
    url: `/me/favorites`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      return coddyger.api(reply, Controller.listForUser(user?._id));
    }
  });

  done();
};

export default defaultRoute;
