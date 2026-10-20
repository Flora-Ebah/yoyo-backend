import coddyger, { defines, LogLevel } from 'coddyger';
import { logEvent } from '../../config/logger';
import { WaveHelper } from '../../helpers/wave.helper';

const middlewareLabel: string = 'WaveWebhookMiddleware';

/**
 * Authentification des webhooks Wave (`POST /transactions/wave-webhook`).
 *
 * Contrôle principal : la signature HMAC-SHA256 de l'en-tête `Wave-Signature`, calculée par Wave
 * avec le secret affiché à la création du webhook dans le portail Business (stratégie
 * « Signing Secret »). Elle est vérifiée sur le corps BRUT, que la route conserve dans
 * `request.rawBody` : un corps re-sérialisé après parsing JSON ne donnerait plus la même empreinte.
 *
 * Sans `WAVE_WEBHOOK_SECRET`, tout est refusé : un webhook qu'on ne sait pas authentifier ne
 * doit rien déclencher. Le statut reste de toute façon relu chez Wave avant activation.
 *
 * Défense en profondeur facultative : `WAVE_WEBHOOK_ALLOWED_IPS` (IP séparées par des virgules),
 * à renseigner avec les IP publiées par Wave. Vide = filtre désactivé.
 */
export class WaveWebhookMiddleware {
	static async verify(request, reply, done) {
		const sourceIp = WaveWebhookMiddleware.resolveSourceIp(request);
		const allowlist = (process.env.WAVE_WEBHOOK_ALLOWED_IPS ?? '')
			.split(',')
			.map((ip: string) => ip.trim())
			.filter((ip: string) => ip.length > 0);

		if (allowlist.length > 0 && !allowlist.includes(sourceIp)) {
			return WaveWebhookMiddleware.refuse(reply, `IP source ${sourceIp} hors allowlist`);
		}

		const secret = (process.env.WAVE_WEBHOOK_SECRET ?? '').trim();
		if (!secret) {
			return WaveWebhookMiddleware.refuse(reply, 'WAVE_WEBHOOK_SECRET non configuré');
		}

		const header = request.headers?.['wave-signature'];
		const signature = Array.isArray(header) ? header.join(',') : header;

		if (!WaveHelper.verifySignature(signature, request.rawBody, secret)) {
			return WaveWebhookMiddleware.refuse(reply, `signature invalide ou expirée (IP ${sourceIp})`);
		}
	}

	private static refuse(reply, reason: string) {
		logEvent({
			type: LogLevel.Warn,
			content: `Webhook Wave rejeté : ${reason}`,
			location: middlewareLabel,
			method: 'verify'
		});

		return coddyger.api(
			reply,
			Promise.resolve({
				status: defines.status.authError,
				message: 'Source non autorisée',
				data: null
			})
		);
	}

	/** Même normalisation que `PaymentNotifyMiddleware` (adresses IPv4-mapped). */
	private static resolveSourceIp(request): string {
		const ip: string = request.ip ?? '';
		return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	}
}
