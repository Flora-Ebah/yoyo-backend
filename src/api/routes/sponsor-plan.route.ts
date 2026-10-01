import coddyger from 'coddyger';
import { SponsorPlanController } from '../../modules/sponsor-plan/sponsor-plan.controller';
import { TokenMiddleware, AppCheckMiddleware } from '../middleware';

const routePath = '/sponsor-plans';
const Controller: SponsorPlanController = new SponsorPlanController();
const tags: string[] = ['Formules de mise en avant (#2)'];

/**
 * Catalogue des formules de mise en avant (sponsorisation boutique).
 *
 * Fichier/route/module NEUFS (déploiement fiable). Remplace la config unique
 * `platformConfig.sponsorPlan` par un catalogue CRUD : l'admin crée plusieurs formules
 * (ex. 7 j / 30 j / 90 j), l'app Pro lit `GET /sponsor-plans/active` comme liste de choix.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Créer une formule (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une formule de mise en avant',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number', minimum: 0 },
          durationDays: { type: 'number', minimum: 0 },
          position: { type: 'number', minimum: 0 },
          isActive: { type: 'boolean' }
        },
        required: ['name', 'price', 'durationDays'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.create(request.body))
  });

  // Modifier une formule (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier une formule de mise en avant',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number', minimum: 0 },
          durationDays: { type: 'number', minimum: 0 },
          position: { type: 'number', minimum: 0 },
          isActive: { type: 'boolean' },
          status: { type: 'string', enum: ['active', 'inactive'] }
        },
        required: ['_id'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const body: any = request.body;
      const _id = body._id;
      delete body._id;
      return coddyger.api(reply, Controller.update(_id, body));
    }
  });

  // Liste (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des formules de mise en avant',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.list(request.query as any))
  });

  // Formules actives (app Pro — liste de choix)
  fastify.route({
    schema: { tags, summary: 'Formules de mise en avant actives' },
    method: 'GET',
    url: `${routePath}/active`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.active())
  });

  // Détails d'une formule
  fastify.route({
    schema: { tags, summary: 'Détails d’une formule' },
    method: 'GET',
    url: `${routePath}/details/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.details((request.params as any).id))
  });

  // Supprimer une formule (admin)
  fastify.route({
    schema: { tags, summary: 'Supprimer une formule de mise en avant' },
    method: 'DELETE',
    url: `${routePath}/remove/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.delete((request.params as any).id))
  });

  done();
};

export default defaultRoute;
