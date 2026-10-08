import coddyger, { IErrorObject, defines } from 'coddyger';
import { SettingsService } from './settings.service';
import { ISettings, IYoyoReference } from './settings.interface';
import { AdminSet } from '../admin/admin.model';

const controllerLabel: string = 'SettingsController';

export class SettingsController {
  private readonly service: SettingsService;

  constructor() {
    this.service = new SettingsService();
  }

  /**
   * Récupère la configuration globale (remise min/max…).
   */
  get() {
    return new Promise(async (resolve, reject) => {
      try {
        const settings = await this.service.getSettings();
        resolve({
          status: defines.status.requestOK,
          message: 'Paramètres récupérés',
          data: settings
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'get');
    });
  }

  /**
   * Met à jour la configuration globale. Valide les bornes de remise avant enregistrement.
   */
  update(body: Partial<ISettings>) {
    return new Promise(async (resolve, reject) => {
      try {
        const min = typeof body.discountMin !== 'undefined' ? Number(body.discountMin) : undefined;
        const max = typeof body.discountMax !== 'undefined' ? Number(body.discountMax) : undefined;

        // Cohérence : on lit les valeurs actuelles pour valider même une mise à jour partielle.
        const current = await this.service.getSettings();
        const effMin = typeof min !== 'undefined' ? min : Number(current.discountMin);
        const effMax = typeof max !== 'undefined' ? max : Number(current.discountMax);

        if (Number.isNaN(effMin) || Number.isNaN(effMax)) {
          return resolve({ status: defines.status.badRequest, message: 'Les remises doivent être des nombres.', data: null });
        }
        if (effMin < 0 || effMax > 100) {
          return resolve({ status: defines.status.badRequest, message: 'Les remises doivent être comprises entre 0 % et 100 %.', data: null });
        }
        if (effMin >= effMax) {
          return resolve({ status: defines.status.badRequest, message: 'La remise minimale doit être inférieure à la remise maximale.', data: null });
        }

        // Délai de grâce avant anonymisation (jours). Optionnel : validé seulement s'il est fourni.
        const patch: Partial<ISettings> = { discountMin: effMin, discountMax: effMax };
        if (typeof body.accountDeletionGraceDays !== 'undefined') {
          const grace = Number(body.accountDeletionGraceDays);
          if (!Number.isFinite(grace) || grace < 1 || grace > 3650) {
            return resolve({ status: defines.status.badRequest, message: 'Le délai de suppression doit être compris entre 1 et 3650 jours.', data: null });
          }
          patch.accountDeletionGraceDays = Math.round(grace);
        }

        // Références YOYO de l'inscription Pro. Optionnel : validé seulement s'il est fourni.
        if (typeof body.yoyoReferences !== 'undefined') {
          const result = await this.validateYoyoReferences(body.yoyoReferences);
          if (typeof result === 'string') {
            return resolve({ status: defines.status.badRequest, message: result, data: null });
          }
          patch.yoyoReferences = result;
        }

        const settings = await this.service.update(patch);
        resolve({
          status: defines.status.requestOK,
          message: 'Paramètres mis à jour',
          data: settings
        });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => {
      console.error(e);
      return coddyger.catchReturn(e, controllerLabel, 'update');
    });
  }

  /**
   * Normalise la liste des références YOYO et vérifie que chaque code est le matricule d'un agent
   * actif : c'est ce code que l'app Pro envoie à l'inscription pour rattacher le marchand à l'agent,
   * et l'inscription est refusée s'il ne correspond à aucun agent. Une référence orpheline
   * bloquerait donc toutes les inscriptions qui la choisissent.
   * @returns La liste normalisée, ou le message d'erreur à renvoyer.
   */
  private async validateYoyoReferences(input: unknown): Promise<IYoyoReference[] | string> {
    if (!Array.isArray(input)) {
      return 'La liste des références YOYO est invalide.';
    }

    const references: IYoyoReference[] = input.map((r: any) => {
      const code = String(r?.code ?? '').trim();
      // Libellé facultatif : à défaut, la liste affiche le code.
      return { code, label: String(r?.label ?? '').trim() || code };
    });

    if (references.some((r) => !r.code)) {
      return 'Chaque référence YOYO doit avoir un code.';
    }

    const codes = references.map((r) => r.code);
    const duplicate = codes.find((code, i) => codes.indexOf(code) !== i);
    if (duplicate) {
      return `La référence « ${duplicate} » apparaît plusieurs fois.`;
    }

    if (codes.length) {
      const agents: any = await new AdminSet().selectHug({ matricule: { $in: codes }, status: 'active' });
      if (agents?.error) {
        throw agents;
      }
      const known = new Set((agents as any[]).map((a) => a.matricule));
      const unknown = codes.filter((code) => !known.has(code));
      if (unknown.length) {
        return `Aucun agent actif n'a pour matricule : ${unknown.join(', ')}.`;
      }
    }

    return references;
  }
}
