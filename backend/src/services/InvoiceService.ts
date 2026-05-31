import { Op } from 'sequelize';
import { Invoice, InvoiceItem } from '../models/Invoice';
import { Service } from '../models/Service';
import { Product } from '../models/Product';
import { SettingsService } from './SettingsService';
import { calculateTotals, formatInvoiceNumber, round2 } from '../utils/helpers';
import { env } from '../config/env';

const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annually: 12 };

export class InvoiceService {
  /** Yıl içinde sıralı fatura numarası üretir (VUK: boşluksuz, sıralı). */
  static async nextInvoiceNumber(): Promise<string> {
    const prefix = await SettingsService.get('invoice_prefix', 'ARS');
    const year = new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const count = await Invoice.count({ where: { createdAt: { [Op.gte]: start } } });
    return formatInvoiceNumber(prefix, count + 1, year);
  }

  /** Serbest tutarlı ödenmemiş fatura (domain vb. ürün-dışı kalemler için). */
  static async createForAmount(
    userId: string,
    serviceId: string,
    description: string,
    amount: number,
  ): Promise<Invoice> {
    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const { subtotal, tax, total } = calculateTotals(amount, vatRate);
    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));
    const invoice = await Invoice.create({
      userId,
      invoiceNum: await this.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal,
      tax,
      total,
      dueDate: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
      notes: description,
    });
    await InvoiceItem.create({
      invoiceId: invoice.id,
      serviceId,
      description,
      quantity: 1,
      unitPrice: amount,
      total: amount,
    });
    return invoice;
  }

  /**
   * Admin'in elle oluşturduğu çok kalemli ödenmemiş fatura.
   * Kalemler servise bağlı değildir (serviceId yok); e-belge kesimi onayda yapılır.
   */
  static async createManual(
    userId: string,
    items: Array<{ description: string; quantity: number; unitPrice: number }>,
    opts: { notes?: string; dueDays?: number } = {},
  ): Promise<Invoice> {
    const cleanItems = items
      .map((it) => ({
        description: String(it.description).trim(),
        quantity: Math.max(1, Math.trunc(Number(it.quantity) || 1)),
        unitPrice: Number(it.unitPrice) || 0,
      }))
      .filter((it) => it.description && it.unitPrice >= 0);
    if (cleanItems.length === 0) throw new Error('En az bir geçerli fatura kalemi gerekli');

    const amount = cleanItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const { subtotal, tax, total } = calculateTotals(amount, vatRate);
    const dueDays = opts.dueDays ?? Number(await SettingsService.get('payment_due_days', '7'));

    const invoice = await Invoice.create({
      userId,
      invoiceNum: await this.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal,
      tax,
      total,
      dueDate: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
      notes: opts.notes ?? cleanItems.map((i) => i.description).join(', '),
    });
    for (const it of cleanItems) {
      await InvoiceItem.create({
        invoiceId: invoice.id,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: round2(it.quantity * it.unitPrice),
      });
    }
    return invoice;
  }

  /**
   * Bir hosting siparişi için ödenmemiş fatura oluşturur.
   * Dönem (billingCycle) ay sayısıyla çarpılır.
   */
  static async createForOrder(
    service: Service,
    product: Product,
    billingCycle: 'monthly' | 'quarterly' | 'annually',
  ): Promise<Invoice> {
    const months = CYCLE_MONTHS[billingCycle] ?? 1;
    const base =
      billingCycle === 'annually' && product.priceAnnually != null
        ? Number(product.priceAnnually)
        : Number(product.priceMonthly) * months;
    const setup = Number(product.setupFee ?? 0);
    const subtotal = base + setup;
    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const { tax, total } = calculateTotals(subtotal, vatRate);

    const dueDays = Number(await SettingsService.get('payment_due_days', '7'));
    const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);

    const invoice = await Invoice.create({
      userId: service.userId,
      invoiceNum: await this.nextInvoiceNumber(),
      status: 'unpaid',
      subtotal,
      tax,
      total,
      dueDate,
      notes: `${product.name} — ${billingCycle}`,
    });

    await InvoiceItem.create({
      invoiceId: invoice.id,
      serviceId: service.id,
      description: `${product.name} (${billingCycle === 'annually' ? 'Yıllık' : billingCycle === 'quarterly' ? '3 Aylık' : 'Aylık'})`,
      quantity: 1,
      unitPrice: base,
      total: base,
    });
    if (setup > 0) {
      await InvoiceItem.create({
        invoiceId: invoice.id,
        serviceId: service.id,
        description: 'Kurulum ücreti',
        quantity: 1,
        unitPrice: setup,
        total: setup,
      });
    }
    return invoice;
  }
}
