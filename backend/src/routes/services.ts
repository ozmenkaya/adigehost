import { Router } from 'express';

/**
 * VPS/Hosting servis CRUD
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const servicesRouter = Router();

servicesRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'services modülü iskelet aşamasında' });
});
