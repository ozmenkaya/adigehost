import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { healthRouter } from './health';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { servicesRouter } from './services';
import { productsRouter } from './products';
import { domainsRouter } from './domains';
import { invoicesRouter } from './invoices';
import { ticketsRouter } from './tickets';
import { hetznerRouter } from './hetzner';
import { whmRouter } from './whm';
import { serversRouter } from './servers';
import { adminRouter } from './admin';
import { integrationsRouter } from './integrations';
import { webhooksRouter } from './webhooks';
import { publicRouter } from './public';
import { cartRouter } from './cart';

export const router = Router();

// Genel
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Webhook'lar (kimlik doğrulama imza ile yapılır, JWT değil)
router.use('/webhooks', webhooksRouter);

// Herkese açık — satış sayfası (auth gerekmez)
router.use('/public', publicRouter);

// Kimlik doğrulama gerektiren müşteri uçları
router.use('/users', authenticate, usersRouter);
router.use('/services', authenticate, servicesRouter);
router.use('/products', authenticate, productsRouter);
router.use('/domains', authenticate, domainsRouter);
router.use('/invoices', authenticate, invoicesRouter);
router.use('/tickets', authenticate, ticketsRouter);
router.use('/hetzner', authenticate, hetznerRouter);
router.use('/whm', authenticate, whmRouter);
router.use('/cart', authenticate, cartRouter);

// Admin uçları
router.use('/servers', authenticate, requireAdmin, serversRouter);
router.use('/admin/integrations', authenticate, requireAdmin, integrationsRouter);
router.use('/admin', authenticate, requireAdmin, adminRouter);
