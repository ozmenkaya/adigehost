import { logger } from '../config/logger';

/**
 * Anthropic Claude — agentic ticket analizi, monitoring, raporlama
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class ClaudeService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('ClaudeService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
