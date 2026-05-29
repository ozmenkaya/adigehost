import { Router } from 'express';

/**
 * Sunucu yönetimi (admin)
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const serversRouter = Router();

serversRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'servers modülü iskelet aşamasında' });
});
