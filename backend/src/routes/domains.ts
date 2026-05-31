import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models';
import { DomainService } from '../services/DomainService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { InvoiceService } from '../services/InvoiceService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { round2 } from '../utils/helpers';
import { NotificationService } from '../services/NotificationService';
import { User } from '../models';

/**
 * Domain arama + sipariş (havale/EFT akışı). `authenticate` ile korunur.
 * Fiyat: DomainNameAPI USD fiyatı → canlı USD/TRY kuru × markup.
 */
export const domainsRouter = Router();

const DEFAULT_TLDS = ['com', 'net', 'org', 'com.tr', 'info', 'co', 'io', 'xyz', 'online'];

async function domainMarkup(): Promise<number> {
  const v = await SettingsService.get('domain_markup', '1.3');
  return Number(v) || 1.3;
}

// --- POST /domains/check — müsaitlik + TRY fiyat ---
const checkSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9-]+$/i, 'Sadece harf, rakam ve tire'),
    tlds: z.array(z.string()).max(20).optional(),
  }),
});

domainsRouter.post(
  '/check',
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const name = (req.body.name as string).toLowerCase();
    const tlds = (req.body.tlds as string[] | undefined)?.length ? req.body.tlds : DEFAULT_TLDS;
    const [results, rate, markup] = await Promise.all([
      DomainService.checkAvailability([name], tlds),
      ExchangeRateService.getUsdToTry(),
      domainMarkup(),
    ]);
    const data = results.map((r) => ({
      domain: r.domain,
      tld: r.tld,
      available: r.available,
      isPremium: r.isPremium,
      priceTRY: r.priceUsd != null ? round2(r.priceUsd * rate * markup) : null,
      period: r.period,
    }));
    res.json({ success: true, data });
  }),
);

// --- POST /domains/order — domain sipariş (havale/EFT) ---
const orderSchema = z.object({
  body: z.object({
    domain: z
      .string()
      .min(3)
      .max(253)
      .regex(/^[a-z0-9-]+\.[a-z.]{2,}$/i, 'Geçerli alan adı girin'),
    period: z.number().int().min(1).max(10).default(1),
  }),
});

domainsRouter.post(
  '/order',
  validate(orderSchema),
  asyncHandler(async (req, res) => {
    const domain = (req.body.domain as string).toLowerCase();
    const period = Number(req.body.period ?? 1);
    const dotIdx = domain.indexOf('.');
    const sld = domain.slice(0, dotIdx);
    const tld = domain.slice(dotIdx + 1);

    // Müsaitlik + fiyatı sunucu tarafında doğrula.
    const [info] = await DomainService.checkAvailability([sld], [tld]);
    if (!info) throw ApiError.badRequest('Domain sorgulanamadı');
    if (!info.available) throw ApiError.conflict('Bu alan adı müsait değil');
    if (info.priceUsd == null) throw ApiError.badRequest('Fiyat bilgisi alınamadı');

    const rate = await ExchangeRateService.getUsdToTry();
    const price = round2(info.priceUsd * rate * (await domainMarkup()));

    const service = await Service.create({
      userId: req.user!.sub,
      type: 'domain',
      name: domain,
      domain,
      status: 'pending',
      price,
      billingCycle: 'annually',
      nextDue: new Date(Date.now() + period * 365 * 24 * 60 * 60 * 1000),
      config: { period },
    });

    const invoice = await InvoiceService.createForAmount(
      req.user!.sub,
      service.id,
      `Domain kaydı: ${domain} (${period} yıl)`,
      price,
    );
    const bank = await SettingsService.getMany(BANK_KEYS);

    await logActivity({
      userId: req.user!.sub,
      action: 'domain.order',
      resource: 'service',
      resourceId: service.id,
      details: { domain, period },
      ip: req.ip,
    });

    // Sipariş bildirimi — arka planda, hata ana yanıtı bozmaz.
    void User.findByPk(req.user!.sub).then((u) => {
      if (!u) return;
      return NotificationService.sendOrderReceived({
        to: u.email,
        firstName: u.firstName,
        invoiceNum: invoice.invoiceNum,
        description: `Domain kaydı: ${domain} (${period} yıl)`,
        total: Number(invoice.total),
        dueDate: new Date(invoice.dueDate),
      }).catch(() => {});
    });

    res.status(201).json({
      success: true,
      data: { service, invoice, bank },
      message: 'Domain siparişiniz alındı. Havale/EFT ile ödeme sonrası kaydedilecektir.',
    });
  }),
);
