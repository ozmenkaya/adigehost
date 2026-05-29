import { Router } from 'express';

/**
 * Kullanıcı profili & KVKK hakları
 * İskelet modül — endpoint'ler kodlama fazında HOSTPANEL_PROJECT.md'deki
 * API listesine göre doldurulacak.
 */
export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  res.json({ success: true, data: [], message: 'users modülü iskelet aşamasında' });
});
