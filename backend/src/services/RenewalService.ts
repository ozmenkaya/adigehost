import { Op } from 'sequelize';
import { Service, Invoice, InvoiceItem, User } from '../models';
import { InvoiceService } from './InvoiceService';
import { NotificationService } from './NotificationService';
import { SettingsService } from './SettingsService';
import { calculateTotals, round2 } from '../utils/helpers';
import { logActivity } from './AuditService';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * Yenileme faturası üretimi — her gün (AutoRenewService'ten sonra) çalışır.
 *
 * Otomatik yenilemesi KAPALI (autoRenew=false) aktif hosting/VPS/web sitesi servislerinin
 * vadesi yaklaşınca, dönem fiyatıyla ödenmemiş bir yenileme faturası oluşturur ve
 * müşteriye bildirir. Böylece havale/manuel ödeyen müşteriler de fatura alır ve
 * ödemezlerse DunningService askıya alma zincirini işletebilir.
 *
 * autoRenew=true servisler AutoRenewService tarafından (saklı kartla) işlenir —
 * burada tekrar işlenmez. Domain yenileme ayrıdır (müşteri talebi + DomainSync).
 *
 * nextDue yalnızca ödeme geldiğinde ilerletilir (payments/admin approve). Fatura
 * açık kaldığı sürece bu servis için yeni fatura üretilmez (çift faturalama yok).
 */

const LOOKAHEAD_DAYS = 7;

export class RenewalService {
  static async runDaily(): Promise<{ created: number; skipped: number }> {
    const threshold = new Date(Date.now() + LOOKAHEAD_DAYS * 86400000);
    const services = await Service.findAll({
      where: {
        status: 'active',
        autoRenew: false,
        type: { [Op.in]: ['hosting', 'vps', 'website'] },
        nextDue: { [Op.lte]: threshold },
      },
      limit: 500,
    });
    logger.info(`[renewal] ${services.length} servis için yenileme faturası kontrol ediliyor`);

    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));

    let created = 0;
    let skipped = 0;

    for (const svc of services) {
      // Bu servise ait açık (ödenmemiş/gecikmiş) fatura zaten varsa çift üretme.
      const openInvoice = await Invoice.findOne({
        where: { userId: svc.userId, status: { [Op.in]: ['unpaid', 'overdue'] } },
        include: [
          { model: InvoiceItem, as: 'items', where: { serviceId: svc.id }, required: true },
        ],
      });
      if (openInvoice) {
        skipped++;
        continue;
      }

      const price = Number(svc.price);
      if (!(price > 0)) {
        // Fiyatsız (ör. taşınmış/eski kayıt) — otomatik fatura üretilemez, admin ilgilensin.
        skipped++;
        continue;
      }

      const { subtotal, tax, total } = calculateTotals(price, vatRate);
      const cycleLabel =
        svc.billingCycle === 'annually' ? 'Yıllık' : svc.billingCycle === 'quarterly' ? '3 Aylık' : 'Aylık';
      const description = `${svc.name} — ${cycleLabel} yenileme`;

      const invoice = await Invoice.create({
        userId: svc.userId,
        invoiceNum: await InvoiceService.nextInvoiceNumber(),
        status: 'unpaid',
        subtotal: round2(subtotal),
        tax,
        total,
        dueDate: new Date(Date.now() + dueDays * 86400000),
        notes: `Yenileme: ${svc.name}`,
      });
      await InvoiceItem.create({
        invoiceId: invoice.id,
        serviceId: svc.id,
        description,
        quantity: 1,
        unitPrice: price,
        total: price,
      });
      created++;

      await logActivity({
        userId: svc.userId,
        action: 'service.renewal_invoice_created',
        resource: 'service',
        resourceId: svc.id,
        details: { invoice: invoice.invoiceNum, total },
      });

      const user = await User.findByPk(svc.userId);
      if (user) {
        void NotificationService.sendInvoiceCreated({
          to: user.email,
          firstName: user.firstName,
          invoiceNum: invoice.invoiceNum,
          items: [{ description, quantity: 1, unitPrice: price, total: price }],
          subtotal: Number(invoice.subtotal),
          tax: Number(invoice.tax),
          total: Number(invoice.total),
          dueDate: new Date(invoice.dueDate),
        }).catch(() => {});
      }
    }

    logger.info('[renewal] Tamamlandı', { created, skipped });
    return { created, skipped };
  }
}
