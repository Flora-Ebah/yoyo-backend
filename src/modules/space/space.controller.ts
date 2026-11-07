import coddyger, { defines, IErrorObject } from 'coddyger';
import { SpaceService } from './space.service';
import { ISpace } from './space.interface';

const controllerLabel = 'SpaceController';

const sanitize = (body: any): Partial<ISpace> => ({
  label: typeof body?.label === 'string' ? body.label.trim() : undefined,
  roleLabel: typeof body?.roleLabel === 'string' ? body.roleLabel.trim() : undefined,
  landing: typeof body?.landing === 'string' ? body.landing.trim() : undefined,
  requires: Array.isArray(body?.requires)
    ? body.requires.filter((r: any) => r?.subject && r?.action).map((r: any) => ({ subject: String(r.subject), action: String(r.action) }))
    : undefined,
  excludes: Array.isArray(body?.excludes) ? body.excludes.filter((s: any) => typeof s === 'string') : undefined,
  order: typeof body?.order === 'number' ? body.order : undefined,
  status: body?.status,
});

export class SpaceController {
  private readonly service = new SpaceService();

  list() {
    return new Promise(async (resolve) => {
      const rows = await this.service.getAll();
      resolve({ status: defines.status.requestOK, message: 'OK', data: rows });
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'list'));
  }

  create(body: any) {
    return new Promise(async (resolve) => {
      const data = sanitize(body);
      if (!data.label || !data.landing) {
        return resolve({ status: defines.status.badRequest, message: 'Nom et page d’accueil requis.', data: null });
      }
      const res: any = await this.service.create({ requires: [], excludes: [], ...data } as ISpace);
      if (res?.error) return resolve({ status: defines.status.serverError, message: 'Création impossible.', data: null });
      resolve({ status: defines.status.created, message: 'Espace créé.', data: res });
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'create'));
  }

  update(body: any) {
    return new Promise(async (resolve) => {
      const id = String(body?._id ?? '');
      if (!coddyger.string.isValidObjectId(id)) {
        return resolve({ status: defines.status.badRequest, message: 'Identifiant invalide.', data: null });
      }
      if (!(await this.service.existsRaw(id))) {
        return resolve({ status: defines.status.notFound, message: 'Espace introuvable.', data: null });
      }
      const res: any = await this.service.update(id, sanitize(body));
      if (res?.error) return resolve({ status: defines.status.serverError, message: 'Mise à jour impossible.', data: null });
      resolve({ status: defines.status.requestOK, message: 'Espace mis à jour.', data: null });
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'update'));
  }

  delete(id: string) {
    return new Promise(async (resolve) => {
      if (!coddyger.string.isValidObjectId(id)) {
        return resolve({ status: defines.status.badRequest, message: 'Identifiant invalide.', data: null });
      }
      if (!(await this.service.existsRaw(id))) {
        return resolve({ status: defines.status.notFound, message: 'Espace introuvable.', data: null });
      }
      await this.service.delete(id);
      resolve({ status: defines.status.requestOK, message: 'Espace supprimé.', data: null });
    }).catch((e: IErrorObject) => coddyger.catchReturn(e, controllerLabel, 'delete'));
  }
}
