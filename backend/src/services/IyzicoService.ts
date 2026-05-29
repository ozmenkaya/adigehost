import { logger } from '../config/logger';

/**
 * İyzico — ödeme, 3D Secure ve kart saklama
 * İskelet servis — gerçek entegrasyon kodlama fazında eklenecek.
 * Konfigürasyon ortam değişkenlerinden (config/env.ts) okunur.
 */
export class IyzicoService {
  static async healthcheck(): Promise<boolean> {
    logger.debug('IyzicoService.healthcheck çağrıldı (iskelet)');
    return true;
  }
}
