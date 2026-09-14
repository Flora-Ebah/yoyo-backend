import { LoggerService, LogLevel } from 'coddyger';
import { Events, IPushNotification, PushNotificationService } from '../../modules/push-notification';
import { PaymentSet } from '../../modules/payment/payment.model';
import { PartnerSet } from '../../modules/partner';

const handlerLabel = 'PaymentInitiatedHandler';

export interface IPaymentInitiatedPayload {
  paymentId: string;
  partnerId: string;
}

/**
 * Notifie le partenaire qu'une demande de réduction vient d'être créée.
 *
 * Ce traitement vivait auparavant dans `PaymentService.create`, donc dans le chemin critique du
 * scan : le client attendait l'écriture du document de notification ET sa diffusion socket avant
 * de recevoir sa réponse. Il est désormais consommé depuis la file d'événements, ce qui le rend
 * aussi réessayable — une notification en échec était jusqu'ici marquée `failed` sans jamais être
 * rejouée.
 *
 * Toute exception levée ici déclenche un réessai par la file (3 tentatives, backoff).
 */
export async function handlePaymentInitiated(payload: IPaymentInitiatedPayload): Promise<void> {
  const { paymentId, partnerId } = payload;

  const paymentDao: any = new PaymentSet();
  const partnerDao: any = new PartnerSet();

  // Lectures projetées et `lean` : on n'a besoin que de l'identité du demandeur et du
  // propriétaire de la boutique, pas des catégories ni des horaires d'ouverture.
  const [payment, partner] = await Promise.all([
    paymentDao.defaultModel
      .findOne({ _id: paymentId }, '_id from to')
      .populate('from', '_id firstname lastname')
      .lean(),
    partnerDao.defaultModel.findOne({ _id: partnerId }, '_id name user').lean()
  ]);

  if (!payment || !partner) {
    LoggerService.log({
      type: LogLevel.Warn,
      content: `Demande ${paymentId} ou partenaire ${partnerId} introuvable : notification abandonnée`,
      location: handlerLabel,
      method: 'handlePaymentInitiated'
    });
    return;
  }

  // Le code d'origine faisait `subscription.userId.firstname.split(' ')[0]`, qui lève dès que le
  // prénom est nul ou que la référence n'est pas peuplée — et faisait alors échouer tout le scan.
  const client: any = payment.from ?? {};
  const lastname: string = (client.lastname ?? '').trim();
  const firstname: string = (client.firstname ?? '').trim().split(' ')[0] ?? '';
  const clientName: string = [lastname, firstname].filter(Boolean).join(' ') || 'un client';

  const pushNotificationService = new PushNotificationService();

  const notification: any = await pushNotificationService.create({
    title: 'Demande de réduction',
    body: `Une nouvelle demande de réduction a été initiée par ${clientName}`,
    type: 'info',
    priority: 'high',
    data: {
      userId: partner.user,
      demand: paymentId,
      boutiqueId: partnerId,
      url: `/payment/${paymentId}`
    },
    target: Events.PUSH_DEMANDE,
    status: 'pending'
  } as IPushNotification);

  // `PushNotificationService.create` retourne l'erreur au lieu de la lever (convention du projet).
  // On la transforme en exception pour que la file déclenche un réessai.
  if (notification?.error) {
    throw new Error(`Échec de la notification de la demande ${paymentId}`);
  }
}
