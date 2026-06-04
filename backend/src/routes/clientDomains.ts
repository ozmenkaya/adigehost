import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { Service } from '../models';
import { AlantronService } from '../services/AlantronService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Müşterinin kendi domain servisleri üzerinde Alantron işlemleri.
 * Sahiplik doğrulanır: admin değilse sadece kendi servisi.
 * Bu router routes/index.ts içinde `/services/:id/domain` altına bağlanır.
 */
export const clientDomainsRouter = Router({ mergeParams: true });

interface DomainCtx {
  service: Service;
  registrycode: number;
}

async function getOwnedDomain(req: Request): Promise<DomainCtx> {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (service.type !== 'domain') throw ApiError.badRequest('Bu servis bir domain değil');
  if (req.user!.role !== 'admin' && service.userId !== req.user!.sub) {
    throw ApiError.forbidden();
  }
  const cfg = service.config as { registrycode?: number; provider?: string } | null;
  if (!cfg?.registrycode) {
    throw ApiError.badRequest('Bu domain için Alantron registrycode kaydedilmemiş');
  }
  if (cfg.provider && cfg.provider !== 'alantron') {
    throw ApiError.badRequest('Bu domain Alantron üzerinde değil');
  }
  return { service, registrycode: cfg.registrycode };
}

// ── GET /services/:id/domain — tüm domain bilgilerini Alantron'dan çek ──────
clientDomainsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { registrycode } = await getOwnedDomain(req);
    const info = await AlantronService.getDomainFull(registrycode);
    res.json({ success: true, data: info });
  }),
);

// ── PUT /services/:id/domain/nameservers — DNS değiştir ─────────────────────
const nsSchema = z.object({
  body: z.object({
    nameServers: z.array(z.string().min(3).max(253)).min(2).max(5),
  }),
});

clientDomainsRouter.put(
  '/nameservers',
  validate(nsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameServers } = req.body as { nameServers: string[] };
    await AlantronService.modifyDns(registrycode, nameServers);
    await logActivity({
      userId: req.user!.sub, action: 'domain.dns_update',
      resource: 'service', resourceId: service.id,
      details: { nameServers }, ip: req.ip,
    });
    res.json({ success: true, message: 'Nameserver\'lar güncellendi' });
  }),
);

// ── PUT /services/:id/domain/lock — kilit aç/kapat ──────────────────────────
const lockSchema = z.object({ body: z.object({ locked: z.boolean() }) });

clientDomainsRouter.put(
  '/lock',
  validate(lockSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { locked } = req.body as { locked: boolean };
    await AlantronService.setLock(registrycode, locked);
    await logActivity({
      userId: req.user!.sub, action: 'domain.lock', resource: 'service',
      resourceId: service.id, details: { locked }, ip: req.ip,
    });
    res.json({ success: true, message: locked ? 'Domain kilitlendi' : 'Domain kilidi açıldı' });
  }),
);

// ── PUT /services/:id/domain/auth-code — transfer kodu ata ──────────────────
const authSchema = z.object({
  body: z.object({ authCode: z.string().min(6).max(32) }),
});

clientDomainsRouter.put(
  '/auth-code',
  validate(authSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { authCode } = req.body as { authCode: string };
    await AlantronService.setAuthCode(registrycode, authCode);
    await logActivity({
      userId: req.user!.sub, action: 'domain.auth_code', resource: 'service',
      resourceId: service.id, ip: req.ip,
    });
    res.json({ success: true, message: 'Transfer kodu güncellendi' });
  }),
);

// ── Child Nameserver işlemleri ──────────────────────────────────────────────
const childNsSchema = z.object({
  body: z.object({
    nameserver: z.string().min(3).max(253),
    ipAddress: z.string().min(7).max(45),
  }),
});

clientDomainsRouter.post(
  '/child-ns',
  validate(childNsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameserver, ipAddress } = req.body as { nameserver: string; ipAddress: string };
    await AlantronService.addNameserver(registrycode, nameserver, ipAddress);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_add', resource: 'service',
      resourceId: service.id, details: { nameserver, ipAddress }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver eklendi' });
  }),
);

clientDomainsRouter.put(
  '/child-ns',
  validate(childNsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameserver, ipAddress } = req.body as { nameserver: string; ipAddress: string };
    await AlantronService.modifyNameserver(registrycode, nameserver, ipAddress);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_update', resource: 'service',
      resourceId: service.id, details: { nameserver, ipAddress }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver güncellendi' });
  }),
);

clientDomainsRouter.delete(
  '/child-ns/:ns',
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    await AlantronService.deleteNameserver(registrycode, req.params.ns);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_delete', resource: 'service',
      resourceId: service.id, details: { nameserver: req.params.ns }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver silindi' });
  }),
);
