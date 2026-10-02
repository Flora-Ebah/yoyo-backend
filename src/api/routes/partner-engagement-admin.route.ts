import coddyger from 'coddyger';
import { PartnerEngagementController } from '../../modules/partner-engagement/partner-engagement.controller';
import { TokenMiddleware } from '../middleware';

/**
 * Routes ADMIN de modération de l'engagement d'une boutique (likes, commentaires, partages).
 *
 * Toutes ces routes sont protégées par `TokenMiddleware.verifyAdmin` (back-office / agent admin),
 * contrairement aux routes publiques de `partner-engagement.route.ts` qui sont en App Check
 * (application mobile). Elles réutilisent le même contrôleur/service/DAO du module.
 */

const routePath = '/admin/engagement';
const Controller: PartnerEngagementController = new PartnerEngagementController();
const tags: string[] = ['Admin — Engagement boutiques (modération)'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Résumé des compteurs d'engagement d'une boutique
  fastify.route({
    schema: {
      tags,
      summary: "Résumé de l'engagement d'une boutique (likes, commentaires, partages)",
      params: {
        type: 'object',
        properties: { boutiqueId: { type: 'string' } },
        required: ['boutiqueId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/:boutiqueId/summary`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) =>
      coddyger.api(reply, Controller.adminSummary(String(request.params.boutiqueId)))
  });

  // Liste paginée des commentaires d'une boutique (avec status pour la modération)
  fastify.route({
    schema: {
      tags,
      summary: "Lister les commentaires d'une boutique (modération)",
      params: {
        type: 'object',
        properties: { boutiqueId: { type: 'string' } },
        required: ['boutiqueId'],
        additionalProperties: false
      },
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          status: { type: 'string', enum: ['active', 'all'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/:boutiqueId/comments`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const limit: any = request.query.limit || 20;
      const status: any = request.query.status;
      return coddyger.api(reply, Controller.adminListComments(String(request.params.boutiqueId), page, limit, status));
    }
  });

  // Suppression logique d'un commentaire (status 'removed')
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer (logiquement) un commentaire',
      params: {
        type: 'object',
        properties: { commentId: { type: 'string' } },
        required: ['commentId'],
        additionalProperties: false
      }
    },
    method: 'DELETE',
    url: `${routePath}/comments/:commentId`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) =>
      coddyger.api(reply, Controller.adminRemoveComment(String(request.params.commentId)))
  });

  // Liste paginée des clients ayant liké une boutique
  fastify.route({
    schema: {
      tags,
      summary: "Lister les clients ayant liké une boutique",
      params: {
        type: 'object',
        properties: { boutiqueId: { type: 'string' } },
        required: ['boutiqueId'],
        additionalProperties: false
      },
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/:boutiqueId/likers`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const limit: any = request.query.limit || 20;
      return coddyger.api(reply, Controller.adminListLikers(String(request.params.boutiqueId), page, limit));
    }
  });

  done();
};

export default defaultRoute;
