import { logger } from '../config/logger';

/**
 * DomainNameAPI — domain kayıt/yenileme/DNS yönetimi
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class DomainService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('DomainService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
