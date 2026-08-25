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
  broadcastSecret: process.env.BROADCAST_SECRET!
};