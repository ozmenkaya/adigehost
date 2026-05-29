import cron from 'node-cron';
import { logger } from '../config/logger';

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

  // Otomatik tahsilat: her ayın 1'i 02:00 (UTC) — TODO: CronService.runBilling()
  cron.schedule('0 2 1 * *', () => {
    logger.info('[cron] Aylık tahsilat tetiklendi (iskelet)');
  });

  // Sunucu kapasite senkronu: her gece 03:00 — TODO: ServerManager.syncServerStats()
  cron.schedule('0 3 * * *', () => {
    logger.info('[cron] Sunucu kapasite senkronu tetiklendi (iskelet)');
  });

  // Domain bitiş hatırlatma: her gün 09:00 — TODO: domain_yaklasan e-postaları
  cron.schedule('0 9 * * *', () => {
    logger.info('[cron] Domain bitiş kontrolü tetiklendi (iskelet)');
  });

  logger.info('✅ Zamanlayıcı (cron) başlatıldı');
}
