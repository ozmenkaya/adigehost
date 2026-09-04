import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import { z } from 'zod';
import {
  User,
  Service,
  Invoice,
  InvoiceItem,
  Ticket,
  Server,
  ActivityLog,
  Product,
  Category,
} from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { logActivity } from '../services/AuditService';
import { SettingsService, BANK_KEYS, COMPANY_KEYS, DOMAIN_KEYS, VPS_KEYS } from '../services/SettingsService';
import { ProvisioningService } from '../services/ProvisioningService';
import { ServiceLifecycleService } from '../services/ServiceLifecycleService';
import { sanitizeService } from './services';
import { EInvoiceService } from '../services/EInvoiceService';
import { WHMService } from '../services/WHMService';
import { InvoiceService } from '../services/InvoiceService';
import { NotificationService } from '../services/NotificationService';
import { nextDueAfterPayment } from '../utils/helpers';
import { hashPassword } from '../security/password';
import { randomBytes } from 'node:crypto';

/**
 * Admin paneli uçları (routes/index.ts'te requireAdmin ile korunur).
 */
export const adminRouter = Router();

// --- GET /admin/dashboard — özet istatistikler ---
adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [
      totalClients,
      activeServices,
      pendingServices,
      openTickets,
      servers,
      unpaidAgg,
      monthlyRevenueAgg,
    ] = await Promise.all([
      User.count({ where: { role: 'client' } }),
      Service.count({ where: { status: 'active' } }),
      Service.count({ where: { status: 'pending' } }),
      Ticket.count({ where: { status: { [Op.in]: ['open', 'customer_reply'] } } }),
      Server.count(),
      Invoice.sum('total', { where: { status: { [Op.in]: ['unpaid', 'overdue'] } } }),
      Invoice.sum('total', {
        where: {
          status: 'paid',
          paidAt: { [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    const servicesByType = await Service.findAll({
      attributes: ['type', [fn('COUNT', col('id')), 'count']],
      where: { status: 'active' },
      group: ['type'],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        totalClients,
        activeServices,
        pendingServices,
        openTickets,
        servers,
        unpaidTotal: Number(unpaidAgg ?? 0),
        monthlyRevenue: Number(monthlyRevenueAgg ?? 0),
        servicesByType,
      },
    });
  }),
);

// --- GET /admin/clients — müşteri listesi (arama + sayfalama) ---
const listQuerySchema = z.object({
  query: z.object({
    search: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

adminRouter.get(
  '/clients',
  validate(listQuerySchema),
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const where: Record<string, unknown> = { role: 'client' };
    if (search) {
      where[Op.or as unknown as string] = [
        { email: { [Op.like]: `%${search}%` } },
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { company: { [Op.like]: `%${search}%` } },
      ];
    }
    const { rows, count } = await User.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['createdAt', 'DESC']],
    });
    res.json({
      success: true,
      data: rows,
      meta: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  }),
);

// --- POST /admin/clients — yeni müşteri oluştur ---
const createClientSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(100),
    lastName: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(128).optional(),
    phone: z.string().max(30).optional(),
    identityType: z.enum(['individual', 'corporate']).default('individual'),
    taxNumber: z.string().max(20).optional(),
    taxOffice: z.string().max(100).optional(),
    company: z.string().max(150).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    district: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
  }),
});

adminRouter.post(
  '/clients',
  validate(createClientSchema),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createClientSchema>['body'];
    const existing = await User.findOne({ where: { email: b.email } });
    if (existing) throw ApiError.conflict('Bu e-posta zaten kayıtlı');

    const plainPassword = b.password ?? randomBytes(9).toString('base64url');
    const user = await User.create({
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email,
      password: await hashPassword(plainPassword),
      phone: b.phone ?? null,
      identityType: b.identityType,
      taxNumber: b.taxNumber ?? null,
      taxOffice: b.taxOffice ?? null,
      company: b.company ?? null,
      address: b.address ?? null,
      city: b.city ?? null,
      district: b.district ?? null,
      postalCode: b.postalCode ?? null,
      role: 'client',
      status: 'active',
      emailVerified: true,
    });
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.client_create',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.status(201).json({
      success: true,
      data: { id: user.id, email: user.email },
      // Şifre admin tarafından belirlenmediyse bir kez gösterilir.
      ...(b.password ? {} : { generatedPassword: plainPassword }),
    });
  }),
);

// --- GET /admin/clients/:id — müşteri detayı ---
adminRouter.get(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Service, as: 'services' },
        { model: Invoice, as: 'invoices' },
      ],
    });
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');
    res.json({ success: true, data: user });
  }),
);

// --- PUT /admin/clients/:id — müşteri bilgilerini düzenle ---
const updateClientSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(100).optional(),
    lastName: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(30).optional().nullable(),
    identityType: z.enum(['individual', 'corporate']).optional(),
    taxNumber: z.string().max(20).optional().nullable(),
    taxOffice: z.string().max(100).optional().nullable(),
    company: z.string().max(150).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
    district: z.string().max(100).optional().nullable(),
    postalCode: z.string().max(20).optional().nullable(),
  }),
});

adminRouter.put(
  '/clients/:id',
  validate(updateClientSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');
    if (user.role === 'admin') throw ApiError.forbidden('Admin hesabı düzenlenemez');
    const b = req.body as z.infer<typeof updateClientSchema>['body'];

    // E-posta değişiyorsa benzersizlik kontrolü.
    if (b.email && b.email !== user.email) {
      const dup = await User.findOne({ where: { email: b.email } });
      if (dup) throw ApiError.conflict('Bu e-posta zaten kayıtlı');
    }

    const fields = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'identityType',
      'taxNumber',
      'taxOffice',
      'company',
      'address',
      'city',
      'district',
      'postalCode',
    ] as const;
    for (const f of fields) {
      if (b[f] !== undefined) (user as unknown as Record<string, unknown>)[f] = b[f] ?? null;
    }
    await user.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.client_update',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.json({ success: true, data: user });
  }),
);

// --- DELETE /admin/clients/:id — müşteri sil (fatura/hizmet yoksa) ---
adminRouter.delete(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');
    if (user.role === 'admin') throw ApiError.forbidden('Admin hesabı silinemez');

    // Yasal saklama (VUK/KVKK): faturası olan müşteri kalıcı silinemez → askıya alın.
    const invoiceCount = await Invoice.count({ where: { userId: user.id } });
    if (invoiceCount > 0) {
      throw ApiError.conflict(
        `Bu müşterinin ${invoiceCount} faturası var; yasal saklama nedeniyle silinemez. ` +
          'Bunun yerine "Askıya Al" kullanın.',
      );
    }
    const serviceCount = await Service.count({ where: { userId: user.id } });
    if (serviceCount > 0) {
      throw ApiError.conflict(
        `Bu müşterinin ${serviceCount} hizmeti var; önce hizmetleri iptal edin.`,
      );
    }

    await user.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.client_delete',
      resource: 'user',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, data: { id: req.params.id } });
  }),
);

// --- PUT /admin/clients/:id/suspend — askıya al / aktifleştir ---
const suspendSchema = z.object({ body: z.object({ suspend: z.boolean() }) });
adminRouter.put(
  '/clients/:id/suspend',
  validate(suspendSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.params.id);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');
    if (user.role === 'admin') throw ApiError.forbidden('Admin hesabı askıya alınamaz');
    user.status = req.body.suspend ? 'suspended' : 'active';
    await user.save();
    await logActivity({
      userId: req.user!.sub,
      action: req.body.suspend ? 'admin.client_suspend' : 'admin.client_unsuspend',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.json({ success: true, data: { id: user.id, status: user.status } });
  }),
);

// --- GET /admin/services — tüm servisler ---
adminRouter.get(
  '/services',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const services = await Service.findAll({
      where: status ? { status } : undefined,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    // Hassas alanları (config.rootPasswordEnc) ayıkla — admin panelinde de sızmasın.
    res.json({ success: true, data: services.map(sanitizeService) });
  }),
);

// --- PUT /admin/services/:id/status — servisi askıya al / aktive / sonlandır ---
// Altyapıya (Hetzner/WHM) gerçekten dokunur; ServiceLifecycleService üzerinden.
const serviceActionSchema = z.object({
  body: z.object({
    action: z.enum(['suspend', 'unsuspend', 'terminate']),
    reason: z.string().max(255).optional(),
  }),
});
adminRouter.put(
  '/services/:id/status',
  validate(serviceActionSchema),
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service) throw ApiError.notFound('Servis bulunamadı');
    const { action } = req.body as { action: 'suspend' | 'unsuspend' | 'terminate'; reason?: string };
    const reason = (req.body.reason as string | undefined) ?? 'Yönetici işlemi';

    let acted = false;
    if (action === 'suspend') acted = await ServiceLifecycleService.suspend(service.id, reason);
    else if (action === 'unsuspend') acted = await ServiceLifecycleService.unsuspend(service.id);
    else acted = await ServiceLifecycleService.terminate(service.id, reason);

    await logActivity({
      userId: req.user!.sub,
      action: `admin.service_${action}`,
      resource: 'service',
      resourceId: service.id,
      details: { reason, acted },
      ip: req.ip,
    });

    await service.reload();
    res.json({ success: true, data: { id: service.id, status: service.status, acted } });
  }),
);

// --- GET /admin/tickets — tüm talepler ---
adminRouter.get(
  '/tickets',
  asyncHandler(async (_req, res) => {
    const tickets = await Ticket.findAll({
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['updatedAt', 'DESC']],
      limit: 200,
    });
    res.json({ success: true, data: tickets });
  }),
);

// --- GET /admin/invoices — tüm faturalar ---
adminRouter.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const invoices = await Invoice.findAll({
      where: status ? { status } : undefined,
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    res.json({ success: true, data: invoices });
  }),
);

// --- POST /admin/invoices — müşteriye elle fatura oluştur (ödenmemiş) ---
const createInvoiceSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Geçerli bir müşteri seçin'),
    items: z
      .array(
        z.object({
          description: z.string().min(1).max(255),
          quantity: z.coerce.number().int().min(1).max(1000).default(1),
          unitPrice: z.coerce.number().min(0).max(1_000_000),
        }),
      )
      .min(1, 'En az bir kalem gerekli'),
    notes: z.string().max(500).optional(),
    dueDays: z.coerce.number().int().min(0).max(365).optional(),
  }),
});

adminRouter.post(
  '/invoices',
  validate(createInvoiceSchema),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createInvoiceSchema>['body'];
    const user = await User.findByPk(b.userId);
    if (!user || user.role === 'admin') throw ApiError.badRequest('Geçersiz müşteri');

    const invoice = await InvoiceService.createManual(b.userId, b.items, {
      notes: b.notes,
      dueDays: b.dueDays,
    });
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.invoice_create',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { userId: b.userId, total: invoice.total },
      ip: req.ip,
    });

    // Müşteriye "fatura oluşturuldu, ödeme bekleniyor" bildirimi — arka planda.
    void (async () => {
      try {
        const invoiceWithItems = await Invoice.findByPk(invoice.id, {
          include: [{ model: InvoiceItem, as: 'items' }],
        });
        const items = ((invoiceWithItems?.get('items') as InvoiceItem[]) ?? []).map((it) => ({
          description: it.description,
          quantity: it.quantity ?? 1,
          unitPrice: Number(it.unitPrice),
          total: Number(it.total),
        }));
        await NotificationService.sendInvoiceCreated({
          to: user.email,
          firstName: user.firstName,
          invoiceNum: invoice.invoiceNum,
          items,
          subtotal: Number(invoice.subtotal),
          tax: Number(invoice.tax),
          total: Number(invoice.total),
          dueDate: new Date(invoice.dueDate),
        });
      } catch (err) {
        logger.error('Fatura bildirimi gönderilemedi', { error: (err as Error).message });
      }
    })();

    res.status(201).json({ success: true, data: invoice });
  }),
);

// --- GET /admin/invoices/:id — fatura detayı (kalemler + müşteri) ---
adminRouter.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        { model: InvoiceItem, as: 'items' },
        { model: User, as: 'user' },
      ],
    });
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    res.json({ success: true, data: invoice });
  }),
);

// --- GET /admin/logs — aktivite logları ---
adminRouter.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const logs = await ActivityLog.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
    });
    res.json({ success: true, data: logs });
  }),
);

// ============ Ürünler / Paketler ============

// --- GET /admin/products — tüm ürünler (pasif dahil) ---
adminRouter.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const products = await Product.findAll({
      include: [
        { model: Server, as: 'server', attributes: ['id', 'name'] },
        { model: Category, as: 'category', attributes: ['id', 'name'] },
      ],
      order: [
        ['type', 'ASC'],
        ['sortOrder', 'ASC'],
      ],
    });
    res.json({ success: true, data: products });
  }),
);

const productSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(['hosting', 'vps', 'website', 'email']).default('hosting'),
  categoryId: z.string().uuid().nullable().optional(),
  whmPackage: z.string().max(120).optional(),
  serverId: z.string().uuid().nullable().optional(),
  priceMonthly: z.number().nonnegative(),
  priceAnnually: z.number().nonnegative().nullable().optional(),
  setupFee: z.number().nonnegative().default(0),
  specs: z.record(z.unknown()).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

adminRouter.post(
  '/products',
  validate(z.object({ body: productSchema })),
  asyncHandler(async (req, res) => {
    const product = await Product.create(req.body);
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.product_create',
      resource: 'product',
      resourceId: product.id,
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: product });
  }),
);

adminRouter.put(
  '/products/:id',
  validate(z.object({ body: productSchema.partial() })),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) throw ApiError.notFound('Ürün bulunamadı');
    product.set(req.body);
    await product.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.product_update',
      resource: 'product',
      resourceId: product.id,
      ip: req.ip,
    });
    res.json({ success: true, data: product });
  }),
);

adminRouter.delete(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) throw ApiError.notFound('Ürün bulunamadı');
    await product.destroy();
    res.json({ success: true, message: 'Ürün silindi' });
  }),
);

// ============ Kategoriler ============

/** Ada göre URL/anahtar dostu slug üret. */
function slugify(name: string): string {
  const map: Record<string, string> = {
    ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u',
  };
  return name
    .trim()
    .toLowerCase()
    .replace(/[çğıİöşü]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'kategori';
}

// --- GET /admin/categories — tüm kategoriler (ürün sayısı ile) ---
adminRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await Category.findAll({
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    });
    res.json({ success: true, data: categories });
  }),
);

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminRouter.post(
  '/categories',
  validate(z.object({ body: categorySchema })),
  asyncHandler(async (req, res) => {
    const base = slugify(req.body.name);
    // Slug benzersizliğini garanti et
    let slug = base;
    for (let i = 2; await Category.findOne({ where: { slug } }); i += 1) {
      slug = `${base}-${i}`;
    }
    const category = await Category.create({ ...req.body, slug });
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.category_create',
      resource: 'category',
      resourceId: category.id,
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: category });
  }),
);

adminRouter.put(
  '/categories/:id',
  validate(z.object({ body: categorySchema.partial() })),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.params.id);
    if (!category) throw ApiError.notFound('Kategori bulunamadı');
    category.set(req.body);
    await category.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.category_update',
      resource: 'category',
      resourceId: category.id,
      ip: req.ip,
    });
    res.json({ success: true, data: category });
  }),
);

adminRouter.delete(
  '/categories/:id',
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.params.id);
    if (!category) throw ApiError.notFound('Kategori bulunamadı');
    // Bağlı ürünleri silme — sadece kategorisiz bırak
    await Product.update({ categoryId: null }, { where: { categoryId: category.id } });
    await category.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.category_delete',
      resource: 'category',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Kategori silindi' });
  }),
);

// ============ Ayarlar (banka/havale dahil) ============
adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const [bank, company, domain, vps] = await Promise.all([
      SettingsService.getMany(BANK_KEYS),
      SettingsService.getMany(COMPANY_KEYS),
      SettingsService.getMany(DOMAIN_KEYS),
      SettingsService.getMany(VPS_KEYS),
    ]);
    res.json({ success: true, data: { bank, company, domain, vps } });
  }),
);

const settingsSchema = z.object({
  body: z.object({
    bank: z.record(z.string()).optional(),
    company: z.record(z.string()).optional(),
    domain: z.record(z.string()).optional(),
    vps: z.record(z.string()).optional(),
  }),
});
adminRouter.put(
  '/settings',
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const { bank, company, domain, vps } = req.body as {
      bank?: Record<string, string>;
      company?: Record<string, string>;
      domain?: Record<string, string>;
      vps?: Record<string, string>;
    };
    if (bank) await SettingsService.setMany(bank, 'payment');
    if (company) await SettingsService.setMany(company, 'company');
    if (domain) await SettingsService.setMany(domain, 'pricing');
    if (vps) await SettingsService.setMany(vps, 'pricing');
    await logActivity({ userId: req.user!.sub, action: 'admin.settings_update', ip: req.ip });
    res.json({ success: true, message: 'Ayarlar kaydedildi' });
  }),
);

// ============ Fatura onayı + provisioning (havale/EFT) ============
adminRouter.post(
  '/invoices/:id/approve',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: InvoiceItem, as: 'items' }],
    });
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (invoice.status === 'paid') throw ApiError.conflict('Fatura zaten ödenmiş');

    // Faturayı ödendi işaretle (havale/EFT).
    invoice.status = 'paid';
    invoice.paidAt = new Date();
    invoice.paymentMethod = 'bank_transfer';
    await invoice.save();

    // Faturaya bağlı bekleyen servisleri provision et (hosting → cPanel, vps → Hetzner).
    // Yenileme siparişiyse (notes'ta RENEWAL:<years>:<svcId>) renewDomain çağrılır.
    const items = (invoice.get('items') as InvoiceItem[]) ?? [];
    const provisioned: Array<Record<string, unknown>> = [];
    // Aynı servis birden çok kalemde geçebilir (ör. web sitesi = kurulum + abonelik).
    // Servisi bir kez işle; yoksa dönem iki kez ilerletilir.
    const handledServices = new Set<string>();
    for (const item of items) {
      if (!item.serviceId || handledServices.has(item.serviceId)) continue;
      handledServices.add(item.serviceId);
      const service = await Service.findByPk(item.serviceId);
      if (!service) continue;

      const renewMatch = /RENEWAL:(\d+):([\w-]+)/.exec(invoice.notes ?? '');
      const transferMatch = /TRANSFER:(\d+):([\w-]+)/.exec(invoice.notes ?? '');
      const isRenewal = renewMatch !== null && renewMatch[2] === service.id && service.type === 'domain';
      const isTransfer = transferMatch !== null && transferMatch[2] === service.id && service.type === 'domain';

      try {
        if (isRenewal) {
          const years = Number(renewMatch![1]);
          const result = await ProvisioningService.renewDomain(service, years);
          provisioned.push({ serviceId: service.id, type: 'domain_renew', years, ...result });
        } else if (isTransfer) {
          const years = Number(transferMatch![1]);
          const result = await ProvisioningService.transferDomain(service, years);
          provisioned.push({ serviceId: service.id, type: 'domain_transfer', years, ...result });
        } else if (service.status === 'pending') {
          if (service.type === 'hosting') {
            const result = await ProvisioningService.provisionHosting(service);
            provisioned.push({ serviceId: service.id, type: 'hosting', ...result });
          } else if (service.type === 'vps') {
            const result = await ProvisioningService.provisionVps(service);
            provisioned.push({ serviceId: service.id, type: 'vps', ...result });
          } else if (service.type === 'domain') {
            const result = await ProvisioningService.provisionDomain(service);
            provisioned.push({ serviceId: service.id, type: 'domain', ...result });
          }
        } else if (service.status === 'suspended') {
          // Ödenmemiş fatura yüzünden askıya alınmış servis → ödeme onaylandı, geri aç + dönemi ilerlet.
          await ServiceLifecycleService.unsuspend(service.id);
          const due = service.nextDue ? new Date(service.nextDue as unknown as string) : null;
          service.nextDue = nextDueAfterPayment(due, service.billingCycle);
          await service.save();
          provisioned.push({ serviceId: service.id, type: 'reactivated' });
        } else if (service.status === 'active') {
          // Aktif servisin yenileme faturası onaylandı → dönemi ileri al.
          const due = service.nextDue ? new Date(service.nextDue as unknown as string) : null;
          service.nextDue = nextDueAfterPayment(due, service.billingCycle);
          await service.save();
          provisioned.push({ serviceId: service.id, type: 'renewed' });
        }
      } catch (e) {
        logger.error('Approve provisioning hatası', {
          service: service.id, isRenewal, error: (e as Error).message,
        });
      }
    }

    await logActivity({
      userId: req.user!.sub,
      action: 'admin.invoice_approve',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { provisioned: provisioned.length },
      ip: req.ip,
    });

    // E-belge kesimi (e-fatura/e-arşiv) — başarısızlık onayı/provisioning'i bozmaz.
    let einvoice: { type: string; uuid?: string } | { error: string } | null = null;
    try {
      einvoice = await EInvoiceService.issueForInvoice(invoice.id);
    } catch (err) {
      einvoice = { error: (err as Error).message };
      logger.error('E-belge kesilemedi', { invoice: invoice.id, error: (err as Error).message });
    }

    // ── E-posta bildirimi: ödeme onaylandı + servis + e-belge ──────────────
    void (async () => {
      try {
        const user = await User.findByPk(invoice.userId);
        if (!user) return;
        const invoiceWithItems = await Invoice.findByPk(invoice.id, {
          include: [{ model: InvoiceItem, as: 'items' }],
        });
        const items = ((invoiceWithItems?.get('items') as InvoiceItem[]) ?? []).map((it) => ({
          description: it.description,
          quantity: it.quantity ?? 1,
          unitPrice: Number(it.unitPrice),
          total: Number(it.total),
        }));
        await NotificationService.sendInvoicePaid({
          to: user.email,
          firstName: user.firstName,
          invoiceNum: invoice.invoiceNum,
          items,
          subtotal: Number(invoice.subtotal),
          tax: Number(invoice.tax),
          total: Number(invoice.total),
          paidAt: invoice.paidAt ?? new Date(),
          einvoice:
            einvoice && 'type' in einvoice
              ? { type: einvoice.type as 'efatura' | 'earsiv', id: invoice.edmInvoiceId ?? undefined }
              : null,
          provisioned: provisioned.map((p) => ({
            type: String(p.type ?? ''),
            domain: p.domain ? String(p.domain) : undefined,
            cpanelUser: p.cpanelUser ? String(p.cpanelUser) : undefined,
            cpanelUrl: p.cpanelUrl ? String(p.cpanelUrl) : undefined,
            ipAddress: p.ipAddress ? String(p.ipAddress) : undefined,
            ipv6: p.ipv6 ? String(p.ipv6) : undefined,
            password: p.rootPassword ? String(p.rootPassword) : undefined,
            sshKeyUsed: p.sshKeyUsed === true,
          })),
        });
      } catch (err) {
        logger.error('Ödeme bildirimi gönderilemedi', { error: (err as Error).message });
      }
    })();

    res.json({
      success: true,
      message: 'Fatura onaylandı ve servisler aktive edildi',
      data: { provisioned, einvoice },
    });
  }),
);

// --- GET /admin/activity-summary — son 7 gün kayıt grafiği ---
adminRouter.get(
  '/activity-summary',
  asyncHandler(async (_req, res) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await User.findAll({
      attributes: [
        [fn('DATE', col('created_at')), 'date'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { createdAt: { [Op.gte]: since }, role: 'client' },
      group: [fn('DATE', col('created_at'))],
      order: [[fn('DATE', col('created_at')), 'ASC']],
      raw: true,
    });
    res.json({ success: true, data: rows });
  }),
);

// ── Senkronizasyon ────────────────────────────────────────────────────────────

/**
 * GET /admin/sync/whm
 * Tüm WHM/cPanel sunucularındaki hesapları çeker.
 * Her hesap için panelde kayıtlı olup olmadığını (service.config.cpanelUser) belirtir.
 */
adminRouter.get(
  '/sync/whm',
  asyncHandler(async (_req, res) => {
    // WHM bağlantısı olan tüm sunucuları çek (type: shared/dedicated/vps fark etmez).
    const servers = await Server.findAll({ where: { whmHost: { [Op.ne]: null } } });
    if (!servers.length) {
      res.json({ success: true, data: [], meta: { error: 'WHM bağlantılı sunucu bulunamadı.' } });
      return;
    }

    // DB'deki tüm hosting servislerinin cpanelUser'larını al.
    const existing = await Service.findAll({
      where: { type: 'hosting' },
      attributes: ['id', 'config', 'userId'],
    });
    const knownUsers = new Set(
      existing
        .map((s) => (s.config as { cpanelUser?: string } | null)?.cpanelUser)
        .filter(Boolean),
    );

    const result: unknown[] = [];
    for (const srv of servers) {
      try {
        const whm = WHMService.forServer(srv);
        const data = (await whm.listAccounts()) as { acct?: Record<string, unknown>[] };
        const accts = data?.acct ?? [];
        for (const a of accts) {
          result.push({
            serverId: srv.id,
            serverName: srv.name,
            cpanelUser: String(a.user ?? ''),
            domain: String(a.domain ?? ''),
            plan: String(a.plan ?? ''),
            diskused: String(a.diskused ?? ''),
            disklimit: String(a.disklimit ?? 'unlimited'),
            email: String(a.email ?? ''),
            suspended: Boolean(a.suspended),
            imported: knownUsers.has(String(a.user ?? '')),
          });
        }
      } catch (err) {
        logger.error('WHM sync hatası', { server: srv.id, error: (err as Error).message });
      }
    }
    res.json({ success: true, data: result });
  }),
);

/**
 * POST /admin/sync/whm/import
 * Seçilen WHM hesaplarını services tablosuna ekler.
 * userId zorunlu (hangi müşteriye ait olduğunu admin belirler).
 * cpanelUser + serverId ikilisi zaten kayıtlıysa atlanır.
 */
const whmImportSchema = z.object({
  body: z.object({
    accounts: z.array(
      z.object({
        cpanelUser: z.string().min(1).max(16),
        domain: z.string().min(1).max(253),
        serverId: z.string().uuid(),
        plan: z.string().max(64).optional(),
        userId: z.string().uuid('Müşteri ID gerekli'),
      }),
    ).min(1),
  }),
});

adminRouter.post(
  '/sync/whm/import',
  validate(whmImportSchema),
  asyncHandler(async (req, res) => {
    const { accounts } = req.body as z.infer<typeof whmImportSchema>['body'];

    // Zaten kayıtlı olanları tespit et.
    const existing = await Service.findAll({ where: { type: 'hosting' }, attributes: ['config'] });
    const knownUsers = new Set(
      existing.map((s) => (s.config as { cpanelUser?: string } | null)?.cpanelUser).filter(Boolean),
    );

    const created: string[] = [];
    const skipped: string[] = [];

    for (const acc of accounts) {
      if (knownUsers.has(acc.cpanelUser)) {
        skipped.push(acc.domain);
        continue;
      }
      await Service.create({
        userId: acc.userId,
        serverId: acc.serverId,
        type: 'hosting',
        name: acc.domain,
        domain: acc.domain,
        status: 'active',
        price: 0,
        billingCycle: 'monthly',
        nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        config: { cpanelUser: acc.cpanelUser, plan: acc.plan ?? null },
      });
      created.push(acc.domain);
    }

    await logActivity({
      userId: req.user!.sub,
      action: 'admin.sync_whm_import',
      details: { created: created.length, skipped: skipped.length },
      ip: req.ip,
    });

    res.json({
      success: true,
      data: { created, skipped },
      message: `${created.length} hesap aktarıldı, ${skipped.length} zaten kayıtlıydı.`,
    });
  }),
);

/**
 * GET /admin/sync/alantron
 * Alantron'un domain liste API'si bulunmuyor (method not implemented).
 * DB'deki domain servislerini döndürür.
 */
adminRouter.get(
  '/sync/alantron',
  asyncHandler(async (_req, res) => {
    const domains = await Service.findAll({
      where: { type: 'domain' },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }],
      order: [['createdAt', 'DESC']],
    });
    res.json({
      success: true,
      data: domains,
      meta: {
        note: 'Alantron toplu domain listeleme API\'si sunmuyor. Burada panele kayıtlı domainler gösterilir; "Alantron\'dan Güncelle" ile bitiş/kilit/NS bilgilerini tazeleyebilirsiniz.',
        apiLimited: true,
      },
    });
  }),
);

/**
 * DELETE /admin/sync/alantron/:id
 * Panelden domain kaydını sil.
 */
adminRouter.delete(
  '/sync/alantron/:id',
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service || service.type !== 'domain') throw ApiError.notFound('Domain bulunamadı');
    await service.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.domain_delete',
      resource: 'service',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Domain silindi' });
  }),
);

// ── Domain operasyonları ──────────────────────────────────────────────────────

/**
 * PUT /admin/sync/alantron/:id/assign
 * Domaini bir müşteriye ata (userId güncelle).
 */
adminRouter.put(
  '/sync/alantron/:id/assign',
  validate(z.object({ body: z.object({ userId: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service || service.type !== 'domain') throw ApiError.notFound('Domain bulunamadı');
    const user = await User.findByPk(req.body.userId);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');
    service.userId = req.body.userId;
    await service.save();
    await logActivity({ userId: req.user!.sub, action: 'admin.domain_assign', resource: 'service', resourceId: service.id, ip: req.ip });
    res.json({ success: true, message: `${service.domain} → ${user.firstName} ${user.lastName}` });
  }),
);

/**
 * POST /admin/sync/alantron/:id/renew
 * Alantron API üzerinden domain yenile.
 */
adminRouter.post(
  '/sync/alantron/:id/renew',
  validate(z.object({ body: z.object({ year: z.coerce.number().int().min(1).max(10).default(1) }) })),
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service || service.type !== 'domain') throw ApiError.notFound('Domain bulunamadı');
    const cfg = service.config as { registrycode?: number; provider?: string } | null;
    if (!cfg?.registrycode) throw ApiError.badRequest('Bu domain için registrycode kaydedilmemiş');
    if (cfg.provider !== 'alantron') throw ApiError.badRequest('Bu domain Alantron üzerinde değil');

    // Mevcut son kullanma tarihi → expepoch
    const expiryDate = service.nextDue ?? new Date();
    const expEpoch = Math.floor(expiryDate.getTime() / 1000);

    const { AlantronService } = await import('../services/AlantronService');
    const result = await AlantronService.renew(cfg.registrycode, req.body.year, expEpoch);

    // Yeni bitiş tarihini güncelle
    const newExpiry = new Date(expiryDate);
    newExpiry.setFullYear(newExpiry.getFullYear() + req.body.year);
    service.nextDue = newExpiry;
    await service.save();

    await logActivity({ userId: req.user!.sub, action: 'admin.domain_renew', resource: 'service', resourceId: service.id, details: { year: req.body.year }, ip: req.ip });
    res.json({ success: true, message: `${service.domain} ${req.body.year} yıl yenilendi`, data: result });
  }),
);

/**
 * GET /admin/sync/alantron/:id/info
 * Alantron API'den domain güncel bilgilerini çek.
 */
adminRouter.get(
  '/sync/alantron/:id/info',
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service || service.type !== 'domain') throw ApiError.notFound('Domain bulunamadı');
    const cfg = service.config as { registrycode?: number } | null;
    if (!cfg?.registrycode) throw ApiError.badRequest('Registrycode eksik');

    const { AlantronService } = await import('../services/AlantronService');
    const data = await AlantronService.getDomain(cfg.registrycode, 'all');
    res.json({ success: true, data });
  }),
);

/**
 * POST /admin/sync/alantron/:id/contacts
 * Alan adının 4 yetkilisini (owner/admin/bill/tech) bayi contact'ına çeker.
 *
 * Alantron'da alan adı, yetkilisinin kullanıcı adı altında panelde görünür.
 * Eski akış her kayıt için `c<timestamp>` kullanıcı adıyla yeni contact üretiyordu;
 * bu alan adları alantron.com panelinde bayi kullanıcı adıyla görünmüyor.
 */
adminRouter.post(
  '/sync/alantron/:id/contacts',
  validate(
    z.object({
      body: z.object({ contactId: z.coerce.number().int().positive().optional() }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const service = await Service.findByPk(req.params.id);
    if (!service || service.type !== 'domain') throw ApiError.notFound('Domain bulunamadı');
    const cfg = (service.config ?? {}) as { registrycode?: number };
    if (!cfg.registrycode) throw ApiError.badRequest('Bu domain için registrycode kaydedilmemiş');

    const { AlantronService } = await import('../services/AlantronService');
    const contactId = req.body.contactId ?? (await AlantronService.getOwnerContactId());
    await AlantronService.modifyContacts(cfg.registrycode, contactId);

    // Alantron'dan tazele → config.contacts / contactsOk güncellensin
    const full = await AlantronService.getDomainFull(cfg.registrycode).catch(() => null);
    if (full) {
      const ok = [full.contacts.owner, full.contacts.admin, full.contacts.bill, full.contacts.tech]
        .every((c) => c === contactId);
      service.set('config', { ...cfg, contacts: full.contacts, contactsOk: ok });
      await service.save();
    }

    await logActivity({
      userId: req.user!.sub,
      action: 'admin.domain_contacts_fix',
      resource: 'service',
      resourceId: service.id,
      details: { registrycode: cfg.registrycode, contactId },
      ip: req.ip,
    });
    res.json({
      success: true,
      message: `${service.domain} yetkilileri ${contactId} olarak güncellendi`,
      data: full?.contacts ?? null,
    });
  }),
);

/**
 * POST /admin/sync/alantron/refresh
 * Panele kayıtlı tüm Alantron domainlerinin bitiş tarihi / kilit / NS bilgisini
 * Alantron API'sinden tek tek çekip DB'yi günceller (toplu senkron).
 */
adminRouter.post(
  '/sync/alantron/refresh',
  asyncHandler(async (req, res) => {
    const { DomainSyncService } = await import('../services/DomainSyncService');
    const summary = await DomainSyncService.syncAlantron();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.domain_sync',
      resource: 'service',
      details: {
        updated: summary.updated,
        unchanged: summary.unchanged,
        notManaged: summary.notManaged.length,
        errors: summary.errors.length,
      },
      ip: req.ip,
    });
    res.json({ success: true, data: summary });
  }),
);
