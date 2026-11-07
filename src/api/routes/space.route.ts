import coddyger from 'coddyger';
import { SpaceController } from '../../modules/space';
import { TokenMiddleware } from '../middleware';

const routePath = '/spaces';
const Controller = new SpaceController();
const tags = ['Espaces'];

const ruleSchema = {
  type: 'object',
  properties: { subject: { type: 'string' }, action: { type: 'string' } },
  required: ['subject', 'action'],
  additionalProperties: false,
};

const bodyProps = {
  label: { type: 'string', minLength: 2, maxLength: 60 },
  roleLabel: { type: 'string', maxLength: 60 },
  landing: { type: 'string', minLength: 1, maxLength: 120 },
  requires: { type: 'array', items: ruleSchema },
  excludes: { type: 'array', items: { type: 'string' } },
  order: { type: 'number' },
  status: { type: 'string', enum: ['active', 'inactive', 'removed'] },
};

const OBJECT_ID = '^[0-9a-fA-F]{24}$';

const defaultRoute: any = (fastify: any, _options: any, done: any) => {
  // Espaces ACTIFS — pour la résolution (tout admin connecté : un commercial n'a pas le droit `roles`).
  fastify.route({
    schema: { tags, summary: 'Espaces actifs (résolution)' },
    method: 'GET',
    url: `${routePath}/active`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (_req: any, reply: any) => coddyger.api(reply, Controller.listActive()),
  });

  // Liste complète (gestion admin)
  fastify.route({
    schema: { tags, summary: 'Liste des espaces' },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('read', 'roles'),
    handler: (_req: any, reply: any) => coddyger.api(reply, Controller.list()),
  });

  // Création
  fastify.route({
    schema: { tags, summary: 'Créer un espace', body: { type: 'object', properties: bodyProps, required: ['label', 'landing'], additionalProperties: false } },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('create', 'roles'),
    handler: (req: any, reply: any) => coddyger.api(reply, Controller.create(req.body)),
  });

  // Mise à jour
  fastify.route({
    schema: { tags, summary: 'Mettre à jour un espace', body: { type: 'object', properties: { _id: { type: 'string', pattern: OBJECT_ID }, ...bodyProps }, required: ['_id'], additionalProperties: false } },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.can('update', 'roles'),
    handler: (req: any, reply: any) => coddyger.api(reply, Controller.update(req.body)),
  });

  // Suppression définitive
  fastify.route({
    schema: { tags, summary: 'Supprimer un espace', params: { type: 'object', properties: { id: { type: 'string', pattern: OBJECT_ID } }, required: ['id'] } },
    method: 'DELETE',
    url: `${routePath}/remove/:id`,
    preHandler: TokenMiddleware.can('delete', 'roles'),
    handler: (req: any, reply: any) => coddyger.api(reply, Controller.delete(req.params.id)),
  });

  done();
};

export default defaultRoute;
