import { billingQueue, type BillingJob } from './queue';
import { ServiceLifecycleService } from '../services/ServiceLifecycleService';
import { logger } from '../config/logger';

/**
 * billingQueue işleyicisi — yaşam döngüsü aksiyonlarını (askıya al / yeniden
 * aktive / sonlandır) altyapıya uygular. Bull, başarısız işleri exponential
 * backoff ile 3 kez yeniden dener (queue.ts defaultJobOptions).
 *
 * index.ts içinde startBillingProcessor() ile bir kez başlatılır.
 * PM2 cluster'da yalnızca tek instance'ta çalışmalı (scheduler ile aynı kural).
 */
export function startBillingProcessor(): void {
  // PM2 cluster: yalnızca ilk instance tüketici olsun (scheduler ile aynı kural).
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== '0') {
    logger.info('Faturalama kuyruğu bu instance üzerinde devre dışı (NODE_APP_INSTANCE!=0)');
    return;
  }

  billingQueue.process(async (job) => {
    const data = job.data as BillingJob;
    logger.info('[billing-queue] iş işleniyor', { id: job.id, type: data.type, serviceId: data.serviceId });
    switch (data.type) {
      case 'suspend':
        await ServiceLifecycleService.suspend(data.serviceId, data.reason);
        break;
      case 'unsuspend':
        await ServiceLifecycleService.unsuspend(data.serviceId);
        break;
      case 'terminate':
        await ServiceLifecycleService.terminate(data.serviceId, data.reason);
        break;
    }
  });
  logger.info('✅ Faturalama kuyruğu işleyicisi başlatıldı');
}
