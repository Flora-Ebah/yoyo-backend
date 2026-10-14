import { expect } from 'chai';
import jwt from 'jsonwebtoken';
import { env } from 'coddyger';
import { ScanTokenHelper } from '../helpers/scan-token.helper';

/**
 * [SÉCURITÉ niveau 2] Jetons de scan du QR marchand.
 *
 * Verrouille les garanties du helper, sans base de données :
 *  - un jeton `scan` et un jeton `redeem` portent bien leur `typ` et leurs claims ;
 *  - l'anti-réutilisation croisée : un jeton `scan` ne passe pas comme `redeem` (et inversement) ;
 *  - un jeton expiré est distingué (`expired`) d'un jeton invalide (`invalid`) ;
 *  - un jeton signé avec un autre secret est rejeté.
 */
describe('[Sécurité] Jetons de scan du QR marchand', () => {
	const BOUTIQUE_ID = '507f1f77bcf86cd799439034';
	const USER_ID = '507f1f77bcf86cd799439032';

	it('signe un jeton scan nominatif de la boutique, vérifiable', () => {
		const token = ScanTokenHelper.signScan(BOUTIQUE_ID);
		const res = ScanTokenHelper.verify(token, 'scan');

		expect(res.payload).to.exist;
		expect(res.payload.typ).to.equal('scan');
		expect(String(res.payload.boutiqueId)).to.equal(BOUTIQUE_ID);
	});

	it('signe une session redeem liant boutique et client', () => {
		const token = ScanTokenHelper.signRedeem(BOUTIQUE_ID, USER_ID);
		const res = ScanTokenHelper.verify(token, 'redeem');

		expect(res.payload).to.exist;
		expect(res.payload.typ).to.equal('redeem');
		expect(String(res.payload.boutiqueId)).to.equal(BOUTIQUE_ID);
		expect(String(res.payload.userId)).to.equal(USER_ID);
	});

	it('refuse la réutilisation croisée scan ↔ redeem', () => {
		const scan = ScanTokenHelper.signScan(BOUTIQUE_ID);
		const redeem = ScanTokenHelper.signRedeem(BOUTIQUE_ID, USER_ID);

		expect(ScanTokenHelper.verify(scan, 'redeem').invalid, 'un scan ne vaut pas une session').to.be.true;
		expect(ScanTokenHelper.verify(redeem, 'scan').invalid, 'une session ne vaut pas un scan').to.be.true;
	});

	it('distingue un jeton expiré d\'un jeton invalide', () => {
		// Jeton scan déjà expiré (émis dans le passé avec un TTL négatif).
		const expired = jwt.sign({ typ: 'scan', boutiqueId: BOUTIQUE_ID }, env.jwt.secret!, { expiresIn: -10 });
		expect(ScanTokenHelper.verify(expired, 'scan').expired).to.be.true;

		expect(ScanTokenHelper.verify('pas-un-jwt', 'scan').invalid).to.be.true;
		expect(ScanTokenHelper.verify('', 'scan').invalid).to.be.true;
	});

	it('refuse un jeton signé avec un autre secret', () => {
		const forged = jwt.sign({ typ: 'scan', boutiqueId: BOUTIQUE_ID }, 'autre-secret', { expiresIn: 30 });
		expect(ScanTokenHelper.verify(forged, 'scan').invalid).to.be.true;
	});

	it('refuse un payload sans boutiqueId valide', () => {
		const bad = jwt.sign({ typ: 'scan', boutiqueId: 'xyz' }, env.jwt.secret!, { expiresIn: 30 });
		expect(ScanTokenHelper.verify(bad, 'scan').invalid).to.be.true;
	});
});
