import { Router } from 'express';
import { Invoice, InvoiceItem } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { EDMService } from '../services/EDMService';

/**
 * Müşteri fatura görüntüleme.
 * `authenticate` ile korunur (routes/index.ts). Müşteri yalnızca kendi
 * faturalarını görür; admin tümüne erişebilir. Ödeme başlatma /payments/iyzico/init
 * (invoiceId ile) üzerinden yapılır; havale bilgileri fatura oluşturma mailinde iletilir.
 */
export const invoicesRouter = Router();

// --- GET /invoices — kendi faturalarım ---
invoicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const invoices = await Invoice.findAll({
      where: { userId: req.user!.sub },
      include: [{ model: InvoiceItem, as: 'items' }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    res.json({ success: true, data: invoices });
  }),
);

// --- GET /invoices/:id — fatura detayı (sahiplik) ---
invoicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [{ model: InvoiceItem, as: 'items' }],
    });
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (req.user!.role !== 'admin' && invoice.userId !== req.user!.sub) throw ApiError.forbidden();
    res.json({ success: true, data: invoice });
  }),
);

// --- GET /invoices/:id/pdf — e-fatura/e-arşiv PDF'i (EDM'den) ---
invoicesRouter.get(
  '/:id/pdf',
  asyncHandler(async (req, res) => {
    const invoice = await Invoice.findByPk(req.params.id);
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (req.user!.role !== 'admin' && invoice.userId !== req.user!.sub) throw ApiError.forbidden();
    if (!invoice.edmInvoiceUuid) {
      throw ApiError.badRequest('Bu fatura için henüz e-belge kesilmemiş');
    }
    const pdf = await EDMService.getInvoicePdf(invoice.edmInvoiceUuid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoiceNum}.pdf"`);
    res.send(pdf);
  }),
);
