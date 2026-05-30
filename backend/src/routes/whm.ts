import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { Service, Server } from '../models';
import { WHMService } from '../services/WHMService';
import { env } from '../config/env';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * WHM/cPanel hosting kontrol aksiyonları.
 * `:id` = AdigeHost hosting servis id'si. Sahiplik doğrulanır, ardından
 * servisin bağlı olduğu sunucudan (servers tablosu) WHM bağlantısı kurulur.
 * cPanel kullanıcı adı service.config.cpanelUser içinde saklanır.
 */
export const whmRouter = Router();

interface HostingContext {
  service: Service;
  whm: WHMService;
  cpanelUser: string;
}

async function resolveHosting(req: Request): Promise<HostingContext> {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (req.user!.role !== 'admin' && service.userId !== req.user!.sub) throw ApiError.forbidden();
  if (service.type !== 'hosting') throw ApiError.badRequest('Bu servis bir hosting hesabı değil');

  const cpanelUser = (service.config as { cpanelUser?: string } | null)?.cpanelUser;
  if (!cpanelUser) {
    throw ApiError.badRequest('Hosting hesabı henüz hazırlanmamış (cPanel kullanıcısı yok)');
  }

  // Bağlantı: önce servise atanmış sunucu, yoksa env (tek-sunuculu kurulum).
  let whm: WHMService;
  if (service.serverId) {
    const server = await Server.findByPk(service.serverId);
    if (!server) throw ApiError.internal('Servise atanmış sunucu bulunamadı');
    whm = WHMService.forServer(server);
  } else if (env.WHM_HOST) {
    whm = WHMService.fromEnv();
  } else {
    throw ApiError.internal('WHM bağlantısı yapılandırılmamış');
  }
  return { service, whm, cpanelUser };
}

async function audit(req: Request, action: string, serviceId: string) {
  await logActivity({
    userId: req.user!.sub,
    action,
    resource: 'service',
    resourceId: serviceId,
    ip: req.ip,
  });
}

// --- POST /whm/:id/suspend ---
const suspendSchema = z.object({ body: z.object({ reason: z.string().max(255).optional() }) });
whmRouter.post(
  '/:id/suspend',
  validate(suspendSchema),
  asyncHandler(async (req, res) => {
    const { service, whm, cpanelUser } = await resolveHosting(req);
    await whm.suspendAccount(cpanelUser, req.body.reason);
    service.status = 'suspended';
    await service.save();
    await audit(req, 'whm.suspend', service.id);
    res.json({ success: true, message: 'Hosting hesabı askıya alındı' });
  }),
);

// --- POST /whm/:id/unsuspend ---
whmRouter.post(
  '/:id/unsuspend',
  asyncHandler(async (req, res) => {
    const { service, whm, cpanelUser } = await resolveHosting(req);
    await whm.unsuspendAccount(cpanelUser);
    service.status = 'active';
    await service.save();
    await audit(req, 'whm.unsuspend', service.id);
    res.json({ success: true, message: 'Hosting hesabı aktifleştirildi' });
  }),
);

// --- POST /whm/:id/password ---
const passwordSchema = z.object({ body: z.object({ password: z.string().min(8).max(128) }) });
whmRouter.post(
  '/:id/password',
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const { service, whm, cpanelUser } = await resolveHosting(req);
    await whm.changePassword(cpanelUser, req.body.password);
    await audit(req, 'whm.password_change', service.id);
    res.json({ success: true, message: 'cPanel şifresi güncellendi' });
  }),
);

// --- GET /whm/:id/stats ---
whmRouter.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const { whm, cpanelUser } = await resolveHosting(req);
    const summary = await whm.accountSummary(cpanelUser);
    res.json({ success: true, data: summary });
  }),
);

// --- GET /whm/:id/databases ---
whmRouter.get(
  '/:id/databases',
  asyncHandler(async (req, res) => {
    const { whm, cpanelUser } = await resolveHosting(req);
    res.json({ success: true, data: await whm.listDatabases(cpanelUser) });
  }),
);

// --- POST /whm/:id/databases ---
const dbSchema = z.object({ body: z.object({ name: z.string().min(1).max(64) }) });
whmRouter.post(
  '/:id/databases',
  validate(dbSchema),
  asyncHandler(async (req, res) => {
    const { service, whm, cpanelUser } = await resolveHosting(req);
    const result = await whm.createDatabase(cpanelUser, req.body.name);
    await audit(req, 'whm.database_create', service.id);
    res.status(201).json({ success: true, data: result });
  }),
);

// --- GET /whm/:id/subdomains ---
whmRouter.get(
  '/:id/subdomains',
  asyncHandler(async (req, res) => {
    const { whm, cpanelUser } = await resolveHosting(req);
    res.json({ success: true, data: await whm.listSubdomains(cpanelUser) });
  }),
);
