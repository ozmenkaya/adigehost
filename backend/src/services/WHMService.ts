import https from 'node:https';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { decrypt } from '../security/encryption';
import type { Server } from '../models/Server';

/**
 * WHM/cPanel API 1 istemcisi (https://api.docs.cpanel.net/whm/).
 * Hosting hesabı oluşturma, askıya alma, şifre, istatistik vb.
 *
 * Kimlik doğrulama: `Authorization: whm <user>:<api-token>` başlığı.
 * Çok-sunucu: her hosting bir Server'a (servers tablosu) bağlıdır; bağlantı
 * o sunucunun şifreli whm_token'ından kurulur (WHMService.forServer).
 *
 * NOT: WHM sunucuları çoğu zaman kendi sertifikasını kullanır; sertifika
 * doğrulaması WHM_REJECT_UNAUTHORIZED ile yönetilir (varsayılan: kapalı).
 */
export interface WhmConnection {
  host: string;
  port: number;
  user: string;
  token: string;
}

export interface CreateAccountParams {
  username: string; // cPanel kullanıcı adı (max 16, [a-z0-9])
  domain: string;
  password: string;
  contactemail?: string;
  plan?: string; // WHM paket adı
  quota?: number; // disk MB (0 = sınırsız)
}

export class WHMService {
  private client: AxiosInstance;

  constructor(conn: WhmConnection) {
    this.client = axios.create({
      baseURL: `https://${conn.host}:${conn.port}/json-api`,
      headers: { Authorization: `whm ${conn.user}:${conn.token}` },
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized:
          env.NODE_ENV === 'production' && process.env.WHM_REJECT_UNAUTHORIZED === 'true',
      }),
    });
  }

  /** servers tablosundaki bir kayıttan (şifreli token çözülerek) istemci kurar. */
  static forServer(server: Server): WHMService {
    if (!server.whmHost || !server.whmToken) {
      throw ApiError.internal(`Sunucu (${server.name}) WHM bağlantısı yapılandırılmamış`);
    }
    return new WHMService({
      host: server.whmHost,
      port: server.whmPort,
      user: server.whmUser,
      token: decrypt(server.whmToken),
    });
  }

  /** Tek-sunuculu kurulum için ortam değişkenlerinden istemci kurar. */
  static fromEnv(): WHMService {
    if (!env.WHM_HOST || !env.WHM_API_TOKEN) {
      throw ApiError.internal('WHM ortam değişkenleri yapılandırılmamış');
    }
    return new WHMService({
      host: env.WHM_HOST,
      port: env.WHM_PORT,
      user: env.WHM_USER,
      token: env.WHM_API_TOKEN,
    });
  }

  /** WHM API 1 çağrısı (GET, query parametreli). */
  private async call<T = unknown>(func: string, params: Record<string, unknown> = {}): Promise<T> {
    try {
      const { data } = await this.client.get(`/${func}`, {
        params: { 'api.version': 1, ...params },
      });
      // WHM yanıtı: { metadata: { result: 1|0, reason }, data: {...} }
      const meta = data?.metadata;
      if (meta && meta.result === 0) {
        throw new ApiError(502, `WHM: ${meta.reason ?? 'bilinmeyen hata'}`, 'WHM_ERROR');
      }
      return data?.data ?? data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw this.toApiError(err, func);
    }
  }

  private toApiError(err: unknown, context: string): ApiError {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 502;
      logger.error(`WHM API hatası (${context})`, { status, message: err.message });
      if (status === 401 || status === 403) {
        return new ApiError(502, 'WHM kimlik doğrulama hatası', 'WHM_AUTH');
      }
      return new ApiError(502, `WHM servis hatası (${context})`, 'WHM_ERROR');
    }
    logger.error(`WHM beklenmeyen hata (${context})`, { error: String(err) });
    return ApiError.internal('WHM işlemi başarısız');
  }

  // --- Hesap yönetimi ---
  createAccount(p: CreateAccountParams) {
    return this.call('createacct', {
      username: p.username,
      domain: p.domain,
      password: p.password,
      contactemail: p.contactemail,
      plan: p.plan,
      quota: p.quota ?? 0,
    });
  }

  suspendAccount(user: string, reason?: string) {
    return this.call('suspendacct', { user, reason });
  }

  unsuspendAccount(user: string) {
    return this.call('unsuspendacct', { user });
  }

  terminateAccount(user: string) {
    return this.call('removeacct', { user });
  }

  changePassword(user: string, password: string) {
    return this.call('passwd', { user, password });
  }

  accountSummary(user: string) {
    return this.call('accountsummary', { user });
  }

  /**
   * Hesap için tek kullanımlık cPanel/Webmail oturumu açar (WHM create_user_session).
   * Dönen URL şifre sormadan giriş yapar ve kısa ömürlüdür.
   *
   * NOT: URL'i WHM kendi yapılandırılmış hostname'iyle üretir (IP ile bağlansak
   * bile) — böylece tarayıcıda sertifika adı uyuşmazlığı oluşmaz.
   */
  createUserSession(user: string, service: 'cpaneld' | 'webmaild' = 'cpaneld') {
    return this.call<{ url: string; session: string; cp_security_token: string; expires: number }>(
      'create_user_session',
      { user, service },
    );
  }

  listAccounts() {
    return this.call('listaccts');
  }

  /** WHM hosting paketlerini (package/plan) listeler. */
  async listPackages(): Promise<
    Array<{ name: string; QUOTA?: string; BWLIMIT?: string; MAXADDON?: string; MAXSQL?: string }>
  > {
    const data = (await this.call('listpkgs')) as { pkg?: unknown } | unknown;
    const pkgs = (data as { pkg?: unknown[] })?.pkg ?? data;
    return Array.isArray(pkgs) ? (pkgs as Array<{ name: string }>) : [];
  }

  /** Sunucu yük/disk bilgisi (kapasite senkronu için). */
  systemLoad() {
    return this.call('systemloadavg');
  }

  /** cPanel UAPI modülünü WHM üzerinden çağırır (databases, subdomains vb.). */
  private cpanel<T = unknown>(
    user: string,
    module: string,
    func: string,
    params: Record<string, unknown> = {},
  ) {
    return this.call<T>('cpanel', {
      cpanel_jsonapi_user: user,
      cpanel_jsonapi_apiversion: 3,
      cpanel_jsonapi_module: module,
      cpanel_jsonapi_func: func,
      ...params,
    });
  }

  listDatabases(user: string) {
    return this.cpanel(user, 'Mysql', 'list_databases');
  }

  createDatabase(user: string, name: string) {
    return this.cpanel(user, 'Mysql', 'create_database', { name });
  }

  listSubdomains(user: string) {
    return this.cpanel(user, 'SubDomain', 'list_subdomains');
  }

  // ── E-posta hesapları (cPanel UAPI Email modülü) ─────────────────────────

  /** Tüm e-posta hesaplarını disk kullanımıyla listeler. */
  async listEmailAccounts(user: string): Promise<Array<{
    email: string; login: string; domain: string;
    quota: number; diskused: number; diskusedpercent: number;
  }>> {
    const raw = await this.cpanel<unknown>(user, 'Email', 'list_pops_with_disk');
    const rows = this.extractUapiData<Record<string, unknown>>(raw);
    return rows.map((r) => ({
      email: String(r.email ?? `${r.login}@${r.domain}`),
      login: String(r.login ?? ''),
      domain: String(r.domain ?? ''),
      quota: Number(r.quota ?? 0),
      diskused: Number(r.diskused ?? 0),
      diskusedpercent: Number(r.diskusedpercent_float ?? r.diskusedpercent ?? 0),
    }));
  }

  /** E-posta hesabı oluşturur. quota MB (0 = sınırsız). */
  addEmailAccount(user: string, login: string, domain: string, password: string, quota = 250) {
    return this.cpanel(user, 'Email', 'add_pop', {
      email: login,
      domain,
      password,
      quota,
      skip_update_db: 0,
    });
  }

  /** E-posta hesabı siler. */
  deleteEmailAccount(user: string, login: string, domain: string) {
    return this.cpanel(user, 'Email', 'delete_pop', { email: login, domain });
  }

  /** E-posta hesabı şifresini değiştirir. */
  changeEmailPassword(user: string, login: string, domain: string, password: string) {
    return this.cpanel(user, 'Email', 'passwd_pop', { email: login, domain, password });
  }

  /** UAPI v3 response sarmalayıcısından data array'ini çıkarır. */
  private extractUapiData<T>(raw: unknown): T[] {
    const r = raw as Record<string, unknown>;
    const result = (r?.result ?? r) as Record<string, unknown>;
    if (result?.status === 0) {
      const errors = Array.isArray(result.errors) ? result.errors.join(', ') : JSON.stringify(result.errors);
      throw new ApiError(502, `cPanel UAPI hatası: ${errors}`, 'WHM_ERROR');
    }
    const data = result?.data ?? r?.data ?? result;
    return Array.isArray(data) ? (data as T[]) : [];
  }

  async healthcheck(): Promise<boolean> {
    try {
      await this.listAccounts();
      return true;
    } catch {
      return false;
    }
  }
}
