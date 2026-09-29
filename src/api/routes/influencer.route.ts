import coddyger from 'coddyger';
import { InfluencerController } from '../../modules/influencer/influencer.controller';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/influencers';
const Controller: InfluencerController = new InfluencerController();
const tags: string[] = ['Influenceurs (#17)'];

/**
 * Module Influenceurs : gestion des codes promo et suivi d'acquisition.
 * - Écriture + stats : réservées à l'administrateur (`verifyAdmin`).
 * - Validation d'un code : ouverte aux apps (attestée par App Check), pour vérifier un code saisi.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Liste (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Lister les influenceurs',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          q: { type: 'string' },
          status: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize || 20;
      const query: any = request.query.q;
      const status: any = request.query.status;
      const Q = Controller.getAll({ page, pageSize, query, status });
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques d'acquisition (admin)
  fastify.route({
    schema: { tags, summary: 'Statistiques par influenceur (clients ramenés)' },
    method: 'GET',
    url: `${routePath}/stats`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.getStats())
  });

  // Validation d'un code (public, attesté App Check)
  fastify.route({
    schema: {
      tags,
      summary: "Valider un code influenceur",
      query: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/validate`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.validate(String(request.query.code)))
  });

  // Détail (admin)
  fastify.route({
    schema: { tags, summary: 'Détail d’un influenceur' },
    method: 'GET',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.getById(String(request.params.id)))
  });

  // Création (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un influenceur',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contact: { type: 'string' },
          code: { type: 'string' },
          active: { type: 'boolean' }
        },
        required: ['name', 'code'],
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
      summary: 'Mettre à jour un influenceur',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contact: { type: 'string' },
          code: { type: 'string' },
          active: { type: 'boolean' },
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
    schema: { tags, summary: 'Supprimer un influenceur' },
    method: 'DELETE',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.remove(String(request.params.id)))
  });

  done();
};

export default defaultRoute;
