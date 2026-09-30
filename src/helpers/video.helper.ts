import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/**
 * Contrôle des vidéos envoyées, par ffprobe / ffmpeg (installés dans l'image Docker).
 *
 * `execFile` et non `exec` : aucun shell n'intervient, et le chemin passé est celui du temporaire
 * multer (nom aléatoire), jamais une valeur fournie par l'utilisateur.
 */

export class VideoError extends Error {}

/** Délai maximal d'un appel ffprobe/ffmpeg : une vidéo piégée ne doit pas bloquer le serveur. */
const TOOL_TIMEOUT_MS = 30_000;

const toolError = (error: any, tool: string): Error =>
	error?.code === 'ENOENT'
		? new Error(`${tool} introuvable sur le serveur : traitement vidéo indisponible`)
		: new VideoError('Fichier vidéo illisible ou corrompu');

/** Durée réelle (secondes) d'une vidéo ; échoue si le fichier ne contient aucune piste vidéo. */
export const probeVideo = async (file: string): Promise<{ duration: number }> => {
	let stdout: string;
	try {
		({ stdout } = await run(
			'ffprobe',
			['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file],
			{ timeout: TOOL_TIMEOUT_MS }
		));
	} catch (error) {
		throw toolError(error, 'ffprobe');
	}

	const info = JSON.parse(stdout || '{}');
	const hasVideo = (info.streams ?? []).some((stream: any) => stream.codec_type === 'video');
	const duration = Number(info.format?.duration);

	if (!hasVideo || !Number.isFinite(duration) || duration <= 0) {
		throw new VideoError('Fichier vidéo illisible ou corrompu');
	}
	return { duration };
};

/** Extrait une image d'aperçu (JPEG, 720 px de large) prise vers la 1re seconde. */
export const extractPoster = async (file: string, output: string, duration: number): Promise<void> => {
	const at = Math.min(1, duration / 2).toFixed(2);
	try {
		await run(
			'ffmpeg',
			['-v', 'error', '-ss', at, '-i', file, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', '-y', output],
			{ timeout: TOOL_TIMEOUT_MS }
		);
	} catch (error) {
		throw toolError(error, 'ffmpeg');
	}
};

/** Tolérance sur la durée : les conteneurs arrondissent (19,99 s annoncées « 20 s » par le téléphone). */
export const DURATION_TOLERANCE_SECONDS = 0.5;
