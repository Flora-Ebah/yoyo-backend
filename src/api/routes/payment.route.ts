import coddyger from 'coddyger';
import { PaymentController } from '../../modules/payment/payment.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/payments';
const Controller: PaymentController = new PaymentController();
const tags: string[] = ['Payments'];
const tagsPartner: string[] = ['Payments Partenaire'];
const tagsClient: string[] = ['Payments Client'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Initier un payment',
      description: 'Initier un payment entre un client et un partenaire',
      body: {
        type: 'object',
        properties: {
          to: { type: 'string' },
        },
        required: ['to']
      }
    },
    method: 'POST',
    url: `${routePath}/initiate`,
    // Dix demandes par minute et par session : large pour un usage réel (un client scanne une
    // fois par boutique), et suffisant pour couper court à un script. Le décompte est par session
    // et non par IP — cf. le `keyGenerator` global dans `router.ts`.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let body: any = request.body;

      let user: any = request.user;
      body.from = user._id;

      let Q = Controller.initiate(body);
      return coddyger.api(reply, Q);
    }
  });

  // [SÉCURITÉ niveau 2] QR à jeton court — l'app marchand demande un jeton `scan` (30 s) à afficher
  // dans son QR. Le QR n'encode donc plus l'id de boutique en clair et statique. AUTH MARCHAND :
  // le service vérifie que l'appelant possède la boutique.
  fastify.route({
		schema: {
			tags: tagsPartner,
			summary: 'Jeton de scan du QR marchand',
			description: 'Émet un jeton court (30 s) à encoder dans le QR affiché par le commerçant',
			query: {
				type: 'object',
				properties: {
					boutiqueId: { type: 'string' }
				},
				required: ['boutiqueId'],
				additionalProperties: false
			}
		},
		method: 'GET',
		url: `${routePath}/scan-token`,
		// Le QR se régénère toutes les 30 s côté app : laisser une marge confortable.
		config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let user: any = request.user;
			let boutiqueId: any = request.query.boutiqueId;

			let Q = Controller.issueScanToken(boutiqueId, user._id);
			return coddyger.api(reply, Q);
		}
	});

  // [SÉCURITÉ niveau 2] Le client scanne le QR du marchand et échange le jeton `scan` contre une
  // session `redeem` (10 min) liée à son compte. AUTH CLIENT.
  fastify.route({
		schema: {
			tags: tagsClient,
			summary: 'Vérifier un scan et ouvrir une session de réduction',
			description: 'Échange le jeton scanné dans le QR contre une session redeem liée au client',
			body: {
				type: 'object',
				properties: {
					scanToken: { type: 'string' }
				},
				required: ['scanToken'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/scan-verify`,
		config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let body: any = request.body;
			let user: any = request.user;

			let Q = Controller.scanVerify(body.scanToken, user._id);
			return coddyger.api(reply, Q);
		}
	});

  // Flux client en un appel : le client scanne la boutique, saisit le prix total et valide
  // lui-même sa réduction. `from` provient du jeton, jamais du corps.
  // Niveau 2 : `redeemSession` (issue de `scan-verify`) remplace `to` ; la boutique vient alors du
  // jeton. `to` reste accepté en legacy tant que `redeemLimits.requireScanToken` est OFF.
  fastify.route({
		schema: {
			tags: tagsClient,
			summary: 'Valider sa réduction (flux client)',
			description: 'Le client valide lui-même sa réduction après avoir scanné la boutique et saisi le prix total',
			body: {
				type: 'object',
				properties: {
					to: { type: 'string' },
					amount: { type: 'number' },
					redeemSession: { type: 'string' }
				},
				required: ['amount'],
				additionalProperties: false
			}
		},
		method: 'POST',
		url: `${routePath}/redeem`,
		// Même borne que l'ancien `initiate` : un client valide rarement plus de dix fois par minute.
		// Première barrière anti double-soumission ; le service ajoute un garde-fou idempotent.
		config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			let body: any = request.body;
			let user: any = request.user;

			let Q = Controller.redeem(user._id, { to: body.to, amount: body.amount, redeemSession: body.redeemSession });
			return coddyger.api(reply, Q);
		}
	});

  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des payments',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          q: { type: 'string' },
          partner: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    // Tous les tickets de la plateforme : back-office uniquement (était ouvert à tout compte connecté).
    preHandler: TokenMiddleware.canAny([['read', 'transactions'], ['read', 'pros']]),
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let from: any = request.query.from;
      let to: any = request.query.to;
      let query: any = request.query.q;
      let partner: any = request.query.partner;

      let Q = Controller.getAll({ page, pageSize, status, from, to, query, partner });
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques agrégées des paiements (admin) avec filtres
  fastify.route({
    schema: {
      tags,
      summary: 'Statistiques des paiements partenaires',
      query: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          q: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/overview`,
    // Statistiques globales : back-office uniquement.
    preHandler: TokenMiddleware.canAny([['read', 'transactions'], ['read', 'dashboard']]),
    handler: (request, reply) => {
      const status: any = request.query.status;
      const from: any = request.query.from;
      const to: any = request.query.to;
      const query: any = request.query.q;

      let Q = Controller.getOverviewStats({ status, from, to, query });
      return coddyger.api(reply, Q);
    }
  });

  // Top partenaires par volume (admin) — alimente le widget « Top professionnels » du dashboard
  fastify.route({
    schema: {
      tags,
      summary: 'Top partenaires par volume de paiements',
      query: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' },
          certified: { type: 'string', enum: ['certified', 'uncertified'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/top-partners`,
    // Classement global des boutiques : back-office uniquement.
    preHandler: TokenMiddleware.canAny([['read', 'transactions'], ['read', 'dashboard']]),
    handler: (request, reply) => {
      const from: any = request.query.from;
      const to: any = request.query.to;
      const status: any = request.query.status;
      const limit: any = request.query.limit;
      const certified: any = request.query.certified;

      let Q = Controller.getTopPartners({ from, to, status, limit, certified });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des payments par statut',
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
    // Back-office uniquement.
    preHandler: TokenMiddleware.can('read', 'transactions'),
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
      summary: "Détails d'un payment par id",
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
    // N'importe quel ticket par son id : back-office uniquement (les clients passent par `client/details`).
    preHandler: TokenMiddleware.can('read', 'transactions'),
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
      summary: 'Supprimer un payment',
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
    // Suppression : back-office uniquement (tout compte connecté pouvait supprimer un ticket).
    preHandler: TokenMiddleware.can('delete', 'transactions'),
    handler: (request, reply) => {
      let _id: any = request.params.id;

      let Q = Controller.delete(_id);
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques de paiement par partenaire
  fastify.route({
    schema: {
      tags: tagsPartner,
      summary: 'Statistiques de paiement par partenaire',
      params: {
        type: 'object',
        properties: {
          partnerId: { type: 'string' }
        },
        required: ['partnerId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/stats/:partnerId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let partnerId: any = request.params.partnerId;
      let user: any = request.user;

      let Q = Controller.getPaymentStats(user._id, partnerId);
      return coddyger.api(reply, Q);
    }
  });

  // Dernier paiement d'un partenaire
  fastify.route({
    schema: {
      tags: tagsPartner,
      summary: 'Dernier paiement d\'un partenaire',
      params: {
        type: 'object',
        properties: {
          partnerId: { type: 'string' }
        },
        required: ['partnerId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/last-pending/:partnerId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let partnerId: any = request.params.partnerId;

      let Q = Controller.getLastPayment(partnerId);
      return coddyger.api(reply, Q);
    }
  });

  // Liste des transactions d'un partenaire
  fastify.route({
    schema: {
      tags: tagsPartner,
      summary: 'Liste des transactions d\'un partenaire',
      params: {
        type: 'object',
        properties: {
          partnerId: { type: 'string' }
        },
        required: ['partnerId'],
        additionalProperties: false
      },
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
    url: `${routePath}/transactions/:partnerId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let partnerId: any = request.params.partnerId;
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;

      let Q = Controller.getPartnerTransactions(partnerId, { page, pageSize, status });
      return coddyger.api(reply, Q);
    }
  });

  // Invalidation a posteriori d'un ticket par le marchand (seul pouvoir restant sur un ticket).
  // Le service vérifie que l'appelant possède bien la boutique destinataire.
  fastify.route({
    schema: {
      tags: tagsPartner,
      summary: 'Invalider un ticket de réduction',
      description: 'Le propriétaire de la boutique invalide un ticket déjà validé par le client',
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
    url: `${routePath}/invalidate/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let _id: any = request.params.id;

      let Q = Controller.invalidate(_id, request.user?._id);
      return coddyger.api(reply, Q);
    }
  });

  // Liste des transactions d'un client
  fastify.route({
    schema: {
      tags: tagsClient,
      summary: 'Liste des transactions d\'un client',
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
    url: `${routePath}/client/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let user: any = request.user;
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;

      let Q = Controller.getClientTransactions(user._id, { page, pageSize, status });
      return coddyger.api(reply, Q);
    }
  });

  // Détail d'une transaction du client connecté (ticket, références) — propriété vérifiée.
  fastify.route({
    schema: {
      tags: tagsClient,
      summary: "Détail d'une transaction du client connecté",
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/client/details/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      let Q = Controller.getClientTransactionDetails(user._id, request.params.id);
      return coddyger.api(reply, Q);
    }
  });

  // Économies cumulées du client connecté (somme des réductions de ses tickets validés)
  fastify.route({
    schema: {
      tags: tagsClient,
      summary: 'Économies du client connecté',
      description: 'Total des réductions validées (hors tickets invalidés), total du mois en cours et nombre de tickets'
    },
    method: 'GET',
    url: `${routePath}/savings/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let user: any = request.user;

      let Q = Controller.getClientSavings(user._id);
      return coddyger.api(reply, Q);
    }
  });

  // Réductions utilisées aujourd'hui par le client connecté, et quota journalier (`redeemLimits.maxPerDay`)
  fastify.route({
    schema: {
      tags: tagsClient,
      summary: 'Consommation des réductions du jour',
      description: "Réductions validées aujourd'hui et ce mois, et quota journalier (0 = illimité)"
    },
    method: 'GET',
    url: `${routePath}/scan-usage/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let user: any = request.user;

      let Q = Controller.getScanUsage(user._id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;