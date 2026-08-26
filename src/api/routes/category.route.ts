import coddyger from 'coddyger';
import { CategoryController } from '../../modules/category/category.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/category';
const Controller: CategoryController = new CategoryController();
const tags: string[] = ['Gestion des catégories'];

/**
 * [SÉCURITÉ] Les catégories sont la taxonomie des métiers de commerçants : `partner.categories`
 * y fait référence, l'app Partenaire y puise la liste de choix à la création d'une boutique et
 * l'app Client en fait sa barre de filtres.
 *
 * L'écriture (création, modification, suppression) était en `TokenMiddleware.verify`, que le
 * **jeton public embarqué dans les binaires mobiles franchit** (C-01) : n'importe qui pouvait
 * renommer ou supprimer une catégorie, et donc décatégoriser l'ensemble des boutiques. Elle passe
 * en `verifyAdmin` — seul l'espace d'administration a vocation à la modifier.
 *
 * La **lecture** reste volontairement en `verify` : les deux applications mobiles en dépendent.
 */

const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une catégorie',
      description:
        "Réservé aux administrateurs. `icon` attend un nom d'icône **Ionicons** (jeu utilisé par " +
        "les applications mobiles, ex. `restaurant`, `cafe`, `shirt`) et `color` un code " +
        'hexadécimal `#RRGGBB` : les deux sont rendus tels quels par la barre de filtres de ' +
        "l'app Client. `position` fixe le rang d'affichage (croissant).",
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          parent: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
          position: { type: 'number' },
        },
        required: ['name'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let body: any = request.body;

      let user: any = request.user;
      body.user = user._id;

      let Q = Controller.create(body);
      return coddyger.api(reply, Q);
    }
  });

  // Edit document
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier une catégorie existante',
      description:
        'Réservé aux administrateurs. Renommer une catégorie conserve son identifiant : les ' +
        'boutiques qui y sont rattachées le restent.',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          parent: { type: 'string' },
          status: { type: 'string' },
          icon: { type: 'string' },
          color: { type: 'string' },
          position: { type: 'number' }
        },
        required: ['_id'],
        additionalProperties: true
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let body: any = request.body;
      const _id = body._id;
      delete body._id;

      let user: any = request.user;
      body.user = user._id;

      let Q = Controller.update(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des catégories',
      description:
        "Lecture ouverte aux applications : c'est la liste de choix de l'app Partenaire et la " +
        "barre de filtres de l'app Client. Triée par `position` croissante par défaut, ordre " +
        "éditorial voulu. La taxonomie tient sur une page — appeler sans `page` renvoie la liste " +
        'complète.',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' },
          sort: { type: 'string', enum: ['position', 'name', 'createdAt'], default: 'position' },
          orderBy: { type: 'string', enum: ['asc', 'desc'], default: 'asc' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      // La taxonomie compte une quinzaine d'entrées : la valeur par défaut du service (10)
      // tronquait silencieusement la liste, et les catégories manquantes devenaient
      // inatteignables dans les applications, qui appellent sans pagination.
      let pageSize: any = request.query.pageSize || 100;
      let status: any = request.query.status;
      let query: any = request.query.q;
      let sort: any = request.query.sort;
      let orderBy: any = request.query.orderBy;

      let Q = Controller.getAll({ page, pageSize, status, query, sort, orderBy });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des catégories par statut',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: {
            type: 'string',
            default: 'active',
            enum: ['active', 'archived', 'removed']
          }
        },
        required: ['status'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/findByStatus`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize || 100;
      const status: any = request.query.status;

      let Q = Controller.getAll({ status, page, pageSize });
      return coddyger.api(reply, Q);
    }
  });

  // Document details
  fastify.route({
    schema: {
      tags,
      summary: "Détails d'une catégorie par id",
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/details/:id`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const _id: any = request.params.id;

      let Q = Controller.getById(_id);
      return coddyger.api(reply, Q);
    }
  });

  // Remove document
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer une catégorie',
      description:
        'Réservé aux administrateurs. Suppression logique (`status: removed`) : les boutiques ' +
        'rattachées conservent la référence, la catégorie disparaît simplement des listes.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'DELETE',
    url: `${routePath}/remove/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let _id: any = request.params.id;

      let Q = Controller.delete(_id);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;