import { Router } from 'express';

/**
 * İyzico & EDM callback
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const webhooksRouter = Router();

webhooksRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'webhooks modülü iskelet aşamasında' });
});
