import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';

/**
 * Analyse d'images par AWS Rekognition (`DetectModerationLabels`).
 *
 * Les octets de l'image sont envoyés directement (`Image.Bytes`) : aucun accès au bucket S3 n'est
 * nécessaire, seule la permission IAM `rekognition:DetectModerationLabels` est requise.
 * Rekognition n'existe pas dans toutes les régions (pas en eu-north-1) : la région est donc
 * réglée à part (`REKOGNITION_REGION`, défaut eu-west-1), indépendamment de celle du stockage.
 */

export interface ModerationLabel {
	name: string;
	parent?: string;
	confidence: number;
}

/** Taille maximale acceptée par Rekognition pour `Image.Bytes`. */
export const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

let client: RekognitionClient | null = null;
const rekognition = (): RekognitionClient => {
	if (!client) {
		// Identifiants : les mêmes AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY que le stockage S3.
		client = new RekognitionClient({ region: process.env.REKOGNITION_REGION || 'eu-west-1' });
	}
	return client;
};

/** La modération est active seulement si elle est explicitement activée (aucune régression sinon). */
export const isModerationEnabled = (): boolean =>
	(process.env.MODERATION_ENABLED ?? '').trim().toLowerCase() === 'true';

/**
 * Renvoie les libellés de modération détectés (confiance ≥ `minConfidence`).
 * Lève en cas d'erreur réseau / droits : à l'appelant de décider du repli.
 */
export const detectModerationLabels = async (bytes: Buffer, minConfidence = 50): Promise<ModerationLabel[]> => {
	const res = await rekognition().send(
		new DetectModerationLabelsCommand({ Image: { Bytes: bytes }, MinConfidence: minConfidence })
	);
	return (res.ModerationLabels ?? []).map((l) => ({
		name: l.Name ?? '',
		parent: l.ParentName || undefined,
		confidence: Math.round((l.Confidence ?? 0) * 100) / 100
	}));
};
