import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, closeDatabase } from './config/database';
import { connectRedis, redis } from './config/redis';
import './models'; // modelleri ve ilişkileri kaydet

async function bootstrap(): Promise<void> {
  // Altyapı bağlantıları
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 AdigeHost API çalışıyor`, {
      port: env.PORT,
      env: env.NODE_ENV,
      url: env.APP_URL,
    });
  });

  // Düzgün kapanış (PM2 reload / SIGTERM)
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} alındı, kapanılıyor...`);
    server.close(async () => {
      try {
        await closeDatabase();
        await redis.quit();
      } catch (err) {
        logger.error('Kapanış hatası', { error: (err as Error).message });
      }
      process.exit(0);
    });
    // Zorla kapanış güvencesi
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('İşlenmemiş promise reddi', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('Yakalanmamış istisna', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Başlatma hatası', { error: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
