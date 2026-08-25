import coddyger from 'coddyger';
import { PushNotificationController } from '../../modules/push-notification/push-notification.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/push-notifications';
const Controller: PushNotificationController = new PushNotificationController();
const tags: string[] = ['Push Notifications'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Récupérer toutes les notifications push
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer toutes les notifications push',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          pageSize: { type: 'number', default: 10 },
          query: { type: 'string' },
          status: { 
            type: 'string',
            enum: ['pending', 'sent', 'failed']
          }
        }
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { page, pageSize, query, status } = request.query;
      let Q = Controller.getAll({ page, pageSize, query, status });
      return coddyger.api(reply, Q);
    }
  });

  // Récupérer une notification push par son ID
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer une notification push par son ID',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    },
    method: 'GET',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { id } = request.params;
      let Q = Controller.getById(id);
      return coddyger.api(reply, Q);
    }
  });

  // Créer une nouvelle notification push
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une nouvelle notification push',
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['info', 'success', 'warning', 'error'],
            default: 'info'
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high'],
            default: 'normal'
          },
          data: { type: 'object' },
          target: { type: 'string' }
        },
        required: ['title', 'body', 'target'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const body = request.body;
      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Mettre à jour une notification push
  fastify.route({
    schema: {
      tags,
      summary: 'Mettre à jour une notification push',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['info', 'success', 'warning', 'error']
          },
          priority: {
            type: 'string',
            enum: ['low', 'normal', 'high']
          },
          data: { type: 'object' },
          target: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              role: { type: 'string' },
              all: { type: 'boolean' }
            },
            oneOf: [
              { required: ['userId'] },
              { required: ['role'] },
              { required: ['all'] }
            ]
          }
        },
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      let Q = Controller.update(id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Supprimer une notification push
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer une notification push',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    },
    method: 'DELETE',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { id } = request.params;
      let Q = Controller.delete(id);
      return coddyger.api(reply, Q);
    }
  });

  // Récupérer les notifications de l'utilisateur connecté
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer les notifications de l\'utilisateur connecté',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', default: 1 },
          pageSize: { type: 'number', default: 10 },
          read: { type: 'boolean' }
        }
      }
    },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const { page, pageSize, read } = request.query;
      let Q = Controller.getUserNotifications(user._id, { page, pageSize, read });
      return coddyger.api(reply, Q);
    }
  });

  // Marquer toutes les notifications comme lues
  fastify.route({
    schema: {
      tags,
      summary: 'Marquer toutes les notifications comme lues'
    },
    method: 'PUT',
    url: `${routePath}/read-all`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      let Q = Controller.markAllAsRead(user._id);
      return coddyger.api(reply, Q);
    }
  });

  // Marquer une notification comme lue
  fastify.route({
    schema: {
      tags,
      summary: 'Marquer une notification comme lue',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    },
    method: 'PUT',
    url: `${routePath}/:id/read`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { id } = request.params;
      const user: any = request.user;
      let Q = Controller.markAsRead(id, user._id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;