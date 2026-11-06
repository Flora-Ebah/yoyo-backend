import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { PartnerController } from '../../modules/partner/partner.controller';
import { SettingsService } from '../../modules/settings';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';
import { PartnerMediaHelper } from '../../helpers/partner-media.helper';
import { PartnerAccessHelper } from '../../helpers/partner-access.helper';
import { PartnerSet } from '../../modules/partner';
import { ClientSet } from '../../modules/client/client.model';
import { qrTagService } from '../../modules/qr-tag';
import { EnrolmentService } from '../../modules/enrolment/enrolment.service';
import { PartnerValidationService, partnerValidationService } from '../../modules/partner/partner-validation.service';
import { isPublicKey } from '../../services/storage/storage.service';

/** Refus 403 au format `{ status, message, data }` attendu par `coddyger.api`. */
const forbidden = (reply: any, message: string) =>
  coddyger.api(reply, Promise.resolve({ status: defines.status.forbidden, message, data: null }));

/**
 * [SÉCURITÉ] Charge la boutique visée et vérifie que l'appelant peut agir dessus : propriétaire,
 * gérant actif (sauf `ownerOnly`) ou admin. Répond lui-même (400/404/403) et renvoie `null` sinon.
 */
const loadManagedPartner = async (reply: any, id: any, user: any, ownerOnly = false): Promise<any | null> => {
  if (typeof id !== 'string' || !coddyger.string.isValidObjectId(id)) {
    coddyger.api(reply, Promise.resolve({ status: defines.status.badRequest, message: 'Identifiant de boutique invalide.', data: null }));
    return null;
  }
  const partnerModel: any = (new PartnerSet() as any).defaultModel;
  const partner: any = await partnerModel
    .findOne({ _id: id, status: { $nin: ['removed', 'archived'] } }, '_id user isSponsored video videoPoster categories')
    .lean();
  if (!partner) {
    coddyger.api(reply, Promise.resolve({ status: defines.status.notFound, message: 'Boutique introuvable.', data: null }));
    return null;
  }
  const allowed = ownerOnly
    ? !!user?.isAdmin || PartnerAccessHelper.isOwner(partner, user?._id)
    : await PartnerAccessHelper.canManage(partner, user);
  if (!allowed) {
    forbidden(reply, "Vous n'avez pas accès à cette boutique.");
    return null;
  }
  return partner;
};

/**
 * [SÉCURITÉ] Seuls champs qu'un appelant peut écrire sur une boutique via POST / PUT /partners.
 * Le schéma accepte des propriétés supplémentaires : sans cette liste, un corps pouvait poser
 * `verified`, `isSponsored`, `user`, `slug`… ou un opérateur Mongo (`$set`, `$unset`).
 */
const WRITABLE_PARTNER_FIELDS = [
  'name', 'description', 'ville', 'address', 'latitude', 'longitude', 'phone', 'email', 'socials',
  'categories', 'thumbnail', 'photos', 'video', 'videoPoster', 'maxDiscount', 'minOrder', 'status',
  'openingHours'
];

/**
 * Copie du corps limitée aux champs autorisés. `status` est réservé aux admins : un marchand
 * suspendu (ou dont la boutique attend la validation) pouvait se réactiver lui-même. L'appli Pro
 * envoie `status: 'active'` à la création : il est simplement ignoré.
 */
const pickWritable = (body: any, user?: any): any => {
  const out: any = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of WRITABLE_PARTNER_FIELDS) {
    if (key === 'status' && !user?.isAdmin) continue;
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
};

const VIDEO_BOOST_ONLY = 'La vidéo est réservée aux boutiques boostées. Activez YO Boost pour en ajouter une.';

/** Champs qui portent une clé de stockage de la vidéo (nom renvoyé par `POST /upload`). */
const VIDEO_KEY_FIELDS = ['video', 'videoPoster'];

/**
 * [SÉCURITÉ] `video` / `videoPoster` doivent être une clé publique « plate » (`<hex>.mp4`), ou vide
 * pour retirer la vidéo. Sans ce contrôle, une valeur forgée (`kyc/<pièce>.pdf`, `../…`) était
 * enregistrée telle quelle puis lue ou réécrite par les scripts de maintenance qui parcourent ces
 * champs (rattrapage du ré-encodage vidéo). Une valeur identique à celle déjà en base reste
 * acceptée : l'app Pro renvoie la vidéo existante à chaque enregistrement du formulaire.
 * Renvoie le nom du premier champ invalide, ou `null`.
 */
const invalidVideoKey = (body: any, current?: any): string | null => {
  for (const field of VIDEO_KEY_FIELDS) {
    const value = body?.[field];
    if (value === undefined || value === null || value === '') continue;
    if (current && value === current[field]) continue;
    if (typeof value !== 'string' || !isPublicKey(value)) return field;
  }
  return null;
};

/** Réponse 400 pour une clé de vidéo invalide. */
const badVideoKey = (reply: any, field: string) =>
  coddyger.api(
    reply,
    Promise.resolve({
      status: defines.status.badRequest,
      message: `Fichier ${field === 'video' ? 'vidéo' : "d'aperçu vidéo"} invalide : envoyez la vidéo avant d'enregistrer la boutique.`,
      data: null
    })
  );

const routePath = '/partners';
const Controller: PartnerController = new PartnerController();
// Bornes de remise paramétrables depuis le CMS (module Settings) — source de vérité serveur.
const settingsService: SettingsService = new SettingsService();
const tags: string[] = ['Partenaires YoYo'];

const defaultRoute: any = (fastify: any, options, done) => {
  
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body: string, done) => {
    if (body === undefined || body === null || body === '') {
      return done(null, {});
    }

    try {
      done(null, JSON.parse(body));
    } catch (error: any) {
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  // Create document
  fastify.route({
    schema: {
      tags,
      summary: 'Créer un partner',
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          ville: { type: 'string', maxLength: 100 },
          address: { type: 'string', maxLength: 200 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          phone: { type: 'string' },
          email: { type: 'string', anyOf: [{ format: 'email' }, { maxLength: 0 }] },
          categories: { 
            type: 'array',
            items: { 
              type: 'string',
              description: 'ID de catégorie'
            },
            description: 'Tableau des IDs de catégories'
          },
          thumbnail: { type: 'string' },
          photos: { 
            type: 'array', 
            items: { 
              type: 'string',
            }
          },
          video: { type: 'string', maxLength: 255 },
          videoPoster: { type: 'string', maxLength: 255 },
          maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
          minOrder: { type: 'number', minimum: 0 },
          maxOrder: { type: 'number', minimum: 0 },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed'],
            default: 'active'
          },
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['name'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: async (request, reply) => {
      let user: any = request.user;
      // Champs autorisés uniquement (le plafond par achat `maxOrder` n'en fait plus partie).
      let body: any = pickWritable(request.body, request.user);
      body.user = user._id;

      const badField = invalidVideoKey(body);
      if (badField) return badVideoKey(reply, badField);

      // Une boutique neuve n'est pas boostée : pas de vidéo (avantage YO Boost).
      if (!user?.isAdmin && body.video) return forbidden(reply, VIDEO_BOOST_ONLY);

      if (Number(body.minOrder ?? 0) > 0 && !(await PartnerAccessHelper.isMinOrderEligible(body.categories))) {
        body.minOrder = 0;
      }

      // Boutique créée par le marchand lui-même : en ligne tout de suite, contrôlée ensuite par
      // l'équipe YoYo (Excel CMS n°14). Un admin (commercial) la crée active, sans validation.
      const selfService = !user?.isAdmin;
      if (selfService) Object.assign(body, PartnerValidationService.pendingFields());

      let Q = Controller.create(body).then(async (res: any) => {
        if (selfService && res?.status === defines.status.created && body._id) {
          await partnerValidationService.notifySubmitted({ _id: body._id, name: body.name });
        }
        return res;
      });
      return coddyger.api(reply, Q);
    }
  });

  // Edit document
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier un partner existant',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          ville: { type: 'string', maxLength: 100 },
          address: { type: 'string', maxLength: 200 },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          phone: { type: 'string' },
          email: { type: 'string', anyOf: [{ format: 'email' }, { maxLength: 0 }] },
          categories: { 
            type: 'array',
            items: { 
              type: 'string',
              description: 'ID de catégorie'
            },
            description: 'Tableau des IDs de catégories'
          },
          thumbnail: { type: 'string' },
          photos: { 
            type: 'array', 
            items: { 
              type: 'string',
            }
          },
          video: { type: 'string', maxLength: 255 },
          videoPoster: { type: 'string', maxLength: 255 },
          maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
          minOrder: { type: 'number', minimum: 0 },
          maxOrder: { type: 'number', minimum: 0 },
          status: { 
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'removed'] 
          },
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['_id'],
        additionalProperties: true
      }
    },
    method: 'PUT',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verify,
    handler: async (request, reply) => {
      const _id = (request.body as any)?._id;
      // Champs autorisés uniquement : jamais `user`, `isSponsored`, `maxOrder`, `slug`, opérateurs Mongo…
      let body: any = pickWritable(request.body, request.user);

      let user: any = request.user;

      // [SÉCURITÉ] Seuls le propriétaire, un gérant actif ou un admin modifient une boutique, et le
      // propriétaire n'est jamais réécrit (avant : n'importe quel compte pouvait modifier n'importe
      // quelle boutique et en devenir propriétaire).

      const current: any = await loadManagedPartner(reply, _id, user);
      if (!current) return;

      const badField = invalidVideoKey(body, current);
      if (badField) return badVideoKey(reply, badField);

      // Vidéo = avantage YO Boost : on peut la retirer, pas en ajouter une sans boost.
      if (!user?.isAdmin && body.video && body.video !== current.video && !current.isSponsored) {
        return forbidden(reply, VIDEO_BOOST_ONLY);
      }

      // Commande minimale : uniquement pour les catégories éligibles (boulangeries, supérettes).
      if (typeof body.minOrder !== 'undefined' || Array.isArray(body.categories)) {
        const categories = Array.isArray(body.categories) ? body.categories : current.categories;
        if (!(await PartnerAccessHelper.isMinOrderEligible(categories))) body.minOrder = 0;
      }

      // Verrou métier : un marchand ne peut ni désactiver sa boutique ni descendre sa remise sous
      // le minimum (ni dépasser le maximum). Ces bornes sont désormais paramétrables depuis le CMS
      // (module Settings). Seule l'équipe YoYo (admin) peut désactiver une boutique.
      const isAdmin: boolean = !!(user && user.isAdmin);
      if (!isAdmin) {
        if (typeof body.status !== 'undefined' && body.status !== 'active') {
          return coddyger.api(reply, Promise.resolve({
            status: defines.status.forbidden,
            message: "La désactivation de votre boutique est réservée à l'équipe YoYo. Contactez le support.",
            data: null
          }));
        }

        if (typeof body.maxDiscount !== 'undefined') {
          const { min, max } = await settingsService.getDiscountBounds();
          const discount = Number(body.maxDiscount);

          if (discount < min) {
            return coddyger.api(reply, Promise.resolve({
              status: defines.status.forbidden,
              message: `La remise proposée ne peut pas être inférieure à ${min}%.`,
              data: null
            }));
          }
          if (discount > max) {
            return coddyger.api(reply, Promise.resolve({
              status: defines.status.forbidden,
              message: `La remise proposée ne peut pas dépasser ${max}%.`,
              data: null
            }));
          }
        }
      }

      // Boutique refusée puis modifiée par le marchand : renvoyée en validation (toujours masquée).
      let Q = Controller.update(String(current._id), body).then(async (res: any) => {
        if (!isAdmin && res?.status === defines.status.requestOK) await partnerValidationService.resubmitIfRejected(String(current._id));
        return res;
      });
      return coddyger.api(reply, Q);
    }
  });

  // Document list
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partners',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' },
          category: { type: 'string' },
          createdBy: {
            type: 'string',
            description: "Filtre d'attribution. `me` restreint aux boutiques enrôlées par l'appelant."
          },
          sort: {
            type: 'string',
            enum: ['discount_desc'],
            description: "Tri du marketplace. `discount_desc` = plus fortes réductions d'abord."
          },
          from: { type: 'string' },
          to: { type: 'string' },
          ville: { type: 'string' }
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
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let query: any = request.query.q;
      let category: any = request.query.category;
      let createdBy: any = request.query.createdBy;
      let sort: any = request.query.sort;
      let from: any = request.query.from;
      let to: any = request.query.to;
      let ville: any = request.query.ville;
      const user: any = request.user;

      // `createdBy=me` est résolu ici, à partir du jeton : le client ne choisit pas l'identité
      // dont il consulte le portefeuille.
      if (createdBy === 'me') {
        createdBy = user?._id;
      }
      // Appli Client : uniquement les boutiques en service (ni en attente de validation, ni
      // suspendues). Le back-office garde tous les statuts.
      if (!user?.isAdmin) status = 'active';

      // Vidéo réservée aux boutiques boostées (sauf admin / propriétaire).
      let Q = PartnerMediaHelper.apply(Controller.getAll({ page, pageSize, status, query, category, createdBy, sort, from, to, ville }), user);
      return coddyger.api(reply, Q);
    }
  });

  // Villes distinctes des boutiques : alimente le filtre « Ville » du back-office (Excel CMS n°4).
  fastify.route({
    schema: { tags, summary: 'Villes des boutiques (filtre)' },
    method: 'GET',
    url: `${routePath}/villes`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => coddyger.api(reply, Controller.villes())
  });

  // Document list by status
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partners par statut',
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
      const pageSize: any = request.query.pageSize;
      // Hors back-office : boutiques en service uniquement.
      const status: any = request.user?.isAdmin ? request.query.status : 'active';

      let Q = PartnerMediaHelper.apply(Controller.getAll({ status, page, pageSize }), request.user);
      return coddyger.api(reply, Q);
    }
  });

  // Document details
  fastify.route({
    schema: {
      tags,
      summary: "Détails d'un partner par id",
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
      const user: any = request.user;

      // Boutique masquée (refusée) ou suspendue : visible seulement de son propriétaire, de ses
      // gérants et du back-office (Excel CMS n°14).
      const guarded = Controller.getById(_id).then(async (res: any) => {
        const partner = res?.data;
        if (partner && partner.status !== 'active' && !(await PartnerAccessHelper.canManage(partner, user))) {
          return { status: defines.status.notFound, message: 'Boutique introuvable.', data: null };
        }
        return res;
      });
      let Q = PartnerMediaHelper.apply(guarded, user);
      return coddyger.api(reply, Q);
    }
  });

  // Remove document
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un partner',
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
    preHandler: TokenMiddleware.verify,
    handler: async (request, reply) => {
      let _id: any = request.params.id;

      // [SÉCURITÉ] Suppression réservée au propriétaire (pas au gérant) et à l'admin.
      const partner: any = await loadManagedPartner(reply, _id, request.user, true);
      if (!partner) return;

      let Q = Controller.delete(String(partner._id));
      return coddyger.api(reply, Q);
    }
  });

  // Route spécifique pour mettre à jour les heures d'ouverture
  fastify.route({
    schema: {
      tags,
      summary: "Mettre à jour les heures d'ouverture d'un partenaire",
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          openingHours: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { 
                  type: 'string',
                  enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                },
                isOpen: { type: 'boolean' },
                openTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 09:00)'
                },
                closeTime: { 
                  type: 'string',
                  pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                  description: 'Format: HH:MM (ex: 18:00)'
                },
                breaks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      startTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 12:00)'
                      },
                      endTime: { 
                        type: 'string',
                        pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$',
                        description: 'Format: HH:MM (ex: 13:00)'
                      }
                    },
                    required: ['startTime', 'endTime']
                  }
                }
              },
              required: ['day', 'isOpen']
            }
          }
        },
        required: ['openingHours'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/:id/opening-hours`,
    preHandler: TokenMiddleware.verify,
    handler: async (request, reply) => {
      const id: any = request.params.id;
      const body: any = request.body;

      const partner: any = await loadManagedPartner(reply, id, request.user);
      if (!partner) return;

      let Q = Controller.update(String(partner._id), { openingHours: body.openingHours });
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires par client connecté
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires par client connecté',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let user: any = request.user;

      // Boutiques POSSÉDÉES + GÉRÉES (gérant) : un gérant voit ainsi sa boutique dans yoyo-pro.
      let Q = Controller.getAccessibleByUserId(user._id, { page, pageSize, status });
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Boutiques d'un marchand donné (multi-boutiques) — pour la fiche marchand du CMS
  // et la décision de suppression (dernière boutique ⇒ suppression du compte).
  fastify.route({
    schema: {
      tags,
      summary: "Liste des boutiques d'un marchand (administration)",
      params: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
        additionalProperties: false
      },
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/by-user/:userId`,
    preHandler: TokenMiddleware.can('read', 'pros'),
    handler: (request, reply) => {
      const userId: any = request.params.userId;
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize;
      const status: any = request.query.status;

      const Q = Controller.getByUserId(userId, { page, pageSize, status });
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Boutiques qu'un utilisateur GÈRE en tant que GÉRANT ACTIF (hors celles qu'il possède).
  // Équivalent « gérées » de `GET /partners/me`, interrogeable pour un userId arbitraire.
  fastify.route({
    schema: {
      tags,
      summary: "Boutiques gérées (gérant) par un utilisateur (administration)",
      params: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/managed-by/:userId`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const userId: any = request.params.userId;

      const Q = Controller.getManagedByUserId(userId);
      return coddyger.api(reply, Q);
    }
  });

  // [ADMIN] Créer une boutique rattachée à un marchand EXISTANT. `POST /partners` force le
  // propriétaire = utilisateur connecté ; ici l'admin choisit le marchand cible via l'URL.
  fastify.route({
    schema: {
      tags,
      summary: 'Créer une boutique pour un marchand existant (administration)',
      params: {
        type: 'object',
        properties: { userId: { type: 'string' } },
        required: ['userId'],
        additionalProperties: false
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          description: { type: 'string', maxLength: 1000 },
          ville: { type: 'string', maxLength: 100 },
          address: { type: 'string', maxLength: 200 },
          phone: { type: 'string' },
          email: { type: 'string', anyOf: [{ format: 'email' }, { maxLength: 0 }] },
          categories: { type: 'array', items: { type: 'string' } },
          thumbnail: { type: 'string' },
          photos: { type: 'array', items: { type: 'string' } },
          video: { type: 'string', maxLength: 255 },
          videoPoster: { type: 'string', maxLength: 255 },
          maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
          minOrder: { type: 'number', minimum: 0 },
          maxOrder: { type: 'number', minimum: 0 },
          // Sticker QR collé sur place, à affecter à la nouvelle boutique (un marchand peut avoir
          // plusieurs boutiques, chacune avec son propre sticker).
          qrTagCode: { type: 'string', maxLength: 60 }
        },
        required: ['name'],
        additionalProperties: true
      }
    },
    method: 'POST',
    url: `${routePath}/for-user/:userId`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    handler: (request, reply) => {
      const body: any = request.body;
      const admin: any = request.user;

      const badField = invalidVideoKey(body);
      if (badField) return badVideoKey(reply, badField);

      // Le propriétaire est le marchand ciblé par l'URL ; l'admin est l'auteur de la création.
      body.user = request.params.userId;
      body.createdBy = admin._id;

      // On retire le code sticker du corps avant la création de la boutique (champ non-boutique).
      const qrTagCode = String(body.qrTagCode ?? '').trim();
      delete body.qrTagCode;

      const Q = (async () => {
        const res: any = await Controller.create(body);
        // Le contrôleur renvoie `data: null` ; l'id de la boutique créée est posé sur `body._id` par
        // le service (PartnerService.create). On le lit donc là (sinon enrôlement + sticker ignorés).
        const boutiqueId = body._id ?? body.id ?? res?.data?._id ?? res?.data?.id;
        const createdOk = boutiqueId && [defines.status.created, defines.status.requestOK].includes(res?.status);

        // Trace commerciale : ajouter une boutique à un marchand EXISTANT doit aussi apparaître dans
        // « Mes enrôlements » du commercial (comme un onboarding). Best-effort : un échec n'annule
        // pas la boutique.
        const enrolmentSvc = new EnrolmentService();
        // On n'ajoute notre trace (attribuée au commercial courant) que si le contrôleur ne l'a pas
        // déjà créée pour cette boutique (évite un doublon avec createEnrolmentIfAgentLinked).
        if (createdOk && !(await enrolmentSvc.existsForPartner(String(boutiqueId)))) {
          try {
            const client: any = await new ClientSet().selectOne(
              { _id: request.params.userId },
              'firstname lastname email contact'
            );
            const merchantName = `${client?.firstname ?? ''} ${client?.lastname ?? ''}`.trim();
            const commercialName = `${admin?.firstname ?? ''} ${admin?.lastname ?? ''}`.trim() || admin?.email || 'Commercial';
            // Email facultatif (marchand enrôlé sur place). Le téléphone sert d'identifiant.
            const enr: any = await enrolmentSvc.create({
              client: request.params.userId,
              partner: boutiqueId,
              commercial: admin._id,
              merchantName: merchantName || client?.email || client?.contact || 'Marchand',
              merchantEmail: client?.email || '',
              merchantPhone: client?.contact || '—',
              shopName: String(body.name ?? '') || 'Boutique',
              ville: body.ville,
              commercialName,
              // Marchand déjà actif → la boutique est en ligne tout de suite.
              enrolmentStatus: 'activated',
              activatedAt: new Date()
            } as any);
            if (enr?.error) {
              const msg = enr?.data?.message ?? String(enr?.data ?? 'inconnue');
              LoggerService.log({ type: LogLevel.Error, content: enr.data, location: 'partner.route', method: 'for-user:enrolment' });
              res.data = { ...(res.data ?? {}), enrolmentOk: false, enrolmentError: msg };
            } else {
              res.data = { ...(res.data ?? {}), enrolmentOk: true };
            }
          } catch (e: any) {
            // trace best-effort : on n'échoue pas la création pour une trace manquante
            LoggerService.log({ type: LogLevel.Error, content: e, location: 'partner.route', method: 'for-user:enrolment' });
            res.data = { ...(res.data ?? {}), enrolmentOk: false, enrolmentError: e?.message ?? String(e) };
          }
        }

        // Sticker demandé → on l'affecte à la boutique créée (best-effort).
        if (qrTagCode && createdOk) {
          try {
            const qr: any = await qrTagService.assign(qrTagCode, String(boutiqueId), String(admin._id));
            res.data = { ...(res.data ?? {}), qrAssigned: qr.ok === true, qrMessage: qr.ok ? undefined : qr.message };
          } catch {
            res.data = { ...(res.data ?? {}), qrAssigned: false, qrMessage: "Le sticker n'a pas pu être affecté." };
          }
        }
        return res;
      })();
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires ouverts
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires ouverts à la date actuelle',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          ville: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/open`,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let ville: any = request.query.ville;

      let Q = PartnerMediaHelper.apply(Controller.getOpenPartners({ page, pageSize, ville }), null);
      return coddyger.api(reply, Q);
    }
  });

  // Liste des partenaires sponsorisés
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des partenaires sponsorisés',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          ville: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/sponsored`,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let ville: any = request.query.ville;

      let Q = Controller.getSponsoredPartners({ page, pageSize, ville });
      return coddyger.api(reply, Q);
    }
  });

  // Répartition géographique par ville (admin) — alimente la carte du dashboard
  fastify.route({
    schema: {
      tags,
      summary: 'Répartition géographique des partenaires par ville',
      description: 'Nombre de partenaires par ville avec coordonnées moyennes (admin uniquement)',
      query: {
        type: 'object',
        properties: {
          certified: { type: 'string', enum: ['certified', 'uncertified'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/geo-distribution`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const certified: any = request.query.certified;

      let Q = Controller.getGeoDistribution({ certified });
      return coddyger.api(reply, Q);
    }
  });

  // Statistiques des partenaires (admin) — total + nouveaux sur période avec tendance
  fastify.route({
    schema: {
      tags,
      summary: 'Statistiques des partenaires',
      query: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          certified: { type: 'string', enum: ['certified', 'uncertified'] }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/stats`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const from: any = request.query.from;
      const to: any = request.query.to;
      const certified: any = request.query.certified;

      let Q = Controller.getStats({ from, to, certified });
      return coddyger.api(reply, Q);
    }
  });

  // Recherche de marchands existants (pour rattacher une boutique). Accessible aux détenteurs de
  // `pros` (admin ET commercial), contrairement à la liste des clients (réservée à `clients:read`).
  fastify.route({
    schema: {
      tags,
      summary: 'Rechercher des marchands existants',
      query: {
        type: 'object',
        properties: { q: { type: 'string', maxLength: 100 } },
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/merchants`,
    preHandler: TokenMiddleware.canAny([['read', 'pros'], ['create', 'pros']]),
    handler: (request: any, reply: any) => {
      const q = String(request.query?.q ?? '').trim();
      const Q = (async () => {
        const params: any = { isPartner: true, status: { $nin: ['removed', 'archived', 'anonymized'] } };
        if (q) {
          const rx = { $regex: q, $options: 'i' };
          params.$or = [{ firstname: rx }, { lastname: rx }, { email: rx }, { contact: rx }];
        }
        const dao: any = new ClientSet();
        const data: any = await dao.select({ params, page: 1, pageSize: 20 });
        const rows = (data?.rows ?? []).map((c: any) => ({
          _id: String(c._id),
          firstname: c.firstname ?? '',
          lastname: c.lastname ?? '',
          email: c.email ?? '',
          contact: c.contact ?? ''
        }));
        return { status: defines.status.requestOK, message: { total: rows.length }, data: rows };
      })();
      return coddyger.api(reply, Q);
    }
  });

  // ---------------------------------------------------------------------------------------------
  // Onboarding marchand à distance (commerciaux)
  // ---------------------------------------------------------------------------------------------

  // Créer un marchand + sa boutique et lui envoyer le lien d'activation
  fastify.route({
    schema: {
      tags,
      summary: 'Enrôler un marchand à distance (compte + boutique)',
      description:
        "Réservé aux comptes disposant de la permission `pros:create` (rôle Commercial). Crée le compte marchand sans OTP, sa boutique, puis envoie un lien d'activation par e-mail et SMS. Avec `activateOnSite:true`, le compte est activé immédiatement (mot de passe fourni dans `merchantPassword` ou provisoire renvoyé) : l'e-mail devient facultatif et aucun lien à distance n'est envoyé. L'attribution (`createdBy`) est déduite du jeton.",
      body: {
        type: 'object',
        properties: {
          merchant: {
            type: 'object',
            properties: {
              firstname: { type: 'string', minLength: 2, maxLength: 100 },
              lastname: { type: 'string', minLength: 2, maxLength: 100 },
              email: { type: 'string', format: 'email' },
              contact: { type: 'string', minLength: 8, maxLength: 20 },
              ville: { type: 'string', maxLength: 100 }
            },
            // E-mail non requis : un marchand sans e-mail est enrôlé avec activation sur place.
            required: ['firstname', 'lastname', 'contact'],
            // Verrouillé : sans cela, un corps de requête pourrait tenter d'injecter
            // `createdBy`, `status` ou `isPartner`.
            additionalProperties: false
          },
          shop: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 100 },
              categoryId: { type: 'string' },
              ville: { type: 'string', maxLength: 100 },
              address: { type: 'string', maxLength: 200 },
              phone: { type: 'string', maxLength: 20 },
              description: { type: 'string', maxLength: 1000 },
              // Réduction négociée sur le terrain par le commercial. Plancher à 5 %
              // (cohérent avec le verrou marchand) ; le marchand pourra l'ajuster ensuite.
              maxDiscount: { type: 'number', minimum: 0, maximum: 100 },
              openingHours: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    day: {
                      type: 'string',
                      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                    },
                    isOpen: { type: 'boolean' },
                    openTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                    closeTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                    breaks: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          startTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' },
                          endTime: { type: 'string', pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$' }
                        },
                        required: ['startTime', 'endTime']
                      }
                    }
                  },
                  required: ['day', 'isOpen']
                }
              }
            },
            required: ['name', 'categoryId'],
            additionalProperties: false
          },
          channels: {
            type: 'object',
            properties: {
              email: { type: 'boolean' },
              sms: { type: 'boolean' }
            },
            additionalProperties: false
          },
          // Activation sur place (terrain) : le compte est utilisable immédiatement, sans lien à distance.
          activateOnSite: { type: 'boolean' },
          // Mot de passe choisi sur place avec le marchand. Absent → un code provisoire est généré et renvoyé.
          merchantPassword: { type: 'string', minLength: 6, maxLength: 100 },
          // Code du sticker QR collé sur place, affecté à la boutique créée (optionnel).
          qrTagCode: { type: 'string', maxLength: 60 }
        },
        required: ['merchant', 'shop'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/onboard`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    // Un enrôlement déclenche un e-mail et un SMS : plafonner évite d'en faire un relais de spam.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: (request, reply) => {
      const user: any = request.user;

      let Q = Controller.onboard(request.body, {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email
      });
      return coddyger.api(reply, Q);
    }
  });

  // Vérifier l'état d'un jeton d'activation (sans le consommer). Permet à l'app de ne PAS afficher
  // l'écran de définition du code si le compte est déjà activé (jeton utilisé) ou le lien expiré.
  fastify.route({
    schema: {
      tags,
      summary: "Vérifier un jeton d'activation (sans le consommer)",
      body: {
        type: 'object',
        properties: { token: { type: 'string', minLength: 16, maxLength: 128 } },
        required: ['token'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/activation/check`,
    preHandler: AppCheckMiddleware.verify,
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    handler: (request, reply) => {
      const body: any = request.body;
      let Q = Controller.checkActivation(body.token);
      return coddyger.api(reply, Q);
    }
  });

  // Activation du compte marchand par le porteur du lien
  fastify.route({
    schema: {
      tags,
      summary: "Activer un compte marchand via le lien d'invitation",
      description:
        "Route publique : le marchand n'a pas encore de session. L'autorisation vient du jeton d'activation, à usage unique et expirant.",
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 16, maxLength: 128 },
          // L'app YoYo Pro utilise un code PIN à 6 chiffres comme mot de passe : on l'accepte ici.
          password: { type: 'string', minLength: 4, maxLength: 128 }
        },
        required: ['token', 'password'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/activate`,
    // [App Check] Pas de vérification de jeton utilisateur : le jeton d'activation fait office
    // d'autorisation, le marchand n'a pas encore de session. L'attestation couvre ce que le jeton
    // d'activation ne couvre pas — l'origine de la requête.
    //
    // `verify` et non `verifyLimitedUse` : le jeton d'activation est déjà à usage unique côté
    // serveur, donc une requête rejouée à l'identique échoue de toute façon. Y ajouter la
    // consommation de l'attestation coûterait un aller-retour vers Google sans rien fermer de plus.
    //
    // Le rate-limit ci-dessous reste la défense contre l'énumération de jetons.
    preHandler: AppCheckMiddleware.verify,
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
    handler: (request, reply) => {
      const body: any = request.body;

      let Q = Controller.activate(body.token, body.password);
      return coddyger.api(reply, Q);
    }
  });

  // Renvoyer le lien d'activation (rattrapage d'un envoi échoué)
  fastify.route({
    schema: {
      tags,
      summary: "Renvoyer le lien d'activation d'un enrôlement en attente",
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/resend-activation/:id`,
    preHandler: TokenMiddleware.can('create', 'pros'),
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    // Handler synchrone : `coddyger.api` écrit lui-même dans `reply`, un handler `async` ferait
    // envoyer à Fastify une seconde réponse (vide) en plus de celle-ci.
    handler: (request, reply) => {
      const user: any = request.user;

      let Q = Controller.resendActivation(request.params.id, {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email
      });
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;