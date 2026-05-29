import { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Paylaşılan Redis bağlantısı.
 * - Cache, rate-limit ve oturum/refresh token store için kullanılır.
 * - Bull kuyrukları kendi bağlantısını oluşturur (jobs/queue.ts).
 */
export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on('error', (err) => logger.error('Redis hatası', { error: err.message }));
redis.on('connect', () => logger.info('✅ Redis bağlantısı kuruldu'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}

/** Bull kuyrukları için bağlantı opsiyonları. */
export const redisConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
};
