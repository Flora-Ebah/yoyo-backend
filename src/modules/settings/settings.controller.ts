import coddyger, { IErrorObject, defines } from 'coddyger';
import { SettingsService } from './settings.service';
import { ISettings } from './settings.interface';

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

        const settings = await this.service.update({ discountMin: effMin, discountMax: effMax });
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
}
