import coddyger, { LoggerService, LogLevel } from 'coddyger';
import { FaqSet, IFaq } from './faq.model';

type FaqApp = IFaq['app'];

/**
 * FAQ Client de départ — 10 questions/réponses du §04 du cahier des charges. Copiée en base au
 * premier accès, puis modifiable dans le CMS. Sert aussi de repli si la base est inaccessible.
 */
export const SUPPORT_FAQ: Array<{ q: string; a: string }> = [
	{
		q: 'Comment fonctionne YOYO ?',
		a: 'YOYO vous donne accès à des offres et réductions chez les marchands partenaires. Découvrez les offres dans l’application.'
	},
	{
		q: 'Dois-je payer pour découvrir les offres ?',
		a: 'Non. Vous pouvez parcourir les offres gratuitement. Un abonnement actif est requis pour utiliser votre réduction au moment du scan.'
	},
	{
		q: 'Combien coûte l’abonnement ?',
		a: '2 000 FCFA par mois ou 19 900 FCFA par an, selon les formules proposées dans l’application.'
	},
	{
		q: 'Combien de fois puis-je scanner ?',
		a: 'Les scans sont illimités avec un abonnement actif, sous réserve des conditions de chaque offre et des règles d’utilisation de YOYO.'
	},
	{
		q: 'Comment profiter d’une réduction ?',
		a: 'Choisissez un marchand participant et suivez le parcours Scanner. Vérifiez le pourcentage et le montant de réduction affichés avant de finaliser l’opération.'
	},
	{
		q: 'Qui encaisse le paiement ?',
		a: 'Le marchand encaisse directement le montant après réduction selon le fonctionnement de l’offre.'
	},
	{
		q: 'Le marchand refuse la réduction : que faire ?',
		a: 'Ne forcez pas la transaction. Ouvrez Contacter YOYO, choisissez Problème marchand et indiquez le nom du commerce ainsi que les détails.'
	},
	{
		q: 'Mon scan ne fonctionne pas : que faire ?',
		a: 'Vérifiez votre connexion et votre abonnement, relancez l’application, puis contactez l’assistance si le problème persiste.'
	},
	{
		q: 'Comment signaler un paiement ou un abonnement non activé ?',
		a: 'Ouvrez Contacter YOYO → Abonnement / paiement, puis transmettez la date et la référence de paiement si disponible.'
	},
	{
		q: 'Comment joindre YOYO ?',
		a: 'Depuis Profil → Centre d’aide → Contacter YOYO. Vous pouvez suivre et retrouver vos échanges au même endroit.'
	}
];

/**
 * FAQ Pro de départ (Excel CMS n°6 : QR code, YO Boost, horaires, revenus). Texte initial à faire
 * relire par l'équipe, puis à ajuster dans le CMS.
 */
export const PRO_FAQ_SEED: Array<{ theme: string; q: string; a: string }> = [
	{
		theme: 'QR code et scans',
		q: 'Comment un client profite-t-il de ma réduction ?',
		a: 'Le client scanne le QR code de votre boutique avec l’appli YOYO, saisit le montant de son achat et voit la réduction appliquée. Vous encaissez le montant après réduction.'
	},
	{
		theme: 'QR code et scans',
		q: 'Où trouver le QR code de ma boutique ?',
		a: 'Depuis l’accueil, touchez « Mon QR ». Le code change régulièrement pour éviter les fraudes : présentez-le à l’écran au moment du passage en caisse.'
	},
	{
		theme: 'QR code et scans',
		q: 'Le scan du client ne fonctionne pas : que faire ?',
		a: 'Vérifiez votre connexion et affichez à nouveau « Mon QR ». Le client doit avoir un abonnement actif. Si le problème persiste, ouvrez une demande « QR code et scans » en précisant l’heure du passage.'
	},
	{
		theme: 'YO Boost',
		q: 'À quoi sert YO Boost ?',
		a: 'YO Boost met votre boutique en avant dans l’appli YOYO : elle apparaît en tête de la page Découvrir pendant la durée choisie.'
	},
	{
		theme: 'YO Boost',
		q: 'J’ai payé YO Boost mais ma boutique n’est pas mise en avant',
		a: 'Patientez quelques minutes puis relancez la vérification du paiement. Si rien ne change, ouvrez une demande « YO Boost » avec la date et la référence du paiement.'
	},
	{
		theme: 'Boutique et horaires',
		q: 'Comment modifier mes horaires d’ouverture ?',
		a: 'Ouvrez Boutiques, choisissez votre boutique puis « Modifier ». Les horaires mis à jour s’affichent aussitôt dans l’appli YOYO.'
	},
	{
		theme: 'Boutique et horaires',
		q: 'Comment changer le pourcentage de réduction ?',
		a: 'Depuis l’accueil, touchez « Modifier le pourcentage de réduction ». Le nouveau pourcentage s’applique aux scans suivants.'
	},
	{
		theme: 'Boutique et horaires',
		q: 'Comment ajouter un gérant ?',
		a: 'Ouvrez l’onglet Gérants et invitez une personne avec son nom et son téléphone. Elle se connecte avec le code d’accès que vous lui transmettez et voit seulement les transactions de la boutique.'
	},
	{
		theme: 'Paiements et revenus',
		q: 'Où voir mes revenus et mes transactions ?',
		a: 'L’accueil affiche vos statistiques, et l’écran Transactions liste chaque achat avec la réduction accordée.'
	},
	{
		theme: 'Paiements et revenus',
		q: 'Une transaction me semble incorrecte',
		a: 'Ouvrez une demande « Paiements et revenus » en indiquant la date, l’heure et le montant. Ces demandes sont traitées en priorité.'
	}
];

/** Seeding concurrent : une seule copie en cours à la fois par appli. */
const seeding: Partial<Record<FaqApp, Promise<void>>> = {};

export class FaqService {
	private readonly dao = new FaqSet();
	private readonly label = 'FaqService';

	/** Copie la FAQ de départ si l'appli n'a encore aucune question en base. */
	private ensureSeeded(app: FaqApp): Promise<void> {
		if (!seeding[app]) {
			seeding[app] = (async () => {
				const model: any = (this.dao as any).defaultModel;
				if ((await model.countDocuments({ app })) > 0) return;
				const items =
					app === 'client'
						? SUPPORT_FAQ.map((f) => ({ theme: '', q: f.q, a: f.a }))
						: PRO_FAQ_SEED;
				await model.insertMany(
					items.map((f, i) => ({
						_id: coddyger.string.generateObjectId(),
						app,
						theme: f.theme,
						question: f.q,
						answer: f.a,
						order: (i + 1) * 10,
						status: 'published'
					}))
				);
			})().catch((error) => {
				delete seeding[app];
				LoggerService.log({ type: LogLevel.Error, content: error, location: this.label, method: 'ensureSeeded' });
			});
		}
		return seeding[app] as Promise<void>;
	}

	/** FAQ publiée d'une appli, au format historique `{ q, a }` plus le thème. */
	async listPublished(app: FaqApp): Promise<Array<{ q: string; a: string; theme: string }>> {
		try {
			await this.ensureSeeded(app);
			const rows: any = await this.dao.selectHug({ app, status: 'published' });
			if (rows?.error) throw rows;
			return (rows as IFaq[]).map((f) => ({ q: f.question, a: f.answer, theme: f.theme ?? '' }));
		} catch (error) {
			LoggerService.log({ type: LogLevel.Error, content: error, location: this.label, method: 'listPublished' });
			return app === 'client' ? SUPPORT_FAQ.map((f) => ({ ...f, theme: '' })) : PRO_FAQ_SEED.map((f) => ({ ...f }));
		}
	}

	/** Toutes les questions (brouillons compris) pour le CMS. */
	async adminList(app?: FaqApp): Promise<IFaq[]> {
		await Promise.all((['client', 'pro'] as FaqApp[]).map((a) => this.ensureSeeded(a)));
		const rows: any = await this.dao.selectHug({ status: { $ne: 'removed' }, ...(app ? { app } : {}) });
		if (rows?.error) throw rows;
		return rows;
	}

	async create(data: Pick<IFaq, 'app' | 'theme' | 'question' | 'answer'> & Partial<Pick<IFaq, 'order' | 'status'>>): Promise<IFaq> {
		const doc: any = await this.dao.save({
			_id: coddyger.string.generateObjectId(),
			app: data.app,
			theme: (data.theme ?? '').trim(),
			question: data.question.trim(),
			answer: data.answer.trim(),
			order: data.order ?? 1000,
			status: data.status ?? 'published'
		} as IFaq);
		if (doc?.error) throw doc;
		return doc;
	}

	/** `null` si la question n'existe pas. */
	async update(id: string, data: Partial<Pick<IFaq, 'app' | 'theme' | 'question' | 'answer' | 'order' | 'status'>>): Promise<IFaq | null> {
		const existing: any = await this.dao.selectOne({ _id: id, status: { $ne: 'removed' } });
		if (!existing || existing.error) return null;
		const patch: any = {};
		for (const key of ['app', 'order', 'status'] as const) {
			if (data[key] !== undefined) patch[key] = data[key];
		}
		for (const key of ['theme', 'question', 'answer'] as const) {
			if (typeof data[key] === 'string') patch[key] = (data[key] as string).trim();
		}
		const res: any = await this.dao.update({ _id: id }, patch);
		if (res?.error) throw res;
		return { ...existing, ...patch };
	}

	/** Suppression logique ; `false` si la question n'existe pas. */
	async remove(id: string): Promise<boolean> {
		const existing: any = await this.dao.selectOne({ _id: id, status: { $ne: 'removed' } });
		if (!existing || existing.error) return false;
		const res: any = await this.dao.update({ _id: id }, { status: 'removed' });
		if (res?.error) throw res;
		return true;
	}
}

export const faqService = new FaqService();
