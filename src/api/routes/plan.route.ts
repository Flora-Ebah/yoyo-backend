import coddyger from 'coddyger';
import { PlanController } from '../../modules/plan/plan.controller';
import { TokenMiddleware, validateSchema } from '../middleware';
import { createPlanSchema, updatePlanSchema } from '../schemas/plan.schema';

const routePath = '/plans';
const Controller: PlanController = new PlanController();
const tags: string[] = ['Plans de fidélité'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Créer un plan
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un nouveau plan de fidélité',
      description: 'Crée un nouveau plan de fidélité avec un pourcentage de réduction spécifique',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          currency: { 
            type: 'string',
            enum: ['XOF', 'EUR', 'USD', 'GBP'],
            default: 'XOF'
          },
          durationDays: { type: 'number', default: 30 },
          discountPercentage: { type: 'number' },
          maxScansPerDay: { type: 'number', default: 5 },
          maxScansPerMonth: { type: 'number', default: 100 },
          features: { 
            type: 'array',
            items: { type: 'string' }
          },
          partnerCategories: {
            type: 'array',
            items: { type: 'string' },
            default: ['all']
          },
          maxCashbackAmount: { type: 'number' },
          isPopular: { type: 'boolean', default: false },
          isActive: { type: 'boolean', default: true },
          trialDays: { type: 'number', default: 0 },
          metadata: { type: 'object' }
        },
        required: ['name', 'description', 'price', 'discountPercentage', 'features'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: [TokenMiddleware.verifyAdmin, validateSchema(createPlanSchema)],
    handler: (request, reply) => {
      let body = request.body;
      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Modifier un plan
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier un plan de fidélité existant',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          price: { type: 'number' },
          currency: { 
            type: 'string',
            enum: ['XOF', 'EUR', 'USD', 'GBP']
          },
          durationDays: { type: 'number' },
          discountPercentage: { type: 'number' },
          maxScansPerDay: { type: 'number' },
          maxScansPerMonth: { type: 'number' },
          features: { 
            type: 'array',
            items: { type: 'string' }
          },
          partnerCategories: {
            type: 'array',
            items: { type: 'string' }
          },
          maxCashbackAmount: { type: 'number' },
          isPopular: { type: 'boolean' },
          isActive: { type: 'boolean' },
          trialDays: { type: 'number' },
          metadata: { type: 'object' }
        },
        required: ['_id'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: [TokenMiddleware.verifyAdmin, validateSchema(updatePlanSchema)],
    handler: (request, reply) => {
      let body = request.body;
      const _id = body._id;
      delete body._id;
      
      let Q = Controller.update(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Liste des plans
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des plans de fidélité',
      description: 'Récupère la liste de tous les plans de fidélité disponibles',
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
    handler: (request, reply) => {
      let page = request.query.page || 1;
      let pageSize = request.query.pageSize || 10;
      let status = request.query.status;
      let query = request.query.q;

      let Q = Controller.getAll({ page, pageSize, status, query });
      return coddyger.api(reply, Q);
    }
  });

  // Plans actifs
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des plans de fidélité actifs',
      description: 'Récupère tous les plans actifs disponibles pour souscription'
    },
    method: 'GET',
    url: `${routePath}/active`,
    handler: (request, reply) => {
      let Q = Controller.getActivePlans();
      return coddyger.api(reply, Q);
    }
  });

  // Plan populaire
  fastify.route({
    schema: {
      tags,
      summary: 'Plan de fidélité populaire/recommandé',
      description: 'Récupère le plan marqué comme populaire ou recommandé'
    },
    method: 'GET',
    url: `${routePath}/popular`,
    handler: (request, reply) => {
      let Q = Controller.getPopularPlan();
      return coddyger.api(reply, Q);
    }
  });

  // Calculer le prix
  fastify.route({
    schema: {
      tags,
      summary: 'Calculer le prix d\'un plan de fidélité',
      description: 'Calcule le prix total pour un plan avec une durée spécifique',
      params: {
        type: 'object',
        properties: {
          planId: { type: 'string' }
        },
        required: ['planId'],
        additionalProperties: false
      },
      query: {
        type: 'object',
        properties: {
          months: { type: 'number', default: 1 }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/calculate-price/:planId`,
    handler: (request, reply) => {
      const planId = request.params.planId;
      const months = request.query.months || 1;
      let Q = Controller.calculatePrice(planId, months);
      return coddyger.api(reply, Q);
    }
  });

  // Plans par catégorie de partenaire
  fastify.route({
    schema: {
      tags,
      summary: 'Plans par catégorie de partenaire',
      description: 'Récupère les plans disponibles pour une catégorie spécifique de partenaires',
      params: {
        type: 'object',
        properties: {
          category: { type: 'string' }
        },
        required: ['category'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/by-category/:category`,
    handler: (request, reply) => {
      const category = request.params.category;
      let Q = Controller.getPlansByCategory(category);
      return coddyger.api(reply, Q);
    }
  });

  // Comparer des plans
  fastify.route({
    schema: {
      tags,
      summary: 'Comparer des plans de fidélité',
      description: 'Compare plusieurs plans de fidélité côte à côte',
      query: {
        type: 'object',
        properties: {
          planIds: { 
            type: 'string',
            description: 'IDs des plans séparés par des virgules'
          }
        },
        required: ['planIds'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/compare`,
    handler: (request, reply) => {
      const planIds = request.query.planIds.split(',');
      let Q = Controller.comparePlans(planIds);
      return coddyger.api(reply, Q);
    }
  });

  // Détails d'un plan
  fastify.route({
    schema: {
      tags,
      summary: 'Détails d\'un plan de fidélité',
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
    handler: (request, reply) => {
      const id = request.params.id;
      let Q = Controller.getById(id);
      return coddyger.api(reply, Q);
    }
  });

  // Supprimer un plan
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un plan de fidélité',
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
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const id = request.params.id;
      let Q = Controller.delete(id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;