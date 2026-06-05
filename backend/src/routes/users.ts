import { Router } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { User, SavedCard, Consent, Service, Invoice, Domain, Ticket } from '../models';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import type { ConsentType } from '../models/Consent';

/**
 * Kullanıcı profili ve KVKK hakları.
 * Bu router routes/index.ts içinde `authenticate` ile korunur → req.user mevcut.
 * Tüm işlemler oturum sahibinin (req.user.sub) kendi verisi üzerindedir.
 */
export const usersRouter = Router();

// --- GET /users/me — profil ---
usersRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user!.sub);
    if (!user) throw ApiError.notFound('Kullanıcı bulunamadı');
    res.json({ success: true, data: user });
  }),
);

// --- PUT /users/me — profil güncelle ---
const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(100).optional(),
    lastName: z.string().min(2).max(100).optional(),
    phone: z.string().max(30).nullable().optional(),
    company: z.string().max(150).nullable().optional(),
    address: z.string().max(500).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    district: z.string().max(100).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().max(100).nullable().optional(),
    identityType: z.enum(['individual', 'corporate']).optional(),
    taxNumber: z.string().max(20).nullable().optional(),
    taxOffice: z.string().max(100).nullable().optional(),
  }),
});

usersRouter.put(
  '/me',
  validate(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findByPk(req.user!.sub);
    if (!user) throw ApiError.notFound('Kullanıcı bulunamadı');

    // Yalnızca izinli alanlar güncellenir (e-posta/rol/status/credit DEĞİL).
    const allowed = [
      'firstName',
      'lastName',
      'phone',
      'company',
      'address',
      'city',
      'district',
      'postalCode',
      'country',
      'identityType',
      'taxNumber',
      'taxOffice',
    ] as const;
    for (const key of allowed) {
      if (key in req.body) user.set(key, req.body[key]);
    }
    await user.save();
    await logActivity({
      userId: user.id,
      action: 'user.profile_update',
      resource: 'user',
      resourceId: user.id,
      ip: req.ip,
    });
    res.json({ success: true, data: user });
  }),
);

// --- GET /users/me/cards — kayıtlı kartlar (token alanları gizli) ---
usersRouter.get(
  '/me/cards',
  asyncHandler(async (req, res) => {
    const cards = await SavedCard.findAll({
      where: { userId: req.user!.sub },
      attributes: ['id', 'cardAlias', 'cardLast4', 'cardBrand', 'isDefault', 'createdAt'],
      order: [
        ['isDefault', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });
    res.json({ success: true, data: cards });
  }),
);

// --- DELETE /users/me/cards/:id — kart sil ---
usersRouter.delete(
  '/me/cards/:id',
  asyncHandler(async (req, res) => {
    const card = await SavedCard.findOne({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!card) throw ApiError.notFound('Kart bulunamadı');
    await card.destroy();
    await logActivity({
      userId: req.user!.sub,
      action: 'user.card_delete',
      resource: 'saved_card',
      resourceId: req.params.id,
      ip: req.ip,
    });
    // TODO (İyzico): kartı sağlayıcı tarafında da sil (deleteCard).
    res.json({ success: true, message: 'Kart silindi' });
  }),
);

// --- PUT /users/me/cards/:id/default — varsayılan kart yap ---
usersRouter.put(
  '/me/cards/:id/default',
  asyncHandler(async (req, res) => {
    const card = await SavedCard.findOne({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!card) throw ApiError.notFound('Kart bulunamadı');
    // Diğer kartların default'unu kaldır
    await SavedCard.update(
      { isDefault: false },
      { where: { userId: req.user!.sub } },
    );
    card.isDefault = true;
    await card.save();
    res.json({ success: true, message: 'Varsayılan kart güncellendi' });
  }),
);

// --- PUT /users/me/services/:id/auto-renew — otomatik yenileme aç/kapa ---
const autoRenewSchema = z.object({ body: z.object({ autoRenew: z.boolean() }) });
usersRouter.put(
  '/me/services/:id/auto-renew',
  validate(autoRenewSchema),
  asyncHandler(async (req, res) => {
    const service = await Service.findOne({
      where: { id: req.params.id, userId: req.user!.sub },
    });
    if (!service) throw ApiError.notFound('Servis bulunamadı');
    service.autoRenew = req.body.autoRenew;
    await service.save();
    await logActivity({
      userId: req.user!.sub,
      action: 'user.service_auto_renew',
      resource: 'service',
      resourceId: service.id,
      details: { autoRenew: req.body.autoRenew },
      ip: req.ip,
    });
    res.json({
      success: true,
      message: req.body.autoRenew ? 'Otomatik yenileme açıldı' : 'Otomatik yenileme kapatıldı',
    });
  }),
);

// --- PUT /users/me/consents — KVKK rıza güncelleme ---
const consentsSchema = z.object({
  body: z.object({
    consents: z
      .array(
        z.object({
          consentType: z.enum(['service', 'kvkk', 'marketing', 'international_transfer']),
          accepted: z.boolean(),
          version: z.string().max(10).optional(),
        }),
      )
      .min(1),
  }),
});

usersRouter.put(
  '/me/consents',
  validate(consentsSchema),
  asyncHandler(async (req, res) => {
    const { consents } = req.body as {
      consents: Array<{ consentType: ConsentType; accepted: boolean; version?: string }>;
    };
    // Rıza kayıtları değiştirilemez (immutable) — her güncelleme yeni satır ekler.
    const created = await Promise.all(
      consents.map((c) =>
        Consent.create({
          userId: req.user!.sub,
          consentType: c.consentType,
          accepted: c.accepted,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
          version: c.version ?? null,
        }),
      ),
    );
    await logActivity({
      userId: req.user!.sub,
      action: 'user.consents_update',
      resource: 'consent',
      details: { count: created.length, types: consents.map((c) => c.consentType) },
      ip: req.ip,
    });
    res.json({ success: true, data: { recorded: created.length } });
  }),
);

/** Kullanıcının tüm verisini KVKK Madde 11 kapsamında toplar. */
async function collectUserData(userId: string) {
  const [user, services, invoices, domains, tickets, consents, cards] = await Promise.all([
    User.findByPk(userId),
    Service.findAll({ where: { userId } }),
    Invoice.findAll({ where: { userId } }),
    Domain.findAll({ where: { userId } }),
    Ticket.findAll({ where: { userId } }),
    Consent.findAll({ where: { userId }, order: [['acceptedAt', 'DESC']] }),
    SavedCard.findAll({
      where: { userId },
      attributes: ['id', 'cardAlias', 'cardLast4', 'cardBrand', 'isDefault'],
    }),
  ]);
  return { user, services, invoices, domains, tickets, consents, cards };
}

// --- GET /users/me/data — KVKK: verileri görüntüle ---
usersRouter.get(
  '/me/data',
  asyncHandler(async (req, res) => {
    const data = await collectUserData(req.user!.sub);
    await logActivity({
      userId: req.user!.sub,
      action: 'kvkk.data_view',
      resource: 'user',
      resourceId: req.user!.sub,
      ip: req.ip,
    });
    res.json({ success: true, data });
  }),
);

// --- GET /users/me/data/export — KVKK: verileri indir (JSON) ---
usersRouter.get(
  '/me/data/export',
  asyncHandler(async (req, res) => {
    const data = await collectUserData(req.user!.sub);
    await logActivity({
      userId: req.user!.sub,
      action: 'kvkk.data_export',
      resource: 'user',
      resourceId: req.user!.sub,
      ip: req.ip,
    });
    const filename = `adigehost-verilerim-${req.user!.sub}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2));
  }),
);

// --- DELETE /users/me — KVKK: hesap silme (anonimleştirme) ---
usersRouter.delete(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await User.scope('withSecret').findByPk(req.user!.sub);
    if (!user) throw ApiError.notFound('Kullanıcı bulunamadı');

    // Aktif servisi olan hesap silinemez (önce iptal edilmeli).
    const activeServices = await Service.count({
      where: { userId: user.id, status: { [Op.in]: ['active', 'pending', 'suspended'] } },
    });
    if (activeServices > 0) {
      throw ApiError.conflict(
        'Aktif servisleriniz var. Hesap silme öncesi tüm servisleri iptal etmelisiniz.',
      );
    }

    // Anonimleştirme: kişisel veriler temizlenir; faturalar (VUK 10 yıl) korunur.
    const anonId = user.id;
    user.firstName = 'Silinmiş';
    user.lastName = 'Kullanıcı';
    user.email = `deleted-${anonId}@anonymized.local`;
    user.phone = null;
    user.company = null;
    user.address = null;
    user.city = null;
    user.taxNumber = null;
    user.password = 'ANONYMIZED';
    user.status = 'suspended';
    user.resetToken = null;
    user.resetExpires = null;
    await user.save();

    // Kayıtlı kartları sil.
    await SavedCard.destroy({ where: { userId: anonId } });

    await logActivity({
      userId: anonId,
      action: 'kvkk.account_anonymized',
      resource: 'user',
      resourceId: anonId,
      ip: req.ip,
    });

    // Oturum çerezlerini temizle.
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.json({
      success: true,
      message: 'Hesabınız anonimleştirildi. Yasal saklama gereği faturalar korunmuştur.',
    });
  }),
);
