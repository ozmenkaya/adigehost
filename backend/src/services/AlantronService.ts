import axios, { isAxiosError } from 'axios';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';

/**
 * Alantron Alan Adı API entegrasyonu (v2.16).
 * Base URL : https://api.alantron.com/action.json
 * Auth     : Query/body param  resellerno + resellerpwd  (her istekte tekrar)
 * Belge    : https://www.alantron.com/turkce/destek/api/
 *
 * Desteklenen metodlar (döküman AA-00201 … AA-00227):
 *   checkavailability, createcontact, deletecontact, getcontact, updatecontact,
 *   modifycontact, registerdomain, renewdomain, deletedomain, getdomain,
 *   lockdomain, authcode, addnameserver, deletenameserver, modifynameserver, modifydomain
 *
 * ⚠️  Domain listesi API'si YOK (getdomainlist → "method not implemented").
 * ⚠️  Sunucu IP'si (91.99.186.98) Alantron panelinde API IP whitelist'ine eklenmeli.
 *
 * Fiyat formatı: { "domain.tld": { status, currency:"USD", price:"12.87" } }
 * extratlds=yes ile tek sorguda ~10 TLD birden döner.
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
  priceTry: number | null;
  priceUsd: number | null;   // USD fiyat (Alantron currency=USD döndürür)
  currency: string;
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
  /**
   * Bağlantı testi: checkavailability ile test sorgulama.
   * (getresellerinfo metodu Alantron'da mevcut değil; basit availability sorgusu kullanılır.)
   */
  static async healthcheck(): Promise<boolean> {
    try {
      await this.checkAvailability('testbaglantitest', 'com');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Alan adı müsaitlik sorgulama (tek TLD).
   * Yanıt: { "domain.tld": { status, currency:"USD", price:"12.87" } }
   */
  static async checkAvailability(domain: string, tld: string): Promise<AlantronAvailability> {
    const results = await this.checkAvailabilityBulk(domain, [tld.replace(/^\./, '')]);
    if (results.length > 0) return results[0];
    return {
      domain: `${domain}.${tld.replace(/^\./, '')}`, sld: domain, tld: tld.replace(/^\./, ''),
      available: false, status: 'unknown',
      priceTry: null, priceUsd: null, currency: 'USD', period: 1, isPremium: false,
    };
  }

  /**
   * Çok TLD'li müsaitlik sorgulama.
   * extratlds=yes ile tek API çağrısında ~10 TLD birden gelir — çok daha verimli.
   * İstenen TLD'ler filtrelenir; yanıtta eksik olanlar atlanır.
   */
  static async checkAvailabilityBulk(sld: string, tlds: string[]): Promise<AlantronAvailability[]> {
    const creds = await getCreds();
    const cleanTlds = tlds.map((t) => t.replace(/^\./, ''));
    // İlk TLD'yi tld parametresi, geri kalanları extratlds ile al.
    const firstTld = cleanTlds[0] ?? 'com';
    const data = await get<Record<string, unknown>>(creds, {
      type: 'checkavailability',
      domain: sld,
      tld: firstTld,
      extratlds: 'yes',
    });

    // Hata kontrolü
    if (String(data.status ?? '').toLowerCase() === 'hata') {
      const msg = String(data.description ?? data.mesaj ?? 'Alantron hatası');
      throw new ApiError(502, `Alantron checkAvailability: ${msg}`, 'ALANTRON_ERROR');
    }

    const results: AlantronAvailability[] = [];
    for (const tld of cleanTlds) {
      const fullDomain = `${sld}.${tld}`;
      const info = data[fullDomain] as Record<string, unknown> | undefined;
      if (!info) continue;
      const statusRaw = String(info.status ?? '').toLowerCase();
      const available = statusRaw === 'available';
      const priceRaw = info.price != null ? Number(info.price) : null;
      const currency = String(info.currency ?? 'USD');
      results.push({
        domain: fullDomain, sld, tld,
        available, status: statusRaw,
        priceTry: currency === 'TRY' ? priceRaw : null,
        priceUsd: currency === 'USD' ? priceRaw : null,
        currency, period: 1, isPremium: false,
      });
    }
    return results;
  }

  /**
   * Yetkili (contact) oluşturur → contactid döner.
   * Domain kaydından önce en az bir kez çalıştırılmalıdır.
   */
  /**
   * Yetkili (contact) oluşturur → contactid döner.
   * Domain kaydından önce zorunlu. cusername benzersiz olmalı.
   */
  static async createContact(contact: AlantronContact): Promise<number> {
    const creds = await getCreds();
    // cusername: zorunlu, benzersiz, harf+rakam
    const cusername = `c${Date.now()}`;
    const data = await post<Record<string, unknown>>(creds, {
      type: 'createcontact',
      cusername,
      name: `${contact.firstName} ${contact.lastName}`.trim(),
      company: contact.company ?? `${contact.firstName} ${contact.lastName}`.trim(),
      email: contact.email,
      address: contact.address,
      city: contact.city,
      country: contact.country.toLowerCase(),
      zip: contact.zip || '00000',
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
  /**
   * Domain kaydı. Döküman parametreleri: ownerid, adminid, billid, techid (contactid değil!).
   * Başarıda registrycode döner — yenileme ve sorgulama için saklanmalı.
   */
  static async register(
    domain: string,
    tld: string,
    year: number,
    contactId: number,
    nameServers: string[] = ['mptr02.alantron.com', 'mptr04.alantron.com'],
  ): Promise<{ registrycode: number; message: string }> {
    const creds = await getCreds();
    const cleanTld = tld.replace(/^\./, '');
    // Tek alan adı olarak gönder: domain="adigehost", tld parametresiz de denenebilir
    // Döküman: domain=alanadim.com (tam ad) ya da domain+tld ayrı
    const data = await post<Record<string, unknown>>(creds, {
      type: 'registerdomain',
      domain: `${domain}.${cleanTld}`,   // tam alan adı
      year,
      ownerid: contactId,
      adminid: contactId,
      billid: contactId,
      techid: contactId,
      pdns: nameServers[0],
      sdns: nameServers[1] ?? nameServers[0],
      privacy: 'no',
    });
    assertOk(data, 'registerdomain');
    const rc = Number(data.registrycode ?? data.registry_code ?? data.id ?? 0);
    logger.info('Alantron: domain kaydedildi', { domain: `${domain}.${cleanTld}`, year, registrycode: rc });
    return {
      registrycode: rc,
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

  /**
   * Domain bilgisi (registrycode ile).
   * subtype: 'all' (varsayılan), 'ns', 'dns', 'lock', 'regepoch', 'expepoch'
   * ⚠️  Domain listesi API'si YOK — getdomainlist "method not implemented".
   */
  static async getDomain(
    registrycode: number,
    subtype: 'all' | 'ns' | 'dns' | 'lock' | 'regepoch' | 'expepoch' = 'all',
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await get<Record<string, unknown>>(creds, {
      type: 'getdomain',
      registrycode,
      subtype,
    });
    // "Alan adi sizin tarafinizdan yonetilemez" → normal hata, fırlat
    if (String(data.status ?? '').toLowerCase() === 'hata') {
      throw new ApiError(404, String(data.description ?? 'Domain bulunamadı'), 'ALANTRON_NOT_FOUND');
    }
    return data;
  }

  /**
   * Domain son kullanma tarihini epoch olarak döndürür.
   * getdomain subtype=expepoch → { expepoch: 1234567890 }
   */
  static async getDomainExpiry(registrycode: number): Promise<Date | null> {
    try {
      const data = await this.getDomain(registrycode, 'expepoch');
      const epoch = data.expepoch ?? data.exp_epoch;
      if (epoch) return new Date(Number(epoch) * 1000);
      return null;
    } catch {
      return null;
    }
  }
}
