import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { Service, Invoice, InvoiceItem, User } from '../models';
import { AlantronService } from '../services/AlantronService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { InvoiceService } from '../services/InvoiceService';
import { NotificationService } from '../services/NotificationService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { calculateTotals, round2 } from '../utils/helpers';
import { env } from '../config/env';

/**
 * Müşterinin kendi domain servisleri üzerinde Alantron işlemleri.
 * Sahiplik doğrulanır: admin değilse sadece kendi servisi.
 * Bu router routes/index.ts içinde `/services/:id/domain` altına bağlanır.
 */
export const clientDomainsRouter = Router({ mergeParams: true });

interface DomainCtx {
  service: Service;
  registrycode: number;
}

async function getOwnedDomain(req: Request): Promise<DomainCtx> {
  const service = await Service.findByPk(req.params.id);
  if (!service) throw ApiError.notFound('Servis bulunamadı');
  if (service.type !== 'domain') throw ApiError.badRequest('Bu servis bir domain değil');
  if (req.user!.role !== 'admin' && service.userId !== req.user!.sub) {
    throw ApiError.forbidden();
  }
  const cfg = service.config as { registrycode?: number; provider?: string } | null;
  if (!cfg?.registrycode) {
    throw ApiError.badRequest('Bu domain için Alantron registrycode kaydedilmemiş');
  }
  if (cfg.provider && cfg.provider !== 'alantron') {
    throw ApiError.badRequest('Bu domain Alantron üzerinde değil');
  }
  return { service, registrycode: cfg.registrycode };
}

// ── GET /services/:id/domain — tüm domain bilgilerini Alantron'dan çek ──────
clientDomainsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { registrycode } = await getOwnedDomain(req);
    const info = await AlantronService.getDomainFull(registrycode);
    res.json({ success: true, data: info });
  }),
);

// ── PUT /services/:id/domain/nameservers — DNS değiştir ─────────────────────
const nsSchema = z.object({
  body: z.object({
    nameServers: z.array(z.string().min(3).max(253)).min(2).max(5),
  }),
});

clientDomainsRouter.put(
  '/nameservers',
  validate(nsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameServers } = req.body as { nameServers: string[] };
    await AlantronService.modifyDns(registrycode, nameServers);
    await logActivity({
      userId: req.user!.sub, action: 'domain.dns_update',
      resource: 'service', resourceId: service.id,
      details: { nameServers }, ip: req.ip,
    });
    res.json({ success: true, message: 'Nameserver\'lar güncellendi' });
  }),
);

// ── PUT /services/:id/domain/lock — kilit aç/kapat ──────────────────────────
const lockSchema = z.object({ body: z.object({ locked: z.boolean() }) });

clientDomainsRouter.put(
  '/lock',
  validate(lockSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { locked } = req.body as { locked: boolean };
    await AlantronService.setLock(registrycode, locked);
    await logActivity({
      userId: req.user!.sub, action: 'domain.lock', resource: 'service',
      resourceId: service.id, details: { locked }, ip: req.ip,
    });
    res.json({ success: true, message: locked ? 'Domain kilitlendi' : 'Domain kilidi açıldı' });
  }),
);

// ── PUT /services/:id/domain/auth-code — transfer kodu ata ──────────────────
const authSchema = z.object({
  body: z.object({ authCode: z.string().min(6).max(32) }),
});

clientDomainsRouter.put(
  '/auth-code',
  validate(authSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { authCode } = req.body as { authCode: string };
    await AlantronService.setAuthCode(registrycode, authCode);
    await logActivity({
      userId: req.user!.sub, action: 'domain.auth_code', resource: 'service',
      resourceId: service.id, ip: req.ip,
    });
    res.json({ success: true, message: 'Transfer kodu güncellendi' });
  }),
);

// ── Child Nameserver işlemleri ──────────────────────────────────────────────
const childNsSchema = z.object({
  body: z.object({
    nameserver: z.string().min(3).max(253),
    ipAddress: z.string().min(7).max(45),
  }),
});

clientDomainsRouter.post(
  '/child-ns',
  validate(childNsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameserver, ipAddress } = req.body as { nameserver: string; ipAddress: string };
    await AlantronService.addNameserver(registrycode, nameserver, ipAddress);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_add', resource: 'service',
      resourceId: service.id, details: { nameserver, ipAddress }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver eklendi' });
  }),
);

clientDomainsRouter.put(
  '/child-ns',
  validate(childNsSchema),
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    const { nameserver, ipAddress } = req.body as { nameserver: string; ipAddress: string };
    await AlantronService.modifyNameserver(registrycode, nameserver, ipAddress);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_update', resource: 'service',
      resourceId: service.id, details: { nameserver, ipAddress }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver güncellendi' });
  }),
);

clientDomainsRouter.delete(
  '/child-ns/:ns',
  asyncHandler(async (req, res) => {
    const { service, registrycode } = await getOwnedDomain(req);
    await AlantronService.deleteNameserver(registrycode, req.params.ns);
    await logActivity({
      userId: req.user!.sub, action: 'domain.child_ns_delete', resource: 'service',
      resourceId: service.id, details: { nameserver: req.params.ns }, ip: req.ip,
    });
    res.json({ success: true, message: 'Child nameserver silindi' });
  }),
);

// ── Yenileme fiyatı sorgulama ────────────────────────────────────────────────
// GET /services/:id/domain/renew-price?years=1  → KDV dahil TL fiyat
clientDomainsRouter.get(
  '/renew-price',
  asyncHandler(async (req, res) => {
    const { service } = await getOwnedDomain(req);
    const years = Math.max(1, Math.min(10, Number(req.query.years) || 1));
    const domain = service.domain ?? service.name;
    const dotIdx = domain.indexOf('.');
    const sld = domain.slice(0, dotIdx);
    const tld = domain.slice(dotIdx + 1);

    const [info, rate, markupStr, vatStr] = await Promise.all([
      AlantronService.checkAvailability(sld, tld),
      ExchangeRateService.getUsdToTry(),
      SettingsService.get('domain_markup', '1.3'),
      SettingsService.get('vat_rate', '20'),
    ]);
    const markup = Math.max(1, Number(markupStr) || 1.3);
    const vatRate = Number(vatStr);
    const priceRaw = info.priceUsd ?? info.priceTry;
    if (priceRaw == null) throw ApiError.badRequest('Fiyat bilgisi alınamadı');

    const tryBase = info.currency === 'TRY' ? priceRaw : priceRaw * rate;
    const yearlyExVat = round2(tryBase * markup);
    const totalExVat = round2(yearlyExVat * years);
    const totals = calculateTotals(totalExVat, vatRate);

    res.json({
      success: true,
      data: {
        domain,
        years,
        yearlyExVat,
        yearlyIncVat: round2(yearlyExVat * (1 + vatRate / 100)),
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        vatRate,
        currency: 'TRY',
      },
    });
  }),
);

// ── Yenileme siparişi oluştur (havale veya iyzico ile ödenir) ───────────────
const renewOrderSchema = z.object({
  body: z.object({ years: z.coerce.number().int().min(1).max(10) }),
});

clientDomainsRouter.post(
  '/renew-order',
  validate(renewOrderSchema),
  asyncHandler(async (req, res) => {
    const { service } = await getOwnedDomain(req);
    const years = req.body.years as number;
    const domain = service.domain ?? service.name;
    const dotIdx = domain.indexOf('.');
    const sld = domain.slice(0, dotIdx);
    const tld = domain.slice(dotIdx + 1);

    // Fiyat hesapla (sunucu tarafında yeniden doğrulama)
    const [info, rate, markupStr, vatStr] = await Promise.all([
      AlantronService.checkAvailability(sld, tld),
      ExchangeRateService.getUsdToTry(),
      SettingsService.get('domain_markup', '1.3'),
      SettingsService.get('vat_rate', String(env.VAT_RATE)),
    ]);
    const markup = Math.max(1, Number(markupStr) || 1.3);
    const vatRate = Number(vatStr);
    const priceRaw = info.priceUsd ?? info.priceTry;
    if (priceRaw == null) throw ApiError.badRequest('Yenileme fiyatı alınamadı');

    const tryBase = info.currency === 'TRY' ? priceRaw : priceRaw * rate;
    const subtotal = round2(round2(tryBase * markup) * years);
    const { tax, total } = calculateTotals(subtotal, vatRate);

    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));
    const invoice = await Invoice.create({
      userId: service.userId,
      invoiceNum: await InvoiceService.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal,
      tax,
      total,
      dueDate: new Date(Date.now() + dueDays * 86400000),
      notes: `Domain yenileme: ${domain} (${years} yıl)`,
    });

    // metadata: { type: 'renew', years } → callback bunu görürse renewDomain çağırır
    await InvoiceItem.create({
      invoiceId: invoice.id,
      serviceId: service.id,
      description: `${domain} domain yenileme (${years} yıl)`,
      quantity: 1,
      unitPrice: subtotal,
      total: subtotal,
    });
    // Faturanın notes alanına da renew işareti
    invoice.notes = `RENEWAL:${years}:${service.id} | ${invoice.notes}`;
    await invoice.save();

    const bank = await SettingsService.getMany(BANK_KEYS);

    await logActivity({
      userId: req.user!.sub,
      action: 'domain.renew_order',
      resource: 'service',
      resourceId: service.id,
      details: { years, domain, total },
      ip: req.ip,
    });

    // Müşteriye bildirim
    void User.findByPk(service.userId).then((u) => {
      if (!u) return;
      return NotificationService.sendOrderReceived({
        to: u.email, firstName: u.firstName,
        invoiceNum: invoice.invoiceNum,
        description: `${domain} yenileme (${years} yıl)`,
        total: Number(invoice.total),
        dueDate: new Date(invoice.dueDate),
      }).catch(() => {});
    });

    res.status(201).json({
      success: true,
      data: { invoice, bank, years, domain },
      message: 'Yenileme talebi oluşturuldu. Ödeme sonrası domain otomatik yenilenir.',
    });
  }),
);
