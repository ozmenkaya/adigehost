import { Router } from 'express';
import { z } from 'zod';
import { Service, Server } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { HetznerService } from '../services/HetznerService';
import { validate } from '../middleware/validate';
import { slugify } from '../utils/helpers';

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

// --- POST /services/vps — Hetzner VPS provisioning ---
const createVpsSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60),
    serverType: z.string().min(2).max(20), // örn "cpx21"
    location: z.enum(['nbg1', 'fsn1', 'hel1', 'ash', 'hil', 'sin']).default('nbg1'),
    image: z.string().min(2).max(40).default('ubuntu-22.04'),
    billingCycle: z.enum(['monthly', 'quarterly', 'annually']).default('monthly'),
  }),
});

const MARKUP = 1.6; // TR satış fiyatı çarpanı (ileride settings'ten okunacak)

servicesRouter.post(
  '/vps',
  validate(createVpsSchema),
  asyncHandler(async (req, res) => {
    const { name, serverType, location, image, billingCycle } = req.body as {
      name: string;
      serverType: string;
      location: string;
      image: string;
      billingCycle: 'monthly' | 'quarterly' | 'annually';
    };

    // 1) Server type'ı doğrula + fiyatı sunucu tarafında hesapla.
    const types = await HetznerService.listServerTypes();
    const type = types.find((t) => t.name === serverType);
    if (!type) throw ApiError.badRequest(`Geçersiz sunucu tipi: ${serverType}`);
    const priceRow = type.prices.find((p) => p.location === location) ?? type.prices[0];
    if (!priceRow) throw ApiError.badRequest('Bu konum için fiyat bulunamadı');
    const price = Math.round(Number(priceRow.price_monthly.gross) * MARKUP * 100) / 100;

    // 2) Hetzner'da sunucuyu oluştur. Benzersiz ad (Hetzner ad çakışmasını önle).
    const hetznerName = `${slugify(name)}-${Date.now().toString(36)}`;
    const { server, rootPassword } = await HetznerService.createServer({
      name: hetznerName,
      serverType,
      image,
      location,
      startAfterCreate: true,
    });

    // 3) Servis kaydını oluştur.
    const service = await Service.create({
      userId: req.user!.sub,
      type: 'vps',
      name,
      status: 'active',
      hetznerId: server.id,
      hetznerIp: server.public_net?.ipv4?.ip ?? null,
      hetznerIpv6: server.public_net?.ipv6?.ip ?? null,
      hetznerPlan: serverType,
      hetznerLocation: location,
      hetznerOs: image,
      price,
      billingCycle,
      nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await logActivity({
      userId: req.user!.sub,
      action: 'service.vps_create',
      resource: 'service',
      resourceId: service.id,
      details: { hetznerId: server.id, serverType, location },
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        service,
        // root parolası YALNIZCA burada bir kez döner (SSH key verilmediğinde).
        rootPassword,
      },
      message: 'VPS oluşturuldu. Sunucu birkaç dakika içinde hazır olacak.',
    });
  }),
);

// --- DELETE /services/:id — servis sonlandır (Hetzner sunucusunu da sil) ---
servicesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = await getOwnedService(req.params.id, req.user!.sub, req.user!.role === 'admin');

    // VPS ise Hetzner'daki sunucuyu da kalıcı sil.
    if (service.type === 'vps' && service.hetznerId) {
      await HetznerService.deleteServer(service.hetznerId);
    }
    service.status = 'terminated';
    await service.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'service.terminate',
      resource: 'service',
      resourceId: service.id,
      details: { hetznerId: service.hetznerId },
      ip: req.ip,
    });
    res.json({ success: true, message: 'Servis sonlandırıldı' });
  }),
);

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
