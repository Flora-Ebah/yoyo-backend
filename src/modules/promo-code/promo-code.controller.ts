import coddyger, { IErrorObject, defines } from 'coddyger';
import { PromoCodeError, PromoFailure, promoCodeService } from './promo-code.service';

const controllerLabel = 'PromoCodeController';

/** Messages affichés dans l'appli Client pour chaque refus d'activation. */
const FAILURE_MESSAGES: Record<PromoFailure, { status: number; message: string }> = {
  'code-invalid': { status: defines.status.badRequest, message: "Ce code n'existe pas ou n'est plus valable." },
  'code-expired': { status: defines.status.badRequest, message: 'Ce code a expiré.' },
  'code-used': { status: defines.status.badRequest, message: 'Ce code a déjà été utilisé.' },
  'code-not-yours': { status: defines.status.badRequest, message: 'Ce code est réservé à un autre numéro de téléphone.' },
  'already-redeemed': { status: defines.status.badRequest, message: 'Vous avez déjà activé un code de cette offre.' },
  'too-many-attempts': { status: 429, message: 'Trop de codes refusés. Réessayez dans une heure.' },
  'account-not-found': { status: defines.status.notFound, message: 'Compte introuvable' }
};

const ok = (data: any, message = 'OK') => ({ status: defines.status.requestOK, message, data });
const notFound = (message: string) => ({ status: defines.status.notFound, message, data: null });
const invalid = (message: string) => ({ status: defines.status.badRequest, message, data: null });

/** Codes cadeaux et YOYO Business : activation (appli Client) et administration (CMS). */
export class PromoCodeController {
  private run(method: string, work: () => Promise<any>) {
    return new Promise(async (resolve, reject) => {
      try {
        resolve(await work());
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, method));
  }

  redeem(userId: string, code: string) {
    return this.run('redeem', async () => {
      try {
        return ok(await promoCodeService.redeem(userId, code), 'Code activé');
      } catch (error) {
        if (!(error instanceof PromoCodeError)) throw error;
        const failure = FAILURE_MESSAGES[error.reason];
        return { status: failure.status, message: failure.message, data: { reason: error.reason } };
      }
    });
  }

  // ===================== Entreprises =====================

  listCompanies() {
    return this.run('listCompanies', async () => ok(await promoCodeService.listCompanies()));
  }

  createCompany(body: any, adminId?: string) {
    return this.run('createCompany', async () => ok(await promoCodeService.createCompany(body, adminId), 'Entreprise créée'));
  }

  updateCompany(id: string, body: any) {
    return this.run('updateCompany', async () => {
      const data = await promoCodeService.updateCompany(id, body);
      return data ? ok(data, 'Entreprise mise à jour') : notFound('Entreprise introuvable');
    });
  }

  companyDetail(id: string) {
    return this.run('companyDetail', async () => {
      const data = await promoCodeService.companyDetail(id);
      return data ? ok(data) : notFound('Entreprise introuvable');
    });
  }

  // ===================== Lots et codes =====================

  listBatches() {
    return this.run('listBatches', async () => ok(await promoCodeService.listBatches()));
  }

  createBatch(body: any, adminId?: string) {
    return this.run('createBatch', async () => {
      const result: any = await promoCodeService.createBatch(body, adminId);
      return result.error ? invalid(result.error) : ok(result, `${result.codes} code(s) créé(s)`);
    });
  }

  batchDetail(id: string) {
    return this.run('batchDetail', async () => {
      const data = await promoCodeService.batchDetail(id);
      return data ? ok(data) : notFound('Lot introuvable');
    });
  }

  setCodeStatus(id: string, status: 'active' | 'disabled') {
    return this.run('setCodeStatus', async () => {
      const data = await promoCodeService.setCodeStatus(id, status);
      return data
        ? ok(data, status === 'active' ? 'Code réactivé' : 'Code désactivé')
        : invalid('Code introuvable, déjà utilisé ou déjà dans cet état.');
    });
  }

  reassign(id: string, body: any) {
    return this.run('reassign', async () => {
      const data: any = await promoCodeService.reassign(id, body);
      if (data?.error) return invalid(data.error);
      return data ? ok(data, 'Code réattribué') : invalid('Code introuvable ou déjà utilisé : il ne peut pas être réattribué.');
    });
  }

  revokeRedemption(id: string, reason: string) {
    return this.run('revokeRedemption', async () =>
      (await promoCodeService.revokeRedemption(id, reason.trim()))
        ? ok(null, 'Activation annulée')
        : invalid('Activation introuvable ou déjà annulée.')
    );
  }
}
