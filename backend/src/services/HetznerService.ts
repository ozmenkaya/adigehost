import { logger } from '../config/logger';

/**
 * Hetzner Cloud API — VPS provisioning ve kontrol aksiyonları
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class HetznerService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('HetznerService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
