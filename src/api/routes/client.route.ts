import coddyger, { defines } from 'coddyger';
import { ClientController } from '../../modules/client/client.controller';
import { PasswordResetTokenHelper } from '../../helpers/password-reset-token.helper';
import { AppCheckMiddleware, TokenMiddleware } from '../middleware';

const routePath = '/clients';
const Controller: ClientController = new ClientController();
const tags: string[] = ['Compte client'];

const defaultRoute: any = (fastify: any, options, done) => {
  // Create document
  fastify.route({
    schema: {
      tags,
      summary: "Inscription d'un nouveau client",
			description:
				"Permet de créer un nouveau compte client. Le client doit fournir soit un email soit un numéro de téléphone valide, ainsi qu'un code secret. Si le client existe dans la v2 vous reevrez un message pour le signifier avec un status 200",
      body: {
        type: 'object',
        properties: {
          email: { type: 'string' },
          firstname: { type: 'string' },
          lastname: { type: 'string' },
          password: { type: 'string' },
          contact: { type: 'string' },
          birthdate: { type: 'string' },
          country: { type: 'string' },
          isPartner: { type: 'boolean', default: false }
        },
        required: ['email', 'password', 'contact', 'country'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/register`,
    // [App Check] Route d'avant-connexion : aucune identité utilisateur ne peut la protéger,
    // c'est donc l'attestation de l'application qui la garde — seule, depuis la suppression du
    // jeton public (C-01). Piloté par `APP_CHECK_ENFORCE` / `APP_CHECK_ENFORCE_ROUTES`.
    preHandler: AppCheckMiddleware.verify,
    handler: (request, reply) => {
      let body: any = request.body;

      // [C-01] `body.user` valait `request.user._id`, lu sur le jeton public — dont la charge utile
      // n'a jamais porté de `_id`. Le champ arrivait donc toujours à `undefined` : on le retire.
      let Q = Controller.register(body);
      return coddyger.api(reply, Q);
    }
  });

  // Edit document
  // [SÉCURITÉ F-03] La cible est désignée par `_id` dans le corps de la requête : réservé aux
  // administrateurs. Le client passe par `PUT ${routePath}/me`, qui dérive l'identité du jeton.
  fastify.route({
    schema: {
      tags,
      summary: 'Modifier un client existant (administration)',
      body: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          firstname: { type: 'string' },
          lastname: { type: 'string' },
          address: { type: 'string' },
          country: { type: 'string' },
          gender: { type: 'string' },
          birthdate: { type: 'string' }
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

  fastify.route({
    schema: {
      tags,
      summary: 'Modifier les informations du client connecté',
      // [SÉCURITÉ F-03] Liste blanche stricte. En `additionalProperties: true`, un client pouvait
      // écrire n'importe quel champ du modèle sur son propre compte — dont `isCertified` et
      // `isDocumentVerified`, ce qui contournait la validation KYC verrouillée par F-02.
      body: {
        type: 'object',
        properties: {
          firstname: { type: 'string' },
          lastname: { type: 'string' },
          address: { type: 'string' },
          country: { type: 'string' },
          gender: { type: 'string' },
          birthdate: { type: 'string' },
          avatar: { type: 'string' },
          notificationPreferences: { type: 'object' },
          securityPreferences: { type: 'object' }
        },
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let body: any = request.body;
      const user: any = request.user;
      const _id = user._id;

      body.user = user._id;

      let Q = Controller.update(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  // Update password
  // [SÉCURITÉ F-03] Cette route acceptait un `_id` arbitraire dans le corps de la requête. Comme
  // le parcours « mot de passe oublié » l'appelle avec le jeton public embarqué dans
  // l'application, toute personne capable d'extraire ce jeton du binaire pouvait redéfinir le mot
  // de passe de n'importe quel compte, administrateurs compris.
  //
  // La cible est désormais portée par `resetToken` : un jeton signé par le serveur, émis
  // uniquement par `POST /otp/verify` après un code valide, valable 15 minutes et à usage unique.
  fastify.route({
    schema: {
      tags,
      summary: 'Définir un nouveau mot de passe après vérification du code OTP',
      description:
        "Dernière étape du parcours « mot de passe oublié » : `POST /otp/password-reset/request` → `POST /otp/verify` → `resetToken` → cette route.\n\n" +
        "Requiert le `resetToken` renvoyé par `POST /otp/verify`. Le compte visé est déterminé par ce jeton, jamais par le corps de la requête. Le jeton est valable 15 minutes et ne sert qu'une fois.",
      body: {
        type: 'object',
        properties: {
          resetToken: { type: 'string' },
          // Le secret d'un compte est un code à 6 chiffres, saisi au clavier numérique dans les
          // applications Client et Partenaire. Le seuil de 8 posé par F-03 visait le mot de passe
          // vide ; fixé à 8 il rendait la réinitialisation impossible pour tous les comptes, que
          // `POST /clients/register` crée sans contrainte de longueur. Le balayage du code reste
          // fermé par le plafond de tentatives sur l'OTP et par le débit limité de cette route.
          newPassword: { type: 'string', minLength: 6 },
          confirmPassword: { type: 'string', minLength: 6 }
        },
        required: ['resetToken', 'newPassword', 'confirmPassword'],
        additionalProperties: false
      }
    },
    method: 'PUT',
    url: `${routePath}/updatePassword`,
    // [App Check] Fin du parcours « mot de passe oublié », donc atteignable sans être connecté.
    // `verifyLimitedUse` plutôt que `verify` : rejouer cette requête, c'est reposer un mot de
    // passe choisi par l'attaquant. Le jeton d'attestation y est donc à usage unique.
    // L'autorisation réelle reste le `resetToken` du corps de la requête ; le jeton public qui
    // accompagnait l'appel n'attestait rien et a été supprimé (C-01).
    preHandler: AppCheckMiddleware.verifyLimitedUse,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
    handler: async (request, reply) => {
      const body: any = request.body;
      const resetToken: string = body.resetToken;
      delete body.resetToken;

      // Le jeton ne sert qu'une fois : le consommer avant une validation qui peut échouer
      // obligerait à refaire tout le parcours OTP pour une simple faute de frappe. On règle
      // d'abord ce qui se vérifie sans toucher à la base — aucune fenêtre de rejeu n'est ouverte.
      if (body.newPassword !== body.confirmPassword) {
        return coddyger.api(
          reply,
          Promise.resolve({
            status: defines.status.badRequest,
            message: 'Les deux mots de passe saisis ne correspondent pas.',
            data: null
          })
        );
      }

      const userId = await PasswordResetTokenHelper.consume(resetToken);

      if (!userId) {
        return coddyger.api(
          reply,
          Promise.resolve({
            status: defines.status.authError,
            message: 'Lien de réinitialisation invalide ou expiré. Recommencez la procédure.',
            data: null
          })
        );
      }

      let Q = Controller.updatePassword(userId, body);
      return coddyger.api(reply, Q);
    }
  });

  // Reset password
  fastify.route({
    schema: {
      tags,
      summary: 'Réinitialiser le mot de passe d\'un client',
      body: { 
        type: 'object',
        properties: {
          password: { type: 'string' },
          // Même seuil que `/clients/updatePassword` : voir la note qui l'accompagne.
          newPassword: { type: 'string', minLength: 6 },
        },
        required: ['password', 'newPassword'],
        additionalProperties: false
      }
    },
    method: 'PUT',  
    url: `${routePath}/resetPassword/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      let body: any = request.body;
      const _id = request.user._id;

      let Q = Controller.resetPassword(_id, body);
      return coddyger.api(reply, Q);
    }
  });

  	// Update client phone number
	fastify.route({
		schema: {
			tags,
			summary: "Mise à jour du numéro de téléphone d'un client",
			description:
				"Permet de modifier le numéro de téléphone d'un client existant. Le nouveau numéro doit être un numéro de téléphone ivoirien valide et ne doit pas être déjà utilisé par un autre client.",
			body: {
				type: 'object',
				properties: {
					phoneNumber: { type: 'string' }
				},
				required: ['phoneNumber'],
				additionalProperties: false
			}
		},
		method: 'PATCH',
		url: `${routePath}/update-phone/me`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const { phoneNumber } = request.body;
			const user: any = request.user;

			const Q = Controller.updatePhoneNumber(user._id, phoneNumber);
			return coddyger.api(reply, Q);
		}
	});

	// Update client email
	fastify.route({
		schema: {
			tags,
			summary: "Mise à jour de l'adresse e-mail d'un client",
			description:
				"Permet de modifier l'adresse e-mail d'un client existant. La nouvelle adresse e-mail doit être valide et ne doit pas être déjà utilisée par un autre client.",
			body: {
				type: 'object',
				properties: {
					email: { type: 'string' }
				},
				required: ['email'],
				additionalProperties: false
			}
		},
		method: 'PATCH',
		url: `${routePath}/update-email/me`,
		preHandler: TokenMiddleware.verify,
		handler: (request, reply) => {
			const { email } = request.body;
			const user: any = request.user;

			const Q = Controller.updateEmail(user._id, email);
			return coddyger.api(reply, Q);
		}
	});

  // Document list
  // [SÉCURITÉ F-04] Cette route remonte l'annuaire complet des clients (email, nom, prénom,
  // téléphone) et acceptait tout compte connecté : fuite de la base clients, enjeu RGPD.
  // Seul l'espace d'administration la consomme.
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des clients (administration)',
      query: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          pageSize: { type: 'number' },
          status: { type: 'string' },
          q: { type: 'string' }
        },
        required: [],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let page: any = request.query.page || 1;
      let pageSize: any = request.query.pageSize;
      let status: any = request.query.status;
      let query: any = request.query.q;

      let Q = Controller.getAll({ page, pageSize, status, query });
      return coddyger.api(reply, Q);
    }
  });

  // Document list by status
  // [SÉCURITÉ F-04] Même annuaire, filtré par statut : même restriction.
  fastify.route({
    schema: {
      tags,
      summary: 'Liste des clients par statut (administration)',
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
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const page: any = request.query.page || 1;
      const pageSize: any = request.query.pageSize;
      const status: any = request.query.status;

      let Q = Controller.getAll({ status, page, pageSize });
      return coddyger.api(reply, Q);
    }
  });

  // Document details
  // [SÉCURITÉ F-04] Consultation de la fiche d'un client tiers, désignée par son identifiant :
  // réservé à l'administration. Le client consulte la sienne via `GET ${routePath}/me`.
  fastify.route({
    schema: {
      tags,
      summary: "Détails d'un client par id (administration)",
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
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const _id: any = request.params.id;

      let Q = Controller.getById(_id);
      return coddyger.api(reply, Q);
    }
  });

  fastify.route({
    schema: {
      tags,
      summary: "Détails du client connecté",
    },
    method: 'GET',
    url: `${routePath}/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;

      let Q = Controller.getById(user._id);
      return coddyger.api(reply, Q);
    }
  });

  // Remove document
  // [SÉCURITÉ F-03] Suppression d'un compte tiers : réservé aux administrateurs. Le client
  // supprime le sien via `POST ${routePath}/remove/me`.
  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un client (administration)',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id'],
        additionalProperties: false
      },
      // `reason` est lu dans le corps de la requête par le gestionnaire ; il était déclaré en
      // `params` et donc exigé dans l'URL, ce qui faisait échouer la validation à chaque appel.
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        required: ['reason'],
        additionalProperties: false
      }
    },
    method: 'PATCH',
    url: `${routePath}/remove/:id`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      let _id: any = request.params.id;
      let reason: string = request.body.reason;
      let user: any = request.user;
      let Q = Controller.delete(_id, reason, user._id);
      return coddyger.api(reply, Q);
    }
  });

  fastify.route({
    schema: {
      tags,
      summary: 'Supprimer un client',
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        },
        required: ['reason'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/remove/me`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const user: any = request.user;
      const reason: string = request.body.reason;

      let Q = Controller.delete(user._id, reason, user._id);
      return coddyger.api(reply, Q);
    }
  });

  // Envoyer une notification à un client
  fastify.route({
    schema: {
      tags,
      summary: 'Envoyer une notification à un client',
      description: 'Envoie une notification à un client par email, SMS ou notification push',
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
          message: { type: 'string' },
          type: { 
            type: 'string', 
            enum: ['EMAIL', 'SMS', 'PUSH'],
            default: 'EMAIL'
          }
        },
        required: ['message'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/:id/notify`,
    preHandler: TokenMiddleware.verifyAdmin,
    handler: (request, reply) => {
      const clientId: string = request.params.id;
      const message: string = request.body.message;
      const type: string = request.body.type || 'EMAIL';

      let Q = Controller.sendNotification(clientId, message, type);
      return coddyger.api(reply, Q);
    }
  });

  // Vérifier l'existence d'un compte avec un login (email ou téléphone)
  fastify.route({
    schema: {
      tags: ['Gestion des connexions & création de compte', ...tags],
      summary: 'Vérifier l\'existence d\'un compte',
      description: 'Permet de vérifier si un compte client existe avec le login fourni (email ou numéro de téléphone). Retourne 200 si le compte existe, 400 sinon',
      body: {
        type: 'object',
        properties: {
          login: { type: 'string' }
        },
        required: ['login'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/verify-login`,
    // [SÉCURITÉ F-04] Oracle d'énumération : la route répond « ce compte existe » à un appelant
    // non authentifié. Elle doit le rester — l'application Partenaire l'appelle avant connexion,
    // donc sans jeton (`yoyo-pro-main/services/api.ts`, l'intercepteur n'ajoute l'en-tête que si
    // un jeton est déjà stocké). À défaut de pouvoir l'authentifier, on plafonne le débit pour
    // rendre le balayage de masse impraticable.
    //
    // [App Check] C'est précisément la garantie qui manquait ici : l'attestation dira que
    // l'appel vient d'une application YoYo authentique, sans exiger de compte. Mode observation.
    preHandler: AppCheckMiddleware.verify,
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    },
    handler: (request, reply) => {
      const login: string = request.body.login;
      let Q = Controller.verifyLogin(login);
      return coddyger.api(reply, Q);
    }
  });

  done();
};

export default defaultRoute;