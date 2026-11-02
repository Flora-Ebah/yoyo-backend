import { expect } from 'chai';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { FileUpload } from '../helpers/file-upload.helper';
import {
	VideoError,
	VideoProbe,
	extractPoster,
	needsTranscode,
	probeVideo,
	transcodeForStreaming
} from '../helpers/video.helper';

const hasFfmpeg = (() => {
	try {
		execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

describe('[Upload] Vidéos de présentation', () => {
	describe('type réel d\'un fichier reçu', () => {
		it('une extension vidéo l\'emporte sur le type déclaré (app Pro : tout en image/jpeg)', () => {
			const file = { originalname: 'presentation.mov', mimetype: 'image/jpeg' };
			expect(FileUpload.contentTypeOf(file)).to.equal('video/quicktime');
			expect(FileUpload.isVideo(FileUpload.contentTypeOf(file))).to.equal(true);
		});

		it('une image garde son type déclaré', () => {
			const file = { originalname: 'photo.jpg', mimetype: 'image/jpeg' };
			expect(FileUpload.contentTypeOf(file)).to.equal('image/jpeg');
			expect(FileUpload.isVideo('image/jpeg')).to.equal(false);
		});

		it('un .mov est stocké en .mov (et non .qt)', () => {
			expect(FileUpload.buildExt('video/quicktime')).to.equal('mov');
			expect(FileUpload.buildExt('video/mp4')).to.equal('mp4');
		});
	});

	describe('décision de ré-encodage (profil de diffusion 720p)', () => {
		const conforme: VideoProbe = {
			duration: 20,
			bitRate: 2_600_000,
			video: { codec: 'h264', width: 720, height: 1280, pixFmt: 'yuv420p', fps: 30 },
			audioCodec: 'aac'
		};
		const avec = (patch: Partial<VideoProbe['video']>, rest: Partial<VideoProbe> = {}): VideoProbe => ({
			...conforme,
			...rest,
			video: { ...conforme.video, ...patch }
		});

		it('ne ré-encode pas une vidéo déjà conforme (rattrapage idempotent)', () => {
			expect(needsTranscode(conforme)).to.equal(false);
			expect(needsTranscode({ ...conforme, audioCodec: null })).to.equal(false);
			expect(needsTranscode(avec({ width: 1280, height: 720, fps: 29.97 }))).to.equal(false);
		});

		it('ré-encode une vidéo de téléphone 1080p / 4K', () => {
			expect(needsTranscode(avec({ width: 1080, height: 1920 }))).to.equal(true);
			expect(needsTranscode(avec({ width: 3840, height: 2160 }))).to.equal(true);
		});

		it('ré-encode le HEVC, le 10 bits, le 60 i/s, un débit trop élevé ou un audio non AAC', () => {
			expect(needsTranscode(avec({ codec: 'hevc' }))).to.equal(true);
			expect(needsTranscode(avec({ pixFmt: 'yuv420p10le' }))).to.equal(true);
			expect(needsTranscode(avec({ fps: 60 }))).to.equal(true);
			expect(needsTranscode({ ...conforme, bitRate: 12_000_000 })).to.equal(true);
			expect(needsTranscode({ ...conforme, bitRate: 0 })).to.equal(true);
			expect(needsTranscode({ ...conforme, audioCodec: 'pcm_s16le' })).to.equal(true);
		});
	});

	/**
	 * Nécessitent ffmpeg (présent dans l'image Docker, pas forcément sur un poste de dev).
	 * Les vidéos d'essai sont générées à la volée : aucun fichier binaire dans le dépôt.
	 */
	describe('contrôle par ffprobe', function () {
		const dir = path.join(os.tmpdir(), `yoyo-video-${crypto.randomBytes(4).toString('hex')}`);

		before(function () {
			if (!hasFfmpeg) this.skip();
			fs.mkdirSync(dir, { recursive: true });
		});
		after(() => fs.rmSync(dir, { recursive: true, force: true }));

		const makeVideo = (seconds: number): string => {
			const file = path.join(dir, `${seconds}s.mp4`);
			execFileSync('ffmpeg', [
				'-v', 'error', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=320x240:rate=10`,
				'-pix_fmt', 'yuv420p', '-y', file
			]);
			return file;
		};

		it('mesure la durée réelle', async () => {
			const { duration } = await probeVideo(makeVideo(5));
			expect(duration).to.be.closeTo(5, 0.2);
		});

		it('mesure une vidéo trop longue', async () => {
			const { duration } = await probeVideo(makeVideo(25));
			expect(duration).to.be.greaterThan(20.5);
		});

		it('refuse un fichier qui n\'est pas une vidéo', async () => {
			const fake = path.join(dir, 'faux.mp4');
			fs.writeFileSync(fake, 'ceci n\'est pas une vidéo');
			let error: any;
			try {
				await probeVideo(fake);
			} catch (e) {
				error = e;
			}
			expect(error).to.be.instanceOf(VideoError);
		});

		it('refuse une vidéo à plusieurs pistes vidéo (piste modérée ≠ piste diffusée)', async () => {
			const file = path.join(dir, 'deux-pistes.mp4');
			execFileSync('ffmpeg', [
				'-v', 'error',
				'-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10',
				'-f', 'lavfi', '-i', 'testsrc2=duration=1:size=640x480:rate=10',
				'-map', '0:v', '-map', '1:v', '-pix_fmt', 'yuv420p', '-y', file
			]);
			let error: any;
			try {
				await probeVideo(file);
			} catch (e) {
				error = e;
			}
			expect(error).to.be.instanceOf(VideoError);
			expect(error.message).to.match(/plusieurs pistes/);
		});

		it('borne la file de ré-encodage : au-delà, échec immédiat (repli sur le remux)', async function () {
			this.timeout(120_000);
			const source = makeVideo(2);
			const runs = Array.from({ length: 4 }, (_, i) =>
				transcodeForStreaming(source, path.join(dir, `file-${i}.mp4`)).then(
					() => 'ok',
					(e: Error) => e.message
				)
			);
			const results = await Promise.all(runs);
			expect(results.slice(0, 3)).to.deep.equal(['ok', 'ok', 'ok']);
			expect(results[3]).to.equal('File de ré-encodage pleine');
			// La place est rendue une fois les ré-encodages terminés.
			await transcodeForStreaming(source, path.join(dir, 'file-apres.mp4'));
		});

		it('extrait une image d\'aperçu JPEG', async () => {
			const video = makeVideo(3);
			const poster = path.join(dir, 'poster.jpg');
			await extractPoster(video, poster, 3);
			const header = fs.readFileSync(poster).subarray(0, 3);
			expect([...header]).to.deep.equal([0xff, 0xd8, 0xff]);
		});

		describe('ré-encodage au profil de diffusion', function () {
			this.timeout(120_000);

			/** Vidéo d'essai « téléphone » (.mov) : grande, 60 i/s, ~20 Mbit/s, son PCM non compressé. */
			const makePhoneVideo = (name: string, size: string): string => {
				const file = path.join(dir, name);
				execFileSync('ffmpeg', [
					'-v', 'error',
					'-f', 'lavfi', '-i', `testsrc2=duration=3:size=${size}:rate=60`,
					'-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
					'-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '20M',
					'-c:a', 'pcm_s16le', '-shortest', '-y', file
				]);
				return file;
			};

			it('ramène une vidéo portrait 1080×1920 / 60 i/s en 720×1280 / 30 i/s, H.264 + AAC', async () => {
				const source = makePhoneVideo('portrait.mov', '1080x1920');
				expect(needsTranscode(await probeVideo(source))).to.equal(true);

				const out = path.join(dir, 'portrait-720.mp4');
				await transcodeForStreaming(source, out);
				const probe = await probeVideo(out);

				expect(probe.video.codec).to.equal('h264');
				expect(probe.video.pixFmt).to.equal('yuv420p');
				expect([probe.video.width, probe.video.height]).to.deep.equal([720, 1280]);
				expect(probe.video.fps).to.be.at.most(30.5);
				expect(probe.audioCodec).to.equal('aac');
				expect(probe.duration).to.be.closeTo(3, 0.3);
				expect(fs.statSync(out).size).to.be.lessThan(fs.statSync(source).size);
				// Profil atteint : un second passage (rattrapage) ne ré-encoderait pas.
				expect(needsTranscode(probe)).to.equal(false);
			});

			it('ramène une vidéo paysage 1920×1080 en 1280×720', async () => {
				const out = path.join(dir, 'paysage-720.mp4');
				await transcodeForStreaming(makePhoneVideo('paysage.mov', '1920x1080'), out);
				const { video } = await probeVideo(out);
				expect([video.width, video.height]).to.deep.equal([1280, 720]);
			});

			it('n\'agrandit pas une petite vidéo et accepte une vidéo muette', async () => {
				const out = path.join(dir, 'petite.mp4');
				await transcodeForStreaming(makeVideo(2), out); // 320×240, sans piste audio
				const probe = await probeVideo(out);
				expect([probe.video.width, probe.video.height]).to.deep.equal([320, 240]);
				expect(probe.audioCodec).to.equal(null);
			});

			it('place l\'index (moov) en tête de fichier : lecture progressive', async () => {
				const out = path.join(dir, 'faststart.mp4');
				await transcodeForStreaming(makeVideo(2), out);
				const head = fs.readFileSync(out).subarray(0, 64 * 1024).toString('latin1');
				expect(head.indexOf('moov')).to.be.greaterThan(-1);
				expect(head.indexOf('moov')).to.be.lessThan(head.indexOf('mdat'));
			});
		});
	});
});
