import { BRAND, codeBox, emailButton, infoBox, securityNote, storeButtons, wrapEmail } from './email-theme';

/**
 * Types de messages pour les communications avec les utilisateurs
 * Cette classe centralise tous les types de messages qui peuvent être envoyés
 * via email ou SMS, avec leurs templates et configurations
 *
 * Les templates ci-dessous ne décrivent que le **contenu** d'un message : l'habillage de marque
 * (logo, en-tête, pied de page, typographie) est appliqué une seule fois par `getEmailTemplate`,
 * via `wrapEmail`. Les couleurs viennent de `email-theme.ts` — ne jamais coder une couleur en dur
 * ici, sous peine de rejouer l'écart au thème qui a fait dériver ces templates.
 */
export class MessageTypes {
  // Types de messages (utilisés comme identifiants)
  static readonly TYPES = {
    // Messages liés à l'authentification
    ACCOUNT_VERIFICATION: 'account_verification',
    PASSWORD_RESET: 'password_reset',
    LOGIN_VERIFICATION: 'login_verification',
    TWO_FACTOR_AUTH: 'two_factor_auth',
    
    // Messages liés aux transactions
    TRANSACTION_CONFIRMATION: 'transaction_confirmation',
    PAYMENT_CONFIRMATION: 'payment_confirmation',
    TRANSFER_NOTIFICATION: 'transfer_notification',
    
    // Messages liés au compte
    ACCOUNT_UPDATED: 'account_updated',
    SECURITY_ALERT: 'security_alert',
    PROFILE_CHANGES: 'profile_changes',
    
    // Messages liés aux notifications
    WELCOME_MESSAGE: 'welcome_message',
    ACCOUNT_REMINDER: 'account_reminder',
    INACTIVITY_ALERT: 'inactivity_alert',
    
    // Messages marketing
    PROMOTIONAL_OFFER: 'promotional_offer',
    NEW_FEATURE_ANNOUNCEMENT: 'new_feature_announcement',
    SURVEY_INVITATION: 'survey_invitation',

    // Messages sans OTP
    PAYMENT_SUCCESS: 'payment_success',
    PAYMENT_FAILED: 'payment_failed',
    TRANSFER_SUCCESS: 'transfer_success',
    TRANSFER_FAILED: 'transfer_failed',
    ACCOUNT_CREATED: 'account_created',
    ACCOUNT_DELETED: 'account_deleted',
    PROFILE_UPDATED: 'profile_updated',
    PASSWORD_CHANGED: 'password_changed',
    EMAIL_CHANGED: 'email_changed',
    PHONE_CHANGED: 'phone_changed',
    BALANCE_LOW: 'balance_low',
    BALANCE_HIGH: 'balance_high',
    SUSPICIOUS_ACTIVITY: 'suspicious_activity',
    MAINTENANCE_NOTICE: 'maintenance_notice',
    SYSTEM_UPDATE: 'system_update',
    LOGIN_NOTIFICATION: 'login_notification',
    CERTIFICATION_NOTIFICATION: 'certification_notification',
    MERCHANT_ACTIVATION: 'merchant_activation',
  };

  /**
   * Templates d'e-mails.
   *
   * La signature est **imposée** : `(code, name, details)`, dans cet ordre, y compris pour les
   * messages qui n'utilisent pas de code — `getEmailTemplate` appelle toujours
   * `template(code, name, details)`. Quinze templates déclaraient `(name, details)` : `name` y
   * recevait donc le code (une chaîne vide hors OTP, d'où un « cher utilisateur » systématique) et
   * `details` recevait le nom, ce qui faisait disparaître montants, dates et appareils au profit
   * de « undefined ». Les templates sans code nomment leur premier paramètre `_code`.
   */
  static readonly EMAIL_TEMPLATES = {
    [MessageTypes.TYPES.ACCOUNT_VERIFICATION]: {
      subject: 'Vérification de votre compte YoYo',
      hero: 'Vérifiez votre compte',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Bienvenue chez YoYo ! Pour finaliser votre inscription, saisissez ce code de vérification :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '10 minutes · usage unique' }])}
        ${securityNote("Vous n'avez pas créé de compte YoYo ? Ignorez simplement cet e-mail, aucune action ne sera engagée.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PASSWORD_RESET]: {
      subject: 'Réinitialisation de votre mot de passe YoYo',
      hero: 'Réinitialisation du mot de passe',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Utilisez ce code pour confirmer :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '10 minutes · usage unique' }])}
        ${securityNote("Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail : votre mot de passe restera inchangé.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.LOGIN_VERIFICATION]: {
      subject: 'Code de vérification pour votre connexion YoYo',
      hero: 'Vérification de connexion',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une connexion à votre compte a été demandée. Saisissez ce code pour confirmer que c'est bien vous :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '10 minutes · usage unique' }])}
        ${securityNote("Vous n'êtes pas à l'origine de cette connexion ? Sécurisez votre compte en changeant votre mot de passe.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TWO_FACTOR_AUTH]: {
      subject: 'Code d\'authentification à deux facteurs YoYo',
      hero: 'Authentification à deux facteurs',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Pour finaliser votre authentification à deux facteurs, saisissez ce code :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '5 minutes · usage unique' }])}
        ${securityNote("Vous n'avez pas initié cette connexion ? Sécurisez votre compte immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSACTION_CONFIRMATION]: {
      subject: 'Confirmation de transaction YoYo',
      hero: 'Confirmation de transaction',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Confirmez cette transaction sur votre compte à l'aide du code ci-dessous :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Validité du code', value: '10 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'avez pas initié cette transaction ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PAYMENT_CONFIRMATION]: {
      subject: 'Confirmation de paiement YoYo',
      hero: 'Confirmation de paiement',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Confirmez ce paiement sur votre compte à l'aide du code ci-dessous :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Validité du code', value: '5 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'avez pas initié ce paiement ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_NOTIFICATION]: {
      subject: 'Notification de transfert YoYo',
      hero: 'Notification de transfert',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Un transfert a été initié sur votre compte. Pour l'autoriser, saisissez ce code :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Validité du code', value: '5 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'avez pas initié ce transfert ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_UPDATED]: {
      subject: 'Mise à jour de votre compte YoYo',
      hero: 'Confirmez la modification',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une modification a été demandée sur votre compte. Confirmez-la avec ce code :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Modification', value: details?.changes },
          { label: 'Validité du code', value: '15 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'avez pas demandé ce changement ? Ignorez cet e-mail et vérifiez la sécurité de votre compte.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SECURITY_ALERT]: {
      subject: 'Alerte de sécurité YoYo',
      hero: 'Alerte de sécurité',
      heroTone: 'neutral',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une activité inhabituelle a été détectée sur votre compte. Pour vérifier votre identité, saisissez ce code :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Activité', value: details?.activity },
          { label: 'Validité du code', value: '10 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'êtes pas à l'origine de cette activité ? Changez votre mot de passe immédiatement.", 'danger')}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROFILE_CHANGES]: {
      subject: 'Confirmation des modifications de profil YoYo',
      hero: 'Modification de profil',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Confirmez la modification de votre profil à l'aide du code ci-dessous :</p>
        ${codeBox(code)}
        ${infoBox([
          { label: 'Modification', value: details?.changes },
          { label: 'Validité du code', value: '15 minutes · usage unique' }
        ])}
        ${securityNote("Vous n'avez pas demandé ces modifications ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.WELCOME_MESSAGE]: {
      subject: 'Bienvenue sur YoYo !',
      hero: 'Bienvenue sur YoYo',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Nous sommes ravis de vous accueillir ! Pour activer votre compte et commencer à profiter de nos services, saisissez ce code :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '24 heures' }])}
        ${securityNote("Vous n'avez pas créé de compte YoYo ? Ignorez simplement cet e-mail.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_REMINDER]: {
      subject: 'Rappel concernant votre compte YoYo',
      hero: 'Rappel de compte',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Voici un rappel concernant votre compte YoYo. Pour y accéder et vérifier vos informations, saisissez ce code :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '24 heures' }])}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.INACTIVITY_ALERT]: {
      subject: 'Alerte d\'inactivité de votre compte YoYo',
      hero: 'Votre compte est inactif',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre compte YoYo est inactif depuis un certain temps. Pour le garder actif et éviter sa désactivation, connectez-vous avec ce code :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité du code', value: '48 heures' }])}
        ${securityNote("Vous ne souhaitez plus utiliser votre compte ? Vous pouvez ignorer ce message.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROMOTIONAL_OFFER]: {
      subject: 'Offre spéciale YoYo - Code promo exclusif',
      hero: 'Une offre rien que pour vous',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Nous avons le plaisir de vous offrir une promotion exclusive${details?.offer ? ' : ' + details.offer : ''}. Pour en profiter, utilisez ce code :</p>
        ${codeBox(code)}
        ${infoBox([{ label: 'Validité de l\'offre', value: details?.validity || 'durée limitée' }])}
        <p>Ne manquez pas cette opportunité !</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.NEW_FEATURE_ANNOUNCEMENT]: {
      subject: 'Découvrez les nouvelles fonctionnalités de YoYo',
      hero: 'Du nouveau sur YoYo',
      template: (code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Nous lançons de nouvelles fonctionnalités sur YoYo${details?.features ? ' : ' + details.features : ''}. Pour les découvrir, utilisez ce code :</p>
        ${codeBox(code)}
        <p>Nous espérons que ces nouveautés amélioreront votre expérience.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SURVEY_INVITATION]: {
      subject: 'Invitation à participer à notre enquête YoYo',
      hero: 'Votre avis compte',
      template: (code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Aidez-nous à améliorer nos services en participant à notre enquête. Pour y accéder, utilisez ce code :</p>
        ${codeBox(code)}
        <p>Votre participation compte beaucoup pour nous — un avantage exclusif pourrait vous être réservé.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    // Templates sans OTP
    [MessageTypes.TYPES.PAYMENT_SUCCESS]: {
      subject: 'Paiement réussi - YoYo',
      hero: 'Paiement réussi',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre paiement a bien été traité.</p>
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Date', value: new Date().toLocaleString() }
        ])}
        ${securityNote("Vous n'avez pas effectué ce paiement ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PAYMENT_FAILED]: {
      subject: 'Échec du paiement - YoYo',
      hero: 'Paiement échoué',
      heroTone: 'neutral',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre paiement n'a pas pu être traité.</p>
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Motif', value: details?.reason || 'Non spécifié' }
        ])}
        <p>Vous pouvez réessayer ou contacter notre service client pour plus d'informations.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_SUCCESS]: {
      subject: 'Transfert réussi - YoYo',
      hero: 'Transfert réussi',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre transfert a bien été effectué.</p>
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Date', value: new Date().toLocaleString() }
        ])}
        ${securityNote("Vous n'avez pas effectué ce transfert ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_FAILED]: {
      subject: 'Échec du transfert - YoYo',
      hero: 'Transfert échoué',
      heroTone: 'neutral',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre transfert n'a pas pu être effectué.</p>
        ${infoBox([
          { label: 'Montant', value: details?.amount ? details.amount + ' ' + (details.currency || '') : undefined },
          { label: 'Motif', value: details?.reason || 'Non spécifié' }
        ])}
        <p>Vous pouvez réessayer ou contacter notre service client pour plus d'informations.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_CREATED]: {
      subject: 'Compte créé avec succès - YoYo',
      hero: 'Bienvenue dans la famille YoYo',
      template: (_code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre compte a été créé avec succès. Vous pouvez dès maintenant profiter de nos services.</p>
        <p>Pour bien démarrer, nous vous recommandons de :</p>
        <ul>
          <li>Vérifier vos informations personnelles</li>
          <li>Activer l'authentification à deux facteurs</li>
          <li>Choisir un mot de passe fort</li>
        </ul>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.MERCHANT_ACTIVATION]: {
      subject: 'Activez votre boutique YoYo',
      // Bandeau de marque coloré en tête de carte (rendu par wrapEmail via l'option `hero`).
      hero: 'Bienvenue dans la famille YoYo',
      // Contrairement aux autres templates, le premier paramètre n'est pas exploité : `EmailService.send`
      // appelle `getEmailTemplate(template, '', ...)` avec un code vide. Le lien transite donc par
      // `details.activationUrl`, alimenté depuis `templateData`.
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher partenaire'}</strong></p>
        <p>Bonne nouvelle : votre boutique${details?.shopName ? ' <strong>' + details.shopName + '</strong>' : ''} est prête ! Votre compte marchand vient d'être créé${details?.commercialName ? ' par ' + details.commercialName : ''}</p>
        <p>Il ne reste qu'une petite étape pour démarrer : <strong>choisissez votre code de sécurité</strong> et c'est parti</p>
        ${emailButton(details?.activationUrl || '#', 'Activer ma boutique')}
        <p style="text-align: center; color: ${BRAND.textMuted}; font-size: 13px; margin: 0 0 6px;">Vous n'avez pas encore l'application ? Téléchargez-la :</p>
        ${storeButtons()}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F7F8FA; margin-top: 16px;">
          <tr><td style="padding: 14px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 13px;">
              ${details?.shopName ? `<tr><td style="color: ${BRAND.textMuted}; padding: 3px 0;">Boutique</td><td align="right" style="color: ${BRAND.text}; font-weight: 600; padding: 3px 0;">${details.shopName}</td></tr>` : ''}
              <tr><td style="color: ${BRAND.textMuted}; padding: 3px 0;">Validité du lien</td><td align="right" style="color: ${BRAND.text}; font-weight: 600; padding: 3px 0;">${details?.expiresInHours || 72} h · usage unique</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin-top: 20px;">Vous n'attendiez pas cet e-mail ? Pas d'inquiétude, ignorez-le simplement : sans activation, rien ne se passe.</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_DELETED]: {
      subject: 'Compte supprimé - YoYo',
      hero: 'Compte supprimé',
      heroTone: 'neutral',
      template: (_code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre compte YoYo a bien été supprimé.</p>
        <p>Nous espérons vous revoir bientôt.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROFILE_UPDATED]: {
      subject: 'Profil mis à jour - YoYo',
      hero: 'Profil mis à jour',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre profil a bien été mis à jour.</p>
        ${infoBox([{ label: 'Modifications', value: details?.changes }])}
        ${securityNote("Vous n'êtes pas à l'origine de ces modifications ? Contactez notre service client immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PASSWORD_CHANGED]: {
      subject: 'Mot de passe modifié - YoYo',
      hero: 'Mot de passe modifié',
      template: (_code: string, name?: string) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre mot de passe a bien été modifié.</p>
        ${securityNote("Vous n'êtes pas à l'origine de ce changement ? Sécurisez votre compte immédiatement.", 'danger')}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.EMAIL_CHANGED]: {
      subject: 'Email modifié - YoYo',
      hero: 'Adresse e-mail modifiée',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre adresse e-mail a bien été modifiée.</p>
        ${infoBox([{ label: 'Nouvelle adresse', value: details?.newEmail }])}
        ${securityNote("Vous n'êtes pas à l'origine de ce changement ? Sécurisez votre compte immédiatement.", 'danger')}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PHONE_CHANGED]: {
      subject: 'Numéro de téléphone modifié - YoYo',
      hero: 'Numéro de téléphone modifié',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre numéro de téléphone a bien été modifié.</p>
        ${infoBox([{ label: 'Nouveau numéro', value: details?.newPhone }])}
        ${securityNote("Vous n'êtes pas à l'origine de ce changement ? Sécurisez votre compte immédiatement.", 'danger')}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.BALANCE_LOW]: {
      subject: 'Solde faible - YoYo',
      hero: 'Solde faible',
      heroTone: 'neutral',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre solde est faible. Pensez à recharger votre compte pour éviter toute interruption de service.</p>
        ${infoBox([{ label: 'Solde actuel', value: details?.balance }])}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.BALANCE_HIGH]: {
      subject: 'Solde élevé - YoYo',
      hero: 'Solde élevé',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Votre solde est élevé. Nous vous invitons à vérifier vos transactions récentes.</p>
        ${infoBox([{ label: 'Solde actuel', value: details?.balance }])}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SUSPICIOUS_ACTIVITY]: {
      subject: 'Activité suspecte détectée - YoYo',
      hero: 'Activité suspecte',
      heroTone: 'neutral',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une activité suspecte a été détectée sur votre compte.</p>
        ${infoBox([{ label: 'Activité', value: details?.activity }])}
        ${securityNote("Vous n'êtes pas à l'origine de cette activité ? Sécurisez votre compte immédiatement.", 'danger')}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.MAINTENANCE_NOTICE]: {
      subject: 'Maintenance planifiée - YoYo',
      hero: 'Maintenance planifiée',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une maintenance est planifiée pour améliorer nos services.</p>
        ${infoBox([
          { label: 'Date', value: details?.date },
          { label: 'Durée estimée', value: details?.duration }
        ])}
        <p>Nous nous excusons pour la gêne occasionnée.</p>
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SYSTEM_UPDATE]: {
      subject: 'Mise à jour du système - YoYo',
      hero: 'Mise à jour du système',
      template: (_code: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name || 'cher utilisateur'}</strong></p>
        <p>Une mise à jour a été déployée pour améliorer nos services.</p>
        ${infoBox([{ label: 'Nouveautés', value: details?.features }])}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.LOGIN_NOTIFICATION]: {
      subject: 'Notification de connexion - YoYo',
      hero: 'Nouvelle connexion',
      heroTone: 'neutral',
      template: (code?: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name ?? 'cher utilisateur'}</strong></p>
        <p>Une connexion à votre compte YoYo vient d'avoir lieu.</p>
        ${infoBox([
          { label: 'Date', value: details?.date },
          { label: 'Appareil', value: details?.device },
          { label: 'Adresse IP', value: details?.ip }
        ])}
        ${securityNote("Vous n'êtes pas à l'origine de cette connexion ? Sécurisez votre compte immédiatement.")}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.CERTIFICATION_NOTIFICATION]: {
      subject: 'Notification de certification - YoYo',
      hero: 'Documents vérifiés',
      template: (code?: string, name?: string, details?: any) => `
        <p>Bonjour <strong>${name ?? 'cher utilisateur'}</strong></p>
        <p>Vos documents ont été vérifiés avec succès.</p>
        ${infoBox([{ label: 'Date de vérification', value: details?.date }])}
        <p>À très vite,<br>L'équipe YoYo</p>
      `
    }
  };

  // Templates SMS
  static readonly SMS_TEMPLATES = {
    [MessageTypes.TYPES.ACCOUNT_VERIFICATION]: (code: string) => 
      `[YoYo] Votre code de vérification est: ${code}. Ne le partagez avec personne.`,
    
    [MessageTypes.TYPES.PASSWORD_RESET]: (code: string) => 
      `[YoYo] Votre code de réinitialisation de mot de passe est: ${code}. Ne le partagez avec personne.`,
    
    [MessageTypes.TYPES.LOGIN_VERIFICATION]: (code: string) => 
      `[YoYo] Votre code de connexion est: ${code}. Ne le partagez avec personne.`,
    
    [MessageTypes.TYPES.TWO_FACTOR_AUTH]: (code: string) => 
      `[YoYo] Votre code d'authentification à deux facteurs est: ${code}. Ne le partagez avec personne.`,
    
    [MessageTypes.TYPES.TRANSACTION_CONFIRMATION]: (code: string) => 
      `[YoYo] Votre code de confirmation de transaction est: ${code}. Ne le partagez avec personne.`,
    
    [MessageTypes.TYPES.SECURITY_ALERT]: (message: string) => 
      `[YoYo] Alerte de sécurité: ${message}. Contactez-nous si vous n'êtes pas à l'origine de cette activité.`,
      
    [MessageTypes.TYPES.PAYMENT_CONFIRMATION]: (code: string) => 
      `[YoYo] Votre code de confirmation de paiement est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.TRANSFER_NOTIFICATION]: (code: string) => 
      `[YoYo] Votre code de confirmation de transfert est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.ACCOUNT_UPDATED]: (code: string) => 
      `[YoYo] Votre code de confirmation de mise à jour de compte est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.PROFILE_CHANGES]: (code: string) => 
      `[YoYo] Votre code de confirmation pour les modifications de profil est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.WELCOME_MESSAGE]: (code: string) => 
      `[YoYo] Bienvenue ! Votre code d'activation est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.ACCOUNT_REMINDER]: (code: string) => 
      `[YoYo] Rappel: Votre code d'accès est: ${code}. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.INACTIVITY_ALERT]: (code: string) => 
      `[YoYo] Compte inactif: Utilisez le code ${code} pour maintenir votre compte actif. Ne le partagez avec personne.`,
      
    [MessageTypes.TYPES.PROMOTIONAL_OFFER]: (code: string) => 
      `[YoYo] Offre spéciale! Votre code promo est: ${code}. Valable pour une durée limitée.`,
      
    [MessageTypes.TYPES.NEW_FEATURE_ANNOUNCEMENT]: (code: string) => 
      `[YoYo] Nouvelles fonctionnalités disponibles! Utilisez le code ${code} pour y accéder.`,
      
    [MessageTypes.TYPES.SURVEY_INVITATION]: (code: string) => 
      `[YoYo] Votre avis nous intéresse! Utilisez le code ${code} pour participer à notre enquête.`,

    // Templates SMS sans OTP
    [MessageTypes.TYPES.PAYMENT_SUCCESS]: (details?: any) => 
      `[YoYo] Paiement réussi${details ? ' de ' + details.amount + ' ' + details.currency : ''}.`,
    
    [MessageTypes.TYPES.PAYMENT_FAILED]: (details?: any) => 
      `[YoYo] Échec du paiement${details ? ' de ' + details.amount + ' ' + details.currency : ''}. Raison: ${details?.reason || 'Non spécifiée'}`,
    
    [MessageTypes.TYPES.TRANSFER_SUCCESS]: (details?: any) => 
      `[YoYo] Transfert réussi${details ? ' de ' + details.amount + ' ' + details.currency : ''}.`,
    
    [MessageTypes.TYPES.TRANSFER_FAILED]: (details?: any) => 
      `[YoYo] Échec du transfert${details ? ' de ' + details.amount + ' ' + details.currency : ''}. Raison: ${details?.reason || 'Non spécifiée'}`,
    
    [MessageTypes.TYPES.ACCOUNT_CREATED]: () => 
      `[YoYo] Votre compte a été créé avec succès. Bienvenue !`,
    
    [MessageTypes.TYPES.ACCOUNT_DELETED]: () => 
      `[YoYo] Votre compte a été supprimé avec succès.`,
    
    [MessageTypes.TYPES.PROFILE_UPDATED]: (details?: any) => 
      `[YoYo] Votre profil a été mis à jour.`,
    
    [MessageTypes.TYPES.PASSWORD_CHANGED]: () => 
      `[YoYo] Votre mot de passe a été modifié avec succès.`,
    
    [MessageTypes.TYPES.EMAIL_CHANGED]: (details?: any) => 
      `[YoYo] Votre email a été modifié avec succès.`,
    
    [MessageTypes.TYPES.PHONE_CHANGED]: (details?: any) => 
      `[YoYo] Votre numéro de téléphone a été modifié avec succès.`,
    
    [MessageTypes.TYPES.BALANCE_LOW]: (details?: any) => 
      `[YoYo] Solde faible : ${details?.balance || 'Non spécifié'}.`,
    
    [MessageTypes.TYPES.BALANCE_HIGH]: (details?: any) => 
      `[YoYo] Solde élevé : ${details?.balance || 'Non spécifié'}.`,
    
    [MessageTypes.TYPES.SUSPICIOUS_ACTIVITY]: (details?: any) => 
      `[YoYo] Activité suspecte détectée : ${details?.activity || 'Non spécifiée'}.`,
    
    [MessageTypes.TYPES.MAINTENANCE_NOTICE]: (details?: any) => 
      `[YoYo] Maintenance planifiée le ${details?.date || 'Non spécifié'}.`,
    
    [MessageTypes.TYPES.SYSTEM_UPDATE]: () => 
      `[YoYo] Une mise à jour du système a été effectuée.`,

    [MessageTypes.TYPES.LOGIN_NOTIFICATION]: (details?: any) => 
      `[YoYo] Vous avez été connecté à votre compte YoYo. ${details?.date || 'Non spécifiée'}. Source: ${details?.device || 'Non spécifiée'} IP: ${details?.ip || 'Non spécifiée'}`,

    [MessageTypes.TYPES.CERTIFICATION_NOTIFICATION]: (details?: any) => 
      `[YoYo] Vos documents ont été vérifiés avec succès. ${details?.date || 'Non spécifiée'}.`,

    // `getSmsTemplate(type, code)` ne transmet qu'un argument : on y passe l'URL d'activation.
    // Formulation volontairement brève : avec un jeton de 32 caractères, le message reste bien en
    // deçà des 160 caractères d'un segment unique, même si PRO_APP_URL porte un domaine plus long.
    // Sans accents, que les passerelles SMS encodent en UCS-2 (limite qui tombe alors à 70).
    [MessageTypes.TYPES.MERCHANT_ACTIVATION]: (activationUrl: string) => 
      `[YoYo] Activez votre compte marchand : ${activationUrl} (valable 72h)`,
  };

  // Configuration des messages
  static readonly MESSAGE_CONFIG = {
    [MessageTypes.TYPES.ACCOUNT_VERIFICATION]: {
      expiryMinutes: 10,
      maxAttempts: 5,
      cooldownMinutes: 1
    },
    [MessageTypes.TYPES.PASSWORD_RESET]: {
      expiryMinutes: 10,
      maxAttempts: 3,
      cooldownMinutes: 2
    },
    [MessageTypes.TYPES.LOGIN_VERIFICATION]: {
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownMinutes: 2
    },
    [MessageTypes.TYPES.TRANSACTION_CONFIRMATION]: {
      expiryMinutes: 3,
      maxAttempts: 3,
      cooldownMinutes: 1
    },
    [MessageTypes.TYPES.TWO_FACTOR_AUTH]: {
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownMinutes: 1
    },
    [MessageTypes.TYPES.PAYMENT_CONFIRMATION]: {
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownMinutes: 1
    },
    [MessageTypes.TYPES.TRANSFER_NOTIFICATION]: {
      expiryMinutes: 5,
      maxAttempts: 3,
      cooldownMinutes: 1
    },
    [MessageTypes.TYPES.ACCOUNT_UPDATED]: {
      expiryMinutes: 15,
      maxAttempts: 3,
      cooldownMinutes: 5
    },
    [MessageTypes.TYPES.SECURITY_ALERT]: {
      expiryMinutes: 10,
      maxAttempts: 3,
      cooldownMinutes: 2
    },
    [MessageTypes.TYPES.PROFILE_CHANGES]: {
      expiryMinutes: 15,
      maxAttempts: 3,
      cooldownMinutes: 5
    },
    [MessageTypes.TYPES.WELCOME_MESSAGE]: {
      expiryMinutes: 1440, // 24 heures
      maxAttempts: 5,
      cooldownMinutes: 60
    },
    [MessageTypes.TYPES.ACCOUNT_REMINDER]: {
      expiryMinutes: 1440, // 24 heures
      maxAttempts: 5,
      cooldownMinutes: 60
    },
    [MessageTypes.TYPES.INACTIVITY_ALERT]: {
      expiryMinutes: 2880, // 48 heures
      maxAttempts: 5,
      cooldownMinutes: 120
    },
    [MessageTypes.TYPES.PROMOTIONAL_OFFER]: {
      expiryMinutes: 10080, // 7 jours
      maxAttempts: 10,
      cooldownMinutes: 1440
    },
    [MessageTypes.TYPES.NEW_FEATURE_ANNOUNCEMENT]: {
      expiryMinutes: 10080, // 7 jours
      maxAttempts: 10,
      cooldownMinutes: 1440
    },
    [MessageTypes.TYPES.SURVEY_INVITATION]: {
      expiryMinutes: 10080, // 7 jours
      maxAttempts: 10,
      cooldownMinutes: 1440
    },
    // Configuration des messages sans OTP
    [MessageTypes.TYPES.PAYMENT_SUCCESS]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.PAYMENT_FAILED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.TRANSFER_SUCCESS]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.TRANSFER_FAILED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.ACCOUNT_CREATED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.ACCOUNT_DELETED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.MERCHANT_ACTIVATION]: {
      // 72 h : l'expiration réelle est portée par l'enrôlement (activationTokenExpiresAt),
      // cette entrée n'est là que pour la cohérence de getMessageConfig().
      expiryMinutes: 72 * 60,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.PROFILE_UPDATED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.PASSWORD_CHANGED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.EMAIL_CHANGED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.PHONE_CHANGED]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.BALANCE_LOW]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 1440 // 24 heures
    },
    [MessageTypes.TYPES.BALANCE_HIGH]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 1440 // 24 heures
    },
    [MessageTypes.TYPES.SUSPICIOUS_ACTIVITY]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 0
    },
    [MessageTypes.TYPES.MAINTENANCE_NOTICE]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 1440 // 24 heures
    },
    [MessageTypes.TYPES.SYSTEM_UPDATE]: {
      expiryMinutes: 0,
      maxAttempts: 1,
      cooldownMinutes: 1440 // 24 heures
    }
  };

  /**
   * Obtient le template d'email pour un type de message donné
   * @param type Type de message
   * @param code Code OTP
   * @param name Nom de l'utilisateur (optionnel)
   * @param details Détails supplémentaires (optionnel)
   * @returns Template d'email formaté
   */
  static getEmailTemplate(type: string, code: string, name?: string, details?: any): { subject: string; body: string } {
    const template = this.EMAIL_TEMPLATES[type];

    // Le repli passe lui aussi par l'habillage de marque : un message inattendu ne doit pas
    // arriver chez l'utilisateur sous la forme d'une ligne de texte brut.
    if (!template) {
      return {
        subject: 'Message de YoYo',
        body: wrapEmail(`<p>Votre code est : <strong>${code}</strong></p>`, { preheader: 'Message de YoYo' })
      };
    }

    const content = template.template(code, name, details);

    return {
      subject: template.subject,
      // `hero` (optionnel) : bandeau de marque coloré en tête de carte (ex. activation marchand).
      // `heroTone` : `brand` (orange, défaut) ou `neutral` (ardoise) pour les messages sécurité/négatifs.
      body: wrapEmail(content, {
        preheader: template.subject,
        hero: (template as any).hero,
        heroTone: (template as any).heroTone
      })
    };
  }

  /**
   * Obtient le template SMS pour un type de message donné
   * @param type Type de message
   * @param code Code OTP
   * @returns Template SMS formaté
   */
  static getSmsTemplate(type: string, code: string): string {
    const template = this.SMS_TEMPLATES[type];
    if (!template) {
      return `[YoYo] Votre code est: ${code}. Ne le partagez avec personne.`;
    }

    return template(code);
  }

  /**
   * Obtient la configuration pour un type de message donné
   * @param type Type de message
   * @returns Configuration du message
   */
  static getMessageConfig(type: string): { expiryMinutes: number; maxAttempts: number; cooldownMinutes: number } {
    const config = this.MESSAGE_CONFIG[type];
    if (!config) {
      return {
        expiryMinutes: 10,
        maxAttempts: 3,
        cooldownMinutes: 1
      };
    }

    return config;
  }
} 