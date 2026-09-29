import coddyger from 'coddyger';
import { SettingsController } from '../../modules/settings/settings.controller';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/settings';
const Controller: SettingsController = new SettingsController();
const tags: string[] = ['Paramètres de la plateforme'];

/**
 * Paramètres globaux éditables depuis le CMS (bornes de remise marchand, …).
 *
 * - **Lecture** (`GET`) : ouverte aux applications (admin, commercial, app Partenaire) pour refléter
 *   les bornes dans leurs formulaires. Non sensible ; l'origine est attestée par App Check.
 * - **Écriture** (`PUT`) : réservée à l'administrateur (`verifyAdmin`).
 *
 * La validation métier de la remise (min/max) reste faite côté serveur dans `partner.route.ts` et
 * l'onboarding, qui lisent ces valeurs via `SettingsService` — les formulaires ne font que l'UX.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Lire la configuration
  fastify.route({
    schema: {
      tags,
      summary: 'Lire les paramètres de la plateforme',
      description: 'Retourne la configuration globale (remise min/max…). Lecture ouverte aux applications.'
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => {
      let Q = Controller.get();
      return coddyger.api(reply, Q);
    }
  });

  // Mettre à jour la configuration (admin uniquement)
  fastify.route({
    schema: {
      tags,
      summary: 'Mettre à jour les paramètres de la plateforme',
      description: 'Réservé aux administrateurs. Met à jour les bornes de remise marchand (min/max, en %).',
      body: {
        type: 'object',
        properties: {
          discountMin: { type: 'number', minimum: 0, maximum: 100 },
          discountMax: { type: 'number', minimum: 0, maximum: 100 },
          accountDeletionGraceDays: { type: 'number', minimum: 1, maximum: 3650 },
          maxBoutiquesPerMerchant: { type: 'number', minimum: 0, maximum: 1000 },
          discountColors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                threshold: { type: 'number', minimum: 0, maximum: 100 },
                color: { type: 'string' }
              },
              required: ['threshold', 'color'],
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let Q = Controller.update(request.body);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;
