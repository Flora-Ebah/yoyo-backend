import jwt from 'jsonwebtoken';
import coddyger, { env } from 'coddyger';
import { PartnerEngagementController } from '../../modules/partner-engagement/partner-engagement.controller';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/partners';
const Controller: PartnerEngagementController = new PartnerEngagementController();
const tags: string[] = ['Engagement boutiques (likes, commentaires, partages)'];

/**
 * Décodage OPTIONNEL du jeton utilisateur pour les routes publiques (App Check).
 * Renvoie l'`_id` du client si un Bearer VALIDE est présent, sinon `null`.
 * Aucune révocation n'est consultée ici : l'enjeu est seulement d'afficher l'état `liked`,
 * pas d'autoriser une action sensible.
 */
const decodeUserOptional = (request: any): string | null => {
  try {
    const authorization: string | undefined = request.headers?.authorization;
    if (!authorization) return null;
    const token = authorization.split(' ')[1];
    if (!token) return null;
    const payload: any = jwt.verify(token, env.jwt.secret!);
    const id = payload?._id;
    return typeof id === 'string' && id.trim().length > 0 ? id : null;
  } catch (error) {
    return null;
  }
};

const defaultRoute: any = (fastify: any, options, done) => {
  // Toggle like (client connecté)
  fastify.route({
    schema: {
      tags,
      summary: "Aimer / ne plus aimer une boutique (toggle)",
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/:id/like`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      return coddyger.api(reply, Controller.toggleLike(String(request.params.id), user?._id));
    }
  });

  // Compteurs d'engagement (public, App Check) — `liked` si Bearer valide présent
  fastify.route({
    schema: {
      tags,
      summary: "Compteurs d'engagement d'une boutique",
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/:id/engagement`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => {
      const userId = decodeUserOptional(request);
      return coddyger.api(reply, Controller.engagement(String(request.params.id), userId));
    }
  });

  // Liste paginée des commentaires (public, App Check)
  fastify.route({
    schema: {
      tags,
      summary: "Lister les commentaires d'une boutique",
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
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
    url: `${routePath}/:id/comments`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const limit: any = request.query.limit || 20;
      return coddyger.api(reply, Controller.listComments(String(request.params.id), page, limit));
    }
  });

  // Publier un commentaire (client connecté)
  fastify.route({
    schema: {
      tags,
      summary: 'Publier un commentaire sur une boutique',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: { text: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['text'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/:id/comments`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.addComment(String(request.params.id), user?._id, body?.text));
    }
  });

  // Incrémenter le compteur de partages (public, App Check)
  fastify.route({
    schema: {
      tags,
      summary: "Incrémenter le compteur de partages d'une boutique",
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/:id/share`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.share(String(request.params.id)))
  });

  done();
};

export default defaultRoute;
