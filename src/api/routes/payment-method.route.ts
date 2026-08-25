import coddyger from 'coddyger';
import { PaymentMethodController } from '../../modules/payment-method/payment-method.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/payment-method';
const Controller: PaymentMethodController = new PaymentMethodController();
const tags: string[] = ['Payment Methods'];

/**
 * [SÉCURITÉ F-05 / B-07] Configuration des prestataires de paiement.
 *
 * Les 13 routes de ce module étaient en `TokenMiddleware.verify`, alors que les documents portent
 * les identifiants des prestataires — clé d'API, clé secrète, identifiant marchand — et le secret
 * de signature des webhooks. Aucune projection ne les masquait : `GET /payment-method` les
 * renvoyait en clair dans la liste, et `GET /payment-method/config/:id` était même prévue pour ça.
 *
 * Or `verify` se contente de valider la signature du jeton : le jeton public embarqué dans les
 * applications mobiles (C-01) le franchit. Les identifiants de paiement étaient donc lisibles par
 * quiconque extrayait ce jeton d'un binaire.
 *
 * Ce module est une table de configuration de back-office : aucune application ne l'appelle
 * (`yoyo-main` vise `/payment-methods`, au pluriel — une autre fonctionnalité, inexistante), et
 * aucun service de la plateforme ne l'importe. Il passe donc intégralement en `verifyAdmin`, la
 * route `config/:id` est supprimée, et les secrets ne quittent plus le processus.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une méthode de paiement',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['mobile_money', 'card', 'bank_transfer', 'crypto', 'other']
          },
          provider: { 
            type: 'string',
            enum: ['orange_money', 'mtn_momo', 'wave', 'moov_money', 'visa', 'mastercard', 'paypal', 'stripe', 'other']
          },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed'],
            default: 'active'
          },
          apiConfig: {
            type: 'object',
            properties: {
              baseUrl: { type: 'string' },
              environment: { 
                type: 'string',
                enum: ['dev', 'test', 'prod']
              },
              credentials: {
                type: 'object',
                properties: {
                  apiKey: { type: 'string' },
                  secretKey: { type: 'string' },
                  merchantId: { type: 'string' },
                  consumerKey: { type: 'string' },
                  basicAuth: { type: 'string' }
                }
              },
              endpoints: {
                type: 'object',
                properties: {
                  payment: { type: 'string' },
                  status: { type: 'string' },
                  refund: { type: 'string' },
                  webhook: { type: 'string' }
                }
              },
              headers: { type: 'object' }
            },
            required: ['baseUrl', 'environment']
          },
          fees: {
            type: 'object',
            properties: {
              percentage: { type: 'number' },
              fixed: { type: 'number' },
              currency: { type: 'string' }
            }
          },
          limits: {
            type: 'object',
            properties: {
              minAmount: { type: 'number' },
              maxAmount: { type: 'number' },
              currency: { type: 'string' }
            }
          },
          webhookConfig: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              secret: { type: 'string' },
              events: { 
                type: 'array',
                items: { type: 'string' }
              }
            }
          },
          metadata: { type: 'object' },
          uiConfig: {
            type: 'object',
            properties: {
              logo: { type: 'string' },
              color: { type: 'string' },
              displayName: { type: 'string' },
              instructions: { type: 'string' }
            }
          }
        },
        required: ['name', 'type', 'provider', 'apiConfig'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let body: any = request.body;
      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Edit document
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier une méthode de paiement existante',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          type: { 
            type: 'string',
            enum: ['mobile_money', 'card', 'bank_transfer', 'crypto', 'other']
          },
          provider: { 
            type: 'string',
            enum: ['orange_money', 'mtn_momo', 'wave', 'moov_money', 'visa', 'mastercard', 'paypal', 'stripe', 'other']
          },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed']
          },
          apiConfig: {
            type: 'object',
            properties: {
              baseUrl: { type: 'string' },
              environment: { 
                type: 'string',
                enum: ['dev', 'test', 'prod']
              },
              credentials: {
                type: 'object',
                properties: {
                  apiKey: { type: 'string' },
                  secretKey: { type: 'string' },
                  merchantId: { type: 'string' },
                  consumerKey: { type: 'string' },
                  basicAuth: { type: 'string' }
                }
              },
              endpoints: {
                type: 'object',
                properties: {
                  payment: { type: 'string' },
                  status: { type: 'string' },
                  refund: { type: 'string' },
                  webhook: { type: 'string' }
                }
              },
              headers: { type: 'object' }
            }
          },
          fees: {
            type: 'object',
            properties: {
              percentage: { type: 'number' },
              fixed: { type: 'number' },
              currency: { type: 'string' }
            }
          },
          limits: {
            type: 'object',
            properties: {
              minAmount: { type: 'number' },
              maxAmount: { type: 'number' },
              currency: { type: 'string' }
            }
          },
          webhookConfig: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              secret: { type: 'string' },
              events: { 
                type: 'array',
                items: { type: 'string' }
              }
            }
          },
          metadata: { type: 'object' },
          uiConfig: {
            type: 'object',
            properties: {
              logo: { type: 'string' },
              color: { type: 'string' },
              displayName: { type: 'string' },
              instructions: { type: 'string' }
            }
          }
        },
        required: ['_id'],
        additionalProperties: true
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let body: any = request.body;
      const _id = body._id;
      delete body._id;

      let Q = Controller.update(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          type: { type: 'string' },
          provider: { type: 'string' },
          q: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let type: any = request.query.type;
      let provider: any = request.query.provider;
      let query: any = request.query.q;

      let Q = Controller.getAll({ page, pageSize, status, query });
      return coddyger.api(reply, Q);
    }
  });

  // Get by type
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement par type',
      params: {
        type: 'object',
        properties: {
          type: { 
            type: 'string',
            enum: ['mobile_money', 'card', 'bank_transfer', 'crypto', 'other']
          }
        },
        required: ['type'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/type/:type`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const type: any = request.params.type;
      let Q = Controller.getByType(type);
      return coddyger.api(reply, Q);
    }
  });

  // Get by provider
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement par provider',
      params: {
        type: 'object',
        properties: {
          provider: { 
            type: 'string',
            enum: ['orange_money', 'mtn_momo', 'wave', 'moov_money', 'visa', 'mastercard', 'paypal', 'stripe', 'other']
          }
        },
        required: ['provider'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/provider/:provider`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const provider: any = request.params.provider;
      let Q = Controller.getByProvider(provider);
      return coddyger.api(reply, Q);
    }
  });

  // Get active methods
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement actives',
    },
    method: 'GET',
    url: `${routePath}/active`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let Q = Controller.getActiveMethods();
      return coddyger.api(reply, Q);
    }
  });

  // Get by type and provider
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement par type et provider',
      params: {
        type: 'object',
        properties: {
          type: { 
            type: 'string',
            enum: ['mobile_money', 'card', 'bank_transfer', 'crypto', 'other']
          },
          provider: { 
            type: 'string',
            enum: ['orange_money', 'mtn_momo', 'wave', 'moov_money', 'visa', 'mastercard', 'paypal', 'stripe', 'other']
          }
        },
        required: ['type', 'provider'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/type/:type/provider/:provider`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const type: any = request.params.type;
      const provider: any = request.params.provider;
      let Q = Controller.getByTypeAndProvider(type, provider);
      return coddyger.api(reply, Q);
    }
  });

  // Check if method is active
  fastify.route({
    schema: {
      tags,
      summary: 'Vérifier si une méthode de paiement est active',
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
    url: `${routePath}/active/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const id: any = request.params.id;
      let Q = Controller.isMethodActive(id);
      return coddyger.api(reply, Q);
    }
  });

  // Update status
  fastify.route({
    schema: {
      tags,
      summary: 'Mettre à jour le statut d\'une méthode de paiement',
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
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed']
          }
        },
        required: ['status'],
        additionalProperties: false
      }
    },
    method: 'PATCH',
    url: `${routePath}/status/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const id: any = request.params.id;
      const status: any = request.body.status;
      let Q = Controller.updateStatus(id, status);
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des méthodes de paiement par statut',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: {
            type: 'string',
            default: 'active',
            enum: ['active', 'inactive', 'suspended', 'removed']
          }
        },
        required: ['status'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/findByStatus`,
    preHandler: TokenMiddleware.verifyAdmin,
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
      summary: "Détails d'une méthode de paiement par id",
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
    preHandler: TokenMiddleware.verifyAdmin,
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
      summary: 'Supprimer une méthode de paiement',
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
      let _id: any = request.params.id;

      let Q = Controller.delete(_id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;