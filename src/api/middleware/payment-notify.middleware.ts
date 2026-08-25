import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';

const middlewareLabel: string = 'PaymentNotifyMiddleware';

/**
 * [SÉCURITÉ F-01] Défense en profondeur sur le point d'entrée des notifications Orange Money.
 *
 * Ce filtre ne constitue pas le contrôle principal : la sécurité repose sur la re-vérification
 * systématique du statut auprès d'Orange Money dans `TransactionController.paymentNotify`.
 * Il sert uniquement à réduire la surface exposée en amont.
 *
 * Piloté par la variable d'environnement `OM_NOTIFY_ALLOWED_IPS` (liste d'IP séparées par des
 * virgules). Laissée vide, l'allowlist est désactivée afin de ne pas bloquer les environnements
 * de développement et de recette.
 */
export class PaymentNotifyMiddleware {
	static async verifySource(request, reply, done) {
		const rawAllowlist = (process.env.OM_NOTIFY_ALLOWED_IPS ?? '').trim();

		// Allowlist non configurée : on laisse passer, la vérification prestataire fait foi.
		if (!rawAllowlist) {
			return;
		}

		const allowlist = rawAllowlist
			.split(',')
			.map((ip: string) => ip.trim())
			.filter((ip: string) => ip.length > 0);

		if (allowlist.length === 0) {
			return;
		}

		const sourceIp = PaymentNotifyMiddleware.resolveSourceIp(request);

		if (allowlist.includes(sourceIp)) {
			return;
		}

		LoggerService.log({
			type: LogLevel.Warn,
			content: `Notification de paiement rejetée : IP source ${sourceIp} hors allowlist`,
			location: middlewareLabel,
			method: 'verifySource'
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

	/**
	 * Résout l'IP appelante. `request.ip` tient déjà compte de `trustProxy` côté Fastify
	 * lorsque l'option est activée ; on normalise seulement les adresses IPv4-mapped.
	 */
	private static resolveSourceIp(request): string {
		const ip: string = request.ip ?? '';
		return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
	}
}
