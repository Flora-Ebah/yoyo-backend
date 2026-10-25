import coddyger from 'coddyger';
import { PromoCodeController } from '../../modules/promo-code/promo-code.controller';
import { PROMO_BATCH_MAX } from '../../modules/promo-code/promo-code.service';
import { TokenMiddleware } from '../middleware';

const Controller: PromoCodeController = new PromoCodeController();
const tags: string[] = ['Codes & promotions'];
const SUBJECT = 'promotions';

const OBJECT_ID = '^[0-9a-fA-F]{24}$';
const idParams = {
  type: 'object',
  properties: { id: { type: 'string', pattern: OBJECT_ID } },
  required: ['id']
};
const phone = { type: 'string', maxLength: 30 };
const companyBody = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120 },
    contactName: { type: 'string', maxLength: 120 },
    contactEmail: { type: 'string', maxLength: 160 },
    contactPhone: phone,
    notes: { type: 'string', maxLength: 1000 },
    status: { type: 'string', enum: ['active', 'archived'] }
  },
  additionalProperties: false
};

/**
 * Codes & promotions (Excel Codes n°3, 4, 10) : activation d'un code par le client connecté, et
 * administration des codes cadeaux, lots YOYO Business et entreprises (permission `promotions`).
 * Les écritures admin sont tracées par le journal d'audit global (`router.ts`).
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // ===================== Appli Client =====================

  fastify.route({
    schema: {
      tags,
      summary: 'Activer un code cadeau ou YOYO Business (jours offerts sur l’abonnement)',
      body: {
        type: 'object',
        properties: { code: { type: 'string', pattern: '^[A-Za-z0-9-]{4,20}$' } },
        required: ['code'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: '/clients/me/promo-codes/redeem',
    preHandler: TokenMiddleware.verify,
    // Débit limité par session (clé globale de `router.ts`), en plus des 5 échecs par heure et par
    // compte. Pas de clé par IP : sans `trustProxy`, `request.ip` est celle du proxy, commune à
    // tous les clients, et une limite par IP bloquerait tout le monde.
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    handler: (request, reply) => coddyger.api(reply, Controller.redeem(request.user._id, request.body.code))
  });

  // ===================== Entreprises YOYO Business =====================

  fastify.route({
    schema: { tags, summary: 'Entreprises YOYO Business (avec nombre de codes et d’activations)' },
    method: 'GET',
    url: '/admin/companies',
    preHandler: TokenMiddleware.can('read', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.listCompanies())
  });

  fastify.route({
    schema: { tags, summary: 'Créer une entreprise YOYO Business', body: { ...companyBody, required: ['name'] } },
    method: 'POST',
    url: '/admin/companies',
    preHandler: TokenMiddleware.can('create', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.createCompany(request.body, request.user?._id))
  });

  fastify.route({
    schema: { tags, summary: 'Modifier ou archiver une entreprise', params: idParams, body: companyBody },
    method: 'PUT',
    url: '/admin/companies/:id',
    preHandler: TokenMiddleware.can('update', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.updateCompany(request.params.id, request.body))
  });

  fastify.route({
    schema: { tags, summary: 'Fiche entreprise : lots et activations', params: idParams },
    method: 'GET',
    url: '/admin/companies/:id',
    preHandler: TokenMiddleware.can('read', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.companyDetail(request.params.id))
  });

  // ===================== Lots =====================

  fastify.route({
    schema: { tags, summary: 'Lots de codes avec leurs compteurs' },
    method: 'GET',
    url: '/admin/promo-batches',
    preHandler: TokenMiddleware.can('read', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.listBatches())
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Créer un lot : N codes libres, ou un code nominatif par ligne importée (CSV)',
      body: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['gift', 'business'] },
          label: { type: 'string', minLength: 2, maxLength: 120 },
          companyId: { type: 'string', pattern: OBJECT_ID },
          invoiceRef: { type: 'string', maxLength: 80 },
          planId: { type: 'string', pattern: OBJECT_ID },
          days: { type: 'integer', minimum: 1, maximum: 366 },
          expiresAt: { type: 'string', format: 'date-time' },
          count: { type: 'integer', minimum: 1, maximum: PROMO_BATCH_MAX },
          rows: {
            type: 'array',
            maxItems: PROMO_BATCH_MAX,
            items: {
              type: 'object',
              properties: { name: { type: 'string', maxLength: 120 }, phone },
              additionalProperties: false
            }
          }
        },
        required: ['type', 'label'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: '/admin/promo-batches',
    preHandler: TokenMiddleware.can('create', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.createBatch(request.body, request.user?._id))
  });

  fastify.route({
    schema: { tags, summary: 'Détail d’un lot : codes, titulaires, activations', params: idParams },
    method: 'GET',
    url: '/admin/promo-batches/:id',
    preHandler: TokenMiddleware.can('read', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.batchDetail(request.params.id))
  });

  // ===================== Codes =====================

  fastify.route({
    schema: { tags, summary: 'Désactiver un code non utilisé', params: idParams },
    method: 'POST',
    url: '/admin/promo-codes/:id/disable',
    preHandler: TokenMiddleware.can('update', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.setCodeStatus(request.params.id, 'disabled'))
  });

  fastify.route({
    schema: { tags, summary: 'Réactiver un code désactivé', params: idParams },
    method: 'POST',
    url: '/admin/promo-codes/:id/enable',
    preHandler: TokenMiddleware.can('update', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.setCodeStatus(request.params.id, 'active'))
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Réattribuer un code jamais utilisé (nouveau titulaire, nouveau délai)',
      params: idParams,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 120 },
          phone,
          expiresAt: { type: 'string', format: 'date-time' }
        },
        additionalProperties: false
      }
    },
    method: 'POST',
    url: '/admin/promo-codes/:id/reassign',
    preHandler: TokenMiddleware.can('update', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.reassign(request.params.id, request.body ?? {}))
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Annuler une activation : jours offerts retirés, utilisateur prévenu',
      params: idParams,
      body: {
        type: 'object',
        properties: { reason: { type: 'string', minLength: 3, maxLength: 300 } },
        required: ['reason'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: '/admin/promo-redemptions/:id/revoke',
    preHandler: TokenMiddleware.can('update', SUBJECT),
    handler: (request, reply) => coddyger.api(reply, Controller.revokeRedemption(request.params.id, request.body.reason))
  });

  done();
};

export default defaultRoute;
