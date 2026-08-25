import coddyger from 'coddyger';
import { NotificationController } from '../../modules/notification/notification.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/notifications';
const Controller: NotificationController = new NotificationController();
const tags: string[] = ['Notifications'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Liste des notifications
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des notifications',
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
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let query: any = request.query.q;

      let Q = Controller.getAll({ page, pageSize, query, status });
      return coddyger.api(reply, Q);
    }
  });

  // Détails d'une notification
  fastify.route({
    schema: {
      tags,
      summary: 'Détails d\'une notification',
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

  // Créer une notification
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une notification',
      body: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          category: { type: 'string' },
          to: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              message: { type: 'string' },
              url: { type: 'string' },
              imageUrl: { type: 'string' },
              data: { type: 'object' }
            },
            required: ['message']
          },
          template: { type: 'string' },
          templateData: { type: 'object' },
          attachments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                filename: { type: 'string' },
                path: { type: 'string' },
                contentType: { type: 'string' }
              }
            }
          }
        },
        required: ['type', 'category', 'to', 'data'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let body: any = request.body;
      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Supprimer une notification
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer une notification',
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

  // Liste des notifications de l'utilisateur connecté
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des notifications de l\'utilisateur connecté',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize || 10;
      let Q = Controller.getUserNotifications(user._id, page, pageSize);
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
      let Q = Controller.markAsRead(id);
      return coddyger.api(reply, Q);
    }
  });

  // Marquer toutes les notifications comme lues
  fastify.route({
    schema: {
      tags,
      summary: 'Marquer toutes les notifications comme lues',
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

  done();
};

export default defaultRoute;