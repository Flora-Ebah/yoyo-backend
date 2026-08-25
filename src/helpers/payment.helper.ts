import { AxiosService, env } from "coddyger";

interface PaymentEnvConfig {
  OM_HOST: string;
  OM_MERCHANT_KEY: string;
  OM_BASIC_CONSUMER_KEY: string;
  OM_CURRENCY: string;
  OM_RETURN_URL: string;
  OM_NOTIFY_URL: string;
  OM_ENV: string;
}

interface PaymentPayload {
  merchant_key: string;
  currency: string;
  order_id: string;
  amount: number;
  return_url: string;
  cancel_url: string;
  notif_url: string;
  lang: string;
  reference: string;
}

interface TransactionStatusPayload {
  order_id: string;
  amount: number;
  pay_token: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class PaymentHelper {
  private readonly axios: any;
  private readonly paymentConfig: PaymentEnvConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.paymentConfig = {
      OM_HOST: process.env.OM_HOST || 'https://api.orange.com',
      OM_MERCHANT_KEY: process.env.OM_MERCHANT_KEY!,
      OM_BASIC_CONSUMER_KEY: process.env.OM_BASIC_CONSUMER_KEY!,
      OM_CURRENCY: process.env.OM_CURRENCY || 'OUV',
      OM_RETURN_URL: process.env.OM_RETURN_URL!,
      OM_NOTIFY_URL: process.env.OM_NOTIFY_URL!,
      OM_ENV: process.env.OM_ENV || 'dev',
    };
    
    this.axios = AxiosService.connect({
      baseURL: this.paymentConfig.OM_HOST,
    });
  }

  /**
   * Génère un token d'accès
   */
  async generateToken(): Promise<TokenResponse> {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await this.axios.post('/oauth/v3/token', 
          'grant_type=client_credentials',
          {
            headers: {
              'Authorization': this.paymentConfig.OM_BASIC_CONSUMER_KEY,
              'Content-Type': 'application/x-www-form-urlencoded',
            }
          }
        );
        
        this.accessToken = response.data.access_token;
        this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
        
        resolve(response.data);
      } catch (err: any) {
        reject({ error: true, data: err });
      }
    });
  }

  /**
   * Vérifie si le token est valide et le régénère si nécessaire
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiry) {
      await this.generateToken();
    }
    return this.accessToken!;
  }

  /**
   * Initie un paiement
   */
  async initiatePayment(payload: {
    orderId: string;
    amount: number;
    reference: string;
    returnUrl: string;
    cancelUrl: string;
    notifUrl: string;
    lang?: string;
  }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier que les paramètres requis sont présents
        if (!payload.orderId || !payload.amount || !payload.reference) {
          throw new Error('Paramètres de paiement manquants dans PaymentHelper');
        }

        const token = await this.ensureValidToken();
        
        const paymentPayload: PaymentPayload = {
          merchant_key: this.paymentConfig.OM_MERCHANT_KEY,
          currency: this.paymentConfig.OM_CURRENCY,
          order_id: payload.orderId,
          amount: payload.amount,
          return_url: payload.returnUrl,
          cancel_url: payload.cancelUrl,
          notif_url: payload.notifUrl,
          lang: payload.lang || 'fr',
          reference: payload.reference || "YoYo",
        };

        const response = await this.axios.post(`/orange-money-webpay/${this.paymentConfig.OM_ENV}/v1/webpayment`, 
          paymentPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'Cache-Control': 'no-cache',
            }
          }
        );
        
        resolve(response.data);
      } catch (err: any) {
        reject({ error: true, data: err });
      }
    });
  }

  /**
   * Vérifie le statut d'une transaction
   */
  async checkTransactionStatus(payload: {
    orderId: string;
    amount: number;
    payToken: string;
  }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        // Vérifier que les paramètres requis sont présents
        if (!payload.orderId || !payload.amount || !payload.payToken) {
          throw new Error('Paramètres de vérification de transaction manquants dans PaymentHelper');
        }

        const token = await this.ensureValidToken();
        
        const transactionStatusPayload: TransactionStatusPayload = {
          order_id: payload.orderId,
          amount: payload.amount,
          pay_token: payload.payToken,
        };

        const response = await this.axios.post(`/orange-money-webpay/${this.paymentConfig.OM_ENV}/v1/transactionstatus`, 
          transactionStatusPayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
            }
          }
        );
        
        resolve(response.data);
      } catch (err: any) {
        reject({ error: true, data: err });
      }
    });
  }
}
