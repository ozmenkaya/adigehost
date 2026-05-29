import { Router } from 'express';
import { sequelize } from '../config/database';
import { redis } from '../config/redis';
import { asyncHandler } from '../utils/asyncHandler';

export const healthRouter = Router();

/** Basit liveness — yük dengeleyici/uptime kontrolü için. */
healthRouter.get('/', (_req, res) => {
  res.json({ success: true, status: 'ok', uptime: process.uptime() });
});

/** Readiness — bağımlılıkların (DB, Redis) durumu. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, 'ok' | 'fail'> = { db: 'fail', redis: 'fail' };
    try {
      await sequelize.authenticate();
      checks.db = 'ok';
    } catch {
      /* db down */
    }
    try {
      const pong = await redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      /* redis down */
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({ success: healthy, checks });
  }),
);
