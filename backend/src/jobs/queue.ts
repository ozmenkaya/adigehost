import Queue from 'bull';
import { redisConnectionOptions } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Bull kuyruk fabrikası (Redis tabanlı).
 * Ağır/asenkron işler (e-posta, provisioning, e-fatura) buraya alınır.
 */
export function createQueue<T = unknown>(name: string): Queue.Queue<T> {
  const queue = new Queue<T>(name, {
    redis: redisConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
  queue.on('failed', (job, err) => {
    logger.error(`Kuyruk işi başarısız: ${name}`, { jobId: job.id, error: err.message });
  });
  return queue;
}

// Tanımlı kuyruklar (işleyiciler kodlama fazında eklenecek)
export const emailQueue = createQueue('email');
export const provisioningQueue = createQueue('provisioning');
export const billingQueue = createQueue('billing');
