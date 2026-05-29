import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { env } from './config/env';
import { apiLimiter } from './middleware/rateLimiter';
import { sanitizeBody } from './middleware/sanitize';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { router as apiRouter } from './routes';

/**
 * Express uygulamasını oluşturur ve middleware zincirini kurar.
 * (Sunucu dinlemesi index.ts içinde yapılır — test edilebilirlik için ayrık.)
 */
export function createApp(): Application {
  const app = express();

  // Nginx/Cloudflare arkasında doğru istemci IP'si için.
  app.set('trust proxy', 1);

  // Güvenlik başlıkları
  app.use(
    helmet({
      contentSecurityPolicy: false, // API; CSP frontend (Nginx) tarafında yönetilir
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );

  // Gövde ayrıştırma + cookie + sıkıştırma
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());

  // İstek izleme kimliği
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // XSS temizleme (webhook'lar hariç tutulabilir — ham imza doğrulaması gerektirir)
  app.use(sanitizeBody);

  // API rate limit (sağlık kontrolü hariç)
  app.use('/api', apiLimiter);

  // API rotaları
  app.use('/api', apiRouter);

  // 404 + merkezi hata yönetimi
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
