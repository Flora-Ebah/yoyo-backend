import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { AccountBlockSet, IAccountBlock } from './account-block.model';
import { ClientSet } from '../client';
import { PartnerSet } from '../partner/partner.model';
import { LoginSet } from '../login/login.model';
import { TokenSet } from '../../shared';
import { Events, IPushNotification, PushNotificationService } from '../push-notification';
import { EmailService, MessageTypes } from '../../services/notification';

/** Durée maximale d'un blocage temporaire (au-delà : blocage définitif). */
export const MAX_BLOCK_DAYS = 3650;

/** Statuts qu'un blocage ne peut pas modifier : compte supprimé ou anonymisé. */
const UNBLOCKABLE_STATUSES = ['removed', 'anonymized'];

const escapeHtml = (value: string): string =>
	String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Date de fin lisible (heure d'Abidjan = UTC). */
export const formatBlockEnd = (until?: Date | null): string | null =>
	until
		? new Date(until).toLocaleString('fr-FR', {
				timeZone: 'UTC',
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
		  })
		: null;

/** Message affiché à la connexion d'un compte bloqué qui a donné le bon mot de passe. */
export const blockedLoginMessage = (client: any): string => {
	const end = formatBlockEnd(client?.block?.until);
	return end
		? `Compte suspendu jusqu'au ${end}. Pour contester, écrivez au support YoYo.`
		: 'Compte suspendu. Pour contester, écrivez au support YoYo.';
};

type Result = { status: number; message: string; data: any };

/**
 * Blocage et déblocage des comptes par un administrateur (Excel CMS n°2).
 *
 * Bloquer : statut `suspended`, sessions actives révoquées (liste noire `Token`), boutiques actives
 * du marchand suspendues avec `suspendedByBlock`, push + e-mail à l'utilisateur. Le déblocage
 * (manuel, ou par le cron à la date de fin) rend son statut d'origine au compte et ne rétablit que
 * les boutiques suspendues par le blocage.
 */
export class AccountBlockService {
	private readonly serviceLabel = 'AccountBlockService';
	private readonly history = new AccountBlockSet();

	private get clients(): any {
		return new ClientSet().defaultModel;
	}

	async block(userId: string, payload: { reason: string; days?: number | null }, adminId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) {
			return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		}
		const reason = String(payload.reason ?? '').trim();
		if (reason.length < 3) {
			return { status: defines.status.badRequest, message: 'Indiquez le motif du blocage.', data: null };
		}
		const days = payload.days == null ? null : Math.round(Number(payload.days));
		if (days !== null && (!Number.isFinite(days) || days < 1 || days > MAX_BLOCK_DAYS)) {
			return { status: defines.status.badRequest, message: 'Durée de blocage invalide.', data: null };
		}

		const client: any = await this.clients.findById(userId).lean();
		if (!client || UNBLOCKABLE_STATUSES.includes(client.status)) {
			return { status: defines.status.notFound, message: 'Compte introuvable', data: null };
		}

		const now = new Date();
		const until = days === null ? null : new Date(now.getTime() + days * 86_400_000);
		const alreadyBlocked = client.status === 'suspended' && !!client.block?.at;

		// Un nouveau blocage sur un compte déjà bloqué change seulement le motif et la durée :
		// le statut d'origine mémorisé reste celui d'avant le premier blocage.
		await this.clients.updateOne(
			{ _id: userId },
			{
				$set: {
					status: 'suspended',
					block: { reason, until, by: adminId, at: now },
					...(alreadyBlocked ? {} : { statusBeforeBlock: client.status })
				}
			}
		);

		await this.revokeSessions(userId);
		if (!alreadyBlocked) {
			await new PartnerSet().defaultModel.updateMany(
				{ user: userId, status: 'active' },
				{ $set: { status: 'suspended', suspendedByBlock: true } }
			);
		}

		await this.history.save({
			_id: coddyger.string.generateObjectId(),
			user: userId,
			action: 'block',
			reason,
			until,
			by: adminId
		} as IAccountBlock);

		await this.notify(client, 'block', reason, until);

		return {
			status: defines.status.requestOK,
			message: until ? `Compte bloqué jusqu'au ${formatBlockEnd(until)}.` : 'Compte bloqué définitivement.',
			data: { _id: userId, status: 'suspended', block: { reason, until, by: adminId, at: now } }
		};
	}

	async unblock(userId: string, adminId: string | null, auto = false): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) {
			return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		}
		const client: any = await this.clients.findById(userId).lean();
		if (!client || !client.block?.at) {
			return { status: defines.status.badRequest, message: "Ce compte n'est pas bloqué.", data: null };
		}

		// `suspended` mémorisé = suspension manuelle antérieure au blocage : on la conserve.
		const restored = client.statusBeforeBlock && client.statusBeforeBlock !== 'suspended' ? client.statusBeforeBlock : 'active';
		const updated = await this.clients.updateOne(
			// Garde : un déblocage concurrent (cron + CMS) ne s'applique qu'une fois.
			{ _id: userId, 'block.at': client.block.at },
			{ $set: { status: restored }, $unset: { block: 1, statusBeforeBlock: 1 } }
		);
		if (!updated.modifiedCount) {
			return { status: defines.status.badRequest, message: "Ce compte n'est pas bloqué.", data: null };
		}

		await new PartnerSet().defaultModel.updateMany(
			{ user: userId, suspendedByBlock: true },
			{ $set: { status: 'active', suspendedByBlock: false } }
		);

		await this.history.save({
			_id: coddyger.string.generateObjectId(),
			user: userId,
			action: 'unblock',
			by: adminId ?? undefined,
			auto
		} as IAccountBlock);

		await this.notify(client, 'unblock');

		return { status: defines.status.requestOK, message: 'Compte débloqué.', data: { _id: userId, status: restored } };
	}

	/** Cron : débloque les comptes dont la date de fin est passée (au plus 200 par passage). */
	async expireBlocks(now = new Date()): Promise<number> {
		const due: any[] = await this.clients
			.find({ status: 'suspended', 'block.until': { $ne: null, $lte: now } }, '_id')
			.limit(200)
			.lean();
		let count = 0;
		for (const c of due) {
			const res = await this.unblock(String(c._id), null, true);
			if (res.status === defines.status.requestOK) count++;
		}
		return count;
	}

	/** Historique des blocages d'un compte, du plus récent au plus ancien. */
	async list(userId: string): Promise<Result> {
		if (!coddyger.string.isValidObjectId(userId)) {
			return { status: defines.status.badRequest, message: 'Identifiant invalide', data: null };
		}
		const rows = await this.history.defaultModel
			.find({ user: userId })
			.sort({ createdAt: -1 })
			.limit(100)
			.populate('by', 'firstname lastname email')
			.lean();
		return { status: defines.status.requestOK, message: 'OK', data: rows };
	}

	/** Met fin aux sessions ouvertes : jetons ajoutés à la liste noire lue par `TokenMiddleware`. */
	private async revokeSessions(userId: string): Promise<void> {
		const logins = new LoginSet().defaultModel;
		const active: any[] = await logins.find({ user: userId, status: 'active', token: { $exists: true, $ne: null } }, 'token').lean();
		const tokens = Array.from(new Set(active.map((l) => l.token).filter(Boolean)));
		if (tokens.length) {
			const blacklist = new TokenSet().defaultModel;
			const known: any[] = await blacklist.find({ token: { $in: tokens } }, 'token').lean();
			const knownSet = new Set(known.map((t) => t.token));
			const fresh = tokens.filter((t) => !knownSet.has(t));
			if (fresh.length) {
				await blacklist.insertMany(
					fresh.map((token) => ({
						_id: coddyger.string.generateObjectId(),
						token,
						deactivatedAt: new Date(),
						status: 'inactive'
					}))
				);
			}
		}
		await logins.updateMany({ user: userId, status: 'active' }, { $set: { status: 'ended' } });
	}

	/** Push + e-mail à l'utilisateur ; un échec d'envoi n'annule jamais le blocage. */
	private async notify(client: any, kind: 'block' | 'unblock', reason?: string, until?: Date | null): Promise<void> {
		const end = formatBlockEnd(until);
		try {
			await new PushNotificationService().create({
				title: kind === 'block' ? 'Compte suspendu' : 'Compte rétabli',
				body:
					kind === 'block'
						? end
							? `Votre compte est suspendu jusqu'au ${end}.`
							: 'Votre compte est suspendu.'
						: 'Vous pouvez de nouveau utiliser YoYo.',
				type: kind === 'block' ? 'warning' : 'info',
				priority: 'high',
				data: { userId: String(client._id), type: kind === 'block' ? 'account_blocked' : 'account_unblocked' },
				target: Events.USER_NOTIFICATION,
				status: 'pending'
			} as IPushNotification);
		} catch (e) {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.serviceLabel, method: 'notify:push' });
		}

		if (!client.email) return;
		try {
			await new EmailService().send({
				category: 'security',
				type: 'email',
				to: client.email,
				template: kind === 'block' ? MessageTypes.TYPES.ACCOUNT_SUSPENDED : MessageTypes.TYPES.ACCOUNT_REINSTATED,
				data: { userName: escapeHtml(client.firstname || '') || undefined },
				templateData: kind === 'block' ? { reason: escapeHtml(reason ?? ''), until: end ?? undefined } : undefined
			});
		} catch (e) {
			LoggerService.log({ type: LogLevel.Error, content: e, location: this.serviceLabel, method: 'notify:email' });
		}
	}
}

export const accountBlockService = new AccountBlockService();
