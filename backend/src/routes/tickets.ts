import { Router } from 'express';

/**
 * Destek talepleri
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const ticketsRouter = Router();

ticketsRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'tickets modülü iskelet aşamasında' });
});
