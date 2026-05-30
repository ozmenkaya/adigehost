import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import { Service } from '../models';
import { HetznerService } from '../services/HetznerService';
import { PricingService } from '../services/PricingService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Hetzner VPS kontrol aksiyonları.
 * `:id` = AdigeHost servis id'si (Hetzner sunucu id'si değil) — güvenlik için
 * her aksiyon önce servis sahipliği doğrulanır, sonra service.hetznerId kullanılır.
 */
export const hetznerRouter = Router();

/** Servisi bulur, sahiplik + VPS + hetznerId kontrolü yapar. */
async function resolveVps(req: Request): Promise<{ service: Service; hetznerId: number }> {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (req.user!.role !== 'admin' && service.userId !== req.user!.sub) throw ApiError.forbidden();
  if (service.type !== 'vps' || !service.hetznerId) {
    throw ApiError.badRequest('Bu servis bir Hetzner VPS değil veya henüz hazırlanmadı');
  }
  return { service, hetznerId: service.hetznerId };
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

// ============ Katalog (provisioning için) ============

hetznerRouter.get(
  '/catalog/server-types',
  asyncHandler(async (req, res) => {
    const location = (req.query.location as string) || 'nbg1';
    const types = await HetznerService.listServerTypes();
    const data = await Promise.all(
      types.map(async (t) => {
        const price = t.prices.find((p) => p.location === location) ?? t.prices[0];
        const eurMonthly = price ? Number(price.price_monthly.gross) : 0;
        return {
          name: t.name,
          cores: t.cores,
          memory: t.memory,
          disk: t.disk,
          priceMonthlyTRY: price ? await PricingService.eurToSalePriceTRY(eurMonthly) : null,
        };
      }),
    );
    res.json({ success: true, data });
  }),
);

hetznerRouter.get(
  '/catalog/locations',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await HetznerService.listLocations() });
  }),
);

hetznerRouter.get(
  '/catalog/images',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await HetznerService.listImages() });
  }),
);

// ============ Sunucu durumu ============

hetznerRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const server = await HetznerService.getServer(hetznerId);
    res.json({ success: true, data: server });
  }),
);

hetznerRouter.get(
  '/:id/metrics',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const type = (req.query.type as 'cpu' | 'disk' | 'network') ?? 'cpu';
    res.json({ success: true, data: await HetznerService.getMetrics(hetznerId, type) });
  }),
);

// ============ Güç aksiyonları ============

const powerActions: Array<{ path: string; fn: (id: number) => Promise<unknown>; action: string }> =
  [
    { path: 'poweron', fn: (id) => HetznerService.powerOn(id), action: 'hetzner.poweron' },
    { path: 'poweroff', fn: (id) => HetznerService.powerOff(id), action: 'hetzner.poweroff' },
    { path: 'reboot', fn: (id) => HetznerService.reboot(id), action: 'hetzner.reboot' },
    { path: 'reset', fn: (id) => HetznerService.reset(id), action: 'hetzner.reset' },
    { path: 'shutdown', fn: (id) => HetznerService.shutdown(id), action: 'hetzner.shutdown' },
  ];

for (const { path, fn, action } of powerActions) {
  hetznerRouter.post(
    `/:id/${path}`,
    asyncHandler(async (req, res) => {
      const { service, hetznerId } = await resolveVps(req);
      const result = await fn(hetznerId);
      await audit(req, action, service.id);
      res.json({ success: true, data: result });
    }),
  );
}

// ============ Rebuild (OS yeniden kur) ============
const rebuildSchema = z.object({ body: z.object({ image: z.string().min(2) }) });
hetznerRouter.post(
  '/:id/rebuild',
  validate(rebuildSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.rebuild(hetznerId, req.body.image);
    await audit(req, 'hetzner.rebuild', service.id);
    res.json({ success: true, data: result });
  }),
);

// ============ Snapshot ============
const snapshotSchema = z.object({
  body: z.object({ description: z.string().max(100).optional() }),
});
hetznerRouter.post(
  '/:id/snapshot',
  validate(snapshotSchema),
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const desc = req.body.description ?? `${service.name} - ${new Date().toISOString()}`;
    const result = await HetznerService.createSnapshot(hetznerId, desc);
    await audit(req, 'hetzner.snapshot_create', service.id);
    res.status(201).json({ success: true, data: result });
  }),
);

hetznerRouter.get(
  '/:id/snapshots',
  asyncHandler(async (req, res) => {
    const { hetznerId } = await resolveVps(req);
    const all = (await HetznerService.listSnapshots()) as Array<{
      id: number;
      created_from?: { id: number };
    }>;
    const own = all.filter((img) => img.created_from?.id === hetznerId);
    res.json({ success: true, data: own });
  }),
);

hetznerRouter.delete(
  '/:id/snapshots/:snapshotId',
  asyncHandler(async (req, res) => {
    const { service } = await resolveVps(req);
    await HetznerService.deleteImage(Number(req.params.snapshotId));
    await audit(req, 'hetzner.snapshot_delete', service.id);
    res.json({ success: true, message: 'Snapshot silindi' });
  }),
);

// ============ Konsol & Yedekleme ============
hetznerRouter.post(
  '/:id/console',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.requestConsole(hetznerId);
    await audit(req, 'hetzner.console', service.id);
    res.json({ success: true, data: result });
  }),
);

hetznerRouter.post(
  '/:id/backup/enable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.enableBackup(hetznerId);
    await audit(req, 'hetzner.backup_enable', service.id);
    res.json({ success: true, data: result });
  }),
);

hetznerRouter.post(
  '/:id/backup/disable',
  asyncHandler(async (req, res) => {
    const { service, hetznerId } = await resolveVps(req);
    const result = await HetznerService.disableBackup(hetznerId);
    await audit(req, 'hetzner.backup_disable', service.id);
    res.json({ success: true, data: result });
  }),
);
