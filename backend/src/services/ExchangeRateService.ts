import axios from 'axios';
import { redis } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Döviz kuru servisi (EUR→TRY).
 * - Birincil kaynak: Frankfurter (ECB verisi, anahtarsız, ücretsiz).
 * - Redis'te cache'lenir (varsayılan 12 saat).
 * - Erişilemezse son bilinen kur ya da güvenli fallback kullanılır.
 *
 * NOT: Resmi TR muhasebe için TCMB kuru tercih edilebilir; ileride
 * kaynak settings'ten seçilebilir hale getirilecek.
 */
const CACHE_KEY = 'fx:eur_try';
const LAST_KEY = 'fx:eur_try:last'; // süresiz son bilinen kur (fallback)
const CACHE_TTL = 12 * 60 * 60; // 12 saat
const FALLBACK_RATE = 35; // API ve son-bilinen yoksa son çare

export class ExchangeRateService {
  static async getEurToTry(): Promise<number> {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return Number(cached);

    try {
      const { data } = await axios.get('https://api.frankfurter.app/latest', {
        params: { from: 'EUR', to: 'TRY' },
        timeout: 8000,
      });
      const rate = Number(data?.rates?.TRY);
      if (!rate || Number.isNaN(rate)) throw new Error('Kur yanıtı geçersiz');

      await redis.set(CACHE_KEY, rate, 'EX', CACHE_TTL);
      await redis.set(LAST_KEY, rate); // fallback için süresiz sakla
      logger.info('EUR→TRY kuru güncellendi', { rate });
      return rate;
    } catch (err) {
      logger.warn('Kur API erişilemedi, fallback kullanılıyor', {
        error: (err as Error).message,
      });
      const last = await redis.get(LAST_KEY);
      return last ? Number(last) : FALLBACK_RATE;
    }
  }
}
