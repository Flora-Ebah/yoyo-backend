import coddyger from 'coddyger';
import { ProfileController } from '../../modules/profile/profile.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/profiles';
const Controller: ProfileController = new ProfileController();
const tags: string[] = ['Profiles'];

/**
 * [SÉCURITÉ B-04] Module de gestion des droits (RBAC).
 *
 * Les 6 routes étaient en `TokenMiddleware.verify` : tout compte client connecté pouvait créer,
 * modifier ou supprimer un profil de droits, donc se fabriquer un profil tout-pouvoir. L'unique
 * consommateur légitime est l'espace d'administration (`yoyo-admin-main/src/services/profile.service.ts`).
 */

const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un profile (rôle)',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'removed'] },
          ability: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                subject: { type: 'string' },
                action: { type: 'string' }
              },
              required: ['subject', 'action'],
              additionalProperties: true
            }
          }
        },
        required: ['name'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('create', 'roles'),
    handler: (request, reply) => {
      let body: any = request.body;

      let user: any = request.user;
      body.user = user._id;

      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Edit document
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier un profile (rôle)',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'suspended', 'removed'] },
          ability: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                subject: { type: 'string' },
                action: { type: 'string' }
              },
              required: ['subject', 'action'],
              additionalProperties: true
            }
          }
        },
        required: ['_id'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('update', 'roles'),
    handler: (request, reply) => {
      let body: any = request.body;
      const _id = body._id;
      delete body._id;

      let user: any = request.user;
      body.user = user._id;

      let Q = Controller.update(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des profiles',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('read', 'roles'),
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let query: any = request.query.q;

      let Q = Controller.getAll({ page, pageSize, status, query });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des profiles par statut',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: {
            type: 'string',
            default: 'active',
            enum: ['active', 'archived', 'removed']
          }
        },
        required: ['status'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/findByStatus`,
    preHandler: TokenMiddleware.can('read', 'roles'),
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize;
      const status: any = request.query.status;

      let Q = Controller.getAll({ status, page, pageSize });
      return coddyger.api(reply, Q);
    }
  });

  // Document details
  fastify.route({
    schema: {
      tags,
      summary: "Détails d'un profile par id",
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/details/:id`,
    preHandler: TokenMiddleware.can('read', 'roles'),
    handler: (request, reply) => {
      const _id: any = request.params.id;

      let Q = Controller.getById(_id);
      return coddyger.api(reply, Q);
    }
  });

  // Remove document
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un profile',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'DELETE',
    url: `${routePath}/remove/:id`,
    preHandler: TokenMiddleware.can('delete', 'roles'),
    handler: (request, reply) => {
      let _id: any = request.params.id;

      let Q = Controller.delete(_id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;