import { LogLevel } from 'coddyger';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { config } from '../config/env';
import { logEvent } from '../config/logger';

const helperLabel = 'FirebaseAdminHelper';

/**
 * Nom de l'application Firebase Admin, distinct de l'application par défaut. Conservé depuis la
 * mise en place d'App Check : la même application sert maintenant aussi aux push FCM.
 */
const FIREBASE_APP_NAME = 'yoyo-app-check';

let firebaseApp: App | null = null;
let initializationAttempted = false;

/**
 * Application Firebase Admin partagée (App Check + Cloud Messaging), initialisée au premier
 * usage, jamais au chargement du module : le démarrage du serveur ne doit pas dépendre de la
 * présence de la configuration Firebase. Renvoie `null` si la configuration est absente ou invalide.
 */
export const getFirebaseApp = (): App | null => {
	if (firebaseApp) return firebaseApp;
	if (initializationAttempted) return null;

	initializationAttempted = true;

	const { projectId, clientEmail, privateKey } = config.appCheck;

	if (!projectId || !clientEmail || !privateKey) {
		logEvent({
			type: LogLevel.Error,
			content:
				'Configuration Firebase incomplète : FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et ' +
				'FIREBASE_PRIVATE_KEY sont requis (App Check et push FCM désactivés).',
			location: helperLabel,
			method: 'getFirebaseApp'
		});
		return null;
	}

	try {
		const existing = getApps().find(app => app.name === FIREBASE_APP_NAME);
		firebaseApp = existing ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, FIREBASE_APP_NAME);
		return firebaseApp;
	} catch (error) {
		logEvent({
			type: LogLevel.Error,
			content: `Initialisation de Firebase Admin impossible : ${error}`,
			location: helperLabel,
			method: 'getFirebaseApp'
		});
		return null;
	}
};
