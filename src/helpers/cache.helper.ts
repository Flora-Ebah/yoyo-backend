import Redis from 'ioredis';
import { config } from '../config/env';
import coddyger from 'coddyger';

/**
 * Helper Redis pour la gestion du cache applicatif.
 * Seuls les paramètres recommandés (host, port, password, database) sont utilisés.
 */
class RedisCache {
  private readonly client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisConfig = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.database || 0, // Utiliser 0 si NaN
      retryStrategy: (times: number) => {
        return Math.min(times * 50, 2000);
      }
    };

    this.client = new Redis(redisConfig);

    this.client.on('connect', () => {
      coddyger.konsole('✅ Redis connecté :: ' + config.redis.host + ':' + config.redis.port);
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      coddyger.konsole(`❌ Erreur Redis: ${(err as Error).message}`, 1);
    });

    this.client.on('close', () => {
      coddyger.konsole('⚠️ Connexion Redis fermée');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      coddyger.konsole('🔄 Reconnexion à Redis…');
    });
  }

  /**
   * Établit la connexion à Redis si nécessaire.
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  /**
   * Ferme proprement la connexion Redis.
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
      coddyger.konsole('✅ Connexion Redis fermée proprement');
    }
  }

  /**
   * Récupère une valeur dans le cache (JSON.parse automatique).
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      coddyger.konsole(`❌ GET Redis: ${(error as Error).message}`, 1);
      return null;
    }
  }

  /**
   * Définit une valeur dans le cache. TTL facultatif (en secondes).
   */
  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const stringValue = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, stringValue);
      } else {
        await this.client.set(key, stringValue);
      }
      return true;
    } catch (error) {
      coddyger.konsole(`❌ SET Redis: ${(error as Error).message}`, 1);
      return false;
    }
  }

  /**
   * Supprime une clé du cache.
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      coddyger.konsole(`❌ DEL Redis: ${(error as Error).message}`, 1);
      return false;
    }
  }

  /**
   * Vérifie l'existence d'une clé.
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      coddyger.konsole(`❌ EXISTS Redis: ${(error as Error).message}`, 1);
      return false;
    }
  }

  /**
   * Vider la base de données Redis courante.
   */
  async flushdb(): Promise<boolean> {
    try {
      await this.client.flushdb();
      return true;
    } catch (error) {
      coddyger.konsole(`❌ FLUSHDB Redis: ${(error as Error).message}`, 1);
      return false;
    }
  }
}

// Singleton exporté
export const redisCache = new RedisCache(); 