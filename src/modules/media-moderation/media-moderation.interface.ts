import { ModerationLabel } from '../../services/moderation/rekognition.service';
import { ModerationStatus } from '../../services/moderation/moderation-policy';

/** Résultat de modération d'un média envoyé par `POST /upload`. */
export interface IMediaModeration {
	_id?: any;
	/** Clé stockée (servie par `/file/`). Absente pour un média refusé, jamais enregistré. */
	fileName?: string;
	/** Aperçu associé (vidéo) : bloqué avec le média. */
	posterName?: string;
	originalName?: string;
	mediaType: 'image' | 'video';
	uploaderId?: any;
	uploaderType?: 'client' | 'partner' | 'admin';
	labels: ModerationLabel[];
	/** Plus haut score de confiance (%) parmi les libellés à caractère sexuel. */
	maxConfidence: number;
	status: ModerationStatus;
	/** Motif d'un statut `unchecked` (modération désactivée, erreur Rekognition…). */
	note?: string;
	reviewedBy?: any;
	reviewedAt?: Date;
	createdAt?: Date;
	updatedAt?: Date;
}
