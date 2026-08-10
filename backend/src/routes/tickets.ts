import { Router } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { Ticket, TicketReply, Service, User } from '../models';
import { validate } from '../middleware/validate';
import { ticketLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { TicketService } from '../services/TicketService';
import { NotificationService } from '../services/NotificationService';

/**
 * Müşteri destek talepleri.
 * routes/index.ts içinde `authenticate` ile korunur → req.user mevcut.
 * Müşteri yalnızca kendi taleplerini görür; admin yönetimi /admin/tickets altındadır.
 */
export const ticketsRouter = Router();

/** Talebi sahiplik kontrolüyle getirir. */
async function getOwnedTicket(ticketId: string, userId: string): Promise<Ticket> {
  const ticket = await Ticket.findByPk(ticketId);
  // Başkasının talebi de "bulunamadı" döner — varlık sızdırılmaz.
  if (!ticket || ticket.userId !== userId) throw ApiError.notFound('Talep bulunamadı');
  return ticket;
}

// --- GET /tickets — kendi taleplerim ---
const listSchema = z.object({
  query: z.object({
    status: z.enum(['open', 'closed', 'all']).default('all'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

ticketsRouter.get(
  '/',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const filter = (req.query.status as string) || 'all';

    const where: Record<string, unknown> = { userId: req.user!.sub };
    if (filter === 'open') where.status = { [Op.in]: ['open', 'answered', 'customer_reply'] };
    else if (filter === 'closed') where.status = 'closed';

    const { rows, count } = await Ticket.findAndCountAll({
      where,
      include: [{ model: Service, as: 'service', attributes: ['id', 'name', 'type'] }],
      order: [
        ['lastReply', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
    });

    res.json({
      success: true,
      data: rows,
      meta: { total: count, page, limit, pages: Math.ceil(count / limit) },
    });
  }),
);

// --- POST /tickets — yeni talep ---
const createSchema = z.object({
  body: z.object({
    subject: z.string().min(5).max(200),
    message: z.string().min(10).max(10000),
    department: z.enum(['sales', 'support', 'billing', 'abuse']).default('support'),
    // 'urgent' bilinçli olarak yok — aciliyeti destek ekibi belirler.
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    serviceId: z.string().uuid().nullable().optional(),
  }),
});

ticketsRouter.post(
  '/',
  ticketLimiter,
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { subject, message, department, priority, serviceId } = req.body as {
      subject: string;
      message: string;
      department: 'sales' | 'support' | 'billing' | 'abuse';
      priority: 'low' | 'medium' | 'high';
      serviceId?: string | null;
    };
    const userId = req.user!.sub;

    // Talep bir hizmete bağlanacaksa hizmet müşteriye ait olmalı.
    if (serviceId) {
      const service = await Service.findOne({ where: { id: serviceId, userId } });
      if (!service) throw ApiError.notFound('Hizmet bulunamadı');
    }

    const ticket = await TicketService.create({
      userId,
      subject,
      message,
      department,
      priority,
      serviceId: serviceId ?? null,
    });

    await logActivity({
      userId,
      action: 'ticket.create',
      resource: 'ticket',
      resourceId: ticket.id,
      details: { ticketNum: ticket.ticketNum, department, priority },
      ip: req.ip,
    });

    const user = await User.findByPk(userId);
    if (user) {
      await NotificationService.sendTicketCreated({
        to: user.email,
        firstName: user.firstName,
        ticketId: ticket.id,
        ticketNum: ticket.ticketNum,
        subject: ticket.subject,
      });
      await NotificationService.sendTicketToStaff({
        to: await TicketService.adminRecipients(),
        ticketId: ticket.id,
        ticketNum: ticket.ticketNum,
        subject: ticket.subject,
        message,
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        isNew: true,
        priority,
      });
    }

    res.status(201).json({ success: true, data: ticket });
  }),
);

// --- GET /tickets/:id — talep detayı + yazışma ---
ticketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await getOwnedTicket(req.params.id, req.user!.sub);

    const replies = await TicketReply.findAll({
      // AI taslakları yalnızca admin tarafında görünür.
      where: { ticketId: ticket.id, isAiSuggestion: false },
      include: [{ model: User, as: 'author', attributes: ['id', 'firstName', 'lastName', 'role'] }],
      order: [['createdAt', 'ASC']],
    });

    const service = ticket.serviceId
      ? await Service.findByPk(ticket.serviceId, { attributes: ['id', 'name', 'type'] })
      : null;

    res.json({ success: true, data: { ...ticket.toJSON(), service, replies } });
  }),
);

// --- POST /tickets/:id/replies — talebe yanıt yaz ---
const replySchema = z.object({
  body: z.object({ message: z.string().min(2).max(10000) }),
});

ticketsRouter.post(
  '/:id/replies',
  validate(replySchema),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const ticket = await getOwnedTicket(req.params.id, userId);
    const { message } = req.body as { message: string };

    const reply = await TicketReply.create({
      ticketId: ticket.id,
      userId,
      message,
      isAdmin: false,
    });

    // Kapalı talebe yazmak onu yeniden açar — müşteri yeni talep açmak zorunda kalmasın.
    const wasClosed = ticket.status === 'closed';
    ticket.status = 'customer_reply';
    ticket.lastReply = new Date();
    await ticket.save();

    await logActivity({
      userId,
      action: wasClosed ? 'ticket.reopen' : 'ticket.reply',
      resource: 'ticket',
      resourceId: ticket.id,
      details: { ticketNum: ticket.ticketNum },
      ip: req.ip,
    });

    const user = await User.findByPk(userId);
    if (user) {
      await NotificationService.sendTicketToStaff({
        to: await TicketService.adminRecipients(),
        ticketId: ticket.id,
        ticketNum: ticket.ticketNum,
        subject: ticket.subject,
        message,
        customerName: `${user.firstName} ${user.lastName}`,
        customerEmail: user.email,
        isNew: false,
        priority: ticket.priority,
      });
    }

    res.status(201).json({ success: true, data: reply, meta: { reopened: wasClosed } });
  }),
);

// --- POST /tickets/:id/close — talebi kapat ---
ticketsRouter.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const ticket = await getOwnedTicket(req.params.id, req.user!.sub);
    if (ticket.status === 'closed') {
      res.json({ success: true, data: ticket });
      return;
    }

    ticket.status = 'closed';
    await ticket.save();

    await logActivity({
      userId: req.user!.sub,
      action: 'ticket.close',
      resource: 'ticket',
      resourceId: ticket.id,
      details: { ticketNum: ticket.ticketNum, by: 'customer' },
      ip: req.ip,
    });

    res.json({ success: true, data: ticket });
  }),
);
