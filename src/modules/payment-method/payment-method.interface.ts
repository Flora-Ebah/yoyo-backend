/**
 * Interface pour le module PaymentMethod
 * 
 * Exemples d'utilisation :
 * 
 * Orange Money:
 * {
 *   name: "Orange Money",
 *   type: "mobile_money",
 *   provider: "orange_money",
 *   apiConfig: {
 *     baseUrl: "https://api.orange.com",
 *     environment: "dev",
 *     credentials: {
 *       merchantKey: "YOUR_MERCHANT_KEY",
 *       consumerKey: "YOUR_CONSUMER_KEY"
 *     },
 *     endpoints: {
 *       payment: "/orange-money-webpay/dev/v1/webpayment",
 *       status: "/orange-money-webpay/dev/v1/transactionstatus"
 *     }
 *   }
 * }
 * 
 * MTN Mobile Money:
 * {
 *   name: "MTN Mobile Money",
 *   type: "mobile_money", 
 *   provider: "mtn_momo",
 *   apiConfig: {
 *     baseUrl: "https://api.mtn.com",
 *     environment: "prod",
 *     credentials: {
 *       apiKey: "YOUR_API_KEY",
 *       secretKey: "YOUR_SECRET_KEY"
 *     }
 *   }
 * }
 * 
 * VISA Card:
 * {
 *   name: "VISA Card",
 *   type: "card",
 *   provider: "visa",
 *   apiConfig: {
 *     baseUrl: "https://api.visa.com",
 *     environment: "test",
 *     credentials: {
 *       merchantId: "YOUR_MERCHANT_ID",
 *       apiKey: "YOUR_API_KEY"
 *     }
 *   }
 * }
 */
export interface IPaymentMethod {
  _id?: string;
  name: string;
  description?: string;
  type: 'mobile_money' | 'card' | 'bank_transfer' | 'crypto' | 'other';
  provider: 'orange_money' | 'mtn_momo' | 'wave' | 'moov_money' | 'visa' | 'mastercard' | 'paypal' | 'stripe' | 'other';
  status: 'active' | 'inactive' | 'suspended' | 'removed';
  
  // Configuration API
  apiConfig: {
    baseUrl: string;
    environment: 'dev' | 'test' | 'prod';
    credentials: {
      apiKey?: string;
      secretKey?: string;
      merchantId?: string;
      consumerKey?: string;
      basicAuth?: string;
      [key: string]: any; // Pour d'autres types de credentials
    };
    endpoints: {
      payment?: string;
      status?: string;
      refund?: string;
      webhook?: string;
      [key: string]: string | undefined;
    };
    headers?: {
      [key: string]: string;
    };
  };
  
  // Configuration des frais
  fees?: {
    percentage?: number;
    fixed?: number;
    currency: string;
  };
  
  // Limites de transaction
  limits?: {
    minAmount?: number;
    maxAmount?: number;
    currency: string;
  };
  
  // Configuration des webhooks
  webhookConfig?: {
    url?: string;
    secret?: string;
    events?: string[];
  };
  
  // Métadonnées spécifiques au provider
  metadata?: {
    [key: string]: any;
  };
  
  // Configuration de l'interface utilisateur
  uiConfig?: {
    logo?: string;
    color?: string;
    displayName?: string;
    instructions?: string;
  };
  
  createdAt?: Date;
  updatedAt?: Date;
}