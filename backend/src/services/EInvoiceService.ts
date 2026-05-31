import { Invoice, InvoiceItem, User } from '../models';
import { SettingsService, COMPANY_KEYS } from './SettingsService';
import { EDMService } from './EDMService';
import { buildInvoiceUBL, type UblParty, type UblLine } from './ubl';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * Bir faturayı EDM üzerinden e-fatura veya e-arşiv olarak keser.
 * Profil kararı: müşteri kurumsal + VKN + e-fatura mükellefi (CheckUser) → e-fatura,
 * aksi halde e-arşiv.
 */
export class EInvoiceService {
  static async issueForInvoice(invoiceId: string): Promise<{
    type: 'efatura' | 'earsiv';
    uuid?: string;
  }> {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: InvoiceItem, as: 'items' }],
    });
    if (!invoice) throw ApiError.notFound('Fatura bulunamadı');
    if (invoice.edmInvoiceUuid) throw ApiError.conflict('Bu fatura için e-belge zaten kesilmiş');

    const user = await User.findByPk(invoice.userId);
    if (!user) throw ApiError.notFound('Müşteri bulunamadı');

    // Satıcı bilgileri (Ayarlar → Şirket).
    const c = await SettingsService.getMany(COMPANY_KEYS);
    if (!c.company_vkn || !c.company_title) {
      throw ApiError.badRequest('Satıcı şirket bilgileri eksik (Ayarlar → Şirket Bilgileri)');
    }
    const supplier: UblParty = {
      vknTckn: c.company_vkn,
      title: c.company_title,
      taxOffice: c.company_tax_office,
      address: c.company_address || '-',
      district: c.company_district,
      city: c.company_city || '-',
      postalCode: c.company_postal_code,
      email: c.company_email,
      phone: c.company_phone,
    };

    // Müşteri (alıcı) bilgileri.
    const isCorporate = user.identityType === 'corporate';
    const vknTckn = (user.taxNumber || '11111111111').replace(/\D/g, '');
    const customer: UblParty = {
      vknTckn,
      title: isCorporate
        ? (user.company ?? `${user.firstName} ${user.lastName}`)
        : `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      taxOffice: user.taxOffice ?? undefined,
      address: user.address || '-',
      district: user.district ?? undefined,
      city: user.city || '-',
      postalCode: user.postalCode ?? undefined,
      email: user.email,
      phone: user.phone ?? undefined,
    };

    // Profil kararı: e-fatura yalnızca satıcının GB etiketi varsa (e-fatura mükellefiyse)
    // VE müşteri kurumsal + VKN + e-fatura mükellefiyse; aksi halde e-arşiv.
    let isEfatura = false;
    let receiverAlias = '';
    if (c.company_alias && isCorporate && vknTckn.length === 10) {
      try {
        const chk = await EDMService.checkUser(vknTckn);
        isEfatura = chk.registered;
        receiverAlias = chk.pkAlias ?? '';
      } catch (err) {
        logger.warn('EDM CheckUser başarısız, e-arşive düşülüyor', {
          error: (err as Error).message,
        });
      }
    }
    const profileId = isEfatura ? 'TICARIFATURA' : 'EARSIVFATURA';

    // Kalemler (KDV oranı ayardan).
    const vatRate = Number(await SettingsService.get('vat_rate', String(env.VAT_RATE)));
    const items = (invoice.get('items') as InvoiceItem[]) ?? [];
    const lines: UblLine[] = items.map((it) => ({
      name: it.description,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      vatRate,
    }));
    if (lines.length === 0) {
      lines.push({
        name: invoice.notes ?? 'Hizmet',
        quantity: 1,
        unitPrice: Number(invoice.subtotal),
        vatRate,
      });
    }

    // GİB fatura no: 3 harf + yıl + 9 hane. Sıralı ve boşluksuz (VUK) →
    // ayar tabanlı sayaç (edm_invoice_counter) ile üretilir.
    const prefix = (await SettingsService.get('efatura_prefix', 'FAT'))
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X');
    const year = new Date().getFullYear();
    const counter = Number(await SettingsService.get('edm_invoice_counter', '0')) + 1;
    const seq = String(counter).padStart(9, '0').slice(-9);
    const gibId = `${prefix}${year}${seq}`;

    const { xml, uuid } = buildInvoiceUBL({
      gibId,
      profileId,
      supplier,
      customer,
      lines,
      note: invoice.notes ?? undefined,
    });
    const fileName = `${gibId}.xml`;

    // Gönder. EDM kendi UUID'sini atar (e-faturada); durum sorgusu için onu saklarız.
    let edmUuid = uuid;
    if (isEfatura) {
      const res = await EDMService.sendInvoice(
        supplier.vknTckn,
        c.company_alias || '',
        vknTckn,
        receiverAlias,
        xml,
        fileName,
      );
      if (typeof res.uuid === 'string' && res.uuid) edmUuid = res.uuid;
    } else {
      const res = await EDMService.archiveInvoice(supplier.vknTckn, xml, fileName);
      if (typeof res.uuid === 'string' && res.uuid) edmUuid = res.uuid;
    }

    // Başarılı → sayacı ilerlet (gapless).
    await SettingsService.set('edm_invoice_counter', String(counter), 'billing');
    invoice.edmInvoiceUuid = edmUuid;
    invoice.edmInvoiceId = gibId;
    invoice.edmType = isEfatura ? 'efatura' : 'earsiv';
    await invoice.save();

    logger.info('E-belge kesildi', { invoice: invoice.id, type: invoice.edmType, gibId });
    return { type: isEfatura ? 'efatura' : 'earsiv', uuid };
  }
}
