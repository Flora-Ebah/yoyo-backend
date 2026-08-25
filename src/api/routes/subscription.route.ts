import coddyger from 'coddyger';
import { SubscriptionController } from '../../modules/subscription/subscription.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/subscription';
const Controller: SubscriptionController = new SubscriptionController();
const tags: string[] = ['Abonnements'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Créer un abonnement
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un nouvel abonnement',
      body: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          options: { 
            type: 'object',
            properties: {
              durationMonths: { type: 'number' },
              paymentMethod: { type: 'string' },
              transactionId: { type: 'string' },
              autoRenew: { type: 'boolean' },
              metadata: { type: 'object' }
            },
          }
        },
        required: ['planId'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { planId, options } = request.body;
      const userId: string = request.user._id;

      let Q = Controller.create(userId, planId, options);
      return coddyger.api(reply, Q);
    }
  });

  // Vérifier si un utilisateur a un abonnement actif
  fastify.route({
    schema: {
      tags,
      summary: 'Vérifier si un utilisateur a un abonnement actif',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/check/:userId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const userId = request.params.userId;
      let Q = Controller.checkActive(userId);
      return coddyger.api(reply, Q);
    }
  });

  // Récupérer l'historique des abonnements d'un utilisateur
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer l\'historique des abonnements d\'un utilisateur',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/user/:userId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const userId = request.params.userId;
      let Q = Controller.getUserHistory(userId);
      return coddyger.api(reply, Q);
    }
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer l\'historique des abonnements d\'un utilisateur',
    },
    method: 'GET',
    url: `${routePath}/user/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const userId = request.user._id;
      let Q = Controller.getUserHistory(userId);
      return coddyger.api(reply, Q);
    }
  });

  // Récupérer les détails d'un abonnement
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer les détails d\'un abonnement',
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
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const id = request.params.id;
      let Q = Controller.getDetails(id);
      return coddyger.api(reply, Q);
    }
  });

  // Liste des abonnements
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des abonnements',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { 
            type: 'string',
            enum: ['active', 'expired', 'cancelled', 'pending', 'trial']
          }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page = request.query.page || 1;
      const pageSize = request.query.pageSize || 10;
      const status = request.query.status;

      let Q = Controller.list(page, pageSize, status);
      return coddyger.api(reply, Q);
    }
  });

  // Renouveler un abonnement
  fastify.route({
    schema: {
      tags,
      summary: 'Renouveler un abonnement',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          options: {
            type: 'object',
            properties: {
              durationMonths: { type: 'number' },
              transactionId: { type: 'string' },
              paymentMethod: { type: 'string' }
            },
            additionalProperties: true
          }
        },
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/renew/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const id = request.params.id;
      const { options } = request.body;
      let Q = Controller.renew(id, options);
      return coddyger.api(reply, Q);
    }
  });

  // Annuler un abonnement
  fastify.route({
    schema: {
      tags,
      summary: 'Annuler un abonnement',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/cancel/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const id = request.params.id;
      const { reason } = request.body;
      let Q = Controller.cancel(id, reason);
      return coddyger.api(reply, Q);
    }
  });

  // Récupérer l'abonnement actuel du client connecté
  fastify.route({
    schema: {
      tags,
      summary: 'Récupérer l\'abonnement actuel du client connecté',
      description: 'Permet au client connecté de récupérer les détails de son abonnement actuel avec les informations du plan',
    },
    method: 'GET',
    url: `${routePath}/current/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const userId: string = request.user._id;

      let Q = Controller.getCurrentSubscription(userId);
      return coddyger.api(reply, Q);
    }
  });

  // Programmer un renouvellement anticipé
  fastify.route({
    schema: {
      tags,
      summary: 'Programmer un renouvellement anticipé',
      description: 'Permet de programmer un renouvellement d\'abonnement qui s\'activera à la fin de l\'abonnement en cours',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          newPlanId: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              paymentMethod: { type: 'string' },
              transactionId: { type: 'string' },
              metadata: { type: 'object' }
            }
          }
        },
        required: ['newPlanId'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/schedule-renewal/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const subscriptionId = request.params.id;
      const { newPlanId, options } = request.body;

      let Q = Controller.scheduleEarlyRenewal(subscriptionId, newPlanId, options);
      return coddyger.api(reply, Q);
    }
  });

  // Activer un renouvellement en attente (pour les jobs/cron)
  fastify.route({
    schema: {
      tags,
      summary: 'Activer un renouvellement en attente',
      description: 'Active un renouvellement programmé (utilisé par les jobs/cron)',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/activate-renewal/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const subscriptionId = request.params.id;

      let Q = Controller.activatePendingRenewal(subscriptionId);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;