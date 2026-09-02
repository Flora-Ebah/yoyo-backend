import coddyger, { defines } from 'coddyger';
import { PartnerController } from '../../modules/partner/partner.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/partners';
const Controller: PartnerController = new PartnerController();
const tags: string[] = ['Partenaires YoYo'];

const defaultRoute: any = (fastify: any, options, done) => {
  
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, done) => {
    if (body === undefined || body === null || body === '') {
      return done(null, {});
    }

    try {
      done(null, JSON.parse(body));
    } catch (error: any) {
      error.statusCode = 400;
      done(error, undefined);
    }
  });

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

      // Verrou métier : un marchand ne peut ni désactiver sa boutique ni
      // supprimer/vider sa remise depuis l'app. Seule l'équipe YoYo (admin)
      // peut désactiver une boutique. La désactivation passe donc par le
      // back-office, pas par le marchand.
      const isAdmin: boolean = !!(user && user.isAdmin);
      if (!isAdmin) {
        if (typeof body.status !== 'undefined' && body.status !== 'active') {
          return coddyger.api(reply, Promise.resolve({
            status: defines.status.forbidden,
            message: "La désactivation de votre boutique est réservée à l'équipe YoYo. Contactez le support.",
            data: null
          }));
        }

        const MIN_MERCHANT_DISCOUNT = 5;
        if (typeof body.maxDiscount !== 'undefined' && Number(body.maxDiscount) < MIN_MERCHANT_DISCOUNT) {
          return coddyger.api(reply, Promise.resolve({
            status: defines.status.forbidden,
            message: `La remise proposée ne peut pas être inférieure à ${MIN_MERCHANT_DISCOUNT}%.`,
            data: null
          }));
        }
      }

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
          category: { type: 'string' },
          createdBy: {
            type: 'string',
            description: "Filtre d'attribution. `me` restreint aux boutiques enrôlées par l'appelant."
          }
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
      let createdBy: any = request.query.createdBy;
      const user: any = request.user;

      // `createdBy=me` est résolu ici, à partir du jeton : le client ne choisit pas l'identité
      // dont il consulte le portefeuille.
      if (createdBy === 'me') {
        createdBy = user?._id;
      }

      let Q = Controller.getAll({ page, pageSize, status, query, category, createdBy });
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

  // ---------------------------------------------------------------------------------------------
  // Onboarding marchand à distance (commerciaux)
  // ---------------------------------------------------------------------------------------------

  // Créer un marchand + sa boutique et lui envoyer le lien d'activation
  fastify.route({
    schema: {
      tags,
      summary: 'Enrôler un marchand à distance (compte + boutique)',
      description:
        "Réservé aux comptes disposant de la permission `pros:create` (rôle Commercial). Crée le compte marchand sans OTP, sa boutique, puis envoie un lien d'activation par e-mail et SMS. L'attribution (`createdBy`) est déduite du jeton.",
      body: {
        type: 'object',
        properties: {
          merchant: {
            type: 'object',
            properties: {
              firstname: { type: 'string', minLength: 2, maxLength: 100 },
              lastname: { type: 'string', minLength: 2, maxLength: 100 },
              email: { type: 'string', format: 'email' },
              contact: { type: 'string', minLength: 8, maxLength: 20 },
              ville: { type: 'string', maxLength: 100 }
            },
            required: ['firstname', 'lastname', 'email', 'contact'],
            // Verrouillé : sans cela, un corps de requête pourrait tenter d'injecter
            // `createdBy`, `status` ou `isPartner`.
            additionalProperties: false
          },
          shop: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 100 },
              categoryId: { type: 'string' },
              ville: { type: 'string', maxLength: 100 },
              address: { type: 'string', maxLength: 200 },
              phone: { type: 'string', maxLength: 20 },
              description: { type: 'string', maxLength: 1000 },
              // Réduction négociée sur le terrain par le commercial. Plancher à 5 %
              // (cohérent avec le verrou marchand) ; le marchand pourra l'ajuster ensuite.
              maxDiscount: { type: 'number', minimum: 5, maximum: 100 },
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
                    openTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                    closeTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                    breaks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          startTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                          endTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }
                        },
                        required: ['startTime', 'endTime']
                      }
                    }
                  },
                  required: ['day', 'isOpen']
                }
              }
            },
            required: ['name', 'categoryId'],
            additionalProperties: false
          },
          channels: {
            type: 'object',
            properties: {
              email: { type: 'boolean' },
              sms: { type: 'boolean' }
            },
            additionalProperties: false
          }
        },
        required: ['merchant', 'shop'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/onboard`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    // Un enrôlement déclenche un e-mail et un SMS : plafonner évite d'en faire un relais de spam.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: (request, reply) => {
      const user: any = request.user;

      let Q = Controller.onboard(request.body, {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email
      });
      return coddyger.api(reply, Q);
    }
  });

  // Activation du compte marchand par le porteur du lien
  fastify.route({
    schema: {
      tags,
      summary: "Activer un compte marchand via le lien d'invitation",
      description:
        "Route publique : le marchand n'a pas encore de session. L'autorisation vient du jeton d'activation, à usage unique et expirant.",
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 16, maxLength: 128 },
          // L'app YoYo Pro utilise un code PIN à 6 chiffres comme mot de passe : on l'accepte ici.
          password: { type: 'string', minLength: 4, maxLength: 128 }
        },
        required: ['token', 'password'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/activate`,
    // Aucun preHandler : le jeton d'activation fait office d'autorisation. Le rate-limit couvre
    // le risque d'énumération de jetons.
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    handler: (request, reply) => {
      const body: any = request.body;

      let Q = Controller.activate(body.token, body.password);
      return coddyger.api(reply, Q);
    }
  });

  // Renvoyer le lien d'activation (rattrapage d'un envoi échoué)
  fastify.route({
    schema: {
      tags,
      summary: "Renvoyer le lien d'activation d'un enrôlement en attente",
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
    url: `${routePath}/resend-activation/:id`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    // Handler synchrone : `coddyger.api` écrit lui-même dans `reply`, un handler `async` ferait
    // envoyer à Fastify une seconde réponse (vide) en plus de celle-ci.
    handler: (request, reply) => {
      const user: any = request.user;

      let Q = Controller.resendActivation(request.params.id, {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email
      });
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;