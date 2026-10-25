import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { ReportSet } from './report.model';
import {
	IReport,
	REPORT_ALERT_THRESHOLD,
	REPORT_DAILY_LIMIT,
	REPORT_REASONS,
	ReportAction,
	ReportTarget
} from './report.interface';
import { PartnerSet } from '../partner/partner.model';
import { PartnerCommentSet } from '../partner-engagement/partner-engagement.model';
import { MediaModerationSet } from '../media-moderation/media-moderation.model';
import { MediaModerationService } from '../media-moderation/media-moderation.service';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';

type Result = { status: number; message: any; data: any };

const serviceLabel = 'ReportService';
const MEDIA_FIELDS = ['photos', 'thumbnail', 'video', 'videoPoster'];

/** Actions possibles selon le type de cible. */
const ACTIONS_BY_TARGET: Record<ReportTarget, ReportAction[]> = {
	boutique: ['dismiss', 'suspend-boutique'],
	media: ['dismiss', 'remove-media', 'suspend-boutique'],
	comment: ['dismiss', 'remove-comment']
};

const ACTION_LABEL: Record<ReportAction, string> = {
	dismiss: 'Classé sans suite',
	'remove-comment': 'Commentaire supprimé',
	'remove-media': 'Média supprimé',
	'suspend-boutique': 'Boutique suspendue'
};

const fail = (status: number, message: string): Result => ({ status, message, data: null });

/**
 * Signalements de contenus (Excel CMS n°13). La décision réutilise les actions de modération
 * existantes : suppression du commentaire, rejet du média, suspension de la boutique.
 */
export class ReportService {
	private readonly dao = new ReportSet();

	private get reports(): any {
		return this.dao.defaultModel;
	}
	private get partners(): any {
		return new PartnerSet().defaultModel;
	}
	private get comments(): any {
		return new PartnerCommentSet().defaultModel;
	}

	/**
	 * Résout la cible signalée : boutique concernée, propriétaire et identifiant normalisé.
	 * Un média est identifié par sa clé de fichier, qui doit appartenir à une boutique active.
	 */
	private async resolveTarget(
		targetType: ReportTarget,
		rawId: string
	): Promise<{ partner: any; targetId: string; authorId?: string } | null> {
		const id = String(rawId ?? '').trim();
		if (!id) return null;

		if (targetType === 'boutique') {
			if (!coddyger.string.isValidObjectId(id)) return null;
			const partner = await this.partners.findOne({ _id: id, status: 'active' }, '_id user name').lean();
			return partner ? { partner, targetId: String(partner._id), authorId: String(partner.user ?? '') } : null;
		}

		if (targetType === 'comment') {
			if (!coddyger.string.isValidObjectId(id)) return null;
			const comment = await this.comments.findOne({ _id: id, status: 'active' }, '_id partnerId userId').lean();
			if (!comment) return null;
			const partner = await this.partners.findOne({ _id: comment.partnerId }, '_id user name').lean();
			return partner ? { partner, targetId: String(comment._id), authorId: String(comment.userId ?? '') } : null;
		}

		// Média : l'appli envoie la clé ; on accepte aussi une URL `/file/<clé>`.
		const key = decodeURIComponent(id.split('?')[0].split('/file/').pop() ?? id);
		const partner = await this.partners
			.findOne({ status: 'active', $or: MEDIA_FIELDS.map((f) => ({ [f]: key })) }, '_id user name')
			.lean();
		return partner ? { partner, targetId: key, authorId: String(partner.user ?? '') } : null;
	}

	/** POST /reports — signalement par un utilisateur connecté. */
	async create(
		reporterId: string,
		payload: { targetType: ReportTarget; targetId: string; reason: string; comment?: string }
	): Promise<Result> {
		if (!REPORT_REASONS.some((r) => r.key === payload.reason)) {
			return fail(defines.status.badRequest, 'Motif de signalement invalide.');
		}

		const target = await this.resolveTarget(payload.targetType, payload.targetId);
		if (!target) return fail(defines.status.notFound, 'Ce contenu est introuvable ou a déjà été retiré.');
		if (target.authorId && target.authorId === String(reporterId)) {
			return fail(defines.status.badRequest, 'Vous ne pouvez pas signaler votre propre contenu.');
		}

		const since = new Date(Date.now() - 24 * 3600 * 1000);
		const today = await this.reports.countDocuments({ reporter: reporterId, createdAt: { $gte: since } });
		if (today >= REPORT_DAILY_LIMIT) {
			return fail(429, 'Vous avez atteint la limite de signalements pour aujourd’hui. Réessayez demain.');
		}

		try {
			await this.reports.create({
				_id: coddyger.string.generateObjectId(),
				reporter: reporterId,
				targetType: payload.targetType,
				targetId: target.targetId,
				partner: target.partner._id,
				reason: payload.reason,
				comment: payload.comment?.trim() || undefined,
				status: 'open'
			} as IReport);
		} catch (error: any) {
			if (error?.code === 11000) return fail(defines.status.conflict, 'Vous avez déjà signalé ce contenu.');
			throw error;
		}

		await this.alertIfThreshold(payload.targetType, target.targetId, target.partner);

		return {
			status: defines.status.created,
			message: 'Merci, votre signalement a été transmis à l’équipe YoYo.',
			data: null
		};
	}

	/** Alerte les modérateurs une seule fois, quand la cible atteint le seuil de signalements ouverts. */
	private async alertIfThreshold(targetType: ReportTarget, targetId: string, partner: any): Promise<void> {
		try {
			const open = await this.reports.countDocuments({ targetType, targetId, status: 'open' });
			if (open !== REPORT_ALERT_THRESHOLD) return;
			const what = targetType === 'boutique' ? 'La boutique' : targetType === 'media' ? 'Un média de la boutique' : 'Un commentaire sur la boutique';
			await NotificationHelper.notifyAdminsWithPermission('moderation', {
				title: 'Contenu signalé plusieurs fois',
				message: `${what} « ${partner?.name ?? '—'} » a reçu ${open} signalements.`,
				category: NotificationCategory.WARNING,
				metadata: { type: 'reports', targetType, targetId }
			});
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: serviceLabel, method: 'alertIfThreshold' });
		}
	}

	/**
	 * Liste admin regroupée par cible : nombre de signalements, motifs, période, boutique et aperçu
	 * du contenu. Les cibles ouvertes les plus signalées d'abord.
	 */
	async adminList(payloads: { status?: string; targetType?: string; page?: number; pageSize?: number }): Promise<Result> {
		const page = Math.max(1, Number(payloads.page) || 1);
		const pageSize = Math.min(100, Math.max(1, Number(payloads.pageSize) || 20));
		const status = ['open', 'actioned', 'dismissed'].includes(String(payloads.status)) ? String(payloads.status) : 'open';
		const match: any = { status };
		if (payloads.targetType && ACTIONS_BY_TARGET[payloads.targetType as ReportTarget]) match.targetType = payloads.targetType;

		const [res] = await this.reports.aggregate([
			{ $match: match },
			{
				$group: {
					_id: { targetType: '$targetType', targetId: '$targetId' },
					count: { $sum: 1 },
					partner: { $first: '$partner' },
					reasons: { $push: '$reason' },
					comments: { $push: '$comment' },
					firstAt: { $min: '$createdAt' },
					lastAt: { $max: '$createdAt' },
					action: { $last: '$action' },
					note: { $last: '$note' },
					handledBy: { $last: '$handledBy' },
					handledAt: { $max: '$handledAt' }
				}
			},
			{ $sort: status === 'open' ? { count: -1, lastAt: -1 } : { handledAt: -1 } },
			{
				$facet: {
					rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
					total: [{ $count: 'n' }]
				}
			}
		]);

		const groups: any[] = res?.rows ?? [];
		const totalRows = res?.total?.[0]?.n ?? 0;

		const partnerIds = groups.map((g) => g.partner).filter(Boolean);
		const commentIds = groups.filter((g) => g._id.targetType === 'comment').map((g) => g._id.targetId);
		const [partners, comments, counts] = await Promise.all([
			this.partners.find({ _id: { $in: partnerIds } }, '_id name status thumbnail video videoPoster user').populate('user', 'firstname lastname email').lean(),
			commentIds.length
				? this.comments.find({ _id: { $in: commentIds } }, '_id text status userId createdAt').populate('userId', '_id firstname lastname').lean()
				: [],
			this.counts()
		]);
		const partnerById = new Map(partners.map((p: any) => [String(p._id), p]));
		const commentById = new Map((comments as any[]).map((c: any) => [String(c._id), c]));

		const rows = groups.map((g) => {
			const reasons: Record<string, number> = {};
			for (const r of g.reasons) reasons[r] = (reasons[r] ?? 0) + 1;
			const partner: any = partnerById.get(String(g.partner)) ?? null;
			const targetId = g._id.targetId;
			return {
				id: `${g._id.targetType}:${targetId}`,
				targetType: g._id.targetType,
				targetId,
				count: g.count,
				reasons,
				comments: (g.comments as any[]).filter(Boolean).slice(0, 5),
				firstAt: g.firstAt,
				lastAt: g.lastAt,
				action: g.action ?? null,
				note: g.note ?? null,
				handledAt: g.handledAt ?? null,
				partner: partner
					? { _id: partner._id, name: partner.name, status: partner.status, thumbnail: partner.thumbnail, owner: partner.user }
					: null,
				comment: g._id.targetType === 'comment' ? commentById.get(String(targetId)) ?? null : null,
				media:
					g._id.targetType === 'media'
						? { key: targetId, isVideo: partner?.video === targetId, poster: partner?.video === targetId ? partner?.videoPoster : null }
						: null,
				actions: ACTIONS_BY_TARGET[g._id.targetType as ReportTarget]
			};
		});

		return {
			status: defines.status.requestOK,
			message: { totalRows, totalPages: Math.ceil(totalRows / pageSize), page, pageSize, counts },
			data: rows
		};
	}

	/** Nombre de cibles ouvertes par type (badges du CMS). */
	async counts(): Promise<Record<string, number>> {
		const rows = await this.reports.aggregate([
			{ $match: { status: 'open' } },
			{ $group: { _id: { t: '$targetType', id: '$targetId' } } },
			{ $group: { _id: '$_id.t', n: { $sum: 1 } } }
		]);
		const out: Record<string, number> = { boutique: 0, media: 0, comment: 0, total: 0 };
		for (const r of rows) {
			out[r._id] = r.n;
			out.total += r.n;
		}
		return out;
	}

	/**
	 * POST /admin/reports/resolve — décision sur une cible : tous ses signalements ouverts sont
	 * clos avec la même action.
	 */
	async resolve(
		payload: { targetType: ReportTarget; targetId: string; action: ReportAction; note?: string },
		adminId: string
	): Promise<Result> {
		const { targetType, targetId, action } = payload;
		if (!ACTIONS_BY_TARGET[targetType]?.includes(action)) {
			return fail(defines.status.badRequest, 'Action impossible pour ce type de contenu.');
		}

		const open: any[] = await this.reports.find({ targetType, targetId, status: 'open' }, '_id partner').lean();
		if (open.length === 0) return fail(defines.status.notFound, 'Aucun signalement ouvert sur ce contenu.');
		const partnerId = open[0].partner;

		if (action === 'remove-comment') {
			await this.comments.updateOne({ _id: targetId }, { $set: { status: 'removed' } });
		} else if (action === 'suspend-boutique') {
			await this.partners.updateOne({ _id: partnerId, status: 'active' }, { $set: { status: 'suspended' } });
		} else if (action === 'remove-media') {
			await this.removeMedia(partnerId, targetId, adminId);
		}

		const now = new Date();
		await this.reports.updateMany(
			{ targetType, targetId, status: 'open' },
			{
				$set: {
					status: action === 'dismiss' ? 'dismissed' : 'actioned',
					action,
					note: payload.note?.trim() || undefined,
					handledBy: adminId,
					handledAt: now
				}
			}
		);

		return { status: defines.status.requestOK, message: ACTION_LABEL[action], data: { count: open.length } };
	}

	/**
	 * Retire un média signalé : rejet dans la modération médias (fichier supprimé et bloqué) puis
	 * retrait de la fiche boutique.
	 */
	private async removeMedia(partnerId: any, key: string, adminId: string): Promise<void> {
		const partner: any = await this.partners.findOne({ _id: partnerId }, 'user video videoPoster').lean();
		const isVideo = partner?.video === key;
		const moderation = new MediaModerationService();
		const model: any = new MediaModerationSet().defaultModel;

		let entry: any = await model.findOne({ fileName: key }, '_id').lean();
		if (!entry) {
			entry = { _id: coddyger.string.generateObjectId() };
			await model.create({
				_id: entry._id,
				fileName: key,
				posterName: isVideo ? partner?.videoPoster : undefined,
				mediaType: isVideo ? 'video' : 'image',
				uploaderId: partner?.user,
				uploaderType: 'partner',
				labels: [],
				maxConfidence: 0,
				status: 'flagged',
				note: 'Signalé par des utilisateurs'
			});
		}
		await moderation.review(String(entry._id), 'reject', adminId);

		const update: any = { $pull: { photos: key } };
		const unset: any = {};
		if (isVideo) Object.assign(unset, { video: '', videoPoster: '' });
		if (key === partner?.videoPoster) unset.videoPoster = '';
		await this.partners.updateOne({ _id: partnerId }, update);
		const thumb: any = await this.partners.findOne({ _id: partnerId, thumbnail: key }, '_id').lean();
		if (thumb) unset.thumbnail = '';
		if (Object.keys(unset).length) await this.partners.updateOne({ _id: partnerId }, { $unset: unset });
	}
}

export const reportService = new ReportService();
