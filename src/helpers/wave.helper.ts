import crypto from 'crypto';

/**
 * Client de l'API Checkout de Wave (https://docs.wave.com/checkout).
 *
 * Wave s'authentifie par une simple clé d'API (`Authorization: Bearer`), liée à un seul wallet
 * marchand. Si la clé a été créée avec la signature des requêtes activée (option irréversible
 * côté portail), chaque appel doit en plus porter l'en-tête `Wave-Signature` : renseigner alors
 * `WAVE_API_SIGNING_SECRET`.
 *
 * Toute la configuration vient des variables d'environnement, comme pour Orange Money
 * (cf. `payment.helper.ts`) : aucun secret de prestataire n'est stocké en base (F-05).
 */

/** Session de paiement Wave, telle que renvoyée par l'API. */
export interface WaveCheckoutSession {
  id: string;
  amount: string;
  currency: string;
  checkout_status: 'open' | 'complete' | 'expired';
  payment_status: 'processing' | 'cancelled' | 'succeeded';
  client_reference?: string;
  transaction_id?: string;
  wave_launch_url: string;
  when_created?: string;
  when_completed?: string;
  when_expires?: string;
  last_payment_error?: { code: string; message: string };
}

/** Tolérance de Wave sur l'horodatage d'une signature : 5 minutes dans le passé. */
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
/** Tolérance sur un horodatage dans le futur (décalage d'horloge). */
const SIGNATURE_MAX_SKEW_SECONDS = 30;

/** Délai maximal d'un appel à Wave. Le webhook doit répondre en moins de 5 s au total. */
const REQUEST_TIMEOUT_MS = 4000;

export class WaveHelper {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly signingSecret: string;

  constructor() {
    this.baseUrl = (process.env.WAVE_API_HOST || 'https://api.wave.com').trim().replace(/\/+$/, '');
    this.apiKey = (process.env.WAVE_API_KEY ?? '').trim();
    this.signingSecret = (process.env.WAVE_API_SIGNING_SECRET ?? '').trim();
  }

  /**
   * Indique si Wave est configuré sur cet environnement. Sans clé, le moyen de paiement n'est
   * pas proposé et toute demande de paiement Wave est refusée en amont.
   */
  static isConfigured(): boolean {
    return !!(process.env.WAVE_API_KEY ?? '').trim();
  }

  /** Devise des paiements Wave (le XOF n'admet pas de décimale). */
  static currency(): string {
    return (process.env.WAVE_CURRENCY || 'XOF').trim().toUpperCase();
  }

  /**
   * Met un montant au format attendu par Wave : une chaîne, sans décimale pour le XOF.
   * Les montants YoYo sont des entiers en FCFA ; on arrondit par sécurité.
   * @param amount Montant numérique
   * @returns Le montant sous forme de chaîne
   */
  static formatAmount(amount: number): string {
    return String(Math.round(Number(amount)));
  }

  /**
   * Calcule la signature HMAC-SHA256 (hexadécimale) d'un corps, selon le schéma Wave :
   * le message signé est l'horodatage Unix suivi du corps brut.
   * @param secret Secret de signature
   * @param timestamp Horodatage Unix en secondes
   * @param rawBody Corps brut (chaîne vide pour une requête sans corps)
   * @returns La signature hexadécimale
   */
  static computeSignature(secret: string, timestamp: number | string, rawBody: string): string {
    return crypto.createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('hex');
  }

  /**
   * Vérifie un en-tête `Wave-Signature` (`t=<horodatage>,v1=<signature>[,v1=<signature>…]`).
   *
   * Plusieurs `v1` peuvent coexister pendant une rotation de secret : il suffit qu'une seule
   * corresponde. La comparaison est faite en temps constant, et l'horodatage doit être récent
   * pour empêcher le rejeu d'une notification interceptée.
   *
   * @param header Valeur de l'en-tête `Wave-Signature`
   * @param rawBody Corps brut, tel que reçu (avant tout parsing JSON)
   * @param secret Secret de signature du webhook
   * @param nowSeconds Horodatage courant (injectable pour les tests)
   * @returns Vrai si la signature est valide et récente
   */
  static verifySignature(
    header: string | undefined,
    rawBody: string,
    secret: string,
    nowSeconds: number = Math.floor(Date.now() / 1000)
  ): boolean {
    if (!header || !secret || typeof rawBody !== 'string') {
      return false;
    }

    let timestamp = '';
    const signatures: string[] = [];

    for (const part of header.split(',')) {
      const [key, ...rest] = part.trim().split('=');
      const value = rest.join('=').trim();

      if (key === 't') timestamp = value;
      if (key === 'v1' && value) signatures.push(value);
    }

    if (!/^\d+$/.test(timestamp) || signatures.length === 0) {
      return false;
    }

    const age = nowSeconds - Number(timestamp);
    if (age > SIGNATURE_MAX_AGE_SECONDS || age < -SIGNATURE_MAX_SKEW_SECONDS) {
      return false;
    }

    const expected = Buffer.from(WaveHelper.computeSignature(secret, timestamp, rawBody), 'utf8');

    return signatures.some((signature: string) => {
      const candidate = Buffer.from(signature, 'utf8');
      return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
    });
  }

  /**
   * Traduit une session Wave en statut de paiement YoYo.
   *
   * `payment_status: cancelled` sur une session encore `open` n'est PAS un échec définitif :
   * le client peut retenter dans la même session, et plusieurs échecs peuvent précéder un succès.
   * Seules l'issue `complete` + `succeeded` et l'expiration de la session sont tranchées.
   *
   * @param session Session renvoyée par Wave
   * @returns 'success' | 'expired' | 'pending'
   */
  static toPaymentStatus(session: Partial<WaveCheckoutSession> | null | undefined): 'success' | 'expired' | 'pending' {
    if (session?.checkout_status === 'complete' && session?.payment_status === 'succeeded') {
      return 'success';
    }

    if (session?.checkout_status === 'expired') {
      return 'expired';
    }

    return 'pending';
  }

  /**
   * Crée une session de paiement. Le client doit ensuite être envoyé sur `wave_launch_url`,
   * dans son navigateur (pas dans une WebView, qui empêche l'ouverture de l'app Wave).
   */
  async createCheckoutSession(payload: {
    amount: number;
    currency?: string;
    clientReference: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<WaveCheckoutSession> {
    if (!payload.amount || !payload.clientReference || !payload.successUrl || !payload.errorUrl) {
      throw new Error('Paramètres de paiement manquants dans WaveHelper');
    }

    return this.request('POST', '/v1/checkout/sessions', {
      amount: WaveHelper.formatAmount(payload.amount),
      currency: payload.currency || WaveHelper.currency(),
      client_reference: payload.clientReference,
      success_url: payload.successUrl,
      error_url: payload.errorUrl
    }, 'wave_initiate');
  }

  /**
   * Récupère une session par son identifiant (`cos-…`). Source de vérité du statut.
   */
  async getCheckoutSession(sessionId: string): Promise<WaveCheckoutSession> {
    if (!sessionId) {
      throw new Error('Identifiant de session Wave manquant');
    }

    return this.request('GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, undefined, 'wave_status');
  }

  /**
   * Expire une session encore ouverte, pour qu'elle ne puisse plus être payée.
   * Wave répond 409 si la session est déjà terminée ou expirée.
   */
  async expireCheckoutSession(sessionId: string): Promise<void> {
    await this.request('POST', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, undefined, 'wave_expire');
  }

  /**
   * Exécute un appel à l'API Wave, signé si un secret de signature est configuré.
   *
   * Le corps est sérialisé ici, une seule fois, pour que la chaîne signée soit exactement
   * celle qui part sur le réseau. On passe par `fetch` plutôt que par `AxiosService` : les
   * intercepteurs de coddyger remplacent le corps des réponses d'erreur par un message générique,
   * ce qui ferait perdre l'`error_code` de Wave (`request-validation-error`, `ip-not-allowed`…).
   */
  private async request(method: 'GET' | 'POST', url: string, body: any, step: string): Promise<any> {
    if (!this.apiKey) {
      throw { error: true, step, status: null, data: 'WAVE_API_KEY non configurée' };
    }

    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json'
    };

    if (rawBody) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.signingSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      headers['Wave-Signature'] = `t=${timestamp},v1=${WaveHelper.computeSignature(this.signingSecret, timestamp, rawBody)}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${url}`, {
        method,
        headers,
        body: rawBody || undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err: any) {
      // Même forme de rejet que `PaymentHelper`, pour que le diagnostic en amont reste identique.
      throw { error: true, step, status: null, data: err?.message ?? String(err) };
    }

    // `expire` répond 200 avec un corps vide : on ne parse que s'il y a quelque chose à lire.
    const text = await response.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      throw { error: true, step, status: response.status, data };
    }

    return data;
  }
}
