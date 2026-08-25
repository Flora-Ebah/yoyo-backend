import coddyger from 'coddyger';
import { TransactionController } from '../../modules/transaction/transaction.controller';
import { TokenMiddleware, PaymentNotifyMiddleware } from '../middleware';

const routePath = '/transactions';
const Controller: TransactionController = new TransactionController();
const tags: string[] = ['Transactions'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des transactions',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' },
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

      let Q = Controller.getAll({ page, pageSize, status, query });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des transactions par statut',
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
      summary: "Détails d'un transaction par id",
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
      summary: 'Supprimer un transaction',
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

  // Créer une transaction pour l'achat d'un plan
  fastify.route({
    schema: {
      tags,
      summary: "Créer une transaction pour l'achat d'un plan",
      description: "Crée une transaction pour l'achat d'un plan de fidélité et retourne l'URL de paiement",
      body: {
        type: 'object',
        properties: {
          planId: { type: 'string' },
          isScheduledRenewal: { type: 'boolean' },
          currentSubscriptionId: { type: 'string' }
        },
        required: ['planId'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/plan-payment`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const body = request.body;
      const user = request.user;
      
      let Q = Controller.createPlanTransaction(
        user._id,
        body.planId,
        body.isScheduledRenewal,
        body.currentSubscriptionId
      );
      return coddyger.api(reply, Q);
    }
  });

  // Vérifier le statut d'un paiement
  fastify.route({
    schema: {
      tags,
      summary: "Vérifier le statut d'un paiement",
      description: "Vérifie le statut d'un paiement auprès du prestataire de paiement",
      params: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' }
        },
        required: ['transactionId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/check-payment/:transactionId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const transactionId = request.params.transactionId;
      const user = request.user;

      let Q = Controller.checkPaymentStatus(transactionId, user);
      return coddyger.api(reply, Q);
    }
  });

  // Mettre à jour le statut d'une transaction
  fastify.route({
    schema: {
      tags,
      summary: "Mettre à jour le statut d'une transaction",
      description: "Met à jour le statut d'une transaction après notification de paiement",
      body: {
        type: 'object',
        properties: {
          transactionId: { type: 'string' },
          paymentStatus: { 
            type: 'string',
            enum: ['pending', 'success', 'failed', 'refunded', 'expired', 'cancelled']
          }
        },
        required: ['transactionId', 'paymentStatus'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/update-status`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const body = request.body;
      
      let Q = Controller.updateTransactionStatus(
        body.transactionId,
        body.paymentStatus
      );
      return coddyger.api(reply, Q);
    }
  });

  // [SÉCURITÉ F-01] Route `payment-webhook` supprimée : non authentifiée, non signée, elle
  // permettait d'activer un abonnement sans paiement réel via une simple requête forgée.
  // Aucune des 4 applications ne la consommait. Le seul point d'entrée prestataire conservé
  // est `payment-notify`, qui re-vérifie systématiquement le statut auprès d'Orange Money.

  // Historique des transactions d'un utilisateur
  fastify.route({
    schema: {
      tags,
      summary: "Historique des transactions d'un utilisateur",
      description: "Récupère l'historique des transactions d'un utilisateur",
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/user-history`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user = request.user;
      const page = request.query.page || 1;
      const pageSize = request.query.pageSize || 10;
      
      let Q = Controller.getUserTransactions(user._id, page, pageSize);
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques des transactions (admin)
  fastify.route({
    schema: {
      tags,
      summary: "Statistiques des transactions",
      description: "Récupère les statistiques des transactions (admin uniquement)"
    },
    method: 'GET',
    url: `${routePath}/stats`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let Q = Controller.getTransactionStats();
      return coddyger.api(reply, Q);
    }
  });

  // [SÉCURITÉ F-01] Route `payment-callback` supprimée : non authentifiée, son unique contrôle
  // portait sur `cpm_error_message` — un champ CinetPay fourni par l'appelant, alors que le
  // prestataire réel est Orange Money. Vestige de l'intégration CinetPay abandonnée.

  // Notification de paiement Orange Money
  //
  // [SÉCURITÉ F-01] Le `status` transmis dans le corps de la requête n'est JAMAIS pris pour
  // argent comptant : il sert uniquement de déclencheur. Le contrôleur ré-interroge Orange
  // Money pour établir le statut réel avant toute activation d'abonnement.
  fastify.route({
    schema: {
      tags,
      summary: "Notification de paiement Orange Money",
      description: "Point d'entrée des notifications Orange Money. Le statut annoncé est " +
        "systématiquement revalidé auprès du prestataire avant toute activation.",
      body: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          notif_token: { type: 'string' },
          txnid: { type: 'string' },
        },
        required: ['status', 'notif_token'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}/payment-notify`,
    preHandler: PaymentNotifyMiddleware.verifySource,
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute'
      }
    },
    handler: (request, reply) => {
      const body = request.body;

      let Q = Controller.paymentNotify(body);
      return coddyger.api(reply, Q);
    }
  });

  // Route pour vérifier les transactions de renouvellement programmé
  fastify.route({
    schema: {
      tags,
      summary: "Vérifier les transactions de renouvellement programmé pour un abonnement",
      params: {
        type: 'object',
        properties: {
          subscriptionId: { type: 'string' }
        },
        required: ['subscriptionId']
      }
    },
    method: 'GET',
    url: `${routePath}/scheduled-renewal/:subscriptionId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const { subscriptionId } = request.params as { subscriptionId: string };
      const user = request.user;

      let Q = Controller.getScheduledRenewalTransactions(user._id, subscriptionId);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;