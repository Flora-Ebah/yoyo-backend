import coddyger from 'coddyger';
import { HomeSlideController } from '../../modules/home-slide/home-slide.controller';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/home-slides';
const Controller: HomeSlideController = new HomeSlideController();
const tags: string[] = ['Carrousel accueil (#5)'];

/**
 * Carrousel d'offres de l'accueil client.
 * - Lecture publique (App Check) : slides actives et dans leur période.
 * - Gestion (liste complète + CRUD) : réservée à l'administrateur.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Slides publiques (accueil client)
  fastify.route({
    schema: { tags, summary: "Slides publiques de l'accueil" },
    method: 'GET',
    url: `${routePath}/public`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.getPublic())
  });

  // Liste complète (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Lister toutes les slides',
      query: {
        type: 'object',
        properties: { page: { type: 'number' }, pageSize: { type: 'number' } },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize || 50;
      return coddyger.api(reply, Controller.getAll({ page, pageSize }));
    }
  });

  // Création (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une slide',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          image: { type: 'string' },
          link: { type: 'string' },
          order: { type: 'number' },
          active: { type: 'boolean' },
          startsAt: { type: 'string' },
          endsAt: { type: 'string' }
        },
        required: ['image'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const user: any = request.user;
      return coddyger.api(reply, Controller.create(request.body, user?._id));
    }
  });

  // Mise à jour (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Mettre à jour une slide',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          image: { type: 'string' },
          link: { type: 'string' },
          order: { type: 'number' },
          active: { type: 'boolean' },
          startsAt: { type: 'string' },
          endsAt: { type: 'string' },
          status: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.update(String(request.params.id), request.body))
  });

  // Suppression logique (admin)
  fastify.route({
    schema: { tags, summary: 'Supprimer une slide' },
    method: 'DELETE',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.remove(String(request.params.id)))
  });

  done();
};

export default defaultRoute;
