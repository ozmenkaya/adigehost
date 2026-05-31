import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { Service, Server } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { Product } from '../models';
import { HetznerService } from '../services/HetznerService';
import { PricingService } from '../services/PricingService';
import { WHMService } from '../services/WHMService';
import { ServerManager } from '../services/ServerManager';
import { InvoiceService } from '../services/InvoiceService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { NotificationService } from '../services/NotificationService';
import { User } from '../models';
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
    // Fiyat sunucu tarafında: Hetzner EUR fiyatı → canlı kur × markup → TRY.
    const price = await PricingService.eurToSalePriceTRY(Number(priceRow.price_monthly.gross));

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

    // VPS ise Hetzner sunucusunu, hosting ise WHM cPanel hesabını kalıcı sil.
    if (service.type === 'vps' && service.hetznerId) {
      await HetznerService.deleteServer(service.hetznerId);
    } else if (service.type === 'hosting' && service.serverId) {
      const cpanelUser = (service.config as { cpanelUser?: string } | null)?.cpanelUser;
      const server = await Server.findByPk(service.serverId);
      if (cpanelUser && server) {
        await WHMService.forServer(server).terminateAccount(cpanelUser);
        server.accountCount = Math.max(0, server.accountCount - 1);
        await server.save();
      }
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

// --- POST /services/order — paket sipariş (havale/EFT akışı) ---
const orderSchema = z.object({
  body: z.object({
    productId: z.string().uuid(),
    // Hosting için alan adı; VPS için sunucu adı/etiketi.
    domain: z.string().max(253).optional(),
    name: z.string().max(100).optional(),
    billingCycle: z.enum(['monthly', 'quarterly', 'annually']).default('monthly'),
  }),
});

servicesRouter.post(
  '/order',
  validate(orderSchema),
  asyncHandler(async (req, res) => {
    const { productId, billingCycle } = req.body as {
      productId: string;
      billingCycle: 'monthly' | 'quarterly' | 'annually';
    };
    const domain = (req.body.domain as string | undefined)?.toLowerCase().trim();
    const product = await Product.findByPk(productId);
    if (!product || !product.isActive) throw ApiError.badRequest('Geçersiz veya pasif ürün');

    // Hosting için alan adı zorunlu; VPS için ad (yoksa ürün adı kullanılır).
    if (product.type === 'hosting') {
      if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
        throw ApiError.badRequest('Hosting için geçerli bir alan adı girin');
      }
    }
    const serviceName =
      product.type === 'hosting' ? domain! : (req.body.name as string) || product.name;

    // Bekleyen servis (henüz provision edilmez — ödeme onayında açılır).
    const service = await Service.create({
      userId: req.user!.sub,
      type: product.type,
      productId: product.id,
      serverId: product.serverId,
      name: serviceName,
      domain: product.type === 'hosting' ? domain : null,
      status: 'pending',
      price: Number(product.priceMonthly),
      billingCycle,
      nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const invoice = await InvoiceService.createForOrder(service, product, billingCycle);
    const bank = await SettingsService.getMany(BANK_KEYS);

    await logActivity({
      userId: req.user!.sub,
      action: 'service.order',
      resource: 'service',
      resourceId: service.id,
      details: { productId, invoiceId: invoice.id },
      ip: req.ip,
    });

    // Sipariş bildirimi — arka planda.
    void User.findByPk(req.user!.sub).then((u) => {
      if (!u) return;
      return NotificationService.sendOrderReceived({
        to: u.email,
        firstName: u.firstName,
        invoiceNum: invoice.invoiceNum,
        description: `${product.name} (${billingCycle === 'annually' ? 'Yıllık' : billingCycle === 'quarterly' ? '3 Aylık' : 'Aylık'})`,
        total: Number(invoice.total),
        dueDate: new Date(invoice.dueDate),
      }).catch(() => {});
    });

    res.status(201).json({
      success: true,
      data: { service, invoice, bank },
      message: 'Siparişiniz alındı. Havale/EFT ile ödeme sonrası hesabınız aktive edilecektir.',
    });
  }),
);

// --- POST /services/hosting — WHM/cPanel hosting provisioning ---
const createHostingSchema = z.object({
  body: z.object({
    domain: z
      .string()
      .min(3)
      .max(253)
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Geçerli bir alan adı girin'),
    plan: z.string().max(64).optional(),
    password: z.string().min(8).max(128).optional(),
    billingCycle: z.enum(['monthly', 'quarterly', 'annually']).default('monthly'),
    price: z.number().nonnegative().optional(), // admin override; aksi halde 0 (Faz 2 katalog)
  }),
});

/** Alan adından geçerli cPanel kullanıcı adı üretir (≤16, harfle başlar, [a-z0-9]). */
function generateCpanelUser(domain: string): string {
  const base = domain
    .split('.')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);
  const prefix = /^[a-z]/.test(base) ? base : `h${base}`;
  const suffix = randomBytes(2).toString('hex'); // 4 karakter
  return `${prefix}${suffix}`.slice(0, 16);
}

servicesRouter.post(
  '/hosting',
  validate(createHostingSchema),
  asyncHandler(async (req, res) => {
    const { domain, plan, billingCycle } = req.body as {
      domain: string;
      plan?: string;
      billingCycle: 'monthly' | 'quarterly' | 'annually';
      price?: number;
    };
    const isAdmin = req.user!.role === 'admin';
    const price = isAdmin && typeof req.body.price === 'number' ? req.body.price : 0;
    const password = req.body.password ?? randomBytes(12).toString('base64url');

    // 1) Uygun sunucuyu seç.
    const server = await ServerManager.getAvailableServer();

    // 2) cPanel hesabı oluştur.
    const cpanelUser = generateCpanelUser(domain);
    const whm = WHMService.forServer(server);
    await whm.createAccount({
      username: cpanelUser,
      domain,
      password,
      plan,
      contactemail: req.user!.email,
    });

    // 3) Servis kaydı + kapasite güncelle.
    const service = await Service.create({
      userId: req.user!.sub,
      serverId: server.id,
      type: 'hosting',
      name: domain,
      status: 'active',
      domain,
      price,
      billingCycle,
      nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      config: { cpanelUser, plan: plan ?? null },
    });
    server.accountCount += 1;
    await server.save();

    await logActivity({
      userId: req.user!.sub,
      action: 'service.hosting_create',
      resource: 'service',
      resourceId: service.id,
      details: { serverId: server.id, domain, cpanelUser },
      ip: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        service,
        // cPanel giriş bilgileri YALNIZCA burada bir kez döner.
        cpanel: { username: cpanelUser, password, url: `https://${server.whmHost}:2083` },
      },
      message: 'Hosting hesabı oluşturuldu',
    });
  }),
);
