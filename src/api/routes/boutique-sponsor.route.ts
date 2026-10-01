import coddyger from 'coddyger';
import { BoutiqueSponsorController } from '../../modules/boutique-sponsor/boutique-sponsor.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/boutique-sponsors';
const Controller: BoutiqueSponsorController = new BoutiqueSponsorController();
const tags: string[] = ['Mise en avant boutique (#2)'];

/**
 * Mise en avant (sponsorisation) des boutiques — applique l'abonnement boutique
 * (prix + durée de `sponsorPlan`, config plateforme). Réservé à l'administrateur :
 * l'admin met une boutique en avant pour le compte du marchand qui le demande.
 *
 * Fichier/route/module NEUFS (déploiement fiable) : on ne modifie pas le module
 * partner (seul son champ existant `isSponsored` est piloté par le service).
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Mettre en avant une boutique (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Mettre une boutique en avant (selon l’abonnement)',
      body: {
        type: 'object',
        properties: { boutiqueId: { type: 'string' }, sponsorPlanId: { type: 'string' } },
        required: ['boutiqueId'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const admin: any = request.user;
      const body: any = request.body;
      return coddyger.api(reply, Controller.sponsor(String(body.boutiqueId), admin?._id, body.sponsorPlanId));
    }
  });

  // Liste de toutes les sponsorisations (admin)
  fastify.route({
    schema: {
      tags,
      summary: 'Lister les mises en avant',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' }
        },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.list({
      page: request.query.page, pageSize: request.query.pageSize, status: request.query.status,
      from: request.query.from, to: request.query.to
    }))
  });

  // Sponsorisation active d'une boutique (admin OU marchand propriétaire — self-service).
  // preHandler `verify` (tout utilisateur connecté) + GARDE DE PROPRIÉTÉ dans le contrôleur :
  // un marchand ne peut lire que SA boutique ; l'admin garde l'accès à toutes.
  fastify.route({
    schema: { tags, summary: 'Mise en avant active d’une boutique' },
    method: 'GET',
    url: `${routePath}/by-boutique/:boutiqueId`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) =>
      coddyger.api(reply, Controller.byBoutique(String(request.params.boutiqueId), request.user))
  });

  // Retirer la mise en avant (admin)
  fastify.route({
    schema: { tags, summary: 'Retirer la mise en avant d’une boutique' },
    method: 'DELETE',
    url: `${routePath}/:boutiqueId`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.cancel(String(request.params.boutiqueId)))
  });

  done();
};

export default defaultRoute;
