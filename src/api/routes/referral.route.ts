import coddyger from 'coddyger';
import { ReferralController } from '../../modules/referral/referral.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/admin/referrals';
const Controller: ReferralController = new ReferralController();
const tags: string[] = ['Parrainage (administration)'];

const clientParams = {
  type: 'object',
  properties: { clientId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
  required: ['clientId']
};

/**
 * Parrainage côté CMS (Excel Parrainage n°1, 6, 9). Toutes les routes sont réservées aux
 * administrateurs ; les décisions (validation, fraude) sont tracées par le journal d'audit global.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: { tags, summary: 'Parrains en attente de vérification (règle de vitesse)' },
    method: 'GET',
    url: `${routePath}/review`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.reviewList())
  });

  fastify.route({
    schema: { tags, summary: "Parrainage d'un client : parrain, filleuls, mois offerts", params: clientParams },
    method: 'GET',
    url: `${routePath}/:clientId`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.detail(request.params.clientId))
  });

  fastify.route({
    schema: { tags, summary: 'Valider un parrain en revue (sa récompense part si elle est due)', params: clientParams },
    method: 'POST',
    url: `${routePath}/:clientId/approve`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.approve(request.params.clientId))
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Fraude au parrainage : récompense annulée, avertissement, suspension à la récidive',
      params: clientParams,
      body: {
        type: 'object',
        properties: { reason: { type: 'string', minLength: 3, maxLength: 300 } },
        required: ['reason'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/:clientId/fraud`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.fraud(request.params.clientId, request.body.reason))
  });

  done();
};

export default defaultRoute;
