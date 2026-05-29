import { logger } from '../config/logger';

/**
 * WHM/cPanel API — hosting hesabı aç/yönet/askıya al
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class WHMService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('WHMService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
