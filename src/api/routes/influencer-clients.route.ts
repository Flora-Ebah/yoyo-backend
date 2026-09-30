import coddyger from 'coddyger';
import { InfluencerClientsController } from '../../modules/influencer/influencer-clients.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/influencers';
const Controller: InfluencerClientsController = new InfluencerClientsController();
const tags: string[] = ['Influenceurs (#17)'];

/**
 * Route DÉDIÉE (fichier neuf) : clients ramenés par un influenceur.
 * GET /influencers/:id/clients (admin). Séparée de `influencer.route.ts` pour un déploiement
 * fiable des nouveautés sur l'environnement dev.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: { tags, summary: 'Clients ramenés par un influenceur' },
    method: 'GET',
    url: `${routePath}/:id/clients`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.list(String(request.params.id)))
  });

  done();
};

export default defaultRoute;
