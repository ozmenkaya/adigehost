import { Router } from 'express';

/**
 * Fatura & ödeme
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const invoicesRouter = Router();

invoicesRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'invoices modülü iskelet aşamasında' });
});
