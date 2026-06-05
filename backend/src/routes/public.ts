import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models';
import { DomainService } from '../services/DomainService';
import { AlantronService } from '../services/AlantronService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService, BANK_KEYS, COMPANY_KEYS } from '../services/SettingsService';
import { IntegrationService } from '../services/IntegrationService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { round2 } from '../utils/helpers';

/**
 * Herkese açık (auth gerektirmeyen) uçlar — satış sayfası için.
 */
export const publicRouter = Router();

// ── Domain transfer uygunluk kontrolü + fiyat (auth gerekmez) ─────────────
const transferCheckSchema = z.object({
  body: z.object({
    domain: z.string().min(4).max(253).regex(/^[a-z0-9.-]+\.[a-z.]{2,}$/i),
  }),
});

publicRouter.post(
  '/domains/transfer-check',
  validate(transferCheckSchema),
  asyncHandler(async (req, res) => {
    const domain = (req.body.domain as string).toLowerCase().trim();
    const dotIdx = domain.indexOf('.');
    const sld = domain.slice(0, dotIdx);
    const tld = domain.slice(dotIdx + 1);

    // 1) Transfer edilebilirlik
    const ok = await AlantronService.checkTransfer(domain).catch(() => null);

    // 2) Fiyat (yenileme fiyatıyla aynı)
    const [info, rate, markupStr, vatStr] = await Promise.all([
      AlantronService.checkAvailability(sld, tld),
      ExchangeRateService.getUsdToTry(),
      SettingsService.get('domain_markup', '1.3'),
      SettingsService.get('vat_rate', '20'),
    ]);
    const markup = Math.max(1, Number(markupStr) || 1.3);
    const vatRate = Number(vatStr);
    const priceRaw = info.priceUsd ?? info.priceTry;
    const yearlyExVat = priceRaw != null
      ? round2((info.currency === 'TRY' ? priceRaw : priceRaw * rate) * markup)
      : null;
    const yearlyIncVat = yearlyExVat != null ? round2(yearlyExVat * (1 + vatRate / 100)) : null;

    res.json({
      success: true,
      data: {
        domain,
        transferable: ok?.transferable ?? false,
        message: ok?.message ?? 'Sorgu yapılamadı',
        yearlyExVat,
        yearlyIncVat,
        vatRate,
        currency: 'TRY',
      },
    });
  }),
);

// ── Şirket bilgileri (yasal sayfalar için) ──────────────────────────────────
publicRouter.get(
  '/company',
  asyncHandler(async (_req, res) => {
    const company = await SettingsService.getMany(COMPANY_KEYS);
    // Hassas alanı (EDM alias) gizle
    delete company.company_alias;
    res.json({ success: true, data: company });
  }),
);

// ── Banka / Havale bilgileri (havale ödeyenler için) ─────────────────────────
publicRouter.get(
  '/bank',
  asyncHandler(async (_req, res) => {
    const bank = await SettingsService.getMany(BANK_KEYS);
    res.json({ success: true, data: bank });
  }),
);

// ── Ürün / Hosting paketleri ─────────────────────────────────────────────────
publicRouter.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const products = await Product.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'type', 'priceMonthly', 'priceAnnually', 'setupFee', 'specs', 'description'],
      order: [['type', 'ASC'], ['sortOrder', 'ASC'], ['priceMonthly', 'ASC']],
    });
    res.json({ success: true, data: products });
  }),
);

// ── Domain müsaitlik + fiyat ─────────────────────────────────────────────────
const checkSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/i, 'Geçersiz domain adı'),
    tlds: z.array(z.string()).max(50).optional(),
  }),
});

// Alantron'da test edilmiş 42 TLD — popülerlikten az popülere
const DEFAULT_TLDS = [
  'com', 'com.tr', 'net', 'org', 'info', 'co',
  'io', 'app', 'dev', 'tr', 'net.tr', 'org.tr',
  'xyz', 'online', 'site', 'tech', 'biz', 'cloud',
  'shop', 'store', 'me', 'eu', 'de', 'co.uk',
  'web.tr', 'gen.tr', 'ist', 'istanbul',
  'club', 'pro', 'live', 'art', 'blog',
  'agency', 'digital', 'design', 'studio',
  'tv', 'cc', 'us', 'asia',
];

publicRouter.post(
  '/domains/check',
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const name = (req.body.name as string).toLowerCase();
    const tlds = (req.body.tlds as string[] | undefined)?.length
      ? (req.body.tlds as string[])
      : DEFAULT_TLDS;

    const [providerRaw, rateRaw, markupRaw, vatStr] = await Promise.all([
      SettingsService.get('domain_provider', ''),
      ExchangeRateService.getUsdToTry(),
      SettingsService.get('domain_markup', '1.3'),
      SettingsService.get('vat_rate', '20'),
    ]);

    const rate = rateRaw;
    const markup = Math.max(1, Number(markupRaw) || 1.3);
    const vat = 1 + Number(vatStr) / 100;

    // Aktif provider seç
    const alCreds = await IntegrationService.getCredentials('alantron').catch(() => null);
    const provider = providerRaw === 'alantron' || (!providerRaw && alCreds?.resellerno)
      ? 'alantron'
      : 'domainnameapi';

    let results: Array<{
      domain: string; tld: string; available: boolean;
      isPremium: boolean; priceRaw: number | null; currency: string; period: number;
    }>;

    if (provider === 'alantron') {
      const raw = await AlantronService.checkAvailabilityBulk(name, tlds);
      results = raw.map((r) => ({
        domain: r.domain, tld: r.tld, available: r.available, isPremium: r.isPremium,
        priceRaw: r.priceUsd ?? r.priceTry, currency: r.currency, period: r.period,
      }));
    } else {
      const raw = await DomainService.checkAvailability([name], tlds);
      results = raw.map((r) => ({
        domain: r.domain, tld: r.tld, available: r.available, isPremium: r.isPremium,
        priceRaw: r.priceUsd, currency: r.currency, period: r.period,
      }));
    }

    const data = results.map((r) => {
      const tryBase = r.priceRaw != null
        ? (r.currency === 'TRY' ? r.priceRaw : r.priceRaw * rate)
        : null;
      const priceExVat = tryBase != null ? round2(tryBase * markup) : null;
      const priceTRY = priceExVat != null ? round2(priceExVat * vat) : null;
      return { domain: r.domain, tld: r.tld, available: r.available, isPremium: r.isPremium, priceTRY, priceExVat, vatRate: Number(vatStr), period: r.period, provider };
    });

    res.json({ success: true, data });
  }),
);
