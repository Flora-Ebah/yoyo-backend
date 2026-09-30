import fs from 'fs';
import jwt from 'jsonwebtoken';
import mime from 'mime-types';
import { env } from 'coddyger';
import { KYC_PREFIX, isPublicKey, storage, storageDriver, uploadPath } from '../../services/storage/storage.service';

/**
 * Pièces justificatives (KYC) : elles arrivent par le `POST /upload` commun, donc sous une clé
 * publique, puis sont déplacées sous `kyc/` dès la soumission du dossier (`POST /certification`).
 * La base garde le nom d'origine ; la clé de stockage est toujours `kyc/<nom>`.
 *
 * Seuls les administrateurs les consultent, via des liens signés de courte durée
 * (`GET /certification/:id/files` → `GET /certification/kyc-file/:token`).
 */

/** Durée de validité d'un lien de consultation d'une pièce, en secondes. */
export const KYC_LINK_TTL = 300;

// Secret dérivé : un jeton de consultation ne peut jamais servir de jeton de session, et inversement.
const linkSecret = (): string => `${env.jwt.secret}:kyc-file`;

export const kycKey = (name: string): string => `${KYC_PREFIX}${name}`;

export class KycFileError extends Error {}

/**
 * Déplace une pièce de sa clé publique vers `kyc/`. Idempotent : une pièce déjà déplacée (nouvel
 * essai après un échec d'enregistrement) est acceptée telle quelle.
 */
export const secureDocumentFile = async (name: string): Promise<void> => {
	if (!isPublicKey(name)) throw new KycFileError(`Nom de fichier invalide : ${name}`);

	const target = kycKey(name);
	const local = await storage.localPath(name);

	if (storageDriver() === 's3') {
		if (local) {
			// Fichier encore sur le disque (envoyé avant la bascule S3, ou pilote local récent).
			await storage.put(local, target, mime.lookup(name) || undefined);
			await fs.promises.rm(local, { force: true });
			return;
		}
		if (await storage.exists(name)) return storage.move(name, target);
	} else if (local) {
		return storage.move(name, target);
	}

	if (await storage.exists(target)) return;
	throw new KycFileError(`Fichier introuvable : ${name}`);
};

export const deleteDocumentFiles = async (names: string[] = []): Promise<void> => {
	await Promise.all(
		names.filter(isPublicKey).map((name) => storage.delete(kycKey(name)).catch(() => undefined))
	);
};

/** Chemin (relatif à la racine de l'API) d'un lien de consultation signé pour une pièce. */
export const documentLink = (name: string): string => {
	const token = jwt.sign({ k: kycKey(name) }, linkSecret(), { expiresIn: KYC_LINK_TTL });
	return `/certification/kyc-file/${token}`;
};

/**
 * Garde de `GET /certification/kyc-file/:token` : le jeton signé tient lieu d'autorisation (un <img>
 * ou un nouvel onglet ne peut pas envoyer d'en-tête Authorization). Il n'est émis que par la route
 * administrateur `GET /certification/:id/files`. Pose `request.kycKey` si le jeton est valide.
 */
export const verifyDocumentLink = async (request: any, reply: any): Promise<any> => {
	const refuse = () => reply.code(403).send({ message: 'Lien expiré ou invalide', data: null });

	let key: unknown;
	try {
		key = (jwt.verify(String(request.params?.token ?? ''), linkSecret()) as any)?.k;
	} catch {
		return refuse();
	}

	if (typeof key !== 'string' || !key.startsWith(KYC_PREFIX) || !isPublicKey(key.slice(KYC_PREFIX.length))) {
		return refuse();
	}
	request.kycKey = key;
};

/** Répond avec la pièce validée par `verifyDocumentLink`. */
export const sendDocumentFile = async (reply: any, key: string): Promise<any> => {
	// Jamais mis en cache : ce sont des pièces d'identité.
	reply.header('Cache-Control', 'no-store');

	if (await storage.localPath(key)) return reply.sendFile(key, uploadPath);

	if (storageDriver() === 's3') {
		const url = await storage.signedUrl(key, KYC_LINK_TTL);
		if (url) return reply.redirect(302, url);
	}

	return reply.code(404).send({ message: 'Fichier introuvable', data: null });
};
