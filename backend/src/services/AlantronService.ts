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
  /** Kayıt/transferde kullanılacak yetkili (contact) ID — boşsa resellerno kullanılır. */
  contactid?: string | number;
}

async function getCreds(): Promise<AlantronCreds> {
  const raw = await IntegrationService.getCredentials('alantron');
  if (!raw?.resellerno || !raw?.resellerpwd) {
    throw ApiError.internal('Alantron yapılandırılmamış (Entegrasyonlar → Alantron)');
  }
  return raw as unknown as AlantronCreds;
}

/**
 * Alantron yanıt gövdesini ayrıştırır.
 *
 * ⚠️  Özellikle `.tr` alan adlarında sunucu JSON'un ÖNÜNE düz metin ekleyebiliyor:
 *     `domain_name=BAĞLANTI BAŞARISIZ oysaki: alanadi.com.tr\nBAĞLANTI BAŞARISIZ\n{...}`
 * Bu durumda axios gövdeyi string bırakır; alan okumaları sessizce `undefined`
 * döner ve senkron boş nameserver / locked=false yazardı. Gövdedeki ilk `{` ile
 * son `}` arasını ayıklayıp parse ediyoruz; olmazsa hata fırlatıyoruz (sessiz
 * bozuk veriden iyidir).
 */
function parseBody<T>(data: unknown, ctx: string): T {
  if (typeof data !== 'string') return data as T;
  const start = data.indexOf('{');
  const end = data.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(data.slice(start, end + 1)) as T;
      logger.warn(`Alantron yanıtı düz metin öneki içeriyordu (${ctx})`, {
        prefix: data.slice(0, Math.min(start, 120)).replace(/\s+/g, ' ').trim(),
      });
      return parsed;
    } catch {
      /* aşağıda hata fırlatılır */
    }
  }
  logger.error(`Alantron yanıtı ayrıştırılamadı (${ctx})`, { body: data.slice(0, 300) });
  throw new ApiError(502, `Alantron yanıtı ayrıştırılamadı (${ctx})`, 'ALANTRON_BAD_RESPONSE');
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
    return parseBody<T>(data, String(params.type ?? 'request'));
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
    return parseBody<T>(data, String(params.type ?? 'request'));
  } catch (err) {
    throw toApiError(err, String(params.type ?? 'request'));
  }
}

function toApiError(err: unknown, ctx: string): ApiError {
  if (err instanceof ApiError) return err; // parseBody'den gelen hata olduğu gibi geçsin
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

/**
 * Alantron yanıtında iş hatası var mı kontrol eder.
 *
 * ⚠️  Alantron `lang=tr` ile hataları `{"status":"hata","description":"4713 ..."}`
 * biçiminde döndürüyor. Eskiden yalnızca `status === 'error'` kontrol edildiği için
 * BAŞARISIZ kayıt/yenileme/DNS işlemleri başarılı sayılıyordu (2026-09-04'te
 * modifycontact denemesinde yakalandı). Hata mesajı `description` alanında.
 */
function assertOk(data: Record<string, unknown>, ctx: string): void {
  const status = String(data.status ?? '').toLowerCase();
  if (status === 'error' || status === 'hata' || status === 'failed') {
    const msg = String(
      data.description ?? data.mesaj ?? data.message ?? data.hata ?? 'Bilinmeyen hata',
    );
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
   * Çok TLD'li müsaitlik sorgulama — her TLD için paralel istek.
   * Alantron extratlds=yes sabit bir TLD seti döndürdüğü için
   * kullanıcının istediği tüm TLD'leri kapsamak adına tek tek sorgularız.
   * 8'erli batch ile paralel çalıştırılır.
   */
  static async checkAvailabilityBulk(sld: string, tlds: string[]): Promise<AlantronAvailability[]> {
    const creds = await getCreds();
    const cleanTlds = tlds.map((t) => t.replace(/^\./, ''));
    const results: AlantronAvailability[] = [];

    const queryOne = async (tld: string): Promise<AlantronAvailability | null> => {
      try {
        const data = await get<Record<string, unknown>>(creds, {
          type: 'checkavailability', domain: sld, tld, extratlds: 'no',
        });
        if (String(data.status ?? '').toLowerCase() === 'hata') return null;
        const fullDomain = `${sld}.${tld}`;
        const info = data[fullDomain] as Record<string, unknown> | undefined;
        if (!info) return null;
        const statusRaw = String(info.status ?? '').toLowerCase();
        const available = statusRaw === 'available';
        const priceRaw = info.price != null ? Number(info.price) : null;
        const currency = String(info.currency ?? 'USD');
        return {
          domain: fullDomain, sld, tld,
          available, status: statusRaw,
          priceTry: currency === 'TRY' ? priceRaw : null,
          priceUsd: currency === 'USD' ? priceRaw : null,
          currency, period: 1, isPremium: false,
        };
      } catch {
        return null;
      }
    };

    // 8'erli paralel batch
    for (let i = 0; i < cleanTlds.length; i += 8) {
      const batch = cleanTlds.slice(i, i + 8);
      const batchResults = await Promise.all(batch.map(queryOne));
      for (const r of batchResults) if (r) results.push(r);
    }
    return results;
  }

  /**
   * Kayıt / transferde owner-admin-bill-tech olarak kullanılacak yetkili ID'si.
   *
   * ⚠️  Alantron panelinde alan adı, YETKİLİSİNİN kullanıcı adı altında görünür.
   * Her müşteri için ayrı contact üretilirse (`c<timestamp>`), alan adı kendi
   * bayi kullanıcı adımızla panelde GÖRÜNMEZ (Alantron destek, 2026-09-04).
   * Bu yüzden varsayılan olarak entegrasyondaki `contactid`, yoksa `resellerno`
   * kullanılır — ikisi de bayi hesabının kullanıcı adına bağlıdır.
   */
  static async getOwnerContactId(): Promise<number> {
    const creds = await getCreds();
    const id = Number(creds.contactid ?? creds.resellerno);
    if (!id || Number.isNaN(id)) {
      throw ApiError.internal('Alantron yetkili (contact) ID çözülemedi');
    }
    return id;
  }

  /** Yetkili bilgisi (cuserid ile). Yanıt cuserid anahtarı altında iç içe gelir. */
  static async getContact(contactId: number): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const raw = await get<Record<string, unknown>>(creds, {
      type: 'getcontact',
      cuserid: contactId,
    });
    const data = (raw[String(contactId)] as Record<string, unknown> | undefined) ?? raw;
    if (String(data.status ?? raw.status ?? '').toLowerCase() === 'hata') {
      throw new ApiError(
        404,
        String(data.description ?? raw.description ?? 'Yetkili bulunamadı'),
        'ALANTRON_NOT_FOUND',
      );
    }
    return data;
  }

  /**
   * Alan adının 4 yetkilisini (owner/admin/bill/tech) değiştirir — AA-00207.
   * Yanlış yetkiliyle kaydedilmiş alan adlarını bayi hesabına geri almak için.
   */
  static async modifyContacts(
    registrycode: number,
    contactId: number,
    contacts?: { owner?: number; admin?: number; bill?: number; tech?: number },
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const raw = await post<Record<string, unknown>>(creds, {
      type: 'modifycontact',
      registrycode,
      ownercontactid: contacts?.owner ?? contactId,
      admincontactid: contacts?.admin ?? contactId,
      billcontactid: contacts?.bill ?? contactId,
      techcontactid: contacts?.tech ?? contactId,
    });
    const data = (raw[String(registrycode)] as Record<string, unknown> | undefined) ?? raw;
    assertOk(data, 'modifycontact');
    logger.info('Alantron: alan adı yetkilileri güncellendi', { registrycode, contactId });
    return data;
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
    const raw = await post<Record<string, unknown>>(creds, {
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
    // getDomain'de olduğu gibi yanıt cusername anahtarı altında iç içe gelir.
    const data = (raw[cusername] as Record<string, unknown> | undefined) ?? raw;
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
    const fullDomain = `${domain}.${cleanTld}`;
    const raw = await post<Record<string, unknown>>(creds, {
      type: 'registerdomain',
      domain: fullDomain,   // tam alan adı
      year,
      ownerid: contactId,
      adminid: contactId,
      billid: contactId,
      billlid: contactId, // AA-00206 parametre tablosunda "billlid" olarak geçiyor
      techid: contactId,
      pdns: nameServers[0],
      sdns: nameServers[1] ?? nameServers[0],
      privacy: 'no',
    });
    // createcontact'ta olduğu gibi yanıt gönderdiğimiz anahtar (burada tam alan adı)
    // altında iç içe gelebiliyor — önce onu dene, yoksa kök seviyeye düş.
    const data = (raw[fullDomain] as Record<string, unknown> | undefined) ?? raw;
    assertOk(data, 'registerdomain');
    let rc = Number(data.registrycode ?? data.registry_code ?? data.id ?? 0);
    if (!rc) {
      logger.error('Alantron registerdomain: registrycode alınamadı, ham yanıt', { domain: fullDomain, raw });
      // Bazı uzantılarda registrycode anında oluşmuyor — getregistrycode ile dene (AA destek).
      rc = (await this.getRegistrycodeByDomain(fullDomain).catch(() => null)) ?? 0;
    }
    logger.info('Alantron: domain kaydedildi', { domain: fullDomain, year, registrycode: rc });
    return {
      registrycode: rc,
      message: String(data.mesaj ?? data.message ?? 'OK'),
    };
  }

  /**
   * Domain adından registrycode'u getirir (registerdomain yanıtı kaçırılırsa
   * ya da mevcut bir domain için registrycode kayıp/0 ise kurtarma yolu).
   */
  static async getRegistrycodeByDomain(domain: string): Promise<number | null> {
    const creds = await getCreds();
    const raw = await post<Record<string, unknown>>(creds, {
      type: 'getregistrycode',
      domain,
    });
    // createcontact/registerdomain'de olduğu gibi yanıt domain anahtarı altında iç içe gelir.
    const data = (raw[domain] as Record<string, unknown> | undefined) ?? raw;
    const rc = Number(data.registrycode ?? 0);
    return rc > 0 ? rc : null;
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
   * Bir domain'in başka bir registrar'dan Alantron'a transfer edilebilirliğini test eder.
   * Yanıt: { status: 'basarili' } veya 'hata' + description (örn. domain zaten Alantron'da,
   * kilitli, son 60 günde transfer edilmiş, vb.)
   */
  static async checkTransfer(domain: string): Promise<{
    transferable: boolean;
    message: string;
    raw: Record<string, unknown>;
  }> {
    const creds = await getCreds();
    const data = await get<Record<string, unknown>>(creds, {
      type: 'checktransfer',
      domain,
    });
    const status = String(data.status ?? '').toLowerCase();
    const transferable = status === 'basarili' || status === 'success';
    return {
      transferable,
      message: String(data.description ?? data.message ?? (transferable ? 'Transfer edilebilir' : 'Transfer reddedildi')),
      raw: data,
    };
  }

  /**
   * Dışarıdan domain transferi başlatır.
   * authCode: Domain'in mevcut registrar'ında atanmış EPP/transfer kodu.
   * Yanıtta registrycode döner; transfer 5-7 gün sürer (rgpstat).
   */
  static async transferDomain(opts: {
    domain: string;
    authCode: string;
    year: number;
    contactId: number; // owner/admin/billing/tech aynı
    nameServers?: string[];
  }): Promise<{
    registrycode: number;
    status: string;
    message: string;
  }> {
    const creds = await getCreds();
    const ns = opts.nameServers ?? ['mptr02.alantron.com', 'mptr04.alantron.com'];
    const data = await post<Record<string, unknown>>(creds, {
      type: 'transferdomain',
      domain: opts.domain,
      authcode: opts.authCode,
      year: opts.year,
      ownerid: opts.contactId,
      adminid: opts.contactId,
      billid: opts.contactId,
      techid: opts.contactId,
      pdns: ns[0],
      sdns: ns[1] ?? ns[0],
      privacy: 'no',
    });
    assertOk(data, 'transferdomain');
    const rc = Number(data.registrycode ?? data.registry_code ?? data.id ?? 0);
    logger.info('Alantron: transfer başlatıldı', { domain: opts.domain, year: opts.year, registrycode: rc });
    return {
      registrycode: rc,
      status: String(data.status ?? ''),
      message: String(data.mesaj ?? data.message ?? data.description ?? 'Transfer başlatıldı'),
    };
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
    // Yanıt beklenen `{ "<registrycode>": {...} }` biçiminde değilse sessizce boş
    // veri döndürmek yerine hata ver — aksi halde senkron boş NS/tarih yazar.
    const details = data[String(registrycode)];
    if (!details || typeof details !== 'object') {
      logger.error('Alantron getdomain: beklenmeyen yanıt biçimi', { registrycode, data });
      throw new ApiError(502, 'Alantron getdomain: beklenmeyen yanıt', 'ALANTRON_BAD_RESPONSE');
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
      // Alantron yanıtı registrycode anahtarı altında iç içe gelir:
      // { "<registrycode>": { expepoch: 1234567890 } }
      const details = (data[String(registrycode)] ?? data.details ?? data) as Record<
        string,
        unknown
      >;
      const epoch = details.expepoch ?? details.exp_epoch ?? data.expepoch;
      if (epoch) return new Date(Number(epoch) * 1000);
      return null;
    } catch {
      return null;
    }
  }

  /**
   * DNS / Nameserver güncelleme (modifydomain).
   * En fazla 5 DNS sunucu desteklenir (dns0..dns4).
   */
  static async modifyDns(
    registrycode: number,
    nameServers: string[],
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const params: Record<string, unknown> = { type: 'modifydomain', registrycode };
    nameServers.slice(0, 5).forEach((ns, i) => {
      params[`dns${i}`] = ns;
    });
    const data = await post<Record<string, unknown>>(creds, params);
    assertOk(data, 'modifydomain');
    logger.info('Alantron: DNS güncellendi', { registrycode, nameServers });
    return data;
  }

  /**
   * Domain kilit durumunu değiştir (transfer korumalı/transfer açık).
   * locked: true → 'yes', false → 'no'
   */
  static async setLock(
    registrycode: number,
    locked: boolean,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'lockdomain', registrycode, locked: locked ? 'yes' : 'no',
    });
    assertOk(data, 'lockdomain');
    return data;
  }

  /**
   * Transfer (auth) kodu ata. 6-32 karakter.
   */
  static async setAuthCode(
    registrycode: number,
    authCode: string,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    if (authCode.length < 6 || authCode.length > 32) {
      throw ApiError.badRequest('Auth kodu 6-32 karakter olmalı');
    }
    const data = await post<Record<string, unknown>>(creds, {
      type: 'authcode', registrycode, auth: authCode,
    });
    assertOk(data, 'authcode');
    return data;
  }

  /**
   * Child nameserver ekler (kendi domain'ine bağlı ns kayıtları).
   * Örn. ns1.adigehost.com → 91.99.186.98
   */
  static async addNameserver(
    registrycode: number,
    nameserver: string,
    ipAddress: string,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'addnameserver', registrycode, ns: nameserver, ip: ipAddress,
    });
    assertOk(data, 'addnameserver');
    return data;
  }

  /** Child nameserver IP'sini günceller. */
  static async modifyNameserver(
    registrycode: number,
    nameserver: string,
    ipAddress: string,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'modifynameserver', registrycode, ns: nameserver, ip: ipAddress,
    });
    assertOk(data, 'modifynameserver');
    return data;
  }

  /** Child nameserver sil. */
  static async deleteNameserver(
    registrycode: number,
    nameserver: string,
  ): Promise<Record<string, unknown>> {
    const creds = await getCreds();
    const data = await post<Record<string, unknown>>(creds, {
      type: 'deletenameserver', registrycode, ns: nameserver,
    });
    assertOk(data, 'deletenameserver');
    return data;
  }

  /**
   * Domain'in tüm bilgilerini güzelleştirilmiş şekilde döndürür.
   * subtype=all → ns kayıtları + dns + lock + tarihler
   */
  static async getDomainFull(registrycode: number): Promise<{
    domain: string;
    registrationDate?: Date;
    expiryDate?: Date;
    nameServers: string[];
    locked: boolean;
    authCode?: string;
    privacy: boolean;
    /** Alan adının yetkilileri (owner/admin/bill/tech contact ID'leri). */
    contacts: { owner: number | null; admin: number | null; bill: number | null; tech: number | null };
    childNameServers: Array<{ ns: string; ip: string }>;
    raw: Record<string, unknown>;
  }> {
    const data = await this.getDomain(registrycode, 'all');
    // Alantron yanıtı: { "<registrycode>": { dns0, dns1, dns2, locked, expepoch, ... } }
    const details = (data[String(registrycode)] ?? data.details ?? data) as Record<string, unknown>;

    // dns0..dns4 → diziye topla
    const nameServers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const v = details[`dns${i}`];
      if (v && String(v).trim()) nameServers.push(String(v));
    }
    // Eğer dns dizisi varsa onu da ekle (eski format)
    if (Array.isArray(details.dns)) {
      for (const d of details.dns as string[]) if (d && !nameServers.includes(d)) nameServers.push(d);
    }

    // Child nameserver (ns dizisi varsa)
    const nsArr = (details.ns as Array<Record<string, unknown>> | string[] | undefined) ?? [];
    const childNameServers = Array.isArray(nsArr)
      ? nsArr.map((n) => {
          if (typeof n === 'string') return { ns: n, ip: '' };
          return {
            ns: String(n.ns ?? n.nameserver ?? n.host ?? ''),
            ip: String(n.ip ?? n.ipaddress ?? n.address ?? ''),
          };
        }).filter((x) => x.ns)
      : [];

    const lock = String(details.locked ?? details.lock ?? '').toLowerCase();
    const exp = details.expepoch ? Number(details.expepoch) : null;
    const reg = details.regepoch ? Number(details.regepoch) : null;
    const privacy = String(details.private ?? '').toLowerCase() === 'yes';
    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    return {
      domain: String(details.domain ?? ''),
      registrationDate: reg ? new Date(reg * 1000) : undefined,
      expiryDate: exp ? new Date(exp * 1000) : undefined,
      nameServers,
      locked: lock === 'yes' || lock === 'true' || lock === '1',
      authCode: details.authcode ? String(details.authcode) : undefined,
      privacy,
      contacts: {
        owner: num(details.owner),
        admin: num(details.admin),
        bill: num(details.bill),
        tech: num(details.tech),
      },
      childNameServers,
      raw: data,
    };
  }
}
