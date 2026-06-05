// eslint-disable-next-line @typescript-eslint/no-require-imports
const Iyzipay = require('iyzipay');
import { Invoice, InvoiceItem, type User } from '../models';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { IntegrationService } from './IntegrationService';

/**
 * İyzico ödeme entegrasyonu — Checkout Form (Hosted Payment Page).
 *
 * Akış:
 * 1) createCheckoutForm() → iyzico'da bir checkout session, paymentPageUrl döner.
 * 2) Müşteri o sayfaya yönlendirilir, kart bilgisini iyzico tarafında girer (3D Secure).
 * 3) iyzico, callbackUrl'a POST eder ({ token }).
 * 4) verifyPayment(token) → işlemin sonucunu doğrular.
 *
 * Kart numarası ve CVV asla bizim sunucumuza ulaşmaz (PCI uyumu iyzico'da).
 */

interface IyzicoCreds {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: { client: any; key: string } | null = null;

async function getClient(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  creds: IyzicoCreds;
}> {
  const raw = await IntegrationService.getCredentials('iyzico');
  if (!raw?.apiKey || !raw?.secretKey || !raw?.baseUrl) {
    throw ApiError.internal('İyzico yapılandırılmamış (Entegrasyonlar → İyzico)');
  }
  const creds = raw as unknown as IyzicoCreds;
  const cacheKey = `${creds.apiKey}:${creds.baseUrl}`;
  if (!cachedClient || cachedClient.key !== cacheKey) {
    cachedClient = {
      key: cacheKey,
      client: new Iyzipay({
        apiKey: creds.apiKey,
        secretKey: creds.secretKey,
        uri: creds.baseUrl,
      }),
    };
  }
  return { client: cachedClient.client, creds };
}

const toMoney = (n: number): string => Number(n).toFixed(2);

export interface CheckoutInitResult {
  token: string;
  paymentPageUrl: string;
  conversationId: string;
}

export class IyzicoService {
  /** Bağlantı testi: BIN sorgu (kimlik doğrulama yeterli). */
  static async healthcheck(): Promise<boolean> {
    try {
      const { client } = await getClient();
      return await new Promise<boolean>((resolve) => {
        client.installmentInfo.retrieve(
          {
            locale: 'tr',
            conversationId: `hc-${Date.now()}`,
            binNumber: '454671',
            price: '1.0',
          },
          (err: Error | null, result: { status?: string }) => {
            resolve(!err && result?.status === 'success');
          },
        );
      });
    } catch {
      return false;
    }
  }

  /** Bir fatura için iyzico Checkout Form oluşturur. */
  static async createCheckoutForm(
    invoiceId: string,
    callbackUrl: string,
  ): Promise<CheckoutInitResult> {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: InvoiceItem, as: 'items' }],
    });
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (invoice.status === 'paid') throw ApiError.conflict('Fatura zaten ödenmiş');

    // user'ı route handler önceden yükleyip context geçirmeli — burada loadla
    const { User: UserModel } = await import('../models');
    const user = (await UserModel.findByPk(invoice.userId)) as User | null;
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');

    const { client } = await getClient();
    const items = (invoice.get('items') as InvoiceItem[]) ?? [];
    if (items.length === 0) throw ApiError.badRequest('Fatura kalemi yok');

    const total = Number(invoice.total);
    const subtotal = Number(invoice.subtotal);
    const fullAddress =
      [user.address, user.district, user.city, user.postalCode].filter(Boolean).join(', ') ||
      'Belirtilmemiş';
    const phone = (user.phone ?? '+905555555555').replace(/[^\d+]/g, '');

    // Kalem fiyatları toplamının price'a (KDV hariç) eşit olması iyzico kuralı.
    // Bizde her kalemde "total" KDV hariç → toplam = subtotal. Eşitlemiyorsa son kalemde düzelt.
    const basketItems = items.map((it, i) => ({
      id: it.id || `item-${i}`,
      name: (it.description || `Kalem ${i + 1}`).slice(0, 60),
      category1: 'Hosting & Domain',
      itemType: 'VIRTUAL',
      price: toMoney(Number(it.total)),
    }));
    const sumOfItems = basketItems.reduce((s, b) => s + Number(b.price), 0);
    const diff = Number((subtotal - sumOfItems).toFixed(2));
    if (Math.abs(diff) >= 0.01 && basketItems.length > 0) {
      basketItems[0].price = toMoney(Number(basketItems[0].price) + diff);
    }

    const request = {
      locale: 'tr',
      conversationId: invoice.id,
      price: toMoney(subtotal),
      paidPrice: toMoney(total),
      currency: 'TRY',
      basketId: invoice.invoiceNum,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      enabledInstallments: [1, 2, 3, 6, 9],
      buyer: {
        id: user.id,
        name: user.firstName,
        surname: user.lastName,
        gsmNumber: phone,
        email: user.email,
        identityNumber: user.taxNumber ?? '11111111111',
        registrationAddress: user.address || fullAddress,
        ip: '0.0.0.0',
        city: user.city || 'İstanbul',
        country: 'Turkey',
        zipCode: user.postalCode ?? '00000',
      },
      shippingAddress: {
        contactName: `${user.firstName} ${user.lastName}`,
        city: user.city || 'İstanbul',
        country: 'Turkey',
        address: fullAddress,
        zipCode: user.postalCode ?? '00000',
      },
      billingAddress: {
        contactName: `${user.firstName} ${user.lastName}`,
        city: user.city || 'İstanbul',
        country: 'Turkey',
        address: fullAddress,
        zipCode: user.postalCode ?? '00000',
      },
      basketItems,
    };

    return new Promise<CheckoutInitResult>((resolve, reject) => {
      client.checkoutFormInitialize.create(
        request,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: Error | null, result: any) => {
          if (err) {
            logger.error('İyzico checkout form init hatası', { error: err.message });
            return reject(new ApiError(502, 'İyzico ödeme sayfası oluşturulamadı', 'IYZICO_INIT'));
          }
          if (result?.status !== 'success') {
            logger.error('İyzico checkout form başarısız', {
              code: result?.errorCode,
              msg: result?.errorMessage,
            });
            return reject(
              new ApiError(
                502,
                `İyzico: ${result?.errorMessage ?? 'bilinmeyen hata'}`,
                'IYZICO_INIT',
              ),
            );
          }
          resolve({
            token: String(result.token),
            paymentPageUrl: String(result.paymentPageUrl),
            conversationId: String(result.conversationId ?? invoice.id),
          });
        },
      );
    });
  }

  /** Callback sonrası ödeme durumunu doğrular. */
  static async verifyPayment(token: string): Promise<{
    paid: boolean;
    invoiceId?: string;
    paymentId?: string;
    paidPrice?: number;
    errorMessage?: string;
  }> {
    const { client } = await getClient();
    return new Promise((resolve, reject) => {
      client.checkoutForm.retrieve(
        { locale: 'tr', conversationId: '', token },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: Error | null, result: any) => {
          if (err) {
            logger.error('İyzico verify hatası', { error: err.message });
            return reject(new ApiError(502, 'İyzico doğrulama hatası', 'IYZICO_VERIFY'));
          }
          if (result?.status !== 'success') {
            return resolve({
              paid: false,
              errorMessage: result?.errorMessage ?? 'İyzico doğrulama başarısız',
            });
          }
          const paid = result.paymentStatus === 'SUCCESS';
          resolve({
            paid,
            invoiceId: result.conversationId ? String(result.conversationId) : undefined,
            paymentId: result.paymentId ? String(result.paymentId) : undefined,
            paidPrice: result.paidPrice ? Number(result.paidPrice) : undefined,
            errorMessage: paid ? undefined : `Ödeme durumu: ${result.paymentStatus}`,
          });
        },
      );
    });
  }
}
