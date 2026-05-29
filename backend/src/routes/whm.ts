import { Router } from 'express';

/**
 * WHM/cPanel hosting aksiyonları
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const whmRouter = Router();

whmRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'whm modülü iskelet aşamasında' });
});
