/**
 * Charte graphique et mise en page des e-mails YoYo.
 */
export const BRAND = {
	/** Orange YoYo — couleur primaire, identique dans l'app Client et l'app Partenaire. */
	primary: '#FF6100',
	/** Variante claire, utilisée pour les dégradés et les fonds teintés. */
	primaryLight: '#FF904B',
	/** Orange sombre, pour les bordures et le survol. */
	primaryDark: '#E85400',
	/** Fond de la page d'e-mail, sur lequel reposent le logo et le pied. */
	pageBackground: '#ECEFF1',
	surface: '#FFFFFF',
	/** Fond teinté très clair, pour les encarts (code, rappel). */
	surfaceTinted: '#FFF4EC',
	border: '#ECEFF1',
	/** Couleur des titres et des mots mis en avant. */
	text: '#263238',
	/** Couleur du texte courant dans la carte — volontairement plus douce que les titres. */
	textBody: '#626262',
	textMuted: '#78909C',
	success: '#1E9E6A',
	danger: '#D93025'
};

/**
 * Identifiant de l'image du logo lorsqu'elle est jointe en ligne au message.
 * Sert de repli quand aucune URL publique d'assets n'est configurée — voir `logoSrc`.
 */
export const LOGO_FILENAME = 'favicon.png';

/**
 * Adresse de l'image du logo à placer dans l'en-tête du HTML.
 *
 * Le logo est **toujours** chargé depuis le serveur, jamais joint au message : le client de
 * messagerie le rapatrie via son propre cache d'images (le proxy `googleusercontent` chez Gmail),
 * le message reste léger et aucun trombone de pièce jointe n'apparaît sur la liste des messages.
 *
 * L'adresse de base vient de `MAIL_ASSETS_URL` ; à défaut elle est déduite de `SERVER_HOST` et du
 * préfixe d'API, ce qui correspond à la route statique déclarée dans `router.ts`.
 *
 * ⚠️ Cette adresse doit être **joignable publiquement** : un `SERVER_HOST` en `localhost` produit
 * un e-mail correct mais dont le logo ne s'affichera pas chez le destinataire.
 */
export function logoSrc(): string {
	const base = (
		process.env.MAIL_ASSETS_URL ??
		`${(process.env.SERVER_HOST ?? '').replace(/\/+$/, '')}/${process.env.API_VERSION ?? 'v1'}${
			process.env.SERVER_PATH ?? ''
		}/assets`
	).replace(/\/+$/, '');

	return `${base}/${LOGO_FILENAME}`;
}

const FONT_STACK =
	"Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Bouton d'action principal, en `<table>` pour rester cliquable sur toute sa surface sous Outlook
 * (un `<a>` avec `padding` s'y réduit à la zone du texte).
 *
 * @param url Destination
 * @param label Libellé affiché
 */
export function emailButton(url: string, label: string): string {
	// Le bouton est centre par une table conteneur pleine largeur plutot que par une marge
	// automatique : Outlook ignore `margin: auto` sur une table, mais respecte `align="center"`
	// sur une cellule.
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; margin: 8px 0 24px;">
        <tr>
          <td align="center" style="mso-line-height-rule: exactly; text-align: center;">
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
              <tr>
                <td align="center" bgcolor="${BRAND.primary}" style="mso-line-height-rule: exactly; mso-padding-alt: 16px 28px; background-color: ${BRAND.primary}; background-image: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%);">
                  <a href="${url}" target="_blank" style="display: block; padding: 16px 28px; font-family: ${FONT_STACK}; font-size: 16px; font-weight: 600; line-height: 100%; color: #FFFFFF; text-decoration: none;">${label}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
}

/**
 * Encart mettant en valeur un code à usage unique.
 * @param code Code à afficher
 */
export function codeBox(code: string): string {
	return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 8px 0 24px;">
        <tr>
          <td align="center" bgcolor="${BRAND.surfaceTinted}" style="mso-line-height-rule: exactly; padding: 20px; background-color: ${BRAND.surfaceTinted}; border: 1px solid ${BRAND.primaryLight}; border-radius: 6px;">
            <div style="font-family: ${FONT_STACK}; font-size: 30px; font-weight: 700; letter-spacing: 8px; color: ${BRAND.primary};">${code}</div>
          </td>
        </tr>
      </table>`;
}

/**
 * Enveloppe un contenu d'e-mail dans la mise en page de marque : logo, carte de contenu, pied.
 *
 * Appliqué de façon centralisée par `MessageTypes.getEmailTemplate`, de sorte que tous les
 * templates en bénéficient sans être réécrits individuellement.
 *
 * @param content Corps HTML propre au message
 * @param options.preheader Texte d'aperçu affiché par la boîte de réception à côté de l'objet
 * @param options.title Titre affiché en surtitre, au-dessus du contenu
 */
export function wrapEmail(content: string, options?: { preheader?: string; title?: string; hero?: string }): string {
	const year = new Date().getFullYear();
	const preheader = options?.preheader ?? '';
	const label = options?.title ?? 'YoYo';

	return `<!DOCTYPE html>
<html lang="fr" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Empeche iOS de transformer en liens les numeros, dates et adresses du corps du message. -->
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <!-- Empeche les clients en theme sombre de reinventer la palette (Gmail, Apple Mail). -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <!--[if mso]>
    <xml><o:officedocumentsettings><o:pixelsperinch>96</o:pixelsperinch></o:officedocumentsettings></xml>
  <![endif]-->
  <title>${label}</title>
  <link href="https://fonts.googleapis.com/css?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet" media="screen">
  <style>
    /* Typographie du contenu : ignoree par quelques clients, sans consequence — la structure et
       les couleurs porteuses de sens restent en style en ligne. */
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; word-break: break-word; -webkit-font-smoothing: antialiased; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    table { border-collapse: collapse !important; }
    .hover-underline:hover { text-decoration: underline !important; }
    .yoyo-content h2 {
      margin: 0 0 18px; font-family: ${FONT_STACK};
      font-size: 22px; line-height: 30px; font-weight: 700; color: ${BRAND.text};
      /* Titre principal centre. Double en style en ligne sur chaque titre des templates : une
         partie des clients (Gmail via un compte IMAP tiers, messages transferes) supprime cette
         balise de style, et le centrage doit survivre. */
      text-align: center;
    }
    .yoyo-content h3 {
      margin: 26px 0 10px; font-family: ${FONT_STACK};
      font-size: 17px; line-height: 24px; font-weight: 600; color: ${BRAND.text};
    }
    .yoyo-content p {
      margin: 0 0 16px; font-family: ${FONT_STACK};
      font-size: 16px; line-height: 26px; color: ${BRAND.textBody};
    }
    .yoyo-content ul, .yoyo-content ol {
      margin: 0 0 18px; padding-left: 22px; font-family: ${FONT_STACK};
      font-size: 16px; line-height: 26px; color: ${BRAND.textBody};
    }
    .yoyo-content li { margin-bottom: 8px; }
    .yoyo-content a { color: ${BRAND.primary}; }
    .yoyo-content strong { font-weight: 600; color: ${BRAND.text}; }
    @media (max-width: 600px) {
      .sm-w-full { width: 100% !important; }
      .sm-px-24 { padding-left: 24px !important; padding-right: 24px !important; }
      .sm-py-32 { padding-top: 32px !important; padding-bottom: 32px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.pageBackground};">
  <!-- Apercu de la boite de reception, masque a l'affichage. -->
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all; font-family: ${FONT_STACK};">${preheader}</div>

  <div role="article" aria-roledescription="email" aria-label="${label}" lang="fr" style="font-family: ${FONT_STACK}; mso-line-height-rule: exactly;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%; font-family: ${FONT_STACK};">
      <tr>
        <td align="center" style="mso-line-height-rule: exactly; background-color: ${BRAND.pageBackground};">
          <table role="presentation" class="sm-w-full" cellpadding="0" cellspacing="0" border="0" style="width: 680px; max-width: 100%;">

            <!-- Logo sur le fond de page — masque quand un bandeau hero porte deja le logo. -->
            ${
              options?.hero
                ? ''
                : `<tr>
              <td class="sm-py-32 sm-px-24" align="center" style="mso-line-height-rule: exactly; padding: 48px; text-align: center;">
                <img src="${logoSrc()}" width="92" alt="YoYo" style="width: 92px; max-width: 100%; vertical-align: middle; line-height: 100%; border: 0;">
              </td>
            </tr>`
            }

            <!-- Carte de contenu -->
            <tr>
              <td align="center" class="sm-px-24" style="mso-line-height-rule: exactly;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                  <tr>
                    <td class="sm-px-24" style="mso-line-height-rule: exactly; padding: 0;">
                      <!-- Carte carrée (coins droits), sans bordure ni ombre -->
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                        ${
                          options?.hero
                            ? `<tr><td style="mso-line-height-rule: exactly; background-color: ${BRAND.primary}; background-image: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryLight} 100%); padding: 24px 30px;">
                              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                                <tr>
                                  <td style="mso-line-height-rule: exactly; vertical-align: middle; padding-right: 14px;">
                                    <div style="width: 46px; height: 46px; background-color: #FFFFFF; text-align: center; line-height: 46px; mso-line-height-rule: exactly;">
                                      <img src="${logoSrc()}" width="30" alt="YoYo" style="width: 30px; vertical-align: middle; border: 0;">
                                    </div>
                                  </td>
                                  <td style="mso-line-height-rule: exactly; vertical-align: middle;">
                                    <div style="font-family: ${FONT_STACK}; font-size: 20px; line-height: 26px; font-weight: 800; color: #FFFFFF;">${options.hero}</div>
                                  </td>
                                </tr>
                              </table>
                            </td></tr>`
                            : ''
                        }
                        <tr>
                          <td class="yoyo-content sm-px-24" style="mso-line-height-rule: exactly; background-color: ${BRAND.surface}; padding: 36px 40px; text-align: left; font-family: ${FONT_STACK}; font-size: 16px; line-height: 26px; color: ${BRAND.textBody};">
                            ${
                              options?.title && !options?.hero
                                ? `<p style="margin: 0 0 10px; font-family: ${FONT_STACK}; font-size: 12px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: ${BRAND.primary}; text-align: center;">${options.title}</p>`
                                : ''
                            }
                            ${content}

                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
                              <tr>
                                <td style="mso-line-height-rule: exactly; padding-top: 28px; padding-bottom: 28px;">
                                  <div style="height: 1px; background-color: ${BRAND.border}; line-height: 1px;">&zwnj;</div>
                                </td>
                              </tr>
                            </table>
                            <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 13px; line-height: 20px; color: ${BRAND.textMuted};">
                              Cet e-mail vous est envoye automatiquement par YoYo. Merci de ne pas y repondre directement.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr><td style="mso-line-height-rule: exactly; height: 20px;"></td></tr>

                  <!-- Pied, hors de la carte -->
                  <tr>
                    <td class="sm-px-24" style="mso-line-height-rule: exactly; padding-left: 48px; padding-right: 48px; font-family: ${FONT_STACK}; font-size: 13px; line-height: 20px; color: ${BRAND.textMuted}; text-align: center;">
                      &copy; ${year} YoYo La Carte &middot; Abidjan, Cote d'Ivoire
                    </td>
                  </tr>

                  <tr><td style="mso-line-height-rule: exactly; height: 24px;"></td></tr>
                </table>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}
