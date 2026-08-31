import coddyger from 'coddyger';
import { PartnerController } from '../../modules/partner/partner.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/partners';
const Controller: PartnerController = new PartnerController();
const tags: string[] = ['Partenaires YoYo'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un partner',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          ville: { type: 'string', maxLength: 100 },
          address: { type: 'string', maxLength: 200 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          phone: { type: 'string' },
          email: { type: 'string', anyOf: [{ format: 'email' }, { maxLength: 0 }] },
          categories: { 
            type: 'array',
            items: { 
              type: 'string',
              description: 'ID de catégorie'
            },
            description: 'Tableau des IDs de catégories'
          },
          thumbnail: { type: 'string' },
          photos: { 
            type: 'array', 
            items: { 
              type: 'string',
            }
          },
          maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
          minOrder: { type: 'number', minimum: 0 },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed'],
            default: 'active'
          },
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['name'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
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
      summary: 'Modifier un partner existant',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          ville: { type: 'string', maxLength: 100 },
          address: { type: 'string', maxLength: 200 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          phone: { type: 'string' },
          email: { type: 'string', anyOf: [{ format: 'email' }, { maxLength: 0 }] },
          categories: { 
            type: 'array',
            items: { 
              type: 'string',
              description: 'ID de catégorie'
            },
            description: 'Tableau des IDs de catégories'
          },
          thumbnail: { type: 'string' },
          photos: { 
            type: 'array', 
            items: { 
              type: 'string',
            }
          },
          maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
          minOrder: { type: 'number', minimum: 0 },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed'] 
          },
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['_id'],
        additionalProperties: true
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
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
      summary: 'Liste des partners',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' },
          category: { type: 'string' }
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
      let category: any = request.query.category;

      let Q = Controller.getAll({ page, pageSize, status, query, category });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partners par statut',
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
    preHandler: TokenMiddleware.verify,
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
      summary: "Détails d'un partner par id",
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
      const _id: any = request.params.id;

      let Q = Controller.getById(_id);
      return coddyger.api(reply, Q);
    }
  });

  // Remove document
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un partner',
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
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let _id: any = request.params.id;

      let Q = Controller.delete(_id);
      return coddyger.api(reply, Q);
    }
  });

  // Route spécifique pour mettre à jour les heures d'ouverture
  fastify.route({
    schema: {
      tags,
      summary: "Mettre à jour les heures d'ouverture d'un partenaire",
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
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['openingHours'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/:id/opening-hours`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const id: any = request.params.id;
      const body: any = request.body;

      let Q = Controller.update(id, { openingHours: body.openingHours });
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires par client connecté
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires par client connecté',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let user: any = request.user;

      let Q = Controller.getByUserId(user._id, { page, pageSize, status });
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires ouverts
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires ouverts à la date actuelle',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          ville: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/open`,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let ville: any = request.query.ville;

      let Q = Controller.getOpenPartners({ page, pageSize, ville });
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires sponsorisés
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires sponsorisés',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          ville: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/sponsored`,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let ville: any = request.query.ville;

      let Q = Controller.getSponsoredPartners({ page, pageSize, ville });
      return coddyger.api(reply, Q);
    }
  });

  // Répartition géographique par ville (admin) — alimente la carte du dashboard
  fastify.route({
    schema: {
      tags,
      summary: 'Répartition géographique des partenaires par ville',
      description: 'Nombre de partenaires par ville avec coordonnées moyennes (admin uniquement)',
      query: {
        type: 'object',
        properties: {
          certified: { type: 'string', enum: ['certified', 'uncertified'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/geo-distribution`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const certified: any = request.query.certified;

      let Q = Controller.getGeoDistribution({ certified });
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques des partenaires (admin) — total + nouveaux sur période avec tendance
  fastify.route({
    schema: {
      tags,
      summary: 'Statistiques des partenaires',
      query: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          certified: { type: 'string', enum: ['certified', 'uncertified'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/stats`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const from: any = request.query.from;
      const to: any = request.query.to;
      const certified: any = request.query.certified;

      let Q = Controller.getStats({ from, to, certified });
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;