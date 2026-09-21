import coddyger from 'coddyger';
import { BoutiqueManagerController } from '../../modules/boutique-manager';
import { TokenMiddleware } from '../middleware';

const routePath = '/boutique-managers';
const Controller: BoutiqueManagerController = new BoutiqueManagerController();
const tags: string[] = ['Gérants de boutique'];

const defaultRoute: any = (fastify: any, options, done) => {
  // [PROPRIÉTAIRE] Inviter un gérant sur l'une de ses boutiques.
  fastify.route({
    schema: {
      tags,
      summary: 'Inviter un gérant sur une boutique',
      body: {
        type: 'object',
        properties: {
          boutiqueId: { type: 'string' },
          name: { type: 'string', minLength: 2, maxLength: 80 },
          phone: { type: 'string' }
        },
        required: ['boutiqueId', 'name', 'phone'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const body: any = request.body;
      const Q = Controller.invite(user._id, {
        boutiqueId: body.boutiqueId,
        name: body.name,
        phone: body.phone
      });
      return coddyger.api(reply, Q);
    }
  });

  // [PROPRIÉTAIRE] Lister tous ses gérants (toutes ses boutiques).
  fastify.route({
    schema: { tags, summary: 'Lister mes gérants (propriétaire connecté)' },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const Q = Controller.listByOwner(user._id);
      return coddyger.api(reply, Q);
    }
  });

  // [GÉRANT] Les boutiques que JE gère (mode gérant dans yoyo-pro). Vide = je ne suis pas gérant.
  fastify.route({
    schema: { tags, summary: 'Boutiques que je gère (gérant connecté)' },
    method: 'GET',
    url: `${routePath}/mine`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const Q = Controller.listMine(user._id);
      return coddyger.api(reply, Q);
    }
  });

  // [PROPRIÉTAIRE] Retirer un gérant.
  fastify.route({
    schema: {
      tags,
      summary: 'Retirer un gérant',
      params: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'DELETE',
    url: `${routePath}/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const id: any = request.params.id;
      const Q = Controller.remove(id, user._id);
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Inviter un gérant pour un partenaire donné — depuis la fiche partenaire du CMS.
  fastify.route({
    schema: {
      tags,
      summary: 'Inviter un gérant pour un partenaire (administration)',
      params: {
        type: 'object',
        properties: { ownerId: { type: 'string' } },
        required: ['ownerId'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          boutiqueId: { type: 'string' },
          name: { type: 'string', minLength: 2, maxLength: 80 },
          phone: { type: 'string' }
        },
        required: ['boutiqueId', 'name', 'phone'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/for-owner/:ownerId`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    handler: (request, reply) => {
      const ownerId: any = request.params.ownerId;
      const body: any = request.body;
      const Q = Controller.invite(ownerId, { boutiqueId: body.boutiqueId, name: body.name, phone: body.phone });
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Nombre total de gérants actifs (carte de stats).
  fastify.route({
    schema: { tags, summary: 'Nombre total de gérants actifs (administration)' },
    method: 'GET',
    url: `${routePath}/count`,
    preHandler: TokenMiddleware.can('read', 'pros'),
    handler: (request, reply) => {
      const Q = Controller.count();
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Gérants d'un propriétaire donné — pour la fiche partenaire du CMS.
  fastify.route({
    schema: {
      tags,
      summary: "Lister les gérants d'un partenaire (administration)",
      params: {
        type: 'object',
        properties: { ownerId: { type: 'string' } },
        required: ['ownerId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/by-owner/:ownerId`,
    preHandler: TokenMiddleware.can('read', 'pros'),
    handler: (request, reply) => {
      const ownerId: any = request.params.ownerId;
      const Q = Controller.listByOwner(ownerId);
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Gérants d'une boutique donnée.
  fastify.route({
    schema: {
      tags,
      summary: "Lister les gérants d'une boutique (administration)",
      params: {
        type: 'object',
        properties: { boutiqueId: { type: 'string' } },
        required: ['boutiqueId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/by-boutique/:boutiqueId`,
    preHandler: TokenMiddleware.can('read', 'pros'),
    handler: (request, reply) => {
      const boutiqueId: any = request.params.boutiqueId;
      const Q = Controller.listByBoutique(boutiqueId);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;
