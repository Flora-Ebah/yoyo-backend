/**
 * Page de repli du sticker QR `https://<domaine>/q/CODE`.
 *
 * Le lien est un App Link / Universal Link de l'appli Client : quand l'app est installée (et la
 * vérification Android/iOS OK), le système l'ouvre AVANT que le navigateur ne charge cette page —
 * l'app résout alors le code et ouvre l'écran de réduction. Sinon (app absente, ou scan avec
 * l'appareil photo natif), le navigateur affiche cette page qui invite à installer l'application.
 *
 * Objectif sécurité : un sticker scanné avec l'appareil photo du téléphone NE DOIT PAS ouvrir le
 * CMS ni une page qui débloquerait une réduction hors application — uniquement cette invitation.
 */

/** Codes de sticker : alphanumériques (éventuel préfixe), tolère le tiret. */
export const STICKER_CODE_PATTERN = /^[A-Z0-9-]{4,40}$/;

const googlePlaySvg = `<svg viewBox="0 0 512 512" width="26" height="26" aria-hidden="true"><path fill="#00A1FF" d="M40 40 300 256 40 472z"/><path fill="#00E676" d="M40 40 470 150 300 256z"/><path fill="#FFC900" d="M470 150 470 362 300 256z"/><path fill="#FF3A44" d="M40 472 300 256 470 362z"/></svg>`;
const appleSvg = `<svg viewBox="0 0 384 512" width="24" height="24" aria-hidden="true"><path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM262.1 104.5c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>`;

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function renderStickerLanding(input: {
  boutique: string | null;
  androidHref: string;
  iosUrl: string;
  logoUrl: string;
}): string {
  const { boutique, androidHref, iosUrl, logoUrl } = input;
  const name = boutique ? esc(boutique) : null;
  const title = name ? `Une réduction vous attend chez ${name}` : 'Profitez de réductions avec YoYo';
  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YoYo La Carte</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>
  :root{--brand:#FF6100;--ink:#1F2933;--body:#454F59;--muted:#78868F;--paper:#fff;--sand:#F1EDE7}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--sand);
    font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);padding:20px}
  .card{background:var(--paper);max-width:440px;width:100%;padding:40px 30px}
  .logo{height:48px;width:auto;display:block;margin-bottom:22px}
  h1{font-size:24px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px;line-height:1.2}
  .lead{color:var(--body);font-size:15px;line-height:1.6;margin:0 0 24px}
  .stores{display:flex;flex-direction:column;gap:12px}
  .store{display:flex;align-items:center;gap:14px;width:100%;padding:14px 18px;background:#000;color:#fff;text-decoration:none}
  .store .ico{flex:none;display:flex;align-items:center;justify-content:center}
  .store .txt{display:flex;flex-direction:column;line-height:1.15;text-align:left}
  .store .txt small{font-size:11px;font-weight:500;letter-spacing:.04em;opacity:.85;text-transform:uppercase}
  .store .txt strong{font-size:18px;font-weight:700}
  .note{font-size:13px;color:var(--muted);margin:24px 0 0;line-height:1.55}
  .note b{color:var(--ink);font-weight:700}
</style></head><body>
  <div class="card">
    <img class="logo" src="${logoUrl}" alt="YoYo">
    <h1>${title}</h1>
    <p class="lead">Pour obtenir votre réduction, ouvrez l'application <b>YoYo La Carte</b> et scannez ce QR depuis l'app. Pas encore l'application ? Installez-la ci-dessous.</p>
    <div class="stores">
      <a class="store" href="${androidHref}">
        <span class="ico">${googlePlaySvg}</span>
        <span class="txt"><small>Disponible sur</small><strong>Google Play</strong></span>
      </a>
      ${iosUrl ? `<a class="store" href="${iosUrl}">
        <span class="ico">${appleSvg}</span>
        <span class="txt"><small>Télécharger dans</small><strong>App Store</strong></span>
      </a>` : ''}
    </div>
    <p class="note">Les réductions se débloquent <b>uniquement depuis l'application YoYo La Carte</b>.</p>
  </div>
</body></html>`;
}
