import { Router } from 'express';
import { z } from 'zod';
import { IntegrationService } from '../services/IntegrationService';
import { PROVIDERS, getProvider } from '../config/integrationProviders';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';

/**
 * Entegrasyon yönetimi (admin). Sağlayıcı bağlantılarını ekle/güncelle/sil/test et.
 */
export const integrationsRouter = Router();

// --- GET /admin/integrations/providers — desteklenen sağlayıcı tanımları ---
integrationsRouter.get('/providers', (_req, res) => {
  res.json({ success: true, data: PROVIDERS });
});

// --- GET /admin/integrations — tanımlı bağlantılar (gizli alanlar maskeli) ---
integrationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await IntegrationService.listForAdmin() });
  }),
);

const bodySchema = z.object({
  body: z.object({
    provider: z.string().min(2),
    name: z.string().min(2).max(100),
    values: z.record(z.unknown()),
    isDefault: z.boolean().optional(),
  }),
});

// --- POST /admin/integrations — yeni bağlantı ---
integrationsRouter.post(
  '/',
  validate(bodySchema),
  asyncHandler(async (req, res) => {
    const { provider, name, values, isDefault } = req.body as {
      provider: string;
      name: string;
      values: Record<string, unknown>;
      isDefault?: boolean;
    };
    if (!getProvider(provider)) throw ApiError.badRequest('Geçersiz sağlayıcı');
    const integ = await IntegrationService.create(provider, name, values, isDefault);
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.integration_create',
      resource: 'integration',
      resourceId: integ.id,
      details: { provider },
      ip: req.ip,
    });
    res.status(201).json({ success: true, data: { id: integ.id } });
  }),
);

// --- PUT /admin/integrations/:id ---
const updateSchema = z.object({
  body: z.object({ name: z.string().min(2).max(100), values: z.record(z.unknown()) }),
});
integrationsRouter.put(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { name, values } = req.body as { name: string; values: Record<string, unknown> };
    await IntegrationService.update(req.params.id, name, values);
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.integration_update',
      resource: 'integration',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Güncellendi' });
  }),
);

// --- POST /admin/integrations/:id/default ---
integrationsRouter.post(
  '/:id/default',
  asyncHandler(async (req, res) => {
    await IntegrationService.setDefault(req.params.id);
    res.json({ success: true, message: 'Varsayılan olarak ayarlandı' });
  }),
);

// --- POST /admin/integrations/:id/test ---
integrationsRouter.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const result = await IntegrationService.test(req.params.id);
    res.json({ success: true, data: result });
  }),
);

// --- DELETE /admin/integrations/:id ---
integrationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await IntegrationService.remove(req.params.id);
    await logActivity({
      userId: req.user!.sub,
      action: 'admin.integration_delete',
      resource: 'integration',
      resourceId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, message: 'Silindi' });
  }),
);
