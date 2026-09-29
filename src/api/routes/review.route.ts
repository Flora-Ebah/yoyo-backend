import coddyger from 'coddyger';
import { ReviewController } from '../../modules/review/review.controller';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/reviews';
const Controller: ReviewController = new ReviewController();
const tags: string[] = ['Avis / Scoring (#14)'];

/**
 * Notation des marchands par les clients (emoji 1..5).
 * - Noter / lire le résumé : côté application (utilisateur connecté / App Check).
 * - Modération : réservée à l'administrateur.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Noter un marchand (client connecté) — upsert
  fastify.route({
    schema: {
      tags,
      summary: 'Noter un marchand (emoji 1..5)',
      body: {
        type: 'object',
        properties: { emoji: { type: 'number', minimum: 1, maximum: 5 } },
        required: ['emoji'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `/partners/:id/reviews`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.upsert(String(request.params.id), user?._id, body?.emoji));
    }
  });

  // Résumé public d'un marchand
  fastify.route({
    schema: { tags, summary: "Résumé des avis d'un marchand" },
    method: 'GET',
    url: `/partners/:id/reviews/summary`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.summary(String(request.params.id)))
  });

  // Modération (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Lister les avis (modération)',
      query: {
        type: 'object',
        properties: { page: { type: 'number' }, pageSize: { type: 'number' }, status: { type: 'string' } },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize || 20;
      const status: any = request.query.status;
      return coddyger.api(reply, Controller.getAll({ page, pageSize, status }));
    }
  });

  fastify.route({
    schema: { tags, summary: 'Masquer un avis' },
    method: 'PUT',
    url: `${routePath}/:id/hide`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.hide(String(request.params.id)))
  });

  fastify.route({
    schema: { tags, summary: 'Supprimer un avis' },
    method: 'DELETE',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.remove(String(request.params.id)))
  });

  done();
};

export default defaultRoute;
