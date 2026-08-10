import { Router } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { Ticket, TicketReply, Service, User } from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { NotificationService } from '../services/NotificationService';

/**
 * Destek talepleri — yönetim tarafı.
 * routes/index.ts içinde `authenticate + requireAdmin` ile korunur.
 */
export const adminTicketsRouter = Router();

const OPEN_STATUSES = ['open', 'answered', 'customer_reply'] as const;

// --- GET /admin/tickets — tüm talepler (filtre + sayfalama) ---
const listSchema = z.object({
  query: z.object({
    status: z.enum(['open', 'answered', 'customer_reply', 'closed', 'pending', 'all']).default('all'),
    department: z.enum(['sales', 'support', 'billing', 'abuse']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    search: z.string().max(120).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

adminTicketsRouter.get(
  '/',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const status = (req.query.status as string) || 'all';
    const search = (req.query.search as string | undefined)?.trim();

    const where: Record<string, unknown> = {};
    // "pending" = yanıt bekleyenler (yeni açılan + müşterinin son yazdığı).
    if (status === 'pending') where.status = { [Op.in]: ['open', 'customer_reply'] };
    else if (status === 'open') where.status = { [Op.in]: OPEN_STATUSES };
    else if (status !== 'all') where.status = status;

    if (req.query.department) where.department = req.query.department;
    if (req.query.priority) where.priority = req.query.priority;
    if (search) {
      where[Op.or as unknown as string] = [
        { ticketNum: { [Op.like]: `%${search}%` } },
        { subject: { [Op.like]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'company'] },
        { model: Service, as: 'service', attributes: ['id', 'name', 'type'] },
      ],
      order: [
        ['lastReply', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    // Üst şeritteki sayaçlar — filtreden bağımsız.
    const [waiting, openTotal] = await Promise.all([
      Ticket.count({ where: { status: { [Op.in]: ['open', 'customer_reply'] } } }),
      Ticket.count({ where: { status: { [Op.in]: OPEN_STATUSES } } }),
    ]);

    res.json({
      success: true,
      data: rows,
      meta: { total: count, page, limit, pages: Math.ceil(count / limit), waiting, openTotal },
    });
  }),
);

// --- GET /admin/tickets/:id — detay + tüm yazışma ---
adminTicketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'status'],
        },
        { model: Service, as: 'service', attributes: ['id', 'name', 'type', 'status', 'domain'] },
      ],
    });
    if (!ticket) throw ApiError.notFound('Talep bulunamadı');

    const replies = await TicketReply.findAll({
      where: { ticketId: ticket.id },
      include: [{ model: User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'role'] }],
      order: [['createdAt', 'ASC']],
    });

    res.json({ success: true, data: { ...ticket.toJSON(), replies } });
  }),
);

// --- POST /admin/tickets/:id/replies — müşteriye yanıt ---
const replySchema = z.object({
  body: z.object({
    message: z.string().min(2).max(10000),
    close: z.boolean().default(false),
  }),
});

adminTicketsRouter.post(
  '/:id/replies',
  validate(replySchema),
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) throw ApiError.notFound('Talep bulunamadı');

    const { message, close } = req.body as { message: string; close: boolean };

    const reply = await TicketReply.create({
      ticketId: ticket.id,
      userId: req.user!.sub,
      message,
      isAdmin: true,
    });

    ticket.status = close ? 'closed' : 'answered';
    ticket.lastReply = new Date();
    await ticket.save();

    await logActivity({
      userId: req.user!.sub,
      action: 'ticket.admin_reply',
      resource: 'ticket',
      resourceId: ticket.id,
      details: { ticketNum: ticket.ticketNum, closed: close },
      ip: req.ip,
    });

    const customer = await User.findByPk(ticket.userId);
    if (customer) {
      await NotificationService.sendTicketReplied({
        to: customer.email,
        firstName: customer.firstName,
        ticketId: ticket.id,
        ticketNum: ticket.ticketNum,
        subject: ticket.subject,
        message,
        closed: close,
      });
    }

    res.status(201).json({ success: true, data: reply });
  }),
);

// --- PUT /admin/tickets/:id — durum / öncelik / departman ---
const updateSchema = z.object({
  body: z
    .object({
      status: z.enum(['open', 'answered', 'customer_reply', 'closed']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      department: z.enum(['sales', 'support', 'billing', 'abuse']).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: 'Güncellenecek alan yok' }),
});

adminTicketsRouter.put(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const ticket = await Ticket.findByPk(req.params.id);
    if (!ticket) throw ApiError.notFound('Talep bulunamadı');

    const changes = req.body as Partial<
      Pick<Ticket, 'status' | 'priority' | 'department'>
    >;
    const before = {
      status: ticket.status,
      priority: ticket.priority,
      department: ticket.department,
    };
    ticket.set(changes);
    await ticket.save();

    await logActivity({
      userId: req.user!.sub,
      action: 'ticket.update',
      resource: 'ticket',
      resourceId: ticket.id,
      details: { ticketNum: ticket.ticketNum, before, after: changes },
      ip: req.ip,
    });

    res.json({ success: true, data: ticket });
  }),
);
