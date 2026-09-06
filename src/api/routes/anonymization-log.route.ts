import coddyger from 'coddyger';
import { AnonymizationLogController } from '../../modules/anonymization-log';
import { TokenMiddleware } from '../middleware';

const routePath = '/anonymization-logs';
const Controller = new AnonymizationLogController();
const tags: string[] = ['Journal d\'anonymisation (RGPD)'];

/**
 * Journal d'audit des anonymisations de comptes (DCP/RGPD). Lecture réservée à l'administrateur.
 * Le contenu est non nominatif (identifiant technique du compte, date, déclencheur).
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: {
      tags,
      summary: 'Lister le journal d\'anonymisation (administration)',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const { page, pageSize } = request.query as any;
      let Q = Controller.list({ page, pageSize });
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;
