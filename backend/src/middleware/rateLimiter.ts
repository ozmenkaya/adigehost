import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { isTest } from '../config/env';

/**
 * Redis tabanlı rate limiter fabrikası.
 * Çok-instanceli (PM2 cluster) ortamda sayaç paylaşımı için Redis kullanılır.
 */
function createLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
  prefix: string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: opts.windowMs,
    max: isTest ? 100000 : opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: opts.message ?? 'Çok fazla istek, lütfen sonra deneyin',
      },
    },
    store: new RedisStore({
      // @ts-expect-error ioredis call signature ile uyumlu
      sendCommand: (...args: string[]) => redis.call(...args),
      prefix: `rl:${opts.prefix}:`,
    }),
  });
}

/** Genel API limiti: 120 istek / dakika. */
export const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  prefix: 'api',
});

/** Giriş/kayıt gibi hassas uçlar: 5 deneme / 15 dakika. */
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.',
  prefix: 'auth',
});
