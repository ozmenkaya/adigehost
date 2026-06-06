import { Router } from 'express';
import { z } from 'zod';
import { Service, Product, User, Invoice, InvoiceItem } from '../models';
import { DomainService } from '../services/DomainService';
import { AlantronService } from '../services/AlantronService';
import { ExchangeRateService } from '../services/ExchangeRateService';
import { SettingsService, BANK_KEYS } from '../services/SettingsService';
import { IntegrationService } from '../services/IntegrationService';
import { InvoiceService } from '../services/InvoiceService';
import { NotificationService } from '../services/NotificationService';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { round2, calculateTotals } from '../utils/helpers';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Sepet → tek faturalı sipariş (auth gerektirir).
 * Kullanıcı login/register sonrası /checkout sayfasından çağırır.
 */
export const cartRouter = Router();

const checkoutSchema = z.object({
  body: z.object({
    items: z.array(
      z.object({
        type: z.enum(['hosting', 'domain', 'vps']),
        productId: z.string().uuid().optional(),
        domain: z.string().max(253).optional(),
        billingCycle: z.enum(['monthly', 'quarterly', 'annually']).optional(),
        period: z.coerce.number().int().min(1).max(10).optional(),
        // VPS özelleştirici için
        vpsServerType: z.string().max(32).optional(),
        vpsLocation: z.string().max(16).optional(),
        vpsImage: z.string().max(64).optional(),
        vpsWithIpv4: z.boolean().optional(),
        vpsHostname: z.string().max(63).optional(),
      }),
    ).min(1).max(20),
  }),
});

cartRouter.post(
  '/checkout',
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    const { items } = req.body as z.infer<typeof checkoutSchema>['body'];
    const userId = req.user!.sub;

    // Fiyatları sunucu tarafında yeniden doğrula (sepetteki fiyat manipüle edilemez).
    const [rate, markupStr, vatStr, providerRaw] = await Promise.all([
      ExchangeRateService.getUsdToTry(),
      SettingsService.get('domain_markup', '1.3'),
      SettingsService.get('vat_rate', String(env.VAT_RATE)),
      SettingsService.get('domain_provider', ''),
    ]);
    const markup = Math.max(1, Number(markupStr) || 1.3);
    const vatRate = Number(vatStr);

    const alCreds = await IntegrationService.getCredentials('alantron').catch(() => null);
    const provider = providerRaw === 'alantron' || (!providerRaw && alCreds?.resellerno)
      ? 'alantron'
      : 'domainnameapi';

    const createdServices: Service[] = [];
    const invoiceLines: Array<{ description: string; quantity: number; unitPrice: number; serviceId: string }> = [];
    let subtotal = 0;

    for (const item of items) {
      if (item.type === 'hosting') {
        if (!item.productId) throw ApiError.badRequest('Hosting için productId gerekli');
        const product = await Product.findByPk(item.productId);
        if (!product || !product.isActive) throw ApiError.badRequest(`Geçersiz ürün: ${item.productId}`);
        const cycle = item.billingCycle ?? 'monthly';
        const base = cycle === 'annually' && product.priceAnnually
          ? Number(product.priceAnnually)
          : Number(product.priceMonthly) * (cycle === 'quarterly' ? 3 : 1);
        const setup = Number(product.setupFee ?? 0);
        const lineTotal = round2(base + setup);

        // Hosting servisi (pending) oluştur — domain opsiyonel, sonra atanır
        const svc = await Service.create({
          userId,
          type: 'hosting',
          productId: product.id,
          serverId: product.serverId,
          name: item.domain ?? product.name,
          domain: item.domain ?? null,
          status: 'pending',
          price: Number(product.priceMonthly),
          billingCycle: cycle,
          nextDue: new Date(Date.now() + (cycle === 'annually' ? 365 : cycle === 'quarterly' ? 90 : 30) * 86400000),
        });
        createdServices.push(svc);
        invoiceLines.push({
          description: `${product.name} (${cycle === 'annually' ? 'Yıllık' : cycle === 'quarterly' ? '3 Aylık' : 'Aylık'})${item.domain ? ' — ' + item.domain : ''}`,
          quantity: 1,
          unitPrice: lineTotal,
          serviceId: svc.id,
        });
        subtotal += lineTotal;
      } else if (item.type === 'domain') {
        if (!item.domain) throw ApiError.badRequest('Domain adı gerekli');
        const domain = item.domain.toLowerCase();
        const dotIdx = domain.indexOf('.');
        const sld = domain.slice(0, dotIdx);
        const tld = domain.slice(dotIdx + 1);
        const period = item.period ?? 1;

        // Müsaitlik + fiyat doğrula
        let priceRaw: number | null = null;
        let currency = 'USD';
        if (provider === 'alantron') {
          const info = await AlantronService.checkAvailability(sld, tld);
          if (!info.available) throw ApiError.conflict(`${domain} müsait değil`);
          priceRaw = info.priceUsd ?? info.priceTry;
          currency = info.currency;
        } else {
          const [info] = await DomainService.checkAvailability([sld], [tld]);
          if (!info || !info.available) throw ApiError.conflict(`${domain} müsait değil`);
          priceRaw = info.priceUsd;
          currency = info.currency;
        }
        if (priceRaw == null) throw ApiError.badRequest(`${domain} fiyatı alınamadı`);

        const tryPrice = currency === 'TRY' ? priceRaw : priceRaw * rate;
        const linePrice = round2(tryPrice * markup);

        const svc = await Service.create({
          userId, type: 'domain', name: domain, domain,
          status: 'pending', price: linePrice, billingCycle: 'annually',
          nextDue: new Date(Date.now() + period * 365 * 86400000),
          config: { period, provider },
        });
        createdServices.push(svc);
        invoiceLines.push({
          description: `Domain: ${domain} (${period} yıl)`,
          quantity: 1,
          unitPrice: linePrice,
          serviceId: svc.id,
        });
        subtotal += linePrice;
      } else if (item.type === 'vps') {
        // ─── VPS: Hetzner Cloud özelleştirici siparişi ───────────────
        if (!item.vpsServerType || !item.vpsLocation || !item.vpsImage || !item.vpsHostname) {
          throw ApiError.badRequest('VPS için tüm seçenekler (serverType, location, image, hostname) gerekli');
        }
        // Hostname doğrulama
        if (!/^[a-z0-9-]+$/.test(item.vpsHostname)) {
          throw ApiError.badRequest('Hostname yalnızca harf, rakam ve tire içerebilir');
        }
        // Fiyatı Hetzner API + güncel ayarlardan yeniden hesapla
        const { HetznerService } = await import('../services/HetznerService');
        const serverTypes = await HetznerService.listServerTypes();
        const st = serverTypes.find((s) => s.name === item.vpsServerType);
        if (!st) throw ApiError.badRequest(`Geçersiz sunucu tipi: ${item.vpsServerType}`);
        const locPrice = st.prices?.find((p) => p.location === item.vpsLocation);
        if (!locPrice) throw ApiError.badRequest(`Bu lokasyonda sunucu yok: ${item.vpsLocation}`);

        const eurTry = await ExchangeRateService.getEurToTry();
        const vpsMarkup = Math.max(1, Number(await SettingsService.get('vps_markup', '1.4')) || 1.4);

        const eurServer = Number(locPrice.price_monthly.gross);
        const eurIpv4 = item.vpsWithIpv4 ? 0.6 : 0;
        const totalEur = eurServer + eurIpv4;
        const linePrice = round2(totalEur * eurTry * vpsMarkup); // KDV hariç

        const svc = await Service.create({
          userId,
          type: 'vps',
          name: item.vpsHostname,
          domain: null,
          status: 'pending',
          price: linePrice,
          billingCycle: 'monthly',
          nextDue: new Date(Date.now() + 30 * 86400000),
          hetznerPlan: st.name,
          hetznerLocation: item.vpsLocation,
          hetznerOs: item.vpsImage,
          config: {
            hostname: item.vpsHostname,
            withIpv4: item.vpsWithIpv4 !== false,
            cores: st.cores,
            memory: st.memory,
            disk: st.disk,
          },
        });
        createdServices.push(svc);
        invoiceLines.push({
          description: `VPS ${st.name.toUpperCase()} (${st.cores} CPU · ${st.memory}GB RAM · ${st.disk}GB SSD · ${item.vpsLocation.toUpperCase()}) — ${item.vpsHostname}`,
          quantity: 1,
          unitPrice: linePrice,
          serviceId: svc.id,
        });
        subtotal += linePrice;
      }
    }

    // Tek fatura oluştur (çok kalemli)
    const { tax, total } = calculateTotals(subtotal, vatRate);
    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));
    const invoice = await Invoice.create({
      userId,
      invoiceNum: await InvoiceService.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal: round2(subtotal),
      tax,
      total,
      dueDate: new Date(Date.now() + dueDays * 86400000),
      notes: invoiceLines.map((l) => l.description).join(', '),
    });
    for (const line of invoiceLines) {
      await InvoiceItem.create({
        invoiceId: invoice.id,
        serviceId: line.serviceId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: round2(line.quantity * line.unitPrice),
      });
    }

    const bank = await SettingsService.getMany(BANK_KEYS);

    await logActivity({
      userId, action: 'cart.checkout', resource: 'invoice', resourceId: invoice.id,
      details: { itemCount: items.length, total: invoice.total }, ip: req.ip,
    });

    // Sipariş bildirimi — arka planda
    void User.findByPk(userId).then((u) => {
      if (!u) return;
      return NotificationService.sendOrderReceived({
        to: u.email, firstName: u.firstName,
        invoiceNum: invoice.invoiceNum,
        description: `${items.length} kalem sipariş`,
        total: Number(invoice.total),
        dueDate: new Date(invoice.dueDate),
      }).catch(() => {});
    });

    logger.info('Checkout completed', { userId, invoice: invoice.id, items: items.length });
    res.status(201).json({
      success: true,
      data: { invoice, services: createdServices, bank },
      message: 'Siparişiniz alındı. Havale/EFT ile ödeme sonrası hizmetleriniz aktive edilecek.',
    });
  }),
);
