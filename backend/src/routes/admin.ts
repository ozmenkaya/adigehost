import { Router } from 'express';
import { Op, fn, col } from 'sequelize';
import { z } from 'zod';
import { User, Service, Invoice, Ticket, Server, ActivityLog } from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

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
