import cron from 'node-cron';
import { logger } from '../config/logger';
import { ServerManager } from '../services/ServerManager';
import { AutoRenewService } from '../services/AutoRenewService';

/**
 * Zamanlanmış görevler (node-cron). index.ts içinde startScheduler() ile başlatılır.
 * NOT: PM2 cluster modunda yalnızca tek instance'ta çalışmalı (NODE_APP_INSTANCE === '0').
 *
 * Tüm tarihler UTC. (Europe/Istanbul = UTC+3)
 */
export function startScheduler(): void {
  // PM2 cluster: yalnızca ilk instance zamanlayıcıyı çalıştırsın
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    logger.info('Scheduler bu instance üzerinde devre dışı (NODE_APP_INSTANCE!=0)');
    return;
  }

  // Otomatik yenileme tahsilatları: her gece 02:00 (UTC)
  // Vadesi 3 gün içinde dolan tüm autoRenew servisleri saklı kartla çekilir.
  cron.schedule('0 2 * * *', async () => {
    logger.info('[cron] Otomatik yenileme tahsilatı başladı');
    try {
      const result = await AutoRenewService.runDaily();
      logger.info('[cron] Otomatik yenileme tamamlandı', result);
    } catch (err) {
      logger.error('[cron] Otomatik yenileme hatası', { error: (err as Error).message });
    }
  });

  // Sunucu kapasite senkronu: her gece 03:00
  cron.schedule('0 3 * * *', () => {
    logger.info('[cron] Sunucu kapasite senkronu başladı');
    void ServerManager.syncAll();
  });

  // Domain bitiş hatırlatma: her gün 09:00 — TODO: domain_yaklasan e-postaları
  cron.schedule('0 9 * * *', () => {
    logger.info('[cron] Domain bitiş kontrolü tetiklendi (iskelet)');
  });

  logger.info('✅ Zamanlayıcı (cron) başlatıldı');
}
