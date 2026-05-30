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
} from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { ProvisioningService } from '../services/ProvisioningService';

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
    res.json({ success: true, data: services });
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
      include: [{ model: Server, as: 'server', attributes: ['id', 'name'] }],
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
  type: z.enum(['hosting', 'vps']).default('hosting'),
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

// ============ Ayarlar (banka/havale dahil) ============
adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const bank = await SettingsService.getMany(BANK_KEYS);
    res.json({ success: true, data: { bank } });
  }),
);

const settingsSchema = z.object({
  body: z.object({ bank: z.record(z.string()).optional() }),
});
adminRouter.put(
  '/settings',
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const { bank } = req.body as { bank?: Record<string, string> };
    if (bank) await SettingsService.setMany(bank, 'payment');
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
    const items = (invoice.get('items') as InvoiceItem[]) ?? [];
    const provisioned: Array<Record<string, unknown>> = [];
    for (const item of items) {
      if (!item.serviceId) continue;
      const service = await Service.findByPk(item.serviceId);
      if (!service || service.status !== 'pending') continue;
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
    }

    await logActivity({
      userId: req.user!.sub,
      action: 'admin.invoice_approve',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { provisioned: provisioned.length },
      ip: req.ip,
    });

    // TODO (e-posta): müşteriye "hosting hazır" + cPanel bilgileri (servis_hazir şablonu).

    res.json({
      success: true,
      message: 'Fatura onaylandı ve servisler aktive edildi',
      data: { provisioned },
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
