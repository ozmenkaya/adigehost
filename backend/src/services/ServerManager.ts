import { logger } from '../config/logger';

/**
 * Çok-sunucu yönetimi — kapasite bazlı sunucu seçimi
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class ServerManager {
  static async healthcheck(): Promise<boolean> {
    logger.debug('ServerManager.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
