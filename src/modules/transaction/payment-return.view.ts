/**
 * Page de retour navigateur après un paiement Orange Money.
 *
 * Orange redirige le client vers `return_url` (ou `cancel_url`) une fois la saisie terminée.
 * Cette page est purement informative : le statut qu'elle affiche vient toujours d'une
 * revérification auprès du prestataire, jamais de l'URL.
 */

export type PaymentReturnOutcome = 'success' | 'pending' | 'failed' | 'cancelled' | 'invalid';

export interface PaymentReturnState {
  outcome: PaymentReturnOutcome;
  amount?: number;
  currency?: string;
  reference?: string;
  /** URL de rechargement automatique, fournie uniquement tant que le statut reste en attente. */
  refreshUrl?: string;
}

/**
 * Neutralise les caractères actifs avant injection dans le gabarit.
 * @param value Valeur d'origine
 * @returns La chaîne échappée
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Met en forme le montant réglé.
 * @param amount Montant
 * @param currency Devise
 * @returns Le montant formaté, ou une chaîne vide si le montant est absent
 */
const formatAmount = (amount?: number, currency?: string): string => {
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
    return '';
  }

  const formatted = new Intl.NumberFormat('fr-FR').format(Number(amount));
  return currency ? `${formatted} ${currency}` : formatted;
};

const icons: Record<PaymentReturnOutcome, string> = {
  success: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#0F9D58" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  pending: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#FF6100" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  failed: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#D93025" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  cancelled: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#78868F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6"/></svg>`,
  invalid: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#78868F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>`
};

const copy: Record<PaymentReturnOutcome, { title: string; lead: string; note: string }> = {
  success: {
    title: 'Paiement confirmé',
    lead: 'Votre paiement a bien été reçu et votre abonnement YoYo est activé.',
    note: 'Vous pouvez fermer cette page et revenir dans l\'application.'
  },
  pending: {
    title: 'Paiement en cours de confirmation',
    lead: 'Orange Money n\'a pas encore confirmé votre paiement. Cela prend généralement quelques secondes.',
    note: 'Cette page se met à jour toute seule. Si le montant a été débité, votre abonnement sera activé automatiquement, même en fermant cette page.'
  },
  failed: {
    title: 'Paiement non abouti',
    lead: 'Votre paiement n\'a pas pu être finalisé. Aucun montant n\'a été débité.',
    note: 'Vous pouvez relancer le paiement depuis l\'application YoYo.'
  },
  cancelled: {
    title: 'Paiement annulé',
    lead: 'Vous avez interrompu le paiement. Aucun montant n\'a été débité.',
    note: 'Vous pouvez relancer le paiement depuis l\'application YoYo.'
  },
  invalid: {
    title: 'Lien de paiement invalide',
    lead: 'Ce lien de retour n\'est pas valide ou a expiré.',
    note: 'Ouvrez l\'application YoYo pour consulter l\'état de votre abonnement.'
  }
};

/**
 * Produit la page de retour de paiement.
 * @param state État résolu de la transaction
 * @returns Le document HTML complet
 */
export const renderPaymentReturnPage = (state: PaymentReturnState): string => {
  const { outcome } = state;
  const text = copy[outcome] ?? copy.invalid;
  const icon = icons[outcome] ?? icons.invalid;

  // Le logo est servi par le backend sous `/assets/`, comme dans les e-mails et la page
  // d'activation. `favicon.png` est le vrai logo YoYo (`logo.png` est un reliquat de gabarit).
  const assetsBase = (
    process.env.MAIL_ASSETS_URL ??
    `${(process.env.SERVER_HOST ?? '').replace(/\/+$/, '')}/${process.env.API_VERSION ?? 'v1'}${process.env.SERVER_PATH ?? ''}/assets`
  ).replace(/\/+$/, '');
  const logoUrl = `${assetsBase}/favicon.png`;

  const amountLabel = formatAmount(state.amount, state.currency);

  // Rechargement automatique tant qu'Orange Money n'a pas tranché. Le contrôleur cesse de
  // fournir `refreshUrl` au bout de quelques tentatives, pour ne pas boucler indéfiniment.
  const autoRefresh = outcome === 'pending' && !!state.refreshUrl
    ? `<meta http-equiv="refresh" content="5;url=${escapeHtml(state.refreshUrl)}">`
    : '';

  const manualRefresh = outcome === 'pending' && !state.refreshUrl
    ? `<p class="note">La confirmation tarde plus que d'habitude. <b>Rouvrez l'application YoYo</b> pour vérifier l'état de votre abonnement.</p>`
    : '';

  const details = [
    amountLabel ? `<div class="row"><span>Montant</span><b>${escapeHtml(amountLabel)}</b></div>` : '',
    state.reference ? `<div class="row"><span>Référence</span><b>${escapeHtml(state.reference)}</b></div>` : ''
  ].join('');

  return `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
${autoRefresh}
<title>${escapeHtml(text.title)} — YoYo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>
  :root{--brand:#FF6100;--ink:#1F2933;--body:#454F59;--muted:#78868F;--paper:#fff;--sand:#F1EDE7;--line:#E6E0D8}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--sand);
    font-family:"Plus Jakarta Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);padding:20px}
  .card{background:var(--paper);max-width:440px;width:100%;padding:40px 30px}
  .logo{height:48px;width:auto;display:block;margin-bottom:22px}
  .icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;border:2px solid var(--line);margin-bottom:20px}
  h1{font-size:24px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px;line-height:1.2}
  .lead{color:var(--body);font-size:15px;line-height:1.6;margin:0 0 26px}
  .rows{border-top:1px solid var(--line);margin:0 0 26px}
  .row{display:flex;justify-content:space-between;gap:16px;padding:13px 0;border-bottom:1px solid var(--line);font-size:14px}
  .row span{color:var(--muted)}
  .row b{font-weight:700;text-align:right}
  .note{font-size:13px;color:var(--muted);margin:0;line-height:1.55}
  .note b{color:var(--ink);font-weight:700}
  .spin{display:inline-block;width:13px;height:13px;margin-right:8px;vertical-align:-1px;
    border:2px solid var(--line);border-top-color:var(--brand);border-radius:50%;animation:s .8s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head><body>
  <div class="card">
    <img class="logo" src="${escapeHtml(logoUrl)}" alt="YoYo">
    <div class="icon">${icon}</div>
    <h1>${escapeHtml(text.title)}</h1>
    <p class="lead">${escapeHtml(text.lead)}</p>
    ${details ? `<div class="rows">${details}</div>` : ''}
    <p class="note">${outcome === 'pending' && state.refreshUrl ? '<span class="spin"></span>' : ''}${escapeHtml(text.note)}</p>
    ${manualRefresh}
  </div>
</body></html>`;
};
