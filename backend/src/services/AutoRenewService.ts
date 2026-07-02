import { Op } from 'sequelize';
import { Service, Invoice, InvoiceItem, User, SavedCard } from '../models';
import { IyzicoService } from './IyzicoService';
import { InvoiceService } from './InvoiceService';
import { EInvoiceService } from './EInvoiceService';
import { NotificationService } from './NotificationService';
import { ServiceLifecycleService } from './ServiceLifecycleService';
import { SettingsService } from './SettingsService';
import { encrypt, decrypt } from '../security/encryption';
import { logActivity } from './AuditService';
import { calculateTotals, round2 } from '../utils/helpers';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * Otomatik yenileme servisi.
 *
 * Akış (her gece 02:00 cron):
 *  1) `Service.nextDue ≤ now + 3 gün` ve `Service.autoRenew = true` olanları çek
 *  2) Kullanıcının varsayılan kayıtlı kartını bul
 *  3) Servisin bir sonraki dönemi için fatura oluştur
 *  4) Saklı kartla iyzico tahsilatı dene (non-3DS)
 *  5) Başarılıysa: paid + nextDue ileri + e-fatura + bildirim
 *  6) Başarısızsa: hata mailı + 24/48 saat sonra tekrar (Service.config.renewAttempts)
 *  7) 3 başarısız deneme sonrası servis suspended + admin'e mail
 */

const MAX_ATTEMPTS = 3;
const LOOKAHEAD_DAYS = 3;

function nextDueAfterCycle(current: Date, cycle: string | null): Date {
  const d = new Date(current);
  if (cycle === 'annually') d.setFullYear(d.getFullYear() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export class AutoRenewService {
  /**
   * Tek bir servisin yenileme akışı.
   * Returns: { ok, message }
   */
  static async renewService(serviceId: string): Promise<{ ok: boolean; message: string }> {
    const service = await Service.findByPk(serviceId);
    if (!service) return { ok: false, message: 'Servis yok' };
    if (!service.autoRenew) return { ok: false, message: 'Otomatik yenileme kapalı' };
    if (service.status === 'cancelled' || service.status === 'terminated') {
      return { ok: false, message: 'Servis iptal edilmiş' };
    }

    const user = await User.findByPk(service.userId);
    if (!user) return { ok: false, message: 'Müşteri yok' };

    // Varsayılan kart
    const card = await SavedCard.findOne({
      where: { userId: user.id },
      order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
    });
    if (!card) {
      await this.handleFailure(service, user, 'Kayıtlı kart yok');
      return { ok: false, message: 'Kayıtlı kart yok' };
    }

    // Yeni dönem için fatura oluştur
    const price = Number(service.price);
    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const { subtotal, tax, total } = calculateTotals(price, vatRate);
    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));

    const invoice = await Invoice.create({
      userId: user.id,
      invoiceNum: await InvoiceService.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal: round2(subtotal),
      tax,
      total,
      dueDate: new Date(Date.now() + dueDays * 86400000),
      notes: `Otomatik yenileme: ${service.name}`,
    });
    const item = await InvoiceItem.create({
      invoiceId: invoice.id,
      serviceId: service.id,
      description: `${service.name} — ${service.billingCycle === 'annually' ? 'Yıllık' : service.billingCycle === 'quarterly' ? '3 Aylık' : 'Aylık'} yenileme`,
      quantity: 1,
      unitPrice: price,
      total: price,
    });

    // İyzico'dan kart tokenını çöz
    const cardToken = decrypt(card.cardToken);
    const cardUserKey = decrypt(card.cardUserKey);

    const result = await IyzicoService.chargeWithSavedCard({
      invoiceId: invoice.id,
      amount: subtotal,
      paidPrice: total,
      cardToken,
      cardUserKey,
      user,
      items: [item],
      invoiceNum: invoice.invoiceNum,
    });

    if (result.paid) {
      // Faturayı paid yap, servisin nextDue'sini ileri al
      invoice.status = 'paid';
      invoice.paidAt = new Date();
      invoice.paymentMethod = 'iyzico_auto';
      invoice.iyzicoPaymentId = result.paymentId ?? null;
      await invoice.save();

      service.nextDue = nextDueAfterCycle(service.nextDue ?? new Date(), service.billingCycle);
      // Önceki başarısız deneme sayacını sıfırla
      service.config = { ...(service.config ?? {}), renewAttempts: 0 };
      await service.save();

      // E-fatura kes (başarısızlık akışı bozmaz)
      try {
        await EInvoiceService.issueForInvoice(invoice.id);
      } catch (e) {
        logger.error('Otomatik yenileme e-belge hatası', { invoice: invoice.id, err: (e as Error).message });
      }

      await logActivity({
        userId: user.id,
        action: 'service.auto_renew_success',
        resource: 'service',
        resourceId: service.id,
        details: { invoice: invoice.id, paymentId: result.paymentId, total },
      });

      // Bildirim
      void NotificationService.sendInvoicePaid({
        to: user.email,
        firstName: user.firstName,
        invoiceNum: invoice.invoiceNum,
        items: [{
          description: item.description,
          quantity: 1, unitPrice: price, total: price,
        }],
        subtotal: Number(invoice.subtotal),
        tax: Number(invoice.tax),
        total: Number(invoice.total),
        paidAt: invoice.paidAt ?? new Date(),
        einvoice: { type: 'efatura', id: invoice.edmInvoiceId ?? undefined },
        provisioned: [],
      }).catch(() => {});

      logger.info('Otomatik yenileme başarılı', { service: service.id, invoice: invoice.id });
      return { ok: true, message: `${service.name} yenilendi (${invoice.invoiceNum})` };
    }

    // BAŞARISIZ
    invoice.status = 'cancelled';
    await invoice.save();
    await this.handleFailure(service, user, result.errorMessage ?? 'İyzico tahsilat hatası');
    return { ok: false, message: result.errorMessage ?? 'Tahsilat başarısız' };
  }

  /** Başarısız tahsilat — sayaç + suspend kontrolü + mail. */
  private static async handleFailure(
    service: Service,
    user: User,
    reason: string,
  ): Promise<void> {
    const cfg = (service.config ?? {}) as Record<string, unknown>;
    const attempts = Number(cfg.renewAttempts ?? 0) + 1;
    service.config = { ...cfg, renewAttempts: attempts, lastRenewError: reason };
    await service.save();

    await logActivity({
      userId: user.id,
      action: 'service.auto_renew_failed',
      resource: 'service',
      resourceId: service.id,
      details: { reason, attempts, suspended: attempts >= MAX_ATTEMPTS },
    });

    // Son deneme de başarısızsa gerçek askıya alma (Hetzner powerOff / WHM suspend).
    // ServiceLifecycleService servisi yeniden yükleyip suspended + suspendedAt işler.
    if (attempts >= MAX_ATTEMPTS) {
      logger.warn('Otomatik yenileme — servis askıya alınıyor', { service: service.id, attempts });
      await ServiceLifecycleService.suspend(
        service.id,
        `Otomatik tahsilat ${MAX_ATTEMPTS} kez başarısız: ${reason}`,
      );
    }
  }

  /**
   * Cron tetikleyici — günde bir çalışır.
   * `nextDue` yaklaşan tüm servislerde renewService'i çağırır.
   */
  static async runDaily(): Promise<{
    processed: number; succeeded: number; failed: number;
  }> {
    const threshold = new Date(Date.now() + LOOKAHEAD_DAYS * 86400000);
    const services = await Service.findAll({
      where: {
        autoRenew: true,
        status: 'active',
        nextDue: { [Op.lte]: threshold },
      },
      limit: 200,
    });
    logger.info(`[auto-renew] ${services.length} servis kontrol edilecek`);

    let succeeded = 0, failed = 0;
    for (const svc of services) {
      // Aynı dönem için zaten ödenmiş bir fatura var mı? (idempotent)
      const recentPaid = await Invoice.findOne({
        where: {
          userId: svc.userId,
          status: 'paid',
          paidAt: { [Op.gt]: new Date(Date.now() - 7 * 86400000) },
        },
        include: [{
          model: InvoiceItem, as: 'items',
          where: { serviceId: svc.id }, required: true,
        }],
      });
      if (recentPaid) {
        logger.info('[auto-renew] Son 7 günde ödenmiş, atlanıyor', { service: svc.id });
        continue;
      }

      const r = await this.renewService(svc.id).catch((e) => ({
        ok: false, message: (e as Error).message,
      }));
      if (r.ok) succeeded++; else failed++;
    }

    logger.info('[auto-renew] Tamamlandı', { processed: services.length, succeeded, failed });
    return { processed: services.length, succeeded, failed };
  }

  /**
   * Callback sonrası kart bilgisini SavedCard tablosuna kaydet (idempotent).
   */
  static async saveCardFromCheckout(
    userId: string,
    card: {
      cardToken: string;
      cardUserKey: string;
      lastFourDigits?: string;
      cardAssociation?: string;
      cardFamily?: string;
    },
  ): Promise<SavedCard> {
    // Aynı cardUserKey + last4 varsa güncelle, yoksa ekle
    const existing = await SavedCard.findOne({
      where: { userId, cardLast4: card.lastFourDigits ?? '' },
    });
    if (existing) {
      existing.cardToken = encrypt(card.cardToken);
      existing.cardUserKey = encrypt(card.cardUserKey);
      await existing.save();
      return existing;
    }
    // İlk kartsa default yap
    const cardCount = await SavedCard.count({ where: { userId } });
    return SavedCard.create({
      userId,
      cardToken: encrypt(card.cardToken),
      cardUserKey: encrypt(card.cardUserKey),
      cardLast4: card.lastFourDigits ?? null,
      cardBrand: card.cardAssociation ?? null,
      cardAlias: card.cardFamily ?? null,
      isDefault: cardCount === 0,
    });
  }
}
