import coddyger, { defines, IData, IErrorObject } from 'coddyger';
import { ICertification, CertificationSet, DOCUMENT_TYPES, REJECTION_REASONS, VERIFICATION_STATUSES } from './';
import { IClient, ClientSet } from '../client';
import { locale } from '../../public';
import { notificationManager , NotificationCategory , NotificationType } from '../../services/notification';
import { MessageHelper } from '../../helpers/message.helper';
import { NotificationHelper } from '../../helpers/notification.helper';



const dao: IData<ICertification> = new CertificationSet();
const daoClient: IData<IClient> = new ClientSet();
const serviceLabel: string = 'CertificationService';

export class CertificationService {
	static async validateDocument(documentType: string): Promise<boolean> {
		// Vérifier si le type de document existe
		return DOCUMENT_TYPES.some((type) => type.slug === documentType);
	}

	static async generateSlug(prefix: string = 'CERT'): Promise<string> {
		const lastCert: any = await dao.selectLatest();
		return coddyger.buildSlug(prefix, lastCert ? lastCert.slug : null);
	}

	static async saveDocument(certification: ICertification): Promise<any> {
		try {
			// Valider le document
			const isValid = await this.validateDocument(certification.documentType!);
			if (!isValid) {
				return {
					error: true,
					message: 'Type de document invalide'
				};
			}

			// Générer l'ID et le slug
			certification._id = coddyger.string.generateObjectId();
			certification.slug = await this.generateSlug();

			// Ajouter les métadonnées
			certification.metadata = {
				...certification.metadata,
				uploadedAt: new Date(),
				documentType: certification.documentType
			};

			// Sauvegarder dans la base de données
			const save: any = await dao.save(certification);
			if (save.error) {
				throw save;
			}

			const updatedClient: any = await daoClient.update(
				{ _id: certification.user },
				{ documentVerificationStatus: 'en-cours' }
			);
			if (!updatedClient) {
				return {
					error: true,
					message: locale.notfound('Client')
				};
			}

			// Suivi admin : un nouveau dossier KYC vient d'être soumis.
			await NotificationHelper.notifySuperAdmins({
				title: 'Nouveau dossier KYC',
				message: `Un client a soumis un document « ${certification.documentType} » à vérifier.`,
				category: NotificationCategory.WARNING,
				metadata: { type: 'moderation', clientId: String(certification.user), certificationId: String(certification._id) }
			});

			// Retourner le document sauvegardé
			return await dao.selectOne({ _id: certification._id });
		} catch (error: any) {
			return coddyger.catchReturn(error, serviceLabel, 'saveDocument');
		}
	}

	static async updateDocument(certification: ICertification): Promise<any> {
		try {
			const _id = certification._id;

			// Vérifier si le document existe
			const exists = await dao.exist({ _id });
			if (!exists) {
				return {
					error: true,
					message: locale.notfound('Document')
				};
			}

			// Récupérer l'ancien document pour l'historique
			const oldDoc: any = await dao.selectOne({ _id });

			// Mettre à jour l'historique
			const newHistory = {
				action: 'STATUT_MODIFIE',
				performedBy: certification.reviewedBy,
				timestamp: new Date(),
				details: `Statut modifié: ${oldDoc.verificationStatus} -> ${certification.verificationStatus}`
			};

			certification.history = [...(oldDoc.history || []), newHistory];

			// Mettre à jour le document
			const update: any = await dao.update({ _id }, certification);
			if (update.error) {
				throw update;
			}

			const certDetails: any = await dao.selectOne({ _id });
			// Récuperer les informations du client
			const client: any = await daoClient.selectOne({ _id: certDetails.user._id });

			if (certification.verificationStatus === 'verifie') {
				const userFiles: any[] = certDetails.documentFile ?? [];
				const userAvatar: any = userFiles[userFiles.length - 1];
				// Mettre à jour le client
				const updateClient: any = await daoClient.update(
					{ _id: certDetails.user._id },
					{ isDocumentVerified: true, documents: certDetails.documentFile, avatar: userAvatar ?? '', documentVerificationStatus: 'verifie' }
				);
				if (updateClient.error) {
					throw updateClient;
				}
				
				// Envoyer une notification au client via socket et mail ou sms
				await MessageHelper.certificationNotify({
					_id: certDetails._id,
					login: client.email,
					name: client.firstname + ' ' + client.lastname
				}, 'verifie');
			} else {
				await MessageHelper.certificationNotify({
					_id: client._id,
					login: client.email,
					name: client.firstname + ' ' + client.lastname,
					reason: certification.rejectionReason
				}, 'refuse');
			}

			// Retourner le document mis à jour
			return await dao.selectOne({ _id });
		} catch (error: any) {
			return coddyger.catchReturn(error, serviceLabel, 'updateDocument');
		}
	}

	static getDocumentTypes(): any {
		return {
			status: defines.status.requestOK,
			message: 'Ok',
			data: DOCUMENT_TYPES
		};
	}

	static getRejectionReasons(): any {
		return {
			status: defines.status.requestOK,
			message: 'Ok',
			data: REJECTION_REASONS
		};
	}

	static getVerificationStatuses(): any {
		return {
			status: defines.status.requestOK,
			message: 'Ok',
			data: VERIFICATION_STATUSES
		};
	}
}
