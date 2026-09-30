import coddyger, { IErrorObject, defines } from 'coddyger';
import { PlatformConfigService } from './platform-config.service';
import { IPlatformConfig } from './platform-config.interface';

const controllerLabel: string = 'PlatformConfigController';

export class PlatformConfigController {
  private readonly service: PlatformConfigService;

  constructor() {
    this.service = new PlatformConfigService();
  }

  get() {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.get();
        resolve({ status: defines.status.requestOK, message: 'OK', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'get'));
  }

  update(item: Partial<IPlatformConfig>) {
    return new Promise(async (resolve, reject) => {
      try {
        const data = await this.service.update(item);
        resolve({ status: defines.status.requestOK, message: 'Configuration mise à jour.', data });
      } catch (error) {
        reject(error);
      }
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'update'));
  }
}
