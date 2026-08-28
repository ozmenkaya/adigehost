import { Router } from 'express';
import { z } from 'zod';
import { Invoice, InvoiceItem, SavedCard, Service, User } from '../models';
import { IyzicoService } from '../services/IyzicoService';
import { ProvisioningService } from '../services/ProvisioningService';
import { EInvoiceService } from '../services/EInvoiceService';
import { NotificationService } from '../services/NotificationService';
import { AutoRenewService } from '../services/AutoRenewService';
import { ServiceLifecycleService } from '../services/ServiceLifecycleService';
import { nextDueAfterPayment } from '../utils/helpers';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { logActivity } from '../services/AuditService';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * İyzico ile ödeme akışı:
 *   POST /payments/iyzico/init   → checkout form oluştur, paymentPageUrl döndür (auth)
 *   POST /payments/iyzico/callback → iyzico'dan gelen POST (auth YOK, token public)
 *   GET  /payments/iyzico/verify   → frontend tarafından doğrulama (token query)
 *
 * Callback ve verify auth gerektirmez (token bilen ödeyendir).
 */
export const paymentsRouter = Router();

// ── POST /payments/iyzico/init (auth gerektirir) ─────────────────────────────
const initSchema = z.object({
  body: z.object({ invoiceId: z.string().uuid(), saveCard: z.boolean().optional() }),
});

paymentsRouter.post(
  '/iyzico/init',
  validate(initSchema),
  asyncHandler(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    const invoice = await Invoice.findByPk(req.body.invoiceId);
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (invoice.userId !== req.user.sub && req.user.role !== 'admin') {
      throw ApiError.forbidden();
    }
    if (invoice.status === 'paid') throw ApiError.conflict('Fatura zaten ödenmiş');

    // Kayıtlı kartı varsa checkout formunda otomatik teklif et (tek tık ödeme).
    const existingCard = await SavedCard.findOne({
      where: { userId: invoice.userId },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
    });

    const callbackUrl = `${env.APP_URL}/api/payments/iyzico/callback`;
    const result = await IyzicoService.createCheckoutForm(invoice.id, callbackUrl, {
      cardUserKey: existingCard?.cardUserKey,
      saveCard: req.body.saveCard,
    });

    await logActivity({
      userId: req.user.sub,
      action: 'payment.iyzico_init',
      resource: 'invoice',
      resourceId: invoice.id,
      details: { token: result.token.slice(0, 16) + '…' },
      ip: req.ip,
    });

    res.json({ success: true, data: result });
  }),
);

// ── GET|POST /payments/iyzico/callback ──────────────────────────────────────
// iyzico genelde browser ile POST (form) gönderir; ama bazı senaryolarda
// GET redirect de olabiliyor. Her ikisini de kabul ediyoruz.
const iyzicoCallbackHandler = asyncHandler(async (req, res) => {
    const token = (req.body?.token ?? req.query?.token) as string | undefined;
    if (!token) {
      return res.redirect(`${env.FRONTEND_URL}/payment-result?status=error&msg=token_yok`);
    }

    try {
      const result = await IyzicoService.verifyPayment(token);
      if (!result.paid || !result.invoiceId) {
        logger.warn('İyzico ödeme başarısız', { token: token.slice(0, 16), err: result.errorMessage });
        return res.redirect(
          `${env.FRONTEND_URL}/payment-result?status=failed&msg=${encodeURIComponent(result.errorMessage ?? 'Ödeme başarısız')}`,
        );
      }

      const invoice = await Invoice.findByPk(result.invoiceId, {
        include: [{ model: InvoiceItem, as: 'items' }],
      });
      if (!invoice) {
        return res.redirect(`${env.FRONTEND_URL}/payment-result?status=error&msg=fatura_yok`);
      }
      if (invoice.status === 'paid') {
        // İdempotent — zaten ödenmiş, başarı sayfasına gönder
        return res.redirect(`${env.FRONTEND_URL}/payment-result?status=ok&invoice=${invoice.invoiceNum}`);
      }

      // Faturayı ödendi işaretle
      invoice.status = 'paid';
      invoice.paidAt = new Date();
      invoice.paymentMethod = 'iyzico';
      invoice.iyzicoPaymentId = result.paymentId ?? null;
      await invoice.save();

      // Kart saklandıysa SavedCard'a kaydet (sonraki abone tahsilatları için)
      if (result.savedCard) {
        try {
          await AutoRenewService.saveCardFromCheckout(invoice.userId, result.savedCard);
          logger.info('Kart saklandı', { user: invoice.userId, last4: result.savedCard.lastFourDigits });
        } catch (e) {
          logger.error('Kart kaydetme hatası', { error: (e as Error).message });
        }
      }

      // Servisleri provision et
      const items = (invoice.get('items') as InvoiceItem[]) ?? [];
      const provisioned: Array<Record<string, unknown>> = [];
      // Aynı servis birden çok kalemde geçebilir (ör. web sitesi = kurulum + abonelik).
      // Servisi bir kez işle; yoksa dönem iki kez ilerletilir.
      const handledServices = new Set<string>();
      for (const item of items) {
        if (!item.serviceId || handledServices.has(item.serviceId)) continue;
        handledServices.add(item.serviceId);
        const service = await Service.findByPk(item.serviceId);
        if (!service) continue;

        // Yenileme veya transfer siparişi mi? (notes'ta "RENEWAL:n:sid" veya "TRANSFER:n:sid")
        const renewMatch = /RENEWAL:(\d+):([\w-]+)/.exec(invoice.notes ?? '');
        const transferMatch = /TRANSFER:(\d+):([\w-]+)/.exec(invoice.notes ?? '');
        const isRenewal = renewMatch !== null && renewMatch[2] === service.id && service.type === 'domain';
        const isTransfer = transferMatch !== null && transferMatch[2] === service.id && service.type === 'domain';

        try {
          if (isRenewal) {
            const years = Number(renewMatch![1]);
            provisioned.push({
              type: 'domain_renew',
              ...(await ProvisioningService.renewDomain(service, years)),
              years,
            });
          } else if (isTransfer) {
            const years = Number(transferMatch![1]);
            provisioned.push({
              type: 'domain_transfer',
              ...(await ProvisioningService.transferDomain(service, years)),
              years,
            });
          } else if (service.status === 'pending') {
            if (service.type === 'hosting') {
              provisioned.push({ type: 'hosting', ...(await ProvisioningService.provisionHosting(service)) });
            } else if (service.type === 'vps') {
              provisioned.push({ type: 'vps', ...(await ProvisioningService.provisionVps(service)) });
            } else if (service.type === 'domain') {
              provisioned.push({ type: 'domain', ...(await ProvisioningService.provisionDomain(service)) });
            } else if (service.type === 'website') {
              // Otomatik provizyon yok — tasarım/teslim elle yapılır. Ama abonelik
              // ödendiği için servisi aktif et; yenileme motoru dönemi takip etsin.
              service.status = 'active';
              await service.save();
              provisioned.push({ type: 'website', serviceId: service.id, manual: true });
            }
          } else if (service.status === 'suspended') {
            // Ödenmemiş fatura yüzünden askıya alınmış servis → ödeme geldi, geri aç
            // ve dönemi ilerlet (gecikmiş yenileme ödendi).
            await ServiceLifecycleService.unsuspend(service.id);
            const due = service.nextDue ? new Date(service.nextDue as unknown as string) : null;
            service.nextDue = nextDueAfterPayment(due, service.billingCycle);
            await service.save();
            provisioned.push({ type: 'reactivated', serviceId: service.id });
          } else if (service.status === 'active') {
            // Aktif servisin yenileme faturası ödendi → dönemi ileri al.
            const due = service.nextDue ? new Date(service.nextDue as unknown as string) : null;
            service.nextDue = nextDueAfterPayment(due, service.billingCycle);
            await service.save();
            provisioned.push({ type: 'renewed', serviceId: service.id });
          }
        } catch (e) {
          logger.error('Provisioning hatası (iyzico callback)', {
            service: service.id,
            isRenewal,
            error: (e as Error).message,
          });
        }
      }

      // E-belge kes (başarısızlık ödemenin sonucunu etkilemez)
      let einvoice: { type?: string; uuid?: string; error?: string } | null = null;
      try {
        einvoice = await EInvoiceService.issueForInvoice(invoice.id);
      } catch (err) {
        einvoice = { error: (err as Error).message };
        logger.error('E-belge kesilemedi (iyzico)', { invoice: invoice.id, error: (err as Error).message });
      }

      await logActivity({
        userId: invoice.userId,
        action: 'payment.iyzico_success',
        resource: 'invoice',
        resourceId: invoice.id,
        details: { paymentId: result.paymentId, paidPrice: result.paidPrice, provisioned: provisioned.length },
        ip: req.ip,
      });

      // Müşteriye bildirim
      void User.findByPk(invoice.userId).then((u) => {
        if (!u) return;
        return NotificationService.sendInvoicePaid({
          to: u.email,
          firstName: u.firstName,
          invoiceNum: invoice.invoiceNum,
          items: items.map((it) => ({
            description: it.description,
            quantity: it.quantity ?? 1,
            unitPrice: Number(it.unitPrice),
            total: Number(it.total),
          })),
          subtotal: Number(invoice.subtotal),
          tax: Number(invoice.tax),
          total: Number(invoice.total),
          paidAt: invoice.paidAt ?? new Date(),
          einvoice:
            einvoice && 'type' in einvoice && einvoice.type
              ? { type: einvoice.type as 'efatura' | 'earsiv', id: invoice.edmInvoiceId ?? undefined }
              : null,
          provisioned: provisioned.map((p) => ({
            type: String(p.type ?? ''),
            domain: p.domain ? String(p.domain) : undefined,
            cpanelUser: p.cpanelUser ? String(p.cpanelUser) : undefined,
            cpanelUrl: p.cpanelUrl ? String(p.cpanelUrl) : undefined,
            ipAddress: p.ipAddress ? String(p.ipAddress) : undefined,
            ipv6: p.ipv6 ? String(p.ipv6) : undefined,
            password: p.rootPassword ? String(p.rootPassword) : undefined,
            sshKeyUsed: p.sshKeyUsed === true,
          })),
        }).catch(() => {});
      });

      logger.info('İyzico ödemesi tamamlandı', {
        invoice: invoice.id,
        paymentId: result.paymentId,
        total: invoice.total,
      });

      return res.redirect(
        `${env.FRONTEND_URL}/payment-result?status=ok&invoice=${invoice.invoiceNum}`,
      );
    } catch (err) {
      logger.error('İyzico callback hatası', { error: (err as Error).message });
      return res.redirect(
        `${env.FRONTEND_URL}/payment-result?status=error&msg=${encodeURIComponent((err as Error).message)}`,
      );
    }
});

paymentsRouter.post('/iyzico/callback', iyzicoCallbackHandler);
paymentsRouter.get('/iyzico/callback', iyzicoCallbackHandler);

// ── GET /payments/iyzico/verify (frontend için manuel doğrulama) ────────────
paymentsRouter.get(
  '/iyzico/verify',
  asyncHandler(async (req, res) => {
    const token = String(req.query.token ?? '');
    if (!token) throw ApiError.badRequest('Token gerekli');
    const result = await IyzicoService.verifyPayment(token);
    res.json({ success: true, data: result });
  }),
);
