import axios from 'axios';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Döviz kuru servisi (… → TRY).
 * - Birincil kaynak: Frankfurter (ECB verisi, anahtarsız, ücretsiz).
 * - Redis'te cache'lenir (varsayılan 12 saat).
 * - Erişilemezse son bilinen kur ya da güvenli fallback kullanılır.
 *
 * NOT: Resmi TR muhasebe için TCMB kuru tercih edilebilir; ileride
 * kaynak settings'ten seçilebilir hale getirilecek.
 */
const CACHE_TTL = 12 * 60 * 60; // 12 saat
const FALLBACK: Record<string, number> = { EUR: 38, USD: 35 };

export class ExchangeRateService {
  /** Verilen para biriminden TRY'ye güncel kur. */
  static async getRateToTry(from: 'EUR' | 'USD'): Promise<number> {
    const cacheKey = `fx:${from.toLowerCase()}_try`;
    const lastKey = `${cacheKey}:last`;
    const cached = await redis.get(cacheKey);
    if (cached) return Number(cached);

    try {
      const { data } = await axios.get('https://api.frankfurter.app/latest', {
        params: { from, to: 'TRY' },
        timeout: 8000,
      });
      const rate = Number(data?.rates?.TRY);
      if (!rate || Number.isNaN(rate)) throw new Error('Kur yanıtı geçersiz');
      await redis.set(cacheKey, rate, 'EX', CACHE_TTL);
      await redis.set(lastKey, rate);
      logger.info(`${from}→TRY kuru güncellendi`, { rate });
      return rate;
    } catch (err) {
      logger.warn(`Kur API erişilemedi (${from}), fallback`, { error: (err as Error).message });
      const last = await redis.get(lastKey);
      return last ? Number(last) : (FALLBACK[from] ?? 35);
    }
  }

  static getEurToTry(): Promise<number> {
    return this.getRateToTry('EUR');
  }

  static getUsdToTry(): Promise<number> {
    return this.getRateToTry('USD');
  }
}
