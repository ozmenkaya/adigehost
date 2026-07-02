import cron from 'node-cron';
import { logger } from '../config/logger';
import { ServerManager } from '../services/ServerManager';
import { AutoRenewService } from '../services/AutoRenewService';
import { RenewalService } from '../services/RenewalService';
import { DomainSyncService } from '../services/DomainSyncService';
import { DunningService } from '../services/DunningService';

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

  // Yenileme faturası üretimi: her gece 02:30 — otomatik tahsilattan sonra, dunning'den önce.
  // autoRenew=false (havale/manuel) hosting/VPS servisleri için vade yaklaşınca fatura üretir.
  cron.schedule('30 2 * * *', async () => {
    logger.info('[cron] Yenileme faturası üretimi başladı');
    try {
      const result = await RenewalService.runDaily();
      logger.info('[cron] Yenileme faturası üretimi tamamlandı', result);
    } catch (err) {
      logger.error('[cron] Yenileme faturası üretimi hatası', { error: (err as Error).message });
    }
  });

  // Borç takip (dunning): her gün 08:00 (UTC) — hatırlatma → askıya al → sonlandır.
  // Otomatik tahsilattan (02:00) sonra çalışır; başarısız yenilemeler önce denenmiş olur.
  cron.schedule('0 8 * * *', async () => {
    logger.info('[cron] Borç takip (dunning) başladı');
    try {
      const result = await DunningService.runDaily();
      logger.info('[cron] Borç takip tamamlandı', result);
    } catch (err) {
      logger.error('[cron] Borç takip hatası', { error: (err as Error).message });
    }
  });

  // Sunucu kapasite senkronu: her gece 03:00
  cron.schedule('0 3 * * *', () => {
    logger.info('[cron] Sunucu kapasite senkronu başladı');
    void ServerManager.syncAll();
  });

  // Alantron domain senkronu: her gün 09:00 — bitiş tarihi / kilit / NS tazele
  cron.schedule('0 9 * * *', async () => {
    logger.info('[cron] Alantron domain senkronu başladı');
    try {
      const result = await DomainSyncService.syncAlantron();
      logger.info('[cron] Alantron domain senkronu tamamlandı', {
        updated: result.updated,
        unchanged: result.unchanged,
        notManaged: result.notManaged.length,
        errors: result.errors.length,
      });
    } catch (err) {
      logger.error('[cron] Alantron domain senkronu hatası', { error: (err as Error).message });
    }
  });

  logger.info('✅ Zamanlayıcı (cron) başlatıldı');
}
