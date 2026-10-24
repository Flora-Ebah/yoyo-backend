import { expect } from 'chai';
import crypto from 'crypto';
import { blockedMedia, decideModeration } from '../services/moderation/moderation-policy';
import { PartnerMediaHelper } from '../helpers/partner-media.helper';
import { renderPaymentReturnPage } from '../modules/transaction/payment-return.view';
import { PushNotificationService } from '../modules/push-notification/push-notification.service';
import { FileUpload, sendStoredFile } from '../helpers/file-upload.helper';
import { TokenMiddleware } from '../api/middleware';
import notificationRoute from '../api/routes/notification.route';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Correctifs issus des remarques des testeurs de l'app Client (octobre 2026).
 */

const fakeReply = () => {
	const state: any = { code: 200, sentFile: undefined };
	const reply: any = {
		state,
		code(value: number) { state.code = value; return reply; },
		header() { return reply; },
		send(body: any) { state.body = body; return reply; },
		sendFile(file: string) { state.sentFile = file; return reply; },
		redirect(code: number, url: string) { state.code = code; state.redirect = url; return reply; }
	};
	return reply;
};

describe('Remarques testeurs — app Client', () => {
	describe('Modération des images (n°18)', () => {
		const thresholds = { reject: 80, flag: 50 };

		it('rejette une nudité explicite au-delà du seuil de rejet', () => {
			const res = decideModeration([{ name: 'Exposed Female Genitalia', parent: 'Explicit Nudity', confidence: 97 }], thresholds);
			expect(res.status).to.equal('rejected');
			expect(res.score).to.equal(97);
		});

		it('reconnaît la taxonomie v7 par la catégorie parente', () => {
			const res = decideModeration([{ name: 'Explicit Sexual Activity', parent: 'Explicit', confidence: 88 }], thresholds);
			expect(res.status).to.equal('rejected');
		});

		it('signale (sans rejeter) un contenu suggestif ou un score intermédiaire', () => {
			expect(decideModeration([{ name: 'Explicit Nudity', confidence: 65 }], thresholds).status).to.equal('flagged');
			expect(decideModeration([{ name: 'Obstructed Intimate Parts', confidence: 90 }], thresholds).status).to.equal('flagged');
		});

		it('approuve une photo de boutique ordinaire', () => {
			expect(decideModeration([], thresholds).status).to.equal('approved');
			expect(decideModeration([{ name: 'Swimwear or Underwear', confidence: 95 }], thresholds).status).to.equal('approved');
			expect(
				decideModeration([{ name: 'Kissing on the Lips', parent: 'Non-Explicit Nudity of Intimate parts and Kissing', confidence: 90 }], thresholds).status
			).to.equal('approved');
		});

		it('ne sert plus un média bloqué par /file/', async () => {
			// Aucun fichier réel : le refus intervient avant tout accès au stockage (le `.env` local
			// peut pointer sur le bucket S3 de dev, qu'un test ne doit pas toucher).
			const key = `test-${crypto.randomBytes(8).toString('hex')}.jpg`;
			try {
				blockedMedia.block([key]);
				const reply = fakeReply();
				await sendStoredFile(reply, key);
				expect(reply.state.code).to.equal(404);
				expect(reply.state.redirect).to.equal(undefined);
				expect(reply.state.sentFile).to.equal(undefined);
			} finally {
				blockedMedia.unblock([key]);
			}
			expect(blockedMedia.isBlocked(key)).to.equal(false);
		});
	});

	describe('Vidéo réservée aux boutiques boostées (n°5)', () => {
		const shop = { _id: 'p1', user: 'owner', video: 'v.mp4', videoPoster: 'v.jpg', isSponsored: false };

		it('masque la vidéo d’une boutique non boostée pour un client', () => {
			const res: any = PartnerMediaHelper.hideVideoIfNotBoosted(shop, { _id: 'client' });
			expect(res.video).to.equal(null);
			expect(res.videoPoster).to.equal(null);
			expect(shop.video).to.equal('v.mp4'); // l'original n'est pas modifié
		});

		it('laisse la vidéo à une boutique boostée, à l’admin et au propriétaire', () => {
			expect((PartnerMediaHelper.hideVideoIfNotBoosted({ ...shop, isSponsored: true }, { _id: 'c' }) as any).video).to.equal('v.mp4');
			expect((PartnerMediaHelper.hideVideoIfNotBoosted(shop, { _id: 'a', isAdmin: true }) as any).video).to.equal('v.mp4');
			expect((PartnerMediaHelper.hideVideoIfNotBoosted(shop, { _id: 'owner' }) as any).video).to.equal('v.mp4');
		});

		it('s’applique aux listes paginées et aux tableaux', async () => {
			const paged: any = await PartnerMediaHelper.apply(Promise.resolve({ status: 200, data: { rows: [shop] } }), null);
			expect(paged.data.rows[0].video).to.equal(null);
			const list: any = await PartnerMediaHelper.apply(Promise.resolve({ status: 200, data: [shop] }), null);
			expect(list.data[0].video).to.equal(null);
		});
	});

	describe('Retour après paiement Wave (n°10)', () => {
		it('propose un bouton de retour vers l’app Client et redirige automatiquement', () => {
			const html = renderPaymentReturnPage({ outcome: 'success', reference: 'abc123', app: 'client' });
			expect(html).to.contain('yoyo://payment-return?tx=abc123');
			expect(html).to.contain('package=com.yoyousers.yoyoafrica');
			expect(html).to.contain('Retourner sur YoYo');
			expect(html).to.contain('setTimeout');
		});

		it('renvoie un boost payé vers l’app Pro, sans redirection automatique en attente', () => {
			const html = renderPaymentReturnPage({ outcome: 'pending', reference: 'x', app: 'pro' });
			expect(html).to.contain('yoyo-pro://');
			expect(html).not.to.contain('setTimeout');
		});

		it('pas de bouton pour un lien invalide', () => {
			expect(renderPaymentReturnPage({ outcome: 'invalid' })).not.to.contain('id="back"');
		});
	});

	describe('Notifications listées (n°13)', () => {
		it('inclut les notifications adressées par `data.userId`', () => {
			const conditions = PushNotificationService.ownedBy('u1');
			expect(conditions).to.deep.include({ 'data.userId': 'u1' });
			expect(conditions).to.deep.include({ 'data.user': 'u1' });
		});

		it('`POST /notifications` (envoi à tous possible) est réservé à l’admin', () => {
			const routes: any[] = [];
			notificationRoute({ route: (d: any) => routes.push(d) }, {}, () => {});
			const create = routes.find((r) => r.method === 'POST' && r.url === '/notifications');
			expect(create.preHandler).to.equal(TokenMiddleware.verifyAdmin);
		});
	});

	describe('Détection des images par leurs octets (modération)', () => {
		const withFile = async (bytes: Buffer, run: (p: string) => Promise<void>) => {
			const p = path.join(os.tmpdir(), `yoyo-sniff-${crypto.randomUUID()}`);
			await fs.writeFile(p, bytes);
			try { await run(p); } finally { await fs.rm(p, { force: true }); }
		};

		it('reconnaît un JPEG même déclaré sous un autre type', async () => {
			await withFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), async (p) => {
				expect(await FileUpload.sniffImageType(p)).to.equal('image/jpeg');
			});
		});

		it('reconnaît un PNG', async () => {
			await withFile(Buffer.from('89504e470d0a1a0a0000', 'hex'), async (p) => {
				expect(await FileUpload.sniffImageType(p)).to.equal('image/png');
			});
		});

		it('ne prend pas un PDF pour une image', async () => {
			await withFile(Buffer.from('%PDF-1.7\n'), async (p) => {
				expect(await FileUpload.sniffImageType(p)).to.equal(null);
			});
		});
	});
});
