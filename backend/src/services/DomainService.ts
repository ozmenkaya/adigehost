import * as soap from 'soap';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { IntegrationService } from './IntegrationService';

/**
 * DomainNameAPI (Atak Domain) SOAP entegrasyonu.
 * WSDL: https://whmcs.domainnameapi.com/DomainApi.svc?singlewsdl
 * Kimlik doğrulama: her istekte UserName + Password (panel kimlik bilgileri).
 * Kimlik bilgileri Entegrasyonlar'dan (provider: domainnameapi) okunur.
 *
 * Resmî SDK referansı: github.com/domainreseller/nodejs-dna
 */
const WSDL_PROD = 'https://whmcs.domainnameapi.com/DomainApi.svc?singlewsdl';

interface DnaCreds {
  username: string;
  password: string;
  testMode?: boolean;
}

let cachedClient: soap.Client | null = null;

async function getClient(): Promise<{ client: soap.Client; creds: DnaCreds }> {
  const raw = await IntegrationService.getCredentials('domainnameapi');
  if (!raw?.username || !raw?.password) {
    throw ApiError.internal('DomainNameAPI yapılandırılmamış (Entegrasyonlar → DomainNameAPI)');
  }
  const creds = raw as unknown as DnaCreds;
  if (!cachedClient) {
    cachedClient = await soap.createClientAsync(WSDL_PROD, { disableCache: true });
  }
  return { client: cachedClient, creds };
}

/** SOAP fonksiyonunu çağırır, <Fn>Result'ı çözer ve OperationResult'ı kontrol eder. */
async function call<T = Record<string, unknown>>(
  fn: string,
  request: Record<string, unknown>,
): Promise<T> {
  const { client } = await getClient();
  const method = (client as unknown as Record<string, (a: unknown) => Promise<unknown[]>>)[
    `${fn}Async`
  ];
  if (!method) throw ApiError.internal(`DomainNameAPI: bilinmeyen işlem ${fn}`);
  try {
    const [result] = (await method({ request })) as [Record<string, unknown>];
    const key = `${fn}Result`;
    let data = (result?.[key] ?? null) as Record<string, unknown> | null;
    if (!data) {
      const first = result ? Object.values(result)[0] : null;
      if (first && typeof first === 'object' && key in (first as object)) {
        data = (first as Record<string, unknown>)[key] as Record<string, unknown>;
      }
    }
    if (!data || typeof data !== 'object') {
      throw new ApiError(502, 'DomainNameAPI: yanıt alınamadı', 'DNA_ERROR');
    }
    if (data.OperationResult !== 'SUCCESS') {
      const msg = String(data.OperationMessage ?? 'işlem başarısız');
      throw new ApiError(502, `DomainNameAPI: ${msg}`, 'DNA_ERROR');
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error(`DomainNameAPI hatası (${fn})`, { error: (err as Error).message });
    throw new ApiError(502, `DomainNameAPI servis hatası (${fn})`, 'DNA_ERROR');
  }
}

export interface DomainAvailability {
  domain: string;
  tld: string;
  available: boolean;
  status: string;
  classicPrice?: number;
  currency?: string;
  period?: number;
}

export class DomainService {
  /** Auth + UserName/Password ile ortak request gövdesi. */
  private static async auth(): Promise<{ UserName: string; Password: string }> {
    const { creds } = await getClient();
    return { UserName: creds.username, Password: creds.password };
  }

  /** Domain müsaitlik sorgusu. domains: SLD listesi, tlds: uzantı listesi. */
  static async checkAvailability(
    domains: string[],
    tlds: string[],
    period = 1,
  ): Promise<DomainAvailability[]> {
    const auth = await this.auth();
    const data = await call('CheckAvailability', {
      ...auth,
      DomainNameList: { string: domains },
      TldList: { string: tlds },
      Period: period,
      Commad: 'create',
    });
    const list = (data.DomainAvailabilityInfoList as { DomainAvailabilityInfo?: unknown }) ?? {};
    let infos = list.DomainAvailabilityInfo;
    if (!infos) return [];
    if (!Array.isArray(infos)) infos = [infos];
    return (infos as Array<Record<string, unknown>>).map((i) => ({
      domain: `${i.DomainName}`,
      tld: `${i.Tld}`,
      available: i.Status === 'available',
      status: `${i.Status}`,
      classicPrice: i.Price ? Number(i.Price) : undefined,
      currency: i.Currency ? `${i.Currency}` : undefined,
      period: i.Period ? Number(i.Period) : undefined,
    }));
  }

  /** Desteklenen TLD'ler ve fiyatları. */
  static async getTldList(count = 100): Promise<unknown[]> {
    const auth = await this.auth();
    const data = await call('GetTldList', { ...auth, Count: count });
    const list = (data.TldInfoList as { TldInfo?: unknown }) ?? {};
    const infos = list.TldInfo;
    if (!infos) return [];
    return Array.isArray(infos) ? infos : [infos];
  }

  /** Bayi detayları (bağlantı testi + bakiye için). */
  static async getResellerDetails(): Promise<Record<string, unknown>> {
    const auth = await this.auth();
    const data = await call('GetResellerDetails', { ...auth, CurrencyId: 2 });
    return (data.ResellerInfo as Record<string, unknown>) ?? {};
  }

  /** Domain detayları. */
  static async getDetails(domainName: string): Promise<Record<string, unknown>> {
    const auth = await this.auth();
    return call('GetDetails', { ...auth, DomainName: domainName });
  }

  /**
   * Domain kaydı (iletişim bilgileriyle).
   * contacts: { Administrative, Billing, Technical, Registrant } her biri kişi nesnesi.
   */
  static async register(
    domainName: string,
    period: number,
    contacts: Record<string, unknown>,
    nameServers: string[] = ['dns.domainnameapi.com', 'web.domainnameapi.com'],
  ): Promise<Record<string, unknown>> {
    const auth = await this.auth();
    return call('RegisterWithContactInfo', {
      ...auth,
      DomainName: domainName,
      Period: period,
      Contacts: contacts,
      NameServerList: { string: nameServers },
      LockStatus: true,
      PrivacyProtectionStatus: false,
    });
  }

  /** Domain yenileme. */
  static async renew(domainName: string, period: number): Promise<Record<string, unknown>> {
    const auth = await this.auth();
    return call('Renew', { ...auth, DomainName: domainName, Period: period });
  }

  /** Nameserver güncelleme. */
  static async modifyNameServers(
    domainName: string,
    nameServers: string[],
  ): Promise<Record<string, unknown>> {
    const auth = await this.auth();
    return call('ModifyNameServer', {
      ...auth,
      DomainName: domainName,
      NameServerList: { string: nameServers },
    });
  }

  static async healthcheck(): Promise<boolean> {
    try {
      await this.getResellerDetails();
      return true;
    } catch {
      return false;
    }
  }
}
