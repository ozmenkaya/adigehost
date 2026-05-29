import { logger } from '../config/logger';

/**
 * EDM Bilişim SOAP — e-fatura / e-arşiv kesimi
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class EDMService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('EDMService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
