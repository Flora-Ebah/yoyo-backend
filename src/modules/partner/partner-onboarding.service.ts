import crypto from 'crypto';
import coddyger, { defines, LoggerService, LogLevel } from 'coddyger';
import { MessageHelper } from '../../helpers/message.helper';
import { NotificationHelper } from '../../helpers/notification.helper';
import { NotificationCategory } from '../../services/notification/notification.interface';
import { TokenMiddleware } from '../../api/middleware/token.middleware';
import { AdminSet } from '../admin';
import { CategoryService } from '../category/category.service';
import { ClientSet } from '../client/client.model';
import { ClientService } from '../client/client.service';
import { EnrolmentService } from '../enrolment/enrolment.service';
import { PartnerService } from './partner.service';

const serviceLabel = 'PartnerOnboardingService';

/** Corps attendu par `POST /partners/onboard`. */
export interface IOnboardPayload {
  merchant: {
    firstname: string;
    lastname: string;
    email: string;
    contact: string;
    ville?: string;
  };
  shop: {
    name: string;
    categoryId: string;
    ville?: string;
    address?: string;
    phone?: string;
    description?: string;
  };
  channels?: { email?: boolean; sms?: boolean };
}

/** Commercial authentifié, tel que déduit du jeton. */
export interface ICommercial {
  _id: string;
  firstname?: string;
  lastname?: string;
  email?: string;
}

/** Résultat interne, traduit en réponse HTTP par le contrôleur. */
export type OnboardingResult =
  | { ok: true; status: number; message: string; data: any }
  | { ok: false; status: number; message: string; data?: any };

/**
 * Orchestration de l'onboarding marchand à distance.
 *
 * Isolé de `PartnerService` (déjà volumineux) car il coordonne quatre agrégats — Client, Partner,
 * Enrolment et les canaux d'envoi — là où `PartnerService` ne connaît que la boutique.
 */
export class PartnerOnboardingService {
  private readonly clientService: ClientService;
  private readonly partnerService: PartnerService;
  private readonly categoryService: CategoryService;
  private readonly enrolmentService: EnrolmentService;

  constructor() {
    this.clientService = new ClientService();
    this.partnerService = new PartnerService();
    this.categoryService = new CategoryService();
    this.enrolmentService = new EnrolmentService();
  }

  /**
   * Résout le nom affichable du commercial.
   *
   * Le jeton d'un admin ne porte pas systématiquement `firstname`/`lastname` : on retombe alors sur
   * la base. Ce nom est figé dans l'enrôlement (instantané), d'où l'effort pour l'obtenir.
   */
  private async resolveCommercialName(commercial: ICommercial): Promise<string> {
    const fromToken = `${commercial.firstname ?? ''} ${commercial.lastname ?? ''}`.trim();

    if (fromToken) {
      return fromToken;
    }

    try {
      const dao: any = new AdminSet();
      const admin: any = await dao.selectOne({ _id: commercial._id }, '-password -__v');
      const fromDb = `${admin?.firstname ?? ''} ${admin?.lastname ?? ''}`.trim();

      return fromDb || admin?.email || commercial.email || 'Commercial';
    } catch (error) {
      return commercial.email || 'Commercial';
    }
  }

  /**
   * Construit le lien d'activation destiné au marchand.
   * @returns L'URL, ou `null` si l'application Pro n'est pas configurée
   */
  private buildActivationUrl(rawToken: string): string | null {
    const base = (process.env.PRO_APP_URL ?? '').trim();

    if (!base) {
      LoggerService.log({
        type: LogLevel.Error,
        content: "PRO_APP_URL n'est pas configuré : aucun lien d'activation ne peut être envoyé.",
        location: serviceLabel,
        method: 'buildActivationUrl'
      });
      return null;
    }

    return `${base.replace(/\/+$/, '')}/activation?token=${rawToken}`;
  }

  /**
   * Émet un jeton, l'enregistre sur l'enrôlement, puis envoie le lien sur les canaux demandés.
   *
   * Mutualisé entre l'onboarding initial et le renvoi, pour que les deux chemins produisent
   * exactement le même lien et la même comptabilisation des tentatives.
   *
   * @returns Les canaux réellement partis
   */
  private async issueAndSendActivation(
    enrolment: any,
    merchant: { email: string; contact: string; name: string },
    channels: { email?: boolean; sms?: boolean }
  ): Promise<string[]> {
    const token = this.enrolmentService.issueActivationToken();

    await this.enrolmentService.update(enrolment._id, {
      activationTokenHash: token.hash,
      activationTokenExpiresAt: token.expiresAt,
      // Une réémission invalide le jeton précédent : le nouveau remplace l'empreinte, et ce champ
      // repasse à `null` pour que le nouveau lien soit consommable. `null` et non `undefined` :
      // Mongoose ignore purement et simplement les valeurs `undefined` d'un update.
      activationTokenUsedAt: null
    } as any);

    const activationUrl = this.buildActivationUrl(token.raw);

    if (!activationUrl) {
      return [];
    }

    const ttlHours = Number(process.env.ACTIVATION_TOKEN_TTL_HOURS) || 72;

    const outcome = await MessageHelper.merchantActivationNotify(
      {
        email: merchant.email,
        contact: merchant.contact,
        name: merchant.name,
        shopName: enrolment.shopName,
        commercialName: enrolment.commercialName,
        activationUrl,
        expiresInHours: ttlHours
      },
      channels
    );

    if (Object.keys(outcome.errors).length > 0) {
      LoggerService.log({
        type: LogLevel.Warn,
        content: `Envoi du lien d'activation partiellement en échec (enrôlement ${enrolment._id}) : ${JSON.stringify(
          Object.keys(outcome.errors)
        )}`,
        location: serviceLabel,
        method: 'issueAndSendActivation'
      });
    }

    await this.enrolmentService.update(enrolment._id, {
      activationChannels: outcome.sent,
      activationSentAt: new Date(),
      activationAttempts: (enrolment.activationAttempts ?? 0) + 1
    });

    return outcome.sent;
  }

  /**
   * Crée un compte marchand et sa boutique pour le compte d'un commercial, puis lui envoie le lien
   * d'activation.
   *
   * @param payload Corps de la requête (déjà validé par le schéma Fastify)
   * @param commercial Admin authentifié — l'attribution vient d'ici, jamais du corps
   */
  async onboard(payload: IOnboardPayload, commercial: ICommercial): Promise<OnboardingResult> {
    let merchantId: string | null = null;

    try {
      const merchant = payload.merchant ?? ({} as any);
      const shop = payload.shop ?? ({} as any);
      const channels = payload.channels ?? { email: true, sms: true };

      // --- 1. Normalisation --------------------------------------------------------------
      const email = this.clientService.formatEmail(merchant.email ?? '');
      const contact = this.clientService.formatIvorianPhoneNumber(merchant.contact ?? '');
      const firstname = this.clientService.formatName(merchant.firstname ?? '');
      const lastname = this.clientService.formatName(merchant.lastname ?? '');
      const shopName = (shop.name ?? '').trim();

      // --- 2. Validation -----------------------------------------------------------------
      const emailValidation = this.clientService.validateEmail(email);
      if (!emailValidation.isValid) {
        return { ok: false, status: defines.status.badRequest, message: emailValidation.message! };
      }

      const phoneValidation = this.clientService.validateIvorianPhoneNumber(contact);
      if (!phoneValidation.isValid) {
        return { ok: false, status: defines.status.badRequest, message: phoneValidation.message! };
      }

      if (!firstname || !lastname) {
        return { ok: false, status: defines.status.badRequest, message: 'Le nom et le prénom du marchand sont requis' };
      }

      if (!shopName) {
        return { ok: false, status: defines.status.badRequest, message: 'Le nom de la boutique est requis' };
      }

      if (!coddyger.string.isValidObjectId(shop.categoryId)) {
        return { ok: false, status: defines.status.badRequest, message: "L'identifiant de catégorie n'est pas valide" };
      }

      // `getById` renvoie une valeur vide si la catégorie n'existe pas — il ne lève pas.
      const category: any = await this.categoryService.getById(shop.categoryId);
      if (!category || category.error) {
        return { ok: false, status: defines.status.badRequest, message: "La catégorie sélectionnée n'existe pas" };
      }

      // --- 3. Unicité --------------------------------------------------------------------
      const existing = await this.clientService.checkExistingCredentials(email, contact);
      if (existing.exists) {
        return { ok: false, status: defines.status.conflict, message: existing.message! };
      }

      // --- 4. Compte marchand ------------------------------------------------------------
      merchantId = coddyger.string.generateObjectId();

      // Mot de passe aléatoire : le schéma l'exige, mais il n'est ni journalisé, ni transmis, ni
      // utilisable — le compte reste `pending` jusqu'à ce que le marchand définisse le sien.
      const throwawayPassword = crypto.randomBytes(32).toString('hex');

      const savedClient: any = await this.clientService.create({
        _id: merchantId,
        email,
        firstname,
        lastname,
        contact,
        password: await coddyger.string.encryptPassword(throwawayPassword),
        isPartner: true,
        mustChangePassword: true,
        status: 'pending',
        isEmailConfirmed: false,
        isPhoneConfirmed: false,
        createdBy: commercial._id
      } as any);

      if (savedClient?.error) {
        return { ok: false, status: defines.status.clientError, message: 'La création du compte marchand a échoué' };
      }

      // --- 5. Boutique -------------------------------------------------------------------
      const savedPartner: any = await this.partnerService.create({
        name: shopName,
        description: shop.description,
        ville: shop.ville ?? merchant.ville,
        address: shop.address,
        phone: shop.phone,
        email,
        // Le contrat expose un `categoryId` unique ; le modèle stocke un tableau. Ranger la valeur
        // ici évite un changement de schéma et laisse la porte ouverte au multi-catégories.
        categories: [shop.categoryId],
        user: merchantId,
        createdBy: commercial._id,
        status: 'active'
      } as any);

      if (!savedPartner || savedPartner.error) {
        // Compensation : suppression **physique** du client. Un `status: 'removed'` ne suffirait
        // pas — `checkExistingCredentials` cherche sans filtre de statut, l'e-mail resterait donc
        // bloqué à jamais et la seconde tentative du commercial échouerait en 409 inexplicable.
        await this.hardDeleteClient(merchantId!);
        merchantId = null;

        return {
          ok: false,
          status: defines.status.clientError,
          message: savedPartner?.data ?? 'La création de la boutique a échoué'
        };
      }

      // --- 6. Enrôlement (instantané figé) -----------------------------------------------
      const commercialName = await this.resolveCommercialName(commercial);

      const enrolment: any = await this.enrolmentService.create({
        client: merchantId!,
        partner: savedPartner._id,
        commercial: commercial._id,
        merchantName: `${firstname} ${lastname}`.trim(),
        merchantEmail: email,
        merchantPhone: contact,
        shopName,
        ville: shop.ville ?? merchant.ville,
        category: category.name,
        commercialName,
        enrolmentStatus: 'pending'
      });

      if (!enrolment || enrolment.error) {
        // Le compte et la boutique existent : on ne les détruit pas pour une trace manquante, mais
        // l'absence d'enrôlement signifie « pas de commission » — il faut donc le savoir.
        LoggerService.log({
          type: LogLevel.Error,
          content: `Enrôlement non enregistré pour le marchand ${merchantId} (commercial ${commercial._id})`,
          location: serviceLabel,
          method: 'onboard'
        });

        return {
          ok: false,
          status: defines.status.clientError,
          message: "Le compte a été créé mais l'enrôlement n'a pas pu être enregistré. Contactez le support."
        };
      }

      // --- 7 & 8. Jeton + envoi ----------------------------------------------------------
      const sent = await this.issueAndSendActivation(
        enrolment,
        { email, contact, name: `${firstname} ${lastname}`.trim() },
        channels
      );

      // --- 9. Notification du commercial -------------------------------------------------
      await NotificationHelper.notifyAdminInApp({
        to: commercial._id,
        title: 'Partenaire créé',
        message: `Le compte de ${firstname} ${lastname} et sa boutique « ${shopName} » ont été créés.${
          sent.length > 0 ? " Lien d'activation envoyé." : " Le lien d'activation n'a pas pu être envoyé."
        }`,
        category: NotificationCategory.INFO,
        metadata: {
          type: 'partner',
          partnerId: String(savedPartner._id),
          merchantId: String(merchantId),
          enrolmentId: String(enrolment._id)
        }
      });

      // Suivi côté administration : les super-admins voient l'activité d'enrôlement (hors auteur).
      await NotificationHelper.notifySuperAdmins({
        title: 'Nouveau marchand enrôlé',
        message: `${commercialName} a enrôlé ${firstname} ${lastname} — boutique « ${shopName} ».`,
        category: NotificationCategory.INFO,
        exclude: commercial._id,
        metadata: {
          type: 'enrolment',
          partnerId: String(savedPartner._id),
          merchantId: String(merchantId),
          enrolmentId: String(enrolment._id)
        }
      });

      // --- 10. Réponse -------------------------------------------------------------------
      return {
        ok: true,
        status: defines.status.created,
        message:
          sent.length > 0
            ? "Marchand enrôlé. Le lien d'activation lui a été envoyé."
            : "Marchand enrôlé, mais le lien d'activation n'a pas pu être envoyé. Utilisez « Renvoyer le lien ».",
        data: {
          merchantId: String(merchantId),
          partnerId: String(savedPartner._id),
          enrolmentId: String(enrolment._id),
          activationSent: sent.length > 0,
          channels: sent
        }
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: serviceLabel,
        method: 'onboard'
      });

      // Un client créé avant l'incident laisserait son e-mail bloqué : on le retire.
      if (merchantId) {
        await this.hardDeleteClient(merchantId!);
      }

      return { ok: false, status: defines.status.serverError, message: defines.message.tryCatch };
    }
  }

  /**
   * Supprime physiquement un client. Réservé à la compensation d'un onboarding avorté : ailleurs,
   * la convention du projet est la suppression logique (`status: 'removed'`).
   */
  private async hardDeleteClient(clientId: string): Promise<void> {
    try {
      const dao: any = new ClientSet();
      await dao.remove({ _id: clientId });
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: `Compensation impossible : le client ${clientId} n'a pas pu être supprimé — ${error}`,
        location: serviceLabel,
        method: 'hardDeleteClient'
      });
    }
  }

  /**
   * Active un compte marchand : le porteur du lien définit son mot de passe.
   *
   * @param token Jeton en clair issu du lien
   * @param password Mot de passe choisi par le marchand
   */
  async activate(token: string, password: string): Promise<OnboardingResult> {
    try {
      // Consommation atomique : un seul appelant peut réussir avec un jeton donné. C'est aussi ce
      // qui garantit qu'une activation ne produit qu'une seule notification.
      const enrolment: any = await this.enrolmentService.consumeActivationToken(token);

      if (!enrolment) {
        // 400 et non 401 : un 401 déclencherait une tentative de rafraîchissement de session côté
        // client alors qu'il n'y a aucune session en jeu.
        return {
          ok: false,
          status: defines.status.badRequest,
          message: "Ce lien d'activation est invalide, expiré ou a déjà été utilisé."
        };
      }

      const client: any = await this.clientService.getById(String(enrolment.client));

      if (!client) {
        return { ok: false, status: defines.status.notFound, message: "Le compte marchand associé à ce lien n'existe plus." };
      }

      await this.clientService.update(String(enrolment.client), {
        password: await coddyger.string.encryptPassword(password),
        mustChangePassword: false,
        // Le compte devient connectable : `LoginService.buildClientSearchQuery` exige `active`.
        status: 'active',
        // Ouvrir le lien reçu par e-mail prouve la possession de l'adresse. Le téléphone, lui,
        // n'est pas prouvé : le lien a pu être ouvert depuis l'e-mail. Le parcours OTP reste la
        // seule voie de confirmation du numéro.
        isEmailConfirmed: true,
        activatedAt: new Date()
      } as any);

      await NotificationHelper.notifyAdminInApp({
        to: enrolment.commercial,
        title: 'Boutique activée',
        message: `${enrolment.shopName} a activé sa boutique via le lien d'invitation.`,
        category: NotificationCategory.SUCCESS,
        metadata: {
          type: 'partner',
          partnerId: String(enrolment.partner),
          merchantId: String(enrolment.client),
          enrolmentId: String(enrolment._id)
        }
      });

      await NotificationHelper.notifySuperAdmins({
        title: 'Boutique activée',
        message: `${enrolment.shopName} a activé sa boutique.`,
        category: NotificationCategory.SUCCESS,
        exclude: enrolment.commercial,
        metadata: {
          type: 'partner',
          partnerId: String(enrolment.partner),
          merchantId: String(enrolment.client),
          enrolmentId: String(enrolment._id)
        }
      });

      return {
        ok: true,
        status: defines.status.requestOK,
        message: 'Votre compte est activé. Vous pouvez maintenant vous connecter.',
        data: {
          merchantId: String(enrolment.client),
          partnerId: String(enrolment.partner),
          activated: true
        }
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: serviceLabel,
        method: 'activate'
      });

      return { ok: false, status: defines.status.serverError, message: defines.message.tryCatch };
    }
  }

  /**
   * Réémet un lien d'activation pour un enrôlement encore en attente.
   *
   * C'est le pendant du choix « pas de rollback » : un envoi raté ne coûte pas la saisie du
   * commercial, il se rattrape ici.
   *
   * @param enrolmentId Enrôlement concerné
   * @param commercial Admin appelant — un commercial ne peut relancer que ses propres enrôlements
   */
  async resendActivation(enrolmentId: string, commercial: ICommercial): Promise<OnboardingResult> {
    try {
      if (!coddyger.string.isValidObjectId(enrolmentId)) {
        return { ok: false, status: defines.status.badRequest, message: "L'identifiant de l'enrôlement n'est pas valide" };
      }

      const enrolment: any = await this.enrolmentService.getById(enrolmentId);

      if (!enrolment) {
        return { ok: false, status: defines.status.notFound, message: "Cet enrôlement n'existe pas" };
      }

      // Cloisonnement : sans droit global sur l'activité commerciale, on ne relance que ce qu'on a
      // soi-même enrôlé. Le droit est résolu ici et non dans le handler, qui doit rester synchrone.
      const isPrivileged = await TokenMiddleware.hasAbility(commercial._id, 'read', 'enrolments');

      if (!isPrivileged && String(enrolment.commercial) !== String(commercial._id)) {
        return { ok: false, status: defines.status.forbidden, message: 'Cet enrôlement ne vous appartient pas' };
      }

      if (enrolment.enrolmentStatus === 'activated') {
        return { ok: false, status: defines.status.conflict, message: 'Ce marchand a déjà activé son compte' };
      }

      const sent = await this.issueAndSendActivation(
        enrolment,
        {
          email: enrolment.merchantEmail,
          contact: enrolment.merchantPhone,
          name: enrolment.merchantName
        },
        { email: true, sms: true }
      );

      return {
        ok: true,
        status: defines.status.requestOK,
        message:
          sent.length > 0
            ? "Un nouveau lien d'activation a été envoyé."
            : "Le lien n'a pu être envoyé sur aucun canal. Vérifiez la configuration e-mail/SMS.",
        data: {
          enrolmentId: String(enrolment._id),
          activationSent: sent.length > 0,
          channels: sent
        }
      };
    } catch (error) {
      LoggerService.log({
        type: LogLevel.Error,
        content: error,
        location: serviceLabel,
        method: 'resendActivation'
      });

      return { ok: false, status: defines.status.serverError, message: defines.message.tryCatch };
    }
  }
}
