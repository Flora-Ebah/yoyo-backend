interface RabbitMQConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  vhost: string;
  globalExchange: string;
}

interface Config {
  redis: {
    host: string;
    port: number;
    password: string;
    database: number;
    maxmemory: string;
    maxmemoryPolicy: string;
    appendonly: boolean;
    tlsEnabled: boolean;
  };
  rabbitmq: RabbitMQConfig;
  sigobe: {
    enabled: boolean;
    apiUrl: string;
    apiKey: string;
    syncInterval: number; // minutes
    retryAttempts: number;
    retryDelay: number; // seconds
  };
  swagger: {
    enabled: boolean;
  };
  appCheck: {
    /** Vérification active. Désactivée, le middleware laisse tout passer sans journaliser. */
    enabled: boolean;
    /**
     * Rejet effectif des requêtes non attestées.
     *
     * `false` = mode observation : on vérifie, on journalise, on laisse passer. C'est le réglage
     * de déploiement : il faut mesurer le taux d'échec réel avant de bloquer, sinon on coupe
     * l'accès à des clients légitimes (appareils sans Play Services, versions antérieures de
     * l'application, applications pas encore migrées).
     */
    enforce: boolean;
    /**
     * Détection du rejeu sur les routes marquées `verifyLimitedUse`.
     *
     * Exige le rôle IAM *Firebase App Check Token Verifier* sur le compte de service, accordé
     * séparément — d'où l'interrupteur dédié. Sans lui, la détection se coupe d'elle-même après
     * un échec, en le journalisant.
     */
    consume: boolean;
    /**
     * Routes passées en rejet **avant** l'interrupteur global.
     *
     * Toutes les applications ne migrent pas en même temps. Attendre la dernière pour protéger les
     * premières, c'est laisser ouvertes des routes déjà couvertes. Cette liste permet de fermer
     * route par route, en commençant par celles qu'aucune application en retard n'appelle.
     *
     * Fragments d'URL, comparés en minuscules sur le chemin déclaré de la route.
     */
    enforceRoutes: string[];
    projectId: string;
    clientEmail: string;
    privateKey: string;
  };
  broadcastSecret: string;
}

export const config: Config = {
  redis: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT!),
    password: process.env.REDIS_PASSWORD!,
    database: parseInt(process.env.REDIS_DATABASE!),
    maxmemory: process.env.REDIS_MAXMEMORY!,
    maxmemoryPolicy: process.env.REDIS_MAXMEMORY_POLICY!,
    appendonly: process.env.REDIS_APPENDONLY === 'yes',
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true'
  },
  rabbitmq: {
    enabled: process.env.RABBITMQ_ENABLED === 'true',
    host: process.env.RABBITMQ_HOST!,
    port: parseInt(process.env.RABBITMQ_PORT!),
    user: process.env.RABBITMQ_USER!,
    password: process.env.RABBITMQ_PASSWORD!,
    vhost: process.env.RABBITMQ_VHOST!,
    globalExchange: process.env.RABBITMQ_GLOBAL_EXCHANGE!
  },
  sigobe: {
    enabled: process.env.SIGOBE_ENABLED === 'true',
    apiUrl: process.env.SIGOBE_API_URL!,
    apiKey: process.env.SIGOBE_API_KEY!,
    syncInterval: parseInt(process.env.SIGOBE_SYNC_INTERVAL!) || 30, // 30 minutes par défaut
    retryAttempts: parseInt(process.env.SIGOBE_RETRY_ATTEMPTS!) || 3,
    retryDelay: parseInt(process.env.SIGOBE_RETRY_DELAY!) || 300 // 5 minutes par défaut
  },
  swagger: {
    enabled: process.env.SWAGGER_ENABLED !== 'false' // enabled par défaut
  },
  appCheck: {
    enabled: process.env.APP_CHECK_ENABLED === 'true',
    // Volontairement en opt-in explicite : le rejet ne s'active qu'à la main, après lecture
    // des journaux du mode observation.
    enforce: process.env.APP_CHECK_ENFORCE === 'true',
    // Opt-in explicite lui aussi : dépend d'un rôle IAM et d'applications clientes qui envoient
    // des jetons à usage unique. Activé trop tôt, il signalerait des rejeux inexistants.
    consume: process.env.APP_CHECK_CONSUME === 'true',
    enforceRoutes: (process.env.APP_CHECK_ENFORCE_ROUTES ?? '')
      .split(',')
      .map(route => route.trim().toLowerCase())
      .filter(route => route.length > 0),
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    // La clé privée du compte de service contient de vrais sauts de ligne, qu'un fichier `.env`
    // ne sait pas porter : on les stocke échappés en `\n` et on les restaure ici.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  },
  broadcastSecret: process.env.BROADCAST_SECRET!
};