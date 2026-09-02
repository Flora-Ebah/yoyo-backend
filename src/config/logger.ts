import { LoggerService, LogLevel } from 'coddyger';

/**
 * Journalisation applicative.
 *
 * `LoggerService` de `coddyger` **n'écrit nulle part** : son instance pino se construit
 * correctement (niveau `debug`, cibles fichier et `pino-pretty` déclarées) mais le *worker thread*
 * du transport ne démarre pas, et l'erreur part sur un événement que personne n'écoute. Constat du
 * 02/09/2026 : `src/logs/*.log` fait 0 octet pour **toutes** les dates depuis le 21/08, et un appel
 * direct à `logger.warn()` ne produit rien, ni fichier ni console.
 *
 * Tous les messages de sécurité ajoutés jusqu'ici étaient donc invisibles : tentatives d'OTP
 * épuisées, jetons de réinitialisation refusés, notifications de paiement rejetées, contrôle de
 * configuration au démarrage, refus de création du compte administrateur par défaut.
 *
 * Ce module écrit sur la sortie standard — le seul canal dont on ait la preuve qu'il fonctionne
 * dans ce projet, puisque `coddyger.konsole` y publie les lignes de démarrage — et continue
 * d'appeler `LoggerService` pour ne rien perdre le jour où il sera réparé.
 *
 * À supprimer au profit de `LoggerService` seul une fois la cause corrigée côté `coddyger`
 * (cf. ROADMAP §4.3, framework maison non figé et non auditable).
 */

const PREFIX: Record<string, string> = {
	[LogLevel.Info]: 'info',
	[LogLevel.Debug]: 'debug',
	[LogLevel.Warn]: 'warn',
	[LogLevel.Error]: 'error',
	[LogLevel.Fatal]: 'fatal',
	[LogLevel.Trace]: 'trace'
};

export interface LogEvent {
	type: LogLevel;
	content: string;
	location: string;
	method: string;
}

export const logEvent = ({ type, content, location, method }: LogEvent): void => {
	// Conservé : sans effet aujourd'hui, mais redevient la seule source utile une fois réparé.
	LoggerService.log({ type, content, location, method });

	const line = `${new Date().toISOString()}[${PREFIX[type] ?? 'info'}] ${location}.${method} :: ${content}`;

	if (type === LogLevel.Error || type === LogLevel.Fatal) {
		console.error(line);
		return;
	}

	if (type === LogLevel.Warn) {
		console.warn(line);
		return;
	}

	console.log(line);
};
