import { Router } from 'express';
import { z } from 'zod';
import { Server } from '../models';
import { WHMService } from '../services/WHMService';
import { ServerManager } from '../services/ServerManager';
import { encrypt } from '../security/encryption';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Sunucu yönetimi (yalnızca admin — routes/index.ts'te requireAdmin ile korunur).
 * whm_token AES-256-GCM ile şifreli saklanır ve yanıtlarda ASLA döndürülmez.
 */
export const serversRouter = Router();

const SAFE_ATTRS = { exclude: ['whmToken'] };

// --- GET /servers — tüm sunucular ---
serversRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const servers = await Server.findAll({ attributes: SAFE_ATTRS, order: [['name', 'ASC']] });
    res.json({ success: true, data: servers });
  }),
);

// --- GET /servers/:id ---
serversRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const server = await Server.findByPk(req.params.id, { attributes: SAFE_ATTRS });
    if (!server) throw ApiError.notFound('Sunucu bulunamadı');
    res.json({ success: true, data: server });
  }),
);

const serverBodySchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['dedicated', 'vps']),
  provider: z.enum(['hetzner_dedicated', 'hetzner_cloud']),
  ipAddress: z.string().max(45).optional(),
  location: z.string().max(10).optional(),
  purpose: z.enum(['hosting', 'vps', 'mixed']).default('mixed'),
  whmHost: z.string().max(255).optional(),
  whmPort: z.number().int().positive().default(2087),
  whmUser: z.string().max(100).default('root'),
  whmToken: z.string().optional(), // düz metin alınır, şifreli saklanır
  diskThreshold: z.number().int().min(1).max(100).default(80),
  accountLimit: z.number().int().nonnegative().default(0),
  acceptsNew: z.boolean().default(true),
});

// --- POST /servers — yeni sunucu ---
serversRouter.post(
  '/',
  validate(z.object({ body: serverBodySchema })),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof serverBodySchema>;
    const server = await Server.create({
      ...body,
      whmToken: body.whmToken ? encrypt(body.whmToken) : null,
    });
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.server_create',
      resource: 'server',
      resourceId: server.id,
      ip: req.ip,
    });
    const safe = await Server.findByPk(server.id, { attributes: SAFE_ATTRS });
    res.status(201).json({ success: true, data: safe });
  }),
);

// --- PUT /servers/:id ---
serversRouter.put(
  '/:id',
  validate(z.object({ body: serverBodySchema.partial() })),
  asyncHandler(async (req, res) => {
    const server = await Server.findByPk(req.params.id);
    if (!server) throw ApiError.notFound('Sunucu bulunamadı');

    const body = req.body as Partial<z.infer<typeof serverBodySchema>>;
    const { whmToken, ...rest } = body;
    server.set(rest);
    if (whmToken !== undefined) server.whmToken = whmToken ? encrypt(whmToken) : null;
    await server.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.server_update',
      resource: 'server',
      resourceId: server.id,
      ip: req.ip,
    });
    const safe = await Server.findByPk(server.id, { attributes: SAFE_ATTRS });
    res.json({ success: true, data: safe });
  }),
);

// --- DELETE /servers/:id ---
serversRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const server = await Server.findByPk(req.params.id);
    if (!server) throw ApiError.notFound('Sunucu bulunamadı');
    await server.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.server_delete',
      resource: 'server',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Sunucu silindi' });
  }),
);

// --- POST /servers/:id/sync — kapasite senkronu ---
serversRouter.post(
  '/:id/sync',
  asyncHandler(async (req, res) => {
    const server = await Server.findByPk(req.params.id);
    if (!server) throw ApiError.notFound('Sunucu bulunamadı');
    await ServerManager.syncServer(server);
    const safe = await Server.findByPk(server.id, { attributes: SAFE_ATTRS });
    res.json({ success: true, data: safe });
  }),
);

// --- POST /servers/:id/test — WHM bağlantı testi ---
serversRouter.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const server = await Server.findByPk(req.params.id);
    if (!server) throw ApiError.notFound('Sunucu bulunamadı');
    const ok = await WHMService.forServer(server).healthcheck();
    res.json({ success: true, data: { connected: ok } });
  }),
);
