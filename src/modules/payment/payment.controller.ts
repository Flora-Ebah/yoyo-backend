import coddyger, { IErrorObject, defines } from 'coddyger';
import { locale } from '../../public';
import { PaymentService } from './payment.service';
import { IPayment } from './payment.interface';

const controllerLabel: string = 'PaymentController';

export class PaymentController {
  private readonly service: PaymentService;

  constructor() {
    this.service = new PaymentService();
  }

  /**
   * Récupère tous les éléments
   * @returns Liste des éléments
   */
  getAll(payloads: { page?: number; pageSize?: number; query?: string; status?: string; from?: string; to?: string; partner?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const items = await this.service.getAll(payloads);
        
        resolve({
          status: defines.status.requestOK,
          message: items.data,
          data: items.rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getAll');
    });
  }

  getOverviewStats(filters?: { status?: string; from?: string; to?: string; query?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const stats = await this.service.getOverviewStats(filters);

        resolve({
          status: defines.status.requestOK,
          message: "Statistiques des paiements récupérées avec succès",
          data: stats
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getOverviewStats');
    });
  }

  getTopPartners(filters?: { from?: string; to?: string; status?: string; limit?: number; certified?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.getTopPartners(filters);

        resolve({
          status: defines.status.requestOK,
          message: 'Top partenaires récupéré avec succès',
          data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getTopPartners');
    });
  }

  /**
   * Récupère un élément par son ID
   * @param id ID de l'élément
   * @returns Élément trouvé ou null
   */
  getById(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const item = await this.service.getById(id);
        
        if (!item) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Payment'),
            data: null
          });
        }
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: item
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getById');
    });
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  /**
   * Initie une demande de réduction après le scan du QR code d'un partenaire.
   *
   * Distingue deux issues, parce que l'appel est idempotent (cf. `PaymentService.create`) :
   * - `201` : la demande vient d'être créée ;
   * - `200` avec `alreadyPending: true` : une demande était déjà en cours chez ce partenaire, on
   *   renvoie celle-là. Ce n'est pas une erreur — le client veut sa réduction, et l'app peut
   *   traiter ce cas comme un succès.
   */
  initiate(item: IPayment) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.create(item);
        if (result.error) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: result
          });
        }

        const { demande, created } = result;

        resolve({
          status: created ? defines.status.created : defines.status.requestOK,
          message: created ? locale.controller.successSave : locale.controller.payment.pendingPayment,
          data: created ? demande : { ...demande, alreadyPending: true }
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'initiate');
    });
  }

  /**
   * Crée un nouvel élément
   * @param item Données de l'élément à créer
   * @returns Élément créé
   */
  create(item: IPayment) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.create(item);

        if (result.error) {
          return resolve({
            status: defines.status.badRequest,
            message: result.message,
            data: result
          });
        }

        resolve({
          status: defines.status.created,
          message: locale.controller.successSave,
          data: result.demande
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'create');
    });
  }

  /**
   * Flux client en un appel : le client valide lui-même sa réduction après avoir scanné la
   * boutique et saisi le prix total. Écrit un ticket `success` et renvoie le ticket.
   *
   * @param from `request.user._id` — issu du jeton, jamais du corps de la requête
   * @param payload `{ to?, amount, redeemSession? }` — la boutique vient du jeton de session si fourni
   */
  redeem(from: string, payload: { to?: string; amount: number; redeemSession?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.redeem(from, payload);

        if (result?.error) {
          return resolve({
            status: PaymentController.errorStatus(result),
            message: result.data,
            data: null
          });
        }

        resolve({
          status: defines.status.created,
          message: locale.controller.payment.redeemed,
          data: result.ticket
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'redeem');
    });
  }

  /**
   * Invalidation a posteriori d'un ticket par le marchand (propriétaire de la boutique).
   *
   * @param id Ticket à invalider
   * @param actorId `request.user._id` — le service vérifie la propriété de la boutique
   */
  invalidate(id: string, actorId?: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.invalidate(id, actorId);

        if (result?.error) {
          return resolve({
            status: PaymentController.errorStatus(result),
            message: result.data,
            data: null
          });
        }

        resolve({
          status: defines.status.requestOK,
          message: locale.controller.payment.invalidated,
          data: result
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'invalidate');
    });
  }

  /**
   * Traduit un descripteur d'erreur du service en code HTTP.
   *
   * `forbidden` : l'appelant ne possède pas la boutique. `conflict` : la demande a déjà été
   * traitée — rejouer la requête ne doit ni réécrire le montant ni renotifier le client.
   */
  private static errorStatus(result: any): number {
    if (result?.forbidden) {
      return defines.status.forbidden;
    }

    if (result?.conflict) {
      return defines.status.conflict;
    }

    // `gone` (410) : jeton/scan expiré — l'app doit re-scanner le QR, pas re-saisir.
    if (result?.gone) {
      return defines.status.gone;
    }

    return defines.status.badRequest;
  }

  /**
   * Émet le jeton `scan` court (30 s) affiché dans le QR de l'app marchand.
   *
   * @param boutiqueId Boutique dont on affiche le QR
   * @param actorId `request.user._id` — le service vérifie la propriété de la boutique
   */
  issueScanToken(boutiqueId: string, actorId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(boutiqueId)) {
          return resolve({ status: defines.status.badRequest, message: locale.wrongObjectId('du partenaire'), data: null });
        }

        const result: any = await this.service.issueScanToken(boutiqueId, actorId);

        if (result?.error) {
          return resolve({
            status: PaymentController.errorStatus(result),
            message: result.data,
            data: null
          });
        }

        resolve({
          status: defines.status.requestOK,
          message: locale.controller.payment.scanTokenIssued,
          data: { token: result.token, expiresIn: result.expiresIn }
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'issueScanToken');
    });
  }

  /**
   * Échange un jeton `scan` (lu dans le QR) contre une session `redeem` liée au client connecté.
   *
   * @param scanToken Jeton `scan` présenté par le client
   * @param userId `request.user._id` du client connecté
   */
  scanVerify(scanToken: string, userId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        const result: any = await this.service.scanVerify(scanToken, userId);

        if (result?.error) {
          return resolve({
            status: PaymentController.errorStatus(result),
            message: result.data,
            data: null
          });
        }

        resolve({
          status: defines.status.requestOK,
          message: locale.controller.payment.scanVerified,
          data: {
            redeemSession: result.redeemSession,
            expiresIn: result.expiresIn,
            boutique: result.boutique
          }
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'scanVerify');
    });
  }

  /**
   * Supprime un élément
   * @param id ID de l'élément à supprimer
   * @returns Résultat de l'opération
   */
  delete(id: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérification de l'ID
        if (!id || !coddyger.string.isValidObjectId(id)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("de l'élément"),
            data: null
          });
        }
        
        // Vérification de l'existence de l'élément
        const existingItem = await this.service.getById(id);
        
        if (!existingItem) {
          return resolve({
            status: defines.status.notFound,
            message: locale.notfound('Demande de paiement'),
            data: null
          });
        }
        
        // Suppression
        await this.service.delete(id);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: null
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'delete');
    });
  }

  /**
   * Récupère les statistiques de paiement d'un client pour un partenaire
   * @param userId ID du client
   * @param partnerId ID du partenaire
   * @returns Statistiques de paiement
   */
  getPaymentStats(userId: string, partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getPaymentStats(userId, partnerId);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPaymentStats');
    });
  }

  /**
   * Récupère le dernier paiement d'un partenaire
   * @param partnerId ID du partenaire
   * @returns Dernier paiement
   */
  getLastPayment(partnerId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getLastPayment(partnerId);
        
        resolve({
          status: defines.status.requestOK,
          message: locale.controller.done,
          data: items.data
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getLastPayment');
    });
  }

  /**
   * Récupère les transactions d'un partenaire
   * @param partnerId ID du partenaire
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  getPartnerTransactions(partnerId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(partnerId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du partenaire"),
            data: null
          });
        }

        const items = await this.service.getPartnerTransactions(partnerId, payloads);
        const rows = items.rows;
        const data = items.data;

        delete data.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: data,
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getPartnerTransactions');
    });
  }

  /**
   * Récupère les transactions d'un client
   * @param clientId ID du client
   * @param payloads Paramètres de pagination et filtres
   * @returns Liste des transactions
   */
  getClientTransactions(clientId: string, payloads: { page?: number; pageSize?: number; status?: string }) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(clientId)) {
          return resolve({
            status: defines.status.badRequest,
            message: locale.wrongObjectId("du client"),
            data: null
          });
        }

        const items = await this.service.getClientTransactions(clientId, payloads);
        const rows = items.rows;
        const data = items.data;

        delete data.rows;
        
        resolve({
          status: defines.status.requestOK,
          message: data,
          data: rows
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getClientTransactions');
    });
  }

  /**
   * Détail d'une transaction du client connecté (404 si elle ne lui appartient pas).
   * @param clientId `request.user._id`
   * @param paymentId Identifiant de la transaction
   */
  getClientTransactionDetails(clientId: string, paymentId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(paymentId)) {
          return resolve({ status: defines.status.badRequest, message: locale.wrongObjectId('de la transaction'), data: null });
        }
        const details = await this.service.getClientTransactionDetails(clientId, paymentId);
        if (!details) {
          return resolve({ status: defines.status.notFound, message: locale.notfound('Transaction'), data: null });
        }
        resolve({ status: defines.status.requestOK, message: 'Transaction', data: details });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'getClientTransactionDetails'));
  }

  /**
   * Économies cumulées du client connecté (tickets validés uniquement).
   * @param clientId `request.user._id`
   */
  getClientSavings(clientId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(clientId)) {
          return resolve({ status: defines.status.badRequest, message: locale.wrongObjectId('du client'), data: null });
        }

        const data = await this.service.getClientSavings(clientId);
        resolve({ status: defines.status.requestOK, message: locale.controller.payment.savings, data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getClientSavings');
    });
  }

  /**
   * Réductions utilisées aujourd'hui / ce mois par le client connecté, et quota journalier.
   * @param clientId `request.user._id`
   */
  getScanUsage(clientId: string) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!coddyger.string.isValidObjectId(clientId)) {
          return resolve({ status: defines.status.badRequest, message: locale.wrongObjectId('du client'), data: null });
        }

        const data = await this.service.getScanUsage(clientId);
        resolve({ status: defines.status.requestOK, message: locale.controller.payment.scanUsage, data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'getScanUsage');
    });
  }
}
