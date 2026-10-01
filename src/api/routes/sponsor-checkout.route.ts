import coddyger from 'coddyger';
import { SponsorCheckoutController } from '../../modules/sponsor-checkout/sponsor-checkout.controller';
import { TransactionController } from '../../modules/transaction/transaction.controller';
import { TokenMiddleware } from '../middleware';

const routePath = '/boutique-sponsors';
const Controller: SponsorCheckoutController = new SponsorCheckoutController();
const TxController: TransactionController = new TransactionController();
const tags: string[] = ['Mise en avant boutique (#2)'];

/**
 * [MISE EN AVANT] Parcours marchand SELF-SERVICE avec paiement.
 *
 * Fichier/route NEUFS (déploiement fiable) : on n'altère pas le fichier admin existant
 * (`boutique-sponsor.route.ts`) ; la route admin `POST /boutique-sponsors` reste inchangée.
 *
 * Le marchand authentifié (`TokenMiddleware.verify`, PAS verifyAdmin) initie le paiement de la
 * mise en avant de SA boutique. Le paiement réutilise l'infrastructure Orange Money des
 * abonnements : la confirmation (statut vérifié côté serveur) et l'activation idempotente passent
 * par les routes partagées `GET /transactions/payment-return` (retour navigateur) et
 * `POST /transactions/payment-notify` (notification prestataire). Une route de statut namespacée
 * est fournie pour permettre au marchand de sonder/confirmer son paiement.
 */
const defaultRoute: any = (fastify: any, options, done) => {
  // Initier le paiement d'une mise en avant (marchand)
  fastify.route({
    schema: {
      tags,
      summary: 'Souscrire à une mise en avant pour sa boutique (paiement)',
      description:
        "Initie le paiement d'une formule de mise en avant pour la boutique du marchand connecté. " +
        "Le montant est lu depuis la formule en base (jamais du client). Retourne l'URL de paiement.",
      body: {
        type: 'object',
        properties: {
          boutiqueId: { type: 'string' },
          sponsorPlanId: { type: 'string' }
        },
        required: ['boutiqueId', 'sponsorPlanId'],
        additionalProperties: false
      }
    },
    method: 'POST',
    url: `${routePath}/checkout`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const merchant: any = request.user;
      const body: any = request.body;
      return coddyger.api(
        reply,
        Controller.checkout(String(merchant._id), String(body.boutiqueId), String(body.sponsorPlanId))
      );
    }
  });

  // Statut / confirmation serveur d'un paiement de mise en avant (marchand).
  // Réutilise la vérification de paiement des transactions : le statut est revérifié auprès
  // d'Orange Money, puis l'activation idempotente de la mise en avant est déclenchée si succès.
  // Le contrôle de propriété (transaction.user === marchand connecté) est appliqué par le
  // contrôleur de transaction (anti-IDOR).
  fastify.route({
    schema: {
      tags,
      summary: "Vérifier le statut d'un paiement de mise en avant",
      params: {
        type: 'object',
        properties: { transactionId: { type: 'string' } },
        required: ['transactionId'],
        additionalProperties: false
      }
    },
    method: 'GET',
    url: `${routePath}/checkout/:transactionId/status`,
    preHandler: TokenMiddleware.verify,
    handler: (request, reply) => {
      const transactionId = String(request.params.transactionId);
      const user: any = request.user;
      return coddyger.api(reply, TxController.checkPaymentStatus(transactionId, user));
    }
  });

  done();
};

export default defaultRoute;
