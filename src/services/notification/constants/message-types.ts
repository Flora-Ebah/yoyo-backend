/**
 * Types de messages pour les communications avec les utilisateurs
 * Cette classe centralise tous les types de messages qui peuvent être envoyés
 * via email ou SMS, avec leurs templates et configurations
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
  };

  // Templates d'emails
  static readonly EMAIL_TEMPLATES = {
    [MessageTypes.TYPES.ACCOUNT_VERIFICATION]: {
      subject: 'Vérification de votre compte YoYo',
      template: (code: string, name?: string) => `
        <h2>Vérification de votre compte</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Merci d'avoir créé un compte sur notre plateforme. Pour finaliser votre inscription, veuillez utiliser le code de vérification suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p>Si vous n'avez pas demandé ce code, veuillez ignorer cet email.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PASSWORD_RESET]: {
      subject: 'Réinitialisation de votre mot de passe YoYo',
      template: (code: string, name?: string) => `
        <h2>Réinitialisation de mot de passe</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Veuillez utiliser le code suivant pour confirmer cette action :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.LOGIN_VERIFICATION]: {
      subject: 'Code de vérification pour votre connexion YoYo',
      template: (code: string, name?: string) => `
        <h2>Vérification de connexion</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons détecté une tentative de connexion à votre compte. Veuillez utiliser le code suivant pour confirmer qu'il s'agit bien de vous :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p>Si vous n'avez pas tenté de vous connecter, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TWO_FACTOR_AUTH]: {
      subject: 'Code d\'authentification à deux facteurs YoYo',
      template: (code: string, name?: string) => `
        <h2>Authentification à deux facteurs</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Pour compléter votre processus d'authentification à deux facteurs, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 5 minutes.</p>
        <p>Si vous n'avez pas initié cette connexion, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSACTION_CONFIRMATION]: {
      subject: 'Confirmation de transaction YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Confirmation de transaction</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons besoin de confirmer une transaction sur votre compte${details ? ' (' + details.amount + ' ' + details.currency + ')' : ''}. Veuillez utiliser le code suivant pour autoriser cette opération :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p>Si vous n'avez pas initié cette transaction, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PAYMENT_CONFIRMATION]: {
      subject: 'Confirmation de paiement YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Confirmation de paiement</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons besoin de confirmer un paiement${details ? ' de ' + details.amount + ' ' + details.currency : ''} sur votre compte. Veuillez utiliser le code suivant pour autoriser cette opération :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 5 minutes.</p>
        <p>Si vous n'avez pas initié ce paiement, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_NOTIFICATION]: {
      subject: 'Notification de transfert YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Notification de transfert</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Un transfert${details ? ' de ' + details.amount + ' ' + details.currency : ''} a été initié sur votre compte. Si vous souhaitez autoriser cette opération, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 5 minutes.</p>
        <p>Si vous n'avez pas initié ce transfert, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_UPDATED]: {
      subject: 'Mise à jour de votre compte YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Mise à jour de compte</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Des modifications ont été apportées à votre compte${details?.changes ? ' (' + details.changes + ')' : ''}. Pour confirmer ces changements, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 15 minutes.</p>
        <p>Si vous n'avez pas demandé ces modifications, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SECURITY_ALERT]: {
      subject: 'Alerte de sécurité YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Alerte de sécurité</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons détecté une activité inhabituelle sur votre compte${details?.activity ? ' : ' + details.activity : ''}. Pour vérifier votre identité, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 10 minutes.</p>
        <p>Si vous n'êtes pas à l'origine de cette activité, veuillez sécuriser votre compte immédiatement en modifiant votre mot de passe.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROFILE_CHANGES]: {
      subject: 'Confirmation des modifications de profil YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Modifications de profil</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Des modifications ont été apportées à votre profil${details?.changes ? ' (' + details.changes + ')' : ''}. Pour confirmer ces changements, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 15 minutes.</p>
        <p>Si vous n'avez pas demandé ces modifications, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.WELCOME_MESSAGE]: {
      subject: 'Bienvenue sur YoYo !',
      template: (code: string, name?: string) => `
        <h2>Bienvenue sur YoYo !</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous sommes ravis de vous accueillir sur notre plateforme. Pour activer votre compte et commencer à utiliser nos services, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 24 heures.</p>
        <p>Nous vous souhaitons une excellente expérience avec YoYo !</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_REMINDER]: {
      subject: 'Rappel concernant votre compte YoYo',
      template: (code: string, name?: string) => `
        <h2>Rappel concernant votre compte</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Ce message est un rappel concernant votre compte YoYo. Pour accéder à votre compte et vérifier les informations importantes, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 24 heures.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.INACTIVITY_ALERT]: {
      subject: 'Alerte d\'inactivité de votre compte YoYo',
      template: (code: string, name?: string) => `
        <h2>Alerte d'inactivité</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons remarqué que votre compte YoYo est inactif depuis un certain temps. Pour le maintenir actif et éviter sa désactivation, veuillez utiliser le code suivant pour vous connecter :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Ce code est valable pendant 48 heures.</p>
        <p>Si vous n'utilisez plus votre compte et souhaitez le fermer, vous pouvez ignorer ce message.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROMOTIONAL_OFFER]: {
      subject: 'Offre spéciale YoYo - Code promo exclusif',
      template: (code: string, name?: string, details?: any) => `
        <h2>Offre spéciale pour vous !</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons le plaisir de vous offrir une promotion exclusive${details?.offer ? ' : ' + details.offer : ''}. Pour en bénéficier, utilisez le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Cette offre est valable ${details?.validity || 'pendant une durée limitée'}.</p>
        <p>Ne manquez pas cette opportunité !</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.NEW_FEATURE_ANNOUNCEMENT]: {
      subject: 'Découvrez les nouvelles fonctionnalités de YoYo',
      template: (code: string, name?: string, details?: any) => `
        <h2>Nouvelles fonctionnalités disponibles</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous sommes heureux de vous annoncer le lancement de nouvelles fonctionnalités sur YoYo${details?.features ? ' : ' + details.features : ''}. Pour les découvrir, utilisez le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Nous espérons que ces nouveautés amélioreront votre expérience sur notre plateforme.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SURVEY_INVITATION]: {
      subject: 'Invitation à participer à notre enquête YoYo',
      template: (code: string, name?: string) => `
        <h2>Votre avis nous intéresse</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous vous invitons à participer à notre enquête pour nous aider à améliorer nos services. Pour accéder à l'enquête, veuillez utiliser le code suivant :</p>
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: #f5f5f5; font-size: 24px; font-weight: bold; letter-spacing: 5px;">${code}</div>
        <p>Votre participation est grandement appréciée. En guise de remerciement, vous pourriez recevoir un avantage exclusif.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    // Templates sans OTP
    [MessageTypes.TYPES.PAYMENT_SUCCESS]: {
      subject: 'Paiement réussi - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Paiement réussi</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre paiement${details ? ' de ' + details.amount + ' ' + details.currency : ''} a été traité avec succès.</p>
        <p>Date de la transaction : ${new Date().toLocaleString()}</p>
        <p>Si vous n'avez pas effectué cette transaction, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PAYMENT_FAILED]: {
      subject: 'Échec du paiement - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Échec du paiement</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous regrettons de vous informer que votre paiement${details ? ' de ' + details.amount + ' ' + details.currency : ''} n'a pas pu être traité.</p>
        <p>Raison : ${details?.reason || 'Non spécifiée'}</p>
        <p>Veuillez réessayer ou contacter notre service client pour plus d'informations.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_SUCCESS]: {
      subject: 'Transfert réussi - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Transfert réussi</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre transfert${details ? ' de ' + details.amount + ' ' + details.currency : ''} a été effectué avec succès.</p>
        <p>Date de la transaction : ${new Date().toLocaleString()}</p>
        <p>Si vous n'avez pas effectué ce transfert, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.TRANSFER_FAILED]: {
      subject: 'Échec du transfert - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Échec du transfert</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous regrettons de vous informer que votre transfert${details ? ' de ' + details.amount + ' ' + details.currency : ''} n'a pas pu être effectué.</p>
        <p>Raison : ${details?.reason || 'Non spécifiée'}</p>
        <p>Veuillez réessayer ou contacter notre service client pour plus d'informations.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_CREATED]: {
      subject: 'Compte créé avec succès - YoYo',
      template: (name?: string) => `
        <h2>Bienvenue sur YoYo !</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre compte a été créé avec succès. Vous pouvez maintenant commencer à utiliser nos services.</p>
        <p>Pour des raisons de sécurité, nous vous recommandons de :</p>
        <ul>
          <li>Changer votre mot de passe lors de votre première connexion</li>
          <li>Activer l'authentification à deux facteurs</li>
          <li>Vérifier vos informations personnelles</li>
        </ul>
        <p>Nous vous souhaitons une excellente expérience avec YoYo !</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.ACCOUNT_DELETED]: {
      subject: 'Compte supprimé - YoYo',
      template: (name?: string) => `
        <h2>Compte supprimé</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre compte YoYo a été supprimé avec succès.</p>
        <p>Nous espérons vous revoir bientôt !</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PROFILE_UPDATED]: {
      subject: 'Profil mis à jour - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Profil mis à jour</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre profil a été mis à jour avec succès.</p>
        <p>Modifications apportées : ${details?.changes || 'Non spécifiées'}</p>
        <p>Si vous n'avez pas effectué ces modifications, veuillez contacter notre service client immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PASSWORD_CHANGED]: {
      subject: 'Mot de passe modifié - YoYo',
      template: (name?: string) => `
        <h2>Mot de passe modifié</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre mot de passe a été modifié avec succès.</p>
        <p>Si vous n'avez pas effectué cette modification, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.EMAIL_CHANGED]: {
      subject: 'Email modifié - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Email modifié</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre adresse email a été modifiée avec succès.</p>
        <p>Nouvelle adresse : ${details?.newEmail || 'Non spécifiée'}</p>
        <p>Si vous n'avez pas effectué cette modification, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.PHONE_CHANGED]: {
      subject: 'Numéro de téléphone modifié - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Numéro de téléphone modifié</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre numéro de téléphone a été modifié avec succès.</p>
        <p>Nouveau numéro : ${details?.newPhone || 'Non spécifié'}</p>
        <p>Si vous n'avez pas effectué cette modification, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.BALANCE_LOW]: {
      subject: 'Solde faible - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Solde faible</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre solde actuel est faible : ${details?.balance || 'Non spécifié'}</p>
        <p>Nous vous recommandons de recharger votre compte pour éviter toute interruption de service.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.BALANCE_HIGH]: {
      subject: 'Solde élevé - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Solde élevé</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Votre solde actuel est élevé : ${details?.balance || 'Non spécifié'}</p>
        <p>Nous vous recommandons de vérifier vos transactions récentes.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SUSPICIOUS_ACTIVITY]: {
      subject: 'Activité suspecte détectée - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Activité suspecte détectée</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Nous avons détecté une activité suspecte sur votre compte : ${details?.activity || 'Non spécifiée'}</p>
        <p>Si vous n'êtes pas à l'origine de cette activité, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.MAINTENANCE_NOTICE]: {
      subject: 'Maintenance planifiée - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Maintenance planifiée</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Une maintenance est planifiée pour améliorer nos services.</p>
        <p>Date : ${details?.date || 'Non spécifiée'}</p>
        <p>Durée estimée : ${details?.duration || 'Non spécifiée'}</p>
        <p>Nous nous excusons pour la gêne occasionnée.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.SYSTEM_UPDATE]: {
      subject: 'Mise à jour du système - YoYo',
      template: (name?: string, details?: any) => `
        <h2>Mise à jour du système</h2>
        <p>Bonjour ${name || 'cher utilisateur'},</p>
        <p>Une mise à jour du système a été effectuée pour améliorer nos services.</p>
        <p>Nouvelles fonctionnalités : ${details?.features || 'Non spécifiées'}</p>
        <p>Nous vous souhaitons une excellente expérience avec ces nouveautés !</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.LOGIN_NOTIFICATION]: {
      subject: 'Notification de connexion - YoYo',
      template: (code?: string, name?: string, details?: any) => `
        <h2>Notification de connexion</h2>
        <p>Bonjour ${name ?? 'cher utilisateur'},</p>
        <p>Vous avez été connecté à votre compte YoYo.</p>
        <p>Date et heure de connexion : ${details?.date || 'Non spécifiée'}</p>
        <p>Source : ${details?.device || 'Non spécifiée'}</p>
        <p>IP : ${details?.ip || 'Non spécifiée'}</p>
        <p>Si vous n'êtes pas à l'origine de cette connexion, veuillez sécuriser votre compte immédiatement.</p>
        <p>Cordialement,<br>L'équipe YoYo</p>
      `
    },
    [MessageTypes.TYPES.CERTIFICATION_NOTIFICATION]: {
      subject: 'Notification de certification - YoYo',
      template: (code?: string, name?: string, details?: any) => `
        <h2>Notification de certification</h2>
        <p>Bonjour ${name ?? 'cher utilisateur'},</p>
        <p>Vos documents ont été vérifiés avec succès.</p>
        <p>Date et heure de vérification : ${details?.date || 'Non spécifiée'}</p>
        <p>Si vous n'êtes pas à l'origine de cette certification, veuillez sécuriser votre compte immédiatement.</p>
        <p>Merci de nous contacter si vous avez des questions ou des préoccupations.</p>  
        <p>Cordialement,<br>L'équipe YoYo</p>
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
    if (!template) {
      return {
        subject: 'Message de YoYo',
        body: `Votre code est: ${code}`
      };
    }

    return {
      subject: template.subject,
      body: template.template(code, name, details)
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