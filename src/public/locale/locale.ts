export const locale = {
	router: {
		idRequired: "La référence de l'objet est requise",
		statusRequired: 'Le statut est requis'
	},
	controller: {
		loginFailed: 'Login ou mot de passe incorrect',
		notFound: 'Enregistrement introuvable',
		notAuthorized: 'Accès non autorisé',
		notAdminAccount: "Ce compte n'est pas administrateur",
		wrongObjectId: "L'identifiant de l'objet n'est pas valide",
		saverNotfound:
			"Impossible de vérifier l'identité de l'administrateur, veuillez vous reconnecter. Si le problème persiste contactez un administrateur système.",
		subcategoryNotfound: 'Sous-categorie introuvable',
		successSave: 'Enregistrement réussie!',
		successUpdate: 'Modification réussie!',
		successRemove: 'Enregistrement supprimé avec succès.',
		successMassiveRemove: 'Enregistrement supprimés avec succès.',
		apiKeyNotFound: "Clé d'api introuvable",
		session: {
			ok: 'Session ok',
			error: 'Session invalide'
		},
		done: 'Action éffectuée avec succès',
		notValidStatus: 'Statut invalide',
		notValidEtape: 'Etape invalide',
		sameStatusDetected: 'Le statut sélectionné est déjà celui du dossier en cours',
		wrongStatusDetected: "Le statut sélectionné n'est pas celui attendu pour le traitement",
		isReadonly: 'Ce dossier ne peut être édité',
		filesXdocsNotGood: 'Le nombre de fichier sélectionné ne correspond pas au nombre de type de dossier',
		filesRequired: 'Vous devez ajouter au moins un document pour la demande',
		wrongDate: 'La date saisie est incorrecte',
		wrongDatePrevue: 'La date prevue saisie est incorrecte',
		wrongPayload: 'Aucune correspondance trouvée',
		uploadFailed: 'Chargement de fichier échoué',
		uploadTooLarge: 'Fichier trop volumineux',
		client: {
			usedEmailAddress: 'Adresse e-mail indisponible',
			usedContact: 'Numéro de téléphone indisponible',
			loginRequired: 'Veuillez renseigner votre numéro de téléphone ou votre adresse e-mail',
			invalidLoginFormat:
				"Le format de l'identifiant est invalide. Veuillez saisir un email ou un numéro de téléphone valide",
			usedLogin: 'Cet identifiant est déjà utilisé',
			invalidPhoneFormat: 'Format de numéro de téléphone invalide',
			invalidEmailFormat: "Format d'adresse email invalide",
			invalidInfo: 'Informations invalides',
			missingSecretInfo: 'La question secrète et sa réponse sont requises',
			passkeyRequired: 'La clé de sécurité est requise',
			passkeyInvalid: 'La clé de sécurité est invalide',
			passcodeRequired: 'Le code de sécurité est requis',
			passcodeInvalid: 'Le code de sécurité est invalide',
			invalidCredentials: 'Login ou mot de passe incorrect',
			invalidGoogleData: 'Données Google invalides ou incomplètes',
			invalidFacebookData: 'Données Facebook invalides ou incomplètes',
			invalidGoogleToken: 'Token Google invalide',
			invalidFacebookToken: 'Token Facebook invalide',
			v2ClientFound: 'Un compte v2 a été retrouvé, merci ',
			facebookProvidedDetected: 'Veuillez vous connecter avec votre compte Facebook',
			googleProvidedDetected: 'Veuillez vous connecter avec votre compte Google',
			phoneNumberAlreadyUsed: 'Numéro de téléphone indisponible',
			phoneNumberUpdated: 'Numéro de téléphone mis à jour avec succès',
			emailAlreadyUsed: 'Adresse e-mail indisponible',
			emailUpdated: 'Adresse e-mail mis à jour avec succès',
			loginAlreadyExists: 'Cet identifiant est déjà utilisé',
			passcodeUpdated: 'Code de sécurité mis à jour avec succès',
			accountsDeleted: 'Nettoyage des comptes inactifs effectué avec succès',
			invalidPasswordFormat: 'Format de mot de passe invalide',
			passwordNotMatch: 'Les mots de passe ne correspondent pas',
			passwordResetRequestFailed: 'Si ce compte existe, un code de vérification a été envoyé'
		},
		invalidDate: 'Les dates de début et de fin sont invalides',
		disabledProfile: "Le profil auquel ce compte est lié n'est pas activé",
		removedAccount: 'Ce compte a été supprimé',
		token: {
			alreadyDeactivated: 'Le token est déjà déactivé',
			deactivated: 'Le token a été déactivé avec succès'
		},
		payment: {
			sameClient: 'Vous ne pouvez pas vous envoyer un paiement à vous-même',
			noSubscription: 'Aucun abonnement actif trouvé',
			pendingPayment: 'Un paiement est déjà en cours',
			notOwner: "Vous n'êtes pas autorisé à traiter les demandes de cette boutique",
			alreadyProcessed: 'Cette demande de réduction a déjà été traitée',
			invalidAmount: 'Le montant de la facture doit être un nombre supérieur à 0',
			belowMinOrder: (min: number) => `Le montant de la facture doit atteindre le minimum de commande de ${min} F`,
			aboveMaxOrder: (max: number) => `Le montant dépasse le plafond autorisé de ${max.toLocaleString('fr-FR')} F par achat. Vérifiez la somme saisie.`,
			redeemCooldown: (unlockAt: Date) =>
				`Vous avez déjà utilisé votre réduction dans cette boutique récemment. Nouvelle réduction possible à partir de ${unlockAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}.`,
			dailyLimitReached: (max: number) => `Vous avez atteint la limite de ${max} réduction${max > 1 ? 's' : ''} par jour. Réessayez demain.`,
			savings: 'Économies du client',
			scanUsage: 'Consommation des réductions du jour',
			notInvalidable: "Seul un ticket validé peut être invalidé",
			redeemed: 'Réduction validée avec succès',
			invalidated: 'Le ticket a été invalidé',
			scanExpired: 'Scan expiré, re-scannez le QR affiché par le commerçant',
			scanInvalid: 'QR invalide, re-scannez le QR affiché par le commerçant',
			scanTokenIssued: 'Jeton de scan généré',
			scanVerified: 'Scan validé',
			sessionExpired: 'Session expirée, re-scannez le QR affiché par le commerçant',
			scanRequired: 'Un scan du QR affiché par le commerçant est requis pour valider votre réduction'
		},
		transaction: {
			active_subscription_error: 'Vous avez déjà un abonnement actif'
		}
	},

	notfound: (label: string = '') => {
		return `${label} introuvable`;
	},
	wrongJsonFormat: (label: string = '') => {
		return `${label} n'est pas dans un format JSON valide`;
	},
	wrongObjectId: (label: string = '') => {
		return `L'identifiant ${label} n'est pas valide`;
	},
	required: (label: string = '') => {
		return `${label} est un champs requis`;
	},
	exist: (label: string = '') => {
		return `Un enregistrement avec ${label} exist déjà`;
	},
	system: {
		errorTryCatchMessage: "Une erreur inattendue s'est produite."
	}
};
