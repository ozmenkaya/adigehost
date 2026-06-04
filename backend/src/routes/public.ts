import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models';
import { DomainService } from '../services/DomainService';
import { AlantronService } from '../services/AlantronService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService } from '../services/SettingsService';
import { IntegrationService } from '../services/IntegrationService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { round2 } from '../utils/helpers';

/**
 * Herkese açık (auth gerektirmeyen) uçlar — satış sayfası için.
 */
export const publicRouter = Router();

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
    tlds: z.array(z.string()).max(20).optional(),
  }),
});

const DEFAULT_TLDS = ['com', 'net', 'org', 'com.tr', 'net.tr', 'info', 'co', 'io', 'xyz', 'online'];

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
