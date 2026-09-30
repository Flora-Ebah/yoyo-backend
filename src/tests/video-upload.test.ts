import { expect } from 'chai';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { FileUpload } from '../helpers/file-upload.helper';
import { VideoError, extractPoster, probeVideo } from '../helpers/video.helper';

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

		it('extrait une image d\'aperçu JPEG', async () => {
			const video = makeVideo(3);
			const poster = path.join(dir, 'poster.jpg');
			await extractPoster(video, poster, 3);
			const header = fs.readFileSync(poster).subarray(0, 3);
			expect([...header]).to.deep.equal([0xff, 0xd8, 0xff]);
		});
	});
});
