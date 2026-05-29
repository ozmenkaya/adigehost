import { Router } from 'express';

/**
 * Admin paneli uçları
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const adminRouter = Router();

adminRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'admin modülü iskelet aşamasında' });
});
