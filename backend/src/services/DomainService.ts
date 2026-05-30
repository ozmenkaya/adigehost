import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';

/**
 * DomainNameAPI (Atak Domain) REST entegrasyonu.
 * Base: https://api.domainresellerapi.com/api/v1  (test: ote.domainresellerapi.com)
 * Auth header'ları: X-API-KEY: <apiKey>, __reseller: <resellerId>
 * Kimlik bilgileri Entegrasyonlar'dan (provider: domainnameapi) okunur.
 *
 * Resmî SDK referansı: github.com/domainreseller/php-dna (DNARest.php)
 */
const URL_PROD = 'https://api.domainresellerapi.com/api/v1';
const URL_OTE = 'https://ote.domainresellerapi.com/api/v1';

interface DnaCreds {
  resellerId: string;
  apiKey: string;
  testMode?: boolean;
}

let client: AxiosInstance | null = null;
let clientKey: string | null = null;

async function getClient(): Promise<AxiosInstance> {
  const raw = await IntegrationService.getCredentials('domainnameapi');
  if (!raw?.resellerId || !raw?.apiKey) {
    throw ApiError.internal('DomainNameAPI yapılandırılmamış (Entegrasyonlar → DomainNameAPI)');
  }
  const creds = raw as unknown as DnaCreds;
  const cacheKey = `${creds.resellerId}:${creds.testMode ? 'ote' : 'prod'}`;
  if (client && clientKey === cacheKey) return client;
  clientKey = cacheKey;
  client = axios.create({
    baseURL: creds.testMode ? URL_OTE : URL_PROD,
    headers: {
      'X-API-KEY': creds.apiKey,
      __reseller: creds.resellerId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  return client;
}

function toApiError(err: unknown, ctx: string): ApiError {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 502;
    const apiErr = err.response?.data?.error as { message?: string; details?: string } | undefined;
    const message = apiErr?.message ?? err.message;
    logger.error(`DomainNameAPI hatası (${ctx})`, { status, message, details: apiErr?.details });
    if (status === 400 || status === 422) return ApiError.badRequest(`Domain: ${message}`);
    return new ApiError(502, `DomainNameAPI servis hatası: ${message}`, 'DNA_ERROR');
  }
  logger.error(`DomainNameAPI beklenmeyen hata (${ctx})`, { error: String(err) });
  return ApiError.internal('DomainNameAPI işlemi başarısız');
}

export interface DomainAvailability {
  domain: string; // tam alan adı (orneksite.com)
  sld: string; // orneksite
  tld: string; // com
  available: boolean;
  status: string;
  priceUsd: number | null;
  currency: string;
  period: number;
  isPremium: boolean;
  reason?: string | null;
}

export interface DomainContact {
  contactType: 'Registrant' | 'Admin' | 'Tech' | 'Billing';
  firstName: string;
  lastName: string;
  companyName?: string;
  eMail: string;
  address: string;
  city: string;
  state?: string;
  country: string; // ISO-2 (TR)
  postalCode?: string;
  phoneCountryCode: string; // "90"
  phone: string;
}

const DEFAULT_NS = ['dns.domainnameapi.com', 'web.domainnameapi.com'];

export class DomainService {
  /** Bayi bakiyesi (bağlantı testi + kontrol için). */
  static async getBalance(): Promise<{
    tryBalance: number;
    usdBalance: number;
    resellerName: string;
  }> {
    try {
      const { data } = await (await getClient()).get('/deposit/accounts/me');
      return {
        tryBalance: Number(data.tryBalance ?? 0),
        usdBalance: Number(data.usdBalance ?? 0),
        resellerName: String(data.resellerName ?? ''),
      };
    } catch (err) {
      throw toApiError(err, 'getBalance');
    }
  }

  /** Domain müsaitlik + fiyat sorgusu. sld'ler × tld'ler. */
  static async checkAvailability(slds: string[], tlds: string[]): Promise<DomainAvailability[]> {
    const body = slds.flatMap((sld) =>
      tlds.map((tld) => ({ domainName: `${sld}.${tld.replace(/^\./, '')}` })),
    );
    if (body.length === 0) return [];
    try {
      const { data } = await (await getClient()).post('/domains/bulk-search', body);
      const infos = (data.infos ?? data) as Array<Record<string, unknown>>;
      if (!Array.isArray(infos)) return [];
      return infos.map((i) => {
        const domain = String(i.domainName ?? '');
        const tld = String(i.tld ?? domain.split('.').slice(1).join('.')).toLowerCase();
        const sld = domain.toLowerCase().replace(`.${tld}`, '');
        const status = String(i.status ?? '').toLowerCase();
        return {
          domain,
          sld,
          tld,
          available: status === 'available',
          status,
          priceUsd: i.price != null ? Number(i.price) : null,
          currency: String(i.currency ?? 'USD'),
          period: Number(i.period ?? 1),
          isPremium: Boolean(i.isPremium),
          reason: (i.reason as string) ?? null,
        };
      });
    } catch (err) {
      throw toApiError(err, 'checkAvailability');
    }
  }

  /** Domain detayları. */
  static async getDetails(domainName: string): Promise<Record<string, unknown>> {
    try {
      const { data } = await (await getClient()).get('/domains/info', { params: { domainName } });
      return data;
    } catch (err) {
      throw toApiError(err, 'getDetails');
    }
  }

  /** Domain kaydı (iletişim bilgileriyle). */
  static async register(
    domainName: string,
    period: number,
    contact: DomainContact,
    nameServers: string[] = DEFAULT_NS,
  ): Promise<Record<string, unknown>> {
    // Tüm roller için aynı kişi (registrant) kullanılır.
    const contacts = (['Registrant', 'Admin', 'Tech', 'Billing'] as const).map((t) => ({
      ...contact,
      contactType: t,
    }));
    try {
      const { data } = await (
        await getClient()
      ).post('/domains/register-with-contacts', {
        domainName,
        period,
        nameServers,
        isLocked: true,
        privacyEnabled: false,
        contacts,
        additionalAttributes: {},
      });
      logger.info('Domain kaydedildi', { domainName, period });
      return data;
    } catch (err) {
      throw toApiError(err, 'register');
    }
  }

  /** Domain yenileme. */
  static async renew(domainName: string, period: number): Promise<Record<string, unknown>> {
    try {
      const { data } = await (await getClient()).post('/domains/renew', { domainName, period });
      return data;
    } catch (err) {
      throw toApiError(err, 'renew');
    }
  }

  /** Nameserver güncelleme. */
  static async modifyNameServers(
    domainName: string,
    nameServers: string[],
  ): Promise<Record<string, unknown>> {
    try {
      const { data } = await (
        await getClient()
      ).put('/domains/dns/name-server', {
        domainName,
        nameServers,
      });
      return data;
    } catch (err) {
      throw toApiError(err, 'modifyNameServers');
    }
  }

  static async healthcheck(): Promise<boolean> {
    try {
      await this.getBalance();
      return true;
    } catch {
      return false;
    }
  }
}
