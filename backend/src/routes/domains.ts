import { Router } from 'express';

/**
 * Domain kayıt/yenileme/DNS
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const domainsRouter = Router();

domainsRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'domains modülü iskelet aşamasında' });
});
