/**
 * Posture de l'attestation d'application (Firebase App Check).
 *
 * `off` < `observe` < `enforce` : trois états exclusifs et ordonnés, portés par la seule variable
 * `APP_CHECK`.
 */
export type AppCheckMode = 'off' | 'observe' | 'enforce';

const APP_CHECK_MODES: readonly AppCheckMode[] = ['off', 'observe', 'enforce'];

/**
 * Lit `APP_CHECK` et la ramène à l'un des trois états.
 *
 * Tolère ce que les fichiers du projet contiennent réellement — commentaire en ligne
 * (`enforce # off | observe | enforce`), espaces, casse quelconque — en suivant le nettoyage déjà
 * appliqué à `ENV` par `isProduction` (`security-check.ts`).
 *
 * **Absente ou non reconnue, la valeur vaut `enforce` : on échoue fermé.** Une variable oubliée
 * dans un nouvel environnement doit protéger, jamais ouvrir — c'était exactement le défaut de
 * C-01. Le cas le plus probable est d'ailleurs le report d'un ancien `true` booléen, qui doit
 * donner le comportement le plus strict et non le plus permissif.
 *
 * Fonction pure, exportée pour être testable sans toucher au `process.env` du processus.
 */
export const parseAppCheckMode = (raw?: string): AppCheckMode => {
  const cleaned = (raw ?? '').split('#')[0].trim().toLowerCase();

  return APP_CHECK_MODES.includes(cleaned as AppCheckMode) ? (cleaned as AppCheckMode) : 'enforce';
};

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
    /**
     * Posture de l'attestation d'application, en une seule valeur.
     *
     * Trois états exclusifs, là où deux booléens laissaient représenter des combinaisons qui ne
     * voulaient rien dire (`enabled: false` + `enforce: true`) :
     *  - `off`     : le middleware ne fait rien du tout ;
     *  - `observe` : vérifie, journalise, laisse passer — pour mesurer avant de couper ;
     *  - `enforce` : pas d'en-tête d'attestation valide, pas d'accès.
     *
     * Les variables `APP_CHECK_ENABLED`, `APP_CHECK_ENFORCE` et `APP_CHECK_ENFORCE_ROUTES` qui
     * précédaient étaient des échafaudages de migration : elles permettaient de fermer les routes
     * une à une pendant que les applications passaient du jeton public à l'attestation. La
     * migration terminée, elles ne décrivaient plus qu'une complexité sans objet.
     */
    mode: AppCheckMode;
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
    mode: parseAppCheckMode(process.env.APP_CHECK),
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    // La clé privée du compte de service contient de vrais sauts de ligne, qu'un fichier `.env`
    // ne sait pas porter : on les stocke échappés en `\n` et on les restaure ici.
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  },
  broadcastSecret: process.env.BROADCAST_SECRET!
};