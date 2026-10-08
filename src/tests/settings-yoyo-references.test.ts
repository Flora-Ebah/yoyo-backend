import { expect } from 'chai';
import sinon from 'sinon';
import { SettingsController, SettingsService } from '../modules/settings';
import { AdminSet } from '../modules/admin/admin.model';

/**
 * Références YOYO de l'inscription Pro, éditées depuis le back-office.
 *
 * Chaque code est le matricule d'un agent : l'app Pro l'envoie à l'inscription et le serveur refuse
 * l'inscription s'il ne correspond à aucun agent actif. Une référence orpheline bloquerait donc tous
 * les marchands qui la choisissent : la liste est vérifiée à l'enregistrement.
 */
describe('Paramètres — références YOYO', () => {
	const controller = new SettingsController();
	let selectHug: sinon.SinonStub;
	let update: sinon.SinonStub;

	beforeEach(() => {
		sinon.stub(SettingsService.prototype, 'getSettings').resolves({ discountMin: 10, discountMax: 50 } as any);
		update = sinon.stub(SettingsService.prototype, 'update').callsFake(async (patch: any) => patch);
		selectHug = sinon.stub(AdminSet.prototype, 'selectHug');
	});

	afterEach(() => sinon.restore());

	it('enregistre des références dont chaque code est le matricule d’un agent actif', async () => {
		selectHug.resolves([{ matricule: 'AG-001' }, { matricule: 'AG-014' }]);

		const res: any = await controller.update({
			yoyoReferences: [
				{ code: ' AG-001 ', label: 'Agence Plateau' },
				{ code: 'AG-014', label: '' }
			]
		});

		expect(res.status).to.equal(200);
		expect(selectHug.firstCall.args[0]).to.deep.equal({ matricule: { $in: ['AG-001', 'AG-014'] }, status: 'active' });
		// Code nettoyé ; libellé vide remplacé par le code.
		expect(update.firstCall.args[0].yoyoReferences).to.deep.equal([
			{ code: 'AG-001', label: 'Agence Plateau' },
			{ code: 'AG-014', label: 'AG-014' }
		]);
	});

	it('refuse un code qui ne correspond à aucun agent actif', async () => {
		selectHug.resolves([{ matricule: 'AG-001' }]);

		const res: any = await controller.update({
			yoyoReferences: [{ code: 'AG-001', label: 'A' }, { code: 'AG-999', label: 'B' }]
		});

		expect(res.status).to.equal(400);
		expect(res.message).to.contain('AG-999');
		expect(update.called).to.equal(false);
	});

	it('refuse un code en double', async () => {
		const res: any = await controller.update({
			yoyoReferences: [{ code: 'AG-001', label: 'A' }, { code: 'AG-001', label: 'B' }]
		});

		expect(res.status).to.equal(400);
		expect(selectHug.called).to.equal(false);
		expect(update.called).to.equal(false);
	});

	it('refuse une référence sans code', async () => {
		const res: any = await controller.update({ yoyoReferences: [{ code: '  ', label: 'A' }] });

		expect(res.status).to.equal(400);
		expect(update.called).to.equal(false);
	});

	it('accepte une liste vide sans interroger les agents', async () => {
		const res: any = await controller.update({ yoyoReferences: [] });

		expect(res.status).to.equal(200);
		expect(selectHug.called).to.equal(false);
		expect(update.firstCall.args[0].yoyoReferences).to.deep.equal([]);
	});
});
