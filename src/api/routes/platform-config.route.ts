import coddyger from 'coddyger';
import { PlatformConfigController } from '../../modules/platform-config/platform-config.controller';
import { TokenMiddleware, AppCheckMiddleware } from '../middleware';

const routePath = '/platform-config';
const Controller: PlatformConfigController = new PlatformConfigController();
const tags: string[] = ['Paramètres plateforme (#3/#2/#1)'];

/**
 * Paramètres plateforme étendus (couleurs par %, abo mise en avant, push proximité).
 *
 * ⚠️ Route DÉDIÉE créée volontairement à part de `settings.route.ts` : sur l'environnement dev,
 * le fichier compilé de la route `/settings` restait périmé (les nouveaux champs y étaient
 * strippés). Un nouveau fichier de route se déploie correctement, ce qui débloque l'écriture.
 *
 * - Lecture : `GET /platform-config` (apps + BO) — renvoie toute la configuration.
 * - Écriture : `PUT /platform-config` (admin) — accepte discountColors / sponsorPlan / proximityPush / media / redeemLimits
 *   (et les bornes de remise), et délègue au même `SettingsController.update`.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  fastify.route({
    schema: { tags, summary: 'Lire la configuration plateforme' },
    method: 'GET',
    url: `${routePath}`,
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.get())
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Mettre à jour la configuration plateforme',
      body: {
        type: 'object',
        properties: {
          discountMin: { type: 'number', minimum: 0, maximum: 100 },
          discountMax: { type: 'number', minimum: 0, maximum: 100 },
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
          },
          sponsorPlan: {
            type: 'object',
            properties: {
              price: { type: 'number', minimum: 0 },
              durationDays: { type: 'number', minimum: 0 }
            },
            additionalProperties: false
          },
          proximityPush: {
            type: 'object',
            properties: {
              radiusMeters: { type: 'number', minimum: 0 },
              minIntervalHours: { type: 'number', minimum: 0 },
              target: { type: 'string', enum: ['all', 'sponsored'] }
            },
            additionalProperties: false
          },
          media: {
            type: 'object',
            properties: {
              maxVideoSeconds: { type: 'number', minimum: 1, maximum: 600 },
              // ≤ au plafond de réception de `POST /upload` (main.route.ts)
              maxVideoSizeMb: { type: 'number', minimum: 1, maximum: 200 }
            },
            additionalProperties: false
          },
          // Garde-fous du montant saisi par le client (`PaymentService.redeem`) ; 0 = désactivé.
          redeemLimits: {
            type: 'object',
            properties: {
              maxAmount: { type: 'number', minimum: 0 },
              cooldownHours: { type: 'number', minimum: 0, maximum: 720 },
              maxPerDay: { type: 'number', minimum: 0, maximum: 1000 },
              // Exige un scan frais du QR marchand pour valider une réduction (défaut false).
              requireScanToken: { type: 'boolean' }
            },
            additionalProperties: false
          },
          // Programme de parrainage (plan offert, filleuls requis, plafond « 3 000 premiers »).
          referralProgram: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              planId: { anyOf: [{ type: 'string', pattern: '^[0-9a-fA-F]{24}$' }, { type: 'null' }] },
              referralsPerReward: { type: 'integer', minimum: 1, maximum: 20 },
              rewardCap: { type: 'integer', minimum: 1, maximum: 1000000 }
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => coddyger.api(reply, Controller.update(request.body))
  });

  done();
};

export default defaultRoute;
