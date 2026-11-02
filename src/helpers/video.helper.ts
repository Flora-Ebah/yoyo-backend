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

/** Caractéristiques d'une vidéo utiles pour décider d'un ré-encodage. */
export interface VideoProbe {
	/** Durée réelle, en secondes. */
	duration: number;
	/** Débit global du fichier (bit/s), 0 si inconnu. */
	bitRate: number;
	video: { codec: string; width: number; height: number; pixFmt: string; fps: number };
	/** Codec de la 1re piste audio, `null` si la vidéo est muette. */
	audioCodec: string | null;
}

const toNumber = (value: any): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

/** « 30000/1001 » → 29,97 ; 0 si absent ou illisible. */
const parseRate = (rate: any): number => {
	const [num, den] = String(rate ?? '').split('/').map(Number);
	return num > 0 && den > 0 ? num / den : 0;
};

/** Durée réelle et caractéristiques d'une vidéo ; échoue si le fichier ne contient aucune piste vidéo. */
export const probeVideo = async (file: string): Promise<VideoProbe> => {
	let stdout: string;
	try {
		({ stdout } = await run(
			'ffprobe',
			[
				'-v', 'error',
				'-show_entries', 'format=duration,bit_rate:stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate',
				'-of', 'json',
				file
			],
			{ timeout: TOOL_TIMEOUT_MS }
		));
	} catch (error) {
		throw toolError(error, 'ffprobe');
	}

	const info = JSON.parse(stdout || '{}');
	const streams: any[] = info.streams ?? [];
	const video = streams.find((stream) => stream.codec_type === 'video');
	const audio = streams.find((stream) => stream.codec_type === 'audio');
	const duration = Number(info.format?.duration);

	if (!video || !Number.isFinite(duration) || duration <= 0) {
		throw new VideoError('Fichier vidéo illisible ou corrompu');
	}
	return {
		duration,
		bitRate: toNumber(info.format?.bit_rate),
		video: {
			codec: String(video.codec_name ?? ''),
			width: toNumber(video.width),
			height: toNumber(video.height),
			pixFmt: String(video.pix_fmt ?? ''),
			fps: parseRate(video.avg_frame_rate)
		},
		audioCodec: audio ? String(audio.codec_name ?? '') : null
	};
};

/**
 * Profil de diffusion des vidéos de boutique : ce que le téléphone télécharge réellement.
 *
 * Une vidéo de téléphone (1080p/4K, HEVC, 15 à 50 Mbit/s) pèse 40 à 120 Mo pour 20 s : sur une 4G
 * moyenne le lecteur s'interrompt sans cesse pour recharger. Ramenée en H.264 720p plafonné à
 * ~2,5 Mbit/s, la même vidéo pèse ~6 Mo, se lit sur tous les Android (HEVC et 10 bits ne le sont
 * pas partout) et reste nette sur un écran de téléphone.
 *
 * Le poids final dépend du DÉBIT, pas de la durée réglée au BO : poids ≈ débit × durée.
 */
export const VIDEO_TARGET = {
	/** Plus petit côté (720 = « 720p », en paysage comme en portrait). */
	shortSide: 720,
	/** Plafond d'images par seconde (les 60 i/s doublent le débit sans gain visible ici). */
	maxFps: 30,
	/** Débit vidéo maximal (bit/s) et tampon du contrôle de débit. */
	maxVideoBitRate: 2_500_000,
	bufSize: 5_000_000,
	/** Qualité visée (x264) : 23 = très bon, 28 = correct ; 26 est un bon compromis mobile. */
	crf: 26,
	audioBitRate: 128_000,
	/** Débit global en dessous duquel un fichier déjà conforme n'est pas ré-encodé. */
	acceptedTotalBitRate: 3_200_000
};

/**
 * Faut-il ré-encoder ? Non si la vidéo est déjà au profil de diffusion (H.264 8 bits, ≤ 720p,
 * ≤ 30 i/s, débit raisonnable, audio AAC ou muette) : on se contente alors du remux faststart.
 * Rend le rattrapage idempotent et évite de dégrader une vidéo déjà optimisée.
 */
export const needsTranscode = (probe: VideoProbe): boolean => {
	const { video, bitRate, audioCodec } = probe;
	const shortSide = Math.min(video.width, video.height);
	return !(
		video.codec === 'h264' &&
		video.pixFmt === 'yuv420p' &&
		shortSide > 0 &&
		shortSide <= VIDEO_TARGET.shortSide &&
		video.fps <= VIDEO_TARGET.maxFps + 1 &&
		bitRate > 0 &&
		bitRate <= VIDEO_TARGET.acceptedTotalBitRate &&
		(audioCodec === null || audioCodec === 'aac')
	);
};

/** Délai maximal d'un ré-encodage : une source 4K HEVC de 20 s demande plusieurs dizaines de secondes. */
const TRANSCODE_TIMEOUT_MS = 180_000;

/**
 * Cœurs alloués à un ré-encodage. ffmpeg tourne hors de la boucle d'événements Node, mais il
 * partage le CPU du VPS avec l'API : on le bride pour que les autres requêtes restent fluides.
 */
const TRANSCODE_THREADS = '2';

/** Un seul ré-encodage à la fois : plusieurs envois simultanés attendent leur tour. */
let transcodeQueue: Promise<unknown> = Promise.resolve();

/**
 * Ré-encode une vidéo au profil de diffusion (`VIDEO_TARGET`), en MP4 « faststart » :
 * H.264 High 8 bits, plus petit côté ramené à 720 px (jamais agrandi), 30 i/s au plus, débit
 * plafonné, AAC stéréo 128 kbit/s. La rotation du téléphone est appliquée aux pixels (portrait
 * conservé) et les métadonnées sont retirées — dont la position GPS que les iPhone y inscrivent.
 *
 * Lève via `toolError`. L'appelant décide du repli (voir `main.controller.ts`).
 */
export const transcodeForStreaming = (input: string, output: string): Promise<void> => {
	const task = transcodeQueue.then(async () => {
		const side = VIDEO_TARGET.shortSide;
		// Paysage : hauteur ramenée à 720 ; portrait : largeur. `-2` garde le ratio en dimension paire
		// (exigée par yuv420p) ; `trunc(…/2)*2` rend paire une source étroite non agrandie.
		const scale =
			`scale='if(gte(iw,ih),-2,trunc(min(${side},iw)/2)*2)'` +
			`:'if(gte(iw,ih),trunc(min(${side},ih)/2)*2,-2)'`;
		try {
			await run(
				'ffmpeg',
				[
					'-v', 'error',
					'-i', input,
					'-map', '0:v:0',
					'-map', '0:a:0?',
					'-map_metadata', '-1',
					'-vf', scale,
					'-fpsmax', String(VIDEO_TARGET.maxFps),
					'-c:v', 'libx264',
					'-preset', 'veryfast',
					'-profile:v', 'high',
					'-pix_fmt', 'yuv420p',
					'-crf', String(VIDEO_TARGET.crf),
					'-maxrate', String(VIDEO_TARGET.maxVideoBitRate),
					'-bufsize', String(VIDEO_TARGET.bufSize),
					'-threads', TRANSCODE_THREADS,
					'-c:a', 'aac',
					'-b:a', String(VIDEO_TARGET.audioBitRate),
					'-ac', '2',
					'-movflags', '+faststart',
					'-y', output
				],
				{ timeout: TRANSCODE_TIMEOUT_MS }
			);
		} catch (error) {
			throw toolError(error, 'ffmpeg');
		}
	});
	// La file continue même si ce ré-encodage échoue.
	transcodeQueue = task.catch(() => undefined);
	return task;
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
