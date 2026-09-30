import fs from 'fs';
import path from 'path';
import coddyger from 'coddyger';
import {
	S3Client,
	HeadObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	CopyObjectCommand
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Stockage des fichiers envoyés (images, vidéos, pièces KYC).
 *
 * La base ne connaît que des **clés** (`<hex>.jpg`, `kyc/<hex>.pdf`) ; ce service décide où vivent
 * les octets. Deux pilotes, choisis par `STORAGE_DRIVER` :
 * - `local` : dossier `src/public/uploads/` (comportement historique, développement sans AWS) ;
 * - `s3`    : bucket privé `S3_BUCKET`, lu au travers d'URL signées temporaires.
 *
 * Les clés « plates » sont publiques via `GET /file/:filename` ; tout ce qui est sous `kyc/` ne
 * l'est jamais (voir `isPublicKey`).
 */

export type StorageDriver = 'local' | 's3';

export const uploadPath: string = path.join(coddyger.root() + '/src/public/uploads/');

/** Préfixe des pièces justificatives : jamais servi par la route publique `/file/`. */
export const KYC_PREFIX = 'kyc/';

/** Nom de fichier servi publiquement : pas de dossier, pas de fichier caché, jeu de caractères fermé. */
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,254}$/;

export const isPublicKey = (key: string): boolean => PUBLIC_KEY_PATTERN.test(key) && !key.includes('..');

/** Lecture paresseuse de l'environnement : les tests peuvent le modifier avant le premier appel. */
export const storageDriver = (): StorageDriver =>
	(process.env.STORAGE_DRIVER ?? '').split('#')[0].trim().toLowerCase() === 's3' ? 's3' : 'local';

const signedUrlTtl = (): number => Number(process.env.S3_SIGNED_URL_TTL) || 3600;

const bucket = (): string => {
	const name = (process.env.S3_BUCKET ?? '').trim();
	if (!name) throw new Error('S3_BUCKET manquant alors que STORAGE_DRIVER=s3');
	return name;
};

let client: S3Client | null = null;
const s3 = (): S3Client => {
	if (!client) {
		// Identifiants lus par le SDK dans AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
		client = new S3Client({ region: process.env.AWS_REGION || 'eu-north-1' });
	}
	return client;
};

const localFile = (key: string): string => {
	const full = path.resolve(uploadPath, key);
	// Garde-fou : une clé ne sort jamais du dossier d'upload.
	if (!full.startsWith(path.resolve(uploadPath) + path.sep)) {
		throw new Error(`Clé de stockage invalide : ${key}`);
	}
	return full;
};

const isNotFound = (error: any): boolean =>
	error?.name === 'NotFound' || error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;

export const storage = {
	/** Enregistre un fichier local (temporaire) sous `key`. Le fichier source n'est pas supprimé. */
	async put(sourcePath: string, key: string, contentType?: string): Promise<void> {
		if (storageDriver() === 's3') {
			await new Upload({
				client: s3(),
				params: {
					Bucket: bucket(),
					Key: key,
					Body: fs.createReadStream(sourcePath),
					ContentType: contentType || 'application/octet-stream'
				}
			}).done();
			return;
		}

		const target = localFile(key);
		await fs.promises.mkdir(path.dirname(target), { recursive: true });
		// copyFile et non rename : le temporaire (os.tmpdir) et le volume d'upload sont souvent sur
		// deux systèmes de fichiers différents dans le conteneur (EXDEV).
		await fs.promises.copyFile(sourcePath, target);
	},

	async exists(key: string): Promise<boolean> {
		if (storageDriver() === 's3') {
			try {
				await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
				return true;
			} catch (error) {
				if (isNotFound(error)) return false;
				throw error;
			}
		}

		try {
			await fs.promises.access(localFile(key));
			return true;
		} catch {
			return false;
		}
	},

	async delete(key: string): Promise<void> {
		if (storageDriver() === 's3') {
			await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
			return;
		}

		await fs.promises.rm(localFile(key), { force: true });
	},

	/** Déplace un objet d'une clé à une autre (ex. `<nom>` → `kyc/<nom>`). */
	async move(fromKey: string, toKey: string): Promise<void> {
		if (storageDriver() === 's3') {
			await s3().send(
				new CopyObjectCommand({
					Bucket: bucket(),
					Key: toKey,
					CopySource: `${bucket()}/${encodeURIComponent(fromKey)}`
				})
			);
			await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: fromKey }));
			return;
		}

		const target = localFile(toKey);
		await fs.promises.mkdir(path.dirname(target), { recursive: true });
		await fs.promises.rename(localFile(fromKey), target);
	},

	/**
	 * URL signée de lecture (pilote S3 uniquement). `null` avec le pilote local : l'appelant sert
	 * alors le fichier depuis le disque (`localPath`).
	 */
	async signedUrl(key: string, ttlSeconds: number = signedUrlTtl()): Promise<string | null> {
		if (storageDriver() !== 's3') return null;
		return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: ttlSeconds });
	},

	/** Chemin disque d'une clé si le fichier y est présent (pilote local, ou repli pendant la migration). */
	async localPath(key: string): Promise<string | null> {
		try {
			const full = localFile(key);
			await fs.promises.access(full);
			return full;
		} catch {
			return null;
		}
	},

	isNotFound
};
