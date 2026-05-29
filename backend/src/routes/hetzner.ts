import { Router } from 'express';

/**
 * Hetzner VPS kontrol aksiyonları
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const hetznerRouter = Router();

hetznerRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'hetzner modülü iskelet aşamasında' });
});
