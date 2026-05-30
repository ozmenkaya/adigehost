import { Router } from 'express';
import { Service, Server } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Müşteri servis yönetimi (VPS / Hosting / Domain servisleri).
 * `authenticate` ile korunur. Müşteri yalnızca kendi servislerini görür;
 * admin tüm servislere erişebilir (yönetim için /admin/services de mevcut).
 *
 * NOT: Yeni servis oluşturma (POST /vps, /hosting) provisioning gerektirir
 * (Hetzner/WHM) — Faz 2'de eklenecek.
 */
export const servicesRouter = Router();

/** İstek sahibinin bir servise erişip erişemediğini kontrol eder. */
async function getOwnedService(serviceId: string, userId: string, isAdmin: boolean) {
  const service = await Service.findByPk(serviceId, {
    include: [{ model: Server, as: 'server', attributes: ['id', 'name', 'location'] }],
  });
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (!isAdmin && service.userId !== userId) throw ApiError.forbidden();
  return service;
}

// --- GET /services — kendi servislerim ---
servicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const services = await Service.findAll({
      where: { userId: req.user!.sub },
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: services });
  }),
);

// --- GET /services/:id — servis detayı ---
servicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = await getOwnedService(req.params.id, req.user!.sub, req.user!.role === 'admin');
    res.json({ success: true, data: service });
  }),
);

// --- PUT /services/:id/cancel — servis iptal talebi ---
servicesRouter.put(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const service = await getOwnedService(req.params.id, req.user!.sub, req.user!.role === 'admin');

    if (['cancelled', 'terminated'].includes(service.status)) {
      throw ApiError.conflict('Servis zaten iptal edilmiş');
    }

    service.status = 'cancelled';
    await service.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'service.cancel',
      resource: 'service',
      resourceId: service.id,
      ip: req.ip,
    });
    // TODO (Faz 2): dönem sonu sonlandırma / Hetzner powerOff / WHM suspend kuyruğu.
    res.json({ success: true, data: service, message: 'Servis iptal edildi' });
  }),
);

// --- POST /services/vps — Faz 2 (provisioning) ---
servicesRouter.post('/vps', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'VPS oluşturma Faz 2 (Hetzner provisioning) ile aktif olacak',
    },
  });
});

// --- POST /services/hosting — Faz 2 (provisioning) ---
servicesRouter.post('/hosting', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Hosting oluşturma Faz 2 (WHM provisioning) ile aktif olacak',
    },
  });
});
