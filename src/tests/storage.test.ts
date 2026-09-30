import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from 'coddyger';
import { isPublicKey, storage, uploadPath } from '../services/storage/storage.service';
import { sendStoredFile } from '../helpers/file-upload.helper';
import {
	KycFileError,
	documentLink,
	kycKey,
	secureDocumentFile,
	verifyDocumentLink
} from '../modules/certification/certification-files';

/** Faux `reply` Fastify : enregistre ce que la route aurait répondu. */
const fakeReply = () => {
	const state: any = { code: 200, headers: {}, body: undefined, sentFile: undefined, redirect: undefined };
	const reply: any = {
		state,
		code(value: number) { state.code = value; return reply; },
		header(name: string, value: string) { state.headers[name] = value; return reply; },
		send(body: any) { state.body = body; return reply; },
		sendFile(file: string) { state.sentFile = file; return reply; },
		redirect(code: number, url: string) { state.code = code; state.redirect = url; return reply; }
	};
	return reply;
};

const tempFile = async (content = 'contenu'): Promise<string> => {
	const file = path.join(os.tmpdir(), `yoyo-test-${crypto.randomBytes(6).toString('hex')}`);
	await fs.promises.writeFile(file, content);
	return file;
};

const uniqueKey = (ext = 'jpg') => `test-${crypto.randomBytes(8).toString('hex')}.${ext}`;

/**
 * Pilote local uniquement : le pilote S3 est un simple passe-plat vers le SDK AWS, vérifié en
 * recette sur le bucket de développement. Ce qui est testé ici, ce sont les règles d'accès.
 */
describe('[Stockage] Fichiers envoyés', () => {
	const created: string[] = [];
	const previousDriver = process.env.STORAGE_DRIVER;

	before(() => { process.env.STORAGE_DRIVER = 'local'; });
	after(async () => {
		process.env.STORAGE_DRIVER = previousDriver;
		await Promise.all(created.map((key) => storage.delete(key)));
	});

	describe('isPublicKey — seules les clés « plates » sont servies par /file/', () => {
		['a1b2c3.jpg', 'photo_1-2.png', 'video.mov'].forEach((key) =>
			it(`accepte ${key}`, () => expect(isPublicKey(key)).to.equal(true))
		);

		['kyc/a1b2.pdf', '../.env', '..', '.env', 'dossier/fichier.jpg', 'a\\b.jpg', ''].forEach((key) =>
			it(`refuse ${JSON.stringify(key)}`, () => expect(isPublicKey(key)).to.equal(false))
		);
	});

	describe('pilote local', () => {
		it('enregistre, retrouve puis supprime un fichier', async () => {
			const key = uniqueKey();
			created.push(key);
			await storage.put(await tempFile(), key, 'image/jpeg');

			expect(await storage.exists(key)).to.equal(true);
			expect(await storage.localPath(key)).to.equal(path.resolve(uploadPath, key));

			await storage.delete(key);
			expect(await storage.exists(key)).to.equal(false);
		});

		it('refuse une clé qui sortirait du dossier d\'upload', async () => {
			let error: any;
			try {
				await storage.put(await tempFile(), '../../evasion.txt');
			} catch (e) {
				error = e;
			}
			expect(error).to.be.instanceOf(Error);
		});
	});

	describe('GET /file/:filename', () => {
		it('sert un fichier public présent sur le disque', async () => {
			const key = uniqueKey();
			created.push(key);
			await storage.put(await tempFile(), key);

			const reply = fakeReply();
			await sendStoredFile(reply, key);
			expect(reply.state.sentFile).to.equal(key);
		});

		it('ne sert jamais une pièce KYC, même présente', async () => {
			const name = uniqueKey('pdf');
			created.push(kycKey(name));
			await storage.put(await tempFile(), kycKey(name));

			const reply = fakeReply();
			await sendStoredFile(reply, kycKey(name));
			expect(reply.state.code).to.equal(404);
			expect(reply.state.sentFile).to.equal(undefined);
		});
	});

	describe('Pièces KYC', () => {
		it('quittent la zone publique à la soumission du dossier', async () => {
			const name = uniqueKey('pdf');
			created.push(name, kycKey(name));
			await storage.put(await tempFile(), name);

			await secureDocumentFile(name);

			expect(await storage.exists(name)).to.equal(false);
			expect(await storage.exists(kycKey(name))).to.equal(true);
		});

		it('acceptent une nouvelle tentative après déplacement (idempotent)', async () => {
			const name = uniqueKey('pdf');
			created.push(kycKey(name));
			await storage.put(await tempFile(), name);

			await secureDocumentFile(name);
			await secureDocumentFile(name);
			expect(await storage.exists(kycKey(name))).to.equal(true);
		});

		it('refusent un fichier inexistant ou un nom avec chemin', async () => {
			for (const name of [uniqueKey('pdf'), '../secret.pdf', 'kyc/autre.pdf']) {
				let error: any;
				try {
					await secureDocumentFile(name);
				} catch (e) {
					error = e;
				}
				expect(error, name).to.be.instanceOf(KycFileError);
			}
		});

		const tokenOf = (link: string) => link.split('/').pop()!;

		it('un lien émis par documentLink ouvre la pièce', async () => {
			const name = uniqueKey('pdf');
			const request: any = { params: { token: tokenOf(documentLink(name)) } };
			const reply = fakeReply();

			await verifyDocumentLink(request, reply);
			expect(reply.state.code).to.equal(200);
			expect(request.kycKey).to.equal(kycKey(name));
		});

		it('un lien altéré, expiré ou visant une clé publique est refusé', async () => {
			const secret = `${env.jwt.secret}:kyc-file`;
			const tokens = [
				tokenOf(documentLink(uniqueKey('pdf'))) + 'x',
				jwt.sign({ k: kycKey('a.pdf') }, secret, { expiresIn: -10 }),
				jwt.sign({ k: 'a.pdf' }, secret),
				jwt.sign({ k: 'kyc/../../.env' }, secret),
				// Un jeton de session (autre secret) n'ouvre pas une pièce.
				jwt.sign({ k: kycKey('a.pdf') }, env.jwt.secret!)
			];

			for (const token of tokens) {
				const request: any = { params: { token } };
				const reply = fakeReply();
				await verifyDocumentLink(request, reply);
				expect(reply.state.code, token).to.equal(403);
				expect(request.kycKey).to.equal(undefined);
			}
		});
	});
});
