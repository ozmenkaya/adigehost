import axios, { isAxiosError } from 'axios';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';

/**
 * Alantron Alan Adı API entegrasyonu.
 * Base URL : https://api.alantron.com/action.json
 * Auth     : Query param  resellerno + resellerpwd  (her istekte tekrar)
 * Belge    : https://www.alantron.com/turkce/destek/api/
 *
 * ⚠️  Sunucu IP'si (91.99.186.98) Alantron panelinde API IP whitelist'ine eklenmeli.
 *     Aksi halde tüm istekler zaman aşımına uğrar.
 */

const BASE = 'https://api.alantron.com/action.json';

interface AlantronCreds {
  resellerno: string;
  resellerpwd: string;
  dkey?: string;
}

async function getCreds(): Promise<AlantronCreds> {
  const raw = await IntegrationService.getCredentials('alantron');
  if (!raw?.resellerno || !raw?.resellerpwd) {
    throw ApiError.internal('Alantron yapılandırılmamış (Entegrasyonlar → Alantron)');
  }
  return raw as unknown as AlantronCreds;
}

/** GET isteği gönderir; params'a resellerno + resellerpwd eklenir. */
async function get<T = Record<string, unknown>>(
  creds: AlantronCreds,
  params: Record<string, unknown>,
): Promise<T> {
  try {
    const { data } = await axios.get(BASE, {
      params: {
        resellerno: creds.resellerno,
        resellerpwd: creds.resellerpwd,
        lang: 'tr',
        responsetype: 'json',
        ...params,
      },
      timeout: 30_000,
    });
    return data as T;
  } catch (err) {
    throw toApiError(err, String(params.type ?? 'request'));
  }
}

/** POST isteği gönderir; body'ye kimlik bilgileri eklenir. */
async function post<T = Record<string, unknown>>(
  creds: AlantronCreds,
  params: Record<string, unknown>,
): Promise<T> {
  try {
    const body = new URLSearchParams();
    body.set('resellerno', creds.resellerno);
    body.set('resellerpwd', creds.resellerpwd);
    body.set('lang', 'tr');
    body.set('responsetype', 'json');
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) body.set(k, String(v));
    }
    const { data } = await axios.post(BASE, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    });
    return data as T;
  } catch (err) {
    throw toApiError(err, String(params.type ?? 'request'));
  }
}

function toApiError(err: unknown, ctx: string): ApiError {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const msg = err.response?.data?.mesaj ?? err.response?.data?.message ?? err.message;
    logger.error(`Alantron hatası (${ctx})`, { status, msg });
    if (status === 401 || status === 403)
      return ApiError.forbidden(`Alantron yetki hatası: ${msg}`);
    return new ApiError(502, `Alantron: ${msg}`, 'ALANTRON_ERROR');
  }
  if ((err as NodeJS.ErrnoException).code === 'ECONNABORTED') {
    return new ApiError(
      502,
      'Alantron API zaman aşımı. Sunucu IP (91.99.186.98) Alantron panelinde API whitelist\'e eklendi mi?',
      'ALANTRON_TIMEOUT',
    );
  }
  logger.error(`Alantron beklenmeyen hata (${ctx})`, { error: String(err) });
  return ApiError.internal('Alantron işlemi başarısız');
}

/** Alantron yanıtında hata var mı kontrol eder (status: "error"). */
function assertOk(data: Record<string, unknown>, ctx: string): void {
  if (String(data.status ?? '').toLowerCase() === 'error') {
    const msg = String(data.mesaj ?? data.message ?? data.hata ?? 'Bilinmeyen hata');
    logger.error(`Alantron iş hatası (${ctx})`, { msg, data });
    throw new ApiError(502, `Alantron ${ctx}: ${msg}`, 'ALANTRON_ERROR');
  }
}

// ── Exported types ───────────────────────────────────────────────────────────

export interface AlantronAvailability {
  domain: string;
  sld: string;
  tld: string;
  available: boolean;
  status: string;
  priceTry: number | null;    // TRY fiyat (Alantron TRY döndürür)
  priceUsd: number | null;    // null (DomainNameAPI uyumluluğu için)
  currency: 'TRY';
  period: number;
  isPremium: boolean;
}

export interface AlantronContact {
  firstName: string;
  lastName: string;
  company?: string;
  email: string;
  address: string;
  city: string;
  country: string;   // "tr"
  zip: string;
  phone: string;     // 90XXXXXXXXXX formatında
  fax?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AlantronService {
  /** Bağlantı testi: Bakiye sorgula. */
  static async getBalance(): Promise<{ message: string; resellerno: string }> {
    const creds = await getCreds();
    const data = await get<Record<string, unknown>>(creds, { type: 'getresellerinfo' });
    assertOk(data, 'getresellerinfo');
    return {
      message: String(data.mesaj ?? data.message ?? 'OK'),
      resellerno: creds.resellerno,
    };
  }

  /** Healthcheck: bağlantı testinin bool versiyonu. */
  static async healthcheck(): Promise<boolean> {
    try {
      await this.getBalance();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Alan adı müsaitlik sorgulama.
   * domain: gövde ("adigehost"), tld: uzantı ("com" / "com.tr")
   */
  static async checkAvailability(
    domain: string,
    tld: string,
  ): Promise<AlantronAvailability> {
    const creds = await getCreds();
    const cleanTld = tld.replace(/^\./, '');
    const data = await get<Record<string, unknown>>(creds, {
      type: 'checkavailability',
      domain,
      tld: cleanTld,
      extratlds: 'no',
    });
    assertOk(data, 'checkavailability');

    const details = (data.details as Record<string, unknown>[] | undefined)?.[0] ?? data;
    const statusRaw = String(
      details.durum ?? details.status ?? details.available ?? '',
    ).toLowerCase();
    const available =
      statusRaw === 'available' || statusRaw === 'müsait' || statusRaw === '1' || statusRaw === 'true';
    const price = details.fiyat ?? details.price ?? details.tl_fiyat ?? null;

    return {
      domain: `${domain}.${cleanTld}`,
      sld: domain,
      tld: cleanTld,
      available,
      status: statusRaw,
      priceTry: price != null ? Number(price) : null,
      priceUsd: null,
      currency: 'TRY',
      period: 1,
      isPremium: false,
    };
  }

  /**
   * Çok TLD'li müsaitlik sorgulama (DomainNameAPI uyumu için).
   * tlds: ['com', 'net', 'com.tr', ...]
   */
  static async checkAvailabilityBulk(
    sld: string,
    tlds: string[],
  ): Promise<AlantronAvailability[]> {
    const results = await Promise.allSettled(
      tlds.map((tld) => this.checkAvailability(sld, tld)),
    );
    return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  }

  /**
   * Yetkili (contact) oluşturur → contactid döner.
   * Domain kaydından önce en az bir kez çalıştırılmalıdır.
   */
  static async createContact(contact: AlantronContact): Promise<number> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'createcontact',
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      company: contact.company ?? contact.firstName,
      email: contact.email,
      address: contact.address,
      city: contact.city,
      country: contact.country,
      zip: contact.zip,
      phone: contact.phone,
      fax: contact.fax ?? contact.phone,
    });
    assertOk(data, 'createcontact');
    const contactId = data.contactid ?? data.cuserid ?? data.id;
    if (!contactId) throw ApiError.internal('Alantron createContact: contactid alınamadı');
    return Number(contactId);
  }

  /**
   * Domain kaydı.
   * registerdomain: domain + tld + year + 4 contactId (owner/admin/tech/billing)
   * nameservers: 2 adet NS adresi
   */
  static async register(
    domain: string,
    tld: string,
    year: number,
    contactId: number,
    nameServers: string[] = ['ns1.alantron.com', 'ns2.alantron.com'],
  ): Promise<{ registrycode: number; message: string }> {
    const creds = await getCreds();
    const cleanTld = tld.replace(/^\./, '');
    const data = await post<Record<string, unknown>>(creds, {
      type: 'registerdomain',
      domain,
      tld: cleanTld,
      year,
      ownercontactid: contactId,
      admincontactid: contactId,
      techcontactid: contactId,
      billingcontactid: contactId,
      pdns: nameServers[0],
      sdns: nameServers[1] ?? nameServers[0],
    });
    assertOk(data, 'registerdomain');
    logger.info('Alantron: domain kaydedildi', { domain: `${domain}.${cleanTld}`, year });
    return {
      registrycode: Number(data.registrycode ?? data.id ?? 0),
      message: String(data.mesaj ?? data.message ?? 'OK'),
    };
  }

  /**
   * Domain yenileme.
   * registrycode: Alantron'un iç ID'si (getdomainlist'ten alınır)
   * expepoch: Mevcut bitiş tarihi (Unix timestamp)
   */
  static async renew(
    registrycode: number,
    year: number,
    expEpoch: number,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'renewdomain',
      registrycode,
      year,
      expepoch: expEpoch,
    });
    assertOk(data, 'renewdomain');
    return data;
  }

  /** Kayıtlı domain listesi. */
  static async getDomainList(page = 1): Promise<Record<string, unknown>[]> {
    const creds = await getCreds();
    const data = await get<Record<string, unknown>>(creds, {
      type: 'getdomainlist',
      pagesize: 100,
      currpage: page,
    });
    assertOk(data, 'getdomainlist');
    const list = data.domainlist ?? data.list ?? data.details ?? [];
    return Array.isArray(list) ? list : [];
  }

  /** Domain bilgisi (registrycode ile). */
  static async getDomain(registrycode: number): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await get<Record<string, unknown>>(creds, {
      type: 'getdomain',
      registrycode,
    });
    assertOk(data, 'getdomain');
    return data;
  }
}
