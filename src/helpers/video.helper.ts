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

/**
 * Extrait une image JPEG (1280 px de large au plus) d'une vidéo à l'instant `at` (secondes), ou
 * normalise une image (WebP, PNG lourd…) : ffmpeg lit les deux. Sert à la modération, qui
 * n'accepte que du JPEG/PNG de moins de 5 Mo.
 */
export const extractFrame = async (file: string, output: string, at?: number): Promise<void> => {
	const seek = at !== undefined ? ['-ss', Math.max(0, at).toFixed(2)] : [];
	try {
		await run(
			'ffmpeg',
			['-v', 'error', ...seek, '-i', file, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '4', '-y', output],
			{ timeout: TOOL_TIMEOUT_MS }
		);
	} catch (error) {
		throw toolError(error, 'ffmpeg');
	}
};

/**
 * Remux « faststart » : réécrit le conteneur MP4 en déplaçant l'atome `moov` (l'index) en TÊTE du
 * fichier. Sans cela, le `moov` se trouve en fin de fichier et le lecteur doit tout télécharger
 * avant d'afficher la 1re image (écran noir puis apparition « d'un coup ») ; avec, la lecture
 * démarre progressivement, comportement attendu du feed « Découvrir » (type TikTok).
 *
 * `-c copy` : copie des pistes sans ré-encodage (rapide, sans perte de qualité) ; seul l'ordre des
 * atomes change. L'opération est idempotente et bénigne (relancer sur un fichier déjà faststart ne
 * dégrade rien).
 *
 * Lève via `toolError` (même convention que `extractPoster`). L'appelant décide du caractère
 * bloquant : à l'upload, l'échec du faststart ne doit PAS faire échouer tout l'envoi (la vidéo
 * d'origine reste lisible, simplement moins fluide) — voir `main.controller.ts`.
 */
export const remuxFaststart = async (input: string, output: string): Promise<void> => {
	try {
		await run('ffmpeg', ['-v', 'error', '-i', input, '-c', 'copy', '-movflags', '+faststart', '-y', output], {
			timeout: TOOL_TIMEOUT_MS
		});
	} catch (error) {
		throw toolError(error, 'ffmpeg');
	}
};

/** Tolérance sur la durée : les conteneurs arrondissent (19,99 s annoncées « 20 s » par le téléphone). */
export const DURATION_TOLERANCE_SECONDS = 0.5;
