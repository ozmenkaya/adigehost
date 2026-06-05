import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models';
import { DomainService } from '../services/DomainService';
import { AlantronService } from '../services/AlantronService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { IntegrationService } from '../services/IntegrationService';
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
 *
 * Fiyat hesabı:
 *   - Para birimi USD ise → USD × USD/TRY kuru × markup
 *   - Para birimi TRY ise → TRY × markup  (kur uygulanmaz)
 * Gösterim: KDV dahil (× 1.2)
 */
export const domainsRouter = Router();

const DEFAULT_TLDS = ['com', 'net', 'org', 'com.tr', 'info', 'co', 'io', 'xyz', 'online'];

/** Ayarlardan domain markup'ı oku (varsayılan: 1.3). */
async function domainMarkup(): Promise<number> {
  const v = await SettingsService.get('domain_markup', '1.3');
  return Math.max(1, Number(v) || 1.3);
}

/** Aktif domain sağlayıcı: settings'ten oku, fallback domainnameapi. */
async function activeProvider(): Promise<'alantron' | 'domainnameapi'> {
  const v = await SettingsService.get('domain_provider', '');
  if (v === 'alantron') return 'alantron';
  if (v === 'domainnameapi') return 'domainnameapi';
  // Ayarlanmamışsa: Alantron aktif mi bak
  const al = await IntegrationService.getCredentials('alantron').catch(() => null);
  return al?.resellerno ? 'alantron' : 'domainnameapi';
}

/**
 * USD veya TRY ham fiyatı → TRY satış fiyatı (markup dahil, KDV hariç).
 * Sonuç müşteriye +KDV ile gösterilir.
 */
function toSalePriceTRY(rawPrice: number, currency: string, usdTryRate: number, markup: number): number {
  const tryPrice = currency === 'TRY' ? rawPrice : rawPrice * usdTryRate;
  return round2(tryPrice * markup);
}

// --- POST /domains/check — müsaitlik + TRY fiyat (KDV dahil) ---
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

    const [provider, rate, markup, vatRate] = await Promise.all([
      activeProvider(),
      ExchangeRateService.getUsdToTry(),
      domainMarkup(),
      SettingsService.get('vat_rate', '20').then(Number),
    ]);

    let results: Array<{
      domain: string; tld: string; available: boolean; isPremium: boolean;
      priceRaw: number | null; currency: string; period: number;
    }>;

    if (provider === 'alantron') {
      const raw = await AlantronService.checkAvailabilityBulk(name, tlds);
      results = raw.map((r) => ({
        domain: r.domain,
        tld: r.tld,
        available: r.available,
        isPremium: r.isPremium,
        priceRaw: r.priceUsd ?? r.priceTry,
        currency: r.currency,
        period: r.period,
      }));
    } else {
      const raw = await DomainService.checkAvailability([name], tlds);
      results = raw.map((r) => ({
        domain: r.domain,
        tld: r.tld,
        available: r.available,
        isPremium: r.isPremium,
        priceRaw: r.priceUsd,
        currency: r.currency,
        period: r.period,
      }));
    }

    const vatMult = 1 + vatRate / 100;
    const data = results.map((r) => {
      const priceExVat =
        r.priceRaw != null ? toSalePriceTRY(r.priceRaw, r.currency, rate, markup) : null;
      const priceIncVat = priceExVat != null ? round2(priceExVat * vatMult) : null;
      return {
        domain: r.domain,
        tld: r.tld,
        available: r.available,
        isPremium: r.isPremium,
        priceTRY: priceIncVat,          // KDV dahil (müşteriye gösterilen)
        priceExVat,                      // KDV hariç (faturada kullanılan)
        vatRate,
        period: r.period,
        provider,
      };
    });

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

    const provider = await activeProvider();
    const [rate, markup] = await Promise.all([
      ExchangeRateService.getUsdToTry(),
      domainMarkup(),
    ]);

    // Müsaitlik + fiyatı sunucu tarafında doğrula.
    let priceRaw: number | null = null;
    let currency = 'USD';

    if (provider === 'alantron') {
      const info = await AlantronService.checkAvailability(sld, tld);
      if (!info.available) throw ApiError.conflict('Bu alan adı müsait değil');
      priceRaw = info.priceUsd ?? info.priceTry;
      currency = info.currency;
    } else {
      const [info] = await DomainService.checkAvailability([sld], [tld]);
      if (!info) throw ApiError.badRequest('Domain sorgulanamadı');
      if (!info.available) throw ApiError.conflict('Bu alan adı müsait değil');
      priceRaw = info.priceUsd;
      currency = info.currency;
    }

    if (priceRaw == null) throw ApiError.badRequest('Fiyat bilgisi alınamadı');

    // KDV hariç satış fiyatı (faturada bu kullanılır)
    const price = toSalePriceTRY(priceRaw, currency, rate, markup);

    const service = await Service.create({
      userId: req.user!.sub,
      type: 'domain',
      name: domain,
      domain,
      status: 'pending',
      price,
      billingCycle: 'annually',
      nextDue: new Date(Date.now() + period * 365 * 24 * 60 * 60 * 1000),
      config: { period, provider },
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
      details: { domain, period, provider },
      ip: req.ip,
    });

    // Sipariş bildirimi — arka planda.
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

// --- POST /domains/transfer-order — dışarıdan domain transferi (auth) -------
const transferOrderSchema = z.object({
  body: z.object({
    domain: z.string().min(4).max(253).regex(/^[a-z0-9.-]+\.[a-z.]{2,}$/i),
    authCode: z.string().min(6).max(64),
    year: z.coerce.number().int().min(1).max(10).default(1),
  }),
});

domainsRouter.post(
  '/transfer-order',
  validate(transferOrderSchema),
  asyncHandler(async (req, res) => {
    const domain = (req.body.domain as string).toLowerCase().trim();
    const authCode = req.body.authCode as string;
    const year = Number(req.body.year ?? 1);
    const dotIdx = domain.indexOf('.');
    const sld = domain.slice(0, dotIdx);
    const tld = domain.slice(dotIdx + 1);

    // 1) Transfer edilebilirlik
    const xfer = await AlantronService.checkTransfer(domain).catch(() => null);
    if (!xfer?.transferable) {
      throw ApiError.badRequest(
        `Bu domain transfer için müsait değil: ${xfer?.message ?? 'sorgu başarısız'}`,
      );
    }

    // 2) Aynı domain panelde var mı?
    const existing = await Service.findOne({ where: { type: 'domain', domain } });
    if (existing) throw ApiError.conflict('Bu domain zaten panelde kayıtlı');

    // 3) Fiyat hesapla (yenileme fiyatıyla aynı)
    const [info, usdTry, markupStr] = await Promise.all([
      AlantronService.checkAvailability(sld, tld),
      ExchangeRateService.getUsdToTry(),
      domainMarkup(),
    ]);
    const priceRaw = info.priceUsd ?? info.priceTry;
    if (priceRaw == null) throw ApiError.badRequest('Domain fiyatı alınamadı');
    const tryBase = info.currency === 'TRY' ? priceRaw : priceRaw * usdTry;
    const yearlyPrice = round2(tryBase * markupStr);
    const totalPrice = round2(yearlyPrice * year);

    // 4) Pending Service oluştur (transfer onayında active olacak)
    const service = await Service.create({
      userId: req.user!.sub,
      type: 'domain',
      name: domain,
      domain,
      status: 'pending',
      price: yearlyPrice,
      billingCycle: 'annually',
      nextDue: new Date(Date.now() + year * 365 * 86400000),
      config: {
        period: year,
        provider: 'alantron',
        transfer: true,
        authCode, // ödeme sonrası kullanılacak (callback'te transfer çağrısı için)
      },
    });

    // 5) Fatura — notes'a TRANSFER işareti
    const invoice = await InvoiceService.createForAmount(
      req.user!.sub,
      service.id,
      `Domain transferi: ${domain} (${year} yıl)`,
      totalPrice,
    );
    invoice.notes = `TRANSFER:${year}:${service.id} | ${invoice.notes}`;
    await invoice.save();

    const bank = await SettingsService.getMany(BANK_KEYS);

    await logActivity({
      userId: req.user!.sub,
      action: 'domain.transfer_order',
      resource: 'service',
      resourceId: service.id,
      details: { domain, year, total: totalPrice },
      ip: req.ip,
    });

    void User.findByPk(req.user!.sub).then((u) => {
      if (!u) return;
      return NotificationService.sendOrderReceived({
        to: u.email,
        firstName: u.firstName,
        invoiceNum: invoice.invoiceNum,
        description: `Domain transfer: ${domain} (${year} yıl)`,
        total: Number(invoice.total),
        dueDate: new Date(invoice.dueDate),
      }).catch(() => {});
    });

    res.status(201).json({
      success: true,
      data: { service, invoice, bank },
      message: 'Transfer talebi alındı. Ödeme onaylandığında transfer başlatılır (5-7 gün sürer).',
    });
  }),
);
